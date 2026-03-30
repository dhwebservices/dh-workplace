import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { sbGetMany, sbUpdate } from '../../utils/supabase'
import { PLANS } from '../../utils/entitlements'

export default function SuperTenants() {
  const [tenants, setTenants] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [planFilter, setPlanFilter] = useState('all')
  const [riskFilter, setRiskFilter] = useState('all')
  const [savingId, setSavingId] = useState('')
  const navigate = useNavigate()

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    const data = await sbGetMany('tenants', 'order=created_at.desc')
    setTenants(data||[])
    setLoading(false)
  }

  const hasRisk = (tenant, kind) => {
    const trialEndsSoon = tenant.status === 'trialing' && tenant.trial_ends_at && new Date(tenant.trial_ends_at).getTime() <= (Date.now() + 3 * 86400000)
    if (kind === 'trial_ending') return trialEndsSoon
    if (kind === 'no_billing') return tenant.status !== 'cancelled' && !tenant.gc_mandate_id
    if (kind === 'blocked') return tenant.status === 'blocked' || tenant.status === 'suspended'
    if (kind === 'seat_risk') return (tenant.seat_limit || 5) <= 1
    return false
  }

  const quickUpdate = async (tenant, payload) => {
    setSavingId(tenant.id)
    try {
      await sbUpdate('tenants', `id=eq.${tenant.id}`, { ...payload, updated_at: new Date().toISOString() })
      await load()
    } catch (e) {
      alert(e.message)
    }
    setSavingId('')
  }

  const extendTrial = async (tenant, days = 7) => {
    const base = tenant.trial_ends_at && new Date(tenant.trial_ends_at) > new Date() ? new Date(tenant.trial_ends_at) : new Date()
    base.setDate(base.getDate() + days)
    await quickUpdate(tenant, { trial_ends_at: base.toISOString(), status: tenant.status === 'cancelled' ? 'trialing' : tenant.status })
  }

  const filtered = tenants.filter(t => {
    const q = search.toLowerCase()
    const matchSearch = !q||t.name?.toLowerCase().includes(q)||t.owner_email?.toLowerCase().includes(q)
    const matchStatus = statusFilter==='all'||t.status===statusFilter
    const matchPlan = planFilter==='all'||t.plan===planFilter
    const matchRisk = riskFilter==='all'||hasRisk(t, riskFilter)
    return matchSearch && matchStatus && matchPlan && matchRisk
  })

  return (
    <div className="fade-in page-stack">
      <div className="page-hd">
        <div>
          <h1 className="page-title">All Tenants</h1>
          <p className="page-sub">{tenants.length} total workspaces across the platform</p>
        </div>
      </div>
      <div className="table-toolbar">
        <div className="search-shell">
          <input className="inp" placeholder="Search tenants..." value={search} onChange={e=>setSearch(e.target.value)}/>
          <span className="search-icon" />
        </div>
        <div className="filter-pills">
          {['all','trialing','active','overdue','suspended','blocked'].map(s=>(
            <button key={s} onClick={()=>setStatusFilter(s)} className={`btn btn-sm ${statusFilter===s?'btn-primary':'btn-outline'}`} style={{textTransform:'capitalize'}}>{s}</button>
          ))}
        </div>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          <select className="inp" value={planFilter} onChange={e => setPlanFilter(e.target.value)} style={{ width:'auto', minWidth:140 }}>
            <option value="all">All plans</option>
            {Object.keys(PLANS).map(plan => <option key={plan} value={plan} style={{ textTransform:'capitalize' }}>{plan}</option>)}
          </select>
          <select className="inp" value={riskFilter} onChange={e => setRiskFilter(e.target.value)} style={{ width:'auto', minWidth:180 }}>
            <option value="all">All risk states</option>
            <option value="trial_ending">Trial ending soon</option>
            <option value="no_billing">No billing mandate</option>
            <option value="blocked">Blocked or suspended</option>
            <option value="seat_risk">Seat risk</option>
          </select>
        </div>
        <div className="compact-note">
          {['trialing','active','overdue','suspended','blocked'].map(status => `${status}: ${tenants.filter(t => t.status === status).length}`).join(' · ')}
        </div>
      </div>
      <div className="card card-pad table-card">
        {loading ? <div style={{padding:24}}>{[1,2,3].map(i=><div key={i} className="skel" style={{height:52,marginBottom:8,borderRadius:8}}/>)}</div>
        : filtered.length===0 ? <div className="empty"><p>No tenants found</p></div>
        : <table className="tbl">
            <thead><tr><th>Company</th><th>Plan</th><th>Status</th><th>Owner</th><th>Joined</th><th>Risk</th><th></th></tr></thead>
            <tbody>
              {filtered.map(t=>(
                <tr key={t.id} style={{cursor:'pointer'}} onClick={()=>navigate(`/superadmin/tenants/${t.id}`)}>
                  <td className="t-main">{t.name}</td>
                  <td><span className="badge badge-blue" style={{textTransform:'capitalize'}}>{t.plan}</span></td>
                  <td><span className={`badge badge-${t.status==='active'?'green':t.status==='trialing'?'amber':t.status==='overdue' || t.status === 'blocked' ?'red':'grey'}`} style={{textTransform:'capitalize'}}>{t.status}</span></td>
                  <td style={{fontFamily:'var(--font-mono)',fontSize:11,color:'var(--faint)'}}>{t.owner_email}</td>
                  <td style={{fontFamily:'var(--font-mono)',fontSize:11,color:'var(--faint)'}}>{new Date(t.created_at).toLocaleDateString('en-GB')}</td>
                  <td style={{ fontSize:12, color:'var(--sub)' }}>
                    {hasRisk(t, 'blocked') ? 'Access issue' : hasRisk(t, 'trial_ending') ? 'Trial ending' : hasRisk(t, 'no_billing') ? 'No billing' : 'Healthy'}
                  </td>
                  <td>
                    <div style={{ display:'flex', gap:8, flexWrap:'wrap', justifyContent:'flex-end' }}>
                      <button className="btn btn-outline btn-sm" onClick={e=>{e.stopPropagation();navigate(`/superadmin/tenants/${t.id}`)}}>View</button>
                      {t.status === 'blocked' ? (
                        <button className="btn btn-outline btn-sm" onClick={e=>{e.stopPropagation();quickUpdate(t, { status:'active' })}} disabled={savingId === t.id}>Unblock</button>
                      ) : (
                        <button className="btn btn-outline btn-sm" onClick={e=>{e.stopPropagation();quickUpdate(t, { status:'blocked' })}} disabled={savingId === t.id}>Block</button>
                      )}
                      <button className="btn btn-outline btn-sm" onClick={e=>{e.stopPropagation();extendTrial(t)}} disabled={savingId === t.id}>+7 days</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>}
      </div>
    </div>
  )
}
