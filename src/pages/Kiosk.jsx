import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { friendlyError, supabase } from '../lib/supabase'
import { clockTime } from '../lib/dates'
import { DHMark } from '../components/Icons'

// Shared clock-in tablet for a site. A manager or supervisor opens it signed in as themselves;
// staff type their own PIN. The database checks the PIN, the site and the lockout.
const ACTIONS = [
  ['in', 'Clock In', 'clocked in'],
  ['break_start', 'Start Break', 'started a break'],
  ['break_end', 'End Break', 'is back from break'],
  ['out', 'Clock Out', 'clocked out'],
]
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del']

export default function Kiosk() {
  const { siteId } = useParams()
  const [site, setSite] = useState(null)
  const [pin, setPin] = useState('')
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    supabase.from('sites').select('id, name').eq('id', siteId).maybeSingle().then(({ data }) => setSite(data))
  }, [siteId])
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 10000)
    return () => clearInterval(id)
  }, [])
  useEffect(() => {
    if (!result) return undefined
    const id = setTimeout(() => setResult(null), result.ok ? 4000 : 6000)
    return () => clearTimeout(id)
  }, [result])

  function press(key) {
    setResult(null)
    if (key === 'del') setPin((p) => p.slice(0, -1))
    else if (key) setPin((p) => (p.length < 6 ? p + key : p))
  }

  async function act(action, verb) {
    setBusy(true)
    const { data, error } = await supabase.rpc('kiosk_clock', { p_site: siteId, p_pin: pin, p_action: action })
    setBusy(false)
    setPin('')
    if (error) setResult({ ok: false, text: friendlyError(error) })
    else {
      const row = Array.isArray(data) ? data[0] : data
      setResult(row?.ok
        ? { ok: true, text: `${row.person_name} ${verb} at ${clockTime(row.at)}` }
        : { ok: false, text: row?.message || 'That didn’t work. Try again.' })
    }
  }

  return (
    <div className="kiosk">
      <header>
        <div className="mark"><DHMark /></div>
        <div><b>{site?.name || 'Clock-in tablet'}</b><small>Tablet mode</small></div>
        <Link to="/clock-ins" className="kiosk-exit">Exit</Link>
      </header>
      <div className="kiosk-main">
        <div className="kiosk-clock">
          <div className="kiosk-time">{now.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true }).toUpperCase()}</div>
          <div className="kiosk-date">{now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
          <div className={`kiosk-result${result ? (result.ok ? ' ok' : ' bad') : ''}`} role="status">
            {result ? result.text : 'Type your PIN, then choose what you’re doing.'}
          </div>
        </div>
        <div className="kiosk-pad">
          <div className="pin-dots" aria-label={`${pin.length} digits entered`}>
            {Array.from({ length: Math.max(4, pin.length) }).map((_, i) => <i key={i} className={i < pin.length ? 'on' : ''} />)}
          </div>
          <div className="keys">
            {KEYS.map((k, i) => (
              k ? <button key={i} type="button" className="key" onClick={() => press(k)}>{k === 'del' ? 'Delete' : k}</button> : <span key={i} />
            ))}
          </div>
          <div className="kiosk-actions">
            {ACTIONS.map(([action, label, verb]) => (
              <button key={action} type="button" className={action === 'in' ? 'go' : ''} disabled={pin.length < 4 || busy} onClick={() => act(action, verb)}>{label}</button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
