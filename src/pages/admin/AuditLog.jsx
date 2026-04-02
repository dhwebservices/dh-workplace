import { useState, useEffect } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { sbGetMany } from '../../utils/supabase'
import { canViewAudit } from '../../utils/permissions'

export default function AuditLog() {
  const { tenant, tenantUser, employeePermissions } = useAuth()
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [staff, setStaff] = useState([])
  const canView = canViewAudit({ role: tenantUser?.role, permissionRecord: employeePermissions })

  useEffect(() => { load() }, [tenant?.id])

  const load = async () => {
    if (!tenant?.id) return
    setLoading(true)
    const [l, s] = await Promise.all([
      sbGetMany('audit_log', `tenant_id=eq.${tenant.id}&order=created_at.desc&limit=100`),
      sbGetMany('tenant_users', `tenant_id=eq.${tenant.id}`),
    ])
    setLogs(l||[]); setStaff(s||[])
    setLoading(false)
  }

  const getName = id => staff.find(s=>s.id===id)?.full_name||'System'
  const ACTION_BADGE = {
    created:'badge-green', updated:'badge-blue', deleted:'badge-red',
    login:'badge-grey', invited:'badge-amber'
  }
  const getBadge = action => {
    for (const [key,badge] of Object.entries(ACTION_BADGE)) {
      if (action?.includes(key)) return badge
    }
    return 'badge-grey'
  }

  if (!canView) return <div className="card card-pad"><p style={{color:'var(--faint)'}}>Admin access required.</p></div>

  return (
    <div className="fade-in page-stack">
      <div className="page-hd">
        <div>
          <h1 className="page-title">Audit Log</h1>
          <p className="page-sub">Last 100 events</p>
        </div>
        <button className="btn btn-outline btn-sm" onClick={load}>Refresh</button>
      </div>
      <div className="compact-note">A chronological record of tenant activity, admin actions, and support-side changes.</div>
      <div className="card card-pad table-card">
        {loading ? <div style={{padding:24}}>{[1,2,3,4,5].map(i=><div key={i} className="skel" style={{height:44,marginBottom:8,borderRadius:8}}/>)}</div>
        : logs.length===0 ? <div className="empty"><p>No audit events yet</p></div>
        : <table className="tbl">
            <thead><tr><th>Time</th><th>User</th><th>Action</th><th>Entity</th><th>Details</th></tr></thead>
            <tbody>
              {logs.map(l=>(
                <tr key={l.id}>
                  <td style={{fontFamily:'var(--font-mono)',fontSize:11,color:'var(--faint)',whiteSpace:'nowrap'}}>{new Date(l.created_at).toLocaleString('en-GB')}</td>
                  <td style={{fontSize:13}}>{getName(l.tenant_user_id)}</td>
                  <td><span className={`badge ${getBadge(l.action)}`} style={{fontSize:10,textTransform:'capitalize'}}>{l.action?.replace(/_/g,' ')}</span></td>
                  <td style={{fontSize:12,color:'var(--sub)',textTransform:'capitalize'}}>{l.entity||'—'}</td>
                  <td style={{fontSize:11,color:'var(--faint)',maxWidth:200,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{l.metadata?JSON.stringify(l.metadata):'—'}</td>
                </tr>
              ))}
            </tbody>
          </table>}
      </div>
    </div>
  )
}
