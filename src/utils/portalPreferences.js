import { sbGet, sbInsert, sbUpdate } from './supabase'
import { canAccessPath, getEffectivePermissionSet, isOnboardingOnlyMode } from './permissions'

export const PORTAL_PREFERENCES_STORAGE_KEY = 'dhwp:portal-preferences'

export const ACCENT_SCHEMES = [
  { id: 'workspace', label: 'Workspace', accent: null, soft: null, border: null, surface: null, pageTint: null },
  { id: 'cobalt', label: 'Cobalt', accent: '#3478f6', soft: 'rgba(52,120,246,0.14)', border: 'rgba(52,120,246,0.24)', surface: 'rgba(52,120,246,0.08)', pageTint: 'rgba(52,120,246,0.09)' },
  { id: 'emerald', label: 'Emerald', accent: '#1b9c72', soft: 'rgba(27,156,114,0.14)', border: 'rgba(27,156,114,0.24)', surface: 'rgba(27,156,114,0.08)', pageTint: 'rgba(27,156,114,0.09)' },
  { id: 'copper', label: 'Copper', accent: '#b76b3b', soft: 'rgba(183,107,59,0.14)', border: 'rgba(183,107,59,0.24)', surface: 'rgba(183,107,59,0.08)', pageTint: 'rgba(183,107,59,0.09)' },
  { id: 'slate', label: 'Slate', accent: '#5a6d8f', soft: 'rgba(90,109,143,0.14)', border: 'rgba(90,109,143,0.24)', surface: 'rgba(90,109,143,0.08)', pageTint: 'rgba(90,109,143,0.09)' },
  { id: 'berry', label: 'Berry', accent: '#b34d78', soft: 'rgba(179,77,120,0.14)', border: 'rgba(179,77,120,0.24)', surface: 'rgba(179,77,120,0.08)', pageTint: 'rgba(179,77,120,0.09)' },
]

export const LANDING_PAGE_OPTIONS = [
  { id: 'dashboard', label: 'Dashboard', path: '/' },
  { id: 'notifications', label: 'Notifications', path: '/notifications' },
  { id: 'tasks', label: 'My tasks', path: '/tasks' },
  { id: 'clients', label: 'Clients', path: '/clients' },
  { id: 'leave', label: 'Leave', path: '/leave' },
  { id: 'timesheets', label: 'Timesheets', path: '/timesheets' },
  { id: 'reports', label: 'Reports', path: '/reports' },
]

export const QUICK_ACTION_OPTIONS = [
  { id: 'tasks', label: 'My Tasks', path: '/tasks' },
  { id: 'notifications', label: 'Notifications', path: '/notifications' },
  { id: 'timesheets', label: 'Timesheets', path: '/timesheets' },
  { id: 'leave', label: 'Leave', path: '/leave' },
  { id: 'clients', label: 'Clients', path: '/clients' },
  { id: 'staff', label: 'Staff directory', path: '/staff' },
  { id: 'reports', label: 'Reports', path: '/reports' },
  { id: 'support', label: 'Support log', path: '/notifications' },
]

export const DASHBOARD_SECTIONS = [
  { id: 'metrics', label: 'Key metrics' },
  { id: 'quick_actions', label: 'Pinned quick actions' },
  { id: 'workspace', label: 'Workspace summary' },
  { id: 'signals', label: 'Operational signals' },
]

export const DEFAULT_PORTAL_PREFERENCES = {
  theme_mode: 'light',
  accent_scheme: 'workspace',
  dashboard_density: 'comfortable',
  dashboard_header_style: 'full',
  show_system_banners: true,
  visible_dashboard_sections: DASHBOARD_SECTIONS.map((section) => section.id),
  default_landing_page: 'dashboard',
  pinned_quick_actions: ['tasks', 'notifications', 'clients', 'timesheets'],
  dashboard_section_order: DASHBOARD_SECTIONS.map((section) => section.id),
}

function ensureArray(values, fallback) {
  return Array.isArray(values) ? values : fallback
}

export function mergePortalPreferences(row = null) {
  return {
    ...DEFAULT_PORTAL_PREFERENCES,
    ...(row || {}),
    visible_dashboard_sections: ensureArray(row?.visible_dashboard_sections, DEFAULT_PORTAL_PREFERENCES.visible_dashboard_sections),
    pinned_quick_actions: ensureArray(row?.pinned_quick_actions, DEFAULT_PORTAL_PREFERENCES.pinned_quick_actions),
    dashboard_section_order: ensureArray(row?.dashboard_section_order, DEFAULT_PORTAL_PREFERENCES.dashboard_section_order),
  }
}

export function getAccentScheme(accentScheme, workspaceColour = null) {
  if (accentScheme === 'workspace') {
    const accent = workspaceColour || '#3478f6'
    return {
      id: 'workspace',
      label: 'Workspace',
      accent,
      soft: `${accent}1f`,
      border: `${accent}3a`,
      surface: `${accent}14`,
      pageTint: `${accent}14`,
    }
  }
  return ACCENT_SCHEMES.find((scheme) => scheme.id === accentScheme) || ACCENT_SCHEMES[1]
}

export function applyStoredPortalAppearance() {
  if (typeof window === 'undefined') return
  try {
    const raw = window.localStorage.getItem(PORTAL_PREFERENCES_STORAGE_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw)
    applyPortalAppearance(parsed)
  } catch (error) {
    console.warn('Failed to apply stored portal appearance', error)
  }
}

export function applyPortalAppearance(preferences, workspaceColour = null) {
  if (typeof document === 'undefined') return

  const merged = mergePortalPreferences(preferences)
  const root = document.documentElement
  const scheme = getAccentScheme(merged.accent_scheme, workspaceColour)

  root.dataset.theme = merged.theme_mode || 'light'
  root.dataset.dashboardDensity = merged.dashboard_density || 'comfortable'
  root.style.setProperty('--blue', scheme.accent)
  root.style.setProperty('--gold', scheme.accent)
  root.style.setProperty('--blue-soft', scheme.soft)
  root.style.setProperty('--gold-soft', scheme.soft)
  root.style.setProperty('--blue-border', scheme.border)
  root.style.setProperty('--gold-border', scheme.border)
  root.style.setProperty('--accent-surface', scheme.surface)
  root.style.setProperty('--page-tint', scheme.pageTint)

  try {
    window.localStorage.setItem(PORTAL_PREFERENCES_STORAGE_KEY, JSON.stringify({
      theme_mode: merged.theme_mode,
      dashboard_density: merged.dashboard_density,
      accent_scheme: merged.accent_scheme,
    }))
  } catch (error) {
    console.warn('Failed to persist portal appearance cache', error)
  }
}

export async function getPortalPreferences(tenantId, employeeId) {
  if (!tenantId || !employeeId) return null
  const row = await sbGet('portal_preferences', `tenant_id=eq.${tenantId}&employee_id=eq.${employeeId}`)
  return row ? mergePortalPreferences(row) : mergePortalPreferences()
}

export async function savePortalPreferences({ preferenceId, tenantId, employeeId, values }) {
  const payload = {
    tenant_id: tenantId,
    employee_id: employeeId,
    ...mergePortalPreferences(values),
    updated_at: new Date().toISOString(),
  }

  if (preferenceId) {
    await sbUpdate('portal_preferences', `id=eq.${preferenceId}`, payload)
  } else {
    await sbInsert('portal_preferences', {
      ...payload,
      created_at: new Date().toISOString(),
    })
  }
}

export function getAllowedLandingOptions(permissionRecord, fallbackRole = 'staff', selfStaffPaths = []) {
  if (isOnboardingOnlyMode(permissionRecord)) {
    return LANDING_PAGE_OPTIONS.filter((option) => option.path === '/')
  }

  return LANDING_PAGE_OPTIONS.filter((option) =>
    canAccessPath(option.path, { permissionRecord, fallbackRole, selfStaffPaths }),
  )
}

export function getAllowedQuickActions(permissionRecord, fallbackRole = 'staff', selfStaffPaths = []) {
  return QUICK_ACTION_OPTIONS.filter((option) =>
    canAccessPath(option.path, { permissionRecord, fallbackRole, selfStaffPaths }),
  )
}

export function sanitizePortalPreferences(values, { permissionRecord, fallbackRole = 'staff', selfStaffPaths = [] } = {}) {
  const merged = mergePortalPreferences(values)
  const allowedLandingOptions = getAllowedLandingOptions(permissionRecord, fallbackRole, selfStaffPaths)
  const allowedQuickActions = getAllowedQuickActions(permissionRecord, fallbackRole, selfStaffPaths)
  const effectivePermissions = getEffectivePermissionSet(permissionRecord, fallbackRole)

  const validLanding = allowedLandingOptions.find((option) => option.id === merged.default_landing_page)?.id || 'dashboard'
  const validActions = allowedQuickActions
    .filter((option) => merged.pinned_quick_actions.includes(option.id))
    .slice(0, 5)
    .map((option) => option.id)

  const validSections = DASHBOARD_SECTIONS
    .filter((section) => merged.visible_dashboard_sections.includes(section.id))
    .map((section) => section.id)

  const orderedSections = DASHBOARD_SECTIONS
    .filter((section) => merged.dashboard_section_order.includes(section.id))
    .map((section) => section.id)

  return {
    ...merged,
    theme_mode: ['light', 'dark'].includes(merged.theme_mode) ? merged.theme_mode : 'light',
    accent_scheme: ACCENT_SCHEMES.find((scheme) => scheme.id === merged.accent_scheme) ? merged.accent_scheme : 'workspace',
    dashboard_density: ['comfortable', 'compact'].includes(merged.dashboard_density) ? merged.dashboard_density : 'comfortable',
    dashboard_header_style: ['full', 'minimal'].includes(merged.dashboard_header_style) ? merged.dashboard_header_style : 'full',
    show_system_banners: !!merged.show_system_banners,
    default_landing_page: validLanding,
    pinned_quick_actions: validActions.length ? validActions : DEFAULT_PORTAL_PREFERENCES.pinned_quick_actions.filter((action) => allowedQuickActions.find((option) => option.id === action)),
    visible_dashboard_sections: validSections.length ? validSections : DEFAULT_PORTAL_PREFERENCES.visible_dashboard_sections,
    dashboard_section_order: orderedSections.length ? orderedSections : DEFAULT_PORTAL_PREFERENCES.dashboard_section_order,
    can_view_reports: !!effectivePermissions.reports,
  }
}

export function resolveDefaultLandingPath(preferences, { permissionRecord, fallbackRole = 'staff', selfStaffPaths = [] } = {}) {
  if (isOnboardingOnlyMode(permissionRecord)) return '/onboarding-hr'

  const sanitized = sanitizePortalPreferences(preferences, { permissionRecord, fallbackRole, selfStaffPaths })
  const chosen = LANDING_PAGE_OPTIONS.find((option) => option.id === sanitized.default_landing_page)
  return chosen?.path || '/'
}
