import { Suspense, lazy } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import { isAccessBlocked } from './utils/entitlements'
import { shouldShowOnboarding } from './utils/onboarding'

const SignUp = lazy(() => import('./pages/auth/SignUp'))
const SignIn = lazy(() => import('./pages/auth/SignIn'))
const ForgotPassword = lazy(() => import('./pages/auth/ForgotPassword'))
const AcceptInvite = lazy(() => import('./pages/auth/AcceptInvite'))
const AcceptPlatformAdmin = lazy(() => import('./pages/auth/AcceptPlatformAdmin'))
const OnboardingWizard = lazy(() => import('./pages/onboarding/OnboardingWizard'))
const AppShell = lazy(() => import('./components/layout/AppShell'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const PaymentWall = lazy(() => import('./pages/PaymentWall'))
const StaffDirectory = lazy(() => import('./pages/hr/StaffDirectory'))
const StaffProfile = lazy(() => import('./pages/hr/StaffProfile'))
const LeaveRequests = lazy(() => import('./pages/hr/LeaveRequests'))
const Documents = lazy(() => import('./pages/hr/Documents'))
const Policies = lazy(() => import('./pages/hr/Policies'))
const Timesheets = lazy(() => import('./pages/hr/Timesheets'))
const Onboarding = lazy(() => import('./pages/hr/Onboarding'))
const Clients = lazy(() => import('./pages/crm/Clients'))
const ClientProfile = lazy(() => import('./pages/crm/ClientProfile'))
const Tasks = lazy(() => import('./pages/crm/Tasks'))
const Pipeline = lazy(() => import('./pages/crm/Pipeline'))
const Outreach = lazy(() => import('./pages/crm/Outreach'))
const Settings = lazy(() => import('./pages/admin/Settings'))
const Team = lazy(() => import('./pages/admin/Team'))
const Billing = lazy(() => import('./pages/admin/Billing'))
const Reports = lazy(() => import('./pages/admin/Reports'))
const AuditLog = lazy(() => import('./pages/admin/AuditLog'))
const SuperDashboard = lazy(() => import('./pages/superadmin/SuperDashboard'))
const SuperTenants = lazy(() => import('./pages/superadmin/SuperTenants'))
const SuperTenant = lazy(() => import('./pages/superadmin/SuperTenant'))
const SuperBilling = lazy(() => import('./pages/superadmin/SuperBilling'))
const SuperAccess = lazy(() => import('./pages/superadmin/SuperAccess'))

function AppLoader() {
  return <div className="spin-wrap"><div className="spin" /></div>
}

function RequireAuth({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="spin-wrap"><div className="spin"/></div>
  if (!user) return <Navigate to="/signin" replace />
  return children
}

function RequireOnboarded({ children }) {
  const { tenant, isPlatformAdmin, loading } = useAuth()
  if (loading) return <div className="spin-wrap"><div className="spin"/></div>
  if (isPlatformAdmin && !tenant) return <Navigate to="/superadmin" replace />
  if (!tenant) return <Navigate to="/signin" replace />
  if (isAccessBlocked(tenant)) return <PaymentWall />
  return children
}

function RequireInitialOnboarding({ children }) {
  const { user, tenant, isPlatformAdmin, loading } = useAuth()
  if (loading) return <div className="spin-wrap"><div className="spin"/></div>
  if (!user) return <Navigate to="/signin" replace />
  if (isPlatformAdmin && !tenant) return <Navigate to="/superadmin" replace />
  if (!shouldShowOnboarding(user.id)) return <Navigate to="/" replace />
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
    <Suspense fallback={<AppLoader />}>
      <Routes>
        {/* Public */}
        <Route path="/signup"  element={<SignUp />} />
        <Route path="/signin"  element={<SignIn />} />
        <Route path="/forgot"  element={<ForgotPassword />} />
        <Route path="/invite/:token" element={<AcceptInvite />} />
        <Route path="/platform-access/:token" element={<AcceptPlatformAdmin />} />

        {/* Onboarding */}
        <Route path="/onboarding" element={<RequireInitialOnboarding><OnboardingWizard /></RequireInitialOnboarding>} />

        {/* Super Admin */}
        <Route path="/superadmin" element={<RequireSuperAdmin><AppShell superAdmin /></RequireSuperAdmin>}>
          <Route index element={<SuperDashboard />} />
          <Route path="tenants" element={<SuperTenants />} />
          <Route path="tenants/:id" element={<SuperTenant />} />
          <Route path="billing" element={<SuperBilling />} />
          <Route path="access" element={<SuperAccess />} />
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
          <Route path="reports"            element={<Reports />} />
          <Route path="audit"              element={<AuditLog />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}
