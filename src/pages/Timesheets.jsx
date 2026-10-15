import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { friendlyError, supabase } from '../lib/supabase'
import { useWorkspace } from '../lib/workspace'
import { addDays, clockTime, formatHours, isoDate, shiftRange, shortDate, startOfWeek, weekLabel } from '../lib/dates'
import { downloadCsv, EXPORTS } from '../lib/exports'
import Avatar from '../components/Avatar'

const money = (pence) => `£${(pence / 100).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

function rowStatus(r) {
  if (!r.clock_out_at) return ['plain', 'Still clocked in']
  if (r.approved) return ['ok', 'Approved']
  return ['wait', r.fixed ? 'Changed, to approve' : 'To approve']
}

export default function Timesheets() {
  const { businessId, business, can } = useWorkspace()
  const approver = can('timesheets.approve')
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()))
  const [rows, setRows] = useState([])
  const [selected, setSelected] = useState(new Set())
  const [format, setFormat] = useState('csv')
  const [error, setError] = useState('')
  const [note, setNote] = useState('')

  const from = isoDate(weekStart)
  const to = isoDate(addDays(weekStart, 6))

  const load = useCallback(async () => {
    if (!businessId) return
    const { data, error: e } = await supabase.rpc('timesheet_rows', { p_business: businessId, p_from: from, p_to: to, p_site: null })
    if (e) setError(friendlyError(e))
    setRows(data || [])
    setSelected(new Set())
  }, [businessId, from, to])

  useEffect(() => { load() }, [load])

  const shown = approver ? rows : rows.filter((r) => r.person_id === business?.person_id)
  const people = useMemo(() => {
    const map = new Map()
    for (const r of shown) {
      const p = map.get(r.person_id) || { id: r.person_id, name: r.full_name, payrollId: r.payroll_id, rows: [], minutes: 0, pence: 0, rated: true }
      p.rows.push(r)
      p.minutes += r.paid_minutes
      if (r.hourly_rate_pence == null) p.rated = false
      else p.pence += (r.paid_minutes / 60) * r.hourly_rate_pence
      map.set(r.person_id, p)
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [shown])

  const approvable = shown.filter((r) => r.clock_out_at && !r.approved)
  const approved = shown.filter((r) => r.approved)
  const totalMinutes = shown.reduce((n, r) => n + r.paid_minutes, 0)
  const totalPence = people.every((p) => p.rated) ? people.reduce((n, p) => n + p.pence, 0) : null

  async function approve(ids) {
    setError('')
    setNote('')
    const { data, error: e } = await supabase.rpc('approve_clock_events', { p_events: ids })
    if (e) setError(friendlyError(e))
    else if (data < ids.length) setNote(`${data} approved. ${ids.length - data} you can’t approve (your own hours, or another department’s) were left for someone else.`)
    load()
  }

  function exportFile() {
    const file = EXPORTS[format]
    downloadCsv(`timesheets-${from}-to-${to}-${format}.csv`, file.build(approved))
  }

  const toggle = (id) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })

  return (
    <main className="page">
      <div className="page-head">
        <h1>{approver ? 'Timesheets' : 'My Hours'}</h1>
        <div className="week-nav">
          <button className="arrow" type="button" aria-label="Previous week" onClick={() => setWeekStart(addDays(weekStart, -7))}>‹</button>
          <span className="label">{weekLabel(weekStart)}</span>
          <button className="arrow" type="button" aria-label="Next week" onClick={() => setWeekStart(addDays(weekStart, 7))}>›</button>
        </div>
        <div className="spacer" />
        {approver && (
          <>
            {selected.size > 0
              ? <button className="btn" type="button" onClick={() => approve([...selected])}>Approve {selected.size} Selected</button>
              : null}
            <button className="btn primary" type="button" disabled={!approvable.length} onClick={() => approve(approvable.map((r) => r.event_id))}>
              Approve All{approvable.length ? ` (${approvable.length})` : ''}
            </button>
          </>
        )}
      </div>
      {error && <div className="banner draft">{error}</div>}
      {note && <div className="banner info">{note}</div>}

      <div className="rota-body">
        <div style={{ flex: 1, minWidth: 0 }}>
          {people.length ? (
            <table className="list ts-table" style={{ margin: 0, width: '100%' }}>
              <thead>
                <tr>
                  {approver && <th style={{ width: 28 }} />}
                  <th>Day</th><th>Rota</th><th>Clocked</th><th>Break</th><th>Paid</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                {people.map((p) => (
                  <Fragment key={p.id}>
                    {approver && (
                      <tr className="ts-person">
                        <td colSpan={7}>
                          <div className="person"><Avatar name={p.name} size={28} /><div><b>{p.name}</b>
                            <span>{formatHours(p.minutes / 60)}{p.rated ? ` · ${money(p.pence)}` : ''}{p.payrollId ? ` · Payroll ID ${p.payrollId}` : ' · No payroll ID'}</span></div></div>
                        </td>
                      </tr>
                    )}
                    {p.rows.map((r) => {
                      const [cls, label] = rowStatus(r)
                      return (
                        <tr key={r.event_id}>
                          {approver && (
                            <td><input type="checkbox" aria-label={`Select ${p.name} ${shortDate(r.clock_in_at)}`} disabled={!r.clock_out_at || r.approved}
                              checked={selected.has(r.event_id)} onChange={() => toggle(r.event_id)} /></td>
                          )}
                          <td><b style={{ fontWeight: 600 }}>{shortDate(r.clock_in_at)}</b><div className="muted" style={{ fontSize: 12 }}>{r.department_name || r.site_name}</div></td>
                          <td className="muted">{r.shift_starts_at ? shiftRange(r.shift_starts_at, r.shift_ends_at) : 'Not on rota'}</td>
                          <td>{clockTime(r.clock_in_at)} – {r.clock_out_at ? clockTime(r.clock_out_at) : '…'}
                            {r.fixed && <div className="muted" style={{ fontSize: 12 }} title={r.fix_reason || ''}>Changed: {r.fix_reason}</div>}</td>
                          <td className="muted">{r.break_minutes ? `${r.break_minutes}m` : '–'}</td>
                          <td><b style={{ fontWeight: 600 }}>{formatHours(r.paid_minutes / 60)}</b></td>
                          <td>
                            <span className={`status ${cls}`}>{label}</span>
                            {approver && r.approved && (
                              <button className="link-btn" type="button" style={{ marginLeft: 8, fontSize: 12 }}
                                onClick={async () => { const { error: e } = await supabase.rpc('unapprove_clock_event', { p_event: r.event_id }); if (e) setError(friendlyError(e)); load() }}>Undo</button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </Fragment>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="empty-state">
              <h2>No hours this week</h2>
              <p>{approver ? 'Clock-ins from phones and the tablet show up here, ready to approve and export.' : 'Your clock-ins show up here.'}</p>
            </div>
          )}
        </div>

        <aside className="inspector">
          <div className="panel">
            <h3>This Week</h3>
            <div className="big-number">{formatHours(totalMinutes / 60)}</div>
            <p className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>
              paid hours{totalPence != null && approver ? `, about ${money(totalPence)} before holiday pay and NI` : ''}
            </p>
            {approver && (
              <>
                <div className="meter"><i style={{ width: `${shown.length ? (approved.length / shown.length) * 100 : 0}%` }} /></div>
                <p className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>{approved.length} of {shown.length} clock-ins approved</p>
              </>
            )}
          </div>
          {approver && (
            <div className="panel">
              <h3>Export</h3>
              <p className="muted" style={{ fontSize: 12.5, lineHeight: 1.5 }}>Approved hours only, ready to import into your payroll software.</p>
              <select className="input sm" style={{ marginTop: 10 }} value={format} onChange={(e) => setFormat(e.target.value)} aria-label="Export format">
                {Object.entries(EXPORTS).map(([k, x]) => <option key={k} value={k}>{x.label}</option>)}
              </select>
              <button className="btn block" type="button" style={{ marginTop: 8 }} disabled={!approved.length} onClick={exportFile}>Download CSV</button>
              {approvable.length > 0 && approved.length > 0 && (
                <p className="form-note" style={{ marginTop: 8 }}>{approvable.length} not yet approved will be left out.</p>
              )}
            </div>
          )}
        </aside>
      </div>
    </main>
  )
}
