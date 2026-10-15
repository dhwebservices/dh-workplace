import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { friendlyError, supabase } from '../lib/supabase'
import { useWorkspace } from '../lib/workspace'
import { clockTime, formatHours, isoDate, shortDate } from '../lib/dates'
import Avatar from '../components/Avatar'

const toLocalInput = (value) => {
  const d = new Date(value)
  return `${isoDate(d)}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function FixDialog({ event, name, onClose }) {
  const [clockIn, setClockIn] = useState(toLocalInput(event.clock_in_at))
  const [clockOut, setClockOut] = useState(event.clock_out_at ? toLocalInput(event.clock_out_at) : '')
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  async function save(e) {
    e.preventDefault()
    setError('')
    const { error: err } = await supabase.rpc('fix_clock_event', {
      p_event: event.id, p_clock_in: new Date(clockIn).toISOString(),
      p_clock_out: clockOut ? new Date(clockOut).toISOString() : null, p_reason: reason,
    })
    if (err) setError(friendlyError(err))
    else onClose(true)
  }
  return (
    <div className="scrim" onClick={() => onClose(false)}>
      <form className="dialog" onClick={(e) => e.stopPropagation()} onSubmit={save}>
        <h2>Fix {name}’s Times</h2>
        <div className="row2">
          <label className="field"><span>Clocked in</span><input className="input" type="datetime-local" value={clockIn} onChange={(e) => setClockIn(e.target.value)} /></label>
          <label className="field"><span>Clocked out</span><input className="input" type="datetime-local" value={clockOut} onChange={(e) => setClockOut(e.target.value)} /></label>
        </div>
        <label className="field"><span>Reason</span><input className="input" value={reason} maxLength={300} placeholder="Forgot to clock out" onChange={(e) => setReason(e.target.value)} /></label>
        <p className="form-note">The change and the reason are kept in the activity log. Fixed times need approving again on the timesheet.</p>
        {error && <div className="form-error">{error}</div>}
        <div className="actions">
          <button className="btn" type="button" onClick={() => onClose(false)}>Cancel</button>
          <button className="btn primary" type="submit" disabled={!reason.trim()}>Save</button>
        </div>
      </form>
    </div>
  )
}

function AddDialog({ businessId, people, sites, onClose }) {
  const [form, setForm] = useState({ person: people[0]?.id || '', site: sites[0]?.id || '', date: isoDate(new Date()), start: '17:00', end: '23:00', breakMinutes: 0, reason: '' })
  const [error, setError] = useState('')
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  async function save(e) {
    e.preventDefault()
    setError('')
    const start = new Date(`${form.date}T${form.start}`)
    const end = new Date(`${form.date}T${form.end}`)
    if (end <= start) end.setDate(end.getDate() + 1)
    const { error: err } = await supabase.rpc('add_clock_event', {
      p_business: businessId, p_person: form.person, p_site: form.site, p_in: start.toISOString(), p_out: end.toISOString(),
      p_break_minutes: Number(form.breakMinutes) || 0, p_reason: form.reason,
    })
    if (err) setError(friendlyError(err))
    else onClose(true)
  }
  return (
    <div className="scrim" onClick={() => onClose(false)}>
      <form className="dialog" onClick={(e) => e.stopPropagation()} onSubmit={save}>
        <h2>Add Missed Hours</h2>
        <label className="field"><span>Who</span>
          <select className="input" value={form.person} onChange={set('person')}>{people.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}</select></label>
        {sites.length > 1 && (
          <label className="field"><span>Site</span>
            <select className="input" value={form.site} onChange={set('site')}>{sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        )}
        <div className="row2">
          <label className="field"><span>Date</span><input className="input" type="date" value={form.date} onChange={set('date')} /></label>
          <label className="field"><span>Unpaid break <em>(minutes)</em></span><input className="input" type="number" min="0" max="240" value={form.breakMinutes} onChange={set('breakMinutes')} /></label>
        </div>
        <div className="row2">
          <label className="field"><span>Started</span><input className="input" type="time" value={form.start} onChange={set('start')} /></label>
          <label className="field"><span>Finished</span><input className="input" type="time" value={form.end} onChange={set('end')} /></label>
        </div>
        <label className="field"><span>Reason</span><input className="input" value={form.reason} maxLength={300} placeholder="Phone died, worked the whole shift" onChange={set('reason')} /></label>
        {error && <div className="form-error">{error}</div>}
        <div className="actions">
          <button className="btn" type="button" onClick={() => onClose(false)}>Cancel</button>
          <button className="btn primary" type="submit" disabled={!form.reason.trim() || !form.person}>Add Hours</button>
        </div>
      </form>
    </div>
  )
}

export default function ClockIns() {
  const { businessId } = useWorkspace()
  const navigate = useNavigate()
  const [events, setEvents] = useState([])
  const [breaks, setBreaks] = useState([])
  const [shifts, setShifts] = useState([])
  const [people, setPeople] = useState([])
  const [sites, setSites] = useState([])
  const [fixing, setFixing] = useState(null)
  const [adding, setAdding] = useState(false)
  const [kioskSite, setKioskSite] = useState('')

  const load = useCallback(async () => {
    if (!businessId) return
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    // Everything still open (including missed clock-outs from earlier days) plus today's finished ones.
    const [open, done, p, s] = await Promise.all([
      supabase.from('clock_events').select('*').eq('business_id', businessId).is('clock_out_at', null).order('clock_in_at'),
      supabase.from('clock_events').select('*').eq('business_id', businessId).gte('clock_in_at', today.toISOString()).not('clock_out_at', 'is', null).order('clock_in_at'),
      supabase.from('people').select('id, full_name').eq('business_id', businessId).eq('active', true).order('full_name'),
      supabase.from('sites').select('id, name').eq('business_id', businessId).order('name'),
    ])
    const list = [...(open.data || []), ...(done.data || [])]
    setEvents(list)
    setPeople(p.data || [])
    setSites(s.data || [])
    setKioskSite((k) => k || s.data?.[0]?.id || '')
    const ids = list.map((e) => e.id)
    const shiftIds = list.map((e) => e.shift_id).filter(Boolean)
    const [b, sh] = await Promise.all([
      ids.length ? supabase.from('clock_breaks').select('*').in('clock_event_id', ids) : { data: [] },
      shiftIds.length ? supabase.from('shifts').select('id, starts_at, ends_at').in('id', shiftIds) : { data: [] },
    ])
    setBreaks(b.data || [])
    setShifts(sh.data || [])
  }, [businessId])

  useEffect(() => { load() }, [load])

  const name = (id) => people.find((p) => p.id === id)?.full_name || 'Someone'
  const site = (id) => sites.find((s) => s.id === id)?.name || ''
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const { inNow, missed, finished } = useMemo(() => ({
    inNow: events.filter((e) => !e.clock_out_at && new Date(e.clock_in_at) >= new Date(Date.now() - 16 * 3600000)),
    missed: events.filter((e) => !e.clock_out_at && new Date(e.clock_in_at) < new Date(Date.now() - 16 * 3600000)),
    finished: events.filter((e) => e.clock_out_at),
  }), [events])

  function status(e) {
    const shift = shifts.find((s) => s.id === e.shift_id)
    const late = shift ? Math.round((new Date(e.clock_in_at) - new Date(shift.starts_at)) / 60000) : 0
    if (breaks.some((b) => b.clock_event_id === e.id && !b.ended_at)) return <span className="status wait">On break</span>
    if (late > 5) return <span className="status late">{late}m late</span>
    if (!shift) return <span className="status plain">No shift</span>
    return <span className="status ok">On time</span>
  }

  return (
    <main className="page">
      <div className="page-head">
        <h1>Clock-ins</h1>
        <div className="spacer" />
        <button className="btn" type="button" onClick={() => setAdding(true)}>Add Missed Hours</button>
        <div className="kiosk-launch">
          {sites.length > 1 && (
            <select className="btn" value={kioskSite} onChange={(e) => setKioskSite(e.target.value)} aria-label="Tablet site">
              {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}
          <button className="btn primary" type="button" disabled={!kioskSite} onClick={() => navigate(`/kiosk/${kioskSite}`)}>Open Tablet Mode</button>
        </div>
      </div>

      {missed.length > 0 && (
        <div className="banner draft">
          {missed.length === 1 ? `${name(missed[0].person_id)} didn’t clock out.` : `${missed.length} people didn’t clock out.`} Fix the times so their hours are right on the timesheet.
        </div>
      )}

      <div className="clock-body">
        <section>
          <div className="section-label">In Now <span>{inNow.length}</span></div>
          {inNow.length ? (
            <table className="list clock-table">
              <thead><tr><th>Person</th><th>Site</th><th>Clocked in</th><th>Status</th><th /></tr></thead>
              <tbody>
                {inNow.map((e) => (
                  <tr key={e.id}>
                    <td><div className="person"><Avatar name={name(e.person_id)} size={30} /><div><b>{name(e.person_id)}</b><span>{e.in_method === 'kiosk' ? 'Tablet' : e.in_method === 'manager' ? 'Added by a manager' : 'Phone'}</span></div></div></td>
                    <td>{site(e.site_id)}</td>
                    <td>{clockTime(e.clock_in_at)}<div className="muted" style={{ fontSize: 12 }}>{formatHours((Date.now() - new Date(e.clock_in_at)) / 3600000)} ago</div></td>
                    <td>{status(e)}</td>
                    <td style={{ textAlign: 'right' }}><button className="btn" type="button" onClick={() => setFixing(e)}>Fix</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="muted pad">Nobody is clocked in right now.</p>}

          {missed.length > 0 && (
            <>
              <div className="section-label" style={{ marginTop: 22 }}>Didn’t Clock Out <span>{missed.length}</span></div>
              <table className="list clock-table">
                <thead><tr><th>Person</th><th>Site</th><th>Clocked in</th><th /><th /></tr></thead>
                <tbody>
                  {missed.map((e) => (
                    <tr key={e.id}>
                      <td><div className="person"><Avatar name={name(e.person_id)} size={30} /><div><b>{name(e.person_id)}</b><span>Still clocked in</span></div></div></td>
                      <td>{site(e.site_id)}</td>
                      <td>{shortDate(e.clock_in_at)}, {clockTime(e.clock_in_at)}</td>
                      <td><span className="status late">Missed</span></td>
                      <td style={{ textAlign: 'right' }}><button className="btn primary" type="button" onClick={() => setFixing(e)}>Fix Times</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          <div className="section-label" style={{ marginTop: 22 }}>Finished Today <span>{finished.length}</span></div>
          {finished.length ? (
            <table className="list clock-table">
              <thead><tr><th>Person</th><th>Site</th><th>Hours</th><th /><th /></tr></thead>
              <tbody>
                {finished.map((e) => (
                  <tr key={e.id}>
                    <td><div className="person"><Avatar name={name(e.person_id)} size={30} /><div><b>{name(e.person_id)}</b><span>{e.fixed_by ? 'Changed by a manager' : e.in_method === 'kiosk' ? 'Tablet' : 'Phone'}</span></div></div></td>
                    <td>{site(e.site_id)}</td>
                    <td>{clockTime(e.clock_in_at)} – {clockTime(e.clock_out_at)}</td>
                    <td>{formatHours((new Date(e.clock_out_at) - new Date(e.clock_in_at)) / 3600000)}</td>
                    <td style={{ textAlign: 'right' }}><button className="btn" type="button" onClick={() => setFixing(e)}>Fix</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="muted pad">No finished clock-ins yet today.</p>}
        </section>
      </div>

      {fixing && <FixDialog event={fixing} name={name(fixing.person_id)} onClose={(saved) => { setFixing(null); if (saved) load() }} />}
      {adding && <AddDialog businessId={businessId} people={people} sites={sites} onClose={(saved) => { setAdding(false); if (saved) load() }} />}
    </main>
  )
}
