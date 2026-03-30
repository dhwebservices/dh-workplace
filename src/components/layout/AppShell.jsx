import { useEffect, useMemo, useState } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { can, getTrialDaysLeft } from '../../utils/entitlements'
import { sbGetMany, sbUpdate, supabase } from '../../utils/supabase'

const NAV = [
  { label: 'Overview', group: null, items: [
    { to: '/', icon: '⊞', label: 'Dashboard' },
  ]},
  { label: 'HR', group: null, items: [
    { to: '/staff', icon: '👥', label: 'Staff Directory', feature: 'hr_directory' },
    { to: '/leave', icon: '📅', label: 'Leave', feature: 'hr_leave' },
    { to: '/documents', icon: '📁', label: 'Documents', feature: 'hr_documents' },
    { to: '/policies', icon: '📘', label: 'Policies', feature: 'hr_documents' },
    { to: '/timesheets', icon: '⏱', label: 'Timesheets', feature: 'hr_timesheets' },
    { to: '/onboarding-hr', icon: '🎓', label: 'Onboarding', feature: 'hr_onboarding' },
  ]},
  { label: 'Clients', group: null, items: [
    { to: '/clients', icon: '🏢', label: 'Clients', feature: 'crm_clients' },
    { to: '/tasks', icon: '✓', label: 'Tasks', feature: 'crm_tasks' },
    { to: '/pipeline', icon: '⟶', label: 'Pipeline', feature: 'crm_pipeline' },
    { to: '/outreach', icon: '📨', label: 'Outreach', feature: 'crm_outreach' },
  ]},
  { label: 'Settings', group: null, items: [
    { to: '/team', icon: '⚙', label: 'Team' },
    { to: '/billing', icon: '💳', label: 'Billing' },
    { to: '/settings', icon: '🔧', label: 'Settings' },
    { to: '/audit', icon: '📋', label: 'Audit Log', feature: 'audit_log' },
  ]},
]

const SUPER_NAV = [
  { label: 'Platform', group: null, items: [
    { to: '/superadmin', icon: '⊞', label: 'Overview' },
    { to: '/superadmin/tenants', icon: '🏢', label: 'Tenants' },
    { to: '/superadmin/billing', icon: '💳', label: 'Billing' },
  ]},
]

export default function AppShell({ superAdmin = false }) {
  const { tenant, tenantUser, signOut } = useAuth()
  const navigate = useNavigate()
  const trialDays = getTrialDaysLeft(tenant)
  const nav = superAdmin ? SUPER_NAV : NAV
  const [notifications, setNotifications] = useState([])
  const [notifOpen, setNotifOpen] = useState(false)
  const notificationsEnabled = !superAdmin && can(tenant, 'notifications')

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
        <div style={{ padding: '20px 16px 16px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, color: 'var(--text)' }}>DH Workplace</div>
          {tenant && !superAdmin && (
            <div style={{ fontSize: 11, color: 'var(--faint)', marginTop: 2, fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {tenant.name}
            </div>
          )}
          {superAdmin && <div style={{ fontSize: 11, color: 'var(--gold)', marginTop: 2, fontWeight: 600 }}>SUPER ADMIN</div>}
        </div>

        {!superAdmin && tenant?.status === 'trialing' && trialDays <= 7 && (
          <div style={{ margin: '8px', padding: '10px 12px', background: 'var(--amber-soft)', border: '1px solid var(--amber)', borderRadius: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--amber)' }}>
              {trialDays === 0 ? 'Trial expired' : `${trialDays} day${trialDays !== 1 ? 's' : ''} left in trial`}
            </div>
            <button onClick={() => navigate('/billing')} style={{ fontSize: 11, color: 'var(--amber)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginTop: 2, textDecoration: 'underline' }}>
              Set up billing →
            </button>
          </div>
        )}

        <div style={{ flex: 1, overflow: 'auto', padding: '8px 0' }}>
          {nav.map(section => (
            <div key={section.label} className="nav-section">
              <div className="nav-label">{section.label}</div>
              {section.items.map(item => {
                const locked = item.feature && !can(tenant, item.feature)
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === '/' || item.to === '/superadmin'}
                    className={({ isActive }) => `nav-item ${isActive ? 'active' : ''} ${locked ? 'locked' : ''}`}
                    style={locked ? { opacity: 0.4, pointerEvents: 'none' } : {}}
                    title={locked ? 'Upgrade to access this feature' : item.label}
                  >
                    <span style={{ fontSize: 14 }}>{item.icon}</span>
                    {item.label}
                    {locked && <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--faint)' }}>↑</span>}
                  </NavLink>
                )
              })}
            </div>
          ))}
        </div>

        <div style={{ padding: '12px 8px', borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8 }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--blue-soft)', border: '1px solid var(--blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 600, color: 'var(--blue)', flexShrink: 0 }}>
              {(tenantUser?.full_name || tenantUser?.email || '?')[0].toUpperCase()}
            </div>
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {tenantUser?.full_name || tenantUser?.email}
              </div>
              <div style={{ fontSize: 11, color: 'var(--faint)', textTransform: 'capitalize' }}>{tenantUser?.role}</div>
            </div>
            <button onClick={signOut} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--faint)', fontSize: 12, padding: 4 }} title="Sign out">⏻</button>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <div className="topbar">
          <div />
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
        <div className="page-body">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
