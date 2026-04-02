import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { sbDelete, sbGetMany, sbInsert, sbUpdate } from '../../utils/supabase'

const DEFAULT_CHECKLIST = [
  'Send welcome email', 'Set up email account', 'Add to team channels',
  'Assign IT equipment', 'Complete contract signing', 'ID verification',
  'Emergency contact form', 'Bank details form', 'Payroll setup',
  'First day induction', 'Introduction to team', 'System access setup',
  'Health & safety briefing', 'Review company policies', '30-day check-in scheduled',
]

function markerFor(memberId) {
  return `[ONBOARDING:${memberId}]`
}

function ageDays(dateValue) {
  if (!dateValue) return 0
  return Math.floor((Date.now() - new Date(dateValue).getTime()) / 86400000)
}

export default function Onboarding() {
  const { tenant, tenantUser } = useAuth()
  const [staff, setStaff] = useState([])
  const [selected, setSelected] = useState(null)
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [savingItem, setSavingItem] = useState('')
  const [filter, setFilter] = useState('all')
  const isAdmin = ['owner', 'admin', 'superadmin'].includes(tenantUser?.role)

  useEffect(() => { load() }, [tenant?.id])

  const load = async () => {
    if (!tenant?.id) return
    setLoading(true)
    const [onboarding, allTasks] = await Promise.all([
      sbGetMany('tenant_users', `tenant_id=eq.${tenant.id}&status=eq.invited&order=created_at.desc`),
      sbGetMany('tasks', `tenant_id=eq.${tenant.id}&order=created_at.desc`),
    ])
    setStaff(onboarding || [])
    setTasks((allTasks || []).filter((task) => task.description?.startsWith('[ONBOARDING:')))
    setLoading(false)
  }

  const starterRows = useMemo(() => {
    return (staff || []).map((member) => {
      const memberTasks = tasks.filter((task) => task.description?.startsWith(markerFor(member.id)))
      const doneCount = DEFAULT_CHECKLIST.filter((item) => memberTasks.find((entry) => entry.title === item && entry.status === 'done')).length
      const progress = Math.round((doneCount / DEFAULT_CHECKLIST.length) * 100)
      const days = ageDays(member.created_at)
      return {
        ...member,
        memberTasks,
        progress,
        ageDays: days,
        isStale: days >= 7,
      }
    }).sort((a, b) => {
      if (a.isStale !== b.isStale) return a.isStale ? -1 : 1
      return new Date(b.created_at) - new Date(a.created_at)
    })
  }, [staff, tasks])

  useEffect(() => {
    if (!selected && starterRows.length) setSelected(starterRows[0])
    if (selected && !starterRows.find((row) => row.id === selected.id)) {
      setSelected(starterRows[0] || null)
    } else if (selected) {
      setSelected(starterRows.find((row) => row.id === selected.id) || selected)
    }
  }, [starterRows])

  const checklist = selected
    ? DEFAULT_CHECKLIST.map((item) => {
        const task = selected.memberTasks.find((entry) => entry.title === item)
        return { item, done: task?.status === 'done', task }
      })
    : []

  const toggle = async (item) => {
    if (!selected) return
    setSavingItem(item)
    const entry = checklist.find((check) => check.item === item)
    try {
      if (entry?.task) {
        const nextStatus = entry.task.status === 'done' ? 'todo' : 'done'
        await sbUpdate('tasks', `id=eq.${entry.task.id}`, { status: nextStatus, updated_at: new Date().toISOString() })
        setTasks((prev) => prev.map((task) => task.id === entry.task.id ? { ...task, status: nextStatus } : task))
      } else {
        const record = {
          tenant_id: tenant.id,
          title: item,
          description: `${markerFor(selected.id)} ${selected.full_name || selected.email}`,
          status: 'done',
          priority: 'medium',
          assigned_to: null,
          client_id: null,
          due_date: null,
          created_by: tenantUser.id,
          created_at: new Date().toISOString(),
        }
        await sbInsert('tasks', record)
        setTasks((prev) => [{ ...record, id: crypto.randomUUID() }, ...prev])
      }

      const nextChecklist = DEFAULT_CHECKLIST.map((label) => {
        if (label === item) return true
        const existing = checklist.find((check) => check.item === label)
        return existing?.task ? existing.task.status === 'done' : existing?.done
      })
      if (nextChecklist.every(Boolean)) {
        await sbUpdate('tenant_users', `id=eq.${selected.id}`, { status: 'active' })
        setStaff((prev) => prev.filter((member) => member.id !== selected.id))
        setSelected(null)
      }
    } catch (e) {
      alert(e.message)
    }
    setSavingItem('')
  }

  const archiveStarter = async (member) => {
    if (!confirm(`Archive ${member.full_name || member.email} from onboarding?`)) return
    try {
      await Promise.all([
        sbDelete('tasks', `tenant_id=eq.${tenant.id}&description=ilike.${encodeURIComponent(markerFor(member.id) + '%')}`),
        sbUpdate('tenant_users', `id=eq.${member.id}`, { status: 'suspended' }),
      ])
      await load()
    } catch (error) {
      alert(error.message)
    }
  }

  const progress = checklist.length ? Math.round(checklist.filter((c) => c.done).length / checklist.length * 100) : 0
  const visibleRows = starterRows.filter((row) => {
    if (filter === 'stale') return row.isStale
    if (filter === 'fresh') return !row.isStale
    return true
  })

  const overview = {
    total: starterRows.length,
    stale: starterRows.filter((row) => row.isStale).length,
    inFlight: starterRows.filter((row) => row.progress > 0 && row.progress < 100).length,
    ready: starterRows.filter((row) => row.progress === 100).length,
  }

  return (
    <div className="fade-in page-stack">
      <div className="page-hd">
        <div>
          <h1 className="page-title">Onboarding</h1>
          <p className="page-sub">Queue, progress, and stale starter control in one operational view.</p>
        </div>
      </div>
      <div className="kpi-strip">
        <div className="kpi-cell">
          <div className="kpi-cell-label">Pending starters</div>
          <div className="kpi-cell-value">{overview.total}</div>
        </div>
        <div className="kpi-cell">
          <div className="kpi-cell-label">Stale starters</div>
          <div className="kpi-cell-value">{overview.stale}</div>
        </div>
        <div className="kpi-cell">
          <div className="kpi-cell-label">In progress</div>
          <div className="kpi-cell-value">{overview.inFlight}</div>
        </div>
        <div className="kpi-cell">
          <div className="kpi-cell-label">Checklist ready</div>
          <div className="kpi-cell-value">{overview.ready}</div>
        </div>
      </div>
      <div className="table-toolbar">
        <div className="filter-pills">
          {[
            ['all', 'All starters'],
            ['stale', 'Stale'],
            ['fresh', 'Fresh'],
          ].map(([key, label]) => (
            <button key={key} onClick={() => setFilter(key)} className={`btn btn-sm ${filter === key ? 'btn-primary' : 'btn-outline'}`}>
              {label}
            </button>
          ))}
        </div>
        <div className="compact-note">Archive stale invites that are no longer real, and keep the queue focused on current onboarding work.</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 20, alignItems: 'start' }}>
        <div className="card table-card" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', fontWeight: 600, fontSize: 13 }}>Starter queue</div>
          {loading ? (
            <div style={{ padding: 16 }}><div className="skel" style={{ height: 48, borderRadius: 8 }} /></div>
          ) : visibleRows.length === 0 ? (
            <div className="empty" style={{ padding: 24 }}><p>No onboarding records match this filter.</p></div>
          ) : visibleRows.map((member) => (
            <button
              key={member.id}
              onClick={() => setSelected(member)}
              style={{ width: '100%', padding: '14px 16px', border: 'none', borderBottom: '1px solid var(--border)', background: selected?.id === member.id ? 'rgba(52,120,246,0.06)' : 'transparent', cursor: 'pointer', textAlign: 'left', transition: 'background 0.15s' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', marginBottom: 4 }}>
                <div style={{ fontWeight: 500, fontSize: 13, color: 'var(--text)' }}>{member.full_name || member.email}</div>
                {member.isStale && <span className="badge badge-amber" style={{ fontSize: 10 }}>Stale</span>}
              </div>
              <div style={{ fontSize: 11, color: 'var(--faint)', fontFamily: 'var(--font-mono)' }}>{member.email}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 8, fontSize: 11, color: 'var(--sub)' }}>
                <span>{member.progress}% complete</span>
                <span>{member.ageDays}d old</span>
              </div>
            </button>
          ))}
        </div>
        {selected ? (
          <div className="card card-pad">
            <div className="section-head">
              <div>
                <h3 className="panel-title">{selected.full_name || selected.email}</h3>
                <div className="panel-sub">Complete the checklist below to activate this account, or archive it if this invite has gone stale.</div>
              </div>
              {selected.isStale && <span className="badge badge-amber">Stale starter</span>}
            </div>
            <div className="kpi-strip" style={{ marginBottom: 18 }}>
              <div className="kpi-cell">
                <div className="kpi-cell-label">Progress</div>
                <div className="kpi-cell-value">{progress}%</div>
              </div>
              <div className="kpi-cell">
                <div className="kpi-cell-label">Invite age</div>
                <div className="kpi-cell-value">{selected.ageDays}d</div>
              </div>
              <div className="kpi-cell">
                <div className="kpi-cell-label">Checklist done</div>
                <div className="kpi-cell-value">{checklist.filter((item) => item.done).length}/{checklist.length}</div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
              <div style={{ flex: 1, height: 6, background: 'var(--border)', borderRadius: 100, overflow: 'hidden' }}>
                <div style={{ width: `${progress}%`, height: '100%', background: 'var(--green)', borderRadius: 100, transition: 'width 0.3s' }} />
              </div>
              <span style={{ fontSize: 13, fontWeight: 600, color: progress === 100 ? 'var(--green)' : 'var(--sub)' }}>{progress}%</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {checklist.map(({ item, done }) => (
                <button
                  key={item}
                  disabled={!isAdmin || savingItem === item}
                  onClick={() => toggle(item)}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 8, border: '1px solid', borderColor: done ? 'var(--green)' : 'var(--border)', background: done ? 'var(--green-soft)' : 'transparent', cursor: isAdmin ? 'pointer' : 'default', textAlign: 'left', transition: 'all 0.15s', opacity: savingItem === item ? 0.7 : 1 }}
                >
                  <div style={{ width: 20, height: 20, borderRadius: '50%', border: `2px solid ${done ? 'var(--green)' : 'var(--border)'}`, background: done ? 'var(--green)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.15s' }}>
                    {done && <span style={{ color: '#fff', fontSize: 8, fontWeight: 700 }}>OK</span>}
                  </div>
                  <span style={{ fontSize: 13, color: done ? 'var(--green)' : 'var(--text)', fontWeight: done ? 500 : 400, textDecoration: done ? 'line-through' : 'none' }}>{item}</span>
                </button>
              ))}
            </div>
            {selected.isStale && isAdmin && (
              <div style={{ marginTop: 18, display: 'flex', justifyContent: 'flex-end' }}>
                <button className="btn btn-outline btn-sm" onClick={() => archiveStarter(selected)}>Archive stale starter</button>
              </div>
            )}
          </div>
        ) : (
          <div className="card card-pad" style={{ textAlign: 'center', padding: 48 }}>
            <p style={{ color: 'var(--faint)', fontSize: 14 }}>Select a starter to view their onboarding checklist.</p>
          </div>
        )}
      </div>
    </div>
  )
}
