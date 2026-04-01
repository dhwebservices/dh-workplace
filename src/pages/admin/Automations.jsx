import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { canManageWorkspaceSettings } from '../../utils/permissions'
import { sbGetMany, sbInsert, sbUpdate, supabase } from '../../utils/supabase'

const WORKER_URL = import.meta.env.VITE_WORKER_URL

const RULES = [
  {
    key: 'invite_follow_up',
    title: 'Invite follow-up',
    description: 'Remind workspace admins when invited team members have not joined yet.',
    channels: ['in_app', 'email'],
    defaultChannels: ['in_app'],
    metricLabel: 'Pending invites',
  },
  {
    key: 'leave_approval',
    title: 'Leave approvals',
    description: 'Remind managers and admins about leave requests awaiting approval.',
    channels: ['in_app', 'email'],
    defaultChannels: ['in_app', 'email'],
    metricLabel: 'Pending leave requests',
  },
  {
    key: 'timesheet_approval',
    title: 'Timesheet approvals',
    description: 'Nudge reviewers when submitted time entries are still pending.',
    channels: ['in_app', 'email'],
    defaultChannels: ['in_app'],
    metricLabel: 'Pending timesheets',
  },
  {
    key: 'trial_ending',
    title: 'Trial ending',
    description: 'Send a commercial reminder before a workspace trial ends.',
    channels: ['email'],
    defaultChannels: ['email'],
    metricLabel: 'Days left',
    thresholdLabel: 'Send when trial has this many days left',
  },
  {
    key: 'billing_attention',
    title: 'Billing attention',
    description: 'Warn the workspace owner when billing needs attention or the account is overdue.',
    channels: ['email', 'in_app'],
    defaultChannels: ['email'],
    metricLabel: 'Billing state',
    thresholdLabel: 'Grace threshold (days)',
  },
]

function nextRunFromCadence(cadence) {
  const date = new Date()
  date.setDate(date.getDate() + (cadence === 'weekly' ? 7 : 1))
  return date.toISOString()
}

export default function Automations() {
  const { tenant, tenantUser } = useAuth()
  const canManage = canManageWorkspaceSettings(tenantUser?.role)
  const [loading, setLoading] = useState(true)
  const [savingKey, setSavingKey] = useState('')
  const [runningKey, setRunningKey] = useState('')
  const [schemaReady, setSchemaReady] = useState(true)
  const [rules, setRules] = useState([])
  const [metrics, setMetrics] = useState({
    pendingInvites: 0,
    pendingLeave: 0,
    pendingTimesheets: 0,
    daysLeft: 0,
    billingState: 'Healthy',
  })

  useEffect(() => { load() }, [tenant?.id])

  const load = async () => {
    if (!tenant?.id) return
    setLoading(true)
    try {
      const [ruleRows, inviteRows, leaveRows, timesheetRows] = await Promise.all([
        sbGetMany('automation_rules', `tenant_id=eq.${tenant.id}&order=created_at.asc`),
        sbGetMany('invitations', `tenant_id=eq.${tenant.id}&accepted_at=is.null`),
        sbGetMany('leave_requests', `tenant_id=eq.${tenant.id}&status=eq.pending`),
        sbGetMany('timesheets', `tenant_id=eq.${tenant.id}&status=eq.pending`),
      ])
      setRules(ruleRows || [])
      setMetrics({
        pendingInvites: (inviteRows || []).length,
        pendingLeave: (leaveRows || []).length,
        pendingTimesheets: (timesheetRows || []).length,
        daysLeft: tenant?.trial_ends_at ? Math.max(0, Math.ceil((new Date(tenant.trial_ends_at) - new Date()) / 86400000)) : 0,
        billingState: tenant?.status === 'overdue' ? 'Overdue' : tenant?.stripe_subscription_id || tenant?.gc_subscription_id ? 'Active' : 'Needs setup',
      })
      setSchemaReady(true)
    } catch (e) {
      console.error(e)
      setSchemaReady(false)
      setRules([])
    }
    setLoading(false)
  }

  const ruleMap = useMemo(() => Object.fromEntries(rules.map((rule) => [rule.rule_type, rule])), [rules])

  const cards = RULES.map((definition) => {
    const existing = ruleMap[definition.key]
    return {
      ...definition,
      id: existing?.id || null,
      enabled: existing?.enabled ?? false,
      cadence: existing?.cadence || 'daily',
      channels: existing?.channels?.length ? existing.channels : definition.defaultChannels,
      threshold_days: existing?.threshold_days ?? (definition.key === 'trial_ending' ? 3 : 7),
      last_run_at: existing?.last_run_at || null,
      next_run_at: existing?.next_run_at || null,
    }
  })

  const saveRule = async (card) => {
    setSavingKey(card.key)
    try {
      const payload = {
        tenant_id: tenant.id,
        rule_type: card.key,
        enabled: card.enabled,
        cadence: card.cadence,
        channels: card.channels,
        threshold_days: Number(card.threshold_days || 0),
        next_run_at: card.enabled ? nextRunFromCadence(card.cadence) : null,
        updated_at: new Date().toISOString(),
        created_by: tenantUser?.id || null,
      }
      if (card.id) {
        await sbUpdate('automation_rules', `id=eq.${card.id}`, payload)
      } else {
        await sbInsert('automation_rules', { ...payload, created_at: new Date().toISOString() })
      }
      await load()
    } catch (e) {
      alert(e.message)
    }
    setSavingKey('')
  }

  const runRule = async (card) => {
    if (!WORKER_URL) {
      alert('VITE_WORKER_URL is not configured')
      return
    }
    setRunningKey(card.key)
    try {
      const { data } = await supabase.auth.getSession()
      const token = data?.session?.access_token
      if (!token) throw new Error('You need an active session to run an automation.')
      const res = await fetch(WORKER_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          type: 'automation_run',
          data: {
            tenant_id: tenant.id,
            rule_type: card.key,
          },
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Automation run failed')
      await load()
      alert(`Automation sent ${json.notifications_sent || 0} notification${json.notifications_sent === 1 ? '' : 's'}${json.emails_sent ? ` and ${json.emails_sent} email${json.emails_sent === 1 ? '' : 's'}` : ''}.`)
    } catch (e) {
      alert(e.message)
    }
    setRunningKey('')
  }

  const patchCard = (key, updater) => {
    setRules((prev) => {
      const existing = prev.find((item) => item.rule_type === key)
      if (!existing) {
        return [
          ...prev,
          updater({
            rule_type: key,
            enabled: false,
            cadence: 'daily',
            channels: RULES.find((item) => item.key === key)?.defaultChannels || ['in_app'],
            threshold_days: key === 'trial_ending' ? 3 : 7,
          }),
        ]
      }
      return prev.map((item) => (item.rule_type === key ? updater(item) : item))
    })
  }

  const liveCard = (definition) => {
    const existing = ruleMap[definition.key]
    return existing ? {
      ...definition,
      ...existing,
      key: definition.key,
      title: definition.title,
      description: definition.description,
      metricLabel: definition.metricLabel,
      thresholdLabel: definition.thresholdLabel,
      channels: existing.channels?.length ? existing.channels : definition.defaultChannels,
    } : {
      ...definition,
      id: null,
      enabled: false,
      cadence: 'daily',
      channels: definition.defaultChannels,
      threshold_days: definition.key === 'trial_ending' ? 3 : 7,
      last_run_at: null,
      next_run_at: null,
    }
  }

  if (!canManage) return <div className="card card-pad"><p style={{color:'var(--faint)'}}>Owner access required.</p></div>

  return (
    <div className="fade-in page-stack">
      <div className="page-hd">
        <div>
          <h1 className="page-title">Automations</h1>
          <p className="page-sub">Scheduled reminders for joins, approvals, trials, and billing attention</p>
        </div>
      </div>

      {!schemaReady && (
        <div className="card card-pad">
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>Automation schema not ready yet</div>
          <div style={{ fontSize: 13, color: 'var(--sub)' }}>Run the new `automation_rules` SQL before configuring scheduled reminders.</div>
        </div>
      )}

      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
        <div className="stat-card"><div className="stat-val" style={{ color: 'var(--blue)' }}>{metrics.pendingInvites}</div><div className="stat-lbl">Pending invites</div></div>
        <div className="stat-card"><div className="stat-val" style={{ color: 'var(--red)' }}>{metrics.pendingLeave}</div><div className="stat-lbl">Pending leave</div></div>
        <div className="stat-card"><div className="stat-val" style={{ color: 'var(--amber)' }}>{metrics.pendingTimesheets}</div><div className="stat-lbl">Pending timesheets</div></div>
        <div className="stat-card"><div className="stat-val" style={{ color: 'var(--green)' }}>{metrics.billingState}</div><div className="stat-lbl">Billing state</div></div>
      </div>

      <div className="compact-note">These rules can be run manually now, and they are stored with next-run timing so they are ready for scheduled execution later.</div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {(loading ? RULES : RULES.map(liveCard)).map((card) => (
          <div key={card.key} className="card card-pad">
            {loading ? (
              <div style={{ display: 'grid', gap: 12 }}>
                <div className="skel" style={{ height: 18, borderRadius: 8 }} />
                <div className="skel" style={{ height: 14, borderRadius: 8 }} />
                <div className="skel" style={{ height: 120, borderRadius: 12 }} />
              </div>
            ) : (
              <>
                <div className="section-head">
                  <div>
                    <h3 className="panel-title">{card.title}</h3>
                    <div className="panel-sub">{card.description}</div>
                  </div>
                  <span className={`badge badge-${card.enabled ? 'green' : 'grey'}`}>{card.enabled ? 'Enabled' : 'Disabled'}</span>
                </div>

                <div className="detail-row">
                  <span className="detail-row-label">{card.metricLabel}</span>
                  <span className="detail-row-value">
                    {card.key === 'invite_follow_up' && metrics.pendingInvites}
                    {card.key === 'leave_approval' && metrics.pendingLeave}
                    {card.key === 'timesheet_approval' && metrics.pendingTimesheets}
                    {card.key === 'trial_ending' && `${metrics.daysLeft} day${metrics.daysLeft === 1 ? '' : 's'}`}
                    {card.key === 'billing_attention' && metrics.billingState}
                  </span>
                </div>

                <div className="fg" style={{ marginTop: 16 }}>
                  <div>
                    <label className="lbl">Status</label>
                    <select className="inp" value={card.enabled ? 'enabled' : 'disabled'} onChange={(e) => patchCard(card.key, (current) => ({ ...current, enabled: e.target.value === 'enabled' }))}>
                      <option value="enabled">Enabled</option>
                      <option value="disabled">Disabled</option>
                    </select>
                  </div>
                  <div>
                    <label className="lbl">Cadence</label>
                    <select className="inp" value={card.cadence} onChange={(e) => patchCard(card.key, (current) => ({ ...current, cadence: e.target.value }))}>
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                    </select>
                  </div>
                  <div className="fc">
                    <label className="lbl">Channels</label>
                    <div className="filter-pills">
                      {card.channels.includes('in_app') ? (
                        <button className="btn btn-sm btn-primary" onClick={() => patchCard(card.key, (current) => ({ ...current, channels: current.channels.filter((channel) => channel !== 'in_app') }))}>In-app</button>
                      ) : (
                        <button className="btn btn-sm btn-outline" onClick={() => patchCard(card.key, (current) => ({ ...current, channels: [...new Set([...(current.channels || []), 'in_app'])] }))}>In-app</button>
                      )}
                      {card.channels.includes('email') ? (
                        <button className="btn btn-sm btn-primary" onClick={() => patchCard(card.key, (current) => ({ ...current, channels: current.channels.filter((channel) => channel !== 'email') }))}>Email</button>
                      ) : (
                        <button className="btn btn-sm btn-outline" onClick={() => patchCard(card.key, (current) => ({ ...current, channels: [...new Set([...(current.channels || []), 'email'])] }))}>Email</button>
                      )}
                    </div>
                  </div>
                  <div>
                    <label className="lbl">{card.thresholdLabel || 'Reminder threshold (days)'}</label>
                    <input className="inp" type="number" min="0" value={card.threshold_days || 0} onChange={(e) => patchCard(card.key, (current) => ({ ...current, threshold_days: Number(e.target.value) }))} />
                  </div>
                  <div>
                    <label className="lbl">Next run</label>
                    <input className="inp" value={card.next_run_at ? new Date(card.next_run_at).toLocaleString('en-GB') : 'Not scheduled yet'} readOnly />
                  </div>
                </div>

                <div className="modal-ft" style={{ padding: 0, borderTop: 'none', marginTop: 18, justifyContent: 'space-between' }}>
                  <div className="compact-note">
                    Last run: {card.last_run_at ? new Date(card.last_run_at).toLocaleString('en-GB') : 'Never'}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-outline btn-sm" onClick={() => runRule(card)} disabled={runningKey === card.key || !schemaReady}>
                      {runningKey === card.key ? 'Running...' : 'Run now'}
                    </button>
                    <button className="btn btn-primary btn-sm" onClick={() => saveRule(card)} disabled={savingKey === card.key || !schemaReady}>
                      {savingKey === card.key ? 'Saving...' : 'Save rule'}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
