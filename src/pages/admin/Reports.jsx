import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { sbGetMany } from '../../utils/supabase'
import { downloadCsv } from '../../utils/exports'
import { canViewReports } from '../../utils/permissions'

function formatDate(value) {
  return value ? new Date(value).toLocaleDateString('en-GB') : ''
}

function formatMoney(value) {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    maximumFractionDigits: 0,
  }).format(Number(value || 0))
}

function startOfMonth(value) {
  const date = new Date(value)
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function monthKey(value) {
  const date = startOfMonth(value)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function monthLabel(key) {
  const [year, month] = key.split('-').map(Number)
  return new Date(year, month - 1, 1).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })
}

function tallyBy(items, getKey) {
  return items.reduce((acc, item) => {
    const key = getKey(item) || 'Unknown'
    acc[key] = (acc[key] || 0) + 1
    return acc
  }, {})
}

function sumBy(items, getKey, getValue) {
  return items.reduce((acc, item) => {
    const key = getKey(item) || 'Unknown'
    acc[key] = (acc[key] || 0) + Number(getValue(item) || 0)
    return acc
  }, {})
}

function StatusList({ items, tone = 'var(--blue)' }) {
  if (!items.length) {
    return <div style={{ fontSize: 13, color: 'var(--faint)' }}>No data in this period.</div>
  }

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {items.map(item => (
        <div key={item.label} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 12, alignItems: 'center' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 6 }}>
              <span style={{ fontSize: 13, color: 'var(--text)', fontWeight: 600 }}>{item.label}</span>
              <span style={{ fontSize: 12, color: 'var(--faint)' }}>{item.value}</span>
            </div>
            <div style={{ height: 8, borderRadius: 999, background: 'var(--surface)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${item.share}%`, background: tone, borderRadius: 999 }} />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function TrendBars({ title, subtitle, data, tone = 'var(--blue)', formatter = value => value }) {
  const max = Math.max(...data.map(item => item.value), 1)

  return (
    <div className="card card-pad">
      <div className="section-head" style={{ marginBottom: 18 }}>
        <div>
          <h3 className="panel-title">{title}</h3>
          <div className="panel-sub">{subtitle}</div>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${data.length || 1}, minmax(0, 1fr))`, gap: 12, alignItems: 'end', minHeight: 220 }}>
        {data.map(point => (
          <div key={point.label} style={{ display: 'grid', gap: 10, alignItems: 'end' }}>
            <div style={{ fontSize: 12, color: 'var(--text)', fontWeight: 700, textAlign: 'center' }}>{formatter(point.value)}</div>
            <div style={{ height: 160, display: 'flex', alignItems: 'end', justifyContent: 'center' }}>
              <div
                style={{
                  width: '100%',
                  maxWidth: 52,
                  height: `${Math.max((point.value / max) * 100, point.value ? 12 : 4)}%`,
                  minHeight: point.value ? 12 : 4,
                  borderRadius: 16,
                  background: tone,
                  opacity: point.value ? 1 : 0.25,
                }}
              />
            </div>
            <div style={{ fontSize: 12, color: 'var(--faint)', textAlign: 'center' }}>{point.label}</div>
          </div>
        ))}
      </div>
    </div>
  )
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

  const revenueSummary = useMemo(() => {
    const invoiced = reportData.invoices.reduce((sum, invoice) => sum + Number(invoice.amount || 0), 0)
    const collected = reportData.invoices
      .filter(invoice => invoice.status === 'paid')
      .reduce((sum, invoice) => sum + Number(invoice.amount || 0), 0)
    const overdue = reportData.invoices
      .filter(invoice => invoice.status === 'overdue' || invoice.status === 'unpaid')
      .reduce((sum, invoice) => sum + Number(invoice.amount || 0), 0)
    return { invoiced, collected, overdue }
  }, [reportData.invoices])

  const hoursSummary = useMemo(() => {
    const total = reportData.timesheets.reduce((sum, entry) => sum + Number(entry.hours || 0), 0)
    const approved = reportData.timesheets
      .filter(entry => entry.status === 'approved')
      .reduce((sum, entry) => sum + Number(entry.hours || 0), 0)
    const pending = reportData.timesheets
      .filter(entry => entry.status === 'pending')
      .reduce((sum, entry) => sum + Number(entry.hours || 0), 0)
    return { total, approved, pending }
  }, [reportData.timesheets])

  const operatingSnapshot = useMemo(() => ([
    { label: 'Open tasks', value: reportData.tasks.filter(task => task.status !== 'done' && task.status !== 'cancelled').length, note: 'Work still moving through the workspace' },
    { label: 'Pending leave', value: reportData.leave.filter(request => request.status === 'pending').length, note: 'Manager decisions still outstanding' },
    { label: 'Pending timesheets', value: reportData.timesheets.filter(entry => entry.status === 'pending').length, note: 'Hours waiting for review' },
    { label: 'Outstanding invoices', value: reportData.invoices.filter(invoice => invoice.status === 'unpaid' || invoice.status === 'overdue').length, note: 'Customer billing needing attention' },
  ]), [reportData])

  const monthlyRevenueTrend = useMemo(() => {
    const keys = []
    const base = new Date()
    for (let i = 5; i >= 0; i--) {
      keys.push(monthKey(new Date(base.getFullYear(), base.getMonth() - i, 1)))
    }
    const totals = Object.fromEntries(keys.map(key => [key, 0]))
    reportData.invoices.forEach(invoice => {
      const date = invoice.paid_at || invoice.created_at || invoice.due_date
      if (!date) return
      const key = monthKey(date)
      if (!(key in totals)) return
      totals[key] += Number(invoice.amount || 0)
    })
    return keys.map(key => ({ label: monthLabel(key), value: totals[key] }))
  }, [reportData.invoices])

  const monthlyHoursTrend = useMemo(() => {
    const keys = []
    const base = new Date()
    for (let i = 5; i >= 0; i--) {
      keys.push(monthKey(new Date(base.getFullYear(), base.getMonth() - i, 1)))
    }
    const totals = Object.fromEntries(keys.map(key => [key, 0]))
    reportData.timesheets.forEach(entry => {
      if (!entry.date) return
      const key = monthKey(entry.date)
      if (!(key in totals)) return
      totals[key] += Number(entry.hours || 0)
    })
    return keys.map(key => ({ label: monthLabel(key), value: totals[key] }))
  }, [reportData.timesheets])

  const leaveBreakdown = useMemo(() => {
    const counts = tallyBy(reportData.leave, request => request.status || 'unknown')
    const total = Math.max(reportData.leave.length, 1)
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([label, value]) => ({ label: label.replace('_', ' '), value, share: Math.round((value / total) * 100) }))
  }, [reportData.leave])

  const taskBreakdown = useMemo(() => {
    const counts = tallyBy(reportData.tasks, task => task.status || 'unknown')
    const total = Math.max(reportData.tasks.length, 1)
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([label, value]) => ({ label: label.replace('_', ' '), value, share: Math.round((value / total) * 100) }))
  }, [reportData.tasks])

  const outreachBreakdown = useMemo(() => {
    const counts = tallyBy(reportData.outreach, lead => lead.status || 'unknown')
    const total = Math.max(reportData.outreach.length, 1)
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([label, value]) => ({ label: label.replace('_', ' '), value, share: Math.round((value / total) * 100) }))
  }, [reportData.outreach])

  const topStaffHours = useMemo(() => {
    const totals = sumBy(reportData.timesheets, entry => lookups.staffNames[entry.tenant_user_id], entry => entry.hours)
    return Object.entries(totals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([label, value]) => ({ label, value: `${value}h` }))
  }, [reportData.timesheets, lookups.staffNames])

  const topClientRevenue = useMemo(() => {
    const totals = sumBy(reportData.invoices, invoice => lookups.clientNames[invoice.client_id], invoice => invoice.amount)
    return Object.entries(totals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([label, value]) => ({ label, value: formatMoney(value) }))
  }, [reportData.invoices, lookups.clientNames])

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

      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        <div className="stat-card">
          <div className="stat-lbl">Invoiced in range</div>
          <div className="stat-val" style={{ color: 'var(--text)', fontSize: 30 }}>{formatMoney(revenueSummary.invoiced)}</div>
          <div style={{ marginTop: 8, fontSize: 12, color: 'var(--faint)' }}>{formatMoney(revenueSummary.collected)} collected · {formatMoney(revenueSummary.overdue)} outstanding</div>
        </div>
        <div className="stat-card">
          <div className="stat-lbl">Hours logged</div>
          <div className="stat-val" style={{ color: 'var(--text)', fontSize: 30 }}>{hoursSummary.total}h</div>
          <div style={{ marginTop: 8, fontSize: 12, color: 'var(--faint)' }}>{hoursSummary.approved}h approved · {hoursSummary.pending}h pending</div>
        </div>
        {operatingSnapshot.map(card => (
          <div key={card.label} className="stat-card">
            <div className="stat-lbl">{card.label}</div>
            <div className="stat-val" style={{ color: 'var(--text)', fontSize: 30 }}>{card.value}</div>
            <div style={{ marginTop: 8, fontSize: 12, color: 'var(--faint)' }}>{card.note}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
        <TrendBars
          title="Revenue trend"
          subtitle="Invoice value across the last six months"
          data={monthlyRevenueTrend}
          formatter={formatMoney}
        />
        <TrendBars
          title="Hours trend"
          subtitle="Team time logged across the last six months"
          data={monthlyHoursTrend}
          tone="var(--green)"
          formatter={value => `${value}h`}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
        <div className="card card-pad">
          <div className="section-head" style={{ marginBottom: 18 }}>
            <div>
              <h3 className="panel-title">Leave status mix</h3>
              <div className="panel-sub">Where people requests are sitting right now</div>
            </div>
          </div>
          <StatusList items={leaveBreakdown} tone="var(--blue)" />
        </div>
        <div className="card card-pad">
          <div className="section-head" style={{ marginBottom: 18 }}>
            <div>
              <h3 className="panel-title">Task status mix</h3>
              <div className="panel-sub">Operational workload across the workspace</div>
            </div>
          </div>
          <StatusList items={taskBreakdown} tone="var(--amber)" />
        </div>
        <div className="card card-pad">
          <div className="section-head" style={{ marginBottom: 18 }}>
            <div>
              <h3 className="panel-title">Outreach pipeline</h3>
              <div className="panel-sub">Lead movement in the selected period</div>
            </div>
          </div>
          <StatusList items={outreachBreakdown} tone="var(--green)" />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
        <div className="card card-pad">
          <div className="section-head" style={{ marginBottom: 18 }}>
            <div>
              <h3 className="panel-title">Top staff by logged hours</h3>
              <div className="panel-sub">Useful for spotting who is carrying the workload</div>
            </div>
          </div>
          <div style={{ display: 'grid', gap: 12 }}>
            {topStaffHours.length ? topStaffHours.map(item => (
              <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
                <span style={{ fontSize: 14, color: 'var(--text)', fontWeight: 600 }}>{item.label}</span>
                <span style={{ fontSize: 13, color: 'var(--sub)' }}>{item.value}</span>
              </div>
            )) : <div style={{ fontSize: 13, color: 'var(--faint)' }}>No timesheet data in this period.</div>}
          </div>
        </div>

        <div className="card card-pad">
          <div className="section-head" style={{ marginBottom: 18 }}>
            <div>
              <h3 className="panel-title">Top clients by invoice value</h3>
              <div className="panel-sub">The customers contributing most commercial value</div>
            </div>
          </div>
          <div style={{ display: 'grid', gap: 12 }}>
            {topClientRevenue.length ? topClientRevenue.map(item => (
              <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
                <span style={{ fontSize: 14, color: 'var(--text)', fontWeight: 600 }}>{item.label}</span>
                <span style={{ fontSize: 13, color: 'var(--sub)' }}>{item.value}</span>
              </div>
            )) : <div style={{ fontSize: 13, color: 'var(--faint)' }}>No invoice data in this period.</div>}
          </div>
        </div>
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
