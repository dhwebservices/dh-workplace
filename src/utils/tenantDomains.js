import { sbGet } from './supabase'

export const ROOT_APP_DOMAIN = 'dhworkplace.co.uk'

const RESERVED_SUBDOMAINS = new Set([
  'app',
  'www',
  'admin',
  'api',
  'auth',
  'billing',
  'support',
  'help',
  'demo',
  'status',
  'mail',
  'smtp',
  'blog',
  'portal',
  'docs',
])

export function normalizeSubdomain(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)
}

export function normalizeDomain(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
}

export function isReservedSubdomain(value = '') {
  return RESERVED_SUBDOMAINS.has(normalizeSubdomain(value))
}

export function isValidSubdomain(value = '') {
  const normalized = normalizeSubdomain(value)
  if (!normalized) return false
  if (normalized.length < 3) return false
  if (!/^[a-z0-9-]+$/.test(normalized)) return false
  if (normalized.startsWith('-') || normalized.endsWith('-')) return false
  if (isReservedSubdomain(normalized)) return false
  return true
}

export function isValidCustomDomain(value = '') {
  const normalized = normalizeDomain(value)
  if (!normalized) return false
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(normalized)
}

export function getTenantSubdomainUrl(subdomain) {
  const normalized = normalizeSubdomain(subdomain)
  if (!normalized) return ''
  return `https://${normalized}.${ROOT_APP_DOMAIN}`
}

export function deriveSubdomainSuggestion(tenant = {}) {
  return normalizeSubdomain(tenant.custom_subdomain || tenant.slug || tenant.name || '')
}

export function getHostnameParts(hostname) {
  const host = normalizeDomain(hostname)
  if (!host) return { host: '', subdomain: '', isRootDomain: false, isAppDomain: false }

  const isRootDomain = host === ROOT_APP_DOMAIN || host === `www.${ROOT_APP_DOMAIN}`
  const isAppDomain = host === `app.${ROOT_APP_DOMAIN}`
  const suffix = `.${ROOT_APP_DOMAIN}`
  const subdomain = host.endsWith(suffix) ? host.slice(0, -suffix.length) : ''

  return {
    host,
    subdomain,
    isRootDomain,
    isAppDomain,
  }
}

export async function isSubdomainAvailable(subdomain, tenantId = null) {
  const normalized = normalizeSubdomain(subdomain)
  if (!isValidSubdomain(normalized)) return false
  const existing = await sbGet('tenants', `custom_subdomain=eq.${encodeURIComponent(normalized)}`)
  return !existing || existing.id === tenantId
}

export async function getTenantForHostname(hostname) {
  const { host, subdomain, isRootDomain, isAppDomain } = getHostnameParts(hostname)
  if (!host || isRootDomain || isAppDomain) return null

  const customDomainTenant = await sbGet('tenants', `custom_domain=eq.${encodeURIComponent(host)}`)
  if (customDomainTenant) return customDomainTenant

  if (!subdomain) return null
  return await sbGet('tenants', `custom_subdomain=eq.${encodeURIComponent(subdomain)}`)
}
