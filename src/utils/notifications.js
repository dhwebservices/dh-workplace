import { sbGetMany, sbUpdate, supabase } from './supabase'

const WORKER_URL = import.meta.env.VITE_WORKER_URL

export function sortNotifications(rows = []) {
  return [...rows].sort((a, b) => {
    if (!!a.is_pinned !== !!b.is_pinned) return a.is_pinned ? -1 : 1
    if (!!a.read !== !!b.read) return a.read ? 1 : -1
    if (!!a.is_urgent !== !!b.is_urgent) return a.is_urgent ? -1 : 1
    return new Date(b.created_at || 0) - new Date(a.created_at || 0)
  })
}

export async function getNotificationsForUser(tenantUserId) {
  if (!tenantUserId) return []
  const rows = await sbGetMany(
    'notifications',
    `tenant_user_id=eq.${tenantUserId}&order=is_pinned.desc,created_at.desc`,
  )
  return sortNotifications(rows || [])
}

export async function markNotificationRead(notificationId, read = true) {
  await sbUpdate('notifications', `id=eq.${notificationId}`, {
    read,
    read_at: read ? new Date().toISOString() : null,
  })
  return true
}

export async function markNotificationsRead(notificationIds = []) {
  const ids = notificationIds.filter(Boolean)
  if (!ids.length) return true
  await Promise.all(ids.map((id) => markNotificationRead(id, true)))
  return true
}

export async function toggleNotificationPin(notificationId, isPinned) {
  await sbUpdate('notifications', `id=eq.${notificationId}`, { is_pinned: isPinned })
  return true
}

export async function sendCustomNotification(payload) {
  if (!WORKER_URL) throw new Error('VITE_WORKER_URL is not configured')
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('You must be signed in to send a notification')

  const response = await fetch(WORKER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      type: 'notification_send_custom',
      data: payload,
    }),
  })

  const json = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(json?.error || json?.message || `Worker request failed with status ${response.status}`)
  return json
}
