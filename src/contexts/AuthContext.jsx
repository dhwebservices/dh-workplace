import { createContext, useContext, useEffect, useState } from 'react'
import { supabase, sbGet, sbGetMany } from '../utils/supabase'
import { applyPortalAppearance, applyStoredPortalAppearance, getPortalPreferences } from '../utils/portalPreferences'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null)
  const [tenant, setTenant]   = useState(null)
  const [tenantUser, setTenantUser] = useState(null)
  const [employeeRecord, setEmployeeRecord] = useState(null)
  const [employeePermissions, setEmployeePermissions] = useState(null)
  const [portalPreferences, setPortalPreferences] = useState(null)
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false)
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
        const [t, employees, permissions] = await Promise.all([
          sbGet('tenants', `id=eq.${tu.tenant_id}`),
          sbGetMany('employees', `tenant_id=eq.${tu.tenant_id}&tenant_user_id=eq.${tu.id}`),
          sbGetMany('employee_permissions', `tenant_id=eq.${tu.tenant_id}`),
        ])
        setTenant(t)
        const employee = employees?.[0] || null
        setEmployeeRecord(employee)
        setEmployeePermissions(employee ? (permissions || []).find(row => row.employee_id === employee.id) || null : null)
        setPortalPreferences(employee ? await getPortalPreferences(tu.tenant_id, employee.id) : null)
      } else {
        setTenantUser(null)
        setTenant(null)
        setEmployeeRecord(null)
        setEmployeePermissions(null)
        setPortalPreferences(null)
      }
    } catch (e) {
      console.error('Failed to load user context:', e)
    }
    setLoading(false)
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    setUser(null); setTenant(null); setTenantUser(null); setEmployeeRecord(null); setEmployeePermissions(null); setPortalPreferences(null); setIsPlatformAdmin(false)
  }

  const refreshTenant = async () => {
    if (!tenantUser?.tenant_id) return
    const [t, employees, permissions] = await Promise.all([
      sbGet('tenants', `id=eq.${tenantUser.tenant_id}`),
      sbGetMany('employees', `tenant_id=eq.${tenantUser.tenant_id}&tenant_user_id=eq.${tenantUser.id}`),
      sbGetMany('employee_permissions', `tenant_id=eq.${tenantUser.tenant_id}`),
    ])
    setTenant(t)
    const employee = employees?.[0] || null
    setEmployeeRecord(employee)
    setEmployeePermissions(employee ? (permissions || []).find(row => row.employee_id === employee.id) || null : null)
    setPortalPreferences(employee ? await getPortalPreferences(tenantUser.tenant_id, employee.id) : null)
  }

  return (
    <AuthContext.Provider value={{ user, tenant, tenantUser, employeeRecord, employeePermissions, portalPreferences, isPlatformAdmin, loading, signOut, refreshTenant, setPortalPreferences }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
