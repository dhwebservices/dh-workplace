// Demo mode: an in-memory stand-in for the Supabase client so the app can be shown
// without an account or a database. Open any page with ?demo=1 (add &as=ffion to see a
// staff member's view). Nothing here ever reaches the network; ?demo=0 switches it off.

const DEMO_KEY = 'workplace.demo'

function readFlag() {
  try {
    const params = new URLSearchParams(window.location.search)
    if (params.get('demo') === '0') {
      sessionStorage.removeItem(DEMO_KEY)
      return null
    }
    if (params.get('demo') === '1') sessionStorage.setItem(DEMO_KEY, params.get('as') === 'ffion' ? 'ffion' : 'owner')
    return sessionStorage.getItem(DEMO_KEY)
  } catch {
    return null
  }
}

export const DEMO_AS = typeof window === 'undefined' ? null : readFlag()
export const IS_DEMO = Boolean(DEMO_AS)

// ── Seed data ────────────────────────────────────────────────────────────────

const BUSINESS = 'b0000000-0000-4000-8000-000000000001'
const SITES = { inn: 's0000000-0000-4000-8000-000000000001', cafe: 's0000000-0000-4000-8000-000000000002' }
const DEPTS = {
  bar: 'd0000000-0000-4000-8000-000000000001',
  kitchen: 'd0000000-0000-4000-8000-000000000002',
  floor: 'd0000000-0000-4000-8000-000000000003',
  cafe: 'd0000000-0000-4000-8000-000000000004',
}
const STAFF = [
  ['sian', 'Sian Lewis', 'full_time', 'owner', ['floor'], 1450],
  ['ffion', 'Ffion Price', 'part_time', 'staff', ['bar', 'floor'], 1221],
  ['rhys', 'Rhys Morgan', 'part_time', 'supervisor', ['bar'], 1250],
  ['cerys', 'Cerys Jones', 'full_time', 'department_manager', ['kitchen'], 1500],
  ['owain', 'Owain Hughes', 'part_time', 'staff', ['kitchen'], 1221],
  ['megan', 'Megan Davies', 'zero_hours', 'staff', ['floor', 'cafe'], 1221],
  ['tom', 'Tom Evans', 'part_time', 'staff', ['bar'], 1221],
]
// [weekly hours, days per week] for holiday; zero hours staff build up 12.07% instead.
const CONTRACT_HOURS = { sian: [40, 5], ffion: [24, 4], rhys: [30, 5], cerys: [40, 5], owain: [24, 4], tom: [16, 3] }
const PINS = { ffion: '2468', rhys: '1357', owain: '3579', megan: '9753', tom: '8642', cerys: '4826' }
const personId = (key) => `p0000000-0000-4000-8000-00000000000${STAFF.findIndex((s) => s[0] === key) + 1}`

function mondayOf(date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  const day = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - day)
  return d
}
function at(day, hour, minute = 0) {
  const d = new Date(day)
  d.setHours(hour, minute, 0, 0)
  return d
}
function span(day, startHour, endHour) {
  const start = at(day, startHour)
  const end = endHour > startHour ? at(day, endHour) : at(new Date(day.getTime() + 86400000), endHour)
  return [start.toISOString(), end.toISOString()]
}

let counter = 1000
const newId = () => `x0000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`

function seed() {
  const monday = mondayOf(new Date())
  const day = (offset) => new Date(monday.getTime() + offset * 86400000)
  const db = {
    businesses: [{ id: BUSINESS, name: 'The Bridge Inn', timezone: 'Europe/London' }],
    sites: [
      { id: SITES.inn, business_id: BUSINESS, name: 'The Bridge Inn', address: 'Bridge Street, Pontypridd', latitude: null, longitude: null },
      { id: SITES.cafe, business_id: BUSINESS, name: 'Bridge Café', address: 'Taff Street, Pontypridd', latitude: null, longitude: null },
    ],
    departments: [
      { id: DEPTS.bar, business_id: BUSINESS, site_id: SITES.inn, name: 'Bar', colour: 'blue' },
      { id: DEPTS.kitchen, business_id: BUSINESS, site_id: SITES.inn, name: 'Kitchen', colour: 'orange' },
      { id: DEPTS.floor, business_id: BUSINESS, site_id: SITES.inn, name: 'Floor', colour: 'green' },
      { id: DEPTS.cafe, business_id: BUSINESS, site_id: SITES.cafe, name: 'Café', colour: 'purple' },
    ],
    people: [],
    person_details: [],
    person_pay: [],
    person_departments: [],
    role_assignments: [],
    shifts: [],
  }
  for (const [key, name, contract, role, depts, pence] of STAFF) {
    const id = personId(key)
    db.people.push({ id, business_id: BUSINESS, full_name: name, user_id: `u-${key}`, active: true })
    const [weekly, days] = CONTRACT_HOURS[key] || [null, null]
    db.person_details.push({ person_id: id, business_id: BUSINESS, email: `${key}@bridgeinn.example`, contract_type: contract,
      weekly_hours: weekly, days_per_week: days, start_date: '2023-03-01', payroll_id: `BI${String(db.people.length).padStart(3, '0')}` })
    db.person_pay.push({ id: newId(), person_id: id, business_id: BUSINESS, hourly_rate_pence: pence, effective_from: '2026-04-01' })
    depts.forEach((d, i) => db.person_departments.push({ person_id: id, department_id: DEPTS[d], business_id: BUSINESS, is_primary: i === 0 }))
    db.role_assignments.push({ person_id: id, business_id: BUSINESS, role, site_id: null,
      department_id: role === 'supervisor' ? DEPTS.bar : role === 'department_manager' ? DEPTS.kitchen : null })
  }

  // [person, dept, dayOffset, start, end, published]
  const plan = [
    ['sian', 'floor', 0, 10, 18], ['sian', 'floor', 1, 10, 18], ['sian', 'floor', 3, 15, 23], ['sian', 'floor', 4, 15, 23], ['sian', 'floor', 6, 11, 17],
    ['ffion', 'bar', 1, 17, 23], ['ffion', 'floor', 3, 12, 18], ['ffion', 'bar', 5, 18, 24],
    ['rhys', 'bar', 0, 17, 23], ['rhys', 'bar', 2, 17, 23], ['rhys', 'bar', 3, 17, 23], ['rhys', 'bar', 4, 18, 24], ['rhys', 'bar', 6, 12, 18],
    ['cerys', 'kitchen', 0, 11, 19], ['cerys', 'kitchen', 1, 11, 19], ['cerys', 'kitchen', 2, 11, 19], ['cerys', 'kitchen', 4, 11, 20], ['cerys', 'kitchen', 5, 11, 20],
    ['owain', 'kitchen', 1, 16, 22], ['owain', 'kitchen', 2, 16, 22], ['owain', 'kitchen', 3, 16, 22], ['owain', 'kitchen', 5, 12, 20],
    ['megan', 'floor', 2, 12, 18], ['megan', 'floor', 4, 17, 23], ['megan', 'cafe', 6, 8, 14],
    ['tom', 'bar', 0, 10, 14], ['tom', 'bar', 3, 10, 14], ['tom', 'bar', 4, 17, 23], ['tom', 'bar', 5, 18, 24],
  ]
  const published = new Date(monday.getTime() - 3 * 86400000).toISOString()
  for (const [key, dept, offset, start, end] of plan) {
    const [starts_at, ends_at] = span(day(offset), start, end % 24)
    const draft = offset >= 5 && key === 'tom'
    db.shifts.push({ id: newId(), business_id: BUSINESS, site_id: dept === 'cafe' ? SITES.cafe : SITES.inn, department_id: DEPTS[dept],
      person_id: personId(key), starts_at, ends_at, break_minutes: end - start >= 6 ? 20 : 0, notes: null,
      published_at: draft ? null : published })
  }
  // Open shifts anyone in the department can claim
  for (const [dept, offset, start, end] of [['bar', 5, 18, 24], ['cafe', 5, 8, 14]]) {
    const [starts_at, ends_at] = span(day(offset), start, end % 24)
    db.shifts.push({ id: newId(), business_id: BUSINESS, site_id: dept === 'cafe' ? SITES.cafe : SITES.inn, department_id: DEPTS[dept],
      person_id: null, starts_at, ends_at, break_minutes: 20, notes: null, published_at: published })
  }
  // Next week: a couple of drafts so Publish has something to do
  for (const [key, dept, offset, start, end] of [['ffion', 'bar', 8, 17, 23], ['rhys', 'bar', 7, 17, 23]]) {
    const [starts_at, ends_at] = span(day(offset), start, end)
    db.shifts.push({ id: newId(), business_id: BUSINESS, site_id: SITES.inn, department_id: DEPTS[dept],
      person_id: personId(key), starts_at, ends_at, break_minutes: 20, notes: null, published_at: null })
  }
  // Who's working right now: Ffion on time, Rhys a little late, Cerys on her break.
  const nowMs = Date.now()
  const minutes = (n) => n * 60000
  const today = day((new Date().getDay() + 6) % 7)
  const todayKey = today.toDateString()
  db.shifts = db.shifts.filter((s) => !(['ffion', 'rhys', 'cerys'].some((k) => s.person_id === personId(k)) && new Date(s.starts_at).toDateString() === todayKey))
  db.clock_events = []
  db.clock_breaks = []
  for (const [key, dept, startAgo, length, lateBy, breakAgo] of [['ffion', 'bar', 100, 360, -2], ['rhys', 'bar', 60, 360, 12], ['cerys', 'kitchen', 200, 480, -4, 15]]) {
    const start = new Date(Math.round((nowMs - minutes(startAgo)) / minutes(15)) * minutes(15))
    const shift = { id: newId(), business_id: BUSINESS, site_id: SITES.inn, department_id: DEPTS[dept], person_id: personId(key),
      starts_at: start.toISOString(), ends_at: new Date(start.getTime() + minutes(length)).toISOString(), break_minutes: 20, notes: null, published_at: published }
    db.shifts.push(shift)
    const event = { id: newId(), business_id: BUSINESS, person_id: personId(key), site_id: SITES.inn, shift_id: shift.id,
      clock_in_at: new Date(start.getTime() + minutes(lateBy)).toISOString(), clock_out_at: null, in_method: key === 'rhys' ? 'kiosk' : 'phone',
      out_method: null, fixed_by: null, fix_reason: null, approved_by: null, approved_at: null }
    db.clock_events.push(event)
    if (breakAgo) db.clock_breaks.push({ id: newId(), business_id: BUSINESS, clock_event_id: event.id, started_at: new Date(nowMs - minutes(breakAgo)).toISOString(), ended_at: null, paid: false })
  }
  // Tom never clocked out two nights ago.
  const tomIn = at(day(((new Date().getDay() + 6) % 7) - 2), 17, 58)
  db.clock_events.push({ id: newId(), business_id: BUSINESS, person_id: personId('tom'), site_id: SITES.inn, shift_id: null, clock_in_at: tomIn.toISOString(),
    clock_out_at: null, in_method: 'phone', out_method: null, fixed_by: null, fix_reason: null, approved_by: null, approved_at: null })

  // Finished shifts become clock-ins: last week all approved, this week waiting for approval.
  const lastWeek = db.shifts.filter((s) => s.person_id && s.published_at).map((s) => ({
    ...s, starts_at: new Date(new Date(s.starts_at).getTime() - 7 * 86400000).toISOString(), ends_at: new Date(new Date(s.ends_at).getTime() - 7 * 86400000).toISOString(), past: true,
  }))
  let n = 0
  for (const s of [...lastWeek, ...db.shifts]) {
    if (!s.person_id || !s.published_at || new Date(s.ends_at).getTime() > nowMs) continue
    if (s.person_id === personId('tom') && !s.past && new Date(s.starts_at) > tomIn) continue
    n++
    const late = n % 7 === 3 ? 9 : -((n * 3) % 6)
    const shift = s.past ? null : s
    const event = { id: newId(), business_id: BUSINESS, person_id: s.person_id, site_id: s.site_id, shift_id: shift?.id || null,
      clock_in_at: new Date(new Date(s.starts_at).getTime() + minutes(late)).toISOString(),
      clock_out_at: new Date(new Date(s.ends_at).getTime() + minutes((n * 5) % 12)).toISOString(),
      in_method: n % 3 ? 'phone' : 'kiosk', out_method: n % 3 ? 'phone' : 'kiosk', fixed_by: null, fix_reason: null,
      approved_by: s.past ? personId('sian') : null, approved_at: s.past ? new Date(monday.getTime() - 86400000).toISOString() : null }
    if (n === 5 && !s.past) { event.fixed_by = personId('rhys'); event.fix_reason = 'Forgot to clock out' }
    db.clock_events.push(event)
    if (s.break_minutes) {
      const mid = (new Date(s.starts_at).getTime() + new Date(s.ends_at).getTime()) / 2
      db.clock_breaks.push({ id: newId(), business_id: BUSINESS, clock_event_id: event.id, started_at: new Date(mid).toISOString(),
        ended_at: new Date(mid + minutes(s.break_minutes)).toISOString(), paid: false })
    }
  }

  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const year = new Date().getFullYear()
  db.time_off_requests = [
    { id: newId(), business_id: BUSINESS, person_id: personId('megan'), kind: 'holiday', starts_on: iso(day(5)), ends_on: iso(day(5)), hours: 6,
      reason: 'Family wedding', status: 'pending', created_at: day(-2).toISOString() },
    { id: newId(), business_id: BUSINESS, person_id: personId('owain'), kind: 'holiday', starts_on: iso(day(14)), ends_on: iso(day(18)), hours: 24,
      reason: 'Holiday', status: 'pending', created_at: day(-1).toISOString() },
    { id: newId(), business_id: BUSINESS, person_id: personId('cerys'), kind: 'holiday', starts_on: iso(day(21)), ends_on: iso(day(25)), hours: 40,
      reason: 'Tenerife', status: 'approved', created_at: day(-20).toISOString() },
    { id: newId(), business_id: BUSINESS, person_id: personId('ffion'), kind: 'holiday', starts_on: iso(day(19)), ends_on: iso(day(20)), hours: 12,
      reason: null, status: 'approved', created_at: day(-12).toISOString() },
    { id: newId(), business_id: BUSINESS, person_id: personId('ffion'), kind: 'holiday', starts_on: `${year}-12-27`, ends_on: `${year}-12-27`, hours: 6,
      reason: null, status: 'pending', created_at: day(-1).toISOString() },
    { id: newId(), business_id: BUSINESS, person_id: personId('ffion'), kind: 'holiday', starts_on: `${year}-08-11`, ends_on: `${year}-08-15`, hours: 24,
      reason: 'Pembrokeshire', status: 'approved', created_at: `${year}-06-01T10:00:00Z` },
    { id: newId(), business_id: BUSINESS, person_id: personId('ffion'), kind: 'holiday', starts_on: `${year}-04-06`, ends_on: `${year}-04-08`, hours: 18,
      reason: null, status: 'approved', created_at: `${year}-03-01T10:00:00Z` },
  ]
  db.time_off_blackouts = [
    { id: newId(), business_id: BUSINESS, site_id: null, department_id: null, starts_on: `${year}-12-19`, ends_on: `${year}-12-24`, reason: 'Christmas parties' },
  ]
  db.person_pins = Object.entries(PINS).map(([key, pin]) => ({ person_id: personId(key), pin }))
  db.kiosk_attempts = []
  db.swap_requests = [
    { id: newId(), business_id: BUSINESS, from_person_id: personId('rhys'), to_person_id: personId('tom'), shift_day: day(3).toISOString(), status: 'accepted_by_colleague' },
  ]
  return db
}

const db = IS_DEMO ? seed() : null

// ── A small query builder with the slice of the supabase-js API the app uses ──

function project(row, columns, table) {
  if (!columns || columns.trim() === '*') return { ...row }
  const out = {}
  for (const raw of columns.split(/,(?![^(]*\))/).map((c) => c.trim()).filter(Boolean)) {
    const nested = raw.match(/^(\w+)\(([^)]*)\)$/)
    if (nested) {
      const [, rel, cols] = nested
      const fk = `${rel.replace(/s$/, '')}_id`
      const parent = (db[rel] || []).find((r) => r.id === row[fk])
      out[rel] = parent ? project(parent, cols, rel) : null
    } else if (raw === '*') Object.assign(out, row)
    else out[raw] = row[raw]
  }
  return out
}

class Query {
  constructor(table) {
    this.table = table
    this.filters = []
    this.op = 'select'
    this.columns = '*'
    this.wantSingle = false
  }
  select(columns = '*') { if (this.op === 'select') this.columns = columns; else this.returning = columns; return this }
  insert(rows) { this.op = 'insert'; this.payload = Array.isArray(rows) ? rows : [rows]; return this }
  update(values) { this.op = 'update'; this.payload = values; return this }
  delete() { this.op = 'delete'; return this }
  eq(c, v) { this.filters.push((r) => r[c] === v); return this }
  neq(c, v) { this.filters.push((r) => r[c] !== v); return this }
  in(c, vs) { this.filters.push((r) => vs.includes(r[c])); return this }
  gte(c, v) { this.filters.push((r) => r[c] >= v); return this }
  gt(c, v) { this.filters.push((r) => r[c] > v); return this }
  lte(c, v) { this.filters.push((r) => r[c] <= v); return this }
  lt(c, v) { this.filters.push((r) => r[c] < v); return this }
  is(c, v) { this.filters.push((r) => (r[c] ?? null) === v); return this }
  not(c, op, v) { this.filters.push((r) => (op === 'is' ? (r[c] ?? null) !== v : r[c] !== v)); return this }
  order(c, { ascending = true } = {}) { this.sort = { c, ascending }; return this }
  limit(n) { this.max = n; return this }
  single() { this.wantSingle = true; return this }
  maybeSingle() { this.wantSingle = true; this.maybe = true; return this }

  run() {
    const table = db[this.table] || (db[this.table] = [])
    const match = (r) => this.filters.every((f) => f(r))
    let rows
    if (this.op === 'insert') {
      rows = this.payload.map((r) => ({ id: newId(), published_at: null, break_minutes: 0, ...r }))
      table.push(...rows)
      if (!this.returning) return { data: null, error: null }
      rows = rows.map((r) => project(r, this.returning, this.table))
    } else if (this.op === 'update') {
      rows = table.filter(match)
      rows.forEach((r) => Object.assign(r, this.payload))
    } else if (this.op === 'delete') {
      db[this.table] = table.filter((r) => !match(r))
      return { data: null, error: null }
    } else {
      rows = table.filter(match)
      if (this.sort) {
        const { c, ascending } = this.sort
        rows = [...rows].sort((a, b) => (a[c] > b[c] ? 1 : a[c] < b[c] ? -1 : 0) * (ascending ? 1 : -1))
      }
      if (this.max) rows = rows.slice(0, this.max)
      rows = rows.map((r) => project(r, this.columns, this.table))
    }
    if (this.wantSingle) {
      if (rows.length !== 1 && !this.maybe) return { data: null, error: { message: 'Expected one row' } }
      return { data: rows[0] || null, error: null }
    }
    return { data: rows, error: null }
  }
  then(resolve, reject) { return Promise.resolve().then(() => this.run()).then(resolve, reject) }
}

// ── Functions ────────────────────────────────────────────────────────────────

const OWNER_PERMS = ['rota.view_all', 'rota.edit', 'rota.publish', 'shifts.approve_swaps', 'timeoff.approve', 'timesheets.approve',
  'clock.fix', 'staff.view_details', 'staff.manage', 'pay.view', 'pay.edit', 'settings.manage', 'activity.view', 'billing.manage', 'business.close']

function me() {
  return DEMO_AS === 'ffion' ? personId('ffion') : personId('sian')
}


// ── Clock-ins, time off and timesheets (mirrors the database functions) ─────

const fail = (message) => { const e = new Error(message); e.demo = true; throw e }
const nowIso = () => new Date().toISOString()
const localDate = (value) => { const d = new Date(value); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const nameOf = (id) => db.people.find((p) => p.id === id)?.full_name

function paidMinutes(e) {
  const shift = db.shifts.find((s) => s.id === e.shift_id)
  const end = new Date(e.clock_out_at || Date.now())
  const start = new Date(Math.max(new Date(e.clock_in_at), shift ? new Date(shift.starts_at) : 0))
  const breaks = db.clock_breaks.filter((b) => b.clock_event_id === e.id && !b.paid)
    .reduce((n, b) => n + (new Date(b.ended_at || end) - new Date(b.started_at)), 0)
  return Math.max(0, Math.round((end - start - breaks) / 60000))
}

function matchingShift(person, site, at) {
  const t = new Date(at).getTime()
  return db.shifts.filter((s) => s.person_id === person && s.site_id === site && s.published_at && Math.abs(new Date(s.starts_at) - t) <= 7200000)
    .sort((a, b) => Math.abs(new Date(a.starts_at) - t) - Math.abs(new Date(b.starts_at) - t))[0]?.id || null
}

function clockIn(person, site, method) {
  if (db.clock_events.some((e) => e.person_id === person && !e.clock_out_at)) fail('Already clocked in')
  const e = { id: newId(), business_id: BUSINESS, person_id: person, site_id: site, shift_id: matchingShift(person, site, Date.now()), clock_in_at: nowIso(),
    clock_out_at: null, in_method: method, out_method: null, fixed_by: null, fix_reason: null, approved_by: null, approved_at: null }
  db.clock_events.push(e)
  return e.id
}

function clockAction(person, action, method) {
  const e = db.clock_events.find((x) => x.person_id === person && !x.clock_out_at)
  if (!e) fail('Not clocked in')
  const open = db.clock_breaks.find((b) => b.clock_event_id === e.id && !b.ended_at)
  if (action === 'out') { if (open) open.ended_at = nowIso(); e.clock_out_at = nowIso(); e.out_method = method }
  else if (action === 'break_start') { if (open) fail('Already on a break'); db.clock_breaks.push({ id: newId(), business_id: BUSINESS, clock_event_id: e.id, started_at: nowIso(), ended_at: null, paid: false }) }
  else if (action === 'break_end') { if (!open) fail('Not on a break'); open.ended_at = nowIso() }
  return e.id
}

function balance(person, on = localDate(Date.now())) {
  const year = Number(on.slice(0, 4))
  const start = `${year}-01-01`
  const end = `${year}-12-31`
  const d = db.person_details.find((x) => x.person_id === person) || {}
  let method = 'not_set'
  let entitlement = null
  let perDay = null
  if (d.contract_type === 'zero_hours' || d.contract_type === 'casual') {
    method = 'accrued'
    const worked = db.clock_events.filter((e) => e.person_id === person && e.clock_out_at && localDate(e.clock_in_at) >= start && localDate(e.clock_in_at) <= on)
      .reduce((n, e) => n + paidMinutes(e), 0) / 60
    entitlement = Math.round(worked * 12.07) / 100 + 9.5 // plus what was built up before the demo week
  } else if (d.weekly_hours && d.days_per_week) {
    method = 'contract'
    perDay = d.weekly_hours / d.days_per_week
    entitlement = Math.min(5.6 * d.weekly_hours, 28 * perDay)
  }
  const mine = db.time_off_requests.filter((r) => r.person_id === person && r.kind === 'holiday' && r.starts_on >= start && r.starts_on <= end)
  const sum = (list) => list.reduce((n, r) => n + Number(r.hours || 0), 0)
  const taken = sum(mine.filter((r) => r.status === 'approved' && r.starts_on <= on))
  const booked = sum(mine.filter((r) => r.status === 'approved' && r.starts_on > on))
  const pending = sum(mine.filter((r) => r.status === 'pending'))
  return [{ year_start: start, year_end: end, method, entitlement_hours: entitlement, hours_per_day: perDay, taken_hours: taken, booked_hours: booked,
    pending_hours: pending, remaining_hours: entitlement == null ? null : entitlement - taken - booked - pending }]
}

function timeOffHours(person, from, to) {
  const shiftHours = db.shifts.filter((s) => s.person_id === person && localDate(s.starts_at) >= from && localDate(s.starts_at) <= to)
    .reduce((n, s) => n + (new Date(s.ends_at) - new Date(s.starts_at)) / 3600000 - s.break_minutes / 60, 0)
  if (shiftHours > 0) return Math.round(shiftHours * 100) / 100
  const d = db.person_details.find((x) => x.person_id === person) || {}
  if (!d.weekly_hours || !d.days_per_week) return 0
  let days = 0
  for (let t = new Date(`${from}T12:00`); localDate(t) <= to; t.setDate(t.getDate() + 1)) if (d.days_per_week > 5 || (t.getDay() % 6 !== 0)) days++
  return Math.round(Math.min(days, Math.ceil(days / 7) * d.days_per_week) * (d.weekly_hours / d.days_per_week) * 100) / 100
}

const rpcs = {
  claim_invites: () => 0,
  my_businesses: () => {
    const person = db.people.find((p) => p.id === me())
    const roles = db.role_assignments.filter((r) => r.person_id === me()).map((r) => r.role)
    return [{ business_id: BUSINESS, business_name: db.businesses[0].name, person_id: person.id, full_name: person.full_name, roles }]
  },
  my_permissions: () => (DEMO_AS === 'ffion' ? [] : OWNER_PERMS),
  has_perm: ({ p_perm }) => (DEMO_AS === 'ffion' ? false : OWNER_PERMS.includes(p_perm)),
  publish_shifts: ({ p_from, p_to }) => {
    const now = new Date().toISOString()
    let n = 0
    for (const s of db.shifts) if (!s.published_at && s.starts_at >= p_from && s.starts_at < p_to) { s.published_at = now; n++ }
    return n
  },
  create_business: ({ p_name, p_site_name }) => {
    const id = newId()
    db.businesses.push({ id, name: p_name })
    db.sites.push({ id: newId(), business_id: id, name: p_site_name || p_name })
    return id
  },
  has_pin: () => db.person_pins.some((p) => p.person_id === me()),
  set_my_pin: ({ p_pin }) => {
    if (!/^[0-9]{4,6}$/.test(p_pin)) fail('Use a PIN of 4 to 6 digits')
    if (/^(.)\1+$/.test(p_pin) || ['1234', '12345', '123456', '4321', '654321'].includes(p_pin)) fail('That PIN is too easy to guess')
    if (db.person_pins.some((p) => p.pin === p_pin && p.person_id !== me())) fail('That PIN is taken, choose another')
    db.person_pins = db.person_pins.filter((p) => p.person_id !== me()).concat({ person_id: me(), pin: p_pin })
  },
  clock_in: ({ p_site }) => clockIn(me(), p_site, 'phone'),
  clock_action: ({ p_action }) => clockAction(me(), p_action, 'phone'),
  kiosk_clock: ({ p_site, p_pin, p_action }) => {
    if (DEMO_AS === 'ffion') fail('This device isn’t set up as a clock-in tablet for that site')
    const recent = db.kiosk_attempts.filter((t) => t > Date.now() - 300000)
    if (recent.length >= 5) return [{ ok: false, message: 'Too many wrong PINs. Try again in a few minutes.', person_name: null, at: nowIso() }]
    const owner = db.person_pins.find((p) => p.pin === p_pin)?.person_id
    const site = db.departments.filter((d) => db.person_departments.some((m) => m.person_id === owner && m.department_id === d.id)).some((d) => d.site_id === p_site)
    if (!owner || !site) { db.kiosk_attempts.push(Date.now()); return [{ ok: false, message: 'PIN not recognised', person_name: null, at: nowIso() }] }
    try {
      if (p_action === 'in') clockIn(owner, p_site, 'kiosk')
      else clockAction(owner, p_action, 'kiosk')
    } catch (e) {
      return [{ ok: false, message: e.message, person_name: nameOf(owner), at: nowIso() }]
    }
    return [{ ok: true, message: null, person_name: nameOf(owner), at: nowIso() }]
  },
  fix_clock_event: ({ p_event, p_clock_in, p_clock_out, p_reason }) => {
    const e = db.clock_events.find((x) => x.id === p_event)
    if (!String(p_reason || '').trim()) fail('Add a reason for the change')
    if (p_clock_out) db.clock_breaks.filter((b) => b.clock_event_id === e.id && !b.ended_at).forEach((b) => { b.ended_at = p_clock_out })
    Object.assign(e, { clock_in_at: p_clock_in || e.clock_in_at, clock_out_at: p_clock_out, out_method: p_clock_out ? 'manager' : e.out_method,
      fixed_by: me(), fix_reason: p_reason, approved_by: null, approved_at: null })
  },
  add_clock_event: ({ p_person, p_site, p_in, p_out, p_break_minutes, p_reason }) => {
    if (!String(p_reason || '').trim()) fail('Add a reason')
    if (db.clock_events.some((e) => e.person_id === p_person && e.clock_in_at < p_out && (e.clock_out_at || nowIso()) > p_in)) fail('That overlaps another clock-in')
    const e = { id: newId(), business_id: BUSINESS, person_id: p_person, site_id: p_site, shift_id: matchingShift(p_person, p_site, p_in), clock_in_at: p_in,
      clock_out_at: p_out, in_method: 'manager', out_method: 'manager', fixed_by: me(), fix_reason: p_reason, approved_by: null, approved_at: null }
    db.clock_events.push(e)
    if (p_break_minutes > 0) {
      const mid = (new Date(p_in).getTime() + new Date(p_out).getTime()) / 2
      db.clock_breaks.push({ id: newId(), business_id: BUSINESS, clock_event_id: e.id, started_at: new Date(mid).toISOString(), ended_at: new Date(mid + p_break_minutes * 60000).toISOString(), paid: false })
    }
    return e.id
  },
  approve_clock_events: ({ p_events }) => {
    let n = 0
    for (const e of db.clock_events) {
      if (p_events.includes(e.id) && e.clock_out_at && !e.approved_at) { e.approved_by = me(); e.approved_at = nowIso(); n++ }
    }
    return n
  },
  unapprove_clock_event: ({ p_event }) => { Object.assign(db.clock_events.find((e) => e.id === p_event), { approved_by: null, approved_at: null }) },
  timesheet_rows: ({ p_from, p_to, p_site }) => db.clock_events
    .filter((e) => localDate(e.clock_in_at) >= p_from && localDate(e.clock_in_at) <= p_to && (!p_site || e.site_id === p_site))
    .filter((e) => DEMO_AS !== 'ffion' || e.person_id === me())
    .map((e) => {
      const shift = db.shifts.find((s) => s.id === e.shift_id)
      const dept = db.departments.find((d) => d.id === shift?.department_id)
        || db.departments.find((d) => d.site_id === e.site_id && db.person_departments.some((m) => m.person_id === e.person_id && m.department_id === d.id))
      const breaks = db.clock_breaks.filter((b) => b.clock_event_id === e.id && !b.paid)
        .reduce((n, b) => n + Math.round((new Date(b.ended_at || e.clock_out_at || Date.now()) - new Date(b.started_at)) / 60000), 0)
      return { event_id: e.id, person_id: e.person_id, full_name: nameOf(e.person_id), payroll_id: db.person_details.find((d) => d.person_id === e.person_id)?.payroll_id,
        site_id: e.site_id, site_name: db.sites.find((x) => x.id === e.site_id)?.name, department_name: dept?.name || null, work_date: localDate(e.clock_in_at),
        clock_in_at: e.clock_in_at, clock_out_at: e.clock_out_at, shift_starts_at: shift?.starts_at || null, shift_ends_at: shift?.ends_at || null,
        break_minutes: breaks, paid_minutes: paidMinutes(e), hourly_rate_pence: db.person_pay.find((x) => x.person_id === e.person_id)?.hourly_rate_pence ?? null,
        approved: Boolean(e.approved_at), approved_at: e.approved_at, fixed: Boolean(e.fixed_by), fix_reason: e.fix_reason }
    })
    .sort((a, b) => a.full_name.localeCompare(b.full_name) || a.clock_in_at.localeCompare(b.clock_in_at)),
  holiday_balance: ({ p_person, p_on }) => balance(p_person, p_on || undefined),
  request_time_off: ({ p_starts, p_ends, p_kind, p_reason, p_hours }) => {
    if (p_ends < p_starts) fail('The end date is before the start date')
    if (db.time_off_requests.some((r) => r.person_id === me() && ['pending', 'approved'].includes(r.status) && r.starts_on <= p_ends && r.ends_on >= p_starts)) fail('You already have time off in those dates')
    if (['holiday', 'unpaid'].includes(p_kind)) {
      const block = db.time_off_blackouts.find((b) => b.starts_on <= p_ends && b.ends_on >= p_starts)
      if (block) fail(`Those dates are blocked for holiday (${block.reason || 'a busy period'})`)
    }
    const hours = p_hours ?? timeOffHours(me(), p_starts, p_ends)
    const left = balance(me(), p_starts)[0].remaining_hours
    if (p_kind === 'holiday' && left != null && hours > left + 0.01) fail(`That’s ${hours} hours and you have ${Math.max(0, left)} hours left this holiday year`)
    const r = { id: newId(), business_id: BUSINESS, person_id: me(), kind: p_kind, starts_on: p_starts, ends_on: p_ends, hours, reason: p_reason, status: 'pending', created_at: nowIso() }
    db.time_off_requests.push(r)
    return r.id
  },
  decide_time_off: ({ p_request, p_approve, p_note, p_hours }) => {
    const r = db.time_off_requests.find((x) => x.id === p_request)
    if (r.status !== 'pending') fail(`This request has already been ${r.status}`)
    Object.assign(r, { status: p_approve ? 'approved' : 'declined', hours: p_hours ?? r.hours, decided_by: me(), decided_at: nowIso(), decision_note: p_note || null })
  },
  cancel_time_off: ({ p_request }) => { db.time_off_requests.find((x) => x.id === p_request).status = 'cancelled' },
  invite_person: ({ p_business, p_full_name, p_email, p_department, p_contract }) => {
    const id = newId()
    db.people.push({ id, business_id: p_business, full_name: p_full_name, user_id: null, active: true })
    db.person_details.push({ person_id: id, business_id: p_business, email: p_email, contract_type: p_contract || null })
    if (p_department) db.person_departments.push({ person_id: id, department_id: p_department, business_id: p_business, is_primary: true })
    db.role_assignments.push({ person_id: id, business_id: p_business, role: 'staff' })
    return id
  },
}

// ── Auth ─────────────────────────────────────────────────────────────────────

const session = { user: { id: 'demo-user', email: DEMO_AS === 'ffion' ? 'ffion@bridgeinn.example' : 'sian@bridgeinn.example' } }
const listeners = new Set()

export const demoClient = {
  from: (table) => new Query(table),
  rpc: async (name, args = {}) => {
    const fn = rpcs[name]
    if (!fn) return { data: null, error: { message: `${name} isn’t available in the demo` } }
    try {
      return { data: fn(args) ?? null, error: null }
    } catch (e) {
      return { data: null, error: { message: e.message } }
    }
  },
  auth: {
    getSession: async () => ({ data: { session }, error: null }),
    onAuthStateChange: (cb) => {
      listeners.add(cb)
      return { data: { subscription: { unsubscribe: () => listeners.delete(cb) } } }
    },
    signOut: async () => {
      try { sessionStorage.removeItem(DEMO_KEY) } catch { /* nothing stored */ }
      window.location.href = '/signin?demo=0'
      return { error: null }
    },
    signInWithPassword: async () => ({ data: { session }, error: null }),
    signInWithOtp: async () => ({ data: {}, error: null }),
    signInWithOAuth: async () => ({ data: {}, error: null }),
    signUp: async () => ({ data: { session }, error: null }),
  },
}
