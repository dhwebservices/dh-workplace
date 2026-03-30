import { useState, useEffect } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { sbGetMany, sbInsert, sbUpdate } from '../../utils/supabase'

const EMPTY = { date: new Date().toISOString().split('T')[0], hours: '', description: '', client_id: '' }

export default function Timesheets() {
  const { tenant, tenantUser } = useAuth()
  const [entries, setEntries] = useState([])
  const [clients, setClients] = useState([])
  const [staff, setStaff] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({ ...EMPTY })
  const [saving, setSaving] = useState(false)
  const [tab, setTab] = useState('mine')
  const sf = (k,v) => setForm(p=>({...p,[k]:v}))
  const isManager = ['owner','admin','manager','superadmin'].includes(tenantUser?.role)

  useEffect(() => { load() }, [tenant?.id])

  const load = async () => {
    if (!tenant?.id) return
    setLoading(true)
    const [ts, cl, st] = await Promise.all([
      sbGetMany('timesheets', `tenant_id=eq.${tenant.id}&order=date.desc`),
      sbGetMany('clients', `tenant_id=eq.${tenant.id}&order=name.asc`),
      sbGetMany('tenant_users', `tenant_id=eq.${tenant.id}&order=full_name.asc`),
    ])
    setEntries(ts||[]); setClients(cl||[]); setStaff(st||[])
    setLoading(false)
  }

  const submit = async () => {
    if (!form.hours||!form.date) { alert('Date and hours required'); return }
    setSaving(true)
    try {
      await sbInsert('timesheets', {
        tenant_id:tenant.id, tenant_user_id:tenantUser.id,
        date:form.date, hours:Number(form.hours), description:form.description||null,
        client_id:form.client_id||null, status:'pending',
        created_at:new Date().toISOString()
      })
      setModal(false); setForm({...EMPTY}); load()
    } catch(e) { alert(e.message) }
    setSaving(false)
  }

  const approve = async (id, status) => {
    await sbUpdate('timesheets', `id=eq.${id}`, { status, approved_by:tenantUser.id })
    setEntries(p=>p.map(e=>e.id===id?{...e,status}:e))
  }

  const getName = id => staff.find(s=>s.id===id)?.full_name||'Unknown'
  const getClient = id => clients.find(c=>c.id===id)?.name||'—'

  const filtered = entries.filter(e => tab==='mine' ? e.tenant_user_id===tenantUser?.id : true)
  const totalHours = filtered.reduce((sum,e)=>sum+Number(e.hours||0),0)
  const SB = { pending:'badge-amber', approved:'badge-green', rejected:'badge-red' }

  return (
    <div className="fade-in page-stack">
      <div className="page-hd">
        <div>
          <h1 className="page-title">Timesheets</h1>
          <p className="page-sub">{totalHours.toFixed(1)} hours logged</p>
        </div>
        <button className="btn btn-primary" onClick={()=>setModal(true)}>+ Log Hours</button>
      </div>
      <div className="compact-note">Track time by day, tie work to client accounts, and keep approvals clear for managers.</div>
      <div className="tabs">
        {[['mine','My Hours'],isManager&&['all','All Staff']].filter(Boolean).map(([k,l])=>(
          <button key={k} className={`tab${tab===k?' on':''}`} onClick={()=>setTab(k)}>{l}</button>
        ))}
      </div>
      <div className="card card-pad table-card">
        {loading ? <div style={{padding:24}}>{[1,2,3].map(i=><div key={i} className="skel" style={{height:52,marginBottom:8,borderRadius:8}}/>)}</div>
        : filtered.length===0 ? <div className="empty"><p>No timesheet entries</p></div>
        : <table className="tbl">
            <thead><tr>
              {tab==='all'&&<th>Staff</th>}
              <th>Date</th><th>Hours</th><th>Description</th><th>Client</th><th>Status</th>
              {isManager&&<th>Actions</th>}
            </tr></thead>
            <tbody>
              {filtered.map(e=>(
                <tr key={e.id}>
                  {tab==='all'&&<td className="t-main">{getName(e.tenant_user_id)}</td>}
                  <td style={{fontFamily:'var(--font-mono)',fontSize:12}}>{new Date(e.date).toLocaleDateString('en-GB')}</td>
                  <td style={{fontWeight:700}}>{e.hours}h</td>
                  <td style={{color:'var(--sub)',fontSize:13,maxWidth:200,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{e.description||'—'}</td>
                  <td style={{fontSize:12,color:'var(--faint)'}}>{getClient(e.client_id)}</td>
                  <td><span className={`badge ${SB[e.status]||'badge-grey'}`} style={{textTransform:'capitalize'}}>{e.status}</span></td>
                  {isManager&&<td>{e.status==='pending'&&<div style={{display:'flex',gap:6}}>
                    <button className="btn btn-sm btn-outline" style={{color:'var(--green)', borderColor:'rgba(36,160,107,0.22)', background:'var(--green-soft)'}} onClick={()=>approve(e.id,'approved')}>Approve</button>
                    <button className="btn btn-sm btn-outline" style={{color:'var(--red)', borderColor:'rgba(222,91,77,0.22)', background:'var(--red-soft)'}} onClick={()=>approve(e.id,'rejected')}>Reject</button>
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
              <span style={{fontWeight:600}}>Log Hours</span>
              <button onClick={()=>setModal(false)} style={{background:'none',border:'none',cursor:'pointer',fontSize:20,color:'var(--faint)'}}>×</button>
            </div>
            <div className="modal-body">
              <div style={{display:'flex',flexDirection:'column',gap:14}}>
                <div className="fg">
                  <div><label className="lbl">Date</label><input className="inp" type="date" value={form.date} onChange={e=>sf('date',e.target.value)}/></div>
                  <div><label className="lbl">Hours</label><input className="inp" type="number" min="0.5" max="24" step="0.5" value={form.hours} onChange={e=>sf('hours',e.target.value)} placeholder="7.5"/></div>
                </div>
                <div><label className="lbl">Description</label><input className="inp" value={form.description} onChange={e=>sf('description',e.target.value)} placeholder="What did you work on?"/></div>
                <div><label className="lbl">Client (optional)</label>
                  <select className="inp" value={form.client_id} onChange={e=>sf('client_id',e.target.value)}>
                    <option value="">— No client —</option>
                    {clients.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              </div>
            </div>
            <div className="modal-ft">
              <button className="btn btn-outline" onClick={()=>setModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={submit} disabled={saving}>{saving?'Saving...':'Log Hours'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
