import { createContext, useContext, useEffect, useState } from 'react'
import { supabase, sbGet } from '../utils/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null)
  const [tenant, setTenant]   = useState(null)
  const [tenantUser, setTenantUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) loadUserContext(session.user)
      else setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) loadUserContext(session.user)
      else { setUser(null); setTenant(null); setTenantUser(null); setLoading(false) }
    })
    return () => subscription.unsubscribe()
  }, [])

  const loadUserContext = async (authUser) => {
    setUser(authUser)
    try {
      // Load tenant_user record
      const tu = await sbGet('tenant_users', `user_id=eq.${authUser.id}`)
      if (tu) {
        setTenantUser(tu)
        // Load tenant
        const t = await sbGet('tenants', `id=eq.${tu.tenant_id}`)
        setTenant(t)
      }
    } catch (e) {
      console.error('Failed to load user context:', e)
    }
    setLoading(false)
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    setUser(null); setTenant(null); setTenantUser(null)
  }

  const refreshTenant = async () => {
    if (!tenantUser?.tenant_id) return
    const t = await sbGet('tenants', `id=eq.${tenantUser.tenant_id}`)
    setTenant(t)
  }

  return (
    <AuthContext.Provider value={{ user, tenant, tenantUser, loading, signOut, refreshTenant }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
