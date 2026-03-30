import { useState, useEffect } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { sbGetMany, sbUpdate } from '../../utils/supabase'
import { inviteMember } from '../../utils/invitations'
import { seatLimitReached } from '../../utils/entitlements'

export default function Team() {
  const { tenant, tenantUser } = useAuth()
  const [staff, setStaff] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({ email:'', role:'staff', full_name:'' })
  const [saving, setSaving] = useState(false)
  const isOwner = ['owner','superadmin'].includes(tenantUser?.role)

  useEffect(() => { load() }, [tenant?.id])

  const load = async () => {
    if (!tenant?.id) return
    setLoading(true)
    const data = await sbGetMany('tenant_users', `tenant_id=eq.${tenant.id}&order=created_at.asc`)
    setStaff(data||[])
    setLoading(false)
  }

  const invite = async () => {
    if (!form.email.trim()) { alert('Email required'); return }
    if (seatLimitReached(tenant, staff.length)) { alert(`Seat limit reached. Upgrade your plan to add more team members.`); return }
    setSaving(true)
    try {
      await inviteMember({
        tenant,
        tenantUser,
        email: form.email,
        role: form.role,
        fullName: form.full_name,
      })
      await load()
      setModal(false); setForm({email:'',role:'staff',full_name:''})
      alert('Invitation sent!')
    } catch(e) { alert(e.message) }
    setSaving(false)
  }

  const updateRole = async (id, role) => {
    await sbUpdate('tenant_users', `id=eq.${id}`, { role })
    setStaff(p=>p.map(s=>s.id===id?{...s,role}:s))
  }

  const suspend = async (id, status) => {
    await sbUpdate('tenant_users', `id=eq.${id}`, { status })
    setStaff(p=>p.map(s=>s.id===id?{...s,status}:s))
  }

  const ROLES = ['staff','manager','admin','owner']
  const initials = n => (n||'?').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()

  return (
    <div className="fade-in">
      <div className="page-hd">
        <div>
          <h1 className="page-title">Team</h1>
          <p className="page-sub">{staff.length} / {tenant?.seat_limit||5} seats used</p>
        </div>
        {isOwner&&<button className="btn btn-primary" onClick={()=>setModal(true)}>+ Invite Member</button>}
      </div>
      <div style={{marginBottom:16}}>
        <div style={{height:6,background:'var(--border)',borderRadius:100,overflow:'hidden'}}>
          <div style={{width:`${Math.min(100,(staff.length/(tenant?.seat_limit||5))*100)}%`,height:'100%',background:staff.length>=(tenant?.seat_limit||5)?'var(--red)':'var(--green)',transition:'width 0.3s'}}/>
        </div>
        <div style={{fontSize:12,color:'var(--faint)',marginTop:4}}>{staff.length} of {tenant?.seat_limit||5} seats used</div>
      </div>
      <div className="card" style={{overflow:'hidden'}}>
        {loading ? <div style={{padding:24}}>{[1,2,3].map(i=><div key={i} className="skel" style={{height:64,marginBottom:8,borderRadius:8}}/>)}</div>
        : <table className="tbl">
            <thead><tr><th>Member</th><th>Email</th><th>Role</th><th>Status</th>{isOwner&&<th>Actions</th>}</tr></thead>
            <tbody>
              {staff.map(s=>(
                <tr key={s.id}>
                  <td>
                    <div style={{display:'flex',alignItems:'center',gap:10}}>
                      <div style={{width:32,height:32,borderRadius:'50%',background:'var(--blue-soft)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:600,color:'var(--blue)',flexShrink:0}}>{initials(s.full_name||s.email)}</div>
                      <span className="t-main">{s.full_name||'—'}</span>
                    </div>
                  </td>
                  <td style={{fontFamily:'var(--font-mono)',fontSize:11,color:'var(--faint)'}}>{s.email}</td>
                  <td>
                    {isOwner&&s.id!==tenantUser?.id ? (
                      <select value={s.role} onChange={e=>updateRole(s.id,e.target.value)}
                        style={{fontSize:12,padding:'4px 8px',borderRadius:6,border:'1px solid var(--border)',background:'var(--bg)',textTransform:'capitalize'}}>
                        {ROLES.map(r=><option key={r} value={r} style={{textTransform:'capitalize'}}>{r.charAt(0).toUpperCase()+r.slice(1)}</option>)}
                      </select>
                    ) : <span className="badge badge-blue" style={{textTransform:'capitalize'}}>{s.role}</span>}
                  </td>
                  <td><span className={`badge badge-${s.status==='active'?'green':'amber'}`} style={{textTransform:'capitalize'}}>{s.status}</span></td>
                  {isOwner&&<td>{s.id!==tenantUser?.id&&(
                    <button className="btn btn-sm" onClick={()=>suspend(s.id,s.status==='active'?'suspended':'active')}
                      style={{background:s.status==='active'?'var(--amber-soft)':'var(--green-soft)',color:s.status==='active'?'var(--amber)':'var(--green)',border:`1px solid ${s.status==='active'?'var(--amber)':'var(--green)'}`}}>
                      {s.status==='active'?'Suspend':'Reinstate'}
                    </button>
                  )}</td>}
                </tr>
              ))}
            </tbody>
          </table>}
      </div>
      {modal&&(
        <div className="modal-overlay" onClick={()=>setModal(false)}>
          <div className="modal-box" onClick={e=>e.stopPropagation()}>
            <div className="modal-hd"><span style={{fontWeight:600}}>Invite Team Member</span><button onClick={()=>setModal(false)} style={{background:'none',border:'none',cursor:'pointer',fontSize:20,color:'var(--faint)'}}>×</button></div>
            <div className="modal-body">
              <div style={{display:'flex',flexDirection:'column',gap:14}}>
                <div><label className="lbl">Full Name</label><input className="inp" placeholder="Jane Smith" value={form.full_name} onChange={e=>setForm(p=>({...p,full_name:e.target.value}))}/></div>
                <div><label className="lbl">Email Address *</label><input className="inp" type="email" placeholder="jane@company.co.uk" value={form.email} onChange={e=>setForm(p=>({...p,email:e.target.value}))}/></div>
                <div><label className="lbl">Role</label>
                  <select className="inp" value={form.role} onChange={e=>setForm(p=>({...p,role:e.target.value}))}>
                    {ROLES.map(r=><option key={r} value={r} style={{textTransform:'capitalize'}}>{r.charAt(0).toUpperCase()+r.slice(1)}</option>)}
                  </select>
                </div>
              </div>
            </div>
            <div className="modal-ft">
              <button className="btn btn-outline" onClick={()=>setModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={invite} disabled={saving}>{saving?'Sending...':'Send Invite'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
