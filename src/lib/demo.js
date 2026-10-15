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
      { id: SITES.inn, business_id: BUSINESS, name: 'The Bridge Inn', address: 'Bridge Street, Pontypridd' },
      { id: SITES.cafe, business_id: BUSINESS, name: 'Bridge Café', address: 'Taff Street, Pontypridd' },
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
    db.person_details.push({ person_id: id, business_id: BUSINESS, email: `${key}@bridgeinn.example`, contract_type: contract })
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
  db.time_off_requests = [
    { id: newId(), business_id: BUSINESS, person_id: personId('megan'), starts_on: day(5).toISOString().slice(0, 10), ends_on: day(5).toISOString().slice(0, 10),
      reason: 'Family wedding', status: 'pending', created_at: day(-2).toISOString() },
    { id: newId(), business_id: BUSINESS, person_id: personId('owain'), starts_on: day(14).toISOString().slice(0, 10), ends_on: day(18).toISOString().slice(0, 10),
      reason: 'Holiday', status: 'pending', created_at: day(-1).toISOString() },
  ]
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
    return { data: fn(args), error: null }
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
