import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useWorkspace } from '../lib/workspace'
import { IS_DEMO } from '../lib/demo'
import Avatar from './Avatar'
import { BellIcon, CalendarIcon, ChevronDown, ClockIcon, DHMark, HelpIcon, HomeIcon, PayIcon, PeopleIcon, SearchIcon, SunIcon } from './Icons'

const NAV = [
  { to: '/today', label: 'Today', icon: HomeIcon },
  { to: '/rota', label: 'Rota', icon: CalendarIcon },
  { to: '/clock-ins', label: 'Clock-ins', perm: 'clock.fix', icon: ClockIcon },
  { to: '/time-off', label: 'Time Off', icon: SunIcon },
  { to: '/team', label: 'Team', perm: 'staff.view_details', icon: PeopleIcon },
  { to: '/pay', label: 'Pay', icon: PayIcon },
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
          {IS_DEMO && <span className="demo-note" title="Sample data. Nothing is saved.">Demo data</span>}
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
      {/* Phones get the bottom tab bar from the staff-app design instead of the top menu. */}
      <nav className="tabbar">
        {NAV.filter((item) => !item.perm || can(item.perm)).filter((item) => item.to !== '/clock-ins').slice(0, 5).map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to}><Icon size={22} /><span>{label}</span></NavLink>
        ))}
      </nav>
    </div>
  )
}
