import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { sbGetMany } from '../../utils/supabase'
import { downloadCsv } from '../../utils/exports'
import { canViewReports } from '../../utils/permissions'

function formatDate(value) {
  return value ? new Date(value).toLocaleDateString('en-GB') : ''
}

export default function Reports() {
  const { tenant, tenantUser } = useAuth()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState('')
  const [range, setRange] = useState('all')
  const [data, setData] = useState({
    staff: [],
    leave: [],
    clients: [],
    invoices: [],
    timesheets: [],
    tasks: [],
    outreach: [],
  })
  const canView = canViewReports(tenantUser?.role)

  useEffect(() => { load() }, [tenant?.id])

  const load = async () => {
    if (!tenant?.id) return
    setLoading(true)
    const [staff, leave, clients, invoices, timesheets, tasks, outreach] = await Promise.all([
      sbGetMany('tenant_users', `tenant_id=eq.${tenant.id}&order=created_at.asc`),
      sbGetMany('leave_requests', `tenant_id=eq.${tenant.id}&order=created_at.desc`),
      sbGetMany('clients', `tenant_id=eq.${tenant.id}&order=created_at.desc`),
      sbGetMany('invoices', `tenant_id=eq.${tenant.id}&order=created_at.desc`),
      sbGetMany('timesheets', `tenant_id=eq.${tenant.id}&order=date.desc`),
      sbGetMany('tasks', `tenant_id=eq.${tenant.id}&order=created_at.desc`),
      sbGetMany('outreach', `tenant_id=eq.${tenant.id}&order=created_at.desc`),
    ])
    setData({
      staff: staff || [],
      leave: leave || [],
      clients: clients || [],
      invoices: invoices || [],
      timesheets: timesheets || [],
      tasks: tasks || [],
      outreach: outreach || [],
    })
    setLoading(false)
  }

  const lookups = useMemo(() => {
    const staffNames = Object.fromEntries(data.staff.map(member => [member.id, member.full_name || member.email || 'Unknown']))
    const clientNames = Object.fromEntries(data.clients.map(client => [client.id, client.name]))
    return { staffNames, clientNames }
  }, [data.staff, data.clients])

  const rangeCutoff = useMemo(() => {
    if (range === 'all') return null
    const now = new Date()
    if (range === 'last_30_days') return new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30)
    return new Date(now.getFullYear(), now.getMonth(), 1)
  }, [range])

  const inRange = (value) => {
    if (!rangeCutoff) return true
    if (!value) return false
    return new Date(value) >= rangeCutoff
  }

  const reportData = useMemo(() => ({
    staff: data.staff,
    leave: data.leave.filter(request => inRange(request.created_at || request.start_date)),
    clients: data.clients.filter(client => inRange(client.created_at)),
    invoices: data.invoices.filter(invoice => inRange(invoice.created_at || invoice.due_date)),
    timesheets: data.timesheets.filter(entry => inRange(entry.date || entry.created_at)),
    tasks: data.tasks.filter(task => inRange(task.created_at || task.due_date)),
    outreach: data.outreach.filter(lead => inRange(lead.created_at || lead.last_contacted)),
  }), [data, rangeCutoff])

  const cards = [
    { label: 'Team records', value: reportData.staff.length, note: 'Active, invited, and suspended users' },
    { label: 'Leave requests', value: reportData.leave.length, note: 'Requests in the selected period' },
    { label: 'Clients', value: reportData.clients.length, note: 'Lead and active customer records' },
    { label: 'Invoices', value: reportData.invoices.length, note: 'Commercial records in range' },
    { label: 'Timesheets', value: reportData.timesheets.length, note: 'Submitted time entries' },
    { label: 'Tasks', value: reportData.tasks.length, note: 'Operational work items' },
    { label: 'Outreach', value: reportData.outreach.length, note: 'Prospecting and lead records' },
  ]

  const exports = [
    {
      key: 'staff',
      title: 'Staff export',
      description: 'Team directory, roles, statuses, and join dates.',
      filename: `staff-export-${tenant?.slug || 'workspace'}.csv`,
      rows: reportData.staff.map(member => ({
        full_name: member.full_name || '',
        email: member.email || '',
        role: member.role || '',
        status: member.status || '',
        joined_at: formatDate(member.joined_at),
        created_at: formatDate(member.created_at),
      })),
    },
    {
      key: 'leave',
      title: 'Leave export',
      description: 'Leave types, dates, statuses, and who reviewed them.',
      filename: `leave-export-${tenant?.slug || 'workspace'}.csv`,
      rows: reportData.leave.map(request => ({
        employee: lookups.staffNames[request.tenant_user_id] || '',
        type: request.type || '',
        start_date: formatDate(request.start_date),
        end_date: formatDate(request.end_date),
        days: request.days || '',
        status: request.status || '',
        reviewed_by: lookups.staffNames[request.reviewed_by] || '',
        reviewed_at: formatDate(request.reviewed_at),
      })),
    },
    {
      key: 'clients',
      title: 'Client export',
      description: 'Client contacts, pipeline state, and commercial value.',
      filename: `clients-export-${tenant?.slug || 'workspace'}.csv`,
      rows: reportData.clients.map(client => ({
        name: client.name || '',
        email: client.email || '',
        phone: client.phone || '',
        website: client.website || '',
        status: client.status || '',
        plan: client.plan || '',
        value: client.value || '',
        created_at: formatDate(client.created_at),
      })),
    },
    {
      key: 'invoices',
      title: 'Invoice export',
      description: 'Invoice status, amounts, dates, and linked clients.',
      filename: `invoices-export-${tenant?.slug || 'workspace'}.csv`,
      rows: reportData.invoices.map(invoice => ({
        invoice_number: invoice.invoice_number || '',
        client: lookups.clientNames[invoice.client_id] || '',
        description: invoice.description || '',
        amount: invoice.amount || '',
        status: invoice.status || '',
        due_date: formatDate(invoice.due_date),
        paid_at: formatDate(invoice.paid_at),
        created_at: formatDate(invoice.created_at),
      })),
    },
    {
      key: 'timesheets',
      title: 'Timesheet export',
      description: 'Hours logged by day, employee, client, and approval status.',
      filename: `timesheets-export-${tenant?.slug || 'workspace'}.csv`,
      rows: reportData.timesheets.map(entry => ({
        employee: lookups.staffNames[entry.tenant_user_id] || '',
        date: formatDate(entry.date),
        hours: entry.hours || '',
        description: entry.description || '',
        client: lookups.clientNames[entry.client_id] || 'Internal',
        status: entry.status || '',
        approved_by: lookups.staffNames[entry.approved_by] || '',
      })),
    },
    {
      key: 'tasks',
      title: 'Task export',
      description: 'Task status, ownership, client links, and due dates.',
      filename: `tasks-export-${tenant?.slug || 'workspace'}.csv`,
      rows: reportData.tasks.map(task => ({
        title: task.title || '',
        description: task.description || '',
        status: task.status || '',
        priority: task.priority || '',
        assigned_to: lookups.staffNames[task.assigned_to] || '',
        client: lookups.clientNames[task.client_id] || '',
        due_date: formatDate(task.due_date),
        created_at: formatDate(task.created_at),
      })),
    },
    {
      key: 'outreach',
      title: 'Outreach export',
      description: 'Lead records, contact status, and last-touch activity.',
      filename: `outreach-export-${tenant?.slug || 'workspace'}.csv`,
      rows: reportData.outreach.map(lead => ({
        business_name: lead.business_name || '',
        contact_name: lead.contact_name || '',
        email: lead.email || '',
        phone: lead.phone || '',
        website: lead.website || '',
        status: lead.status || '',
        notes: lead.notes || '',
        last_contacted: formatDate(lead.last_contacted),
        created_at: formatDate(lead.created_at),
      })),
    },
  ]

  const handleExport = async (config) => {
    setSaving(config.key)
    try {
      downloadCsv(config.filename, config.rows)
    } catch (e) {
      alert(e.message)
    }
    setSaving('')
  }

  if (!canView) return <div className="card card-pad"><p style={{color:'var(--faint)'}}>Manager access required.</p></div>

  return (
    <div className="fade-in page-stack">
      <div className="page-hd">
        <div>
          <h1 className="page-title">Reports</h1>
          <p className="page-sub">Business-ready exports for team, HR, CRM, billing, and time tracking</p>
        </div>
      </div>

      <div className="compact-note">Download clean CSV exports from the live workspace data your customers already manage every day.</div>

      <div className="table-toolbar">
        <div className="filter-pills">
          {[
            ['all', 'All time'],
            ['last_30_days', 'Last 30 days'],
            ['current_month', 'This month'],
          ].map(([value, label]) => (
            <button key={value} onClick={() => setRange(value)} className={`btn btn-sm ${range===value?'btn-primary':'btn-outline'}`}>
              {label}
            </button>
          ))}
        </div>
        <div className="compact-note">Exports are filtered to the selected period where date fields exist.</div>
      </div>

      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
        {cards.map(card => (
          <div key={card.label} className="stat-card">
            <div className="stat-val" style={{ color: 'var(--blue)', fontSize: 26 }}>{card.value}</div>
            <div className="stat-lbl">{card.label}</div>
            <div style={{ marginTop: 8, fontSize: 12, color: 'var(--faint)' }}>{card.note}</div>
          </div>
        ))}
      </div>

      <div className="card card-pad">
        <div className="section-head">
          <div>
            <h3 className="panel-title">Available exports</h3>
            <div className="panel-sub">Start with CSV downloads that are useful for payroll, operations, finance, and account reviews.</div>
          </div>
        </div>

        {loading ? (
          <div style={{ padding: 24 }}>{[1, 2, 3].map(i => <div key={i} className="skel" style={{ height: 64, marginBottom: 10, borderRadius: 10 }} />)}</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {exports.map(config => (
              <div key={config.key} style={{ border: '1px solid var(--border)', borderRadius: 14, background: 'var(--surface-strong)', padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>{config.title}</div>
                  <div style={{ fontSize: 13, color: 'var(--sub)', marginTop: 6 }}>{config.description}</div>
                </div>
                <div style={{ fontSize: 12, color: 'var(--faint)' }}>
                  {config.rows.length} row{config.rows.length === 1 ? '' : 's'} available
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 11, color: 'var(--faint)', fontFamily: 'var(--font-mono)' }}>{config.filename}</span>
                  <button className="btn btn-outline btn-sm" onClick={() => handleExport(config)} disabled={saving === config.key || config.rows.length === 0}>
                    {saving === config.key ? 'Preparing...' : 'Export CSV'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
