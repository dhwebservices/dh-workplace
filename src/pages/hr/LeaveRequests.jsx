import { useState, useEffect } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { sbGetMany, sbInsert, sbUpdate } from '../../utils/supabase'

const TYPES = ['annual','sick','compassionate','unpaid','other']

function calcDays(s, e) {
  if (!s || !e) return 0
  return Math.max(1, Math.ceil((new Date(e) - new Date(s)) / 86400000) + 1)
}

export default function LeaveRequests() {
  const { tenant, tenantUser } = useAuth()
  const [requests, setRequests] = useState([])
  const [staff, setStaff] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('all')
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({ type:'annual', start_date:'', end_date:'', notes:'' })
  const [saving, setSaving] = useState(false)
  const sf = (k,v) => setForm(p=>({...p,[k]:v}))
  const isManager = ['owner','admin','manager','superadmin'].includes(tenantUser?.role)

  useEffect(() => { load() }, [tenant?.id])

  const load = async () => {
    if (!tenant?.id) return
    setLoading(true)
    const [reqs, s] = await Promise.all([
      sbGetMany('leave_requests', `tenant_id=eq.${tenant.id}&order=created_at.desc`),
      sbGetMany('tenant_users', `tenant_id=eq.${tenant.id}&order=full_name.asc`),
    ])
    setRequests(reqs||[]); setStaff(s||[]); setLoading(false)
  }

  const submit = async () => {
    if (!form.start_date||!form.end_date) { alert('Dates required'); return }
    setSaving(true)
    try {
      await sbInsert('leave_requests', {
        tenant_id:tenant.id, tenant_user_id:tenantUser.id,
        type:form.type, start_date:form.start_date, end_date:form.end_date,
        days:calcDays(form.start_date,form.end_date),
        notes:form.notes||null, status:'pending', created_at:new Date().toISOString()
      })
      setModal(false); setForm({type:'annual',start_date:'',end_date:'',notes:''}); load()
    } catch(e) { alert(e.message) }
    setSaving(false)
  }

  const review = async (id, status) => {
    await sbUpdate('leave_requests', `id=eq.${id}`, { status, reviewed_by:tenantUser.id, reviewed_at:new Date().toISOString() })
    setRequests(p => p.map(r => r.id===id ? {...r,status} : r))
  }

  const getName = id => staff.find(s=>s.id===id)?.full_name || 'Unknown'
  const filtered = requests.filter(r => {
    if (tab==='mine') return r.tenant_user_id===tenantUser?.id
    if (tab==='pending') return r.status==='pending'
    if (tab==='approved') return r.status==='approved'
    return true
  })
  const SB = { pending:'badge-amber', approved:'badge-green', rejected:'badge-red', cancelled:'badge-grey' }

  return (
    <div className="fade-in">
      <div className="page-hd">
        <div>
          <h1 className="page-title">Leave Requests</h1>
          <p className="page-sub">{requests.filter(r=>r.status==='pending').length} pending approval</p>
        </div>
        <button className="btn btn-primary" onClick={()=>setModal(true)}>+ Request Leave</button>
      </div>
      <div className="tabs">
        {[['all','All'],['mine','Mine'],['pending','Pending'],['approved','Approved']].map(([k,l])=>(
          <button key={k} className={`tab${tab===k?' on':''}`} onClick={()=>setTab(k)}>{l}</button>
        ))}
      </div>
      <div className="card" style={{overflow:'hidden'}}>
        {loading ? <div style={{padding:24}}>{[1,2,3].map(i=><div key={i} className="skel" style={{height:52,marginBottom:8,borderRadius:8}}/>)}</div>
        : filtered.length===0 ? <div className="empty"><p>No leave requests</p></div>
        : <table className="tbl">
            <thead><tr>
              {isManager&&<th>Staff</th>}
              <th>Type</th><th>From</th><th>To</th><th>Days</th><th>Status</th><th>Notes</th>
              {isManager&&<th>Actions</th>}
            </tr></thead>
            <tbody>
              {filtered.map(r=>(
                <tr key={r.id}>
                  {isManager&&<td className="t-main">{getName(r.tenant_user_id)}</td>}
                  <td style={{textTransform:'capitalize'}}>{r.type}</td>
                  <td style={{fontFamily:'var(--font-mono)',fontSize:12}}>{new Date(r.start_date).toLocaleDateString('en-GB')}</td>
                  <td style={{fontFamily:'var(--font-mono)',fontSize:12}}>{new Date(r.end_date).toLocaleDateString('en-GB')}</td>
                  <td style={{fontWeight:600}}>{r.days}</td>
                  <td><span className={`badge ${SB[r.status]||'badge-grey'}`} style={{textTransform:'capitalize'}}>{r.status}</span></td>
                  <td style={{color:'var(--faint)',fontSize:12,maxWidth:160,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.notes||'—'}</td>
                  {isManager&&<td>{r.status==='pending'&&<div style={{display:'flex',gap:6}}>
                    <button className="btn btn-sm" style={{background:'var(--green-soft)',color:'var(--green)',border:'1px solid var(--green)'}} onClick={()=>review(r.id,'approved')}>✓</button>
                    <button className="btn btn-sm" style={{background:'var(--red-soft)',color:'var(--red)',border:'1px solid var(--red)'}} onClick={()=>review(r.id,'rejected')}>✗</button>
                  </div>}</td>}
                </tr>
              ))}
            </tbody>
          </table>}
      </div>
      {modal&&(
        <div className="modal-overlay" onClick={()=>setModal(false)}>
          <div className="modal-box" onClick={e=>e.stopPropagation()}>
            <div className="modal-hd">
              <span style={{fontWeight:600}}>Request Leave</span>
              <button onClick={()=>setModal(false)} style={{background:'none',border:'none',cursor:'pointer',fontSize:20,color:'var(--faint)'}}>×</button>
            </div>
            <div className="modal-body">
              <div style={{display:'flex',flexDirection:'column',gap:14}}>
                <div><label className="lbl">Type</label>
                  <select className="inp" value={form.type} onChange={e=>sf('type',e.target.value)}>
                    {TYPES.map(t=><option key={t} value={t}>{t.charAt(0).toUpperCase()+t.slice(1)}</option>)}
                  </select>
                </div>
                <div className="fg">
                  <div><label className="lbl">Start Date</label><input className="inp" type="date" value={form.start_date} onChange={e=>sf('start_date',e.target.value)}/></div>
                  <div><label className="lbl">End Date</label><input className="inp" type="date" value={form.end_date} min={form.start_date} onChange={e=>sf('end_date',e.target.value)}/></div>
                </div>
                {form.start_date&&form.end_date&&(
                  <div style={{background:'var(--blue-soft)',borderRadius:8,padding:'10px 14px',fontSize:13,color:'var(--blue)'}}>
                    <strong>{calcDays(form.start_date,form.end_date)} day{calcDays(form.start_date,form.end_date)!==1?'s':''}</strong> requested
                  </div>
                )}
                <div><label className="lbl">Notes</label>
                  <textarea className="inp" rows={3} value={form.notes} onChange={e=>sf('notes',e.target.value)} placeholder="Optional details..." style={{resize:'vertical'}}/>
                </div>
              </div>
            </div>
            <div className="modal-ft">
              <button className="btn btn-outline" onClick={()=>setModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={submit} disabled={saving}>{saving?'Submitting...':'Submit Request'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
