import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { PLANS } from '../../utils/entitlements'
import { sbUpdate } from '../../utils/supabase'

const FEATURE_LABELS = {
  hr_directory: 'Staff directory',
  hr_leave: 'Leave management',
  hr_documents: 'Documents and policies',
  hr_timesheets: 'Timesheets',
  hr_onboarding: 'HR onboarding',
  crm_clients: 'Client CRM',
  crm_tasks: 'Tasks',
  crm_pipeline: 'Sales pipeline',
  crm_outreach: 'Outreach',
  notifications: 'Notifications',
  audit_log: 'Audit log',
  reports: 'Reports',
  client_portal: 'Client portal',
  custom_branding: 'Custom branding',
  api_access: 'API access',
}

const WORKER_URL = import.meta.env.VITE_WORKER_URL

export default function Billing() {
  const { tenant, tenantUser, refreshTenant } = useAuth()
  const plan = PLANS[tenant?.plan || 'starter']
  const currentFeatures = new Set(plan?.features || [])
  const [loadingBilling, setLoadingBilling] = useState(false)
  const [switchingPlan, setSwitchingPlan] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const hasBillingSetup = !!tenant?.gc_mandate_id
  const hasSubscription = !!tenant?.gc_subscription_id
  const pendingPlanStorageKey = useMemo(() => tenant?.id ? `dhwp_pending_plan_${tenant.id}` : '', [tenant?.id])
  const [pendingPlan, setPendingPlan] = useState('')

  useEffect(() => {
    if (!pendingPlanStorageKey) return
    const stored = window.localStorage.getItem(pendingPlanStorageKey) || ''
    setPendingPlan(stored)
  }, [pendingPlanStorageKey])

  useEffect(() => {
    if (!pendingPlan || hasBillingSetup || !tenant?.id) return
    let attempts = 0
    const timer = window.setInterval(async () => {
      attempts += 1
      await refreshTenant()
      if (attempts >= 10) window.clearInterval(timer)
    }, 3000)
    return () => window.clearInterval(timer)
  }, [pendingPlan, hasBillingSetup, tenant?.id, refreshTenant])

  useEffect(() => {
    if (!pendingPlan || !hasBillingSetup || hasSubscription || switchingPlan) return
    completePlanSubscription(pendingPlan, { silent: true })
  }, [pendingPlan, hasBillingSetup, hasSubscription])

  const rememberPendingPlan = (key) => {
    if (!pendingPlanStorageKey) return
    window.localStorage.setItem(pendingPlanStorageKey, key)
    setPendingPlan(key)
  }

  const clearPendingPlan = () => {
    if (pendingPlanStorageKey) window.localStorage.removeItem(pendingPlanStorageKey)
    setPendingPlan('')
  }

  const completePlanSubscription = async (key, { silent = false } = {}) => {
    if (!tenant?.id || !tenant?.gc_mandate_id || !tenantUser) return
    if (tenant.gc_subscription_id && key !== tenant.plan) {
      if (!silent) setError('Your current subscription is already active. Switching an existing paid plan will be enabled in the next billing pass.')
      return
    }
    if (switchingPlan) return

    setSwitchingPlan(key)
    setError('')
    if (!silent) setMessage('')

    try {
      const subscriptionRes = await fetch(WORKER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'gc_create_subscription',
          data: {
            amount_pence: (PLANS[key]?.launch_price || 9) * 100,
            mandate_id: tenant.gc_mandate_id,
            name: `${PLANS[key]?.name || 'Starter'} Plan`,
          },
        }),
      })
      const subscriptionJson = await subscriptionRes.json()
      if (!subscriptionRes.ok) throw new Error(subscriptionJson.error || 'Failed to create subscription')
      const subscriptionId = subscriptionJson.subscriptions?.id
      if (!subscriptionId) throw new Error('Subscription ID missing from GoCardless response')

      await sbUpdate('tenants', `id=eq.${tenant.id}`, {
        plan: key,
        seat_limit: PLANS[key]?.max_users || 5,
        gc_subscription_id: subscriptionId,
        status: 'active',
        subscription_started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      clearPendingPlan()
      await refreshTenant()
      setMessage(`Your ${PLANS[key].name} subscription is now active.`)
    } catch (e) {
      if (!silent) setError(e.message || 'Failed to activate subscription')
    }

    setSwitchingPlan('')
  }

  const startBillingFlow = async (desiredPlan = tenant?.plan || 'starter', existingCustomerId = tenant?.gc_customer_id) => {
    if (!WORKER_URL) {
      setError('Billing worker URL is not configured')
      return
    }
    if (!tenant?.id || !tenantUser) return

    setLoadingBilling(true)
    setError('')
    setMessage('')
    rememberPendingPlan(desiredPlan)

    try {
      let customerId = existingCustomerId
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
        await sbUpdate('tenants', `id=eq.${tenant.id}`, { gc_customer_id: customerId, updated_at: new Date().toISOString() })
      }

      const requestRes = await fetch(WORKER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'gc_create_billing_request', data: { customer_id: customerId } }),
      })
      const requestJson = await requestRes.json()
      if (!requestRes.ok) throw new Error(requestJson.error || 'Failed to create billing request')
      const billingRequestId = requestJson.billing_requests?.id
      if (!billingRequestId) throw new Error('Billing request ID missing')

      const flowRes = await fetch(WORKER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'gc_create_billing_request_flow',
          data: {
            billing_request_id: billingRequestId,
            redirect_uri: `${window.location.origin}/billing`,
            exit_uri: `${window.location.origin}/billing`,
          },
        }),
      })
      const flowJson = await flowRes.json()
      if (!flowRes.ok) throw new Error(flowJson.error || 'Failed to start Direct Debit setup')
      const authUrl = flowJson.billing_request_flows?.authorisation_url
      if (!authUrl) throw new Error('Direct Debit authorisation URL missing')

      await refreshTenant()
      window.location.href = authUrl
    } catch (e) {
      setError(e.message || 'Unable to start billing flow')
      setLoadingBilling(false)
      return
    }
  }

  const switchPlan = async (key) => {
    if (!tenant?.id || key === tenant.plan) return
    if (!hasBillingSetup) {
      await startBillingFlow(key)
      return
    }
    if (hasSubscription) {
      setError('Changing an existing live subscription will be enabled in the next billing pass. For now, keep the current plan active.')
      return
    }
    setError('')
    setMessage('')
    try {
      rememberPendingPlan(key)
      await completePlanSubscription(key)
    } catch (e) {
      setError(e.message || 'Failed to change plan')
    }
  }

  const cancelSubscription = async () => {
    if (!tenant?.gc_subscription_id) {
      setError('No active subscription found to cancel')
      return
    }
    if (!WORKER_URL) {
      setError('Billing worker URL is not configured')
      return
    }
    setLoadingBilling(true)
    setError('')
    setMessage('')
    try {
      const res = await fetch(WORKER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'gc_cancel_subscription', data: { subscription_id: tenant.gc_subscription_id } }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to cancel subscription')
      await sbUpdate('tenants', `id=eq.${tenant.id}`, {
        gc_subscription_id: null,
        status: 'cancelled',
        updated_at: new Date().toISOString(),
      })
      await refreshTenant()
      setMessage('Subscription cancelled.')
    } catch (e) {
      setError(e.message || 'Unable to cancel subscription')
    }
    setLoadingBilling(false)
  }

  return (
    <div className="fade-in">
      <div className="page-hd">
        <div>
          <h1 className="page-title">Billing</h1>
          <p className="page-sub">Manage your subscription</p>
        </div>
      </div>
      <div style={{ maxWidth: 920, display: 'flex', flexDirection: 'column', gap: 20 }}>
        {!!error && <div style={{ fontSize: 13, color: 'var(--red)', background: 'var(--red-soft)', padding: '10px 14px', borderRadius: 8 }}>{error}</div>}
        {!!message && <div style={{ fontSize: 13, color: 'var(--green)', background: 'var(--green-soft)', padding: '10px 14px', borderRadius: 8 }}>{message}</div>}

        <div className="card card-pad">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, gap: 16 }}>
            <div>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 400, marginBottom: 4 }}>{plan?.name || 'Starter'} Plan</h3>
              <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--gold)' }}>£{plan?.launch_price || 9}<span style={{ fontSize: 14, color: 'var(--faint)', fontWeight: 400 }}>/mo</span></div>
              <div style={{ fontSize: 12, color: 'var(--faint)', textDecoration: 'line-through' }}>Normal price: £{plan?.normal_price || 19}/mo</div>
            </div>
            <span className={`badge badge-${tenant?.status === 'trialing' ? 'amber' : tenant?.status === 'active' ? 'green' : 'red'}`} style={{ textTransform: 'capitalize', fontSize: 12 }}>
              {tenant?.status === 'trialing' ? 'Free Trial' : tenant?.status}
            </span>
          </div>

          {tenant?.status === 'trialing' && (
            <div style={{ background: 'var(--gold-soft)', border: '1px solid var(--gold-border)', borderRadius: 10, padding: '12px 16px', marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--gold)', marginBottom: 2 }}>Founding Member</div>
              <div style={{ fontSize: 12, color: 'var(--sub)' }}>Lock in this price forever by setting up Direct Debit before your trial ends.</div>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
            {[
              ['Trial ends', tenant?.trial_ends_at ? new Date(tenant.trial_ends_at).toLocaleDateString('en-GB') : 'N/A'],
              ['Seats included', plan?.max_users || 5],
              ['Direct Debit', tenant?.gc_mandate_id ? 'Set up' : 'Not set'],
              ['Subscription', tenant?.gc_subscription_id ? 'Active' : pendingPlan ? `Pending ${PLANS[pendingPlan]?.name || 'plan'}` : 'Not active'],
              ['Last payment', tenant?.last_payment_at ? new Date(tenant.last_payment_at).toLocaleDateString('en-GB') : 'None yet'],
              ['Next payment', tenant?.next_payment_at ? new Date(tenant.next_payment_at).toLocaleDateString('en-GB') : 'N/A'],
            ].map(([label, val]) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border2)' }}>
                <span style={{ fontSize: 13, color: 'var(--faint)' }}>{label}</span>
                <span style={{ fontSize: 13, fontFamily: 'var(--font-mono)' }}>{val}</span>
              </div>
            ))}
          </div>

          {!tenant?.gc_mandate_id ? (
            <div>
              <p style={{ fontSize: 13, color: 'var(--sub)', marginBottom: 12 }}>Set up Direct Debit to activate your subscription. UK businesses only, via GoCardless.</p>
              <button className="btn btn-gold" style={{ width: '100%', justifyContent: 'center' }} onClick={() => startBillingFlow(pendingPlan || tenant?.plan || 'starter')} disabled={loadingBilling}>
                {loadingBilling ? 'Starting setup...' : `Set up Direct Debit${pendingPlan ? ` for ${PLANS[pendingPlan]?.name || 'selected plan'}` : ''} →`}
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn btn-outline" onClick={() => startBillingFlow(tenant?.plan || 'starter', tenant.gc_customer_id)} disabled={loadingBilling}>Update Payment Method</button>
              <button className="btn btn-outline" style={{ color: 'var(--red)' }} onClick={cancelSubscription} disabled={loadingBilling || !tenant?.gc_subscription_id}>Cancel Subscription</button>
            </div>
          )}
        </div>

        <div className="card card-pad">
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 400, marginBottom: 16 }}>Available Plans</h3>
          <div style={{ fontSize: 12, color: 'var(--faint)', marginBottom: 14 }}>
            {hasBillingSetup
              ? hasSubscription
                ? 'Your live subscription is active. Existing paid-plan switches stay locked until proration and swap logic are fully wired.'
                : 'Direct Debit is set up. The first selected plan will activate once the subscription is created.'
              : 'Choose a plan and complete Direct Debit setup. Access only upgrades after a real subscription is created.'}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
            {Object.entries(PLANS).map(([key, p]) => (
              <div key={key} style={{ border: `2px solid ${tenant?.plan === key ? 'var(--blue)' : 'var(--border)'}`, borderRadius: 10, padding: 16, background: tenant?.plan === key ? 'var(--blue-soft)' : 'transparent' }}>
                <div style={{ fontWeight: 600, marginBottom: 4, textTransform: 'capitalize' }}>{p.name}</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--gold)' }}>£{p.launch_price}<span style={{ fontSize: 12, color: 'var(--faint)', fontWeight: 400 }}>/mo</span></div>
                <div style={{ fontSize: 11, color: 'var(--faint)', marginBottom: 8 }}>Up to {p.max_users} users</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
                  {p.features.slice(0, 4).map(feature => (
                    <div key={feature} style={{ fontSize: 12, color: 'var(--sub)' }}>• {FEATURE_LABELS[feature] || feature}</div>
                  ))}
                  {p.features.length > 4 && <div style={{ fontSize: 11, color: 'var(--faint)' }}>+ {p.features.length - 4} more features</div>}
                </div>
                {tenant?.plan === key
                  ? <span className="badge badge-blue" style={{ fontSize: 10 }}>Current plan</span>
                  : !hasBillingSetup
                    ? <button className="btn btn-outline btn-sm" style={{ width: '100%', justifyContent: 'center', marginTop: 4 }} onClick={() => startBillingFlow(key)} disabled={loadingBilling}>
                        {loadingBilling ? 'Starting setup...' : 'Set up billing first'}
                      </button>
                    : <button className="btn btn-outline btn-sm" style={{ width: '100%', justifyContent: 'center', marginTop: 4 }} onClick={() => switchPlan(key)} disabled={!!switchingPlan}>
                        {switchingPlan === key ? 'Activating...' : hasSubscription ? 'Switch locked' : 'Activate plan'}
                      </button>}
              </div>
            ))}
          </div>
        </div>

        <div className="card card-pad">
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 400, marginBottom: 16 }}>Your current access</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {Object.entries(FEATURE_LABELS).map(([feature, label]) => (
              <div key={feature} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 10, background: currentFeatures.has(feature) ? 'var(--surface2)' : 'transparent' }}>
                <span style={{ fontSize: 13, color: 'var(--text)' }}>{label}</span>
                <span className={`badge ${currentFeatures.has(feature) ? 'badge-green' : 'badge-grey'}`} style={{ fontSize: 10 }}>
                  {currentFeatures.has(feature) ? 'Included' : 'Upgrade'}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
