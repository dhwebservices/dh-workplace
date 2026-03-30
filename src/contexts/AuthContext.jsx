import { createContext, useContext, useEffect, useState } from 'react'
import { supabase, sbGet } from '../utils/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null)
  const [tenant, setTenant]   = useState(null)
  const [tenantUser, setTenantUser] = useState(null)
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) loadUserContext(session.user)
      else setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) loadUserContext(session.user)
      else { setUser(null); setTenant(null); setTenantUser(null); setIsPlatformAdmin(false); setLoading(false) }
    })
    return () => subscription.unsubscribe()
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
        const t = await sbGet('tenants', `id=eq.${tu.tenant_id}`)
        setTenant(t)
      } else {
        setTenantUser(null)
        setTenant(null)
      }
    } catch (e) {
      console.error('Failed to load user context:', e)
    }
    setLoading(false)
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    setUser(null); setTenant(null); setTenantUser(null); setIsPlatformAdmin(false)
  }

  const refreshTenant = async () => {
    if (!tenantUser?.tenant_id) return
    const t = await sbGet('tenants', `id=eq.${tenantUser.tenant_id}`)
    setTenant(t)
  }

  return (
    <AuthContext.Provider value={{ user, tenant, tenantUser, isPlatformAdmin, loading, signOut, refreshTenant }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
