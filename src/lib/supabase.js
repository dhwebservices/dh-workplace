import { createClient } from '@supabase/supabase-js'

// Public values only: the URL and publishable key are safe in the browser.
// All data access is enforced by row-level security in the `workplace` schema.
const url = import.meta.env.VITE_SUPABASE_URL || 'https://xtunnfdwltfesscmpove.supabase.co'
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_EGqHepeD-Opey2OLrg-dmg_dCIjYmrt'

export const supabase = createClient(url, key, {
  db: { schema: 'workplace' },
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
})

export function friendlyError(error) {
  if (!error) return ''
  const message = error.message || String(error)
  if (/Invalid login credentials/i.test(message)) return 'That email and password don’t match.'
  if (/Email not confirmed/i.test(message)) return 'Check your inbox and confirm your email first.'
  if (/schema must be one of/i.test(message)) return 'Workplace isn’t switched on for this database yet.'
  return message
}
