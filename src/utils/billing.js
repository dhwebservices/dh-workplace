import { sbUpdate } from './supabase'
import { PLANS } from './entitlements'

const WORKER_URL = import.meta.env.VITE_WORKER_URL

export function getPendingPlanStorageKey(tenantId) {
  return tenantId ? `dhwp_pending_plan_${tenantId}` : ''
}

export function rememberPendingPlan(tenantId, planKey) {
  const key = getPendingPlanStorageKey(tenantId)
  if (!key) return
  window.localStorage.setItem(key, planKey)
}

export function clearPendingPlan(tenantId) {
  const key = getPendingPlanStorageKey(tenantId)
  if (!key) return
  window.localStorage.removeItem(key)
}

export function needsInitialPayment(tenant, planKey) {
  return Boolean(planKey) && !tenant?.gc_mandate_id && !tenant?.gc_subscription_id && !tenant?.last_payment_at
}

export async function startBillingSetup({
  tenant,
  tenantUser,
  desiredPlan,
  refreshTenant,
  redirectPath = '/billing',
}) {
  if (!WORKER_URL) throw new Error('Billing worker URL is not configured')
  if (!tenant?.id || !tenantUser) throw new Error('Billing setup requires a valid workspace owner')

  rememberPendingPlan(tenant.id, desiredPlan)

  let customerId = tenant.gc_customer_id
  if (!customerId) {
    const name = (tenantUser.full_name || '').trim().split(' ')
    const customerRes = await fetch(WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'gc_create_customer',
        data: {
          email: tenant.owner_email || tenantUser.email,
          given_name: name[0] || 'DH',
          family_name: name.slice(1).join(' ') || 'Workplace',
        },
      }),
    })
    const customerJson = await customerRes.json()
    if (!customerRes.ok) throw new Error(customerJson.error || 'Failed to create billing customer')
    customerId = customerJson.customers?.id
    if (!customerId) throw new Error('Billing customer ID missing')
    await sbUpdate('tenants', `id=eq.${tenant.id}`, {
      gc_customer_id: customerId,
      updated_at: new Date().toISOString(),
    })
  }

  const collectInitialPayment = needsInitialPayment(tenant, desiredPlan)
  const amountPence = collectInitialPayment ? (PLANS[desiredPlan]?.launch_price || 9) * 100 : null

  const requestRes = await fetch(WORKER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'gc_create_billing_request',
      data: {
        customer_id: customerId,
        amount_pence: amountPence,
        description: collectInitialPayment ? `${PLANS[desiredPlan]?.name || 'Starter'} first month` : '',
      },
    }),
  })
  const requestJson = await requestRes.json()
  if (!requestRes.ok) throw new Error(requestJson.error || 'Failed to create billing request')
  const billingRequestId = requestJson.billing_requests?.id
  if (!billingRequestId) throw new Error('Billing request ID missing')

  const redirectUri = `${window.location.origin}${redirectPath}`
  const flowRes = await fetch(WORKER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'gc_create_billing_request_flow',
      data: {
        billing_request_id: billingRequestId,
        redirect_uri: redirectUri,
        exit_uri: redirectUri,
      },
    }),
  })
  const flowJson = await flowRes.json()
  if (!flowRes.ok) throw new Error(flowJson.error || 'Failed to start Direct Debit setup')
  const authUrl = flowJson.billing_request_flows?.authorisation_url
  if (!authUrl) throw new Error('Direct Debit authorisation URL missing')

  await refreshTenant()
  window.location.href = authUrl
}
