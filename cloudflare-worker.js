/**
 * DH Workplace — Cloudflare Worker
 * Handles: Email (Resend), GoCardless API, GoCardless Webhooks
 *
 * Environment variables needed:
 *   RESEND_API_KEY       — from resend.com
 *   FROM_EMAIL           — e.g. noreply@dhworkplace.co.uk
 *   GC_ACCESS_TOKEN      — GoCardless live token
 *   GC_WEBHOOK_SECRET    — GoCardless webhook signing secret
 *   SUPABASE_URL         — your Supabase project URL
 *   SUPABASE_SERVICE_KEY — Supabase service role key (for webhook updates)
 */

const GC_API = 'https://api.gocardless.com'
const RESEND  = 'https://api.resend.com/emails'

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

// ── Email templates ────────────────────────────────────────────
async function handleEmail(type, data, env) {
  switch (type) {

    case 'welcome': {
      const html = emailWrap(`
        <h2 style="color:#1D1D1F;margin:0 0 8px">Welcome to DH Workplace</h2>
        <p style="color:#555;margin:0 0 20px">Hi ${data.name || 'there'}, your workspace is ready.</p>
        <div style="background:#f9f9f9;border-radius:8px;padding:20px;margin-bottom:20px">
          <p style="margin:0;font-size:14px;color:#333"><strong>Workspace:</strong> ${data.company}</p>
          <p style="margin:8px 0 0;font-size:14px;color:#333"><strong>Plan:</strong> ${data.plan || 'Starter'} (14-day free trial)</p>
          <p style="margin:8px 0 0;font-size:13px;color:#777">Founding Member price: <strong>£9/mo</strong> after trial</p>
        </div>
        <a href="${data.url || 'https://app.dhworkplace.co.uk'}" style="display:inline-block;background:#1D1D1F;color:#fff;padding:12px 24px;border-radius:100px;text-decoration:none;font-weight:500;font-size:14px">Go to your workspace</a>
        <p style="color:#86868B;font-size:12px;margin-top:20px">Questions? Reply to this email or contact clients@dhwebsiteservices.co.uk</p>
      `)
      const text = `Welcome to DH Workplace

Hi ${data.name || 'there'},

Your workspace is ready.

Workspace: ${data.company}
Plan: ${data.plan || 'Starter'} (14-day free trial)
Founding Member price: £9/mo after trial

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
      const res = await fetch(`${GC_API}/billing_requests`, {
        method: 'POST', headers,
        body: JSON.stringify({ billing_requests: { mandate_request: { scheme: 'bacs', verify: 'when_available' }, links: { customer: data.customer_id } } })
      })
      const json = await res.json()
      if (!res.ok) throw new Error(JSON.stringify(json))
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
            status: 'active',
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

// ── Main handler ──────────────────────────────────────────────
export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }

    if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

    // GoCardless webhook endpoint
    if (url.pathname === '/webhook/gocardless' && request.method === 'POST') {
      return handleWebhook(request, env)
    }

    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 })

    try {
      const { type, data } = await request.json()
      let result

      if (type.startsWith('gc_')) {
        result = await handleGoCardless(type, data, env)
      } else if (type.startsWith('invite_')) {
        result = await handleInviteAction(type, data, env)
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
