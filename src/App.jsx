import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import { isAccessBlocked } from './utils/entitlements'

// Auth pages
import SignUp        from './pages/auth/SignUp'
import SignIn        from './pages/auth/SignIn'
import ForgotPassword from './pages/auth/ForgotPassword'
import AcceptInvite  from './pages/auth/AcceptInvite'

// Onboarding
import OnboardingWizard from './pages/onboarding/OnboardingWizard'

// App shell + pages
import AppShell      from './components/layout/AppShell'
import Dashboard     from './pages/Dashboard'
import PaymentWall   from './pages/PaymentWall'

// HR
import StaffDirectory from './pages/hr/StaffDirectory'
import StaffProfile   from './pages/hr/StaffProfile'
import LeaveRequests  from './pages/hr/LeaveRequests'
import Documents      from './pages/hr/Documents'
import Policies       from './pages/hr/Policies'
import Timesheets     from './pages/hr/Timesheets'
import Onboarding     from './pages/hr/Onboarding'

// CRM
import Clients       from './pages/crm/Clients'
import ClientProfile from './pages/crm/ClientProfile'
import Tasks         from './pages/crm/Tasks'
import Pipeline      from './pages/crm/Pipeline'
import Outreach      from './pages/crm/Outreach'

// Admin (tenant-level)
import Settings      from './pages/admin/Settings'
import Team          from './pages/admin/Team'
import Billing       from './pages/admin/Billing'
import AuditLog      from './pages/admin/AuditLog'

// Super admin (DH only)
import SuperDashboard from './pages/superadmin/SuperDashboard'
import SuperTenants   from './pages/superadmin/SuperTenants'
import SuperTenant    from './pages/superadmin/SuperTenant'
import SuperBilling   from './pages/superadmin/SuperBilling'

function RequireAuth({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="spin-wrap"><div className="spin"/></div>
  if (!user) return <Navigate to="/signin" replace />
  return children
}

function RequireOnboarded({ children }) {
  const { tenant, tenantUser, loading } = useAuth()
  if (loading) return <div className="spin-wrap"><div className="spin"/></div>
  if (!tenant) return <Navigate to="/onboarding" replace />
  if (isAccessBlocked(tenant)) return <PaymentWall />
  return children
}

function RequireSuperAdmin({ children }) {
  const { tenantUser, isPlatformAdmin, loading } = useAuth()
  if (loading) return <div className="spin-wrap"><div className="spin"/></div>
  if (!isPlatformAdmin && tenantUser?.role !== 'superadmin') return <Navigate to="/" replace />
  return children
}

export default function App() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/signup"  element={<SignUp />} />
      <Route path="/signin"  element={<SignIn />} />
      <Route path="/forgot"  element={<ForgotPassword />} />
      <Route path="/invite/:token" element={<AcceptInvite />} />

      {/* Onboarding */}
      <Route path="/onboarding" element={<RequireAuth><OnboardingWizard /></RequireAuth>} />

      {/* Super Admin */}
      <Route path="/superadmin" element={<RequireSuperAdmin><AppShell superAdmin /></RequireSuperAdmin>}>
        <Route index element={<SuperDashboard />} />
        <Route path="tenants" element={<SuperTenants />} />
        <Route path="tenants/:id" element={<SuperTenant />} />
        <Route path="billing" element={<SuperBilling />} />
      </Route>

      {/* Main App */}
      <Route path="/" element={<RequireAuth><RequireOnboarded><AppShell /></RequireOnboarded></RequireAuth>}>
        <Route index element={<Dashboard />} />

        {/* HR */}
        <Route path="staff"              element={<StaffDirectory />} />
        <Route path="staff/:userId"      element={<StaffProfile />} />
        <Route path="leave"              element={<LeaveRequests />} />
        <Route path="documents"          element={<Documents />} />
        <Route path="policies"           element={<Policies />} />
        <Route path="timesheets"         element={<Timesheets />} />
        <Route path="onboarding-hr"      element={<Onboarding />} />

        {/* CRM */}
        <Route path="clients"            element={<Clients />} />
        <Route path="clients/:id"        element={<ClientProfile />} />
        <Route path="tasks"              element={<Tasks />} />
        <Route path="pipeline"           element={<Pipeline />} />
        <Route path="outreach"           element={<Outreach />} />

        {/* Admin */}
        <Route path="settings"           element={<Settings />} />
        <Route path="team"               element={<Team />} />
        <Route path="billing"            element={<Billing />} />
        <Route path="audit"              element={<AuditLog />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
