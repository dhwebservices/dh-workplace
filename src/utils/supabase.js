import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error('Missing Supabase environment variables. Please create .env.local with VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY')
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// Raw REST helpers to bypass supabase-js columns= bug
export const SB_URL = SUPABASE_URL
export const SB_KEY = SUPABASE_ANON_KEY
export const sbHeaders = {
  'apikey': SUPABASE_ANON_KEY,
  'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
  'Content-Type': 'application/json',
}

export async function sbGet(table, query = '') {
  const { data: { session } } = await supabase.auth.getSession()
  const headers = session
    ? { ...sbHeaders, 'Authorization': `Bearer ${session.access_token}` }
    : sbHeaders

  const res = await fetch(`${SB_URL}/rest/v1/${table}?${query}&limit=1`, {
    headers: { ...headers, Accept: 'application/json' }
  })
  if (!res.ok) return null
  const data = await res.json()
  return Array.isArray(data) ? (data[0] || null) : data
}

export async function sbGetMany(table, query = '') {
  const { data: { session } } = await supabase.auth.getSession()
  const headers = session
    ? { ...sbHeaders, 'Authorization': `Bearer ${session.access_token}` }
    : sbHeaders

  const res = await fetch(`${SB_URL}/rest/v1/${table}?${query}`, {
    headers: { ...headers, Accept: 'application/json' }
  })
  if (!res.ok) return []
  return await res.json()
}

export async function sbInsert(table, payload) {
  const { data: { session } } = await supabase.auth.getSession()
  const headers = session
    ? { ...sbHeaders, 'Authorization': `Bearer ${session.access_token}` }
    : sbHeaders

  const res = await fetch(`${SB_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: { ...headers, Prefer: 'return=minimal' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) { const e = await res.text(); throw new Error(e) }
  return true
}

export async function sbUpdate(table, query, payload) {
  const { data: { session } } = await supabase.auth.getSession()
  const headers = session
    ? { ...sbHeaders, 'Authorization': `Bearer ${session.access_token}` }
    : sbHeaders

  const res = await fetch(`${SB_URL}/rest/v1/${table}?${query}`, {
    method: 'PATCH',
    headers: { ...headers, Prefer: 'return=minimal' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) { const e = await res.text(); throw new Error(e) }
  return true
}

export async function sbDelete(table, query) {
  const { data: { session } } = await supabase.auth.getSession()
  const headers = session
    ? { ...sbHeaders, 'Authorization': `Bearer ${session.access_token}` }
    : sbHeaders

  const res = await fetch(`${SB_URL}/rest/v1/${table}?${query}`, {
    method: 'DELETE',
    headers: { ...headers, Prefer: 'return=minimal' },
  })
  if (!res.ok) { const e = await res.text(); throw new Error(e) }
  return true
}
