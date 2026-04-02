const ROLE_ORDER = ['staff', 'manager', 'admin', 'owner', 'superadmin']

const ROLE_PRESET_ACCESS = {
  owner: {
    billing: true,
    team: true,
    settings: true,
    audit: true,
    reports: true,
    crm: true,
    leaveApprove: true,
    documentsManage: true,
    staffAccess: true,
    invoicesManage: true,
  },
  admin: {
    billing: false,
    team: true,
    settings: false,
    audit: true,
    reports: true,
    crm: true,
    leaveApprove: true,
    documentsManage: true,
    staffAccess: true,
    invoicesManage: true,
  },
  manager: {
    billing: false,
    team: false,
    settings: false,
    audit: false,
    reports: true,
    crm: true,
    leaveApprove: true,
    documentsManage: false,
    staffAccess: false,
    invoicesManage: false,
  },
  staff: {
    billing: false,
    team: false,
    settings: false,
    audit: false,
    reports: false,
    crm: false,
    leaveApprove: false,
    documentsManage: false,
    staffAccess: false,
    invoicesManage: false,
  },
  onboarding: {
    billing: false,
    team: false,
    settings: false,
    audit: false,
    reports: false,
    crm: false,
    leaveApprove: false,
    documentsManage: false,
    staffAccess: false,
    invoicesManage: false,
  },
}

const ROUTE_PERMISSION_KEYS = [
  { prefix: '/team', key: 'team' },
  { prefix: '/billing', key: 'billing' },
  { prefix: '/banners', key: 'settings' },
  { prefix: '/settings', key: 'settings' },
  { prefix: '/audit', key: 'audit' },
  { prefix: '/reports', key: 'reports' },
  { prefix: '/clients', key: 'crm' },
  { prefix: '/tasks', key: 'crm' },
  { prefix: '/pipeline', key: 'crm' },
  { prefix: '/outreach', key: 'crm' },
]

export function getEffectivePermissionSet(permissionRecord, fallbackRole = 'staff') {
  const preset = permissionRecord?.role_preset || fallbackRole || 'staff'
  const base = { ...(ROLE_PRESET_ACCESS[preset] || ROLE_PRESET_ACCESS.staff) }
  const overrides = permissionRecord?.page_overrides || {}
  return { ...base, ...overrides }
}

export function isOnboardingOnlyMode(permissionRecord) {
  return !!(permissionRecord?.onboarding_only || permissionRecord?.role_preset === 'onboarding')
}

export function canAccessPath(pathname, { permissionRecord, fallbackRole = 'staff', selfStaffPaths = [] } = {}) {
  if (isOnboardingOnlyMode(permissionRecord)) {
    if (pathname === '/' || pathname === '/onboarding-hr') return true
    if (selfStaffPaths.includes(pathname)) return true
    return false
  }

  const effective = getEffectivePermissionSet(permissionRecord, fallbackRole)
  const match = ROUTE_PERMISSION_KEYS.find(route => pathname.startsWith(route.prefix))
  if (!match) return true
  return !!effective[match.key]
}

export function canAccessNavItem(item, { permissionRecord, fallbackRole = 'staff' } = {}) {
  if (isOnboardingOnlyMode(permissionRecord)) {
    return item.to === '/' || item.to === '/onboarding-hr'
  }

  const effective = getEffectivePermissionSet(permissionRecord, fallbackRole)
  if (item.permission === 'team') return !!effective.team
  if (item.permission === 'billing') return !!effective.billing
  if (item.permission === 'settings') return !!effective.settings
  if (item.permission === 'audit') return !!effective.audit
  if (item.to === '/reports') return !!effective.reports
  return true
}

export function visibleStaffProfileTabs(permissionRecord, canManage) {
  if (isOnboardingOnlyMode(permissionRecord)) return ['profile', 'onboarding', 'notifications']
  if (canManage) return ['profile', 'hr', 'permissions', 'manager', 'onboarding', 'lifecycle', 'notifications']
  return ['profile', 'notifications']
}

export function hasRoleAtLeast(role, minimumRole) {
  return ROLE_ORDER.indexOf(role || 'staff') >= ROLE_ORDER.indexOf(minimumRole)
}

export function canManageTeam(role) {
  return hasRoleAtLeast(role, 'admin')
}

export function canManageBilling(role) {
  return role === 'owner' || role === 'superadmin'
}

export function canManageWorkspaceSettings(role) {
  return role === 'owner' || role === 'superadmin'
}

export function canViewReports(role) {
  return hasRoleAtLeast(role, 'manager')
}

export function canViewAudit(role) {
  return hasRoleAtLeast(role, 'admin')
}

export function canApproveLeave(role) {
  return hasRoleAtLeast(role, 'manager')
}

export function canManageDocuments(role) {
  return hasRoleAtLeast(role, 'admin')
}

export function canManageStaffAccess(role) {
  return hasRoleAtLeast(role, 'admin')
}

export function canManageCRM(role) {
  return hasRoleAtLeast(role, 'manager')
}

export function canManageInvoices(role) {
  return hasRoleAtLeast(role, 'admin')
}

export function canManageMemberRecord(actorRole, targetRole, actorId, targetId) {
  if (!actorRole) return false
  if (actorId && targetId && actorId === targetId) return false
  if (actorRole === 'owner' || actorRole === 'superadmin') return true
  if (actorRole === 'admin') return ['staff', 'manager'].includes(targetRole)
  return false
}

export function assignableRoles(role) {
  if (role === 'owner' || role === 'superadmin') return ['staff', 'manager', 'admin', 'owner']
  if (role === 'admin') return ['staff', 'manager']
  return []
}
