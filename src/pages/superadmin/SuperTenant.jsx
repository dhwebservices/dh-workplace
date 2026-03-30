import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { sbGet, sbGetMany, sbUpdate } from '../../utils/supabase'
import { PLANS } from '../../utils/entitlements'

export default function SuperTenant() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [tenant, setTenant] = useState(null)
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [id])

  const load = async () => {
    setLoading(true)
    const [t, u] = await Promise.all([
      sbGet('tenants', `id=eq.${id}`),
      sbGetMany('tenant_users', `tenant_id=eq.${id}&order=created_at.asc`),
    ])
    setTenant(t); setUsers(u||[])
    setLoading(false)
  }

  const updateTenant = async (payload) => {
    setSaving(true)
    try {
      await sbUpdate('tenants', `id=eq.${id}`, { ...payload, updated_at:new Date().toISOString() })
      setTenant(p=>({...p,...payload}))
    } catch(e) { alert(e.message) }
    setSaving(false)
  }

  if (loading) return <div className="spin-wrap"><div className="spin"/></div>
  if (!tenant) return <div className="card card-pad"><p style={{color:'var(--faint)'}}>Tenant not found.</p></div>

  return (
    <div className="fade-in">
      <div style={{marginBottom:20}}>
        <button onClick={()=>navigate('/superadmin/tenants')} className="btn btn-outline btn-sm">← All Tenants</button>
      </div>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:24}}>
        <div>
          <h1 className="page-title">{tenant.name}</h1>
          <p className="page-sub">{tenant.owner_email} · Joined {new Date(tenant.created_at).toLocaleDateString('en-GB')}</p>
        </div>
        <span className={`badge badge-${tenant.status==='active'?'green':tenant.status==='trialing'?'amber':tenant.status==='overdue'?'red':'grey'}`} style={{textTransform:'capitalize',fontSize:13}}>{tenant.status}</span>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:20}}>
        <div className="card card-pad">
          <h3 style={{fontFamily:'var(--font-display)',fontSize:18,fontWeight:400,marginBottom:16}}>Details</h3>
          <div style={{display:'flex',flexDirection:'column',gap:10}}>
            {[
              ['Slug', tenant.slug],
              ['Plan', tenant.plan],
              ['Seat Limit', tenant.seat_limit],
              ['GC Customer', tenant.gc_customer_id||'Not set'],
              ['GC Mandate', tenant.gc_mandate_id||'Not set'],
              ['Trial Ends', tenant.trial_ends_at?new Date(tenant.trial_ends_at).toLocaleDateString('en-GB'):'N/A'],
              ['Last Payment', tenant.last_payment_at?new Date(tenant.last_payment_at).toLocaleDateString('en-GB'):'None'],
            ].map(([label,val])=>(
              <div key={label} style={{display:'flex',justifyContent:'space-between',padding:'8px 0',borderBottom:'1px solid var(--border2)'}}>
                <span style={{fontSize:13,color:'var(--faint)'}}>{label}</span>
                <span style={{fontSize:13,fontFamily:'var(--font-mono)',color:'var(--text)'}}>{val}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{display:'flex',flexDirection:'column',gap:16}}>
          <div className="card card-pad">
            <h3 style={{fontFamily:'var(--font-display)',fontSize:18,fontWeight:400,marginBottom:12}}>Admin Actions</h3>
            <div style={{display:'flex',flexDirection:'column',gap:8}}>
              <div>
                <label className="lbl">Change Plan</label>
                <select className="inp" value={tenant.plan} onChange={e=>updateTenant({plan:e.target.value,seat_limit:PLANS[e.target.value]?.max_users||5})} disabled={saving}>
                  {Object.entries(PLANS).map(([key,p])=><option key={key} value={key}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label className="lbl">Change Status</label>
                <select className="inp" value={tenant.status} onChange={e=>updateTenant({status:e.target.value})} disabled={saving}>
                  {['trialing','active','overdue','suspended','cancelled'].map(s=><option key={s} value={s} style={{textTransform:'capitalize'}}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>)}
                </select>
              </div>
            </div>
          </div>
          <div className="card card-pad">
            <h3 style={{fontFamily:'var(--font-display)',fontSize:18,fontWeight:400,marginBottom:12}}>Team ({users.length})</h3>
            <div style={{display:'flex',flexDirection:'column',gap:6}}>
              {users.map(u=>(
                <div key={u.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'6px 0',borderBottom:'1px solid var(--border2)'}}>
                  <div>
                    <div style={{fontSize:13,fontWeight:500}}>{u.full_name||u.email}</div>
                    <div style={{fontSize:11,color:'var(--faint)',fontFamily:'var(--font-mono)'}}>{u.email}</div>
                  </div>
                  <span className="badge badge-blue" style={{textTransform:'capitalize',fontSize:10}}>{u.role}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
