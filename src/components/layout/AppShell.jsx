import { useEffect, useMemo, useState } from 'react'
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { PLANS, can, getTrialDaysLeft } from '../../utils/entitlements'
import { sbGetMany, sbUpdate, supabase } from '../../utils/supabase'

const NAV = [
  { label: 'Overview', items: [
    { to: '/', icon: '⊞', label: 'Dashboard' },
  ]},
  { label: 'HR', items: [
    { to: '/staff', icon: '👥', label: 'Staff Directory', feature: 'hr_directory' },
    { to: '/leave', icon: '📅', label: 'Leave', feature: 'hr_leave' },
    { to: '/documents', icon: '📁', label: 'Documents', feature: 'hr_documents' },
    { to: '/policies', icon: '📘', label: 'Policies', feature: 'hr_documents' },
    { to: '/timesheets', icon: '⏱', label: 'Timesheets', feature: 'hr_timesheets' },
    { to: '/onboarding-hr', icon: '🎓', label: 'Onboarding', feature: 'hr_onboarding' },
  ]},
  { label: 'Clients', items: [
    { to: '/clients', icon: '🏢', label: 'Clients', feature: 'crm_clients' },
    { to: '/tasks', icon: '✓', label: 'Tasks', feature: 'crm_tasks' },
    { to: '/pipeline', icon: '⟶', label: 'Pipeline', feature: 'crm_pipeline' },
    { to: '/outreach', icon: '📨', label: 'Outreach', feature: 'crm_outreach' },
  ]},
  { label: 'Settings', items: [
    { to: '/team', icon: '⚙', label: 'Team' },
    { to: '/billing', icon: '💳', label: 'Billing' },
    { to: '/settings', icon: '🔧', label: 'Settings' },
    { to: '/audit', icon: '📋', label: 'Audit Log', feature: 'audit_log' },
  ]},
]

const SUPER_NAV = [
  { label: 'Platform', items: [
    { to: '/superadmin', icon: '⊞', label: 'Overview' },
    { to: '/superadmin/tenants', icon: '🏢', label: 'Tenants' },
    { to: '/superadmin/billing', icon: '💳', label: 'Billing' },
  ]},
]

const PAGE_TITLES = {
  '/': 'Dashboard',
  '/staff': 'Staff Directory',
  '/leave': 'Leave',
  '/documents': 'Documents',
  '/policies': 'Policies',
  '/timesheets': 'Timesheets',
  '/onboarding-hr': 'Onboarding',
  '/clients': 'Clients',
  '/tasks': 'Tasks',
  '/pipeline': 'Pipeline',
  '/outreach': 'Outreach',
  '/team': 'Team',
  '/billing': 'Billing',
  '/settings': 'Settings',
  '/audit': 'Audit Log',
  '/superadmin': 'Platform',
  '/superadmin/tenants': 'Tenants',
  '/superadmin/billing': 'Billing',
}

export default function AppShell({ superAdmin = false }) {
  const { tenant, tenantUser, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const trialDays = getTrialDaysLeft(tenant)
  const [notifications, setNotifications] = useState([])
  const [notifOpen, setNotifOpen] = useState(false)

  const isTrial = tenant?.status === 'trialing'
  const isAdminUser = ['owner', 'admin', 'superadmin'].includes(tenantUser?.role)
  const plan = PLANS[tenant?.plan || 'starter']
  const notificationsEnabled = !superAdmin && can(tenant, 'notifications')

  const nav = useMemo(() => {
    const source = superAdmin ? SUPER_NAV : NAV
    if (superAdmin || isTrial) return source
    return source
      .map(section => ({
        ...section,
        items: section.items.filter(item => !item.feature || can(tenant, item.feature)),
      }))
      .filter(section => section.items.length > 0)
  }, [superAdmin, isTrial, tenant])

  const lockedFeatures = useMemo(() => {
    if (superAdmin || isTrial || !isAdminUser) return []
    return NAV
      .flatMap(section => section.items)
      .filter(item => item.feature && !can(tenant, item.feature))
  }, [superAdmin, isTrial, isAdminUser, tenant])

  useEffect(() => {
    if (!notificationsEnabled || !tenantUser?.id) return

    let active = true
    const loadNotifications = async () => {
      const data = await sbGetMany('notifications', `tenant_user_id=eq.${tenantUser.id}&order=created_at.desc`)
      if (active) setNotifications((data || []).slice(0, 12))
    }

    loadNotifications()

    const channel = supabase
      .channel(`notifications:${tenantUser.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'notifications',
        filter: `tenant_user_id=eq.${tenantUser.id}`,
      }, loadNotifications)
      .subscribe()

    return () => {
      active = false
      supabase.removeChannel(channel)
    }
  }, [notificationsEnabled, tenantUser?.id])

  const unreadCount = useMemo(() => notifications.filter(item => !item.read).length, [notifications])
  const pageTitle = PAGE_TITLES[location.pathname] || 'Workspace'

  const openNotification = async (notification) => {
    if (!notification.read) {
      await sbUpdate('notifications', `id=eq.${notification.id}`, { read: true })
      setNotifications(prev => prev.map(item => item.id === notification.id ? { ...item, read: true } : item))
    }
    setNotifOpen(false)
    if (notification.link) navigate(notification.link)
  }

  const markAllRead = async () => {
    const unread = notifications.filter(item => !item.read)
    if (unread.length === 0) return
    await Promise.all(unread.map(item => sbUpdate('notifications', `id=eq.${item.id}`, { read: true })))
    setNotifications(prev => prev.map(item => ({ ...item, read: true })))
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, color: 'var(--text)', lineHeight: 1.05 }}>DH Workplace</div>
          {tenant && !superAdmin && (
            <>
              <div className="sidebar-brand-name">{tenant.name}</div>
              <div className="sidebar-brand-meta">
                <span className="badge badge-blue" style={{ textTransform: 'capitalize' }}>{plan?.name || 'Starter'}</span>
                <span className={`badge badge-${isTrial ? 'amber' : tenant?.status === 'active' ? 'green' : 'red'}`} style={{ textTransform: 'capitalize' }}>
                  {isTrial ? 'Trial' : tenant?.status}
                </span>
              </div>
            </>
          )}
          {superAdmin && <div style={{ fontSize: 11, color: 'var(--gold)', marginTop: 6, fontWeight: 700, letterSpacing: '0.08em' }}>SUPER ADMIN</div>}
        </div>

        {!superAdmin && isTrial && (
          <div className="sidebar-callout">
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--amber)' }}>
              {trialDays === 0 ? 'Trial expires today' : `${trialDays} day${trialDays !== 1 ? 's' : ''} left in your trial`}
            </div>
            <div style={{ fontSize: 12, color: 'var(--sub)', marginTop: 4 }}>
              You can explore every feature during trial before choosing a plan.
            </div>
            <button onClick={() => navigate('/billing')} className="sidebar-callout-link">
              Compare plans →
            </button>
          </div>
        )}

        <div style={{ flex: 1, overflow: 'auto', padding: '10px 0' }}>
          {nav.map(section => (
            <div key={section.label} className="nav-section">
              <div className="nav-label">{section.label}</div>
              {section.items.map(item => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/' || item.to === '/superadmin'}
                  className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                >
                  <span className="nav-icon">{item.icon}</span>
                  {item.label}
                </NavLink>
              ))}
            </div>
          ))}

          {!superAdmin && lockedFeatures.length > 0 && (
            <div className="sidebar-upgrade">
              <div className="sidebar-upgrade-title">Unlock More With {tenant?.plan === 'starter' ? 'Growth' : 'Business'}</div>
              <div className="sidebar-upgrade-copy">
                {lockedFeatures.slice(0, 3).map(item => item.label).join(', ')}
                {lockedFeatures.length > 3 ? ` and ${lockedFeatures.length - 3} more` : ''}
              </div>
              <button className="btn btn-gold btn-sm" onClick={() => navigate('/billing')}>View plans</button>
            </div>
          )}
        </div>

        <div className="sidebar-user">
          <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--blue-soft)', border: '1px solid var(--blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: 'var(--blue)', flexShrink: 0 }}>
            {(tenantUser?.full_name || tenantUser?.email || '?')[0].toUpperCase()}
          </div>
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {tenantUser?.full_name || tenantUser?.email}
            </div>
            <div style={{ fontSize: 11, color: 'var(--faint)', textTransform: 'capitalize' }}>{tenantUser?.role}</div>
          </div>
          <button onClick={signOut} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--faint)', fontSize: 12, padding: 4 }} title="Sign out">⏻</button>
        </div>
      </aside>

      <main className="main-content">
        <div className="topbar">
          <div>
            <div className="topbar-title">{pageTitle}</div>
            <div className="topbar-sub">
              {superAdmin ? 'Platform management' : `${tenant?.name || 'Workspace'} · ${plan?.name || 'Starter'} Plan`}
            </div>
          </div>
          <div className="topbar-actions">
            {!superAdmin && (
              <button className="workspace-chip" onClick={() => navigate('/billing')}>
                <span>{isTrial ? 'Trial' : plan?.name || 'Starter'}</span>
                <span className="workspace-chip-arrow">→</span>
              </button>
            )}
            {notificationsEnabled && (
              <div className="notif-wrap">
                <button className="notif-btn" onClick={() => setNotifOpen(open => !open)} title="Notifications">
                  <span style={{ fontSize: 18 }}>🔔</span>
                  {unreadCount > 0 && <span className="notif-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>}
                </button>
                {notifOpen && (
                  <div className="notif-panel">
                    <div className="notif-head">
                      <span>Notifications</span>
                      <button onClick={markAllRead} disabled={unreadCount === 0}>Mark all read</button>
                    </div>
                    {notifications.length === 0 ? (
                      <div className="notif-empty">No notifications yet</div>
                    ) : (
                      <div className="notif-list">
                        {notifications.map(notification => (
                          <button key={notification.id} className={`notif-item ${notification.read ? 'read' : ''}`} onClick={() => openNotification(notification)}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                              <span className={`badge badge-${notification.type === 'success' ? 'green' : notification.type === 'warning' ? 'amber' : notification.type === 'error' ? 'red' : 'blue'}`} style={{ fontSize: 10 }}>
                                {notification.type}
                              </span>
                              {!notification.read && <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--blue)', display: 'inline-block' }} />}
                            </div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 3 }}>{notification.title}</div>
                            {notification.message && <div style={{ fontSize: 12, color: 'var(--sub)' }}>{notification.message}</div>}
                            <div style={{ fontSize: 11, color: 'var(--faint)', marginTop: 8 }}>
                              {new Date(notification.created_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="page-body">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
