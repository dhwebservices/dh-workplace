import { useCallback, useEffect, useState } from 'react'
import { friendlyError, supabase } from '../lib/supabase'
import { useWorkspace } from '../lib/workspace'
import { addDays, clockTime, formatHours, hoursBetween, sameDay, shiftRange } from '../lib/dates'
import Avatar from '../components/Avatar'
import { ClockIcon } from '../components/Icons'

// Ask the phone where it is, only when the site has a location set.
function locate() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('This device can’t share its location, so it can’t clock in here.'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => reject(new Error('Turn on location for Workplace to clock in here.')),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 },
    )
  })
}

function Ring({ fraction }) {
  const r = 35
  const length = 2 * Math.PI * r
  return (
    <svg width="84" height="84" viewBox="0 0 84 84" aria-hidden="true">
      <circle cx="42" cy="42" r={r} stroke="rgba(255,255,255,.14)" strokeWidth="9" fill="none" />
      <circle cx="42" cy="42" r={r} stroke="#5db7f0" strokeWidth="9" fill="none" strokeLinecap="round"
        strokeDasharray={`${Math.max(0.02, Math.min(1, fraction)) * length} ${length}`} transform="rotate(-90 42 42)" />
    </svg>
  )
}

function PinDialog({ businessId, hasPin, onClose }) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  async function save(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    const { error: e } = await supabase.rpc('set_my_pin', { p_business: businessId, p_pin: pin })
    setSaving(false)
    if (e) setError(friendlyError(e))
    else onClose(true)
  }
  return (
    <div className="scrim" onClick={() => onClose(false)}>
      <form className="dialog" onClick={(e) => e.stopPropagation()} onSubmit={save}>
        <h2>{hasPin ? 'Change Your PIN' : 'Set Your PIN'}</h2>
        <p className="form-note">You type this on the clock-in tablet at work. Use 4 to 6 numbers that only you know.</p>
        <label className="field"><span>PIN</span>
          <input className="input" inputMode="numeric" autoComplete="off" maxLength={6} value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} autoFocus />
        </label>
        {error && <div className="form-error">{error}</div>}
        <div className="actions">
          <button className="btn" type="button" onClick={() => onClose(false)}>Cancel</button>
          <button className="btn primary" type="submit" disabled={pin.length < 4 || saving}>Save PIN</button>
        </div>
      </form>
    </div>
  )
}

export default function Today() {
  const { businessId, business } = useWorkspace()
  const [shifts, setShifts] = useState([])
  const [team, setTeam] = useState([])
  const [people, setPeople] = useState([])
  const [departments, setDepartments] = useState([])
  const [sites, setSites] = useState([])
  const [open, setOpen] = useState(null)
  const [onBreak, setOnBreak] = useState(null)
  const [finished, setFinished] = useState([])
  const [hasPin, setHasPin] = useState(null)
  const [pinOpen, setPinOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [, tick] = useState(0)
  const me = business?.person_id

  const load = useCallback(async () => {
    if (!businessId || !me) return
    const from = new Date()
    from.setHours(0, 0, 0, 0)
    const [s, t, p, d, si, o, pin, f] = await Promise.all([
      supabase.from('shifts').select('*').eq('business_id', businessId).eq('person_id', me)
        .not('published_at', 'is', null).gte('ends_at', new Date().toISOString()).lt('starts_at', addDays(from, 14).toISOString()).order('starts_at'),
      supabase.from('shifts').select('id, person_id, department_id, starts_at, ends_at').eq('business_id', businessId)
        .not('published_at', 'is', null).gte('starts_at', from.toISOString()).lt('starts_at', addDays(from, 1).toISOString()).order('starts_at'),
      supabase.from('people').select('id, full_name').eq('business_id', businessId),
      supabase.from('departments').select('id, name').eq('business_id', businessId),
      supabase.from('sites').select('id, name, latitude, longitude').eq('business_id', businessId).order('name'),
      supabase.from('clock_events').select('id, site_id, shift_id, clock_in_at').eq('person_id', me).is('clock_out_at', null).maybeSingle(),
      supabase.rpc('has_pin', { p_business: businessId }),
      supabase.from('clock_events').select('id, shift_id, clock_in_at, clock_out_at').eq('person_id', me)
        .gte('clock_in_at', addDays(from, -1).toISOString()).not('clock_out_at', 'is', null),
    ])
    setFinished(f.data || [])
    setShifts(s.data || [])
    setTeam((t.data || []).filter((x) => x.person_id && x.person_id !== me))
    setPeople(p.data || [])
    setDepartments(d.data || [])
    setSites(si.data || [])
    setOpen(o.data || null)
    setHasPin(pin.error ? null : Boolean(pin.data))
    if (o.data) {
      const b = await supabase.from('clock_breaks').select('id, started_at').eq('clock_event_id', o.data.id).is('ended_at', null).maybeSingle()
      setOnBreak(b.data || null)
    } else setOnBreak(null)
  }, [businessId, me])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 30000)
    return () => clearInterval(id)
  }, [])

  const now = new Date()
  const next = shifts[0]
  const rest = shifts.slice(1)
  const deptName = (id) => departments.find((d) => d.id === id)?.name || ''
  const personName = (id) => people.find((p) => p.id === id)?.full_name || ''
  const openShift = open && (shifts.find((s) => s.id === open.shift_id) || null)
  const clockSite = sites.find((s) => s.id === (next?.site_id)) || sites[0]
  const startsSoon = next && new Date(next.starts_at) - now < 2 * 3600000
  const doneWithNext = next && finished.find((e) => e.shift_id === next.id)

  async function clockIn() {
    setBusy(true)
    setError('')
    try {
      let pos = { lat: null, lng: null }
      if (clockSite?.latitude != null && clockSite?.longitude != null) pos = await locate()
      const { error: e } = await supabase.rpc('clock_in', { p_business: businessId, p_site: clockSite.id, p_lat: pos.lat, p_lng: pos.lng })
      if (e) throw e
      await load()
    } catch (e) {
      setError(friendlyError(e))
    }
    setBusy(false)
  }

  async function act(action) {
    setBusy(true)
    setError('')
    const { error: e } = await supabase.rpc('clock_action', { p_business: businessId, p_action: action })
    if (e) setError(friendlyError(e))
    await load()
    setBusy(false)
  }

  let liveCard = null
  if (open) {
    const since = new Date(open.clock_in_at)
    const end = openShift ? new Date(openShift.ends_at) : null
    const start = openShift ? new Date(Math.max(since, new Date(openShift.starts_at))) : since
    const fraction = end ? (now - start) / (end - start) : 0.5
    const left = end ? Math.max(0, (end - now) / 3600000) : null
    liveCard = (
      <div className="live">
        <div className="top"><b>{onBreak ? 'On break' : 'On shift'}</b><span>Clocked in {clockTime(since)}</span></div>
        <div className="ringwrap">
          <Ring fraction={fraction} />
          {onBreak ? (
            <div><div className="n">{formatHours((now - new Date(onBreak.started_at)) / 3600000)}</div><div className="l">on break<br />since {clockTime(onBreak.started_at)}</div></div>
          ) : end ? (
            <div><div className="n">{formatHours(left)}</div><div className="l">left of your shift<br />Finishes {clockTime(end)}</div></div>
          ) : (
            <div><div className="n">{formatHours((now - since) / 3600000)}</div><div className="l">on shift<br />{sites.find((s) => s.id === open.site_id)?.name}</div></div>
          )}
        </div>
        <div className="btns">
          <button type="button" className="b1" disabled={busy} onClick={() => act(onBreak ? 'break_end' : 'break_start')}>{onBreak ? 'End Break' : 'Start Break'}</button>
          <button type="button" className="b2" disabled={busy} onClick={() => act('out')}>Clock Out</button>
        </div>
      </div>
    )
  }

  return (
    <main className="page" style={{ background: 'var(--page)' }}>
      <div className="today">
        <div className="date">{now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
        <h1>Today</h1>
        {liveCard || (next ? (
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <div><b style={{ fontSize: 15 }}>{deptName(next.department_id)} shift</b><div className="muted" style={{ fontSize: 13 }}>{sites.find((s) => s.id === next.site_id)?.name || business?.business_name}</div></div>
              <span className="status ok" style={{ color: 'var(--brand-dark)', background: 'var(--brand-tint)' }}>
                {sameDay(new Date(next.starts_at), now) ? 'Today' : new Date(next.starts_at).toLocaleDateString('en-GB', { weekday: 'long' })}
              </span>
            </div>
            <div className="time">{shiftRange(next.starts_at, next.ends_at)}</div>
            <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>{formatHours(hoursBetween(next.starts_at, next.ends_at, next.break_minutes))}</p>
            {doneWithNext && (
              <div className="cta-sub" style={{ marginTop: 12 }}>You clocked out at {clockTime(doneWithNext.clock_out_at)}. Thanks for today.</div>
            )}
            {startsSoon && clockSite && !doneWithNext && (
              <>
                <button className="cta" type="button" disabled={busy} onClick={clockIn}><ClockIcon size={18} />Clock In</button>
                <div className="cta-sub">Pay starts at {clockTime(next.starts_at)}</div>
              </>
            )}
          </div>
        ) : (
          <div className="card"><b>No shifts coming up</b><p className="muted" style={{ marginTop: 4 }}>When your manager publishes the rota, your shifts appear here.</p></div>
        ))}
        {error && <div className="form-error" style={{ marginTop: 10 }}>{error}</div>}

        {open && team.length > 0 && (
          <>
            <div className="section-h"><h2>Working Today</h2></div>
            <div className="group">
              {team.map((s) => (
                <div className="item" key={s.id}>
                  <Avatar name={personName(s.person_id)} size={34} />
                  <div><b style={{ fontWeight: 500, fontSize: 15 }}>{personName(s.person_id)}</b>
                    <div className="muted" style={{ fontSize: 13 }}>{deptName(s.department_id)} · until {clockTime(s.ends_at)}</div></div>
                </div>
              ))}
            </div>
          </>
        )}

        {rest.length > 0 && (
          <>
            <div className="section-h"><h2>Coming Up</h2></div>
            <div className="group">
              {rest.map((s) => {
                const d = new Date(s.starts_at)
                return (
                  <div className="item" key={s.id}>
                    <div className="cal"><small>{d.toLocaleDateString('en-GB', { weekday: 'short' })}</small><b>{d.getDate()}</b></div>
                    <div><b style={{ fontWeight: 500, fontSize: 15 }}>{deptName(s.department_id)}</b><div className="muted" style={{ fontSize: 13 }}>{shiftRange(s.starts_at, s.ends_at)} · {formatHours(hoursBetween(s.starts_at, s.ends_at, s.break_minutes))}</div></div>
                  </div>
                )
              })}
            </div>
          </>
        )}

        {hasPin !== null && (
          <div className="group" style={{ marginTop: 22 }}>
            <button className="item item-btn" type="button" onClick={() => setPinOpen(true)}>
              <div><b style={{ fontWeight: 500, fontSize: 15 }}>Tablet PIN</b>
                <div className="muted" style={{ fontSize: 13 }}>{hasPin ? 'Set. Use it on the clock-in tablet at work.' : 'Not set yet. You need one to clock in on the tablet.'}</div></div>
              <span className="chev">›</span>
            </button>
          </div>
        )}
      </div>
      {pinOpen && <PinDialog businessId={businessId} hasPin={hasPin} onClose={(saved) => { setPinOpen(false); if (saved) setHasPin(true) }} />}
    </main>
  )
}
