import { supabase } from './supabase'

const WORKER_URL = import.meta.env.VITE_WORKER_URL

export async function sendWebhookEvent({ tenantId, event, payload }) {
  if (!WORKER_URL || !tenantId || !event) return false

  try {
    const { data } = await supabase.auth.getSession()
    const token = data?.session?.access_token
    if (!token) return false

    const res = await fetch(WORKER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        type: 'webhook_deliver',
        data: {
          tenant_id: tenantId,
          event,
          payload,
        },
      }),
    })

    return res.ok
  } catch {
    return false
  }
}
