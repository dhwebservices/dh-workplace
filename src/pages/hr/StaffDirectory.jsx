import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { sbGetMany } from '../../utils/supabase'
import { inviteMember } from '../../utils/invitations'
import { seatLimitReached } from '../../utils/entitlements'

export default function StaffDirectory() {
  const { tenant, tenantUser } = useAuth()
  const navigate = useNavigate()
  const [staff, setStaff] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [inviteModal, setInviteModal] = useState(false)
  const [invForm, setInvForm] = useState({ email: '', role: 'staff', full_name: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [tenant?.id])

  const load = async () => {
    if (!tenant?.id) return
    setLoading(true)
    const data = await sbGetMany('tenant_users', `tenant_id=eq.${tenant.id}&order=full_name.asc`)
    setStaff(data)
    setLoading(false)
  }

  const invite = async () => {
    if (!invForm.email.trim()) { alert('Email is required'); return }
    if (seatLimitReached(tenant, staff.length)) { alert(`You've reached your ${tenant.plan} plan seat limit. Upgrade to add more team members.`); return }
    setSaving(true)
    try {
      await inviteMember({
        tenant,
        tenantUser,
        email: invForm.email,
        role: invForm.role,
        fullName: invForm.full_name,
      })
      await load()
      setInviteModal(false)
      setInvForm({ email: '', role: 'staff', full_name: '' })
      alert('Invitation sent!')
    } catch(e) { alert('Failed: ' + e.message) }
    setSaving(false)
  }

  const COLOURS = ['#0071E3','#30A46C','#E54D2E','#8E4EC6','#C2500D','#D6409F']
  const colourFor = email => COLOURS[(email||'').split('').reduce((a,c)=>a+c.charCodeAt(0),0) % COLOURS.length]
  const initials = name => (name||'?').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()

  const filtered = staff.filter(u => {
    const q = search.toLowerCase()
    return !q || u.full_name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q)
  })

  const canInvite = tenantUser?.role === 'owner' || tenantUser?.role === 'admin'

  return (
    <div className="fade-in">
      <div className="page-hd">
        <div>
          <h1 className="page-title">Staff Directory</h1>
          <p className="page-sub">{staff.length} team member{staff.length !== 1 ? 's' : ''} · {tenant?.seat_limit || 5} seat limit</p>
        </div>
        {canInvite && (
          <button className="btn btn-primary" onClick={() => setInviteModal(true)}>+ Invite member</button>
        )}
      </div>

      <div style={{ position:'relative', maxWidth:400, marginBottom:24 }}>
        <input className="inp" style={{ paddingLeft:36, borderRadius:100 }} placeholder="Search staff..." value={search} onChange={e => setSearch(e.target.value)} />
        <span style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', color:'var(--faint)', fontSize:14 }}>⌕</span>
      </div>

      {loading ? (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))', gap:16 }}>
          {[1,2,3,4].map(i => <div key={i} className="card" style={{ padding:24 }}><div className="skel" style={{ width:56,height:56,borderRadius:'50%',marginBottom:12 }}/><div className="skel" style={{ width:'70%',height:14,marginBottom:8 }}/><div className="skel" style={{ width:'50%',height:12 }}/></div>)}
        </div>
      ) : (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))', gap:16 }}>
          {filtered.map(u => {
            const colour = colourFor(u.email)
            return (
              <button key={u.id} onClick={() => navigate(`/staff/${u.id}`)}
                style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:14, padding:'24px 20px', textAlign:'center', cursor:'pointer', transition:'all 0.2s', display:'flex', flexDirection:'column', alignItems:'center', gap:12 }}
                onMouseOver={e => { e.currentTarget.style.borderColor=colour; e.currentTarget.style.transform='translateY(-3px)'; e.currentTarget.style.boxShadow=`0 8px 24px ${colour}22` }}
                onMouseOut={e => { e.currentTarget.style.borderColor='var(--border)'; e.currentTarget.style.transform='translateY(0)'; e.currentTarget.style.boxShadow='none' }}>
                <div style={{ width:56,height:56,borderRadius:'50%',background:colour+'18',border:`2px solid ${colour}33`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:20,fontWeight:600,color:colour,fontFamily:'var(--font-display)' }}>
                  {initials(u.full_name || u.email)}
                </div>
                <div>
                  <div style={{ fontSize:14,fontWeight:600,color:'var(--text)',marginBottom:2 }}>{u.full_name || u.email}</div>
                  <div style={{ fontSize:11,color:'var(--faint)',fontFamily:'var(--font-mono)' }}>{u.job_title || u.role}</div>
                </div>
                <span className={`badge badge-${u.status === 'active' ? 'green' : 'amber'}`} style={{ textTransform:'capitalize' }}>{u.status}</span>
              </button>
            )
          })}
          {filtered.length === 0 && !loading && <div style={{ gridColumn:'1/-1' }} className="empty"><p>No staff found</p></div>}
        </div>
      )}

      {/* Invite modal */}
      {inviteModal && (
        <div className="modal-overlay" onClick={() => setInviteModal(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-hd">
              <span style={{ fontWeight:600 }}>Invite team member</span>
              <button onClick={() => setInviteModal(false)} style={{ background:'none',border:'none',cursor:'pointer',fontSize:20,color:'var(--faint)' }}>×</button>
            </div>
            <div className="modal-body">
              <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
                <div><label className="lbl">Full Name</label><input className="inp" placeholder="Jane Smith" value={invForm.full_name} onChange={e=>setInvForm(p=>({...p,full_name:e.target.value}))}/></div>
                <div><label className="lbl">Email Address</label><input className="inp" type="email" placeholder="jane@company.co.uk" value={invForm.email} onChange={e=>setInvForm(p=>({...p,email:e.target.value}))}/></div>
                <div><label className="lbl">Role</label>
                  <select className="inp" value={invForm.role} onChange={e=>setInvForm(p=>({...p,role:e.target.value}))}>
                    <option value="admin">Admin</option>
                    <option value="manager">Manager</option>
                    <option value="staff">Staff</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="modal-ft">
              <button className="btn btn-outline" onClick={() => setInviteModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={invite} disabled={saving}>{saving ? 'Sending...' : 'Send Invite'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
