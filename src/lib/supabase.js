import { createClient } from '@supabase/supabase-js'
import { IS_DEMO, demoClient } from './demo'

// Public values only: the URL and publishable key are safe in the browser.
// All data access is enforced by row-level security in the `workplace` schema.
const url = import.meta.env.VITE_SUPABASE_URL || 'https://xtunnfdwltfesscmpove.supabase.co'
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_EGqHepeD-Opey2OLrg-dmg_dCIjYmrt'

// ?demo=1 swaps in an in-memory client with sample data; the real client is never created then.
export const supabase = IS_DEMO
  ? demoClient
  : createClient(url, key, {
    db: { schema: 'workplace' },
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  })

export const SCHEMA_OFF_MESSAGE =
  'Workplace isn’t switched on for this database yet. In Supabase, open Settings → Data API and add “workplace” to Exposed schemas.'

// Never let the UI wait forever: the auth client retries timeouts, which can add up to a minute.
export function withTimeout(promise, ms = 20000) {
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('timeout')), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

export function friendlyError(error) {
  if (!error) return ''
  const message = error.message || String(error)
  const status = error.status || error.code
  if (/Invalid login credentials/i.test(message)) return 'That email and password don’t match.'
  if (/Email not confirmed/i.test(message)) return 'Check your inbox and confirm your email first.'
  if (/schema must be one of|Invalid schema|PGRST106/i.test(message) || status === 'PGRST106') return SCHEMA_OFF_MESSAGE
  if (/sending confirmation email|sending magic link|smtp/i.test(message))
    return 'We couldn’t send your confirmation email. Email sending isn’t set up for Workplace yet. Please try again later.'
  if (message === 'timeout' || status === 504 || /deadline exceeded|timed out|Failed to fetch|NetworkError/i.test(message))
    return 'That took too long. Our sign-up email may not have sent. Please try again in a minute, and if it keeps happening, call 01443 805303.'
  if (/rate limit|too many/i.test(message)) return 'Too many attempts. Wait a minute and try again.'
  return message
}
