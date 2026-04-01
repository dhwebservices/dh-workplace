import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { PLANS } from '../../utils/entitlements'
import { sbGetMany, sbUpdate } from '../../utils/supabase'
import { canManageBilling } from '../../utils/permissions'
import {
  cancelSubscription as cancelStripeSubscription,
  clearPendingPlan as clearStoredPendingPlan,
  createBillingPortalSession,
  getBillingHistory,
  getPendingPlanStorageKey,
  startBillingSetup,
  updateSubscriptionPlan,
} from '../../utils/billing'

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

export default function Billing() {
  const { tenant, tenantUser, refreshTenant } = useAuth()
  const canManage = canManageBilling(tenantUser?.role)
  const plan = PLANS[tenant?.plan || 'starter']
  const currentFeatures = new Set(plan?.features || [])
  const [loadingBilling, setLoadingBilling] = useState(false)
  const [switchingPlan, setSwitchingPlan] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [activeSeats, setActiveSeats] = useState(0)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [billingHistory, setBillingHistory] = useState({ invoices: [], subscription: null, upcoming: null })
  const hasStripeCustomer = !!tenant?.stripe_customer_id
  const hasSubscription = !!(tenant?.stripe_subscription_id || tenant?.gc_subscription_id)
  const pendingPlanStorageKey = useMemo(() => getPendingPlanStorageKey(tenant?.id), [tenant?.id])
  const [pendingPlan, setPendingPlan] = useState('')

  useEffect(() => {
    if (!pendingPlanStorageKey) return
    const stored = window.localStorage.getItem(pendingPlanStorageKey) || ''
    setPendingPlan(stored)
  }, [pendingPlanStorageKey])

  useEffect(() => {
    let active = true
    const loadHistory = async () => {
      if (!tenant?.stripe_customer_id) {
        if (active) setBillingHistory({ invoices: [], subscription: null, upcoming: null })
        return
      }
      setHistoryLoading(true)
      try {
        const history = await getBillingHistory({ tenant, limit: 10 })
        if (active) setBillingHistory(history)
      } catch (e) {
        if (active) setError((current) => current || e.message || 'Unable to load billing history')
      }
      if (active) setHistoryLoading(false)
    }
    loadHistory()
    return () => { active = false }
  }, [tenant?.stripe_customer_id, tenant?.stripe_subscription_id])

  useEffect(() => {
    let active = true
    const loadActiveSeats = async () => {
      if (!tenant?.id) return
      const members = await sbGetMany('tenant_users', `tenant_id=eq.${tenant.id}&status=neq.suspended`)
      if (active) setActiveSeats((members || []).length)
    }
    loadActiveSeats()
    return () => { active = false }
  }, [tenant?.id])

  useEffect(() => {
    if (!pendingPlan || hasSubscription || !tenant?.id) return
    let attempts = 0
    const timer = window.setInterval(async () => {
      attempts += 1
      await refreshTenant()
      if (attempts >= 10) window.clearInterval(timer)
    }, 3000)
    return () => window.clearInterval(timer)
  }, [pendingPlan, hasSubscription, tenant?.id, refreshTenant])

  const rememberPendingPlan = (key) => {
    if (!pendingPlanStorageKey) return
    window.localStorage.setItem(pendingPlanStorageKey, key)
    setPendingPlan(key)
  }

  const clearPendingPlan = () => {
    clearPendingPlanForTenant()
    setPendingPlan('')
  }

  const clearPendingPlanForTenant = () => {
    clearStoredPendingPlan(tenant?.id)
  }

  const formatMoney = (amount, currency = 'gbp') => new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: String(currency || 'gbp').toUpperCase(),
    maximumFractionDigits: 2,
  }).format(Number(amount || 0) / 100)

  const formatStripeDate = (value) => {
    if (!value) return '—'
    const date = typeof value === 'number' ? new Date(value * 1000) : new Date(value)
    if (Number.isNaN(date.getTime())) return '—'
    return date.toLocaleDateString('en-GB')
  }

  const applyPlanLocally = async (key, extra = {}) => {
    await sbUpdate('tenants', `id=eq.${tenant.id}`, {
      plan: key,
      seat_limit: PLANS[key]?.max_users || 5,
      updated_at: new Date().toISOString(),
      ...extra,
    })
    clearPendingPlan()
    await refreshTenant()
  }

  const updateLiveSubscription = async (key) => {
    const subscriptionId = tenant?.stripe_subscription_id
    if (!subscriptionId) return
    setSwitchingPlan(key)
    setError('')
    setMessage('')
    try {
      await updateSubscriptionPlan({
        tenantId: tenant.id,
        subscriptionId,
        planKey: key,
        refreshTenant,
      })
      await applyPlanLocally(key)
      setMessage(`${PLANS[key].name} is now your active plan. Future Stripe renewals will use the updated amount.`)
    } catch (e) {
      setError(e.message || 'Failed to update subscription')
    }
    setSwitchingPlan('')
  }

  const startBillingFlow = async (desiredPlan = tenant?.plan || 'starter') => {
    setLoadingBilling(true)
    setError('')
    setMessage('')

    try {
      await startBillingSetup({
        tenant,
        tenantUser,
        desiredPlan,
        refreshTenant,
        redirectPath: '/billing',
      })
    } catch (e) {
      setError(e.message || 'Unable to start billing flow')
      setLoadingBilling(false)
      return
    }
  }

  const openBillingPortal = async () => {
    if (!tenant?.stripe_customer_id) {
      setError('Stripe customer details are not ready yet.')
      return
    }
    setLoadingBilling(true)
    setError('')
    setMessage('')
    try {
      await createBillingPortalSession({
        tenantUser,
        tenant,
        returnPath: '/billing',
      })
    } catch (e) {
      setError(e.message || 'Unable to open billing portal')
      setLoadingBilling(false)
      return
    }
  }

  const switchPlan = async (key) => {
    if (!canManage) return
    if (!tenant?.id || key === tenant.plan) return
    const targetSeatLimit = PLANS[key]?.max_users || 0
    if (targetSeatLimit < activeSeats) {
      setError(`This plan only includes ${targetSeatLimit} seats. You currently have ${activeSeats} active users, so reduce seat usage before downgrading.`)
      return
    }
    if (!hasSubscription) {
      await startBillingFlow(key)
      return
    }
    await updateLiveSubscription(key)
  }

  const handleCancelSubscription = async () => {
    if (!canManage) return
    if (!tenant?.stripe_subscription_id) {
      setError('No active subscription found to cancel')
      return
    }
    setLoadingBilling(true)
    setError('')
    setMessage('')
    try {
      await cancelStripeSubscription({
        tenantId: tenant.id,
        subscriptionId: tenant.stripe_subscription_id,
        refreshTenant,
      })
      await sbUpdate('tenants', `id=eq.${tenant.id}`, {
        stripe_subscription_id: null,
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

  const recentInvoices = billingHistory.invoices || []
  const latestInvoice = recentInvoices[0] || null
  const upcomingInvoice = billingHistory.upcoming || null

  return (
    <div className="fade-in page-stack">
      {!canManage && (
        <div className="card card-pad"><p style={{color:'var(--faint)'}}>Owner access required.</p></div>
      )}
      {canManage && (
      <>
      <div className="page-hd">
        <div>
          <h1 className="page-title">Billing</h1>
          <p className="page-sub">Plans, Stripe checkout, and subscription readiness</p>
        </div>
      </div>
      <div className="kpi-strip">
        <div className="kpi-cell">
          <div className="kpi-cell-label">Plan</div>
          <div className="kpi-cell-value">{plan?.name || 'Starter'}</div>
        </div>
        <div className="kpi-cell">
          <div className="kpi-cell-label">Status</div>
          <div className="kpi-cell-value">{tenant?.status === 'pending_activation' ? 'Pending activation' : tenant?.status}</div>
        </div>
        <div className="kpi-cell">
          <div className="kpi-cell-label">Stripe</div>
          <div className="kpi-cell-value">{hasSubscription ? 'Active' : hasStripeCustomer ? 'Customer ready' : 'Not set'}</div>
        </div>
        <div className="kpi-cell">
          <div className="kpi-cell-label">Subscription</div>
          <div className="kpi-cell-value">{hasSubscription ? 'Active' : pendingPlan ? `Pending ${PLANS[pendingPlan]?.name || 'plan'}` : 'Not active'}</div>
        </div>
      </div>

      <div style={{ maxWidth: 1120, display: 'flex', flexDirection: 'column', gap: 20 }}>
        {!!error && <div style={{ fontSize: 13, color: 'var(--red)', background: 'var(--red-soft)', padding: '10px 14px', borderRadius: 8 }}>{error}</div>}
        {!!message && <div style={{ fontSize: 13, color: 'var(--green)', background: 'var(--green-soft)', padding: '10px 14px', borderRadius: 8 }}>{message}</div>}

        <div className="card card-pad">
          <div className="section-head">
            <div>
              <h3 className="panel-title">{plan?.name || 'Starter'} plan</h3>
              <div className="panel-sub">Your live entitlement, checkout payment, and recurring billing state</div>
            </div>
            <div>
              <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--gold)' }}>£{plan?.launch_price || 9}<span style={{ fontSize: 14, color: 'var(--faint)', fontWeight: 400 }}>/mo</span></div>
              <div style={{ fontSize: 12, color: 'var(--faint)', textDecoration: 'line-through' }}>Normal price: £{plan?.normal_price || 19}/mo</div>
            </div>
          </div>

          {tenant?.status === 'pending_activation' && (
            <div style={{ background: 'var(--gold-soft)', border: '1px solid var(--gold-border)', borderRadius: 10, padding: '12px 16px', marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--gold)', marginBottom: 2 }}>Founding Member</div>
              <div style={{ fontSize: 12, color: 'var(--sub)' }}>Activate billing now to unlock the workspace and keep this launch price forever.</div>
            </div>
          )}

          <div className="stack-sm" style={{ marginBottom: 20 }}>
            {[
              ['Activation', tenant?.status === 'pending_activation' ? 'Payment setup required' : 'Complete'],
              ['Seats included', plan?.max_users || 5],
              ['Active seats', activeSeats],
              ['Provider', tenant?.stripe_subscription_id ? 'Stripe subscription' : 'Stripe Checkout'],
              ['First payment', latestInvoice?.status === 'paid' ? `Collected ${formatMoney(latestInvoice.amount_paid, latestInvoice.currency)}` : `£${PLANS[pendingPlan || tenant?.plan || 'starter']?.launch_price || 9} due at checkout`],
              ['Subscription', tenant?.stripe_subscription_id ? 'Active' : pendingPlan ? `Pending ${PLANS[pendingPlan]?.name || 'plan'}` : 'Not active'],
              ['Last payment', latestInvoice?.paid_at ? `${formatMoney(latestInvoice.amount_paid, latestInvoice.currency)} on ${formatStripeDate(latestInvoice.paid_at)}` : tenant?.last_payment_at ? new Date(tenant.last_payment_at).toLocaleDateString('en-GB') : 'None yet'],
              ['Next payment', upcomingInvoice?.period_end ? `${formatMoney(upcomingInvoice.amount_due, upcomingInvoice.currency)} on ${formatStripeDate(upcomingInvoice.period_end)}` : tenant?.next_payment_at ? new Date(tenant.next_payment_at).toLocaleDateString('en-GB') : 'N/A'],
            ].map(([label, val]) => (
              <div key={label} className="detail-row" style={{ padding: '8px 0', borderBottom: '1px solid var(--border2)' }}>
                <span className="detail-row-label">{label}</span>
                <span className="detail-row-value" style={{ fontFamily: 'var(--font-mono)' }}>{val}</span>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {!tenant?.stripe_subscription_id ? (
              <button className="btn btn-primary" onClick={() => startBillingFlow(pendingPlan || tenant?.plan || 'starter')} disabled={loadingBilling}>
                {loadingBilling ? 'Starting checkout...' : `Pay £${PLANS[pendingPlan || tenant?.plan || 'starter']?.launch_price || 9} and activate subscription`}
              </button>
            ) : (
              <button className="btn btn-outline" onClick={openBillingPortal} disabled={loadingBilling}>Manage payment method</button>
            )}
            {tenant?.stripe_subscription_id && (
              <button className="btn btn-outline" style={{ color: 'var(--red)' }} onClick={handleCancelSubscription} disabled={loadingBilling || !tenant?.stripe_subscription_id}>
                Cancel subscription
              </button>
            )}
          </div>
        </div>

        <div className="card card-pad">
          <div className="section-head">
            <div>
              <h3 className="panel-title">Payment history</h3>
              <div className="panel-sub">Recent Stripe invoices, renewals, and payment outcomes for this workspace</div>
            </div>
          </div>
          {historyLoading ? (
            <div style={{ padding: 12 }}>
              {[1, 2, 3].map((item) => <div key={item} className="skel" style={{ height: 54, marginBottom: 10, borderRadius: 10 }} />)}
            </div>
          ) : recentInvoices.length ? (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>Status</th>
                    <th>Amount</th>
                    <th>Created</th>
                    <th>Paid</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {recentInvoices.map((invoice) => (
                    <tr key={invoice.id}>
                      <td>{invoice.number || invoice.id}</td>
                      <td><span className={`badge badge-${invoice.status === 'paid' ? 'green' : invoice.status === 'open' ? 'amber' : invoice.status === 'uncollectible' || invoice.status === 'void' ? 'red' : 'grey'}`}>{invoice.status || 'unknown'}</span></td>
                      <td>{formatMoney(invoice.amount_paid || invoice.amount_due, invoice.currency)}</td>
                      <td>{formatStripeDate(invoice.created)}</td>
                      <td>{invoice.paid_at ? formatStripeDate(invoice.paid_at) : '—'}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                          {invoice.hosted_invoice_url && <a href={invoice.hosted_invoice_url} target="_blank" rel="noreferrer" style={{ color: 'var(--blue)', textDecoration: 'none', fontSize: 13 }}>View</a>}
                          {invoice.invoice_pdf && <a href={invoice.invoice_pdf} target="_blank" rel="noreferrer" style={{ color: 'var(--blue)', textDecoration: 'none', fontSize: 13 }}>PDF</a>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="compact-note">No Stripe invoices yet. The first successful checkout will appear here.</div>
          )}
        </div>

        <div className="card card-pad">
          <div className="section-head">
            <div>
              <h3 className="panel-title">Billing health</h3>
              <div className="panel-sub">Safeguards before changing plan or payment state</div>
            </div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(220px, 1fr))', gap:12 }}>
            {[
              { label:'Checkout status', value: hasStripeCustomer ? 'Customer created' : 'Action needed', tone: hasStripeCustomer ? 'var(--blue)' : 'var(--amber)' },
              { label:'Subscription status', value: billingHistory.subscription?.status || (hasSubscription ? 'Live' : 'Not active'), tone: hasSubscription ? 'var(--green)' : 'var(--faint)' },
              { label:'Seat entitlement', value: `${activeSeats} / ${plan?.max_users || tenant?.seat_limit || 5} seats`, tone: activeSeats >= (plan?.max_users || tenant?.seat_limit || 5) ? 'var(--amber)' : 'var(--blue)' },
              { label:'Grace period', value: tenant?.grace_period_ends_at ? new Date(tenant.grace_period_ends_at).toLocaleDateString('en-GB') : 'None', tone: tenant?.grace_period_ends_at ? 'var(--amber)' : 'var(--faint)' },
              { label:'Next renewal', value: upcomingInvoice?.period_end ? formatStripeDate(upcomingInvoice.period_end) : 'Not available', tone: upcomingInvoice?.period_end ? 'var(--green)' : 'var(--faint)' },
              { label:'Latest invoice', value: latestInvoice ? `${latestInvoice.number || latestInvoice.id}` : 'None yet', tone: latestInvoice ? 'var(--blue)' : 'var(--faint)' },
            ].map(item => (
              <div key={item.label} className="detail-card">
                <div style={{ fontSize:12, color:'var(--faint)', textTransform:'uppercase', letterSpacing:'0.08em' }}>{item.label}</div>
                <div style={{ fontSize:18, fontWeight:700, color:item.tone, marginTop:8 }}>{item.value}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="card card-pad">
          <div className="section-head">
            <div>
              <h3 className="panel-title">Available plans</h3>
              <div className="panel-sub">Choose the level of access the workspace should graduate to</div>
            </div>
          </div>
          <div style={{ fontSize: 12, color: 'var(--faint)', marginBottom: 14 }}>
            {hasSubscription
              ? 'Your live Stripe subscription is active. Switching plan updates the recurring amount for future renewals.'
              : 'Choose a plan, then send the workspace owner through Stripe Checkout to collect the first month immediately and start recurring billing.'}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            {Object.entries(PLANS).map(([key, p]) => (
              <div key={key} className="detail-card" style={{ border: `2px solid ${tenant?.plan === key ? 'var(--blue)' : 'var(--border)'}`, background: tenant?.plan === key ? 'linear-gradient(180deg, rgba(53,103,200,0.12), rgba(255,255,255,0.92))' : 'rgba(255,255,255,0.78)' }}>
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
                  : !hasSubscription
                    ? <button className="btn btn-outline btn-sm" style={{ width: '100%', justifyContent: 'center', marginTop: 4 }} onClick={() => startBillingFlow(key)} disabled={loadingBilling}>
                        {loadingBilling ? 'Starting checkout...' : 'Checkout with this plan'}
                      </button>
                    : <button className="btn btn-outline btn-sm" style={{ width: '100%', justifyContent: 'center', marginTop: 4 }} onClick={() => switchPlan(key)} disabled={!!switchingPlan}>
                        {switchingPlan === key ? 'Saving...' : hasSubscription ? 'Switch plan' : 'Activate plan'}
                      </button>}
              </div>
            ))}
          </div>
        </div>

        <div className="card card-pad">
          <div className="section-head">
            <div>
              <h3 className="panel-title">Current access</h3>
              <div className="panel-sub">What this plan already unlocks across HR, CRM, and admin</div>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            {Object.entries(FEATURE_LABELS).map(([feature, label]) => (
              <div key={feature} className="detail-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: currentFeatures.has(feature) ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.55)' }}>
                <span style={{ fontSize: 13, color: 'var(--text)' }}>{label}</span>
                <span className={`badge ${currentFeatures.has(feature) ? 'badge-green' : 'badge-grey'}`} style={{ fontSize: 10 }}>
                  {currentFeatures.has(feature) ? 'Included' : 'Upgrade'}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
      </>
      )}
    </div>
  )
}
