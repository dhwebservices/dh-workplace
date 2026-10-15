import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { friendlyError, supabase, withTimeout } from './supabase'

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
  const [loadError, setLoadError] = useState('')
  // Which signed-in user the business list belongs to. Until it matches, we're still loading,
  // which stops a one-render flash where a signed-in owner looks like they have no business.
  const [loadedFor, setLoadedFor] = useState(null)

  useEffect(() => {
    withTimeout(supabase.auth.getSession(), 10000)
      .then(({ data }) => setSession(data.session))
      .catch(() => setSession(null))
      .finally(() => setAuthReady(true))
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
    setLoadError('')
    let list = []
    try {
      // Link any invites waiting for this email before listing businesses.
      const claim = await withTimeout(supabase.rpc('claim_invites'), 15000)
      if (claim.error) throw claim.error
      const { data, error } = await withTimeout(supabase.rpc('my_businesses'), 15000)
      if (error) throw error
      list = data || []
    } catch (error) {
      setLoadError(friendlyError(error))
      setLoadedFor(session.user.id)
      setLoading(false)
      return
    }
    setBusinesses(list)
    setLoadedFor(session.user.id)
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
    supabase.rpc('my_permissions', { p_business: businessId }).then(({ data }) => setPermissions(data || []), () => setPermissions([]))
  }, [businessId])

  const value = useMemo(() => {
    const business = businesses.find((b) => b.business_id === businessId) || null
    return {
      session,
      user: session?.user || null,
      authReady,
      loading: loading || Boolean(session && loadedFor !== session.user.id),
      loadError,
      businesses,
      business,
      businessId,
      setBusinessId,
      permissions,
      can: (perm) => permissions.includes(perm),
      refresh,
      signOut: () => supabase.auth.signOut(),
    }
  }, [session, authReady, loading, loadedFor, loadError, businesses, businessId, permissions, refresh])

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
}

export function useWorkspace() {
  return useContext(WorkspaceContext)
}
