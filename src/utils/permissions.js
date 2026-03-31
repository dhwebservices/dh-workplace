const ROLE_ORDER = ['staff', 'manager', 'admin', 'owner', 'superadmin']

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

export function assignableRoles(role) {
  if (role === 'owner' || role === 'superadmin') return ['staff', 'manager', 'admin', 'owner']
  if (role === 'admin') return ['staff', 'manager']
  return []
}
