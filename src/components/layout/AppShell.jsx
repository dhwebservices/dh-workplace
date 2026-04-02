import { useEffect, useMemo, useState } from 'react'
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { PLANS, can } from '../../utils/entitlements'
import { supabase } from '../../utils/supabase'
import { appliesBanner, listBanners } from '../../utils/banners'
import { getNotificationsForUser, markNotificationRead, markNotificationsRead, sortNotifications } from '../../utils/notifications'
import { canAccessNavItem, canManageBilling, canManageTeam, canManageWorkspaceSettings, canViewAudit, canViewReports, isOnboardingOnlyMode } from '../../utils/permissions'

const NAV = [
  { label: 'Overview', items: [
    { to: '/', label: 'Dashboard' },
    { to: '/notifications', label: 'Notifications', feature: 'notifications' },
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
    { to: '/banners', label: 'Banners', permission: 'settings' },
    { to: '/reports', label: 'Reports', feature: 'reports' },
    { to: '/safeguards', label: 'Safeguards', permission: 'settings' },
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
  const { tenant, tenantUser, employeeRecord, employeePermissions, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [notifications, setNotifications] = useState([])
  const [notifOpen, setNotifOpen] = useState(false)
  const [banners, setBanners] = useState([])

  const isTrial = tenant?.status === 'trialing'
  const isPendingActivation = tenant?.status === 'pending_activation'
  const onboardingOnly = isOnboardingOnlyMode(employeePermissions)
  const isAdminUser = ['owner', 'admin', 'superadmin'].includes(tenantUser?.role)
  const plan = PLANS[tenant?.plan || 'starter']
  const notificationsEnabled = !superAdmin && can(tenant, 'notifications')
  const canSeePermissionItem = (item) => {
    if (superAdmin) return true
    if (!canAccessNavItem(item, { permissionRecord: employeePermissions, fallbackRole: tenantUser?.role })) return false
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
      const data = await getNotificationsForUser(tenantUser.id)
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

  useEffect(() => {
    if (superAdmin || !tenant?.id) return
    let active = true
    const loadBanners = async () => {
      const rows = await listBanners(tenant.id)
      if (active) setBanners(rows || [])
    }
    loadBanners()
    return () => { active = false }
  }, [superAdmin, tenant?.id])

  const unreadCount = useMemo(() => notifications.filter(item => !item.read).length, [notifications])
  const visibleBanners = useMemo(() => {
    if (superAdmin) return []
    return (banners || []).filter((banner) => appliesBanner(banner, {
      pathname: location.pathname,
      role: employeePermissions?.role_preset || tenantUser?.role,
      employeeId: employeeRecord?.id,
    }))
  }, [banners, superAdmin, location.pathname, employeePermissions?.role_preset, tenantUser?.role, employeeRecord?.id])
  const hasLiveSubscription = Boolean(tenant?.stripe_subscription_id || tenant?.gc_subscription_id)
  const hasLegacyMandate = Boolean(tenant?.gc_mandate_id)
  const workspaceStatus = superAdmin
    ? `${unreadCount} alert${unreadCount === 1 ? '' : 's'}`
    : isPendingActivation
      ? 'Activation required'
      : isTrial
      ? 'Trial active'
      : hasLiveSubscription
        ? 'Subscription active'
        : hasLegacyMandate
          ? 'Billing setup saved'
          : 'Billing needs setup'

  const openNotification = async (notification) => {
    if (!notification.read) {
      await markNotificationRead(notification.id, true)
      setNotifications(prev => sortNotifications(prev.map(item => item.id === notification.id ? { ...item, read: true, read_at: new Date().toISOString() } : item)))
    }
    setNotifOpen(false)
    if (notification.link) navigate(notification.link)
  }

  const markAllRead = async () => {
    const unread = notifications.filter(item => !item.read)
    if (unread.length === 0) return
    await markNotificationsRead(unread.map(item => item.id))
    setNotifications(prev => sortNotifications(prev.map(item => ({ ...item, read: true, read_at: item.read_at || new Date().toISOString() }))))
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
            {onboardingOnly && <div style={{ fontSize: 10, color: 'var(--blue)', marginTop: 2, fontWeight: 700, letterSpacing: '0.06em' }}>ONBOARDING ONLY</div>}
          </div>
          <button onClick={signOut} className="signout-btn" title="Sign out">Sign out</button>
        </div>
      </aside>

      <main className="main-content">
        <div className="topbar">
          <div />
          <div className="topbar-actions">
            <div className="workspace-health">
              <span className={`workspace-health-dot ${superAdmin ? 'platform' : isTrial ? 'trial' : hasLiveSubscription ? 'active' : 'attention'}`} />
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
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => { setNotifOpen(false); navigate('/notifications') }}>Open centre</button>
                        <button onClick={markAllRead} disabled={unreadCount === 0}>Mark all read</button>
                      </div>
                    </div>
                    {notifications.length === 0 ? (
                      <div className="notif-empty">No notifications yet</div>
                    ) : (
                      <div className="notif-list">
                        {notifications.map(notification => (
                          <button key={notification.id} className={`notif-item ${notification.read ? 'read' : ''}`} onClick={() => openNotification(notification)}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                              <span className={`badge badge-${notification.is_urgent ? 'red' : notification.type === 'success' ? 'green' : notification.type === 'warning' ? 'amber' : notification.type === 'error' ? 'red' : 'blue'}`} style={{ fontSize: 10 }}>
                                {notification.is_urgent ? 'urgent' : notification.type}
                              </span>
                              {notification.is_pinned && <span className="badge badge-grey" style={{ fontSize: 10 }}>pinned</span>}
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
          {!superAdmin && visibleBanners.length > 0 && (
            <div className="announcement-stack">
              {visibleBanners.map((banner) => (
                <div key={banner.id} className={`announcement-banner announcement-banner-${banner.tone || 'info'}`}>
                  <div className="announcement-banner-copy">
                    <div className="announcement-banner-title">{banner.title}</div>
                    {banner.message && <div className="announcement-banner-text">{banner.message}</div>}
                  </div>
                  {banner.target_path && banner.target_path !== 'all' && location.pathname !== banner.target_path && (
                    <button className="btn btn-outline btn-sm" onClick={() => navigate(banner.target_path)}>Open</button>
                  )}
                </div>
              ))}
            </div>
          )}
          <Outlet />
        </div>
      </main>
    </div>
  )
}
