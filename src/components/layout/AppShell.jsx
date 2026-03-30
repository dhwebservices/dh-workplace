import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { can, getTrialDaysLeft } from '../../utils/entitlements'

const NAV = [
  { label: 'Overview', group: null, items: [
    { to: '/',         icon: '⊞', label: 'Dashboard' },
  ]},
  { label: 'HR', group: null, items: [
    { to: '/staff',       icon: '👥', label: 'Staff Directory',  feature: 'hr_directory' },
    { to: '/leave',       icon: '📅', label: 'Leave',            feature: 'hr_leave' },
    { to: '/documents',   icon: '📁', label: 'Documents',        feature: 'hr_documents' },
    { to: '/timesheets',  icon: '⏱', label: 'Timesheets',       feature: 'hr_timesheets' },
    { to: '/onboarding-hr', icon: '🎓', label: 'Onboarding',    feature: 'hr_onboarding' },
  ]},
  { label: 'Clients', group: null, items: [
    { to: '/clients',   icon: '🏢', label: 'Clients',    feature: 'crm_clients' },
    { to: '/tasks',     icon: '✓',  label: 'Tasks',      feature: 'crm_tasks' },
    { to: '/pipeline',  icon: '⟶',  label: 'Pipeline',   feature: 'crm_pipeline' },
    { to: '/outreach',  icon: '📨', label: 'Outreach',   feature: 'crm_outreach' },
  ]},
  { label: 'Settings', group: null, items: [
    { to: '/team',     icon: '⚙', label: 'Team' },
    { to: '/billing',  icon: '💳', label: 'Billing' },
    { to: '/settings', icon: '🔧', label: 'Settings' },
    { to: '/audit',    icon: '📋', label: 'Audit Log',   feature: 'audit_log' },
  ]},
]

const SUPER_NAV = [
  { label: 'Platform', group: null, items: [
    { to: '/superadmin',          icon: '⊞', label: 'Overview' },
    { to: '/superadmin/tenants',  icon: '🏢', label: 'Tenants' },
    { to: '/superadmin/billing',  icon: '💳', label: 'Billing' },
  ]},
]

export default function AppShell({ superAdmin = false }) {
  const { tenant, tenantUser, signOut } = useAuth()
  const navigate = useNavigate()
  const trialDays = getTrialDaysLeft(tenant)
  const nav = superAdmin ? SUPER_NAV : NAV

  return (
    <div className="app-shell">
      {/* Sidebar */}
      <aside className="sidebar">
        {/* Logo */}
        <div style={{ padding:'20px 16px 16px', borderBottom:'1px solid var(--border)' }}>
          <div style={{ fontFamily:'var(--font-display)', fontSize:18, color:'var(--text)' }}>DH Workplace</div>
          {tenant && !superAdmin && (
            <div style={{ fontSize:11, color:'var(--faint)', marginTop:2, fontFamily:'var(--font-mono)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
              {tenant.name}
            </div>
          )}
          {superAdmin && <div style={{ fontSize:11, color:'var(--gold)', marginTop:2, fontWeight:600 }}>SUPER ADMIN</div>}
        </div>

        {/* Trial banner */}
        {!superAdmin && tenant?.status === 'trialing' && trialDays <= 7 && (
          <div style={{ margin:'8px', padding:'10px 12px', background:'var(--amber-soft)', border:'1px solid var(--amber)', borderRadius:8 }}>
            <div style={{ fontSize:12, fontWeight:600, color:'var(--amber)' }}>
              {trialDays === 0 ? 'Trial expired' : `${trialDays} day${trialDays !== 1 ? 's' : ''} left in trial`}
            </div>
            <button onClick={() => navigate('/billing')} style={{ fontSize:11, color:'var(--amber)', background:'none', border:'none', cursor:'pointer', padding:0, marginTop:2, textDecoration:'underline' }}>
              Set up billing →
            </button>
          </div>
        )}

        {/* Nav */}
        <div style={{ flex:1, overflow:'auto', padding:'8px 0' }}>
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
                    <span style={{ fontSize:14 }}>{item.icon}</span>
                    {item.label}
                    {locked && <span style={{ marginLeft:'auto', fontSize:10, color:'var(--faint)' }}>↑</span>}
                  </NavLink>
                )
              })}
            </div>
          ))}
        </div>

        {/* User footer */}
        <div style={{ padding:'12px 8px', borderTop:'1px solid var(--border)' }}>
          <div style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 12px', borderRadius:8 }}>
            <div style={{ width:32, height:32, borderRadius:'50%', background:'var(--blue-soft)', border:'1px solid var(--blue)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:600, color:'var(--blue)', flexShrink:0 }}>
              {(tenantUser?.full_name || tenantUser?.email || '?')[0].toUpperCase()}
            </div>
            <div style={{ flex:1, overflow:'hidden' }}>
              <div style={{ fontSize:13, fontWeight:500, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                {tenantUser?.full_name || tenantUser?.email}
              </div>
              <div style={{ fontSize:11, color:'var(--faint)', textTransform:'capitalize' }}>{tenantUser?.role}</div>
            </div>
            <button onClick={signOut} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--faint)', fontSize:12, padding:4 }} title="Sign out">⏻</button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="main-content">
        <div className="page-body">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
