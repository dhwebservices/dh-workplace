import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { sbGetMany } from '../../utils/supabase'
import { downloadCsv } from '../../utils/exports'

function formatDate(value) {
  return value ? new Date(value).toLocaleDateString('en-GB') : ''
}

export default function Reports() {
  const { tenant } = useAuth()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState('')
  const [data, setData] = useState({
    staff: [],
    leave: [],
    clients: [],
    invoices: [],
    timesheets: [],
  })

  useEffect(() => { load() }, [tenant?.id])

  const load = async () => {
    if (!tenant?.id) return
    setLoading(true)
    const [staff, leave, clients, invoices, timesheets] = await Promise.all([
      sbGetMany('tenant_users', `tenant_id=eq.${tenant.id}&order=created_at.asc`),
      sbGetMany('leave_requests', `tenant_id=eq.${tenant.id}&order=created_at.desc`),
      sbGetMany('clients', `tenant_id=eq.${tenant.id}&order=created_at.desc`),
      sbGetMany('invoices', `tenant_id=eq.${tenant.id}&order=created_at.desc`),
      sbGetMany('timesheets', `tenant_id=eq.${tenant.id}&order=date.desc`),
    ])
    setData({
      staff: staff || [],
      leave: leave || [],
      clients: clients || [],
      invoices: invoices || [],
      timesheets: timesheets || [],
    })
    setLoading(false)
  }

  const lookups = useMemo(() => {
    const staffNames = Object.fromEntries(data.staff.map(member => [member.id, member.full_name || member.email || 'Unknown']))
    const clientNames = Object.fromEntries(data.clients.map(client => [client.id, client.name]))
    return { staffNames, clientNames }
  }, [data.staff, data.clients])

  const cards = [
    { label: 'Team records', value: data.staff.length, note: 'Active, invited, and suspended users' },
    { label: 'Leave requests', value: data.leave.length, note: 'All recorded requests' },
    { label: 'Clients', value: data.clients.length, note: 'Lead and active customer records' },
    { label: 'Invoices', value: data.invoices.length, note: 'Paid, unpaid, and overdue invoices' },
    { label: 'Timesheets', value: data.timesheets.length, note: 'Submitted time entries' },
  ]

  const exports = [
    {
      key: 'staff',
      title: 'Staff export',
      description: 'Team directory, roles, statuses, and join dates.',
      filename: `staff-export-${tenant?.slug || 'workspace'}.csv`,
      rows: data.staff.map(member => ({
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
      rows: data.leave.map(request => ({
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
      rows: data.clients.map(client => ({
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
      rows: data.invoices.map(invoice => ({
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
      rows: data.timesheets.map(entry => ({
        employee: lookups.staffNames[entry.tenant_user_id] || '',
        date: formatDate(entry.date),
        hours: entry.hours || '',
        description: entry.description || '',
        client: lookups.clientNames[entry.client_id] || 'Internal',
        status: entry.status || '',
        approved_by: lookups.staffNames[entry.approved_by] || '',
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

  return (
    <div className="fade-in page-stack">
      <div className="page-hd">
        <div>
          <h1 className="page-title">Reports</h1>
          <p className="page-sub">Business-ready exports for team, HR, CRM, billing, and time tracking</p>
        </div>
      </div>

      <div className="compact-note">Download clean CSV exports from the live workspace data your customers already manage every day.</div>

      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
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
