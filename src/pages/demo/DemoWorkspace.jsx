import { useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'

const WORKER_URL = import.meta.env.VITE_WORKER_URL

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'team', label: 'Team' },
  { key: 'clients', label: 'Clients' },
  { key: 'tasks', label: 'Tasks' },
  { key: 'hr', label: 'HR' },
]

export default function DemoWorkspace() {
  const { slug } = useParams()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || ''
  const [snapshot, setSnapshot] = useState(null)
  const [tab, setTab] = useState('overview')
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
    return () => {
      active = false
    }
  }, [slug, token])

  const stats = useMemo(() => {
    if (!snapshot) return []
    return [
      { label: 'Team members', value: snapshot.summary.team_members },
      { label: 'Active clients', value: snapshot.summary.active_clients },
      { label: 'Open tasks', value: snapshot.summary.open_tasks },
      { label: 'Pending approvals', value: snapshot.summary.pending_approvals },
    ]
  }, [snapshot])

  const taskRows = useMemo(() => (snapshot?.tasks || []).slice(0, 8), [snapshot])
  const teamRows = useMemo(() => snapshot?.team || [], [snapshot])
  const clientRows = useMemo(() => snapshot?.clients || [], [snapshot])
  const documentRows = useMemo(() => snapshot?.documents || [], [snapshot])
  const timesheetRows = useMemo(() => snapshot?.timesheets || [], [snapshot])
  const leaveRows = useMemo(() => snapshot?.leave_requests || [], [snapshot])
  const invoiceRows = useMemo(() => snapshot?.invoices || [], [snapshot])

  return (
    <div className="demo-workspace">
      <div className="demo-shell">
        <div className="demo-topbar">
          <div>
            <div className="demo-brand">DH Workplace</div>
            <div className="demo-meta">Read-only interactive demo</div>
          </div>
          <div className="demo-actions">
            <span className="badge badge-blue">Read only</span>
            <Link to="/signin" className="btn btn-outline btn-sm">Sign in</Link>
            <Link to="/signup" className="btn btn-primary btn-sm">Start free trial</Link>
          </div>
        </div>

        {loading ? (
          <div className="demo-loading">
            {[1, 2, 3].map((item) => <div key={item} className="skel" style={{ height: item === 1 ? 120 : 220, borderRadius: 18 }} />)}
          </div>
        ) : error ? (
          <div className="card card-pad">
            <h1 className="page-title" style={{ marginBottom: 8 }}>Demo unavailable</h1>
            <p className="page-sub" style={{ maxWidth: 540 }}>{error}</p>
          </div>
        ) : (
          <>
            <div className="demo-hero">
              <div className="demo-hero-copy">
                <div className="brand-kicker" style={{ marginBottom: 10 }}>Interactive preview</div>
                <h1 className="page-title" style={{ marginBottom: 10 }}>{snapshot.tenant.name}</h1>
                <p className="page-sub" style={{ maxWidth: 560 }}>
                  This is a seeded workspace shown in read-only mode. It mirrors the product structure buyers see after sign-in, without exposing live customer data.
                </p>
                <div className="sidebar-brand-meta" style={{ marginTop: 14 }}>
                  <span className="badge badge-blue" style={{ textTransform: 'capitalize' }}>{snapshot.tenant.plan}</span>
                  <span className="badge badge-grey" style={{ textTransform: 'capitalize' }}>{snapshot.tenant.demo_template} demo</span>
                  <span className="badge badge-green">{snapshot.tenant.seat_limit} seats</span>
                </div>
              </div>
              <div className="demo-hero-card">
                <div className="workspace-health" style={{ width: '100%', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span className="workspace-health-dot active" />
                    <div>
                      <div className="workspace-health-label">Demo status</div>
                      <div className="workspace-health-value">Public read-only workspace</div>
                    </div>
                  </div>
                  <span className="badge badge-grey">No edits allowed</span>
                </div>
                <div className="kpi-strip" style={{ marginTop: 16 }}>
                  {stats.map((stat) => (
                    <div key={stat.label} className="kpi-cell">
                      <div className="kpi-cell-value">{stat.value}</div>
                      <div className="kpi-cell-label">{stat.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="tabs" style={{ marginBottom: 18 }}>
              {TABS.map((item) => (
                <button key={item.key} className={`tab ${tab === item.key ? 'on' : ''}`} onClick={() => setTab(item.key)}>
                  {item.label}
                </button>
              ))}
            </div>

            {tab === 'overview' && (
              <div className="demo-grid">
                <div className="card card-pad">
                  <div className="table-toolbar" style={{ marginBottom: 16 }}>
                    <div>
                      <h2 style={{ fontSize: 20, marginBottom: 4 }}>Current priorities</h2>
                      <div className="compact-note">A read-only look at active work inside the demo workspace.</div>
                    </div>
                  </div>
                  <table className="tbl">
                    <thead>
                      <tr><th>Task</th><th>Priority</th><th>Status</th><th>Due</th></tr>
                    </thead>
                    <tbody>
                      {taskRows.map((task) => (
                        <tr key={task.id}>
                          <td className="t-main">{task.title}</td>
                          <td><span className={`badge badge-${priorityTone(task.priority)}`}>{task.priority}</span></td>
                          <td><span className={`badge badge-${statusTone(task.status)}`}>{formatLabel(task.status)}</span></td>
                          <td style={{ color: 'var(--sub)' }}>{task.due_date ? formatDate(task.due_date) : 'No due date'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="card card-pad">
                  <h2 style={{ fontSize: 20, marginBottom: 14 }}>What this demo includes</h2>
                  <div className="demo-feature-list">
                    {[
                      'Staff directory with roles and departments',
                      'Client records, tasks, invoices, and outreach',
                      'Leave requests, documents, and timesheets',
                      'Billing, reporting, and admin structure',
                    ].map((item) => (
                      <div key={item} className="demo-feature-item">{item}</div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {tab === 'team' && (
              <div className="record-grid">
                {teamRows.map((member) => (
                  <div key={member.id} className="record-card">
                    <div className="record-card-avatar" style={{ background: 'var(--blue-soft)', color: 'var(--blue)', border: '1px solid var(--blue-border)' }}>
                      {(member.full_name || '?').slice(0, 1)}
                    </div>
                    <div className="record-card-title">{member.full_name}</div>
                    <div className="record-card-meta">{member.job_title || member.role}</div>
                    <div className="record-card-meta">{member.department || 'General'}</div>
                    <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <span className="badge badge-blue" style={{ textTransform: 'capitalize' }}>{member.role}</span>
                      <span className={`badge badge-${member.status === 'active' ? 'green' : 'grey'}`} style={{ textTransform: 'capitalize' }}>{member.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {tab === 'clients' && (
              <div className="card card-pad table-card">
                <table className="tbl">
                  <thead>
                    <tr><th>Client</th><th>Status</th><th>Value</th><th>Open invoice</th></tr>
                  </thead>
                  <tbody>
                    {clientRows.map((client) => {
                      const latestInvoice = invoiceRows.find((invoice) => invoice.client_id === client.id)
                      return (
                        <tr key={client.id}>
                          <td className="t-main">{client.name}</td>
                          <td><span className={`badge badge-${client.status === 'active' ? 'green' : client.status === 'lead' ? 'amber' : 'grey'}`}>{formatLabel(client.status)}</span></td>
                          <td>£{Number(client.value || 0).toLocaleString('en-GB')}</td>
                          <td style={{ color: 'var(--sub)' }}>{latestInvoice ? `£${Number(latestInvoice.amount || 0).toLocaleString('en-GB')}` : 'None'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {tab === 'tasks' && (
              <div className="card card-pad table-card">
                <table className="tbl">
                  <thead>
                    <tr><th>Task</th><th>Assignee</th><th>Priority</th><th>Status</th></tr>
                  </thead>
                  <tbody>
                    {taskRows.map((task) => (
                      <tr key={task.id}>
                        <td className="t-main">{task.title}</td>
                        <td style={{ color: 'var(--sub)' }}>{findMember(snapshot, task.assigned_to)?.full_name || 'Unassigned'}</td>
                        <td><span className={`badge badge-${priorityTone(task.priority)}`}>{task.priority}</span></td>
                        <td><span className={`badge badge-${statusTone(task.status)}`}>{formatLabel(task.status)}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {tab === 'hr' && (
              <div className="demo-grid">
                <div className="card card-pad table-card">
                  <div className="table-toolbar" style={{ marginBottom: 16 }}>
                    <div>
                      <h2 style={{ fontSize: 20, marginBottom: 4 }}>Leave requests</h2>
                      <div className="compact-note">Read-only examples of approval flows inside the workspace.</div>
                    </div>
                  </div>
                  <table className="tbl">
                    <thead>
                      <tr><th>Person</th><th>Type</th><th>Dates</th><th>Status</th></tr>
                    </thead>
                    <tbody>
                      {leaveRows.map((request) => (
                        <tr key={request.id}>
                          <td className="t-main">{findMember(snapshot, request.tenant_user_id)?.full_name || 'Team member'}</td>
                          <td>{formatLabel(request.type)}</td>
                          <td style={{ color: 'var(--sub)' }}>{formatDate(request.start_date)} - {formatDate(request.end_date)}</td>
                          <td><span className={`badge badge-${statusTone(request.status)}`}>{formatLabel(request.status)}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="card card-pad">
                  <h2 style={{ fontSize: 20, marginBottom: 14 }}>Documents and timesheets</h2>
                  <div className="demo-subsection">
                    <div className="compact-note" style={{ marginBottom: 10 }}>Documents</div>
                    {documentRows.map((document) => (
                      <div key={document.id} className="demo-list-row">
                        <span className="t-main">{document.name}</span>
                        <span className="badge badge-grey">{formatLabel(document.category)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="demo-subsection" style={{ marginTop: 18 }}>
                    <div className="compact-note" style={{ marginBottom: 10 }}>Recent timesheets</div>
                    {timesheetRows.map((entry) => (
                      <div key={entry.id} className="demo-list-row">
                        <span className="t-main">{findMember(snapshot, entry.tenant_user_id)?.full_name || 'Team member'}</span>
                        <span style={{ color: 'var(--sub)' }}>{entry.hours}h · {formatLabel(entry.status)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function findMember(snapshot, id) {
  return snapshot?.team?.find((member) => member.id === id)
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
