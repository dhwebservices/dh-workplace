import { useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { canAccessPath } from '../utils/permissions'

/**
 * ProtectedRoute wrapper enforces role-based access control at the route level.
 * Redirects unauthorized users to the dashboard with an error message.
 */
export default function ProtectedRoute({ children }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { tenantUser, employeePermissions } = useAuth()

  useEffect(() => {
    // Skip check if no user (RequireAuth handles that)
    if (!tenantUser) return

    // Check if user can access this path
    const canAccess = canAccessPath(location.pathname, {
      permissionRecord: employeePermissions,
      fallbackRole: tenantUser?.role,
    })

    if (!canAccess) {
      console.warn(`[ProtectedRoute] Access denied to ${location.pathname} for role ${tenantUser?.role}`)

      // Redirect to dashboard with error
      navigate('/', {
        replace: true,
        state: {
          error: 'You do not have permission to access that page.',
          from: location.pathname,
        },
      })
    }
  }, [location.pathname, tenantUser?.role, employeePermissions, navigate])

  return children
}
