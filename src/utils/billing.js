import { sbGet, sbUpdate } from './supabase'
import { PLANS } from './entitlements'

const WORKER_URL = import.meta.env.VITE_WORKER_URL

export function getPendingPlanStorageKey(tenantId) {
  return tenantId ? `dhwp_pending_plan_${tenantId}` : ''
}

export function getBillingFallbackNoticeKey(tenantId) {
  return tenantId ? `dhwp_billing_notice_${tenantId}` : ''
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

export function rememberBillingFallbackNotice(tenantId, message) {
  const key = getBillingFallbackNoticeKey(tenantId)
  if (!key) return
  window.localStorage.setItem(key, message)
}

export function readBillingFallbackNotice(tenantId) {
  const key = getBillingFallbackNoticeKey(tenantId)
  if (!key) return ''
  return window.localStorage.getItem(key) || ''
}

export function clearBillingFallbackNotice(tenantId) {
  const key = getBillingFallbackNoticeKey(tenantId)
  if (!key) return
  window.localStorage.removeItem(key)
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
  const separator = redirectPath.includes('?') ? '&' : '?'
  const successPath = `${redirectPath}${separator}billing=return`
  const cancelPath = `${redirectPath}${separator}billing=cancelled`

  const res = await fetch(WORKER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'stripe_create_checkout_session',
      data: {
        tenant_id: tenant.id,
        tenant_name: tenant.name,
        owner_email: tenant.owner_email || tenantUser.email,
        customer_email: tenant.owner_email || tenantUser.email,
        customer_name: tenantUser.full_name || tenant.name,
        plan_key: desiredPlan,
        customer_id: tenant.stripe_customer_id || '',
        success_path: successPath,
        cancel_path: cancelPath,
      },
    }),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error || 'Failed to start Stripe checkout')

  if (json.customer_id && json.customer_id !== tenant.stripe_customer_id) {
    await sbUpdate('tenants', `id=eq.${tenant.id}`, {
      stripe_customer_id: json.customer_id,
      updated_at: new Date().toISOString(),
    })
  }

  await refreshTenant()
  if (!json.url) throw new Error('Stripe checkout URL missing')
  window.location.href = json.url
}

export async function createBillingPortalSession({
  tenant,
  returnPath = '/billing',
}) {
  if (!WORKER_URL) throw new Error('Billing worker URL is not configured')
  if (!tenant?.stripe_customer_id) throw new Error('Stripe customer is not ready yet')

  const res = await fetch(WORKER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'stripe_create_billing_portal_session',
      data: {
        customer_id: tenant.stripe_customer_id,
        return_path: returnPath,
      },
    }),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error || 'Failed to open Stripe billing portal')
  if (!json.url) throw new Error('Stripe billing portal URL missing')
  window.location.href = json.url
}

export async function getBillingHistory({
  tenant,
  limit = 12,
}) {
  if (!WORKER_URL) throw new Error('Billing worker URL is not configured')
  if (!tenant?.stripe_customer_id) {
    return { invoices: [], subscription: null, upcoming: null }
  }

  const res = await fetch(WORKER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'stripe_get_billing_history',
      data: {
        customer_id: tenant.stripe_customer_id,
        subscription_id: tenant.stripe_subscription_id || '',
        limit,
      },
    }),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error || 'Failed to load billing history')
  return json
}

export async function updateSubscriptionPlan({
  tenantId,
  subscriptionId,
  planKey,
  refreshTenant,
}) {
  if (!WORKER_URL) throw new Error('Billing worker URL is not configured')
  if (!tenantId || !subscriptionId || !planKey) throw new Error('Missing subscription information')

  const res = await fetch(WORKER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'stripe_update_subscription',
      data: {
        tenant_id: tenantId,
        subscription_id: subscriptionId,
        plan_key: planKey,
      },
    }),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error || 'Failed to update subscription')
  await refreshTenant?.()
  return json
}

export async function cancelSubscription({
  tenantId,
  subscriptionId,
  refreshTenant,
}) {
  if (!WORKER_URL) throw new Error('Billing worker URL is not configured')
  if (!tenantId || !subscriptionId) throw new Error('Missing subscription information')

  const res = await fetch(WORKER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'stripe_cancel_subscription',
      data: {
        tenant_id: tenantId,
        subscription_id: subscriptionId,
      },
    }),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error || 'Failed to cancel subscription')
  await refreshTenant?.()
  return json
}

export async function waitForStripeActivation(tenantId, refreshTenant, attempts = 10) {
  if (!tenantId) throw new Error('Missing tenant ID')
  let latestTenant = null

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    latestTenant = await sbGet('tenants', `id=eq.${tenantId}`)
    if (latestTenant?.stripe_subscription_id && latestTenant?.status === 'active') {
      await refreshTenant?.()
      return latestTenant
    }
    await new Promise(resolve => window.setTimeout(resolve, 1500))
  }

  return latestTenant
}
