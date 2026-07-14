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

    // Determine what data to load based on role
    const isStaff = tenantUser?.role === 'staff'
    const isManager = ['manager', 'admin', 'owner', 'superadmin'].includes(tenantUser?.role)
    const isAdmin = ['admin', 'owner', 'superadmin'].includes(tenantUser?.role)

    const queries = [
      sbGetMany('notifications', `${tid}&tenant_user_id=eq.${tenantUser.id}&read=is.false`),
      sbGetMany('notifications', `${tid}&tenant_user_id=eq.${tenantUser.id}&read=is.false&is_urgent=is.true`),
    ]

    // Manager+ can see team and leave data
    if (isManager) {
      queries.push(
        sbGetMany('tenant_users', tid),
        sbGetMany('employees', `${tid}`),
        sbGetMany('hr_profiles', `${tid}`),
        sbGetMany('leave_requests', `${tid}&status=eq.pending`),
        sbGetMany('document_acknowledgements', `${tid}`),
        sbGetMany('documents', `${tid}&requires_acknowledgement=is.true`),
        sbGetMany('timesheets', `${tid}&status=eq.pending`),
        sbGetMany('staff_schedule_entries', `${tid}&entry_date=gte.${weekStart.toISOString().split('T')[0]}&entry_date=lte.${weekEnd.toISOString().split('T')[0]}`),
        sbGetMany('appointments', `${tid}&starts_at=gte.${encodeURIComponent(startOfToday.toISOString())}&starts_at=lte.${encodeURIComponent(endOfToday.toISOString())}`),
        sbGetMany('clients', tid),
        sbGetMany('tasks', `${tid}&status=neq.done`),
        sbGetMany('invoices', `${tid}&status=in.(unpaid,overdue)`)
      )
    } else {
      // Staff: load minimal data
      queries.push(
        Promise.resolve([]), // staff
        Promise.resolve([]), // employees
        Promise.resolve([]), // hrProfiles
        Promise.resolve([]), // leaves
        Promise.resolve([]), // acknowledgements
        Promise.resolve([]), // requiredDocuments
        Promise.resolve([]), // pendingTimesheets
        Promise.resolve([]), // scheduleEntries
        Promise.resolve([]), // appointments
        Promise.resolve([]), // clients
        Promise.resolve([]), // tasks
        Promise.resolve([])  // invoices
      )
    }

    Promise.all(queries).then(([unread, urgentUnread, staff, employees, hrProfiles, leaves, acknowledgements, requiredDocuments, pendingTimesheets, scheduleEntries, appointments, clients, tasks, invoices]) => {
      setStats({
        staff: isManager ? (staff || []).length : 0,
        clients: isManager ? (clients || []).length : 0,
        tasks: isManager ? (tasks || []).length : 0,
        leaves: isManager ? (leaves || []).length : 0,
        unread: (unread || []).length,
      })

      if (isManager) {
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
      } else {
        // Staff: minimal signals
        setSignals({
          onboarding: 0,
          overdueInvoices: 0,
          policies: 0,
          unapprovedTimesheets: 0,
          urgentAlerts: (urgentUnread || []).length,
          highPriorityTasks: 0,
          todayAppointments: 0,
          staffingGaps: 0,
        })
      }

      setLoading(false)
    })
  }, [tenant?.id, tenantUser?.id, tenantUser?.role])

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

  // Filter quick actions by role
  const managerOnlyActions = ['tasks', 'clients', 'reports']
  const quickActions = QUICK_ACTION_OPTIONS
    .filter((action) => preferences.pinned_quick_actions.includes(action.id))
    .filter((action) => {
      if (managerOnlyActions.includes(action.id)) {
        return ['manager', 'admin', 'owner', 'superadmin'].includes(tenantUser?.role)
      }
      return true
    })

  // Filter sections by role
  const isOwner = ['owner', 'superadmin'].includes(tenantUser?.role)
  const isManager = ['manager', 'admin', 'owner', 'superadmin'].includes(tenantUser?.role)

  const orderedSections = preferences.dashboard_section_order
    .filter((sectionId) => preferences.visible_dashboard_sections.includes(sectionId))
    .map((sectionId) => DASHBOARD_SECTIONS.find((section) => section.id === sectionId))
    .filter(Boolean)
    .filter((section) => {
      // "workspace" section is owner-only (shows billing, plan, etc.)
      if (section.id === 'workspace') return isOwner
      // "metrics" and "signals" are manager+
      if (section.id === 'metrics') return isManager
      if (section.id === 'signals') return isManager
      // "today" and "quick_actions" are available to all
      return true
    })

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
          {(() => {
            const isManager = ['manager', 'admin', 'owner', 'superadmin'].includes(tenantUser?.role)
            const cards = [
              { value: stats.unread, label: 'Unread alerts', link: '/notifications', minRole: 'staff' },
              { value: signals.urgentAlerts, label: 'Urgent notifications', link: '/notifications', minRole: 'staff' },
              { value: stats.leaves, label: 'Pending approvals', link: '/leave', minRole: 'manager' },
              { value: signals.todayAppointments, label: 'Appointments today', link: '/appointments', minRole: 'manager' },
              { value: signals.staffingGaps, label: 'Staffing and HR gaps', link: '/schedule', minRole: 'manager' },
              { value: signals.highPriorityTasks, label: 'High-priority tasks', link: '/tasks', minRole: 'manager' },
            ]

            return cards
              .filter(card => card.minRole === 'staff' || isManager)
              .map((card, i) => (
                <Link key={i} to={card.link} className="detail-card" style={{ textDecoration: 'none' }}>
                  <div className="detail-card-value">{card.value}</div>
                  <div className="detail-card-label">{card.label}</div>
                </Link>
              ))
          })()}
        </div>
      </div>
    ),
    metrics: (
      <div className="stats-grid">
        {(() => {
          const isManager = ['manager', 'admin', 'owner', 'superadmin'].includes(tenantUser?.role)
          const allMetrics = [
            { label: 'Team Members', val: stats.staff, link: '/staff', colour: 'var(--blue)', minRole: 'manager' },
            { label: 'Active Clients', val: stats.clients, link: '/clients', colour: 'var(--green)', minRole: 'manager' },
            { label: 'Open Tasks', val: stats.tasks, link: '/tasks', colour: 'var(--amber)', minRole: 'manager' },
            { label: 'Pending Leave', val: stats.leaves, link: '/leave', colour: 'var(--red)', minRole: 'manager' },
          ]

          const visibleMetrics = isManager
            ? allMetrics
            : [] // Staff see no metrics (or add staff-specific metrics here)

          return visibleMetrics.map((item) => (
            <Link key={item.label} to={item.link} style={{ textDecoration: 'none' }}>
              <div className="stat-card interactive-card">
                {loading
                  ? <div className="skel" style={{ width: 48, height: 40, marginBottom: 8 }} />
                  : <div className="stat-val" style={{ color: item.colour }}>{item.val}</div>}
                <div className="stat-lbl">{item.label}</div>
              </div>
            </Link>
          ))
        })()}
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
          {(() => {
            const isManager = ['manager', 'admin', 'owner', 'superadmin'].includes(tenantUser?.role)
            const allSignals = [
              { value: stats.unread, label: 'Unread alerts', minRole: 'staff' },
              { value: signals.urgentAlerts, label: 'Urgent notifications', minRole: 'staff' },
              { value: stats.tasks, label: 'Open tasks', minRole: 'manager' },
              { value: stats.leaves, label: 'Pending approvals', minRole: 'manager' },
              { value: signals.onboarding, label: 'Onboarding still open', minRole: 'manager' },
              { value: signals.overdueInvoices, label: 'Outstanding invoices', minRole: 'manager' },
              { value: signals.policies, label: 'Policy acknowledgements missing', minRole: 'manager' },
              { value: signals.unapprovedTimesheets, label: 'Timesheets awaiting review', minRole: 'manager' },
              { value: signals.todayAppointments, label: 'Appointments today', minRole: 'manager' },
              { value: signals.highPriorityTasks, label: 'Priority workload', minRole: 'manager' },
            ]

            return allSignals
              .filter(signal => signal.minRole === 'staff' || isManager)
              .map((signal, i) => (
                <div key={i} className="detail-card">
                  <div className="detail-card-value">{signal.value}</div>
                  <div className="detail-card-label">{signal.label}</div>
                </div>
              ))
          })()}
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
