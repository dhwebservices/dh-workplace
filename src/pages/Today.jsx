import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useWorkspace } from '../lib/workspace'
import { addDays, hoursBetween, sameDay, shiftRange } from '../lib/dates'

export default function Today() {
  const { businessId, business } = useWorkspace()
  const [shifts, setShifts] = useState([])
  const [departments, setDepartments] = useState([])

  useEffect(() => {
    if (!businessId || !business?.person_id) return
    const from = new Date()
    from.setHours(0, 0, 0, 0)
    Promise.all([
      supabase.from('shifts').select('*').eq('business_id', businessId).eq('person_id', business.person_id)
        .not('published_at', 'is', null).gte('starts_at', from.toISOString()).lt('starts_at', addDays(from, 14).toISOString()).order('starts_at'),
      supabase.from('departments').select('id, name').eq('business_id', businessId),
    ]).then(([s, d]) => {
      setShifts(s.data || [])
      setDepartments(d.data || [])
    })
  }, [businessId, business?.person_id])

  const now = new Date()
  const next = shifts.find((s) => new Date(s.ends_at) > now)
  const rest = shifts.filter((s) => s !== next)
  const deptName = (id) => departments.find((d) => d.id === id)?.name || ''

  return (
    <main className="page" style={{ background: 'var(--page)' }}>
      <div className="today">
        <div className="date">{now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
        <h1>Today</h1>
        {next ? (
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <div><b style={{ fontSize: 15 }}>{deptName(next.department_id)} shift</b><div className="muted" style={{ fontSize: 13 }}>{business?.business_name}</div></div>
              <span className="status ok" style={{ color: 'var(--brand-dark)', background: 'var(--brand-tint)' }}>
                {sameDay(new Date(next.starts_at), now) ? 'Today' : new Date(next.starts_at).toLocaleDateString('en-GB', { weekday: 'long' })}
              </span>
            </div>
            <div className="time">{shiftRange(next.starts_at, next.ends_at)}</div>
            <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>{hoursBetween(next.starts_at, next.ends_at, next.break_minutes)} hours</p>
          </div>
        ) : (
          <div className="card"><b>No shifts coming up</b><p className="muted" style={{ marginTop: 4 }}>When your manager publishes the rota, your shifts appear here.</p></div>
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
                    <div><b style={{ fontWeight: 500, fontSize: 15 }}>{deptName(s.department_id)}</b><div className="muted" style={{ fontSize: 13 }}>{shiftRange(s.starts_at, s.ends_at)} · {hoursBetween(s.starts_at, s.ends_at, s.break_minutes)} hrs</div></div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </main>
  )
}
