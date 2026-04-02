import { Suspense, lazy } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import { isAccessBlocked } from './utils/entitlements'
import { shouldShowOnboarding } from './utils/onboarding'
import { canAccessPath } from './utils/permissions'
import { resolveDefaultLandingPath } from './utils/portalPreferences'

const SignUp = lazy(() => import('./pages/auth/SignUp'))
const SignIn = lazy(() => import('./pages/auth/SignIn'))
const ForgotPassword = lazy(() => import('./pages/auth/ForgotPassword'))
const VerifyEmail = lazy(() => import('./pages/auth/VerifyEmail'))
const NotificationsPage = lazy(() => import('./pages/Notifications'))
const PortalPreferencesPage = lazy(() => import('./pages/PortalPreferences'))
const AcceptInvite = lazy(() => import('./pages/auth/AcceptInvite'))
const AcceptPlatformAdmin = lazy(() => import('./pages/auth/AcceptPlatformAdmin'))
const DemoWorkspace = lazy(() => import('./pages/demo/DemoWorkspace'))
const OnboardingWizard = lazy(() => import('./pages/onboarding/OnboardingWizard'))
const AppShell = lazy(() => import('./components/layout/AppShell'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const PaymentWall = lazy(() => import('./pages/PaymentWall'))
const StaffDirectory = lazy(() => import('./pages/hr/StaffDirectory'))
const OrgChart = lazy(() => import('./pages/hr/OrgChart'))
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
const Banners = lazy(() => import('./pages/admin/Banners'))
const Reports = lazy(() => import('./pages/admin/Reports'))
const Safeguards = lazy(() => import('./pages/admin/Safeguards'))
const Automations = lazy(() => import('./pages/admin/Automations'))
const AuditLog = lazy(() => import('./pages/admin/AuditLog'))
const Integrations = lazy(() => import('./pages/admin/Integrations'))
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
  const { user, tenant, tenantUser, employeeRecord, employeePermissions, isPlatformAdmin, loading } = useAuth()
  if (loading) return <div className="spin-wrap"><div className="spin"/></div>
  if (isPlatformAdmin && !tenant) return <Navigate to="/superadmin" replace />
  if (!tenant) return <Navigate to="/signin" replace />
  if (user?.id && shouldShowOnboarding(user.id)) return <Navigate to="/onboarding" replace />
  const selfStaffPaths = [employeeRecord?.id, employeeRecord?.tenant_user_id, tenantUser?.id, user?.id]
    .filter(Boolean)
    .map(identifier => `/staff/${identifier}`)
  if (!canAccessPath(window.location.pathname, { permissionRecord: employeePermissions, fallbackRole: tenantUser?.role, selfStaffPaths })) {
    return <Navigate to="/onboarding-hr" replace />
  }
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

function WorkspaceHome() {
  const { user, tenantUser, employeeRecord, employeePermissions, portalPreferences } = useAuth()
  const selfStaffPaths = [employeeRecord?.id, employeeRecord?.tenant_user_id, tenantUser?.id, user?.id]
    .filter(Boolean)
    .map(identifier => `/staff/${identifier}`)
  const nextPath = resolveDefaultLandingPath(portalPreferences, {
    permissionRecord: employeePermissions,
    fallbackRole: tenantUser?.role,
    selfStaffPaths,
  })

  if (nextPath && nextPath !== '/') return <Navigate to={nextPath} replace />
  return <Dashboard />
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
        <Route path="/verify-email" element={<VerifyEmail />} />
        <Route path="/notifications" element={<RequireAuth><RequireOnboarded><AppShell /></RequireOnboarded></RequireAuth>}>
          <Route index element={<NotificationsPage />} />
        </Route>
        <Route path="/invite/:token" element={<AcceptInvite />} />
        <Route path="/platform-access/:token" element={<AcceptPlatformAdmin />} />
        <Route path="/demo/:slug" element={<DemoWorkspace />} />

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
          <Route index element={<WorkspaceHome />} />
          <Route path="portal"            element={<PortalPreferencesPage />} />

          {/* HR */}
          <Route path="staff"              element={<StaffDirectory />} />
          <Route path="org-chart"          element={<OrgChart />} />
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
          <Route path="banners"            element={<Banners />} />
          <Route path="reports"            element={<Reports />} />
          <Route path="safeguards"         element={<Safeguards />} />
          <Route path="automations"        element={<Automations />} />
          <Route path="audit"              element={<AuditLog />} />
          <Route path="integrations"       element={<Integrations />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}
