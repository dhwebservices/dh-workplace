import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase'

const WorkspaceContext = createContext(null)
const STORAGE_KEY = 'workplace.business'

function readStoredBusiness() {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

export function WorkspaceProvider({ children }) {
  const [session, setSession] = useState(null)
  const [authReady, setAuthReady] = useState(false)
  const [businesses, setBusinesses] = useState([])
  const [businessId, setBusinessId] = useState(readStoredBusiness())
  const [permissions, setPermissions] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setAuthReady(true)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next))
    return () => data.subscription.unsubscribe()
  }, [])

  const refresh = useCallback(async () => {
    if (!session) {
      setBusinesses([])
      setLoading(false)
      return
    }
    setLoading(true)
    // Link any invites waiting for this email before listing businesses.
    await supabase.rpc('claim_invites')
    const { data } = await supabase.rpc('my_businesses')
    const list = data || []
    setBusinesses(list)
    setBusinessId((current) =>
      list.some((b) => b.business_id === current) ? current : list[0]?.business_id || null,
    )
    setLoading(false)
  }, [session])

  useEffect(() => {
    refresh()
  }, [refresh])

  useEffect(() => {
    if (!businessId) {
      setPermissions([])
      return
    }
    try {
      localStorage.setItem(STORAGE_KEY, businessId)
    } catch {
      // Private browsing: the switcher just won't remember the last venue.
    }
    supabase.rpc('my_permissions', { p_business: businessId }).then(({ data }) => setPermissions(data || []))
  }, [businessId])

  const value = useMemo(() => {
    const business = businesses.find((b) => b.business_id === businessId) || null
    return {
      session,
      user: session?.user || null,
      authReady,
      loading,
      businesses,
      business,
      businessId,
      setBusinessId,
      permissions,
      can: (perm) => permissions.includes(perm),
      refresh,
      signOut: () => supabase.auth.signOut(),
    }
  }, [session, authReady, loading, businesses, businessId, permissions, refresh])

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
}

export function useWorkspace() {
  return useContext(WorkspaceContext)
}
