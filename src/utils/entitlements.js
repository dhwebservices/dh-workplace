export const PLANS = {
  starter: {
    name: 'Starter',
    launch_price: 9,
    normal_price: 19,
    max_users: 5,
    features: [
      'hr_directory', 'hr_leave', 'hr_documents',
      'crm_clients', 'crm_tasks', 'notifications',
    ],
  },
  growth: {
    name: 'Growth',
    launch_price: 24,
    normal_price: 49,
    max_users: 15,
    features: [
      'hr_directory', 'hr_leave', 'hr_documents', 'hr_timesheets', 'hr_onboarding',
      'crm_clients', 'crm_tasks', 'crm_pipeline', 'crm_outreach',
      'client_portal', 'reports', 'notifications',
    ],
  },
  business: {
    name: 'Business',
    launch_price: 59,
    normal_price: 99,
    max_users: 40,
    features: [
      'hr_directory', 'hr_leave', 'hr_documents', 'hr_timesheets', 'hr_onboarding',
      'crm_clients', 'crm_tasks', 'crm_pipeline', 'crm_outreach',
      'client_portal', 'reports', 'notifications',
      'custom_branding', 'api_access', 'audit_log',
    ],
  },
}

export function can(tenant, feature) {
  if (!tenant?.plan) return false
  const plan = PLANS[tenant.plan] || PLANS.starter
  return plan.features.includes(feature)
}

export function seatLimitReached(tenant, currentUserCount) {
  const plan = PLANS[tenant?.plan] || PLANS.starter
  return currentUserCount >= plan.max_users
}

export function isAccessBlocked(tenant) {
  if (!tenant) return true
  if (tenant.status === 'trialing') return false
  if (tenant.status === 'active') return false
  if (tenant.status === 'overdue') {
    // Allow during grace period
    if (tenant.grace_period_ends_at && new Date(tenant.grace_period_ends_at) > new Date()) return false
    return true
  }
  if (tenant.status === 'suspended') return true
  return false
}

export function getTrialDaysLeft(tenant) {
  if (!tenant?.trial_ends_at) return 0
  const diff = new Date(tenant.trial_ends_at) - new Date()
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)))
}
