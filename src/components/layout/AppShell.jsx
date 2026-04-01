import { useEffect, useMemo, useState } from 'react'
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { PLANS, can } from '../../utils/entitlements'
import { sbGetMany, sbUpdate, supabase } from '../../utils/supabase'
import { canManageBilling, canManageTeam, canManageWorkspaceSettings, canViewAudit, canViewReports } from '../../utils/permissions'

const NAV = [
  { label: 'Overview', items: [
    { to: '/', label: 'Dashboard' },
  ]},
  { label: 'HR', items: [
    { to: '/staff', label: 'Staff Directory', feature: 'hr_directory' },
    { to: '/leave', label: 'Leave', feature: 'hr_leave' },
    { to: '/documents', label: 'Documents', feature: 'hr_documents' },
    { to: '/policies', label: 'Policies', feature: 'hr_documents' },
    { to: '/timesheets', label: 'Timesheets', feature: 'hr_timesheets' },
    { to: '/onboarding-hr', label: 'Onboarding', feature: 'hr_onboarding' },
  ]},
  { label: 'Clients', items: [
    { to: '/clients', label: 'Clients', feature: 'crm_clients' },
    { to: '/tasks', label: 'Tasks', feature: 'crm_tasks' },
    { to: '/pipeline', label: 'Pipeline', feature: 'crm_pipeline' },
    { to: '/outreach', label: 'Outreach', feature: 'crm_outreach' },
  ]},
  { label: 'Settings', items: [
    { to: '/team', label: 'Team', permission: 'team' },
    { to: '/billing', label: 'Billing', permission: 'billing' },
    { to: '/reports', label: 'Reports', feature: 'reports' },
    { to: '/automations', label: 'Automations', permission: 'settings' },
    { to: '/settings', label: 'Settings', permission: 'settings' },
    { to: '/audit', label: 'Audit Log', feature: 'audit_log', permission: 'audit' },
    { to: '/integrations', label: 'Integrations', feature: 'api_access', permission: 'settings' },
  ]},
]

const SUPER_NAV = [
  { label: 'Platform', items: [
    { to: '/superadmin', label: 'Overview' },
    { to: '/superadmin/tenants', label: 'Tenants' },
    { to: '/superadmin/billing', label: 'Billing' },
    { to: '/superadmin/access', label: 'Platform Access' },
  ]},
]

export default function AppShell({ superAdmin = false }) {
  const { tenant, tenantUser, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [notifications, setNotifications] = useState([])
  const [notifOpen, setNotifOpen] = useState(false)

  const isTrial = tenant?.status === 'trialing'
  const isPendingActivation = tenant?.status === 'pending_activation'
  const isAdminUser = ['owner', 'admin', 'superadmin'].includes(tenantUser?.role)
  const plan = PLANS[tenant?.plan || 'starter']
  const notificationsEnabled = !superAdmin && can(tenant, 'notifications')
  const canSeePermissionItem = (item) => {
    if (superAdmin) return true
    const role = tenantUser?.role
    if (item.permission === 'team' && !canManageTeam(role)) return false
    if (item.permission === 'billing' && !canManageBilling(role)) return false
    if (item.permission === 'settings' && !canManageWorkspaceSettings(role)) return false
    if (item.permission === 'audit' && !canViewAudit(role)) return false
    if (item.to === '/reports' && !canViewReports(role)) return false
    return !item.feature || can(tenant, item.feature)
  }

  const nav = useMemo(() => {
    const source = superAdmin ? SUPER_NAV : NAV
    if (superAdmin || isTrial) return source
    return source
      .map(section => ({
        ...section,
        items: section.items.filter(canSeePermissionItem),
      }))
      .filter(section => section.items.length > 0)
  }, [superAdmin, isTrial, tenant, tenantUser?.role])

  const lockedFeatures = useMemo(() => {
    if (superAdmin || isTrial || !isAdminUser) return []
    return NAV
      .flatMap(section => section.items)
      .filter(item => item.feature && !can(tenant, item.feature))
  }, [superAdmin, isTrial, isAdminUser, tenant])
  const brandColour = tenant?.primary_colour || 'var(--blue)'
  const showWhiteLabel = !superAdmin && can(tenant, 'custom_branding') && !!tenant?.logo_url
  const profileInitial = (tenantUser?.full_name || tenantUser?.email || '?')[0].toUpperCase()

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
  const workspaceStatus = superAdmin
    ? `${unreadCount} alert${unreadCount === 1 ? '' : 's'}`
    : isPendingActivation
      ? 'Activation required'
      : isTrial
      ? 'Trial active'
      : tenant?.gc_subscription_id
        ? 'Subscription active'
        : tenant?.gc_mandate_id
          ? 'Mandate set'
          : 'Billing needs setup'

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
          <div className="brand-kicker">{superAdmin ? 'Platform Console' : 'Workspace'}</div>
          {showWhiteLabel ? (
            <div style={{display:'flex',alignItems:'center',gap:12}}>
              <img src={tenant.logo_url} alt={`${tenant.name || 'Workspace'} logo`} style={{width:40,height:40,borderRadius:10,objectFit:'cover',border:'1px solid var(--border)',background:'#fff'}} />
              <div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, color: 'var(--text)', lineHeight: 1.05, fontWeight: 700 }}>{tenant.name || 'Workspace'}</div>
                <div style={{ fontSize: 11, color: 'var(--faint)', marginTop: 4 }}>Powered by DH Workplace</div>
              </div>
            </div>
          ) : (
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, color: 'var(--text)', lineHeight: 1.05, fontWeight: 700 }}>DH Workplace</div>
          )}
          {tenant && !superAdmin && (
            <>
              {!showWhiteLabel && <div className="sidebar-brand-name">{tenant.name}</div>}
              <div className="sidebar-brand-meta">
                <span className="badge badge-blue" style={{ textTransform: 'capitalize', ...(tenant?.primary_colour ? { background: `${tenant.primary_colour}1A`, color: tenant.primary_colour, borderColor: `${tenant.primary_colour}40` } : {}) }}>{plan?.name || 'Starter'}</span>
                <span className={`badge badge-${isPendingActivation ? 'amber' : isTrial ? 'amber' : tenant?.status === 'active' ? 'green' : 'red'}`} style={{ textTransform: 'capitalize' }}>
                  {isPendingActivation ? 'Pending activation' : isTrial ? 'Trial' : tenant?.status}
                </span>
              </div>
            </>
          )}
          {superAdmin && <div style={{ fontSize: 11, color: 'var(--blue)', marginTop: 6, fontWeight: 700, letterSpacing: '0.08em' }}>SUPER ADMIN</div>}
        </div>

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
          <div style={{ width: 34, height: 34, borderRadius: '50%', background: tenant?.primary_colour ? `${brandColour}18` : 'var(--blue-soft)', border: `1px solid ${tenant?.primary_colour || 'var(--blue)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: tenant?.primary_colour || 'var(--blue)', flexShrink: 0 }}>
            {profileInitial}
          </div>
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {tenantUser?.full_name || tenantUser?.email}
            </div>
            <div style={{ fontSize: 11, color: 'var(--faint)', textTransform: 'capitalize' }}>{tenantUser?.role}</div>
          </div>
          <button onClick={signOut} className="signout-btn" title="Sign out">Sign out</button>
        </div>
      </aside>

      <main className="main-content">
        <div className="topbar">
          <div />
          <div className="topbar-actions">
            <div className="workspace-health">
              <span className={`workspace-health-dot ${superAdmin ? 'platform' : isTrial ? 'trial' : tenant?.gc_subscription_id ? 'active' : 'attention'}`} />
              <div>
                <div className="workspace-health-label">{superAdmin ? 'Platform status' : 'Workspace status'}</div>
                <div className="workspace-health-value">{workspaceStatus}</div>
              </div>
            </div>
            {!superAdmin && (
              <button className="workspace-chip" onClick={() => navigate('/billing')}>
                <span>{isPendingActivation ? 'Activate' : isTrial ? 'Trial' : plan?.name || 'Starter'}</span>
                <span className="workspace-chip-arrow">Details</span>
              </button>
            )}
            {notificationsEnabled && (
              <div className="notif-wrap">
                <button className="notif-btn" onClick={() => setNotifOpen(open => !open)} title="Notifications">
                  <span className="notif-icon" />
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
