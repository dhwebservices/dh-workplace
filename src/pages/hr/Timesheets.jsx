import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { sbGetMany, sbInsert, sbUpdate } from '../../utils/supabase'

const EMPTY = { date: new Date().toISOString().split('T')[0], hours: '', description: '', client_id: '' }
const STATUS_BADGES = { pending: 'badge-amber', approved: 'badge-green', rejected: 'badge-red' }

function startOfWeek(dateLike) {
  const date = new Date(dateLike)
  const day = date.getDay()
  const diff = day === 0 ? -6 : 1 - day
  date.setHours(0, 0, 0, 0)
  date.setDate(date.getDate() + diff)
  return date
}

function endOfWeek(dateLike) {
  const start = startOfWeek(dateLike)
  const end = new Date(start)
  end.setDate(end.getDate() + 6)
  end.setHours(23, 59, 59, 999)
  return end
}

function sameWeek(a, b) {
  const aStart = startOfWeek(a).getTime()
  const bStart = startOfWeek(b).getTime()
  return aStart === bStart
}

function formatWeekRange(dateLike) {
  const start = startOfWeek(dateLike)
  const end = endOfWeek(dateLike)
  return `${start.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} - ${end.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
}

export default function Timesheets() {
  const { tenant, tenantUser } = useAuth()
  const [entries, setEntries] = useState([])
  const [clients, setClients] = useState([])
  const [staff, setStaff] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({ ...EMPTY })
  const [saving, setSaving] = useState(false)
  const [scope, setScope] = useState('mine')
  const [period, setPeriod] = useState('week')
  const [statusFilter, setStatusFilter] = useState('all')

  const sf = (key, value) => setForm(prev => ({ ...prev, [key]: value }))
  const isManager = ['owner', 'admin', 'manager', 'superadmin'].includes(tenantUser?.role)

  useEffect(() => { load() }, [tenant?.id])

  const load = async () => {
    if (!tenant?.id) return
    setLoading(true)
    const [ts, cl, st] = await Promise.all([
      sbGetMany('timesheets', `tenant_id=eq.${tenant.id}&order=date.desc,created_at.desc`),
      sbGetMany('clients', `tenant_id=eq.${tenant.id}&order=name.asc`),
      sbGetMany('tenant_users', `tenant_id=eq.${tenant.id}&order=full_name.asc`),
    ])
    setEntries(ts || [])
    setClients(cl || [])
    setStaff(st || [])
    setLoading(false)
  }

  const submit = async () => {
    if (!form.date || !form.hours) {
      alert('Date and hours are required.')
      return
    }
    if (Number(form.hours) <= 0) {
      alert('Hours must be greater than zero.')
      return
    }

    setSaving(true)
    try {
      await sbInsert('timesheets', {
        tenant_id: tenant.id,
        tenant_user_id: tenantUser.id,
        date: form.date,
        hours: Number(form.hours),
        description: form.description || null,
        client_id: form.client_id || null,
        status: 'pending',
        created_at: new Date().toISOString(),
      })
      setForm({ ...EMPTY, date: form.date })
      setModal(false)
      await load()
    } catch (e) {
      alert(e.message)
    }
    setSaving(false)
  }

  const reviewEntry = async (entry, nextStatus) => {
    if (!isManager) return
    if (entry.tenant_user_id === tenantUser?.id) {
      alert('You cannot review your own timesheet entry.')
      return
    }
    setSaving(true)
    try {
      await sbUpdate('timesheets', `id=eq.${entry.id}`, {
        status: nextStatus,
        approved_by: tenantUser.id,
      })
      setEntries(prev => prev.map(item => item.id === entry.id ? { ...item, status: nextStatus, approved_by: tenantUser.id } : item))
    } catch (e) {
      alert(e.message)
    }
    setSaving(false)
  }

  const getStaffName = (id) => staff.find(member => member.id === id)?.full_name || staff.find(member => member.id === id)?.email || 'Unknown'
  const getClientName = (id) => clients.find(client => client.id === id)?.name || 'Internal'
  const thisWeekStart = startOfWeek(new Date())

  const filtered = useMemo(() => {
    return entries.filter(entry => {
      const matchesScope = scope === 'mine' ? entry.tenant_user_id === tenantUser?.id : true
      const matchesStatus = statusFilter === 'all' ? true : entry.status === statusFilter
      const matchesPeriod = period === 'week' ? sameWeek(entry.date, thisWeekStart) : true
      return matchesScope && matchesStatus && matchesPeriod
    })
  }, [entries, scope, statusFilter, period, tenantUser?.id])

  const weeklyEntries = useMemo(() => entries.filter(entry => sameWeek(entry.date, thisWeekStart)), [entries, thisWeekStart])
  const myWeeklyEntries = useMemo(() => weeklyEntries.filter(entry => entry.tenant_user_id === tenantUser?.id), [weeklyEntries, tenantUser?.id])
  const pendingApprovals = useMemo(() => weeklyEntries.filter(entry => entry.status === 'pending' && entry.tenant_user_id !== tenantUser?.id).length, [weeklyEntries, tenantUser?.id])

  const summary = {
    myHours: myWeeklyEntries.reduce((sum, entry) => sum + Number(entry.hours || 0), 0),
    approvedHours: myWeeklyEntries.filter(entry => entry.status === 'approved').reduce((sum, entry) => sum + Number(entry.hours || 0), 0),
    pendingHours: myWeeklyEntries.filter(entry => entry.status === 'pending').reduce((sum, entry) => sum + Number(entry.hours || 0), 0),
    filteredHours: filtered.reduce((sum, entry) => sum + Number(entry.hours || 0), 0),
  }

  const groupedWeeks = useMemo(() => {
    return filtered.reduce((groups, entry) => {
      const key = startOfWeek(entry.date).toISOString()
      if (!groups[key]) groups[key] = []
      groups[key].push(entry)
      return groups
    }, {})
  }, [filtered])

  const weekKeys = Object.keys(groupedWeeks).sort((a, b) => new Date(b) - new Date(a))

  return (
    <div className="fade-in page-stack">
      <div className="page-hd">
        <div>
          <h1 className="page-title">Timesheets</h1>
          <p className="page-sub">Weekly time logging, client allocation, and approval workflow</p>
        </div>
        <button className="btn btn-primary" onClick={() => setModal(true)}>+ Log hours</button>
      </div>

      <div className="kpi-strip">
        <div className="kpi-cell">
          <div className="kpi-cell-label">This week</div>
          <div className="kpi-cell-value">{summary.myHours.toFixed(1)}h</div>
        </div>
        <div className="kpi-cell">
          <div className="kpi-cell-label">Pending</div>
          <div className="kpi-cell-value">{summary.pendingHours.toFixed(1)}h</div>
        </div>
        <div className="kpi-cell">
          <div className="kpi-cell-label">Approved</div>
          <div className="kpi-cell-value">{summary.approvedHours.toFixed(1)}h</div>
        </div>
        <div className="kpi-cell">
          <div className="kpi-cell-label">Manager queue</div>
          <div className="kpi-cell-value">{isManager ? pendingApprovals : 'N/A'}</div>
        </div>
      </div>

      <div className="table-toolbar">
        <div className="filter-pills">
          {[['mine', 'My entries'], isManager && ['all', 'All staff']].filter(Boolean).map(([key, label]) => (
            <button key={key} onClick={() => setScope(key)} className={`btn btn-sm ${scope === key ? 'btn-primary' : 'btn-outline'}`}>
              {label}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <select className="inp" value={period} onChange={e => setPeriod(e.target.value)} style={{ width: 'auto', minWidth: 140 }}>
            <option value="week">This week</option>
            <option value="all">All weeks</option>
          </select>
          <select className="inp" value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ width: 'auto', minWidth: 140 }}>
            <option value="all">All statuses</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
        <div className="compact-note">
          {period === 'week' ? `Showing week ${formatWeekRange(thisWeekStart)}` : `${summary.filteredHours.toFixed(1)} hours across all saved entries`}
        </div>
      </div>

      <div className="card card-pad table-card">
        {loading ? (
          <div style={{ padding: 24 }}>
            {[1, 2, 3].map(i => <div key={i} className="skel" style={{ height: 52, marginBottom: 8, borderRadius: 8 }} />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty"><p>No timesheet entries match the current filters</p></div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {weekKeys.map(weekKey => {
              const weekEntries = groupedWeeks[weekKey]
              const weekHours = weekEntries.reduce((sum, entry) => sum + Number(entry.hours || 0), 0)
              return (
                <div key={weekKey} style={{ border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', background: 'var(--card)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center', padding: '14px 16px', borderBottom: '1px solid var(--border2)', background: 'var(--bg)' }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700 }}>{formatWeekRange(weekKey)}</div>
                      <div style={{ fontSize: 12, color: 'var(--faint)' }}>{weekEntries.length} entr{weekEntries.length === 1 ? 'y' : 'ies'}</div>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{weekHours.toFixed(1)}h</div>
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table className="tbl">
                      <thead>
                        <tr>
                          {scope === 'all' && <th>Staff</th>}
                          <th>Date</th>
                          <th>Hours</th>
                          <th>Description</th>
                          <th>Client</th>
                          <th>Status</th>
                          {isManager && <th>Actions</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {weekEntries.map(entry => {
                          const canReview = isManager && entry.status === 'pending' && entry.tenant_user_id !== tenantUser?.id
                          return (
                            <tr key={entry.id}>
                              {scope === 'all' && <td className="t-main">{getStaffName(entry.tenant_user_id)}</td>}
                              <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{new Date(entry.date).toLocaleDateString('en-GB')}</td>
                              <td style={{ fontWeight: 700 }}>{Number(entry.hours).toFixed(1)}h</td>
                              <td style={{ color: 'var(--sub)', fontSize: 13, minWidth: 220 }}>{entry.description || 'No description'}</td>
                              <td style={{ fontSize: 12, color: 'var(--faint)' }}>{getClientName(entry.client_id)}</td>
                              <td><span className={`badge ${STATUS_BADGES[entry.status] || 'badge-grey'}`} style={{ textTransform: 'capitalize' }}>{entry.status}</span></td>
                              {isManager && (
                                <td>
                                  {canReview ? (
                                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                      <button className="btn btn-sm btn-outline" onClick={() => reviewEntry(entry, 'approved')} disabled={saving}>Approve</button>
                                      <button className="btn btn-sm btn-outline" onClick={() => reviewEntry(entry, 'rejected')} disabled={saving} style={{ color: 'var(--red)', borderColor: 'rgba(222,91,77,0.22)' }}>Reject</button>
                                    </div>
                                  ) : (
                                    <span style={{ fontSize: 12, color: 'var(--faint)' }}>
                                      {entry.tenant_user_id === tenantUser?.id && entry.status === 'pending' ? 'Own entry' : 'Reviewed'}
                                    </span>
                                  )}
                                </td>
                              )}
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {modal && (
        <div className="modal-overlay" onClick={() => setModal(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-hd">
              <span className="modal-title">Log hours</span>
              <button onClick={() => setModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--faint)' }}>x</button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div className="fg">
                  <div>
                    <label className="lbl">Date</label>
                    <input className="inp" type="date" value={form.date} onChange={e => sf('date', e.target.value)} />
                  </div>
                  <div>
                    <label className="lbl">Hours</label>
                    <input className="inp" type="number" min="0.5" max="24" step="0.5" value={form.hours} onChange={e => sf('hours', e.target.value)} placeholder="7.5" />
                  </div>
                </div>
                <div>
                  <label className="lbl">Description</label>
                  <input className="inp" value={form.description} onChange={e => sf('description', e.target.value)} placeholder="What did you work on?" />
                </div>
                <div>
                  <label className="lbl">Client</label>
                  <select className="inp" value={form.client_id} onChange={e => sf('client_id', e.target.value)}>
                    <option value="">Internal / no client</option>
                    {clients.map(client => <option key={client.id} value={client.id}>{client.name}</option>)}
                  </select>
                </div>
              </div>
            </div>
            <div className="modal-ft">
              <button className="btn btn-outline" onClick={() => setModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={submit} disabled={saving}>{saving ? 'Saving...' : 'Log hours'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
