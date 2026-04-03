const ROLE_ORDER = ['staff', 'manager', 'admin', 'owner', 'superadmin']

export const PAGE_PERMISSION_GROUPS = [
  {
    id: 'workspace',
    label: 'Workspace shell',
    items: [
      { key: 'dashboard', label: 'Dashboard', paths: ['/'] },
      { key: 'search', label: 'Global search', paths: ['/search'] },
      { key: 'portal', label: 'Personalisation', paths: ['/portal'] },
      { key: 'notifications', label: 'Notifications', paths: ['/notifications'] },
    ],
  },
  {
    id: 'hr',
    label: 'HR and people',
    items: [
      { key: 'hr_directory', label: 'Staff directory and org chart', paths: ['/staff', '/org-chart'] },
      { key: 'hr_schedule', label: 'Schedule and appointments', paths: ['/schedule', '/appointments'] },
      { key: 'hr_leave', label: 'Leave', paths: ['/leave'] },
      { key: 'hr_documents', label: 'Documents and policies', paths: ['/documents', '/policies'] },
      { key: 'hr_timesheets', label: 'Timesheets', paths: ['/timesheets'] },
      { key: 'hr_onboarding', label: 'HR onboarding', paths: ['/onboarding-hr'] },
    ],
  },
  {
    id: 'crm',
    label: 'Client operations',
    items: [
      { key: 'crm_clients', label: 'Clients', paths: ['/clients'] },
      { key: 'crm_tasks', label: 'Tasks', paths: ['/tasks'] },
      { key: 'crm_pipeline', label: 'Pipeline', paths: ['/pipeline'] },
      { key: 'crm_outreach', label: 'Outreach', paths: ['/outreach'] },
    ],
  },
  {
    id: 'admin',
    label: 'Admin and controls',
    items: [
      { key: 'team', label: 'Team', paths: ['/team'] },
      { key: 'billing', label: 'Billing', paths: ['/billing'] },
      { key: 'banners', label: 'Banners', paths: ['/banners'] },
      { key: 'reports', label: 'Reports', paths: ['/reports'] },
      { key: 'safeguards', label: 'Safeguards', paths: ['/safeguards'] },
      { key: 'automations', label: 'Automations', paths: ['/automations'] },
      { key: 'settings', label: 'Settings', paths: ['/settings'] },
      { key: 'audit', label: 'Audit log', paths: ['/audit'] },
      { key: 'integrations', label: 'Integrations', paths: ['/integrations'] },
    ],
  },
]

const PAGE_KEY_BY_PATH = PAGE_PERMISSION_GROUPS
  .flatMap((group) => group.items)
  .flatMap((item) => item.paths.map((path) => ({ prefix: path, key: item.key })))

const ROLE_PRESET_ACCESS = {
  owner: {
    dashboard: true,
    search: true,
    portal: true,
    notifications: true,
    hr_directory: true,
    hr_schedule: true,
    hr_leave: true,
    hr_documents: true,
    hr_timesheets: true,
    hr_onboarding: true,
    crm_clients: true,
    crm_tasks: true,
    crm_pipeline: true,
    crm_outreach: true,
    team: true,
    billing: true,
    banners: true,
    reports: true,
    safeguards: true,
    automations: true,
    settings: true,
    audit: true,
    integrations: true,
    leaveApprove: true,
    documentsManage: true,
    staffAccess: true,
    invoicesManage: true,
  },
  admin: {
    dashboard: true,
    search: true,
    portal: true,
    notifications: true,
    hr_directory: true,
    hr_schedule: true,
    hr_leave: true,
    hr_documents: true,
    hr_timesheets: true,
    hr_onboarding: true,
    crm_clients: true,
    crm_tasks: true,
    crm_pipeline: true,
    crm_outreach: true,
    team: true,
    billing: false,
    banners: false,
    reports: true,
    safeguards: false,
    automations: false,
    settings: false,
    audit: true,
    integrations: false,
    leaveApprove: true,
    documentsManage: true,
    staffAccess: true,
    invoicesManage: true,
  },
  manager: {
    dashboard: true,
    search: true,
    portal: true,
    notifications: true,
    hr_directory: true,
    hr_schedule: true,
    hr_leave: true,
    hr_documents: true,
    hr_timesheets: true,
    hr_onboarding: false,
    crm_clients: true,
    crm_tasks: true,
    crm_pipeline: true,
    crm_outreach: true,
    team: false,
    billing: false,
    banners: false,
    reports: true,
    safeguards: false,
    automations: false,
    settings: false,
    audit: false,
    integrations: false,
    leaveApprove: true,
    documentsManage: false,
    staffAccess: false,
    invoicesManage: false,
  },
  staff: {
    dashboard: true,
    search: true,
    portal: true,
    notifications: true,
    hr_directory: true,
    hr_schedule: true,
    hr_leave: true,
    hr_documents: true,
    hr_timesheets: true,
    hr_onboarding: false,
    crm_clients: false,
    crm_tasks: false,
    crm_pipeline: false,
    crm_outreach: false,
    team: false,
    billing: false,
    banners: false,
    reports: false,
    safeguards: false,
    automations: false,
    settings: false,
    audit: false,
    integrations: false,
    leaveApprove: false,
    documentsManage: false,
    staffAccess: false,
    invoicesManage: false,
  },
  onboarding: {
    dashboard: true,
    search: false,
    portal: false,
    notifications: false,
    hr_directory: false,
    hr_schedule: false,
    hr_leave: false,
    hr_documents: false,
    hr_timesheets: false,
    hr_onboarding: true,
    crm_clients: false,
    crm_tasks: false,
    crm_pipeline: false,
    crm_outreach: false,
    team: false,
    billing: false,
    banners: false,
    reports: false,
    safeguards: false,
    automations: false,
    settings: false,
    audit: false,
    integrations: false,
    leaveApprove: false,
    documentsManage: false,
    staffAccess: false,
    invoicesManage: false,
  },
}

function normalizeArgs(roleOrOptions, permissionRecordArg = null) {
  if (typeof roleOrOptions === 'object' && roleOrOptions !== null) {
    return {
      role: roleOrOptions.role || 'staff',
      permissionRecord: roleOrOptions.permissionRecord || null,
    }
  }
  return {
    role: roleOrOptions || 'staff',
    permissionRecord: permissionRecordArg,
  }
}

export function getEffectivePermissionSet(permissionRecord, fallbackRole = 'staff') {
  const preset = permissionRecord?.role_preset || fallbackRole || 'staff'
  const base = { ...(ROLE_PRESET_ACCESS[preset] || ROLE_PRESET_ACCESS.staff) }
  const overrides = permissionRecord?.page_overrides || {}
  return { ...base, ...overrides }
}

export function isOnboardingOnlyMode(permissionRecord) {
  return !!(permissionRecord?.onboarding_only || permissionRecord?.role_preset === 'onboarding')
}

export function getPermissionOverrideDefaults(permissionRecord, fallbackRole = 'staff') {
  const effective = getEffectivePermissionSet(permissionRecord, fallbackRole)
  return PAGE_PERMISSION_GROUPS.reduce((acc, group) => {
    group.items.forEach((item) => {
      acc[item.key] = !!effective[item.key]
    })
    return acc
  }, {})
}

export function canAccessPath(pathname, { permissionRecord, fallbackRole = 'staff', selfStaffPaths = [] } = {}) {
  if (isOnboardingOnlyMode(permissionRecord)) {
    if (pathname === '/' || pathname === '/onboarding-hr') return true
    if (selfStaffPaths.includes(pathname)) return true
    return false
  }

  if (selfStaffPaths.includes(pathname)) return true

  const effective = getEffectivePermissionSet(permissionRecord, fallbackRole)
  const match = PAGE_KEY_BY_PATH.find((route) => pathname === route.prefix || pathname.startsWith(`${route.prefix}/`))
  if (!match) return true
  return !!effective[match.key]
}

export function canAccessNavItem(item, { permissionRecord, fallbackRole = 'staff' } = {}) {
  if (isOnboardingOnlyMode(permissionRecord)) {
    return item.to === '/' || item.to === '/onboarding-hr'
  }
  return canAccessPath(item.to, { permissionRecord, fallbackRole })
}

export function visibleStaffProfileTabs(permissionRecord, canManage) {
  if (isOnboardingOnlyMode(permissionRecord)) return ['profile', 'onboarding', 'notifications', 'history']
  if (canManage) return ['profile', 'hr', 'bank', 'permissions', 'documents', 'payslips', 'manager', 'portal', 'onboarding', 'lifecycle', 'notifications', 'history']
  return ['profile', 'portal', 'documents', 'payslips', 'notifications', 'history']
}

export function hasRoleAtLeast(role, minimumRole) {
  return ROLE_ORDER.indexOf(role || 'staff') >= ROLE_ORDER.indexOf(minimumRole)
}

export function canManageTeam(roleOrOptions, permissionRecordArg = null) {
  const { role, permissionRecord } = normalizeArgs(roleOrOptions, permissionRecordArg)
  return !!getEffectivePermissionSet(permissionRecord, role).team
}

export function canManageBilling(roleOrOptions, permissionRecordArg = null) {
  const { role, permissionRecord } = normalizeArgs(roleOrOptions, permissionRecordArg)
  return !!getEffectivePermissionSet(permissionRecord, role).billing
}

export function canManageWorkspaceSettings(roleOrOptions, permissionRecordArg = null) {
  const { role, permissionRecord } = normalizeArgs(roleOrOptions, permissionRecordArg)
  return !!getEffectivePermissionSet(permissionRecord, role).settings
}

export function canViewReports(roleOrOptions, permissionRecordArg = null) {
  const { role, permissionRecord } = normalizeArgs(roleOrOptions, permissionRecordArg)
  return !!getEffectivePermissionSet(permissionRecord, role).reports
}

export function canViewAudit(roleOrOptions, permissionRecordArg = null) {
  const { role, permissionRecord } = normalizeArgs(roleOrOptions, permissionRecordArg)
  return !!getEffectivePermissionSet(permissionRecord, role).audit
}

export function canApproveLeave(roleOrOptions, permissionRecordArg = null) {
  const { role, permissionRecord } = normalizeArgs(roleOrOptions, permissionRecordArg)
  return !!getEffectivePermissionSet(permissionRecord, role).leaveApprove
}

export function canManageDocuments(roleOrOptions, permissionRecordArg = null) {
  const { role, permissionRecord } = normalizeArgs(roleOrOptions, permissionRecordArg)
  return !!getEffectivePermissionSet(permissionRecord, role).documentsManage
}

export function canManageStaffAccess(roleOrOptions, permissionRecordArg = null) {
  const { role, permissionRecord } = normalizeArgs(roleOrOptions, permissionRecordArg)
  return !!getEffectivePermissionSet(permissionRecord, role).staffAccess
}

export function canManageCRM(roleOrOptions, permissionRecordArg = null) {
  const { role, permissionRecord } = normalizeArgs(roleOrOptions, permissionRecordArg)
  const effective = getEffectivePermissionSet(permissionRecord, role)
  return !!(effective.crm_clients || effective.crm_tasks || effective.crm_pipeline || effective.crm_outreach)
}

export function canManageInvoices(roleOrOptions, permissionRecordArg = null) {
  const { role, permissionRecord } = normalizeArgs(roleOrOptions, permissionRecordArg)
  return !!getEffectivePermissionSet(permissionRecord, role).invoicesManage
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
