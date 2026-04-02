import { sbGetMany, sbInsert, sbUpdate } from './supabase'

const SHARED_LOCAL_PARTS = new Set([
  'admin',
  'accounts',
  'billing',
  'bookings',
  'careers',
  'contact',
  'enquiries',
  'finance',
  'hello',
  'hr',
  'info',
  'marketing',
  'noreply',
  'no-reply',
  'operations',
  'payroll',
  'recruitment',
  'sales',
  'service',
  'support',
  'team',
])

const ROLE_PRESET_MAP = {
  owner: 'owner',
  admin: 'admin',
  manager: 'manager',
  staff: 'staff',
  superadmin: 'owner',
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase()
}

function splitName(fullName) {
  const clean = String(fullName || '').trim()
  if (!clean) return { first_name: '', last_name: '' }
  const [first, ...rest] = clean.split(/\s+/)
  return { first_name: first || '', last_name: rest.join(' ') }
}

export function isLikelySharedMailbox(email, fullName = '') {
  const normalized = normalizeEmail(email)
  const localPart = normalized.split('@')[0]
  const loweredName = String(fullName || '').trim().toLowerCase()

  if (!normalized) return false
  if (SHARED_LOCAL_PARTS.has(localPart)) return true
  if (localPart.startsWith('noreply') || localPart.startsWith('no-reply')) return true
  if (loweredName.includes('shared mailbox') || loweredName.includes('shared inbox')) return true
  return false
}

function employeePayloadFromTenantUser(tenantId, tenantUser, existing = null) {
  const displayName = tenantUser.full_name || tenantUser.email || 'Unnamed employee'
  const sharedMailbox = isLikelySharedMailbox(tenantUser.email, tenantUser.full_name)
  const nameParts = splitName(tenantUser.full_name)

  return {
    tenant_id: tenantId,
    tenant_user_id: tenantUser.id,
    primary_email: normalizeEmail(tenantUser.email),
    first_name: nameParts.first_name || existing?.first_name || null,
    last_name: nameParts.last_name || existing?.last_name || null,
    display_name: displayName,
    job_title: tenantUser.job_title || null,
    department: tenantUser.department || null,
    is_person: !sharedMailbox,
    is_shared_mailbox: sharedMailbox,
    status: tenantUser.status || 'active',
    avatar_url: tenantUser.avatar_url || null,
    onboarding_mode: tenantUser.status === 'invited',
    updated_at: new Date().toISOString(),
  }
}

function employeePermissionsPayload(tenantId, employeeId, tenantUser, existing = null) {
  return {
    tenant_id: tenantId,
    employee_id: employeeId,
    role_preset: ROLE_PRESET_MAP[tenantUser.role] || existing?.role_preset || 'staff',
    onboarding_only: tenantUser.status === 'invited' || existing?.onboarding_only || false,
    page_overrides: existing?.page_overrides || {},
    updated_at: new Date().toISOString(),
  }
}

function fallbackEmployees(tenantUsers) {
  return (tenantUsers || []).map(user => ({
    id: user.id,
    tenant_user_id: user.id,
    primary_email: normalizeEmail(user.email),
    display_name: user.full_name || user.email || 'Unnamed employee',
    first_name: splitName(user.full_name).first_name || null,
    last_name: splitName(user.full_name).last_name || null,
    job_title: user.job_title || null,
    department: user.department || null,
    is_person: !isLikelySharedMailbox(user.email, user.full_name),
    is_shared_mailbox: isLikelySharedMailbox(user.email, user.full_name),
    status: user.status || 'active',
    avatar_url: user.avatar_url || null,
    onboarding_mode: user.status === 'invited',
    tenant_user: user,
    permissions: {
      role_preset: ROLE_PRESET_MAP[user.role] || 'staff',
      onboarding_only: user.status === 'invited',
      page_overrides: {},
    },
  }))
}

export async function syncEmployeesForTenant(tenantId) {
  if (!tenantId) return []

  const tenantUsers = await sbGetMany('tenant_users', `tenant_id=eq.${tenantId}&order=full_name.asc`)

  try {
    const [employees, hrProfiles, permissionRows] = await Promise.all([
      sbGetMany('employees', `tenant_id=eq.${tenantId}&order=display_name.asc`),
      sbGetMany('hr_profiles', `tenant_id=eq.${tenantId}`),
      sbGetMany('employee_permissions', `tenant_id=eq.${tenantId}`),
    ])

    const employeeByTenantUser = new Map((employees || []).filter(Boolean).map(employee => [employee.tenant_user_id, employee]))
    const employeeByEmail = new Map((employees || []).filter(Boolean).map(employee => [normalizeEmail(employee.primary_email), employee]))

    for (const tenantUser of tenantUsers || []) {
      const existing = employeeByTenantUser.get(tenantUser.id) || employeeByEmail.get(normalizeEmail(tenantUser.email))
      const payload = employeePayloadFromTenantUser(tenantId, tenantUser, existing)

      if (existing) {
        const changed =
          existing.tenant_user_id !== payload.tenant_user_id ||
          existing.primary_email !== payload.primary_email ||
          existing.display_name !== payload.display_name ||
          existing.job_title !== payload.job_title ||
          existing.department !== payload.department ||
          existing.is_shared_mailbox !== payload.is_shared_mailbox ||
          existing.status !== payload.status ||
          existing.onboarding_mode !== payload.onboarding_mode ||
          existing.avatar_url !== payload.avatar_url

        if (changed) await sbUpdate('employees', `id=eq.${existing.id}`, payload)
      } else {
        await sbInsert('employees', {
          ...payload,
          created_at: new Date().toISOString(),
        })
      }
    }

    const refreshedEmployees = await sbGetMany('employees', `tenant_id=eq.${tenantId}&order=display_name.asc`)
    const refreshedByTenantUser = new Map((refreshedEmployees || []).map(employee => [employee.tenant_user_id, employee]))
    const permissionByEmployee = new Map((permissionRows || []).map(row => [row.employee_id, row]))
    const hrByTenantUser = new Map((hrProfiles || []).filter(Boolean).map(profile => [profile.tenant_user_id, profile]))

    for (const tenantUser of tenantUsers || []) {
      const employee = refreshedByTenantUser.get(tenantUser.id)
      if (!employee) continue

      const permissionPayload = employeePermissionsPayload(tenantId, employee.id, tenantUser, permissionByEmployee.get(employee.id))
      const existingPermission = permissionByEmployee.get(employee.id)

      if (existingPermission) {
        const changed =
          existingPermission.role_preset !== permissionPayload.role_preset ||
          existingPermission.onboarding_only !== permissionPayload.onboarding_only
        if (changed) await sbUpdate('employee_permissions', `id=eq.${existingPermission.id}`, permissionPayload)
      } else {
        await sbInsert('employee_permissions', {
          ...permissionPayload,
          created_at: new Date().toISOString(),
        })
      }

      const hrProfile = hrByTenantUser.get(tenantUser.id)
      if (hrProfile?.employee_id !== employee.id) {
        await sbUpdate('hr_profiles', `id=eq.${hrProfile.id}`, {
          employee_id: employee.id,
          updated_at: new Date().toISOString(),
        })
      }
    }

    const finalEmployees = await sbGetMany('employees', `tenant_id=eq.${tenantId}&order=display_name.asc`)
    const finalHrProfiles = await sbGetMany('hr_profiles', `tenant_id=eq.${tenantId}`)
    const managerByTenantUser = new Map(
      (finalHrProfiles || [])
        .filter(profile => profile.tenant_user_id && profile.manager_id)
        .map(profile => [profile.tenant_user_id, profile.manager_id]),
    )
    const employeeIdByTenantUser = new Map((finalEmployees || []).map(employee => [employee.tenant_user_id, employee.id]))

    for (const employee of finalEmployees || []) {
      const managerTenantUserId = managerByTenantUser.get(employee.tenant_user_id)
      const managerEmployeeId = managerTenantUserId ? employeeIdByTenantUser.get(managerTenantUserId) || null : null
      if ((employee.manager_employee_id || null) !== managerEmployeeId) {
        await sbUpdate('employees', `id=eq.${employee.id}`, {
          manager_employee_id: managerEmployeeId,
          updated_at: new Date().toISOString(),
        })
      }
    }

    return await sbGetMany('employees', `tenant_id=eq.${tenantId}&order=display_name.asc`)
  } catch (error) {
    console.warn('Canonical employees table unavailable, falling back to tenant_users', error)
    return fallbackEmployees(tenantUsers)
  }
}

export async function listEmployees(tenantId) {
  const [employees, tenantUsers, permissions, hrProfiles, portalPreferences] = await Promise.all([
    syncEmployeesForTenant(tenantId),
    sbGetMany('tenant_users', `tenant_id=eq.${tenantId}&order=full_name.asc`),
    sbGetMany('employee_permissions', `tenant_id=eq.${tenantId}`),
    sbGetMany('hr_profiles', `tenant_id=eq.${tenantId}`),
    sbGetMany('portal_preferences', `tenant_id=eq.${tenantId}`),
  ])

  const tenantUserById = new Map((tenantUsers || []).map(user => [user.id, user]))
  const permissionsByEmployee = new Map((permissions || []).map(row => [row.employee_id, row]))
  const hrByEmployee = new Map((hrProfiles || []).filter(row => row.employee_id).map(row => [row.employee_id, row]))
  const hrByTenantUser = new Map((hrProfiles || []).filter(row => row.tenant_user_id).map(row => [row.tenant_user_id, row]))
  const portalByEmployee = new Map((portalPreferences || []).map(row => [row.employee_id, row]))

  return (employees || []).map(employee => {
    const tenantUser = employee.tenant_user || tenantUserById.get(employee.tenant_user_id) || null
    return {
      ...employee,
      tenant_user: tenantUser,
      permissions: employee.permissions || permissionsByEmployee.get(employee.id) || null,
      hr_profile: hrByEmployee.get(employee.id) || hrByTenantUser.get(employee.tenant_user_id) || null,
      portal_preferences: portalByEmployee.get(employee.id) || null,
    }
  })
}

export async function getEmployeeByIdentifier(tenantId, identifier) {
  const employees = await listEmployees(tenantId)
  const match = employees.find(employee =>
    employee.id === identifier ||
    employee.tenant_user_id === identifier ||
    employee.tenant_user?.id === identifier ||
    employee.tenant_user?.user_id === identifier,
  )

  if (!match) return null

  const notifications = match.tenant_user_id
    ? await sbGetMany('notifications', `tenant_id=eq.${tenantId}&tenant_user_id=eq.${match.tenant_user_id}&order=created_at.desc&limit=20`)
    : []

  const directReports = employees.filter(employee => employee.manager_employee_id === match.id)

  return {
    ...match,
    notifications: notifications || [],
    direct_reports: directReports,
    manager: employees.find(employee => employee.id === match.manager_employee_id) || null,
  }
}

export async function getEmployeeSafeguards(tenantId) {
  const [employees, tenantUsers, hrProfiles, permissions] = await Promise.all([
    listEmployees(tenantId),
    sbGetMany('tenant_users', `tenant_id=eq.${tenantId}&order=full_name.asc`),
    sbGetMany('hr_profiles', `tenant_id=eq.${tenantId}`),
    sbGetMany('employee_permissions', `tenant_id=eq.${tenantId}`),
  ])

  const normalizedEmailMap = new Map()
  const duplicateIdentities = []
  const missingManagers = []
  const incompleteHrProfiles = []
  const sharedMailboxAsPerson = []
  const missingPermissions = []
  const tenantUsersMissingEmployee = []
  const staleOnboarding = []

  const employeeByTenantUser = new Map((employees || []).map(employee => [employee.tenant_user_id, employee]))
  const hrByTenantUser = new Map((hrProfiles || []).filter(Boolean).map(profile => [profile.tenant_user_id, profile]))
  const permissionsByEmployee = new Map((permissions || []).map(permission => [permission.employee_id, permission]))

  for (const employee of employees || []) {
    const email = normalizeEmail(employee.primary_email)
    if (email) {
      const seen = normalizedEmailMap.get(email) || []
      seen.push(employee)
      normalizedEmailMap.set(email, seen)
    }

    if (employee.is_person && employee.is_shared_mailbox) {
      sharedMailboxAsPerson.push(employee)
    }

    if (employee.is_person && !permissionsByEmployee.get(employee.id)) {
      missingPermissions.push(employee)
    }

    const hrProfile = employee.hr_profile || hrByTenantUser.get(employee.tenant_user_id)
    const needsManager = employee.status === 'active' && ['staff', 'manager'].includes(employee.permissions?.role_preset || employee.tenant_user?.role || 'staff')
    if (needsManager && !employee.manager_employee_id) {
      missingManagers.push(employee)
    }

    const missingHrFields = [
      hrProfile?.contract_type,
      hrProfile?.start_date,
      hrProfile?.phone,
      hrProfile?.emergency_name,
    ].filter(Boolean).length
    if (employee.is_person && employee.status !== 'suspended' && missingHrFields < 3) {
      incompleteHrProfiles.push(employee)
    }

    if (employee.onboarding_mode) {
      const referenceDate = employee.tenant_user?.created_at || employee.created_at
      const ageDays = referenceDate ? Math.floor((Date.now() - new Date(referenceDate).getTime()) / 86400000) : 0
      if (ageDays >= 7) staleOnboarding.push({ ...employee, ageDays })
    }
  }

  for (const tenantUser of tenantUsers || []) {
    const sharedMailbox = isLikelySharedMailbox(tenantUser.email, tenantUser.full_name)
    if (!employeeByTenantUser.get(tenantUser.id) && !sharedMailbox) {
      tenantUsersMissingEmployee.push(tenantUser)
    }
  }

  for (const [, records] of normalizedEmailMap.entries()) {
    if (records.length > 1) {
      duplicateIdentities.push(records)
    }
  }

  return {
    employees,
    duplicateIdentities,
    missingManagers,
    incompleteHrProfiles,
    sharedMailboxAsPerson,
    missingPermissions,
    tenantUsersMissingEmployee,
    staleOnboarding,
  }
}

export async function saveEmployeePermissions({ permissionId, tenantId, employeeId, rolePreset, onboardingOnly, pageOverrides = {} }) {
  const payload = {
    tenant_id: tenantId,
    employee_id: employeeId,
    role_preset: rolePreset,
    onboarding_only: onboardingOnly,
    page_overrides: pageOverrides,
    updated_at: new Date().toISOString(),
  }

  if (permissionId) {
    await sbUpdate('employee_permissions', `id=eq.${permissionId}`, payload)
  } else {
    await sbInsert('employee_permissions', {
      ...payload,
      created_at: new Date().toISOString(),
    })
  }
}

export async function saveEmployeeProfile(employeeId, payload) {
  await sbUpdate('employees', `id=eq.${employeeId}`, {
    ...payload,
    updated_at: new Date().toISOString(),
  })
}

export async function updateEmployeeLifecycle(employee, nextStatus) {
  if (employee?.tenant_user_id) {
    await sbUpdate('tenant_users', `id=eq.${employee.tenant_user_id}`, { status: nextStatus })
  }
  await sbUpdate('employees', `id=eq.${employee.id}`, {
    status: nextStatus,
    onboarding_mode: nextStatus === 'invited',
    updated_at: new Date().toISOString(),
  })
}

export function buildOrgChart(employees = []) {
  const people = (employees || []).filter((employee) => employee.is_person && !employee.is_shared_mailbox)
  const childrenByManager = new Map()

  for (const employee of people) {
    const key = employee.manager_employee_id || 'root'
    if (!childrenByManager.has(key)) childrenByManager.set(key, [])
    childrenByManager.get(key).push(employee)
  }

  const roots = [
    ...(childrenByManager.get('root') || []),
    ...people.filter((employee) => employee.manager_employee_id && !people.find((candidate) => candidate.id === employee.manager_employee_id)),
  ]
    .filter((employee, index, list) => list.findIndex((item) => item.id === employee.id) === index)
    .sort((a, b) => String(a.display_name || '').localeCompare(String(b.display_name || '')))

  function branch(employee) {
    const children = [...(childrenByManager.get(employee.id) || [])]
      .sort((a, b) => String(a.display_name || '').localeCompare(String(b.display_name || '')))
      .map(branch)
    return { ...employee, children }
  }

  return roots.map(branch)
}
