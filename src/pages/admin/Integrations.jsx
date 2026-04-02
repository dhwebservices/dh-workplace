import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { can } from '../../utils/entitlements'
import { canManageWorkspaceSettings } from '../../utils/permissions'
import { sbDelete, sbGetMany, sbInsert, sbUpdate, supabase } from '../../utils/supabase'

const EVENTS = [
  { key: 'tenant.updated', description: 'Workspace billing, plan, or status changes.' },
  { key: 'team.member.updated', description: 'Role, status, invite, and team lifecycle changes.' },
  { key: 'leave.request.updated', description: 'Submitted, approved, and rejected leave events.' },
  { key: 'task.updated', description: 'Task creation, status changes, and assignment updates.' },
  { key: 'invoice.updated', description: 'Invoice creation and payment-state changes.' },
]

const SAMPLE_PAYLOAD = `{
  "event": "task.updated",
  "tenant_id": "workspace-id",
  "occurred_at": "2026-03-31T10:00:00.000Z",
  "data": {
    "id": "task-id",
    "status": "done"
  }
}`

export default function Integrations() {
  const { tenant, tenantUser, employeePermissions } = useAuth()
  const canManage = canManageWorkspaceSettings({ role: tenantUser?.role, permissionRecord: employeePermissions })
  const enabled = can(tenant, 'api_access')
  const workerUrl = import.meta.env.VITE_WORKER_URL || ''
  const [endpoints, setEndpoints] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testingId, setTestingId] = useState('')
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ label: '', target_url: '', secret: '', enabled: true, events: [] })
  const [schemaReady, setSchemaReady] = useState(true)

  const integrationBase = useMemo(() => {
    if (!workerUrl) return 'Configure VITE_WORKER_URL to expose a managed integration receiver later.'
    return workerUrl.replace(/\/$/, '')
  }, [workerUrl])

  useEffect(() => { load() }, [tenant?.id])

  const load = async () => {
    if (!tenant?.id) return
    setLoading(true)
    try {
      const rows = await sbGetMany('webhook_endpoints', `tenant_id=eq.${tenant.id}&order=created_at.desc`)
      setEndpoints(rows || [])
      setSchemaReady(true)
    } catch {
      setSchemaReady(false)
      setEndpoints([])
    }
    setLoading(false)
  }

  const openModal = (endpoint = null) => {
    setEditing(endpoint)
    setForm(endpoint ? { ...endpoint, events: endpoint.events || [] } : { label: '', target_url: '', secret: '', enabled: true, events: [] })
    setModal(true)
  }

  const toggleEvent = (eventKey) => {
    setForm(prev => ({
      ...prev,
      events: prev.events.includes(eventKey) ? prev.events.filter(item => item !== eventKey) : [...prev.events, eventKey],
    }))
  }

  const saveEndpoint = async () => {
    if (!form.label.trim() || !form.target_url.trim()) {
      alert('Label and target URL are required')
      return
    }
    setSaving(true)
    try {
      const payload = {
        tenant_id: tenant.id,
        label: form.label.trim(),
        target_url: form.target_url.trim(),
        secret: form.secret.trim() || null,
        events: form.events,
        enabled: !!form.enabled,
        created_by: tenantUser?.id || null,
        updated_at: new Date().toISOString(),
      }
      if (editing?.id) {
        await sbUpdate('webhook_endpoints', `id=eq.${editing.id}`, payload)
      } else {
        await sbInsert('webhook_endpoints', { ...payload, created_at: new Date().toISOString() })
      }
      setModal(false)
      await load()
    } catch (e) {
      alert(e.message)
    }
    setSaving(false)
  }

  const deleteEndpoint = async (endpoint) => {
    if (!window.confirm(`Delete webhook endpoint "${endpoint.label}"?`)) return
    await sbDelete('webhook_endpoints', `id=eq.${endpoint.id}`)
    await load()
  }

  const testEndpoint = async (endpoint) => {
    setTestingId(endpoint.id)
    try {
      const { data } = await supabase.auth.getSession()
      const token = data?.session?.access_token
      if (!token) throw new Error('You must be signed in to test webhooks')
      const res = await fetch(workerUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          type: 'webhook_test',
          data: {
            tenant_id: tenant.id,
            label: endpoint.label,
            target_url: endpoint.target_url,
            secret: endpoint.secret || '',
            event: 'tenant.test',
            payload: {
              tenant_name: tenant.name,
              source: 'DH Workplace',
            },
          },
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Webhook test failed')
      alert(json.result?.ok ? `Test delivered (${json.result.status})` : `Test failed (${json.result?.status || 'unknown status'})`)
      await sbUpdate('webhook_endpoints', `id=eq.${endpoint.id}`, { last_tested_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      await load()
    } catch (e) {
      alert(e.message)
    }
    setTestingId('')
  }

  if (!canManage) return <div className="card card-pad"><p style={{color:'var(--faint)'}}>Owner access required.</p></div>

  return (
    <div className="fade-in page-stack">
      <div className="page-hd">
        <div>
          <h1 className="page-title">Integrations</h1>
          <p className="page-sub">Webhook and API foundation for connecting DH Workplace to the rest of the business stack</p>
        </div>
      </div>

      {!enabled && (
        <div className="card card-pad" style={{background:'var(--surface-strong)'}}>
          <div style={{fontSize:15,fontWeight:700,color:'var(--text)',marginBottom:8}}>API access is a Business plan feature</div>
          <div style={{fontSize:13,color:'var(--sub)'}}>Webhook delivery and API access are best suited to Business workspaces, but the setup foundation is available here so you can prepare integrations in advance.</div>
        </div>
      )}

      {!schemaReady && (
        <div className="card card-pad" style={{background:'var(--surface-strong)'}}>
          <div style={{fontSize:15,fontWeight:700,color:'var(--text)',marginBottom:8}}>Webhook schema not ready yet</div>
          <div style={{fontSize:13,color:'var(--sub)'}}>Run the new `webhook_endpoints` SQL from the updated schema before using live webhooks.</div>
        </div>
      )}

      <div className="kpi-strip">
        <div className="kpi-cell">
          <div className="kpi-cell-label">Integration model</div>
          <div className="kpi-cell-value">Outbound webhooks</div>
        </div>
        <div className="kpi-cell">
          <div className="kpi-cell-label">Suggested secret</div>
          <div className="kpi-cell-value">{tenant?.id ? `${String(tenant.id).slice(0, 8)}...` : 'Pending'}</div>
        </div>
        <div className="kpi-cell">
          <div className="kpi-cell-label">Delivery mode</div>
          <div className="kpi-cell-value">JSON POST</div>
        </div>
        <div className="kpi-cell">
          <div className="kpi-cell-label">Foundation status</div>
          <div className="kpi-cell-value">{enabled ? 'Ready to wire' : 'Plan gated'}</div>
        </div>
      </div>

      <div className="card card-pad">
        <div className="section-head">
          <div>
            <h3 className="panel-title">Webhook endpoints</h3>
            <div className="panel-sub">Register outbound delivery targets for DH Workplace events.</div>
          </div>
          {schemaReady && <button className="btn btn-primary btn-sm" onClick={() => openModal()}>+ Add endpoint</button>}
        </div>
        <div className="stack-sm" style={{marginBottom:16}}>
          <div className="detail-row">
            <span className="detail-row-label">Foundation base</span>
            <span className="detail-row-value" style={{fontFamily:'var(--font-mono)',fontSize:12}}>{integrationBase}</span>
          </div>
          <div className="detail-row">
            <span className="detail-row-label">Authentication</span>
            <span className="detail-row-value">Header secret per workspace</span>
          </div>
          <div className="detail-row">
            <span className="detail-row-label">Content type</span>
            <span className="detail-row-value">application/json</span>
          </div>
          <div className="detail-row">
            <span className="detail-row-label">Delivery endpoint</span>
            <span className="detail-row-value">Configured per destination in the next rollout</span>
          </div>
        </div>
        {loading ? (
          <div style={{padding:24}}>{[1,2].map(i => <div key={i} className="skel" style={{height:72,marginBottom:10,borderRadius:12}} />)}</div>
        ) : endpoints.length === 0 ? (
          <div className="empty"><p>No webhook endpoints configured yet</p></div>
        ) : (
          <div style={{display:'grid',gap:12}}>
            {endpoints.map(endpoint => (
              <div key={endpoint.id} className="detail-card" style={{display:'flex',justifyContent:'space-between',gap:16,alignItems:'center',flexWrap:'wrap'}}>
                <div style={{minWidth:0}}>
                  <div style={{fontSize:15,fontWeight:700,color:'var(--text)'}}>{endpoint.label}</div>
                  <div style={{fontFamily:'var(--font-mono)',fontSize:12,color:'var(--faint)',marginTop:6,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{endpoint.target_url}</div>
                  <div style={{display:'flex',gap:6,flexWrap:'wrap',marginTop:10}}>
                    <span className={`badge ${endpoint.enabled ? 'badge-green' : 'badge-grey'}`}>{endpoint.enabled ? 'Enabled' : 'Disabled'}</span>
                    {(endpoint.events || []).length === 0 ? (
                      <span className="badge badge-blue">All events</span>
                    ) : (
                      endpoint.events.map(event => <span key={event} className="badge badge-grey">{event}</span>)
                    )}
                  </div>
                </div>
                <div style={{display:'flex',gap:8,flexWrap:'wrap',justifyContent:'flex-end'}}>
                  <button className="btn btn-outline btn-sm" onClick={() => testEndpoint(endpoint)} disabled={testingId === endpoint.id || !workerUrl}>
                    {testingId === endpoint.id ? 'Testing...' : 'Send test'}
                  </button>
                  <button className="btn btn-outline btn-sm" onClick={() => openModal(endpoint)}>Edit</button>
                  <button className="btn btn-outline btn-sm" style={{color:'var(--red)'}} onClick={() => deleteEndpoint(endpoint)}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card card-pad">
        <div className="section-head">
          <div>
            <h3 className="panel-title">Planned event types</h3>
            <div className="panel-sub">A practical first event list for payroll, ops, CRM, and automation tools.</div>
          </div>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(240px, 1fr))',gap:12}}>
          {EVENTS.map(event => (
            <div key={event.key} className="detail-card">
              <div style={{fontFamily:'var(--font-mono)',fontSize:12,color:'var(--blue)'}}>{event.key}</div>
              <div style={{fontSize:13,color:'var(--sub)',marginTop:8}}>{event.description}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="card card-pad">
        <div className="section-head">
          <div>
            <h3 className="panel-title">Payload shape</h3>
            <div className="panel-sub">Keep webhook consumers simple with a consistent event envelope.</div>
          </div>
        </div>
        <pre style={{margin:0,padding:16,borderRadius:12,background:'var(--surface-strong)',border:'1px solid var(--border)',fontFamily:'var(--font-mono)',fontSize:12,color:'var(--text)',overflowX:'auto'}}>{SAMPLE_PAYLOAD}</pre>
      </div>

      {modal && (
        <div className="modal-overlay" onClick={() => setModal(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-hd">
              <span className="modal-title">{editing ? 'Edit webhook endpoint' : 'Add webhook endpoint'}</span>
              <button onClick={() => setModal(false)} style={{background:'none',border:'none',cursor:'pointer',fontSize:20,color:'var(--faint)'}}>×</button>
            </div>
            <div className="modal-body">
              <div style={{display:'flex',flexDirection:'column',gap:14}}>
                <div><label className="lbl">Label</label><input className="inp" value={form.label} onChange={e => setForm(prev => ({ ...prev, label: e.target.value }))} placeholder="Zapier production endpoint" /></div>
                <div><label className="lbl">Target URL</label><input className="inp" value={form.target_url} onChange={e => setForm(prev => ({ ...prev, target_url: e.target.value }))} placeholder="https://example.com/hooks/dh-workplace" /></div>
                <div><label className="lbl">Shared secret</label><input className="inp" value={form.secret || ''} onChange={e => setForm(prev => ({ ...prev, secret: e.target.value }))} placeholder="Optional outbound verification secret" /></div>
                <div>
                  <label className="lbl">Subscribed events</label>
                  <div style={{display:'flex',flexWrap:'wrap',gap:8,marginTop:8}}>
                    {EVENTS.map(event => (
                      <button key={event.key} type="button" onClick={() => toggleEvent(event.key)} className={`btn btn-sm ${form.events.includes(event.key) ? 'btn-primary' : 'btn-outline'}`}>
                        {event.key}
                      </button>
                    ))}
                  </div>
                  <div style={{fontSize:12,color:'var(--faint)',marginTop:8}}>Leave all unselected to receive every available event.</div>
                </div>
                <label style={{display:'flex',alignItems:'center',gap:10,fontSize:13,color:'var(--text)'}}>
                  <input type="checkbox" checked={!!form.enabled} onChange={e => setForm(prev => ({ ...prev, enabled: e.target.checked }))} />
                  Endpoint enabled
                </label>
              </div>
            </div>
            <div className="modal-ft">
              <button className="btn btn-outline" onClick={() => setModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveEndpoint} disabled={saving}>{saving ? 'Saving...' : 'Save endpoint'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
