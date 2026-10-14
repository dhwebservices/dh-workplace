import { NavLink, Outlet } from 'react-router-dom'

export default function TeamLayout() {
  return (
    <div className="with-side">
      <nav className="ctx">
        <div className="ctx-title">Team</div>
        <NavLink to="/team" end>People</NavLink>
        <NavLink to="/team/departments">Departments</NavLink>
      </nav>
      <div className="content"><Outlet /></div>
    </div>
  )
}
