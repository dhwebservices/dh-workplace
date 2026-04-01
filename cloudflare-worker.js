/**
 * DH Workplace — Cloudflare Worker
 * Handles: Email (Resend), GoCardless API, Stripe Billing, webhooks
 *
 * Environment variables needed:
 *   RESEND_API_KEY       — from resend.com
 *   FROM_EMAIL           — e.g. noreply@dhworkplace.co.uk
 *   GC_ACCESS_TOKEN      — GoCardless live token
 *   GC_WEBHOOK_SECRET    — GoCardless webhook signing secret
 *   STRIPE_SECRET_KEY    — Stripe secret key
 *   STRIPE_WEBHOOK_SECRET — Stripe webhook signing secret
 *   STRIPE_PRICE_STARTER — Stripe recurring price id
 *   STRIPE_PRICE_GROWTH  — Stripe recurring price id
 *   STRIPE_PRICE_BUSINESS — Stripe recurring price id
 *   APP_URL              — e.g. https://app.dhworkplace.co.uk
 *   MARKETING_URL        — e.g. https://dhworkplace.co.uk
 *   SUPABASE_URL         — your Supabase project URL
 *   SUPABASE_SERVICE_KEY — Supabase service role key (for webhook updates)
 */

const GC_API = 'https://api.gocardless.com'
const STRIPE_API = 'https://api.stripe.com/v1'
const RESEND  = 'https://api.resend.com/emails'

function toBase64Url(str) {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function fromBase64Url(str) {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64 + '='.repeat((4 - (base64.length % 4 || 4)) % 4)
  return atob(padded)
}

async function signInvitePayload(payload, secret) {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const body = JSON.stringify(payload)
  const signatureBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(body))
  const signature = Array.from(new Uint8Array(signatureBuffer)).map(byte => byte.toString(16).padStart(2, '0')).join('')
  return `${toBase64Url(body)}.${signature}`
}

async function verifyInvitePayload(token, secret) {
  const [encoded, signature] = token.split('.')
  if (!encoded || !signature) throw new Error('Invalid invite token')
  const payload = JSON.parse(fromBase64Url(encoded))
  const expected = await signInvitePayload(payload, secret)
  if (expected !== token) throw new Error('Invalid invite token')
  if (payload.exp && payload.exp < Date.now()) throw new Error('Invitation has expired')
  return payload
}

// ── Styles ────────────────────────────────────────────────────
const emailWrap = (content) => `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:20px;background:#F5F5F7;font-family:'Outfit',Arial,sans-serif">
  <div style="max-width:600px;margin:0 auto">
    <div style="background:#1D1D1F;padding:24px 32px;border-radius:12px 12px 0 0">
      <span style="color:#C9A84C;font-size:20px;font-weight:600">DH Workplace</span>
    </div>
    <div style="background:#fff;padding:32px;border:1px solid #e5e5e5;border-top:none;border-radius:0 0 12px 12px">
      ${content}
    </div>
    <div style="text-align:center;padding:16px;color:#86868B;font-size:12px">
      DH Workplace · Powered by DH Website Services · Pontypridd, Wales
    </div>
  </div>
</body>
</html>`

// ── Send email via Resend ─────────────────────────────────────
async function sendEmail(to, subject, html, env, text = '') {
  if (!env.RESEND_API_KEY) throw new Error('Worker email is not configured: RESEND_API_KEY is missing')
  if (!env.FROM_EMAIL) throw new Error('Worker email is not configured: FROM_EMAIL is missing')

  const res = await fetch(RESEND, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.FROM_EMAIL, to: [to], subject, html, text })
  })
  if (!res.ok) {
    const err = await res.text()
    console.error('Resend error:', err)
    throw new Error(`Resend send failed: ${err}`)
  }
  return true
}

function stripePriceIdForPlan(planKey, env) {
  const map = {
    starter: env.STRIPE_PRICE_STARTER,
    growth: env.STRIPE_PRICE_GROWTH,
    business: env.STRIPE_PRICE_BUSINESS,
  }
  return map[planKey]
}

function planKeyForStripePrice(priceId, env) {
  if (!priceId) return null
  if (priceId === env.STRIPE_PRICE_STARTER) return 'starter'
  if (priceId === env.STRIPE_PRICE_GROWTH) return 'growth'
  if (priceId === env.STRIPE_PRICE_BUSINESS) return 'business'
  return null
}

async function stripeRequest(path, env, { method = 'POST', params = null } = {}) {
  if (!env.STRIPE_SECRET_KEY) throw new Error('Stripe is not configured: STRIPE_SECRET_KEY is missing')
  const headers = {
    Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
  }

  const init = { method, headers }
  if (params) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded'
    init.body = params.toString()
  }

  const res = await fetch(`${STRIPE_API}${path}`, init)
  const json = await res.json()
  if (!res.ok) throw new Error(json?.error?.message || JSON.stringify(json))
  return json
}

async function verifyStripeSignature(body, header, secret) {
  if (!secret) throw new Error('Stripe webhook secret is not configured')
  if (!header) return false

  const parts = Object.fromEntries(
    header.split(',').map((entry) => {
      const [key, value] = entry.split('=')
      return [key, value]
    }),
  )

  const timestamp = parts.t
  const signatures = header
    .split(',')
    .filter((entry) => entry.startsWith('v1='))
    .map((entry) => entry.slice(3))

  if (!timestamp || signatures.length === 0) return false

  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const mac = await crypto.subtle.sign('HMAC', key, encoder.encode(`${timestamp}.${body}`))
  const expected = Array.from(new Uint8Array(mac)).map((b) => b.toString(16).padStart(2, '0')).join('')
  return signatures.includes(expected)
}

// ── Email templates ────────────────────────────────────────────
async function handleEmail(type, data, env) {
  switch (type) {

    case 'welcome': {
      const html = emailWrap(`
        <h2 style="color:#1D1D1F;margin:0 0 8px">Welcome to DH Workplace</h2>
        <p style="color:#555;margin:0 0 20px">Hi ${data.name || 'there'}, your workspace is ready.</p>
        <div style="background:#f9f9f9;border-radius:8px;padding:20px;margin-bottom:20px">
          <p style="margin:0;font-size:14px;color:#333"><strong>Workspace:</strong> ${data.company}</p>
          <p style="margin:8px 0 0;font-size:14px;color:#333"><strong>Plan:</strong> ${data.plan || 'Starter'}</p>
          <p style="margin:8px 0 0;font-size:13px;color:#777">Billing is activated during onboarding at <strong>£9/mo</strong>.</p>
        </div>
        <a href="${data.url || 'https://app.dhworkplace.co.uk'}" style="display:inline-block;background:#1D1D1F;color:#fff;padding:12px 24px;border-radius:100px;text-decoration:none;font-weight:500;font-size:14px">Go to your workspace</a>
        <p style="color:#86868B;font-size:12px;margin-top:20px">Questions? Reply to this email or contact clients@dhwebsiteservices.co.uk</p>
      `)
      const text = `Welcome to DH Workplace

Hi ${data.name || 'there'},

Your workspace is ready.

Workspace: ${data.company}
Plan: ${data.plan || 'Starter'}
Billing is activated during onboarding at £9/mo.

Go to your workspace:
${data.url || 'https://app.dhworkplace.co.uk'}

Questions? Reply to this email or contact clients@dhwebsiteservices.co.uk`
      return sendEmail(data.to_email, 'Welcome to DH Workplace - Your workspace is ready', html, env, text)
    }

    case 'invite': {
      const html = emailWrap(`
        <h2 style="color:#1D1D1F;margin:0 0 8px">You have been invited to DH Workplace</h2>
        <p style="color:#555;margin:0 0 20px">Hi ${data.name || 'there'},</p>
        <p style="color:#555;font-size:14px;margin:0 0 20px">
          <strong>${data.invited_by}</strong> has invited you to join <strong>${data.company}</strong> on DH Workplace as ${data.role === 'admin' ? 'an' : 'a'} <strong>${data.role}</strong>.
        </p>
        <div style="background:#f9f9f9;border-radius:8px;padding:20px;margin-bottom:20px">
          <p style="margin:0;font-size:14px;color:#333"><strong>Company:</strong> ${data.company}</p>
          <p style="margin:8px 0 0;font-size:14px;color:#333"><strong>Role:</strong> ${data.role}</p>
        </div>
        <a href="${data.invite_url}" style="display:inline-block;background:#1D1D1F;color:#fff;padding:12px 24px;border-radius:100px;text-decoration:none;font-weight:500;font-size:14px">Accept invitation</a>
        <p style="color:#86868B;font-size:12px;margin-top:20px">If the button does not work, copy and paste this link into your browser:</p>
        <p style="color:#555;font-size:12px;line-height:1.6;word-break:break-all;margin:8px 0 0">${data.invite_url}</p>
        <p style="color:#86868B;font-size:12px;margin-top:20px">This invitation expires in 7 days. If you weren't expecting this, you can ignore it.</p>
      `)
      const text = `You have been invited to DH Workplace

Hi ${data.name || 'there'},

${data.invited_by} has invited you to join ${data.company} on DH Workplace as ${data.role}.

Accept invitation:
${data.invite_url}

This invitation expires in 7 days. If you weren't expecting this, you can ignore it.`
      return sendEmail(data.to_email, `Invitation to join ${data.company} on DH Workplace`, html, env, text)
    }

    case 'platform_admin_invite': {
      const html = emailWrap(`
        <h2 style="color:#1D1D1F;margin:0 0 8px">You have been invited to manage DH Workplace</h2>
        <p style="color:#555;margin:0 0 20px">You have been granted access to the DH Workplace super admin area.</p>
        <div style="background:#f9f9f9;border-radius:8px;padding:20px;margin-bottom:20px">
          <p style="margin:0;font-size:14px;color:#333"><strong>Access level:</strong> Platform Admin</p>
          <p style="margin:8px 0 0;font-size:14px;color:#333"><strong>Email:</strong> ${data.to_email}</p>
        </div>
        <a href="${data.invite_url}" style="display:inline-block;background:#1D1D1F;color:#fff;padding:12px 24px;border-radius:100px;text-decoration:none;font-weight:500;font-size:14px">Accept platform access</a>
        <p style="color:#86868B;font-size:12px;margin-top:20px">If the button does not work, copy and paste this link into your browser:</p>
        <p style="color:#555;font-size:12px;line-height:1.6;word-break:break-all;margin:8px 0 0">${data.invite_url}</p>
      `)
      const text = `You have been invited to manage DH Workplace

You have been granted access to the DH Workplace super admin area.

Access level: Platform Admin
Email: ${data.to_email}

Accept platform access:
${data.invite_url}`
      return sendEmail(data.to_email, 'Invitation to DH Workplace platform admin access', html, env, text)
    }

    case 'leave_request_submitted': {
      const html = emailWrap(`
        <h2 style="color:#1D1D1F;margin:0 0 8px">Leave Request Submitted</h2>
        <p style="color:#555;margin:0 0 20px">A new leave request is awaiting your approval.</p>
        <div style="background:#f9f9f9;border-radius:8px;padding:20px;margin-bottom:20px">
          <p style="margin:0;font-size:14px"><strong>Staff member:</strong> ${data.staff_name}</p>
          <p style="margin:8px 0 0;font-size:14px"><strong>Type:</strong> ${data.leave_type}</p>
          <p style="margin:8px 0 0;font-size:14px"><strong>Dates:</strong> ${data.start_date} – ${data.end_date}</p>
          <p style="margin:8px 0 0;font-size:14px"><strong>Days:</strong> ${data.days}</p>
          ${data.notes ? `<p style="margin:8px 0 0;font-size:13px;color:#555"><strong>Notes:</strong> ${data.notes}</p>` : ''}
        </div>
        <a href="${data.url || '#'}" style="display:inline-block;background:#1D1D1F;color:#fff;padding:12px 24px;border-radius:100px;text-decoration:none;font-weight:500;font-size:14px">Review request</a>
      `)
      const text = `Leave request submitted

Staff member: ${data.staff_name}
Type: ${data.leave_type}
Dates: ${data.start_date} - ${data.end_date}
Days: ${data.days}
${data.notes ? `Notes: ${data.notes}\n` : ''}
Review request:
${data.url || '#'}`
      return sendEmail(data.to_email, `Leave request - ${data.staff_name}`, html, env, text)
    }

    case 'leave_request_approved':
    case 'leave_request_rejected': {
      const approved = type === 'leave_request_approved'
      const html = emailWrap(`
        <h2 style="color:#1D1D1F;margin:0 0 8px">Leave Request ${approved ? 'Approved' : 'Rejected'}</h2>
        <p style="color:#555;margin:0 0 20px">Hi ${data.staff_name},</p>
        <p style="color:#555;font-size:14px;margin:0 0 20px">
          Your leave request for <strong>${data.start_date} – ${data.end_date}</strong> has been <strong>${approved ? 'approved' : 'rejected'}</strong>.
        </p>
        ${data.notes ? `<div style="background:#f9f9f9;border-radius:8px;padding:16px;margin-bottom:20px"><p style="margin:0;font-size:13px;color:#555"><strong>Note from manager:</strong> ${data.notes}</p></div>` : ''}
        <a href="${data.url || '#'}" style="display:inline-block;background:#1D1D1F;color:#fff;padding:12px 24px;border-radius:100px;text-decoration:none;font-weight:500;font-size:14px">View in portal</a>
      `)
      const text = `Leave request ${approved ? 'approved' : 'rejected'}

Hi ${data.staff_name},

Your leave request for ${data.start_date} - ${data.end_date} has been ${approved ? 'approved' : 'rejected'}.
${data.notes ? `\nNote from manager: ${data.notes}\n` : '\n'}View in portal:
${data.url || '#'}`
      return sendEmail(data.to_email, `Leave Request ${approved ? 'Approved' : 'Rejected'}`, html, env, text)
    }

    case 'invoice_issued': {
      const html = emailWrap(`
        <h2 style="color:#1D1D1F;margin:0 0 8px">Invoice from ${data.company || 'DH Workplace'}</h2>
        <p style="color:#555;margin:0 0 20px">Hi ${data.client_name || 'there'},</p>
        <div style="background:#f9f9f9;border-radius:8px;padding:20px;margin-bottom:20px">
          <table style="width:100%;border-collapse:collapse">
            <tr><td style="color:#777;padding:5px 0;font-size:13px">Invoice #</td><td style="text-align:right;font-family:monospace;font-size:13px">${data.invoice_number || 'N/A'}</td></tr>
            <tr><td style="color:#777;padding:5px 0;font-size:13px">Description</td><td style="text-align:right;font-size:13px">${data.description}</td></tr>
            <tr><td style="color:#777;padding:5px 0;font-size:13px">Due Date</td><td style="text-align:right;font-size:13px">${data.due_date || 'On receipt'}</td></tr>
            <tr style="border-top:1px solid #e5e5e5">
              <td style="padding:10px 0 0;font-weight:700;font-size:16px">Total</td>
              <td style="text-align:right;font-weight:700;font-size:20px;color:#C9A84C">£${Number(data.amount||0).toFixed(2)}</td>
            </tr>
          </table>
        </div>
        <p style="color:#555;font-size:13px">Please contact us if you have any questions.</p>
      `)
      const text = `Invoice from ${data.company || 'DH Workplace'}

Hi ${data.client_name || 'there'},

Invoice number: ${data.invoice_number || 'N/A'}
Description: ${data.description}
Due date: ${data.due_date || 'On receipt'}
Total: £${Number(data.amount || 0).toFixed(2)}

Please contact us if you have any questions.`
      return sendEmail(data.to_email, `Invoice — £${Number(data.amount||0).toFixed(2)} from ${data.company || 'DH Workplace'}`, html, env, text)
    }

    case 'payment_failed': {
      const html = emailWrap(`
        <h2 style="color:#E54D2E;margin:0 0 8px">Payment Failed</h2>
        <p style="color:#555;margin:0 0 20px">Hi ${data.name || 'there'},</p>
        <p style="color:#555;font-size:14px;margin:0 0 20px">
          Your DH Workplace subscription payment of <strong>£${data.amount || '—'}</strong> failed.
          You have a <strong>7-day grace period</strong> to resolve this before your account is suspended.
        </p>
        <a href="${data.billing_url || '#'}" style="display:inline-block;background:#E54D2E;color:#fff;padding:12px 24px;border-radius:100px;text-decoration:none;font-weight:500;font-size:14px">Update billing</a>
        <p style="color:#86868B;font-size:12px;margin-top:20px">If you need help, contact clients@dhwebsiteservices.co.uk</p>
      `)
      const text = `Payment failed

Hi ${data.name || 'there'},

Your DH Workplace subscription payment of £${data.amount || '—'} failed.
You have a 7-day grace period to resolve this before your account is suspended.

Update billing:
${data.billing_url || '#'}

If you need help, contact clients@dhwebsiteservices.co.uk`
      return sendEmail(data.to_email, 'Action required — DH Workplace payment failed', html, env, text)
    }

    case 'trial_ending': {
      const html = emailWrap(`
        <h2 style="color:#1D1D1F;margin:0 0 8px">Your trial ends in ${data.days_left} day${data.days_left !== 1 ? 's' : ''}</h2>
        <p style="color:#555;margin:0 0 20px">Hi ${data.name || 'there'},</p>
        <div style="background:#FEF3C7;border-radius:8px;padding:16px;margin-bottom:20px;border:1px solid #F59E0B">
          <p style="margin:0;font-size:14px;color:#92400E">Set up your Direct Debit now to keep your Founding Member price of <strong>£${data.price || 9}/mo</strong>.</p>
        </div>
        <a href="${data.billing_url || '#'}" style="display:inline-block;background:#C9A84C;color:#fff;padding:12px 24px;border-radius:100px;text-decoration:none;font-weight:500;font-size:14px">Set up billing</a>
      `)
      const text = `Your trial ends in ${data.days_left} day${data.days_left !== 1 ? 's' : ''}

Hi ${data.name || 'there'},

Set up your Direct Debit now to keep your Founding Member price of £${data.price || 9}/mo.

Set up billing:
${data.billing_url || '#'}`
      return sendEmail(data.to_email, `Your DH Workplace trial ends in ${data.days_left} days`, html, env, text)
    }

    default:
      return new Response(JSON.stringify({ error: 'Unknown email type: ' + type }), { status: 400 })
  }
}

// ── GoCardless API ────────────────────────────────────────────
async function handleGoCardless(type, data, env) {
  const headers = {
    Authorization: `Bearer ${env.GC_ACCESS_TOKEN}`,
    'GoCardless-Version': '2015-07-06',
    'Content-Type': 'application/json',
  }

  switch (type) {
    case 'gc_create_customer': {
      const res = await fetch(`${GC_API}/customers`, {
        method: 'POST', headers,
        body: JSON.stringify({ customers: { email: data.email, given_name: data.given_name, family_name: data.family_name, country_code: 'GB' } })
      })
      const json = await res.json()
      if (!res.ok) throw new Error(JSON.stringify(json))
      return json
    }
    case 'gc_create_billing_request': {
      const billingRequestPayload = {
        mandate_request: { scheme: 'bacs', verify: 'when_available' },
        links: { customer: data.customer_id },
      }
      if (data.amount_pence) {
        billingRequestPayload.payment_request = {
          amount: data.amount_pence,
          currency: 'GBP',
          description: data.description || 'DH Workplace first payment',
        }
        billingRequestPayload.fallback_enabled = true
      }
      const res = await fetch(`${GC_API}/billing_requests`, {
        method: 'POST', headers,
        body: JSON.stringify({ billing_requests: billingRequestPayload })
      })
      const json = await res.json()
      if (!res.ok) {
        const isPaymentRequestForbidden = data.amount_pence && res.status === 403
          && JSON.stringify(json).includes('"reason":"forbidden"')
        if (isPaymentRequestForbidden) {
          const fallbackRes = await fetch(`${GC_API}/billing_requests`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              billing_requests: {
                mandate_request: { scheme: 'bacs', verify: 'when_available' },
                links: { customer: data.customer_id },
              },
            }),
          })
          const fallbackJson = await fallbackRes.json()
          if (!fallbackRes.ok) throw new Error(JSON.stringify(fallbackJson))
          return {
            ...fallbackJson,
            dh_workplace_meta: {
              first_payment_mode: 'mandate_only_fallback',
            },
          }
        }
        throw new Error(JSON.stringify(json))
      }
      return json
    }
    case 'gc_create_billing_request_flow': {
      const res = await fetch(`${GC_API}/billing_request_flows`, {
        method: 'POST', headers,
        body: JSON.stringify({ billing_request_flows: { redirect_uri: data.redirect_uri, exit_uri: data.exit_uri, links: { billing_request: data.billing_request_id } } })
      })
      const json = await res.json()
      if (!res.ok) throw new Error(JSON.stringify(json))
      return json
    }
    case 'gc_create_subscription': {
      const res = await fetch(`${GC_API}/subscriptions`, {
        method: 'POST', headers,
        body: JSON.stringify({ subscriptions: {
          amount: data.amount_pence, currency: 'GBP',
          name: data.name || 'DH Workplace Subscription',
          interval_unit: 'monthly', day_of_month: data.day_of_month || 1,
          links: { mandate: data.mandate_id }
        }})
      })
      const json = await res.json()
      if (!res.ok) throw new Error(JSON.stringify(json))
      return json
    }
    case 'gc_update_subscription': {
      const res = await fetch(`${GC_API}/subscriptions/${data.subscription_id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          subscriptions: {
            amount: data.amount_pence,
            name: data.name,
          },
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(JSON.stringify(json))
      return json
    }
    case 'gc_cancel_subscription': {
      const res = await fetch(`${GC_API}/subscriptions/${data.subscription_id}/actions/cancel`, { method: 'POST', headers, body: JSON.stringify({}) })
      const json = await res.json()
      if (!res.ok) throw new Error(JSON.stringify(json))
      return json
    }
    case 'gc_get_mandate': {
      const res = await fetch(`${GC_API}/mandates/${data.mandate_id}`, { headers })
      const json = await res.json()
      if (!res.ok) throw new Error(JSON.stringify(json))
      return json
    }
    default:
      throw new Error('Unknown GoCardless action: ' + type)
  }
}

async function handleStripe(type, data, env) {
  switch (type) {
    case 'stripe_create_checkout_session': {
      const priceId = stripePriceIdForPlan(data.plan_key, env)
      if (!priceId) throw new Error(`No Stripe price configured for plan "${data.plan_key}"`)

      let customerId = data.customer_id || ''
      if (!customerId) {
        const customerParams = new URLSearchParams()
        if (data.customer_email) customerParams.append('email', data.customer_email)
        if (data.customer_name) customerParams.append('name', data.customer_name)
        if (data.tenant_id) customerParams.append('metadata[tenant_id]', data.tenant_id)
        customerParams.append('metadata[source]', 'dh_workplace')
        const customer = await stripeRequest('/customers', env, { params: customerParams })
        customerId = customer.id
      }

      const successUrl = `${env.APP_URL || 'https://app.dhworkplace.co.uk'}${data.success_path || '/billing'}`
      const cancelUrl = `${env.APP_URL || 'https://app.dhworkplace.co.uk'}${data.cancel_path || '/billing'}`
      const params = new URLSearchParams()
      params.append('mode', 'subscription')
      params.append('success_url', `${successUrl}${successUrl.includes('?') ? '&' : '?'}session_id={CHECKOUT_SESSION_ID}`)
      params.append('cancel_url', cancelUrl)
      params.append('client_reference_id', data.tenant_id)
      params.append('customer', customerId)
      params.append('line_items[0][price]', priceId)
      params.append('line_items[0][quantity]', '1')
      params.append('billing_address_collection', 'auto')
      params.append('metadata[tenant_id]', data.tenant_id)
      params.append('metadata[plan_key]', data.plan_key)
      params.append('subscription_data[metadata][tenant_id]', data.tenant_id)
      params.append('subscription_data[metadata][plan_key]', data.plan_key)
      params.append('subscription_data[metadata][source]', 'dh_workplace')

      const session = await stripeRequest('/checkout/sessions', env, { params })
      return { id: session.id, url: session.url, customer_id: customerId }
    }

    case 'stripe_create_billing_portal_session': {
      const params = new URLSearchParams()
      params.append('customer', data.customer_id)
      params.append('return_url', `${env.APP_URL || 'https://app.dhworkplace.co.uk'}${data.return_path || '/billing'}`)
      const session = await stripeRequest('/billing_portal/sessions', env, { params })
      return { id: session.id, url: session.url }
    }

    case 'stripe_update_subscription': {
      const subscription = await stripeRequest(`/subscriptions/${data.subscription_id}`, env, { method: 'GET' })
      const itemId = subscription?.items?.data?.[0]?.id
      if (!itemId) throw new Error('Stripe subscription item was not found')

      const newPriceId = stripePriceIdForPlan(data.plan_key, env)
      if (!newPriceId) throw new Error(`No Stripe price configured for plan "${data.plan_key}"`)

      const params = new URLSearchParams()
      params.append('items[0][id]', itemId)
      params.append('items[0][price]', newPriceId)
      params.append('proration_behavior', 'none')
      params.append('metadata[plan_key]', data.plan_key)

      const updated = await stripeRequest(`/subscriptions/${data.subscription_id}`, env, { params })
      return updated
    }

    case 'stripe_cancel_subscription': {
      const cancelled = await stripeRequest(`/subscriptions/${data.subscription_id}`, env, { method: 'DELETE' })
      return cancelled
    }

    default:
      throw new Error('Unknown Stripe action: ' + type)
  }
}

async function handleInviteAction(type, data, env) {
  const sbUrl = env.SUPABASE_URL
  const sbKey = env.SUPABASE_SERVICE_KEY
  const headers = {
    apikey: sbKey,
    Authorization: `Bearer ${sbKey}`,
    'Content-Type': 'application/json',
    Prefer: 'return=minimal',
  }

  if (type === 'invite_lookup') {
    const inviteRes = await fetch(`${sbUrl}/rest/v1/invitations?token=eq.${data.token}&accepted_at=is.null&limit=1`, { headers })
    const inviteData = await inviteRes.json()
    const invite = inviteData?.[0]
    if (!invite) throw new Error('Invitation not found or already used')
    if (invite.expires_at && new Date(invite.expires_at) < new Date()) throw new Error('Invitation has expired')

    const tenantRes = await fetch(`${sbUrl}/rest/v1/tenants?id=eq.${invite.tenant_id}&limit=1`, { headers })
    const tenantData = await tenantRes.json()
    const tenant = tenantData?.[0]

    return {
      invitation: {
        email: invite.email,
        role: invite.role,
        full_name: invite.full_name,
        tenant_id: invite.tenant_id,
      },
      tenant: tenant ? { name: tenant.name } : null,
    }
  }

  if (type === 'invite_accept') {
    const inviteRes = await fetch(`${sbUrl}/rest/v1/invitations?token=eq.${data.token}&accepted_at=is.null&limit=1`, { headers })
    const inviteData = await inviteRes.json()
    const invite = inviteData?.[0]
    if (!invite) throw new Error('Invitation not found or already used')
    if (invite.expires_at && new Date(invite.expires_at) < new Date()) throw new Error('Invitation has expired')

    const existingRes = await fetch(`${sbUrl}/rest/v1/tenant_users?tenant_id=eq.${invite.tenant_id}&email=eq.${encodeURIComponent(invite.email)}&limit=1`, { headers })
    const existingData = await existingRes.json()
    const existingUser = existingData?.[0]

    if (existingUser) {
      await fetch(`${sbUrl}/rest/v1/tenant_users?id=eq.${existingUser.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          user_id: data.user_id,
          full_name: data.full_name || invite.full_name || existingUser.full_name,
          role: invite.role,
          status: 'active',
          joined_at: new Date().toISOString(),
        }),
      })
    } else {
      await fetch(`${sbUrl}/rest/v1/tenant_users`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          tenant_id: invite.tenant_id,
          user_id: data.user_id,
          email: invite.email,
          full_name: data.full_name || invite.full_name || null,
          role: invite.role,
          status: 'active',
          invited_at: invite.created_at,
          joined_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
        }),
      })
    }

    await fetch(`${sbUrl}/rest/v1/invitations?id=eq.${invite.id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ accepted_at: new Date().toISOString() }),
    })

    return { ok: true, tenant_id: invite.tenant_id }
  }

  throw new Error(`Unknown invite action: ${type}`)
}

async function handlePlatformAdminAction(type, data, env) {
  const sbUrl = env.SUPABASE_URL
  const sbKey = env.SUPABASE_SERVICE_KEY
  const secret = env.SUPABASE_SERVICE_KEY
  const headers = {
    apikey: sbKey,
    Authorization: `Bearer ${sbKey}`,
    'Content-Type': 'application/json',
    Prefer: 'return=minimal',
  }

  if (type === 'platform_admin_invite') {
    const normalizedEmail = data.email.trim().toLowerCase()
    const existingRes = await fetch(`${sbUrl}/rest/v1/platform_admins?email=eq.${encodeURIComponent(normalizedEmail)}&limit=1`, { headers })
    const existingData = await existingRes.json()
    const existing = existingData?.[0]

    if (!existing) {
      await fetch(`${sbUrl}/rest/v1/platform_admins`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ email: normalizedEmail, user_id: null, created_at: new Date().toISOString() }),
      })
    }

    const token = await signInvitePayload({
      type: 'platform_admin',
      email: normalizedEmail,
      exp: Date.now() + 7 * 86400000,
    }, secret)

    await handleEmail('platform_admin_invite', {
      to_email: normalizedEmail,
      invite_url: `${data.invite_url_base}/${token}`,
    }, env)

    return { ok: true }
  }

  if (type === 'platform_admin_lookup') {
    const payload = await verifyInvitePayload(data.token, secret)
    const existingRes = await fetch(`${sbUrl}/rest/v1/platform_admins?email=eq.${encodeURIComponent(payload.email)}&limit=1`, { headers })
    const existingData = await existingRes.json()
    const existing = existingData?.[0]
    if (!existing) throw new Error('Platform admin invitation not found')
    return { email: payload.email, status: existing.user_id ? 'active' : 'pending' }
  }

  if (type === 'platform_admin_accept') {
    const payload = await verifyInvitePayload(data.token, secret)
    const existingRes = await fetch(`${sbUrl}/rest/v1/platform_admins?email=eq.${encodeURIComponent(payload.email)}&limit=1`, { headers })
    const existingData = await existingRes.json()
    const existing = existingData?.[0]
    if (!existing) throw new Error('Platform admin invitation not found')

    let resolvedUserId = data.user_id || null

    if (!resolvedUserId) {
      if (!data.password || data.password.length < 8) {
        throw new Error('A valid password is required to create this account')
      }

      const createRes = await fetch(`${sbUrl}/auth/v1/admin/users`, {
        method: 'POST',
        headers: {
          apikey: sbKey,
          Authorization: `Bearer ${sbKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: payload.email,
          password: data.password,
          email_confirm: true,
        }),
      })
      const createJson = await createRes.json()
      if (!createRes.ok) {
        const message = createJson?.msg || createJson?.error_description || createJson?.error || 'Unable to create platform admin account'
        if (/already|exists|registered/i.test(message)) {
          throw new Error('This email already has an account. Sign in with that password to accept platform access.')
        }
        throw new Error(message)
      }

      resolvedUserId = createJson?.user?.id
    }

    if (!resolvedUserId) throw new Error('Unable to resolve a platform admin account for this invitation')

    await fetch(`${sbUrl}/rest/v1/platform_admins?id=eq.${existing.id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ user_id: resolvedUserId }),
    })

    return { ok: true, user_id: resolvedUserId }
  }

  throw new Error(`Unknown platform admin action: ${type}`)
}

async function handleAuthAdminAction(type, data, env) {
  const authUrl = `${env.SUPABASE_URL}/auth/v1/admin`
  const headers = {
    apikey: env.SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json',
  }

  if (type === 'auth_set_password') {
    const res = await fetch(`${authUrl}/users/${data.user_id}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ password: data.password }),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.msg || json.error_description || json.error || 'Unable to set password')
    return { ok: true }
  }

  throw new Error(`Unknown auth admin action: ${type}`)
}

async function requirePlatformAdmin(request, env) {
  const authHeader = request.headers.get('Authorization') || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!token) throw new Error('Missing platform admin session')

  const userRes = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${token}`,
    },
  })
  const userJson = await userRes.json()
  if (!userRes.ok || !userJson?.id) {
    throw new Error(userJson?.msg || userJson?.error_description || userJson?.error || 'Invalid platform admin session')
  }

  const adminRes = await fetch(`${env.SUPABASE_URL}/rest/v1/platform_admins?user_id=eq.${userJson.id}&select=id&limit=1`, {
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    },
  })
  const adminJson = await adminRes.json()
  if (!adminRes.ok || !Array.isArray(adminJson) || adminJson.length === 0) {
    throw new Error('Platform admin access required')
  }

  return userJson
}

async function requireWorkspaceSettingsManager(request, env, tenantId) {
  const authHeader = request.headers.get('Authorization') || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!token) throw new Error('Missing workspace session')

  const userRes = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${token}`,
    },
  })
  const userJson = await userRes.json()
  if (!userRes.ok || !userJson?.id) {
    throw new Error(userJson?.msg || userJson?.error_description || userJson?.error || 'Invalid workspace session')
  }

  const platformAdminRes = await fetch(`${env.SUPABASE_URL}/rest/v1/platform_admins?user_id=eq.${userJson.id}&select=id&limit=1`, {
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    },
  })
  const platformAdminJson = await platformAdminRes.json()
  if (platformAdminRes.ok && Array.isArray(platformAdminJson) && platformAdminJson.length > 0) {
    return userJson
  }

  const tenantUserRes = await fetch(`${env.SUPABASE_URL}/rest/v1/tenant_users?tenant_id=eq.${tenantId}&user_id=eq.${userJson.id}&select=id,role&limit=1`, {
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    },
  })
  const tenantUserJson = await tenantUserRes.json()
  const tenantUser = tenantUserJson?.[0]
  if (!tenantUser || !['owner', 'superadmin'].includes(tenantUser.role)) {
    throw new Error('Owner access required')
  }
  return { ...userJson, tenant_user_id: tenantUser.id }
}

async function deliverWebhookPayload(endpoint, payload) {
  const res = await fetch(endpoint.target_url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-DH-Event': payload.event,
      'X-DH-Tenant-ID': payload.tenant_id,
      ...(endpoint.secret ? { 'X-DH-Webhook-Secret': endpoint.secret } : {}),
    },
    body: JSON.stringify(payload),
  })
  const responseText = await res.text().catch(() => '')
  return {
    id: endpoint.id,
    label: endpoint.label,
    status: res.status,
    ok: res.ok,
    body: responseText.slice(0, 500),
  }
}

async function handleWebhookAction(type, data, request, env) {
  const sbUrl = env.SUPABASE_URL
  const sbKey = env.SUPABASE_SERVICE_KEY
  const headers = {
    apikey: sbKey,
    Authorization: `Bearer ${sbKey}`,
    'Content-Type': 'application/json',
  }

  await requireWorkspaceSettingsManager(request, env, data.tenant_id)

  if (type === 'webhook_test') {
    const payload = {
      event: data.event || 'tenant.test',
      tenant_id: data.tenant_id,
      occurred_at: new Date().toISOString(),
      test: true,
      data: data.payload || { ok: true },
    }
    return {
      ok: true,
      result: await deliverWebhookPayload({
        id: 'test',
        label: data.label || 'Test endpoint',
        target_url: data.target_url,
        secret: data.secret || '',
      }, payload),
    }
  }

  if (type === 'webhook_deliver') {
    const endpointsRes = await fetch(`${sbUrl}/rest/v1/webhook_endpoints?tenant_id=eq.${data.tenant_id}&enabled=is.true&select=id,label,target_url,secret,events`, {
      headers,
    })
    const endpoints = await endpointsRes.json()
    if (!endpointsRes.ok) throw new Error('Unable to load webhook endpoints')

    const matching = (endpoints || []).filter(endpoint => {
      const subscribedEvents = endpoint.events || []
      return subscribedEvents.length === 0 || subscribedEvents.includes(data.event)
    })

    const payload = {
      event: data.event,
      tenant_id: data.tenant_id,
      occurred_at: new Date().toISOString(),
      data: data.payload || {},
    }

    const results = await Promise.all(matching.map(endpoint => deliverWebhookPayload(endpoint, payload)))

    if (matching.length > 0) {
      await fetch(`${sbUrl}/rest/v1/webhook_endpoints?tenant_id=eq.${data.tenant_id}&enabled=is.true`, {
        method: 'PATCH',
        headers: { ...headers, Prefer: 'return=minimal' },
        body: JSON.stringify({ last_tested_at: new Date().toISOString(), updated_at: new Date().toISOString() }),
      }).catch(() => {})
    }

    return {
      ok: true,
      delivered: results.filter(result => result.ok).length,
      attempted: matching.length,
      results,
    }
  }

  throw new Error(`Unknown webhook action: ${type}`)
}

async function handleDemoAction(type, data, env) {
  const sbUrl = env.SUPABASE_URL
  const sbKey = env.SUPABASE_SERVICE_KEY
  const headers = {
    apikey: sbKey,
    Authorization: `Bearer ${sbKey}`,
    'Content-Type': 'application/json',
  }

  if (type === 'demo_snapshot') {
    if (!data?.slug || !data?.token) throw new Error('Demo link is incomplete')

    const tenantRes = await fetch(
      `${sbUrl}/rest/v1/tenants?slug=eq.${encodeURIComponent(data.slug)}&is_demo=is.true&demo_access_key=eq.${encodeURIComponent(data.token)}&select=id,name,slug,plan,seat_limit,primary_colour,demo_template,is_demo&limit=1`,
      { headers }
    )
    const tenantJson = await tenantRes.json()
    const tenant = tenantJson?.[0]
    if (!tenantRes.ok || !tenant) throw new Error('Demo workspace not found or link has expired')

    const tenantId = tenant.id
    const [teamRes, clientsRes, tasksRes, leaveRes, documentsRes, timesheetsRes, invoicesRes] = await Promise.all([
      fetch(`${sbUrl}/rest/v1/tenant_users?tenant_id=eq.${tenantId}&select=id,full_name,email,job_title,department,role,status&order=created_at.asc`, { headers }),
      fetch(`${sbUrl}/rest/v1/clients?tenant_id=eq.${tenantId}&select=id,name,status,value&order=created_at.asc`, { headers }),
      fetch(`${sbUrl}/rest/v1/tasks?tenant_id=eq.${tenantId}&select=id,title,status,priority,due_date,assigned_to,client_id&order=created_at.desc`, { headers }),
      fetch(`${sbUrl}/rest/v1/leave_requests?tenant_id=eq.${tenantId}&select=id,type,start_date,end_date,days,status,tenant_user_id,reviewed_by&order=created_at.desc`, { headers }),
      fetch(`${sbUrl}/rest/v1/documents?tenant_id=eq.${tenantId}&select=id,name,category,visible_to&order=created_at.desc`, { headers }),
      fetch(`${sbUrl}/rest/v1/timesheets?tenant_id=eq.${tenantId}&select=id,date,hours,description,status,tenant_user_id,client_id&order=date.desc`, { headers }),
      fetch(`${sbUrl}/rest/v1/invoices?tenant_id=eq.${tenantId}&select=id,client_id,invoice_number,description,amount,status,due_date,paid_at&order=created_at.desc`, { headers }),
    ])

    const [team, clients, tasks, leaveRequests, documents, timesheets, invoices] = await Promise.all([
      teamRes.json(),
      clientsRes.json(),
      tasksRes.json(),
      leaveRes.json(),
      documentsRes.json(),
      timesheetsRes.json(),
      invoicesRes.json(),
    ])

    return {
      ok: true,
      tenant,
      summary: {
        team_members: (team || []).filter((member) => member.status !== 'suspended').length,
        active_clients: (clients || []).filter((client) => client.status === 'active').length,
        open_tasks: (tasks || []).filter((task) => !['done', 'completed'].includes(task.status)).length,
        pending_approvals: (leaveRequests || []).filter((item) => item.status === 'pending').length
          + (timesheets || []).filter((item) => item.status === 'pending').length,
      },
      team: team || [],
      clients: clients || [],
      tasks: tasks || [],
      leave_requests: leaveRequests || [],
      documents: documents || [],
      timesheets: timesheets || [],
      invoices: invoices || [],
    }
  }

  throw new Error(`Unknown demo action: ${type}`)
}

async function sendAutomationReminderEmail(config, env) {
  const html = emailWrap(`
    <h2 style="color:#1D1D1F;margin:0 0 8px">${config.title}</h2>
    <p style="color:#555;margin:0 0 20px">${config.intro}</p>
    <div style="background:#f9f9f9;border-radius:8px;padding:20px;margin-bottom:20px">
      ${config.lines.map((line) => `<p style="margin:0 0 8px;font-size:14px;color:#333">${line}</p>`).join('')}
    </div>
    ${config.action_url ? `<a href="${config.action_url}" style="display:inline-block;background:#1D1D1F;color:#fff;padding:12px 24px;border-radius:100px;text-decoration:none;font-weight:500;font-size:14px">${config.action_label || 'Open workspace'}</a>` : ''}
  `)
  const text = `${config.title}

${config.intro}

${config.lines.join('\n')}

${config.action_url ? `${config.action_label || 'Open workspace'}:\n${config.action_url}` : ''}`.trim()
  return sendEmail(config.to_email, config.subject, html, env, text)
}

function nextAutomationRun(cadence) {
  const date = new Date()
  date.setDate(date.getDate() + (cadence === 'weekly' ? 7 : 1))
  return date.toISOString()
}

async function handleAutomationAction(type, data, request, env) {
  const sbUrl = env.SUPABASE_URL
  const sbKey = env.SUPABASE_SERVICE_KEY
  const headers = {
    apikey: sbKey,
    Authorization: `Bearer ${sbKey}`,
    'Content-Type': 'application/json',
  }

  await requireWorkspaceSettingsManager(request, env, data.tenant_id)

  if (type !== 'automation_run') throw new Error(`Unknown automation action: ${type}`)
  if (!data?.rule_type) throw new Error('Missing automation rule')

  let runId = null
  if (data.tenant_id) {
    const runRes = await fetch(`${sbUrl}/rest/v1/automation_runs`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'return=representation' },
      body: JSON.stringify({
        tenant_id: data.tenant_id,
        rule_type: data.rule_type,
        status: 'running',
        triggered_by: data.triggered_by || null,
        started_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      }),
    })
    if (runRes.ok) {
      const rows = await runRes.json()
      runId = rows?.[0]?.id || null
    }
  }

  try {
    const [tenantRes, ruleRes, usersRes, inviteRes, leaveRes, timesheetRes] = await Promise.all([
      fetch(`${sbUrl}/rest/v1/tenants?id=eq.${data.tenant_id}&select=id,name,owner_email,status,trial_ends_at,gc_mandate_id,gc_subscription_id,stripe_customer_id,stripe_subscription_id&limit=1`, { headers }),
      fetch(`${sbUrl}/rest/v1/automation_rules?tenant_id=eq.${data.tenant_id}&rule_type=eq.${data.rule_type}&select=id,enabled,cadence,channels,threshold_days&limit=1`, { headers }),
      fetch(`${sbUrl}/rest/v1/tenant_users?tenant_id=eq.${data.tenant_id}&status=eq.active&select=id,full_name,email,role,user_id`, { headers }),
      fetch(`${sbUrl}/rest/v1/invitations?tenant_id=eq.${data.tenant_id}&accepted_at=is.null&select=id,email,full_name,created_at`, { headers }),
      fetch(`${sbUrl}/rest/v1/leave_requests?tenant_id=eq.${data.tenant_id}&status=eq.pending&select=id,tenant_user_id,start_date,end_date`, { headers }),
      fetch(`${sbUrl}/rest/v1/timesheets?tenant_id=eq.${data.tenant_id}&status=eq.pending&select=id,tenant_user_id,date,hours`, { headers }),
    ])

    const tenant = (await tenantRes.json())?.[0]
    const rule = (await ruleRes.json())?.[0]
    const users = await usersRes.json()
    const invites = await inviteRes.json()
    const leaveRequests = await leaveRes.json()
    const timesheets = await timesheetRes.json()

    if (!tenant) throw new Error('Workspace not found')
    if (!rule) throw new Error('Automation rule not found')
    if (!rule.enabled) throw new Error('Automation is disabled')

    const channels = rule.channels || []
    const recipients = (users || []).filter((user) => ['owner', 'admin', 'manager', 'superadmin'].includes(user.role))
    const reviewers = recipients.filter((user) => ['manager', 'admin', 'owner', 'superadmin'].includes(user.role))
    const owner = (users || []).find((user) => user.role === 'owner') || recipients[0] || null
    const workspaceUrl = 'https://app.dhworkplace.co.uk'
    let notificationsSent = 0
    let emailsSent = 0

    async function createNotification(recipientIds, title, message, link, level = 'info') {
      await Promise.all(recipientIds.map((tenantUserId) => fetch(`${sbUrl}/rest/v1/notifications`, {
        method: 'POST',
        headers: { ...headers, Prefer: 'return=minimal' },
        body: JSON.stringify({
          tenant_id: tenant.id,
          tenant_user_id: tenantUserId,
          title,
          message,
          link,
          type: level,
          created_at: new Date().toISOString(),
        }),
      })))
      notificationsSent += recipientIds.length
    }

    async function sendRecipientEmails(list, builder) {
      for (const recipient of list) {
        if (!recipient?.email) continue
        await sendAutomationReminderEmail(builder(recipient), env)
        emailsSent += 1
      }
    }

    if (data.rule_type === 'invite_follow_up') {
      if ((invites || []).length > 0) {
        const message = `${invites.length} invited team member${invites.length === 1 ? '' : 's'} still have not joined ${tenant.name}.`
        if (channels.includes('in_app')) await createNotification(recipients.map((user) => user.id), 'Pending team invites', message, '/team', 'warning')
        if (channels.includes('email')) {
          await sendRecipientEmails(recipients, (recipient) => ({
            to_email: recipient.email,
            subject: `Pending invites in ${tenant.name}`,
            title: 'Pending team invites',
            intro: `${tenant.name} still has invited team members who have not accepted access.`,
            lines: invites.slice(0, 5).map((invite) => `${invite.full_name || invite.email} · invited ${new Date(invite.created_at).toLocaleDateString('en-GB')}`),
            action_url: `${workspaceUrl}/team`,
            action_label: 'Open team',
          }))
        }
      }
    } else if (data.rule_type === 'leave_approval') {
      if ((leaveRequests || []).length > 0) {
        const message = `${leaveRequests.length} leave request${leaveRequests.length === 1 ? '' : 's'} are waiting for approval.`
        if (channels.includes('in_app')) await createNotification(reviewers.map((user) => user.id), 'Pending leave approvals', message, '/leave', 'warning')
        if (channels.includes('email')) {
          await sendRecipientEmails(reviewers, (recipient) => ({
            to_email: recipient.email,
            subject: `Leave approvals waiting in ${tenant.name}`,
            title: 'Pending leave approvals',
            intro: `${tenant.name} has leave requests waiting for review.`,
            lines: leaveRequests.slice(0, 5).map((item) => `Request dates: ${item.start_date} to ${item.end_date}`),
            action_url: `${workspaceUrl}/leave`,
            action_label: 'Review leave',
          }))
        }
      }
    } else if (data.rule_type === 'timesheet_approval') {
      if ((timesheets || []).length > 0) {
        const message = `${timesheets.length} timesheet entr${timesheets.length === 1 ? 'y is' : 'ies are'} pending review.`
        if (channels.includes('in_app')) await createNotification(reviewers.map((user) => user.id), 'Pending timesheet approvals', message, '/timesheets', 'warning')
        if (channels.includes('email')) {
          await sendRecipientEmails(reviewers, (recipient) => ({
            to_email: recipient.email,
            subject: `Timesheet approvals waiting in ${tenant.name}`,
            title: 'Pending timesheet approvals',
            intro: `${tenant.name} has submitted time entries waiting for approval.`,
            lines: timesheets.slice(0, 5).map((entry) => `${entry.date} · ${entry.hours} hour${Number(entry.hours) === 1 ? '' : 's'}`),
            action_url: `${workspaceUrl}/timesheets`,
            action_label: 'Review timesheets',
          }))
        }
      }
    } else if (data.rule_type === 'trial_ending') {
      const threshold = Number(rule.threshold_days || 3)
      const daysLeft = tenant.trial_ends_at ? Math.max(0, Math.ceil((new Date(tenant.trial_ends_at) - new Date()) / 86400000)) : null
      if (daysLeft !== null && tenant.status === 'trialing' && daysLeft <= threshold && owner?.email) {
        if (channels.includes('in_app') && owner?.id) {
          await createNotification([owner.id], 'Trial ending soon', `${tenant.name} has ${daysLeft} day${daysLeft === 1 ? '' : 's'} left on trial.`, '/billing', 'warning')
        }
        if (channels.includes('email')) {
          await sendAutomationReminderEmail({
            to_email: owner.email,
            subject: `${tenant.name} trial ending in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`,
            title: 'Trial ending soon',
            intro: `${tenant.name} is approaching the end of its trial period.`,
            lines: [`Days remaining: ${daysLeft}`, `Current status: ${tenant.status}`],
            action_url: `${workspaceUrl}/billing`,
            action_label: 'Open billing',
          }, env)
          emailsSent += 1
        }
      }
    } else if (data.rule_type === 'billing_attention') {
      const threshold = Number(rule.threshold_days || 7)
      const hasActiveBilling = Boolean(tenant.stripe_subscription_id || tenant.gc_subscription_id)
      const needsAttention = tenant.status === 'overdue' || (!hasActiveBilling && tenant.status !== 'trialing' && tenant.status !== 'cancelled')
      if (needsAttention && owner?.email) {
        if (channels.includes('in_app') && owner?.id) {
          await createNotification([owner.id], 'Billing needs attention', `${tenant.name} billing needs review within the next ${threshold} day${threshold === 1 ? '' : 's'}.`, '/billing', 'error')
        }
        if (channels.includes('email')) {
          await sendAutomationReminderEmail({
            to_email: owner.email,
            subject: `${tenant.name} billing needs attention`,
            title: 'Billing needs attention',
            intro: `${tenant.name} needs billing attention to avoid access or collection issues.`,
            lines: [
              `Workspace status: ${tenant.status}`,
              `Subscription active: ${hasActiveBilling ? 'Yes' : 'No'}`,
              `Grace threshold: ${threshold} day${threshold === 1 ? '' : 's'}`,
            ],
            action_url: `${workspaceUrl}/billing`,
            action_label: 'Review billing',
          }, env)
          emailsSent += 1
        }
      }
    } else {
      throw new Error('Unsupported automation rule')
    }

    await fetch(`${sbUrl}/rest/v1/automation_rules?id=eq.${rule.id}`, {
      method: 'PATCH',
      headers: { ...headers, Prefer: 'return=minimal' },
      body: JSON.stringify({
        last_run_at: new Date().toISOString(),
        next_run_at: nextAutomationRun(rule.cadence),
        updated_at: new Date().toISOString(),
      }),
    })

    if (runId) {
      await fetch(`${sbUrl}/rest/v1/automation_runs?id=eq.${runId}`, {
        method: 'PATCH',
        headers: { ...headers, Prefer: 'return=minimal' },
        body: JSON.stringify({
          status: 'success',
          notifications_sent: notificationsSent,
          emails_sent: emailsSent,
          completed_at: new Date().toISOString(),
        }),
      })
    }

    return { ok: true, notifications_sent: notificationsSent, emails_sent: emailsSent, run_id: runId }
  } catch (error) {
    if (runId) {
      await fetch(`${sbUrl}/rest/v1/automation_runs?id=eq.${runId}`, {
        method: 'PATCH',
        headers: { ...headers, Prefer: 'return=minimal' },
        body: JSON.stringify({
          status: 'failed',
          error_message: error.message || 'Automation failed',
          completed_at: new Date().toISOString(),
        }),
      })
    }
    throw error
  }
}

// ── GoCardless Webhook Handler ────────────────────────────────
async function handleWebhook(request, env) {
  const body = await request.text()

  // Verify webhook signature
  const signature = request.headers.get('Webhook-Signature')
  if (env.GC_WEBHOOK_SECRET && signature) {
    const encoder = new TextEncoder()
    const key = await crypto.subtle.importKey('raw', encoder.encode(env.GC_WEBHOOK_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    const mac = await crypto.subtle.sign('HMAC', key, encoder.encode(body))
    const expected = Array.from(new Uint8Array(mac)).map(b => b.toString(16).padStart(2,'0')).join('')
    if (signature !== expected) return new Response('Invalid signature', { status: 401 })
  }

  const { events } = JSON.parse(body)
  const sbUrl = env.SUPABASE_URL
  const sbKey = env.SUPABASE_SERVICE_KEY
  const sbHeaders = { 'apikey': sbKey, 'Authorization': `Bearer ${sbKey}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' }

  for (const event of events || []) {
    const { resource_type, action, links, metadata } = event

    // Find tenant by GC customer/mandate ID
    const getTenant = async (gcId, field) => {
      const res = await fetch(`${sbUrl}/rest/v1/tenants?${field}=eq.${gcId}&limit=1`, { headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` } })
      const data = await res.json()
      return data?.[0] || null
    }

    const updateTenant = async (tenantId, payload) => {
      await fetch(`${sbUrl}/rest/v1/tenants?id=eq.${tenantId}`, { method: 'PATCH', headers: sbHeaders, body: JSON.stringify(payload) })
    }

    switch (`${resource_type}.${action}`) {

      case 'mandates.created': {
        const tenant = await getTenant(links.customer, 'gc_customer_id')
        if (tenant) {
          await updateTenant(tenant.id, {
            gc_mandate_id: links.mandate,
            updated_at: new Date().toISOString(),
          })
        }
        break
      }

      case 'mandates.cancelled':
      case 'mandates.expired': {
        const tenant = await getTenant(links.mandate, 'gc_mandate_id')
        if (tenant) {
          await updateTenant(tenant.id, { gc_mandate_id: null, gc_subscription_id: null, status: 'suspended', updated_at: new Date().toISOString() })
          // Email owner
          await handleEmail('payment_failed', { to_email: tenant.owner_email, name: tenant.name, amount: '—' }, env)
        }
        break
      }

      case 'payments.confirmed':
      case 'payments.paid_out': {
        const tenant = await getTenant(links.mandate, 'gc_mandate_id')
        if (tenant) {
          const nextPayment = new Date()
          nextPayment.setMonth(nextPayment.getMonth() + 1)
          await updateTenant(tenant.id, {
            status: 'active',
            last_payment_at: new Date().toISOString(),
            next_payment_at: nextPayment.toISOString(),
            grace_period_ends_at: null,
            updated_at: new Date().toISOString(),
          })
        }
        break
      }

      case 'payments.failed': {
        const tenant = await getTenant(links.mandate, 'gc_mandate_id')
        if (tenant) {
          const graceEnd = new Date()
          graceEnd.setDate(graceEnd.getDate() + 7)
          await updateTenant(tenant.id, {
            status: 'overdue',
            grace_period_ends_at: graceEnd.toISOString(),
            updated_at: new Date().toISOString(),
          })
          // Email owner about failed payment
          const PLAN_PRICES = { starter: 9, growth: 24, business: 59 }
          await handleEmail('payment_failed', {
            to_email: tenant.owner_email,
            name: tenant.name,
            amount: PLAN_PRICES[tenant.plan] || '—',
            billing_url: 'https://app.dhworkplace.co.uk/billing',
          }, env)
        }
        break
      }

      case 'subscriptions.created': {
        const tenant = await getTenant(links.mandate, 'gc_mandate_id')
        if (tenant) {
          await updateTenant(tenant.id, {
            gc_subscription_id: links.subscription,
            subscription_started_at: new Date().toISOString(),
            status: 'active',
            updated_at: new Date().toISOString(),
          })
        }
        break
      }

      case 'subscriptions.cancelled': {
        const tenant = await getTenant(links.mandate, 'gc_mandate_id')
        if (tenant) {
          await updateTenant(tenant.id, { gc_subscription_id: null, status: 'cancelled', updated_at: new Date().toISOString() })
        }
        break
      }
    }
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } })
}

async function handleStripeWebhook(request, env) {
  const body = await request.text()
  const signature = request.headers.get('Stripe-Signature')
  const valid = await verifyStripeSignature(body, signature, env.STRIPE_WEBHOOK_SECRET)
  if (!valid) return new Response('Invalid signature', { status: 401 })

  const event = JSON.parse(body)
  const sbUrl = env.SUPABASE_URL
  const sbKey = env.SUPABASE_SERVICE_KEY
  const sbHeaders = { apikey: sbKey, Authorization: `Bearer ${sbKey}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' }

  const getTenantById = async (tenantId) => {
    if (!tenantId) return null
    const res = await fetch(`${sbUrl}/rest/v1/tenants?id=eq.${tenantId}&limit=1`, { headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` } })
    const data = await res.json()
    return data?.[0] || null
  }

  const getTenantByStripe = async (customerId, subscriptionId) => {
    const queries = []
    if (subscriptionId) queries.push(`stripe_subscription_id=eq.${subscriptionId}`)
    if (customerId) queries.push(`stripe_customer_id=eq.${customerId}`)
    for (const query of queries) {
      const res = await fetch(`${sbUrl}/rest/v1/tenants?${query}&limit=1`, { headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` } })
      const data = await res.json()
      if (data?.[0]) return data[0]
    }
    return null
  }

  const updateTenant = async (tenantId, payload) => {
    await fetch(`${sbUrl}/rest/v1/tenants?id=eq.${tenantId}`, {
      method: 'PATCH',
      headers: sbHeaders,
      body: JSON.stringify({ ...payload, updated_at: new Date().toISOString() }),
    })
  }

  const statusFromStripeSubscription = (status) => {
    if (status === 'active' || status === 'trialing') return 'active'
    if (status === 'past_due' || status === 'unpaid' || status === 'incomplete') return 'overdue'
    if (status === 'canceled' || status === 'incomplete_expired') return 'cancelled'
    return 'pending_activation'
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object
      const tenantId = session.metadata?.tenant_id || session.client_reference_id
      const tenant = await getTenantById(tenantId)
      if (tenant) {
        const planKey = session.metadata?.plan_key || tenant.plan
        await updateTenant(tenant.id, {
          stripe_customer_id: session.customer || tenant.stripe_customer_id,
          stripe_subscription_id: session.subscription || tenant.stripe_subscription_id,
          stripe_price_id: stripePriceIdForPlan(planKey, env),
          plan: planKey,
          seat_limit: ({ starter: 5, growth: 15, business: 40 }[planKey] || tenant.seat_limit || 5),
        })
      }
      break
    }

    case 'invoice.paid': {
      const invoice = event.data.object
      const tenant = await getTenantByStripe(invoice.customer, invoice.subscription)
      if (tenant) {
        const paidAt = invoice.status_transitions?.paid_at ? new Date(invoice.status_transitions.paid_at * 1000).toISOString() : new Date().toISOString()
        const nextPaymentAt = invoice.lines?.data?.[0]?.period?.end ? new Date(invoice.lines.data[0].period.end * 1000).toISOString() : null
        const planKey = planKeyForStripePrice(invoice.lines?.data?.[0]?.price?.id, env) || tenant.plan
        await updateTenant(tenant.id, {
          stripe_customer_id: invoice.customer || tenant.stripe_customer_id,
          stripe_subscription_id: invoice.subscription || tenant.stripe_subscription_id,
          stripe_price_id: invoice.lines?.data?.[0]?.price?.id || tenant.stripe_price_id,
          plan: planKey,
          seat_limit: ({ starter: 5, growth: 15, business: 40 }[planKey] || tenant.seat_limit || 5),
          status: 'active',
          subscription_started_at: tenant.subscription_started_at || paidAt,
          last_payment_at: paidAt,
          next_payment_at: nextPaymentAt,
          grace_period_ends_at: null,
        })
      }
      break
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object
      const tenant = await getTenantByStripe(invoice.customer, invoice.subscription)
      if (tenant) {
        const graceEnd = new Date()
        graceEnd.setDate(graceEnd.getDate() + 7)
        await updateTenant(tenant.id, {
          status: 'overdue',
          stripe_customer_id: invoice.customer || tenant.stripe_customer_id,
          stripe_subscription_id: invoice.subscription || tenant.stripe_subscription_id,
          grace_period_ends_at: graceEnd.toISOString(),
        })
        await handleEmail('payment_failed', {
          to_email: tenant.owner_email,
          name: tenant.name,
          amount: ({ starter: 9, growth: 24, business: 59 }[tenant.plan] || '—'),
          billing_url: `${env.APP_URL || 'https://app.dhworkplace.co.uk'}/billing`,
        }, env)
      }
      break
    }

    case 'customer.subscription.updated': {
      const subscription = event.data.object
      const tenant = await getTenantByStripe(subscription.customer, subscription.id)
      if (tenant) {
        const planKey = planKeyForStripePrice(subscription.items?.data?.[0]?.price?.id, env) || tenant.plan
        await updateTenant(tenant.id, {
          stripe_customer_id: subscription.customer || tenant.stripe_customer_id,
          stripe_subscription_id: subscription.id,
          stripe_price_id: subscription.items?.data?.[0]?.price?.id || tenant.stripe_price_id,
          plan: planKey,
          seat_limit: ({ starter: 5, growth: 15, business: 40 }[planKey] || tenant.seat_limit || 5),
          status: statusFromStripeSubscription(subscription.status),
          next_payment_at: subscription.current_period_end ? new Date(subscription.current_period_end * 1000).toISOString() : tenant.next_payment_at,
          grace_period_ends_at: subscription.status === 'past_due' || subscription.status === 'unpaid' ? tenant.grace_period_ends_at || new Date(Date.now() + 7 * 86400000).toISOString() : null,
        })
      }
      break
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object
      const tenant = await getTenantByStripe(subscription.customer, subscription.id)
      if (tenant) {
        await updateTenant(tenant.id, {
          stripe_subscription_id: null,
          status: 'cancelled',
        })
      }
      break
    }
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } })
}

// ── Main handler ──────────────────────────────────────────────
export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    }

    if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

    // GoCardless webhook endpoint
    if (url.pathname === '/webhook/gocardless' && request.method === 'POST') {
      return handleWebhook(request, env)
    }
    if (url.pathname === '/webhook/stripe' && request.method === 'POST') {
      return handleStripeWebhook(request, env)
    }

    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 })

    try {
      const { type, data } = await request.json()
      let result

      if (type.startsWith('gc_')) {
        result = await handleGoCardless(type, data, env)
      } else if (type.startsWith('stripe_')) {
        result = await handleStripe(type, data, env)
      } else if (type.startsWith('invite_')) {
        result = await handleInviteAction(type, data, env)
      } else if (type.startsWith('platform_admin_')) {
        result = await handlePlatformAdminAction(type, data, env)
      } else if (type.startsWith('auth_')) {
        await requirePlatformAdmin(request, env)
        result = await handleAuthAdminAction(type, data, env)
      } else if (type.startsWith('automation_')) {
        result = await handleAutomationAction(type, data, request, env)
      } else if (type.startsWith('demo_')) {
        result = await handleDemoAction(type, data, env)
      } else if (type.startsWith('webhook_')) {
        result = await handleWebhookAction(type, data, request, env)
      } else {
        const emailRes = await handleEmail(type, data, env)
        if (emailRes instanceof Response) return new Response(emailRes.body, { status: emailRes.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
        result = { ok: true }
      }

      return new Response(JSON.stringify(result), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    } catch (err) {
      console.error(err)
      return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
  }
}
