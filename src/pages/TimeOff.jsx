import { useCallback, useEffect, useMemo, useState } from 'react'
import { friendlyError, supabase } from '../lib/supabase'
import { useWorkspace } from '../lib/workspace'
import { dateSpan, isoDate } from '../lib/dates'
import Avatar from '../components/Avatar'

const KINDS = { holiday: 'Holiday', unpaid: 'Unpaid leave', sick: 'Sickness', other: 'Other' }
const STATUS = { pending: ['wait', 'Pending'], approved: ['ok', 'Approved'], declined: ['plain', 'Declined'], cancelled: ['plain', 'Cancelled'] }

const round1 = (n) => Math.round(n * 10) / 10
const dayCount = (r) => Math.round((new Date(`${r.ends_on}T12:00`) - new Date(`${r.starts_on}T12:00`)) / 86400000) + 1

function Balance({ balance }) {
  if (!balance) return null
  const perDay = Number(balance.hours_per_day) || null
  const asDays = (h) => (perDay ? round1(h / perDay) : round1(h))
  const unit = perDay ? 'days' : 'hours'
  const year = new Date(`${balance.year_start}T12:00`).getFullYear()
  const yearLabel = new Date(`${balance.year_end}T12:00`).getFullYear() === year ? `${year} holiday year` : `${year}–${String(year + 1).slice(2)} holiday year`
  if (balance.method === 'not_set') {
    return (
      <div className="bal">
        <div className="k">{yearLabel}</div>
        <p style={{ marginTop: 6, lineHeight: 1.5 }}>Your holiday allowance appears here once your manager adds your contracted hours.</p>
      </div>
    )
  }
  const total = Number(balance.entitlement_hours)
  const taken = Number(balance.taken_hours)
  const booked = Number(balance.booked_hours) + Number(balance.pending_hours)
  const pct = (h) => `${total ? Math.min(100, (h / total) * 100) : 0}%`
  return (
    <div className="bal">
      <div className="k">{balance.method === 'accrued' ? `Holiday built up so far · ${yearLabel}` : `Holiday left · ${yearLabel}`}</div>
      <div className="v">{asDays(Math.max(0, Number(balance.remaining_hours)))} <span>of {asDays(total)} {unit}</span></div>
      <div className="meter two"><i style={{ width: pct(taken), background: 'var(--brand)' }} /><i style={{ width: pct(booked), background: '#9fcdee' }} /></div>
      <div className="legend"><span><b style={{ background: 'var(--brand)' }} />Taken {asDays(taken)}</span><span><b style={{ background: '#9fcdee' }} />Booked {asDays(booked)}</span></div>
      {balance.method === 'accrued' && <p className="form-note" style={{ marginTop: 8 }}>You build up 12.07% of the hours you work.</p>}
    </div>
  )
}

function RequestDialog({ businessId, onClose }) {
  const today = isoDate(new Date())
  const [form, setForm] = useState({ kind: 'holiday', from: today, to: today, reason: '', hours: '' })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value, ...(k === 'from' && e.target.value > f.to ? { to: e.target.value } : {}) }))
  async function save(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    const { error: err } = await supabase.rpc('request_time_off', {
      p_business: businessId, p_starts: form.from, p_ends: form.to, p_kind: form.kind,
      p_reason: form.reason || null, p_hours: form.hours === '' ? null : Number(form.hours),
    })
    setSaving(false)
    if (err) setError(friendlyError(err))
    else onClose(true)
  }
  return (
    <div className="scrim" onClick={() => onClose(false)}>
      <form className="dialog" onClick={(e) => e.stopPropagation()} onSubmit={save}>
        <h2>Request Time Off</h2>
        <div className="seg wide">
          {Object.entries(KINDS).map(([k, label]) => (
            <button key={k} type="button" className={form.kind === k ? 'on' : ''} onClick={() => setForm((f) => ({ ...f, kind: k }))}>{label}</button>
          ))}
        </div>
        <div className="row2">
          <label className="field"><span>From</span><input className="input" type="date" value={form.from} onChange={set('from')} /></label>
          <label className="field"><span>To</span><input className="input" type="date" min={form.from} value={form.to} onChange={set('to')} /></label>
        </div>
        <label className="field"><span>Note for your manager <em>(optional)</em></span><input className="input" value={form.reason} maxLength={300} onChange={set('reason')} /></label>
        <label className="field"><span>Hours <em>(only for part of a day)</em></span><input className="input" type="number" min="0" step="0.5" value={form.hours} onChange={set('hours')} placeholder="Worked out from your rota" /></label>
        {error && <div className="form-error">{error}</div>}
        <div className="actions">
          <button className="btn" type="button" onClick={() => onClose(false)}>Cancel</button>
          <button className="btn primary" type="submit" disabled={saving || form.to < form.from}>Send Request</button>
        </div>
      </form>
    </div>
  )
}

function BlackoutForm({ businessId, departments, canWholeBusiness, onSaved }) {
  const [form, setForm] = useState({ from: '', to: '', reason: '', scope: canWholeBusiness ? '' : departments[0]?.id || '' })
  const [error, setError] = useState('')
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  async function save(e) {
    e.preventDefault()
    setError('')
    const dept = departments.find((d) => d.id === form.scope)
    const { error: err } = await supabase.from('time_off_blackouts').insert({
      business_id: businessId, starts_on: form.from, ends_on: form.to || form.from, reason: form.reason || null,
      department_id: dept?.id || null, site_id: null,
    })
    if (err) setError(friendlyError(err))
    else { setForm((f) => ({ ...f, from: '', to: '', reason: '' })); onSaved() }
  }
  return (
    <form className="stack" style={{ gap: 8, marginTop: 10 }} onSubmit={save}>
      <div className="row2">
        <input className="input sm" type="date" value={form.from} onChange={set('from')} aria-label="From" />
        <input className="input sm" type="date" min={form.from} value={form.to} onChange={set('to')} aria-label="To" />
      </div>
      <input className="input sm" value={form.reason} onChange={set('reason')} placeholder="Reason, e.g. Christmas" maxLength={120} />
      <select className="input sm" value={form.scope} onChange={set('scope')} aria-label="Applies to">
        {canWholeBusiness && <option value="">Everyone</option>}
        {departments.map((d) => <option key={d.id} value={d.id}>{d.name} only</option>)}
      </select>
      {error && <div className="form-error">{error}</div>}
      <button className="btn" type="submit" disabled={!form.from}>Block Dates</button>
    </form>
  )
}

export default function TimeOff() {
  const { businessId, business, can } = useWorkspace()
  const me = business?.person_id
  const approver = can('timeoff.approve')
  const [requests, setRequests] = useState([])
  const [people, setPeople] = useState([])
  const [departments, setDepartments] = useState([])
  const [blackouts, setBlackouts] = useState([])
  const [balance, setBalance] = useState(null)
  const [tab, setTab] = useState('upcoming')
  const [asking, setAsking] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!businessId || !me) return
    const [r, p, d, b, bal] = await Promise.all([
      supabase.from('time_off_requests').select('*').eq('business_id', businessId).order('starts_on'),
      supabase.from('people').select('id, full_name').eq('business_id', businessId),
      supabase.from('departments').select('id, name').eq('business_id', businessId).order('name'),
      supabase.from('time_off_blackouts').select('*').eq('business_id', businessId).gte('ends_on', isoDate(new Date())).order('starts_on'),
      supabase.rpc('holiday_balance', { p_business: businessId, p_person: me }),
    ])
    setRequests(r.data || [])
    setPeople(p.data || [])
    setDepartments(d.data || [])
    setBlackouts(b.data || [])
    setBalance(Array.isArray(bal.data) ? bal.data[0] : bal.data || null)
  }, [businessId, me])

  useEffect(() => { load() }, [load])

  const today = isoDate(new Date())
  const name = (id) => people.find((p) => p.id === id)?.full_name || ''
  const mine = useMemo(() => requests.filter((r) => r.person_id === me && r.status !== 'cancelled'), [requests, me])
  const myShown = tab === 'upcoming' ? mine.filter((r) => r.ends_on >= today) : mine.filter((r) => r.ends_on < today).reverse()
  const waiting = requests.filter((r) => r.person_id !== me && r.status === 'pending')
  const comingUp = requests.filter((r) => r.person_id !== me && r.status === 'approved' && r.ends_on >= today).slice(0, 12)

  async function run(fn, args) {
    setError('')
    const { error: err } = await supabase.rpc(fn, args)
    if (err) setError(friendlyError(err))
    load()
  }

  const myColumn = (
    <div className="timeoff-me">
      <Balance balance={balance} />
      <div className="seg wide" style={{ marginTop: 16 }}>
        <button type="button" className={tab === 'upcoming' ? 'on' : ''} onClick={() => setTab('upcoming')}>Upcoming</button>
        <button type="button" className={tab === 'past' ? 'on' : ''} onClick={() => setTab('past')}>Past</button>
      </div>
      <div className="group" style={{ marginTop: 12 }}>
        {myShown.length ? myShown.map((r) => {
          const d = new Date(`${r.starts_on}T12:00`)
          const [cls, label] = STATUS[r.status]
          return (
            <div className="item" key={r.id}>
              <div className="cal"><small>{d.toLocaleDateString('en-GB', { month: 'short' })}</small><b>{d.getDate()}</b></div>
              <div style={{ minWidth: 0 }}><b style={{ fontWeight: 500, fontSize: 15 }}>{dateSpan(r.starts_on, r.ends_on)}</b>
                <div className="muted" style={{ fontSize: 13 }}>{dayCount(r)} {dayCount(r) === 1 ? 'day' : 'days'} · {KINDS[r.kind] || 'Holiday'}{r.hours ? ` · ${round1(r.hours)}h` : ''}</div></div>
              <span className={`status ${cls}`} style={{ marginLeft: 'auto' }}>{label}</span>
              {(r.status === 'pending' || (r.status === 'approved' && r.starts_on > today)) && (
                <button className="link-btn" type="button" style={{ fontSize: 13 }} onClick={() => run('cancel_time_off', { p_request: r.id })}>Cancel</button>
              )}
            </div>
          )
        }) : <div className="item muted">{tab === 'upcoming' ? 'No time off booked yet.' : 'Nothing in the past yet.'}</div>}
      </div>
      <button className="req-btn" type="button" onClick={() => setAsking(true)}>Request Time Off</button>
    </div>
  )

  return (
    <main className="page" style={{ background: approver ? undefined : 'var(--page)' }}>
      {approver ? (
        <>
          <div className="page-head">
            <h1>Time Off</h1>
            <div className="spacer" />
            <button className="btn primary" type="button" onClick={() => setAsking(true)}>Request Time Off</button>
          </div>
          {error && <div className="banner draft">{error}</div>}
          <div className="timeoff-body">
            <section className="timeoff-team">
              <div className="section-label">Waiting for You <span>{waiting.length}</span></div>
              {waiting.length ? (
                <div className="panel flush">
                  {waiting.map((r) => (
                    <div className="decision" key={r.id}>
                      <Avatar name={name(r.person_id)} size={36} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <b>{name(r.person_id)}</b> <span className="muted">· {KINDS[r.kind] || 'Holiday'}</span>
                        <div>{dateSpan(r.starts_on, r.ends_on)} · {dayCount(r)} {dayCount(r) === 1 ? 'day' : 'days'}{r.hours ? `, ${round1(r.hours)} hours` : ''}</div>
                        {r.reason && <div className="muted">“{r.reason}”</div>}
                      </div>
                      <button className="btn" type="button" onClick={() => run('decide_time_off', { p_request: r.id, p_approve: false })}>Decline</button>
                      <button className="btn primary" type="button" onClick={() => run('decide_time_off', { p_request: r.id, p_approve: true })}>Approve</button>
                    </div>
                  ))}
                </div>
              ) : <p className="muted pad0">Nothing waiting. New requests from your team appear here.</p>}

              <div className="section-label" style={{ marginTop: 24 }}>Coming Up</div>
              {comingUp.length ? (
                <div className="panel flush">
                  {comingUp.map((r) => (
                    <div className="decision" key={r.id}>
                      <Avatar name={name(r.person_id)} size={30} />
                      <div style={{ flex: 1 }}><b>{name(r.person_id)}</b><div className="muted">{dateSpan(r.starts_on, r.ends_on)} · {KINDS[r.kind] || 'Holiday'}</div></div>
                      <span className="status ok">Approved</span>
                    </div>
                  ))}
                </div>
              ) : <p className="muted pad0">No approved time off coming up.</p>}
            </section>
            <aside className="timeoff-side">
              <div className="panel">
                <h3>Your Time Off</h3>
                {myColumn}
              </div>
              <div className="panel">
                <h3>Blocked Dates <span>No holiday</span></h3>
                {blackouts.length ? blackouts.map((b) => (
                  <div className="request" key={b.id}>
                    <div style={{ flex: 1 }}><b>{dateSpan(b.starts_on, b.ends_on)}</b>
                      <div className="muted">{b.reason || 'Busy period'} · {b.department_id ? departments.find((d) => d.id === b.department_id)?.name : 'Everyone'}</div></div>
                    <button className="link-btn" type="button" onClick={async () => { await supabase.from('time_off_blackouts').delete().eq('id', b.id); load() }}>Remove</button>
                  </div>
                )) : <p className="muted">None set. Block busy dates so nobody books holiday then.</p>}
                <BlackoutForm businessId={businessId} departments={departments} canWholeBusiness={can('billing.manage')} onSaved={load} />
              </div>
            </aside>
          </div>
        </>
      ) : (
        <div className="today">
          <div className="date">{balance ? `${new Date(`${balance.year_start}T12:00`).getFullYear()} holiday year` : 'Holiday'}</div>
          <h1>Time Off</h1>
          {error && <div className="form-error" style={{ marginTop: 10 }}>{error}</div>}
          {myColumn}
        </div>
      )}
      {asking && <RequestDialog businessId={businessId} onClose={(saved) => { setAsking(false); if (saved) load() }} />}
    </main>
  )
}
