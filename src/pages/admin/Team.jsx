import { useState, useEffect } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { sbGetMany, sbUpdate } from '../../utils/supabase'
import { inviteMember } from '../../utils/invitations'
import { seatLimitReached } from '../../utils/entitlements'
import { deleteMemberSafely, logAuditEvent, removePendingInvite } from '../../utils/teamMembers'
import { assignableRoles, canManageTeam } from '../../utils/permissions'

export default function Team() {
  const { tenant, tenantUser } = useAuth()
  const [staff, setStaff] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({ email:'', role:'staff', full_name:'' })
  const [saving, setSaving] = useState(false)
  const canManage = canManageTeam(tenantUser?.role)
  const roleOptions = assignableRoles(tenantUser?.role)

  useEffect(() => { load() }, [tenant?.id])

  const load = async () => {
    if (!tenant?.id) return
    setLoading(true)
    const data = await sbGetMany('tenant_users', `tenant_id=eq.${tenant.id}&order=created_at.asc`)
    setStaff(data||[])
    setLoading(false)
  }

  const invite = async () => {
    if (!canManage) return
    if (!form.email.trim()) { alert('Email required'); return }
    const seatsInUse = staff.filter(member => member.status !== 'suspended').length
    if (seatLimitReached(tenant, seatsInUse)) { alert(`Seat limit reached. Upgrade your plan to add more team members.`); return }
    setSaving(true)
    try {
      const result = await inviteMember({
        tenant,
        tenantUser,
        email: form.email,
        role: form.role,
        fullName: form.full_name,
      })
      await load()
      setModal(false); setForm({email:'',role:'staff',full_name:''})
      alert(result.emailSent ? 'Invitation sent!' : `Invite created, but email could not be sent. ${result.emailError || 'Check worker settings.'}`)
    } catch(e) { alert(e.message) }
    setSaving(false)
  }

  const updateRole = async (id, role) => {
    if (!canManage) return
    await sbUpdate('tenant_users', `id=eq.${id}`, { role })
    await logAuditEvent({ tenantId: tenant.id, actorId: tenantUser?.id, action: 'member_role_updated', entity: 'tenant_user', entityId: id, metadata: { role } })
    setStaff(p=>p.map(s=>s.id===id?{...s,role}:s))
  }

  const suspend = async (id, status) => {
    if (!canManage) return
    await sbUpdate('tenant_users', `id=eq.${id}`, { status })
    await logAuditEvent({ tenantId: tenant.id, actorId: tenantUser?.id, action: status === 'suspended' ? 'member_suspended' : 'member_reinstated', entity: 'tenant_user', entityId: id })
    setStaff(p=>p.map(s=>s.id===id?{...s,status}:s))
  }

  const resendInvite = async (member) => {
    setSaving(true)
    try {
      const result = await inviteMember({
        tenant,
        tenantUser,
        email: member.email,
        role: member.role,
        fullName: member.full_name,
      })
      await load()
      alert(result.emailSent ? 'Invitation resent!' : `Invite refreshed, but email could not be sent. ${result.emailError || 'Check worker settings.'}`)
    } catch (e) {
      alert(e.message)
    }
    setSaving(false)
  }

  const deleteInvite = async (member) => {
    if (!window.confirm(`Delete the pending invite for ${member.email}?`)) return
    setSaving(true)
    try {
      await removePendingInvite({ tenantId: tenant.id, memberId: member.id, email: member.email, actorId: tenantUser?.id })
      await load()
    } catch (e) {
      alert(e.message)
    }
    setSaving(false)
  }

  const deleteMember = async (member) => {
    if (!window.confirm(`Permanently delete ${member.full_name || member.email}? This is only safe for suspended members with no history.`)) return
    setSaving(true)
    try {
      await deleteMemberSafely({ tenantId: tenant.id, member, actorId: tenantUser?.id })
      await load()
    } catch (e) {
      alert(e.message)
    }
    setSaving(false)
  }

  const initials = n => (n||'?').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()
  const billableSeats = staff.filter(s => s.status !== 'suspended').length

  if (!canManage) return <div className="card card-pad"><p style={{color:'var(--faint)'}}>Admin access required.</p></div>

  return (
    <div className="fade-in page-stack">
      <div className="page-hd">
        <div>
          <h1 className="page-title">Team</h1>
          <p className="page-sub">{billableSeats} / {tenant?.seat_limit||5} seats in use · Suspend members to remove access safely</p>
        </div>
        {canManage&&<button className="btn btn-primary" onClick={()=>setModal(true)}>+ Invite Member</button>}
      </div>
      <div className="kpi-strip">
        <div className="kpi-cell">
          <div className="kpi-cell-label">Seats in use</div>
          <div className="kpi-cell-value">{billableSeats} / {tenant?.seat_limit||5}</div>
        </div>
        <div className="kpi-cell">
          <div className="kpi-cell-label">Pending invites</div>
          <div className="kpi-cell-value">{staff.filter(member => member.status === 'invited').length}</div>
        </div>
        <div className="kpi-cell">
          <div className="kpi-cell-label">Suspended</div>
          <div className="kpi-cell-value">{staff.filter(member => member.status === 'suspended').length}</div>
        </div>
        <div className="kpi-cell">
          <div className="kpi-cell-label">Seat capacity</div>
          <div className="kpi-cell-value">{Math.round((billableSeats / (tenant?.seat_limit||5)) * 100)}%</div>
        </div>
      </div>
      <div className="card card-pad table-card">
        <div className="section-head">
          <div>
            <h3 className="panel-title">Team directory</h3>
            <div className="panel-sub">Roles, status, and access management across the workspace</div>
          </div>
        </div>
        <div style={{marginBottom:16}}>
          <div style={{height:6,background:'var(--border)',borderRadius:100,overflow:'hidden'}}>
          <div style={{width:`${Math.min(100,(billableSeats/(tenant?.seat_limit||5))*100)}%`,height:'100%',background:billableSeats>=(tenant?.seat_limit||5)?'var(--red)':'var(--green)',transition:'width 0.3s'}}/>
        </div>
        <div style={{fontSize:12,color:'var(--faint)',marginTop:4}}>{billableSeats} of {tenant?.seat_limit||5} seats used</div>
      </div>
        {loading ? <div style={{padding:24}}>{[1,2,3].map(i=><div key={i} className="skel" style={{height:64,marginBottom:8,borderRadius:8}}/>)}</div>
        : <table className="tbl">
            <thead><tr><th>Member</th><th>Email</th><th>Role</th><th>Status</th>{canManage&&<th>Actions</th>}</tr></thead>
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
                    {canManage&&s.id!==tenantUser?.id ? (
                      <select value={s.role} onChange={e=>updateRole(s.id,e.target.value)}
                        style={{fontSize:12,padding:'4px 8px',borderRadius:6,border:'1px solid var(--border)',background:'var(--bg)',textTransform:'capitalize'}}>
                        {roleOptions.map(r=><option key={r} value={r} style={{textTransform:'capitalize'}}>{r.charAt(0).toUpperCase()+r.slice(1)}</option>)}
                      </select>
                    ) : <span className="badge badge-blue" style={{textTransform:'capitalize'}}>{s.role}</span>}
                  </td>
                  <td><span className={`badge badge-${s.status==='active'?'green':s.status==='invited'?'amber':'grey'}`} style={{textTransform:'capitalize'}}>{s.status}</span></td>
                  {canManage&&<td>
                    {s.id!==tenantUser?.id&&(
                      <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                        {s.status === 'invited' ? (
                          <>
                            <button className="btn btn-sm btn-outline" onClick={()=>resendInvite(s)} disabled={saving}>Resend invite</button>
                            <button className="btn btn-sm" onClick={()=>deleteInvite(s)} disabled={saving}
                              style={{background:'var(--red-soft)',color:'var(--red)',border:'1px solid var(--red)'}}>
                              Delete invite
                            </button>
                          </>
                        ) : (
                          <>
                            <button className="btn btn-sm" onClick={()=>suspend(s.id,s.status==='active'?'suspended':'active')}
                              style={{background:s.status==='active'?'var(--amber-soft)':'var(--green-soft)',color:s.status==='active'?'var(--amber)':'var(--green)',border:`1px solid ${s.status==='active'?'var(--amber)':'var(--green)'}`}}>
                              {s.status==='active'?'Suspend':'Reinstate'}
                            </button>
                            {s.status === 'suspended' && (
                              <button className="btn btn-sm" onClick={()=>deleteMember(s)} disabled={saving}
                                style={{background:'var(--red-soft)',color:'var(--red)',border:'1px solid var(--red)'}}>
                                Delete member
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </td>}
                </tr>
              ))}
            </tbody>
          </table>}
      </div>
      <div style={{marginTop:16,fontSize:12,color:'var(--faint)'}}>
        Pending invites can be deleted. Active members should be suspended first. Permanent deletion is only allowed when a member has no linked HR, CRM, or audit history.
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
                    {roleOptions.map(r=><option key={r} value={r} style={{textTransform:'capitalize'}}>{r.charAt(0).toUpperCase()+r.slice(1)}</option>)}
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
