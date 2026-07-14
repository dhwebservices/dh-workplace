/**
 * DH Workplace — Cloudflare Worker (Updated with New Email Templates)
 * Handles: Email (Resend), GoCardless API, Stripe Billing, webhooks
 *
 * NOTE: This is an updated version with modern email templates.
 * Review and test before replacing the original cloudflare-worker.js
 */

// Import the new email template system
import { renderEmail } from './email-templates.js'

const GC_API = 'https://api.gocardless.com'
const STRIPE_API = 'https://api.stripe.com/v1'
const RESEND = 'https://api.resend.com/emails'

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

// ── Email handler using new template system ──────────────────────
async function handleEmail(type, data, env) {
  try {
    const { html, text, subject } = renderEmail(type, data)
    return sendEmail(data.to_email, subject, html, env, text)
  } catch (error) {
    console.error(`Email template error for type "${type}":`, error)
    throw error
  }
}

// ── Main Request Handler ──────────────────────────────────────────
export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const path = url.pathname

    // CORS headers for API requests
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders })
    }

    // Health check
    if (path === '/health') {
      return new Response(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Email endpoint
    if (path === '/email' && request.method === 'POST') {
      try {
        const body = await request.json()
        const { type, data } = body

        if (!type || !data) {
          return new Response(JSON.stringify({ error: 'Missing type or data' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }

        await handleEmail(type, data, env)

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    // GoCardless webhook endpoint
    if (path === '/webhook/gocardless' && request.method === 'POST') {
      // TODO: Implement GoCardless webhook handler
      return new Response(JSON.stringify({ received: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Stripe webhook endpoint
    if (path === '/webhook/stripe' && request.method === 'POST') {
      // TODO: Implement Stripe webhook handler
      return new Response(JSON.stringify({ received: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Default 404
    return new Response('Not Found', { status: 404, headers: corsHeaders })
  },
}
