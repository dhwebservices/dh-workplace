import { Navigate, Route, Routes } from 'react-router-dom'
import { useWorkspace } from './lib/workspace'
import AppLayout from './components/AppLayout'
import SignIn from './pages/auth/SignIn'
import SignUp from './pages/auth/SignUp'
import Setup from './pages/setup/Setup'
import Today from './pages/Today'
import Rota from './pages/Rota'
import TeamLayout from './pages/team/TeamLayout'
import People from './pages/team/People'
import Departments from './pages/team/Departments'
import Later from './pages/Later'

function Loading() {
  return <div className="center">Loading…</div>
}

function Problem({ message }) {
  const { refresh, signOut } = useWorkspace()
  return (
    <div className="center">
      <div className="empty-state">
        <h2>Workplace can’t load right now</h2>
        <p>{message}</p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
          <button className="btn primary lg" type="button" onClick={refresh}>Try Again</button>
          <button className="btn lg" type="button" onClick={signOut}>Sign Out</button>
        </div>
      </div>
    </div>
  )
}

// Signed out → sign in. Signed in with no business yet → setup wizard. Otherwise the app.
function Gate({ children }) {
  const { authReady, user, loading, loadError, businesses } = useWorkspace()
  if (!authReady || (user && loading)) return <Loading />
  if (!user) return <Navigate to="/signin" replace />
  if (loadError) return <Problem message={loadError} />
  if (!businesses.length) return <Navigate to="/setup" replace />
  return children
}

function SetupGate() {
  const { authReady, user, loading, loadError } = useWorkspace()
  if (!authReady || (user && loading)) return <Loading />
  if (!user) return <Navigate to="/signin" replace />
  if (loadError) return <Problem message={loadError} />
  return <Setup />
}

function Home() {
  const { can } = useWorkspace()
  return <Navigate to={can('rota.view_all') ? '/rota' : '/today'} replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/signin" element={<SignIn />} />
      <Route path="/signup" element={<SignUp />} />
      <Route path="/setup" element={<SetupGate />} />
      <Route element={<Gate><AppLayout /></Gate>}>
        <Route index element={<Home />} />
        <Route path="today" element={<Today />} />
        <Route path="rota" element={<Rota />} />
        <Route path="team" element={<TeamLayout />}>
          <Route index element={<People />} />
          <Route path="departments" element={<Departments />} />
        </Route>
        <Route path="clock-ins" element={<Later title="Clock-ins" body="Phone and tablet clock-in comes in the next build, after the rota." />} />
        <Route path="time-off" element={<Later title="Time Off" body="Holiday requests, approvals and UK entitlement come in a later build." />} />
        <Route path="pay" element={<Later title="Pay" body="Timesheet exports for your payroll provider come in a later build." />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
