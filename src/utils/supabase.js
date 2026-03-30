import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://xtunnfdwltfesscmpove.supabase.co'
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh0dW5uZmR3bHRmZXNzY21wb3ZlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1MDkyNzAsImV4cCI6MjA4OTA4NTI3MH0.MaNZGpdSrn5kSTmf3kR87WCK_ga5Meze0ZvlZDkIjfM'

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
  const res = await fetch(`${SB_URL}/rest/v1/${table}?${query}&limit=1`, {
    headers: { ...sbHeaders, Accept: 'application/json' }
  })
  if (!res.ok) return null
  const data = await res.json()
  return Array.isArray(data) ? (data[0] || null) : data
}

export async function sbGetMany(table, query = '') {
  const res = await fetch(`${SB_URL}/rest/v1/${table}?${query}`, {
    headers: { ...sbHeaders, Accept: 'application/json' }
  })
  if (!res.ok) return []
  return await res.json()
}

export async function sbInsert(table, payload) {
  const res = await fetch(`${SB_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: { ...sbHeaders, Prefer: 'return=minimal' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) { const e = await res.text(); throw new Error(e) }
  return true
}

export async function sbUpdate(table, query, payload) {
  const res = await fetch(`${SB_URL}/rest/v1/${table}?${query}`, {
    method: 'PATCH',
    headers: { ...sbHeaders, Prefer: 'return=minimal' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) { const e = await res.text(); throw new Error(e) }
  return true
}
