import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useWorkspace } from '../lib/workspace'
import Avatar from './Avatar'
import { BellIcon, ChevronDown, DHMark, HelpIcon, SearchIcon } from './Icons'

const NAV = [
  { to: '/today', label: 'Today' },
  { to: '/rota', label: 'Rota' },
  { to: '/clock-ins', label: 'Clock-ins', perm: 'clock.fix' },
  { to: '/time-off', label: 'Time Off' },
  { to: '/team', label: 'Team', perm: 'staff.view_details' },
  { to: '/pay', label: 'Pay' },
]

function roleLabel(roles = []) {
  const order = ['owner', 'manager', 'department_manager', 'supervisor', 'staff']
  const top = order.find((r) => roles.includes(r)) || 'staff'
  return top.replace('_', ' ')
}

export default function AppLayout() {
  const { business, businesses, setBusinessId, can, signOut } = useWorkspace()
  const navigate = useNavigate()

  return (
    <div className="app">
      <header className="topbar">
        <div className="mark"><DHMark /></div>
        <div className="venue-wrap">
          <button className="venue" type="button" aria-label="Switch business">
            <span className="venue-photo">{business?.business_name?.[0] || 'W'}</span>
            <span><b>{business?.business_name}</b><small>{businesses.length > 1 ? `${businesses.length} businesses` : 'Workplace'}</small></span>
            {businesses.length > 1 && <ChevronDown />}
          </button>
          {businesses.length > 1 && (
            <select value={business?.business_id} onChange={(e) => setBusinessId(e.target.value)} aria-label="Business">
              {businesses.map((b) => <option key={b.business_id} value={b.business_id}>{b.business_name}</option>)}
            </select>
          )}
        </div>
        <nav className="mainnav">
          {NAV.filter((item) => !item.perm || can(item.perm)).map((item) => (
            <NavLink key={item.to} to={item.to}>{item.label}</NavLink>
          ))}
        </nav>
        <div className="topbar-right">
          <button className="icon-btn" type="button" aria-label="Search"><SearchIcon /></button>
          <button className="icon-btn" type="button" aria-label="Help"><HelpIcon /></button>
          <button className="icon-btn" type="button" aria-label="Notifications"><BellIcon /></button>
          <button className="account" type="button" title="Sign out"
            onClick={async () => { await signOut(); navigate('/signin') }}>
            <Avatar name={business?.full_name} size={28} />
            <div><b>{business?.full_name}</b><small>{roleLabel(business?.roles)}</small></div>
          </button>
        </div>
      </header>
      <Outlet />
    </div>
  )
}
