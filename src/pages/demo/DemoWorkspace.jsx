import { useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'

const WORKER_URL = import.meta.env.VITE_WORKER_URL

const DEMO_NAV = [
  { label: 'Overview', items: [{ key: 'dashboard', label: 'Dashboard' }] },
  { label: 'HR', items: [
    { key: 'staff', label: 'Staff Directory' },
    { key: 'leave', label: 'Leave' },
    { key: 'documents', label: 'Documents' },
    { key: 'timesheets', label: 'Timesheets' },
  ]},
  { label: 'Clients', items: [
    { key: 'clients', label: 'Clients' },
    { key: 'tasks', label: 'Tasks' },
  ]},
]

export default function DemoWorkspace() {
  const { slug } = useParams()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || ''
  const [snapshot, setSnapshot] = useState(null)
  const [view, setView] = useState('dashboard')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true

    async function loadSnapshot() {
      if (!WORKER_URL) {
        setError('Demo workspace is not configured yet.')
        setLoading(false)
        return
      }
      if (!slug || !token) {
        setError('This demo link is incomplete.')
        setLoading(false)
        return
      }

      setLoading(true)
      setError('')

      try {
        const res = await fetch(WORKER_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'demo_snapshot',
            data: { slug, token },
          }),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Unable to load demo workspace')
        if (active) setSnapshot(json)
      } catch (err) {
        if (active) setError(err.message)
      } finally {
        if (active) setLoading(false)
      }
    }

    loadSnapshot()
    return () => { active = false }
  }, [slug, token])

  const stats = useMemo(() => {
    if (!snapshot) return []
    return [
      { label: 'Team Members', value: snapshot.summary.team_members, colour: 'var(--blue)' },
      { label: 'Active Clients', value: snapshot.summary.active_clients, colour: 'var(--green)' },
      { label: 'Open Tasks', value: snapshot.summary.open_tasks, colour: 'var(--amber)' },
      { label: 'Pending Leave', value: snapshot.leave_requests.filter((item) => item.status === 'pending').length, colour: 'var(--red)' },
    ]
  }, [snapshot])

  const primaryUser = snapshot?.team?.[0]
  const openTasks = useMemo(() => (snapshot?.tasks || []).filter((task) => !['done', 'completed'].includes(task.status)), [snapshot])
  const activeClients = useMemo(() => (snapshot?.clients || []).filter((client) => client.status === 'active'), [snapshot])
  const pendingTimesheets = useMemo(() => (snapshot?.timesheets || []).filter((entry) => entry.status === 'pending'), [snapshot])

  return (
    <div className="app-shell demo-app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, color: 'var(--text)', lineHeight: 1.05, fontWeight: 700 }}>DH Workplace</div>
          {snapshot?.tenant && (
            <>
              <div className="sidebar-brand-name">{snapshot.tenant.name}</div>
              <div className="sidebar-brand-meta">
                <span className="badge badge-blue" style={{ textTransform: 'capitalize' }}>{snapshot.tenant.plan}</span>
                <span className="badge badge-grey">Read only</span>
              </div>
            </>
          )}
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: '10px 0' }}>
          {DEMO_NAV.map((section) => (
            <div key={section.label} className="nav-section">
              <div className="nav-label">{section.label}</div>
              {section.items.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={`nav-item ${view === item.key ? 'active' : ''}`}
                  onClick={() => setView(item.key)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          ))}
        </div>

        <div className="sidebar-user">
          <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--blue-soft)', border: '1px solid var(--blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: 'var(--blue)', flexShrink: 0 }}>
            {(primaryUser?.full_name || 'D').slice(0, 1)}
          </div>
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {primaryUser?.full_name || 'Demo user'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--faint)' }}>{primaryUser?.job_title || 'Workspace owner'}</div>
          </div>
          <span className="badge badge-grey">Demo</span>
        </div>
      </aside>

      <main className="main-content">
        <div className="topbar">
          <div />
          <div className="topbar-actions">
            <div className="workspace-health">
              <span className="workspace-health-dot platform" />
              <div>
                <div className="workspace-health-label">Workspace status</div>
                <div className="workspace-health-value">Read-only demo</div>
              </div>
            </div>
          </div>
        </div>

        <div className="page-body">
          {loading ? (
            <div className="page-stack">
              <div className="skel" style={{ height: 120, borderRadius: 18 }} />
              <div className="skel" style={{ height: 280, borderRadius: 18 }} />
            </div>
          ) : error ? (
            <div className="card card-pad">
              <h1 className="page-title" style={{ marginBottom: 8 }}>Demo unavailable</h1>
              <p className="page-sub">{error}</p>
            </div>
          ) : (
            <>
              {view === 'dashboard' && (
                <div className="fade-in page-stack">
                  <div className="page-hd">
                    <div>
                      <h1 className="page-title">Good {greeting()}, {firstName(primaryUser?.full_name)}</h1>
                      <p className="page-sub">{new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
                    </div>
                  </div>

                  <div className="stats-grid">
                    {stats.map((stat) => (
                      <div key={stat.label} className="stat-card">
                        <div className="stat-val" style={{ color: stat.colour }}>{stat.value}</div>
                        <div className="stat-lbl">{stat.label}</div>
                      </div>
                    ))}
                  </div>

                  <div className="asymmetric-grid">
                    <div className="card card-pad">
                      <div className="section-head">
                        <div>
                          <h3 className="panel-title">Quick actions</h3>
                          <div className="panel-sub">Preview the most common workflows inside the workspace.</div>
                        </div>
                      </div>
                      <div className="stack-sm">
                        {[
                          { label: 'Add team member', note: 'Invite a new person and assign their role' },
                          { label: 'Add client', note: 'Create a client record and assign ownership' },
                          { label: 'Create task', note: 'Capture work, due dates, and assignees' },
                          { label: 'Approve leave', note: 'Review pending time away requests' },
                        ].map((action) => (
                          <div key={action.label} className="list-card" style={{ cursor: 'default' }}>
                            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{action.label}</div>
                            <div style={{ fontSize: 12, color: 'var(--faint)', marginTop: 4 }}>{action.note}</div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="card card-pad">
                      <div className="section-head">
                        <div>
                          <h3 className="panel-title">Workspace summary</h3>
                          <div className="panel-sub">A live snapshot of the seeded demo tenant.</div>
                        </div>
                      </div>
                      <div className="stack-md">
                        <DetailRow label="Plan" value={<span className="badge badge-blue" style={{ textTransform: 'capitalize' }}>{snapshot.tenant.plan}</span>} />
                        <DetailRow label="Seat usage" value={`${snapshot.summary.team_members} / ${snapshot.tenant.seat_limit} used`} />
                        <DetailRow label="Billing" value="Subscription active" />
                        <DetailRow label="Client workload" value={`${activeClients.length} active clients`} />
                        <DetailRow label="Approvals" value={`${snapshot.summary.pending_approvals} awaiting review`} />
                      </div>
                    </div>
                  </div>

                  <div className="card card-pad table-card">
                    <div className="table-toolbar">
                      <div>
                        <h3 className="panel-title">Open tasks</h3>
                        <div className="panel-sub">A read-only look at current delivery and account work.</div>
                      </div>
                    </div>
                    <table className="tbl">
                      <thead>
                        <tr><th>Task</th><th>Assignee</th><th>Priority</th><th>Status</th><th>Due</th></tr>
                      </thead>
                      <tbody>
                        {openTasks.map((task) => (
                          <tr key={task.id}>
                            <td className="t-main">{task.title}</td>
                            <td style={{ color: 'var(--sub)' }}>{findMember(snapshot, task.assigned_to)?.full_name || 'Unassigned'}</td>
                            <td><span className={`badge badge-${priorityTone(task.priority)}`}>{task.priority}</span></td>
                            <td><span className={`badge badge-${statusTone(task.status)}`}>{formatLabel(task.status)}</span></td>
                            <td style={{ color: 'var(--sub)' }}>{task.due_date ? formatDate(task.due_date) : 'No due date'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {view === 'staff' && (
                <div className="fade-in page-stack">
                  <div className="page-hd">
                    <div>
                      <h1 className="page-title">Staff Directory</h1>
                      <p className="page-sub">{snapshot.team.length} team members · read-only demo workspace</p>
                    </div>
                  </div>
                  <div className="record-grid">
                    {snapshot.team.map((member) => (
                      <div key={member.id} className="record-card" style={{ cursor: 'default' }}>
                        <div className="record-card-avatar" style={{ background: 'var(--blue-soft)', border: '2px solid var(--blue-border)', color: 'var(--blue)' }}>
                          {initials(member.full_name || member.email)}
                        </div>
                        <div className="record-card-title">{member.full_name || member.email}</div>
                        <div className="record-card-meta">{member.job_title || member.role}</div>
                        <div className="record-card-meta">{member.department || 'General'}</div>
                        <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <span className="badge badge-blue" style={{ textTransform: 'capitalize' }}>{member.role}</span>
                          <span className={`badge badge-${member.status === 'active' ? 'green' : 'grey'}`} style={{ textTransform: 'capitalize' }}>{member.status}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {view === 'leave' && (
                <div className="fade-in page-stack">
                  <div className="page-hd">
                    <div>
                      <h1 className="page-title">Leave</h1>
                      <p className="page-sub">{snapshot.leave_requests.length} requests across the demo workspace</p>
                    </div>
                  </div>
                  <div className="card card-pad table-card">
                    <table className="tbl">
                      <thead>
                        <tr><th>Person</th><th>Type</th><th>Dates</th><th>Days</th><th>Status</th></tr>
                      </thead>
                      <tbody>
                        {snapshot.leave_requests.map((request) => (
                          <tr key={request.id}>
                            <td className="t-main">{findMember(snapshot, request.tenant_user_id)?.full_name || 'Team member'}</td>
                            <td>{formatLabel(request.type)}</td>
                            <td style={{ color: 'var(--sub)' }}>{formatDate(request.start_date)} - {formatDate(request.end_date)}</td>
                            <td>{request.days}</td>
                            <td><span className={`badge badge-${statusTone(request.status)}`}>{formatLabel(request.status)}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {view === 'documents' && (
                <div className="fade-in page-stack">
                  <div className="page-hd">
                    <div>
                      <h1 className="page-title">Documents</h1>
                      <p className="page-sub">{snapshot.documents.length} files shared inside the workspace</p>
                    </div>
                  </div>
                  <div className="card card-pad table-card">
                    <table className="tbl">
                      <thead>
                        <tr><th>Document</th><th>Category</th><th>Visibility</th></tr>
                      </thead>
                      <tbody>
                        {snapshot.documents.map((document) => (
                          <tr key={document.id}>
                            <td className="t-main">{document.name}</td>
                            <td><span className="badge badge-grey">{formatLabel(document.category)}</span></td>
                            <td style={{ color: 'var(--sub)' }}>{formatLabel(document.visible_to)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {view === 'timesheets' && (
                <div className="fade-in page-stack">
                  <div className="page-hd">
                    <div>
                      <h1 className="page-title">Timesheets</h1>
                      <p className="page-sub">{pendingTimesheets.length} pending entry{pendingTimesheets.length === 1 ? '' : 'ies'} awaiting review</p>
                    </div>
                  </div>
                  <div className="card card-pad table-card">
                    <table className="tbl">
                      <thead>
                        <tr><th>Person</th><th>Date</th><th>Hours</th><th>Description</th><th>Status</th></tr>
                      </thead>
                      <tbody>
                        {snapshot.timesheets.map((entry) => (
                          <tr key={entry.id}>
                            <td className="t-main">{findMember(snapshot, entry.tenant_user_id)?.full_name || 'Team member'}</td>
                            <td style={{ color: 'var(--sub)' }}>{formatDate(entry.date)}</td>
                            <td>{entry.hours}</td>
                            <td>{entry.description}</td>
                            <td><span className={`badge badge-${statusTone(entry.status)}`}>{formatLabel(entry.status)}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {view === 'clients' && (
                <div className="fade-in page-stack">
                  <div className="page-hd">
                    <div>
                      <h1 className="page-title">Clients</h1>
                      <p className="page-sub">{snapshot.clients.length} records across the CRM</p>
                    </div>
                  </div>
                  <div className="card card-pad table-card">
                    <table className="tbl">
                      <thead>
                        <tr><th>Client</th><th>Status</th><th>Value</th><th>Latest invoice</th></tr>
                      </thead>
                      <tbody>
                        {snapshot.clients.map((client) => {
                          const invoice = snapshot.invoices.find((item) => item.client_id === client.id)
                          return (
                            <tr key={client.id}>
                              <td className="t-main">{client.name}</td>
                              <td><span className={`badge badge-${client.status === 'active' ? 'green' : client.status === 'lead' ? 'amber' : 'grey'}`}>{formatLabel(client.status)}</span></td>
                              <td>£{Number(client.value || 0).toLocaleString('en-GB')}</td>
                              <td style={{ color: 'var(--sub)' }}>{invoice ? `${invoice.invoice_number} · £${Number(invoice.amount || 0).toLocaleString('en-GB')}` : 'None'}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {view === 'tasks' && (
                <div className="fade-in page-stack">
                  <div className="page-hd">
                    <div>
                      <h1 className="page-title">Tasks</h1>
                      <p className="page-sub">{snapshot.tasks.length} work items tracked in the demo workspace</p>
                    </div>
                  </div>
                  <div className="card card-pad table-card">
                    <table className="tbl">
                      <thead>
                        <tr><th>Task</th><th>Assignee</th><th>Priority</th><th>Status</th><th>Due</th></tr>
                      </thead>
                      <tbody>
                        {snapshot.tasks.map((task) => (
                          <tr key={task.id}>
                            <td className="t-main">{task.title}</td>
                            <td style={{ color: 'var(--sub)' }}>{findMember(snapshot, task.assigned_to)?.full_name || 'Unassigned'}</td>
                            <td><span className={`badge badge-${priorityTone(task.priority)}`}>{task.priority}</span></td>
                            <td><span className={`badge badge-${statusTone(task.status)}`}>{formatLabel(task.status)}</span></td>
                            <td style={{ color: 'var(--sub)' }}>{task.due_date ? formatDate(task.due_date) : 'No due date'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  )
}

function DetailRow({ label, value }) {
  return (
    <div className="detail-row">
      <span className="detail-row-label">{label}</span>
      <span className="detail-row-value">{value}</span>
    </div>
  )
}

function findMember(snapshot, id) {
  return snapshot?.team?.find((member) => member.id === id)
}

function greeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'morning'
  if (hour < 17) return 'afternoon'
  return 'evening'
}

function firstName(name) {
  return (name || 'there').split(' ')[0]
}

function initials(name) {
  return (name || '?').split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase()
}

function formatDate(value) {
  return new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function formatLabel(value) {
  return String(value || '').replace(/_/g, ' ')
}

function priorityTone(priority) {
  if (priority === 'urgent' || priority === 'high') return 'red'
  if (priority === 'medium') return 'amber'
  return 'blue'
}

function statusTone(status) {
  if (status === 'approved' || status === 'paid' || status === 'active' || status === 'done') return 'green'
  if (status === 'pending' || status === 'todo' || status === 'lead' || status === 'in_progress') return 'amber'
  if (status === 'rejected' || status === 'blocked' || status === 'overdue' || status === 'unpaid') return 'red'
  return 'grey'
}
