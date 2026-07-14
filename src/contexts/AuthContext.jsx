import { createContext, useContext, useEffect, useState } from 'react'
import { supabase, sbGet, sbGetMany } from '../utils/supabase'
import { applyPortalAppearance, applyStoredPortalAppearance, getPortalPreferences } from '../utils/portalPreferences'
import { getTenantForHostname } from '../utils/tenantDomains'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null)
  const [tenant, setTenant]   = useState(null)
  const [tenantUser, setTenantUser] = useState(null)
  const [employeeRecord, setEmployeeRecord] = useState(null)
  const [employeePermissions, setEmployeePermissions] = useState(null)
  const [portalPreferences, setPortalPreferences] = useState(null)
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false)
  const [hostTenant, setHostTenant] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    applyStoredPortalAppearance()
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) loadUserContext(session.user)
      else setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) loadUserContext(session.user)
      else { setUser(null); setTenant(null); setTenantUser(null); setEmployeeRecord(null); setEmployeePermissions(null); setPortalPreferences(null); setIsPlatformAdmin(false); setLoading(false) }
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    applyPortalAppearance(portalPreferences, tenant?.primary_colour || null)
  }, [portalPreferences, tenant?.primary_colour])

  useEffect(() => {
    let active = true
    const loadHostTenant = async () => {
      if (typeof window === 'undefined') return
      const match = await getTenantForHostname(window.location.hostname)
      if (active) setHostTenant(match || null)
    }
    loadHostTenant()
    return () => { active = false }
  }, [])

  const loadUserContext = async (authUser) => {
    setUser(authUser)
    try {
      const [tu, platformAdmin] = await Promise.all([
        sbGet('tenant_users', `user_id=eq.${authUser.id}`),
        sbGet('platform_admins', `user_id=eq.${authUser.id}`),
      ])
      setIsPlatformAdmin(!!platformAdmin)
      if (tu) {
        setTenantUser(tu)
        const [t, employees] = await Promise.all([
          sbGet('tenants', `id=eq.${tu.tenant_id}`),
          sbGetMany('employees', `tenant_id=eq.${tu.tenant_id}&tenant_user_id=eq.${tu.id}`),
        ])
        setTenant(t)
        const employee = employees?.[0] || null
        setEmployeeRecord(employee)

        // Only load current employee's permissions (not all employees)
        if (employee) {
          const permissions = await sbGet('employee_permissions', `employee_id=eq.${employee.id}`)
          setEmployeePermissions(permissions)
          setPortalPreferences(await getPortalPreferences(tu.tenant_id, employee.id))
        } else {
          setEmployeePermissions(null)
          setPortalPreferences(null)
        }
      } else {
        setTenantUser(null)
        setTenant(null)
        setEmployeeRecord(null)
        setEmployeePermissions(null)
        setPortalPreferences(null)
      }
    } catch (e) {
      console.error('Failed to load user context:', e)
      // Reset all state on error to prevent inconsistent state
      setUser(null)
      setTenant(null)
      setTenantUser(null)
      setEmployeeRecord(null)
      setEmployeePermissions(null)
      setPortalPreferences(null)
      setIsPlatformAdmin(false)
    }
    setLoading(false)
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    setUser(null); setTenant(null); setTenantUser(null); setEmployeeRecord(null); setEmployeePermissions(null); setPortalPreferences(null); setIsPlatformAdmin(false)
  }

  const refreshTenant = async () => {
    if (!tenantUser?.tenant_id) return
    const [t, employees] = await Promise.all([
      sbGet('tenants', `id=eq.${tenantUser.tenant_id}`),
      sbGetMany('employees', `tenant_id=eq.${tenantUser.tenant_id}&tenant_user_id=eq.${tenantUser.id}`),
    ])
    setTenant(t)
    const employee = employees?.[0] || null
    setEmployeeRecord(employee)

    // Only load current employee's permissions
    if (employee) {
      const permissions = await sbGet('employee_permissions', `employee_id=eq.${employee.id}`)
      setEmployeePermissions(permissions)
      setPortalPreferences(await getPortalPreferences(tenantUser.tenant_id, employee.id))
    } else {
      setEmployeePermissions(null)
      setPortalPreferences(null)
    }
  }

  return (
    <AuthContext.Provider value={{ user, tenant, tenantUser, employeeRecord, employeePermissions, portalPreferences, isPlatformAdmin, hostTenant, loading, signOut, refreshTenant, setPortalPreferences }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
