import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { friendlyError, supabase } from '../lib/supabase'
import { useWorkspace } from '../lib/workspace'
import { addDays, hoursBetween, parseShiftInput, sameDay, shiftRange, startOfWeek, weekLabel } from '../lib/dates'
import Avatar from '../components/Avatar'

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export default function Rota() {
  const { businessId, can } = useWorkspace()
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()))
  const [departments, setDepartments] = useState([])
  const [people, setPeople] = useState([])
  const [memberships, setMemberships] = useState([])
  const [shifts, setShifts] = useState([])
  const [editable, setEditable] = useState(new Set())
  const [editing, setEditing] = useState(null) // { personId, departmentId, dayIndex }
  const [draftText, setDraftText] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart])
  const weekEnd = useMemo(() => addDays(weekStart, 7), [weekStart])

  const load = useCallback(async () => {
    if (!businessId) return
    const [deptRes, peopleRes, memRes, shiftRes] = await Promise.all([
      supabase.from('departments').select('id, name, colour, site_id, sites(name)').eq('business_id', businessId).order('name'),
      supabase.from('people').select('id, full_name, active').eq('business_id', businessId).eq('active', true).order('full_name'),
      supabase.from('person_departments').select('person_id, department_id').eq('business_id', businessId),
      supabase.from('shifts').select('*').eq('business_id', businessId)
        .gte('starts_at', weekStart.toISOString()).lt('starts_at', weekEnd.toISOString()).order('starts_at'),
    ])
    const firstError = [deptRes, peopleRes, memRes, shiftRes].find((r) => r.error)?.error
    if (firstError) setError(friendlyError(firstError))
    setDepartments(deptRes.data || [])
    setPeople(peopleRes.data || [])
    setMemberships(memRes.data || [])
    setShifts(shiftRes.data || [])

    // Which departments can this user edit? Asked per department so scoped managers get the right grid.
    const checks = await Promise.all((deptRes.data || []).map((d) =>
      supabase.rpc('has_perm', { p_business: businessId, p_perm: 'rota.edit', p_site: null, p_department: d.id })
        .then(({ data }) => (data ? d.id : null))))
    setEditable(new Set(checks.filter(Boolean)))
  }, [businessId, weekStart, weekEnd])

  useEffect(() => { load() }, [load])

  const drafts = shifts.filter((s) => !s.published_at)
  const canPublish = can('rota.publish')

  const rowsByDepartment = useMemo(() => departments.map((dept) => {
    const ids = memberships.filter((m) => m.department_id === dept.id).map((m) => m.person_id)
    const extra = shifts.filter((s) => s.department_id === dept.id && s.person_id && !ids.includes(s.person_id)).map((s) => s.person_id)
    const rowPeople = people.filter((p) => ids.includes(p.id) || extra.includes(p.id))
    const hasOpen = shifts.some((s) => s.department_id === dept.id && !s.person_id)
    return { dept, rowPeople, hasOpen }
  }), [departments, memberships, people, shifts])

  async function addShift(text) {
    const { personId, departmentId, dayIndex } = editing
    const parsed = parseShiftInput(text, days[dayIndex])
    if (!parsed) {
      setError('Type a time like 5-11, 11-7 or 17:30-23')
      return
    }
    const dept = departments.find((d) => d.id === departmentId)
    const { error: insertError } = await supabase.from('shifts').insert({
      business_id: businessId, site_id: dept.site_id, department_id: departmentId, person_id: personId,
      starts_at: parsed.start.toISOString(), ends_at: parsed.end.toISOString(),
    })
    if (insertError) {
      setError(friendlyError(insertError))
      return
    }
    setEditing(null)
    setDraftText('')
    setError('')
    load()
  }

  async function removeShift(id) {
    const { error: deleteError } = await supabase.from('shifts').delete().eq('id', id)
    if (deleteError) setError(friendlyError(deleteError))
    load()
  }

  async function publish() {
    setBusy(true)
    const { error: publishError } = await supabase.rpc('publish_shifts', {
      p_business: businessId, p_from: weekStart.toISOString(), p_to: weekEnd.toISOString(), p_site: null,
    })
    if (publishError) setError(friendlyError(publishError))
    setBusy(false)
    load()
  }

  async function copyLastWeek() {
    setBusy(true)
    const { data: previous, error: loadError } = await supabase.from('shifts').select('*').eq('business_id', businessId)
      .gte('starts_at', addDays(weekStart, -7).toISOString()).lt('starts_at', weekStart.toISOString())
    if (loadError) {
      setError(friendlyError(loadError))
      setBusy(false)
      return
    }
    const existing = new Set(shifts.map((s) => `${s.person_id}|${s.department_id}|${new Date(s.starts_at).getTime()}`))
    const copies = (previous || [])
      .filter((s) => editable.has(s.department_id))
      .map((s) => ({
        business_id: businessId, site_id: s.site_id, department_id: s.department_id, person_id: s.person_id,
        starts_at: addDays(s.starts_at, 7).toISOString(), ends_at: addDays(s.ends_at, 7).toISOString(),
        break_minutes: s.break_minutes, label: s.label,
      }))
      .filter((s) => !existing.has(`${s.person_id}|${s.department_id}|${new Date(s.starts_at).getTime()}`))
    if (copies.length) {
      const { error: insertError } = await supabase.from('shifts').insert(copies)
      if (insertError) setError(friendlyError(insertError))
    }
    setBusy(false)
    load()
  }

  const hoursFor = (personId) => shifts.filter((s) => s.person_id === personId)
    .reduce((sum, s) => sum + hoursBetween(s.starts_at, s.ends_at, s.break_minutes), 0)
  const totalHours = shifts.reduce((sum, s) => sum + hoursBetween(s.starts_at, s.ends_at, s.break_minutes), 0)
  const today = new Date()

  function renderCell(personId, dept, dayIndex) {
    const cellShifts = shifts.filter((s) => s.department_id === dept.id && s.person_id === personId && sameDay(new Date(s.starts_at), days[dayIndex]))
    const isEditing = editing && editing.personId === personId && editing.departmentId === dept.id && editing.dayIndex === dayIndex
    const canEdit = editable.has(dept.id)
    return (
      <div key={dayIndex} className={`cell${cellShifts.length ? '' : ' empty'}`}>
        {cellShifts.map((s) => (
          <div key={s.id} className={`chip c-${dept.colour}${s.published_at ? '' : ' draft'}`} title={s.published_at ? 'Published' : 'Draft'}>
            <b>{shiftRange(s.starts_at, s.ends_at)}</b><span>{s.label || dept.name}</span>
            {canEdit && <button className="x" type="button" aria-label="Remove shift" onClick={() => removeShift(s.id)}>×</button>}
          </div>
        ))}
        {isEditing ? (
          <input className="quick" autoFocus placeholder="5-11" value={draftText}
            onChange={(e) => setDraftText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') addShift(draftText)
              if (e.key === 'Escape') { setEditing(null); setDraftText('') }
            }}
            onBlur={() => { if (!draftText) setEditing(null) }} />
        ) : (canEdit && !cellShifts.length && (
          <button className="add-hint" type="button" aria-label="Add shift"
            onClick={() => { setEditing({ personId, departmentId: dept.id, dayIndex }); setDraftText(''); setError('') }}>+</button>
        ))}
      </div>
    )
  }

  return (
    <main className="page">
      <div className="page-head">
        <h1>Rota</h1>
        <div className="week-nav">
          <button className="arrow" type="button" aria-label="Previous week" onClick={() => setWeekStart(addDays(weekStart, -7))}>‹</button>
          <span className="label">{weekLabel(weekStart)}</span>
          <button className="arrow" type="button" aria-label="Next week" onClick={() => setWeekStart(addDays(weekStart, 7))}>›</button>
          <button className="btn" type="button" style={{ height: 26 }} onClick={() => setWeekStart(startOfWeek(new Date()))}>Today</button>
        </div>
        <div className="spacer" />
        {editable.size > 0 && <button className="btn" type="button" disabled={busy} onClick={copyLastWeek}>Copy Last Week</button>}
        {canPublish && <button className="btn primary" type="button" disabled={busy || !drafts.length} onClick={publish}>Publish</button>}
      </div>
      <nav className="subtabs"><a className="active">Schedule</a></nav>

      {drafts.length > 0 && editable.size > 0 && (
        <div className="banner draft"><b>Draft</b> · {drafts.length} {drafts.length === 1 ? 'shift isn’t' : 'shifts aren’t'} visible to your team until you publish.</div>
      )}
      {error && <div className="banner draft" style={{ color: 'var(--red)' }}>{error}</div>}

      {departments.length === 0 ? (
        <div className="empty-state">
          <h2>No departments yet</h2>
          <p>Add departments like Bar and Kitchen in Team, then build your first week here.</p>
        </div>
      ) : (
        <div className="rota-body">
          <div className="grid" style={{ gridTemplateColumns: '178px repeat(7, minmax(0, 1fr))' }}>
            <div className="corner">{people.length} people</div>
            {days.map((d, i) => (
              <div key={i} className={`head${sameDay(d, today) ? ' today' : ''}`}><span>{DAY_NAMES[i]}</span><b>{d.getDate()}</b></div>
            ))}
            {rowsByDepartment.map(({ dept, rowPeople, hasOpen }) => (
              <Fragment key={dept.id}>
                <div className="dept-row">{dept.name}{departments.some((x) => x.site_id !== dept.site_id) ? ` · ${dept.sites?.name}` : ''}</div>
                {rowPeople.map((p) => (
                  <Fragment key={p.id}>
                    <div className="who"><Avatar name={p.full_name} /><div><div className="nm">{p.full_name}</div><div className="rl">{Math.round(hoursFor(p.id) * 10) / 10} hrs</div></div></div>
                    {days.map((_, i) => renderCell(p.id, dept, i))}
                  </Fragment>
                ))}
                {(hasOpen || editable.has(dept.id)) && (
                  <Fragment>
                    <div className="who"><div><div className="nm">Open shifts</div><div className="rl">Anyone in {dept.name} can claim</div></div></div>
                    {days.map((_, i) => renderCell(null, dept, i))}
                  </Fragment>
                )}
              </Fragment>
            ))}
            <div className="cover" style={{ fontWeight: 600 }}>Cover</div>
            {days.map((d, i) => {
              const dayShifts = shifts.filter((s) => sameDay(new Date(s.starts_at), d))
              const counts = departments.map((dept) => [dept.name, dayShifts.filter((s) => s.department_id === dept.id && s.person_id).length])
                .filter(([, n]) => n > 0)
              return <div key={i} className="cover">{counts.length ? counts.map(([n, c]) => `${c} ${n.toLowerCase()}`).join(' · ') : '—'}</div>
            })}
          </div>

          <aside className="inspector">
            <div className="panel">
              <h3>This Week <span>{weekLabel(weekStart)}</span></h3>
              <div className="big-number">{Math.round(totalHours)} hrs</div>
              <div className="muted" style={{ fontSize: 12.5 }}>{shifts.length} shifts · {drafts.length} in draft</div>
            </div>
            <div className="panel">
              <h3>Quick Entry</h3>
              <p className="form-note">Click an empty day and type the hours, then press Enter. “5-11” is 5pm to 11pm, “11-7” is 11am to 7pm, and “6-12” runs to midnight.</p>
            </div>
          </aside>
        </div>
      )}
    </main>
  )
}
