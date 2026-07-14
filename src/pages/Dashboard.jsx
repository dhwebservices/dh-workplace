import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { sbGetMany } from '../utils/supabase'
import PortalPreferencesEditor from '../components/portal/PortalPreferencesEditor'
import {
  DASHBOARD_SECTIONS,
  QUICK_ACTION_OPTIONS,
  applyPortalAppearance,
  savePortalPreferences,
  sanitizePortalPreferences,
} from '../utils/portalPreferences'

function formatDate(value) {
  return new Date(value).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

export default function Dashboard() {
  const location = useLocation()
  const { tenant, tenantUser, employeeRecord, employeePermissions, portalPreferences, setPortalPreferences, refreshTenant } = useAuth()
  const [stats, setStats] = useState({ staff: 0, clients: 0, tasks: 0, leaves: 0, unread: 0 })
  const [signals, setSignals] = useState({
    onboarding: 0,
    overdueInvoices: 0,
    policies: 0,
    unapprovedTimesheets: 0,
    urgentAlerts: 0,
    highPriorityTasks: 0,
    todayAppointments: 0,
    staffingGaps: 0,
  })
  const [loading, setLoading] = useState(true)
  const [personaliseOpen, setPersonaliseOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [draftPreferences, setDraftPreferences] = useState(portalPreferences)
  const [permissionError, setPermissionError] = useState(location.state?.error || null)

  useEffect(() => {
    setDraftPreferences(portalPreferences)
  }, [portalPreferences])

  useEffect(() => {
    if (!tenant?.id || !tenantUser?.id) return
    const tid = `tenant_id=eq.${tenant.id}`
    const today = new Date()
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    const endOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999)
    const weekStart = new Date(startOfToday)
    const day = weekStart.getDay()
    const diff = day === 0 ? -6 : 1 - day
    weekStart.setDate(weekStart.getDate() + diff)
    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekEnd.getDate() + 6)
    weekEnd.setHours(23, 59, 59, 999)
    Promise.all([
      sbGetMany('tenant_users', tid),
      sbGetMany('employees', `${tid}`),
      sbGetMany('hr_profiles', `${tid}`),
      sbGetMany('clients', tid),
      sbGetMany('tasks', `${tid}&status=neq.done`),
      sbGetMany('leave_requests', `${tid}&status=eq.pending`),
      sbGetMany('notifications', `${tid}&tenant_user_id=eq.${tenantUser.id}&read=is.false`),
      sbGetMany('notifications', `${tid}&read=is.false&is_urgent=is.true`),
      sbGetMany('invoices', `${tid}&status=in.(unpaid,overdue)`),
      sbGetMany('document_acknowledgements', `${tid}`),
      sbGetMany('documents', `${tid}&requires_acknowledgement=is.true`),
      sbGetMany('timesheets', `${tid}&status=eq.pending`),
      sbGetMany('staff_schedule_entries', `${tid}&entry_date=gte.${weekStart.toISOString().split('T')[0]}&entry_date=lte.${weekEnd.toISOString().split('T')[0]}`),
      sbGetMany('appointments', `${tid}&starts_at=gte.${encodeURIComponent(startOfToday.toISOString())}&starts_at=lte.${encodeURIComponent(endOfToday.toISOString())}`),
    ]).then(([staff, employees, hrProfiles, clients, tasks, leaves, unread, urgentUnread, invoices, acknowledgements, requiredDocuments, pendingTimesheets, scheduleEntries, appointments]) => {
      setStats({
        staff: staff.length,
        clients: clients.length,
        tasks: tasks.length,
        leaves: leaves.length,
        unread: unread.length,
      })
      const invited = (staff || []).filter((member) => member.status === 'invited').length
      const expectedAcks = (requiredDocuments || []).length * Math.max((staff || []).filter((member) => member.status === 'active').length, 1)
      const activeEmployees = (employees || []).filter((employee) => employee.is_person && !employee.is_shared_mailbox && employee.status === 'active')
      const hrByEmployee = new Map((hrProfiles || []).filter((profile) => profile.employee_id).map((profile) => [profile.employee_id, profile]))
      const incompletePeople = activeEmployees.filter((employee) => {
        const profile = hrByEmployee.get(employee.id)
        if (!profile) return true
        return [profile.contract_type, profile.start_date, profile.phone].some((value) => !value)
      }).length
      const highPriorityTasks = (tasks || []).filter((task) => ['high', 'urgent'].includes(task.priority)).length
      const staffedToday = new Set((scheduleEntries || []).filter((entry) => entry.is_available).map((entry) => entry.employee_id)).size
      setSignals({
        onboarding: invited,
        overdueInvoices: (invoices || []).length,
        policies: Math.max(expectedAcks - (acknowledgements || []).length, 0),
        unapprovedTimesheets: (pendingTimesheets || []).length,
        urgentAlerts: (urgentUnread || []).length,
        highPriorityTasks,
        todayAppointments: (appointments || []).length,
        staffingGaps: Math.max(activeEmployees.length - staffedToday, 0) + incompletePeople,
      })
      setLoading(false)
    })
  }, [tenant?.id, tenantUser?.id])

  const selfStaffPaths = useMemo(() => (
    [employeeRecord?.id, employeeRecord?.tenant_user_id, tenantUser?.id]
      .filter(Boolean)
      .map((identifier) => `/staff/${identifier}`)
  ), [employeeRecord?.id, employeeRecord?.tenant_user_id, tenantUser?.id])

  const preferences = useMemo(() => (
    sanitizePortalPreferences(draftPreferences || portalPreferences || {}, {
      permissionRecord: employeePermissions,
      fallbackRole: tenantUser?.role,
      selfStaffPaths,
    })
  ), [draftPreferences, portalPreferences, employeePermissions, tenantUser?.role, selfStaffPaths])

  const greeting = new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 17 ? 'Good afternoon' : 'Good evening'
  const hasSubscription = Boolean(tenant?.stripe_subscription_id || tenant?.gc_subscription_id)

  const quickActions = QUICK_ACTION_OPTIONS.filter((action) => preferences.pinned_quick_actions.includes(action.id))
  const orderedSections = preferences.dashboard_section_order
    .filter((sectionId) => preferences.visible_dashboard_sections.includes(sectionId))
    .map((sectionId) => DASHBOARD_SECTIONS.find((section) => section.id === sectionId))
    .filter(Boolean)

  const sectionContent = {
    today: (
      <div className="card card-pad">
        <div className="section-head">
          <div>
            <h3 className="panel-title">Today at a glance</h3>
            <div className="panel-sub">The operational signals most likely to need attention before the day gets away from you.</div>
          </div>
        </div>
        <div className="detail-grid">
          <Link to="/notifications" className="detail-card" style={{ textDecoration: 'none' }}>
            <div className="detail-card-value">{stats.unread}</div>
            <div className="detail-card-label">Unread alerts</div>
          </Link>
          <Link to="/notifications" className="detail-card" style={{ textDecoration: 'none' }}>
            <div className="detail-card-value">{signals.urgentAlerts}</div>
            <div className="detail-card-label">Urgent notifications</div>
          </Link>
          <Link to="/leave" className="detail-card" style={{ textDecoration: 'none' }}>
            <div className="detail-card-value">{stats.leaves}</div>
            <div className="detail-card-label">Pending approvals</div>
          </Link>
          <Link to="/appointments" className="detail-card" style={{ textDecoration: 'none' }}>
            <div className="detail-card-value">{signals.todayAppointments}</div>
            <div className="detail-card-label">Appointments today</div>
          </Link>
          <Link to="/schedule" className="detail-card" style={{ textDecoration: 'none' }}>
            <div className="detail-card-value">{signals.staffingGaps}</div>
            <div className="detail-card-label">Staffing and HR gaps</div>
          </Link>
          <Link to="/tasks" className="detail-card" style={{ textDecoration: 'none' }}>
            <div className="detail-card-value">{signals.highPriorityTasks}</div>
            <div className="detail-card-label">High-priority tasks</div>
          </Link>
        </div>
      </div>
    ),
    metrics: (
      <div className="stats-grid">
        {[
          { label: 'Team Members', val: stats.staff, link: '/staff', colour: 'var(--blue)' },
          { label: 'Active Clients', val: stats.clients, link: '/clients', colour: 'var(--green)' },
          { label: 'Open Tasks', val: stats.tasks, link: '/tasks', colour: 'var(--amber)' },
          { label: 'Pending Leave', val: stats.leaves, link: '/leave', colour: 'var(--red)' },
        ].map((item) => (
          <Link key={item.label} to={item.link} style={{ textDecoration: 'none' }}>
            <div className="stat-card interactive-card">
              {loading
                ? <div className="skel" style={{ width: 48, height: 40, marginBottom: 8 }} />
                : <div className="stat-val" style={{ color: item.colour }}>{item.val}</div>}
              <div className="stat-lbl">{item.label}</div>
            </div>
          </Link>
        ))}
      </div>
    ),
    quick_actions: (
      <div className="card card-pad">
        <div className="section-head">
          <div>
            <h3 className="panel-title">Pinned quick actions</h3>
            <div className="panel-sub">The shortcuts this user wants surfaced first when they land in the workspace.</div>
          </div>
        </div>
        <div className="portal-quick-grid">
          {quickActions.map((action) => (
            <Link key={action.id} to={action.path} className="detail-card portal-shortcut-card" style={{ textDecoration: 'none' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{action.label}</div>
              <div className="detail-card-label">Open {action.label.toLowerCase()}</div>
            </Link>
          ))}
        </div>
      </div>
    ),
    workspace: (
      <div className="card card-pad">
        <div className="section-head">
          <div>
            <h3 className="panel-title">Workspace summary</h3>
            <div className="panel-sub">Commercial and operational readiness for the current workspace.</div>
          </div>
        </div>
        <div className="stack-md">
          <div className="detail-row">
            <span className="detail-row-label">Plan</span>
            <span className="badge badge-blue" style={{ textTransform: 'capitalize' }}>{tenant?.plan || 'starter'}</span>
          </div>
          <div className="detail-row">
            <span className="detail-row-label">Status</span>
            <span className={`badge badge-${tenant?.status === 'active' ? 'green' : tenant?.status === 'pending_activation' ? 'amber' : 'amber'}`} style={{ textTransform: 'capitalize' }}>
              {tenant?.status === 'pending_activation' ? 'Pending activation' : tenant?.status}
            </span>
          </div>
          <div className="detail-row">
            <span className="detail-row-label">Seat limit</span>
            <span className="detail-row-value">{stats.staff} / {tenant?.seat_limit || 5} used</span>
          </div>
          <div className="detail-row">
            <span className="detail-row-label">Billing</span>
            <span className="detail-row-value">{hasSubscription ? 'Subscription live' : tenant?.status === 'pending_activation' ? 'Activation needed' : 'Action needed'}</span>
          </div>
          <div className="detail-row">
            <span className="detail-row-label">Default landing</span>
            <span className="detail-row-value">{preferences.default_landing_page.replace('_', ' ')}</span>
          </div>
        </div>
      </div>
    ),
    signals: (
      <div className="card card-pad">
        <div className="section-head">
          <div>
            <h3 className="panel-title">Operational signals</h3>
            <div className="panel-sub">Unread alerts, approvals, onboarding pressure, and compliance signals surfaced together.</div>
          </div>
        </div>
        <div className="detail-grid">
          <div className="detail-card">
            <div className="detail-card-value">{stats.unread}</div>
            <div className="detail-card-label">Unread alerts</div>
          </div>
          <div className="detail-card">
            <div className="detail-card-value">{signals.urgentAlerts}</div>
            <div className="detail-card-label">Urgent notifications</div>
          </div>
          <div className="detail-card">
            <div className="detail-card-value">{stats.tasks}</div>
            <div className="detail-card-label">Open tasks</div>
          </div>
          <div className="detail-card">
            <div className="detail-card-value">{stats.leaves}</div>
            <div className="detail-card-label">Pending approvals</div>
          </div>
          <div className="detail-card">
            <div className="detail-card-value">{signals.onboarding}</div>
            <div className="detail-card-label">Onboarding still open</div>
          </div>
          <div className="detail-card">
            <div className="detail-card-value">{signals.overdueInvoices}</div>
            <div className="detail-card-label">Outstanding invoices</div>
          </div>
          <div className="detail-card">
            <div className="detail-card-value">{signals.policies}</div>
            <div className="detail-card-label">Policy acknowledgements missing</div>
          </div>
          <div className="detail-card">
            <div className="detail-card-value">{signals.unapprovedTimesheets}</div>
            <div className="detail-card-label">Timesheets awaiting review</div>
          </div>
          <div className="detail-card">
            <div className="detail-card-value">{signals.todayAppointments}</div>
            <div className="detail-card-label">Appointments today</div>
          </div>
          <div className="detail-card">
            <div className="detail-card-value">{signals.highPriorityTasks}</div>
            <div className="detail-card-label">Priority workload</div>
          </div>
          <div className="detail-card">
            <div className="detail-card-value">{signals.staffingGaps}</div>
            <div className="detail-card-label">Staffing / HR gaps</div>
          </div>
        </div>
      </div>
    ),
  }

  const closePersonalise = () => {
    setDraftPreferences(portalPreferences)
    applyPortalAppearance(portalPreferences, tenant?.primary_colour || null)
    setPersonaliseOpen(false)
  }

  const savePersonalisation = async () => {
    if (!tenant?.id || !employeeRecord?.id || !preferences) return
    setSaving(true)
    try {
      await savePortalPreferences({
        preferenceId: portalPreferences?.id,
        tenantId: tenant.id,
        employeeId: employeeRecord.id,
        values: preferences,
      })
      setPortalPreferences(preferences)
      await refreshTenant()
      setPersonaliseOpen(false)
    } catch (error) {
      alert(error.message)
    }
    setSaving(false)
  }

  return (
    <div className={`fade-in page-stack dashboard-shell dashboard-density-${preferences.dashboard_density}`}>
      <div className={`page-hd dashboard-hero ${preferences.dashboard_header_style === 'minimal' ? 'minimal' : ''}`}>
        <div>
          <h1 className="page-title">{greeting}{tenantUser?.full_name ? `, ${tenantUser.full_name.split(' ')[0]}` : ''}</h1>
          {preferences.dashboard_header_style === 'full' ? (
            <p className="page-sub">{formatDate(new Date())} · Your workspace opens to {preferences.default_landing_page.replace('_', ' ')} and keeps your preferred actions front and centre.</p>
          ) : (
            <p className="page-sub">{formatDate(new Date())}</p>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-outline btn-sm" onClick={() => setPersonaliseOpen(true)}>Personalise dashboard</button>
        </div>
      </div>

      {permissionError && (
        <div style={{
          padding: '14px 18px',
          background: 'var(--red-soft)',
          border: '1px solid var(--red-border)',
          borderRadius: '12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '20px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 20 }}>⚠️</span>
            <div>
              <div style={{ fontWeight: 600, color: 'var(--red)', marginBottom: 4 }}>Access Denied</div>
              <div style={{ fontSize: 13, color: 'var(--sub)' }}>{permissionError}</div>
            </div>
          </div>
          <button
            className="btn btn-sm btn-outline"
            onClick={() => setPermissionError(null)}
            style={{ borderColor: 'var(--red-border)', color: 'var(--red)' }}
          >
            Dismiss
          </button>
        </div>
      )}

      {orderedSections.map((section) => (
        <div key={section.id}>
          {sectionContent[section.id]}
        </div>
      ))}

      {personaliseOpen && (
        <div className="portal-modal-backdrop" onClick={closePersonalise}>
          <div className="portal-modal" onClick={(event) => event.stopPropagation()}>
            <PortalPreferencesEditor
              values={preferences}
              onChange={(next) => {
                const sanitized = sanitizePortalPreferences(next, {
                  permissionRecord: employeePermissions,
                  fallbackRole: tenantUser?.role,
                  selfStaffPaths,
                })
                setDraftPreferences(sanitized)
                applyPortalAppearance(sanitized, tenant?.primary_colour || null)
              }}
              permissionRecord={employeePermissions}
              fallbackRole={tenantUser?.role}
              selfStaffPaths={selfStaffPaths}
              heading="Personalise dashboard"
              subtitle="Preview your portal shell, tune the dashboard, and choose where the app lands after login."
            />
            <div className="portal-modal-actions">
              <button className="btn btn-outline" onClick={closePersonalise}>Close</button>
              <button className="btn btn-primary" onClick={savePersonalisation} disabled={saving}>
                {saving ? 'Saving...' : 'Save changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
