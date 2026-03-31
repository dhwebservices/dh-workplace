import { useMemo } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { can } from '../../utils/entitlements'
import { canManageWorkspaceSettings } from '../../utils/permissions'

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
  const { tenant, tenantUser } = useAuth()
  const canManage = canManageWorkspaceSettings(tenantUser?.role)
  const enabled = can(tenant, 'api_access')
  const workerUrl = import.meta.env.VITE_WORKER_URL || ''

  const integrationBase = useMemo(() => {
    if (!workerUrl) return 'Configure VITE_WORKER_URL to expose a managed integration receiver later.'
    return workerUrl.replace(/\/$/, '')
  }, [workerUrl])

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
          <div style={{fontSize:13,color:'var(--sub)'}}>The foundation is visible during trial, but production webhook and API rollout is positioned for Business workspaces.</div>
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
            <h3 className="panel-title">Webhook starting point</h3>
            <div className="panel-sub">Use this as the first integration surface while deeper outbound delivery is completed.</div>
          </div>
        </div>
        <div className="stack-sm">
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
      </div>

      <div className="card card-pad">
        <div className="section-head">
          <div>
            <h3 className="panel-title">Planned event types</h3>
            <div className="panel-sub">A practical first event list for payroll, ops, CRM, and automation tools.</div>
          </div>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
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
    </div>
  )
}
