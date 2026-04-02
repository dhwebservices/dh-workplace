import { sbDelete, sbGetMany, sbInsert, sbUpdate } from './supabase'

function isWithinWindow(banner) {
  const now = Date.now()
  const starts = banner.starts_at ? new Date(banner.starts_at).getTime() : null
  const ends = banner.ends_at ? new Date(banner.ends_at).getTime() : null
  if (starts && now < starts) return false
  if (ends && now > ends) return false
  return true
}

export function appliesBanner(banner, { pathname = '/', role = 'staff', employeeId = null } = {}) {
  if (!banner?.enabled) return false
  if (!isWithinWindow(banner)) return false
  if (banner.target_path && banner.target_path !== 'all' && pathname !== banner.target_path) return false
  if (banner.target_role && banner.target_role !== 'all' && banner.target_role !== role) return false
  if (banner.target_employee_id && banner.target_employee_id !== employeeId) return false
  return true
}

export async function listBanners(tenantId) {
  if (!tenantId) return []
  return await sbGetMany('banners', `tenant_id=eq.${tenantId}&order=created_at.desc`)
}

export async function saveBanner({ bannerId = null, tenantId, tenantUserId = null, payload }) {
  const body = {
    tenant_id: tenantId,
    title: payload.title,
    message: payload.message || null,
    tone: payload.tone || 'info',
    target_path: payload.target_path || 'all',
    target_role: payload.target_role || 'all',
    target_employee_id: payload.target_employee_id || null,
    enabled: payload.enabled !== false,
    starts_at: payload.starts_at || null,
    ends_at: payload.ends_at || null,
    updated_at: new Date().toISOString(),
  }

  if (bannerId) {
    await sbUpdate('banners', `id=eq.${bannerId}`, body)
    return true
  }

  await sbInsert('banners', {
    ...body,
    created_by: tenantUserId,
    created_at: new Date().toISOString(),
  })
  return true
}

export async function deleteBanner(bannerId) {
  await sbDelete('banners', `id=eq.${bannerId}`)
  return true
}
