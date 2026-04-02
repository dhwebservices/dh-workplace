import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { sbGetMany } from '../utils/supabase'
import { canAccessPath } from '../utils/permissions'

function sectionResults(title, items) {
  return { title, items: items.slice(0, 8) }
}

export default function SearchPage() {
  const { tenant, tenantUser, employeeRecord, employeePermissions, user } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [query, setQuery] = useState(searchParams.get('q') || '')
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState({
    staff: [],
    tasks: [],
    notifications: [],
    clients: [],
    invoices: [],
    documents: [],
  })

  useEffect(() => {
    if (!tenant?.id) return
    setLoading(true)
    Promise.all([
      sbGetMany('employees', `tenant_id=eq.${tenant.id}&order=display_name.asc`),
      sbGetMany('tasks', `tenant_id=eq.${tenant.id}&order=created_at.desc&limit=100`),
      sbGetMany('notifications', `tenant_id=eq.${tenant.id}&tenant_user_id=eq.${tenantUser?.id}&order=created_at.desc&limit=50`),
      sbGetMany('clients', `tenant_id=eq.${tenant.id}&order=created_at.desc&limit=100`),
      sbGetMany('invoices', `tenant_id=eq.${tenant.id}&order=created_at.desc&limit=100`),
      sbGetMany('documents', `tenant_id=eq.${tenant.id}&order=created_at.desc&limit=100`),
    ]).then(([staff, tasks, notifications, clients, invoices, documents]) => {
      setData({
        staff: staff || [],
        tasks: tasks || [],
        notifications: notifications || [],
        clients: clients || [],
        invoices: invoices || [],
        documents: documents || [],
      })
      setLoading(false)
    })
  }, [tenant?.id, tenantUser?.id])

  const selfStaffPaths = [employeeRecord?.id, employeeRecord?.tenant_user_id, tenantUser?.id, user?.id]
    .filter(Boolean)
    .map((identifier) => `/staff/${identifier}`)

  const normalized = query.trim().toLowerCase()

  const results = useMemo(() => {
    if (!normalized) return []
    const match = (value) => String(value || '').toLowerCase().includes(normalized)

    const groups = [
      sectionResults('Staff', data.staff
        .filter((item) => item.is_person && !item.is_shared_mailbox && [item.display_name, item.primary_email, item.job_title, item.department].some(match))
        .filter((item) => canAccessPath(`/staff/${item.id}`, { permissionRecord: employeePermissions, fallbackRole: tenantUser?.role, selfStaffPaths }))
        .map((item) => ({ id: item.id, title: item.display_name, meta: [item.job_title, item.department].filter(Boolean).join(' · ') || item.primary_email, to: `/staff/${item.id}` }))),
      sectionResults('Tasks', data.tasks
        .filter((item) => [item.title, item.description, item.priority, item.status].some(match))
        .filter(() => canAccessPath('/tasks', { permissionRecord: employeePermissions, fallbackRole: tenantUser?.role, selfStaffPaths }))
        .map((item) => ({ id: item.id, title: item.title, meta: [item.status, item.priority].filter(Boolean).join(' · '), to: '/tasks' }))),
      sectionResults('Notifications', data.notifications
        .filter((item) => [item.title, item.message, item.category].some(match))
        .filter(() => canAccessPath('/notifications', { permissionRecord: employeePermissions, fallbackRole: tenantUser?.role, selfStaffPaths }))
        .map((item) => ({ id: item.id, title: item.title, meta: item.category || 'general', to: item.link || '/notifications' }))),
      sectionResults('Clients', data.clients
        .filter((item) => [item.name, item.email, item.phone, item.website, item.notes].some(match))
        .filter(() => canAccessPath('/clients', { permissionRecord: employeePermissions, fallbackRole: tenantUser?.role, selfStaffPaths }))
        .map((item) => ({ id: item.id, title: item.name, meta: [item.status, item.email].filter(Boolean).join(' · '), to: `/clients/${item.id}` }))),
      sectionResults('Invoices', data.invoices
        .filter((item) => [item.invoice_number, item.description, item.status].some(match))
        .filter(() => canAccessPath('/billing', { permissionRecord: employeePermissions, fallbackRole: tenantUser?.role, selfStaffPaths }))
        .map((item) => ({ id: item.id, title: item.invoice_number || `Invoice ${item.id?.slice(0, 8)}`, meta: [item.status, item.amount ? `£${item.amount}` : null].filter(Boolean).join(' · '), to: '/billing' }))),
      sectionResults('Documents', data.documents
        .filter((item) => [item.name, item.category, item.visible_to].some(match))
        .filter(() => canAccessPath('/documents', { permissionRecord: employeePermissions, fallbackRole: tenantUser?.role, selfStaffPaths }))
        .map((item) => ({ id: item.id, title: item.name, meta: [item.category, item.visible_to].filter(Boolean).join(' · '), to: '/documents' }))),
    ]

    return groups.filter((group) => group.items.length > 0)
  }, [normalized, data, employeePermissions, tenantUser?.role, selfStaffPaths])

  const totalResults = results.reduce((sum, group) => sum + group.items.length, 0)

  const submit = (event) => {
    event.preventDefault()
    setSearchParams(query.trim() ? { q: query.trim() } : {})
  }

  return (
    <div className="fade-in page-stack">
      <div className="page-hd">
        <div>
          <h1 className="page-title">Global search</h1>
          <p className="page-sub">Search staff, tasks, notifications, clients, invoices, and documents from one place.</p>
        </div>
      </div>

      <div className="card card-pad">
        <form onSubmit={submit} className="search-shell" style={{ maxWidth: '100%' }}>
          <input className="inp" placeholder="Search people, tasks, clients, documents, invoices..." value={query} onChange={(event) => setQuery(event.target.value)} />
          <span className="search-icon" />
        </form>
      </div>

      {loading ? (
        <div className="spin-wrap"><div className="spin" /></div>
      ) : !normalized ? (
        <div className="card card-pad"><div className="compact-note">Start with a person, task, client, invoice number, or document name.</div></div>
      ) : (
        <>
          <div className="kpi-strip">
            <div className="kpi-cell">
              <div className="kpi-cell-label">Query</div>
              <div className="kpi-cell-value" style={{ fontSize: 18 }}>{query}</div>
            </div>
            <div className="kpi-cell">
              <div className="kpi-cell-label">Result groups</div>
              <div className="kpi-cell-value">{results.length}</div>
            </div>
            <div className="kpi-cell">
              <div className="kpi-cell-label">Visible results</div>
              <div className="kpi-cell-value">{totalResults}</div>
            </div>
            <div className="kpi-cell">
              <div className="kpi-cell-label">Permissions</div>
              <div className="kpi-cell-value">{totalResults ? 'Respected' : 'No matches'}</div>
            </div>
          </div>

          {results.length === 0 ? (
            <div className="card card-pad"><div className="compact-note">No results matched your query or your current access level.</div></div>
          ) : (
            results.map((group) => (
              <div key={group.title} className="card card-pad">
                <div className="section-head">
                  <div>
                    <h3 className="panel-title">{group.title}</h3>
                    <div className="panel-sub">{group.items.length} result{group.items.length === 1 ? '' : 's'} visible in this category.</div>
                  </div>
                </div>
                <div className="stack-sm">
                  {group.items.map((item) => (
                    <Link key={`${group.title}-${item.id}`} to={item.to} className="list-card" style={{ textDecoration: 'none' }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{item.title}</div>
                      <div style={{ fontSize: 12, color: 'var(--faint)', marginTop: 4 }}>{item.meta || 'Open result'}</div>
                    </Link>
                  ))}
                </div>
              </div>
            ))
          )}
        </>
      )}
    </div>
  )
}
