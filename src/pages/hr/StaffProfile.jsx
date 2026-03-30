import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { sbGet, sbGetMany, sbInsert, sbUpdate } from '../../utils/supabase'

const EMPTY_HR = { contract_type:'', start_date:'', phone:'', personal_email:'', address:'', emergency_name:'', emergency_phone:'', bank_name:'', account_name:'', sort_code:'', account_number:'', hr_notes:'' }

export default function StaffProfile() {
  const { userId } = useParams()
  const navigate = useNavigate()
  const { tenant, tenantUser } = useAuth()
  const [member, setMember] = useState(null)
  const [hrProfile, setHrProfile] = useState({ ...EMPTY_HR })
  const [hrId, setHrId] = useState(null)
  const [tab, setTab] = useState('profile')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const isAdmin = ['owner','admin','superadmin'].includes(tenantUser?.role)

  useEffect(() => { load() }, [userId, tenant?.id])

  const load = async () => {
    if (!tenant?.id||!userId) return
    setLoading(true)
    const [tu, hr] = await Promise.all([
      sbGet('tenant_users', `id=eq.${userId}&tenant_id=eq.${tenant.id}`),
      sbGet('hr_profiles', `tenant_user_id=eq.${userId}&tenant_id=eq.${tenant.id}`),
    ])
    if (tu) setMember(tu)
    if (hr) { setHrProfile({...EMPTY_HR,...hr}); setHrId(hr.id) }
    setLoading(false)
  }

  const save = async () => {
    setSaving(true)
    try {
      const payload = {
        ...hrProfile,
        start_date: hrProfile.start_date || null,
        tenant_id: tenant.id,
        tenant_user_id: userId,
        updated_at: new Date().toISOString(),
      }
      if (hrId) {
        await sbUpdate('hr_profiles', `id=eq.${hrId}`, payload)
      } else {
        await sbInsert('hr_profiles', { ...payload, created_at:new Date().toISOString() })
        const newHr = await sbGet('hr_profiles', `tenant_user_id=eq.${userId}`)
        if (newHr?.id) setHrId(newHr.id)
      }
      setSaved(true); setTimeout(()=>setSaved(false),3000)
    } catch(e) { alert('Save failed: '+e.message) }
    setSaving(false)
  }

  const updateRole = async (role) => {
    await sbUpdate('tenant_users', `id=eq.${userId}`, { role })
    setMember(p=>({...p,role}))
  }

  const updateStatus = async (status) => {
    await sbUpdate('tenant_users', `id=eq.${userId}`, { status })
    setMember(p=>({...p,status}))
  }

  const hp = (k,v) => setHrProfile(p=>({...p,[k]:v}))
  const initials = n => (n||'?').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()

  if (loading) return <div className="spin-wrap"><div className="spin"/></div>
  if (!member) return <div className="card card-pad"><p style={{color:'var(--faint)'}}>Staff member not found.</p></div>

  const canEdit = isAdmin || tenantUser?.id === userId
  const showHrSave = canEdit && tab !== 'access'

  return (
    <div className="fade-in page-stack">
      <div>
        <button onClick={()=>navigate('/staff')} className="btn btn-outline btn-sm">Back to staff directory</button>
      </div>
      <div className="card card-pad" style={{display:'flex',alignItems:'center',gap:20}}>
        <div style={{width:72,height:72,borderRadius:'50%',background:'var(--blue-soft)',border:'2px solid var(--border)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:28,fontWeight:600,fontFamily:'var(--font-display)',color:'var(--blue)',flexShrink:0}}>
          {initials(member.full_name||member.email)}
        </div>
        <div style={{flex:1}}>
          <h1 style={{fontFamily:'var(--font-display)',fontSize:26,fontWeight:400,lineHeight:1,marginBottom:4}}>{member.full_name||member.email}</h1>
          <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
            {member.job_title&&<span style={{fontSize:13,color:'var(--sub)'}}>{member.job_title}</span>}
            {member.department&&<><span style={{color:'var(--border2)'}}>·</span><span style={{fontSize:13,color:'var(--sub)'}}>{member.department}</span></>}
            <span style={{fontFamily:'var(--font-mono)',fontSize:11,color:'var(--faint)'}}>{member.email}</span>
          </div>
        </div>
        <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:8}}>
          <span className={`badge badge-${member.status==='active'?'green':'amber'}`} style={{textTransform:'capitalize'}}>{member.status}</span>
          <span className="badge badge-blue" style={{textTransform:'capitalize'}}>{member.role}</span>
          {showHrSave&&(
            <div style={{display:'flex',gap:6}}>
              {saved&&<span style={{fontSize:13,color:'var(--green)',alignSelf:'center'}}>Saved</span>}
              <button className="btn btn-primary btn-sm" onClick={save} disabled={saving}>{saving?'Saving...':'Save Changes'}</button>
            </div>
          )}
        </div>
      </div>
      <div className="tabs">
        {[['profile','Profile'],['hr','HR Details'],['bank','Bank'],['access','Access']].map(([k,l])=>(
          <button key={k} className={`tab${tab===k?' on':''}`} onClick={()=>setTab(k)}>{l}</button>
        ))}
      </div>
      <div className="compact-note">Keep personal details, HR records, banking information, and access controls in one staff record.</div>
      <div style={{maxWidth:680}}>
        {tab==='profile'&&(
          <div className="card card-pad">
            <div className="fg">
              <div><label className="lbl">Full Name</label><input className="inp" value={member.full_name||''} disabled={!canEdit} onChange={async e=>{setMember(p=>({...p,full_name:e.target.value}));await sbUpdate('tenant_users',`id=eq.${userId}`,{full_name:e.target.value})}}/></div>
              <div><label className="lbl">Job Title</label><input className="inp" value={member.job_title||''} disabled={!canEdit} onChange={async e=>{setMember(p=>({...p,job_title:e.target.value}));await sbUpdate('tenant_users',`id=eq.${userId}`,{job_title:e.target.value})}}/></div>
              <div><label className="lbl">Department</label><input className="inp" value={member.department||''} disabled={!canEdit} onChange={async e=>{setMember(p=>({...p,department:e.target.value}));await sbUpdate('tenant_users',`id=eq.${userId}`,{department:e.target.value})}}/></div>
              <div><label className="lbl">Phone</label><input className="inp" value={hrProfile.phone||''} disabled={!canEdit} onChange={e=>hp('phone',e.target.value)}/></div>
              <div><label className="lbl">Personal Email</label><input className="inp" value={hrProfile.personal_email||''} disabled={!canEdit} onChange={e=>hp('personal_email',e.target.value)}/></div>
              <div className="fc"><label className="lbl">Address</label><textarea className="inp" rows={2} value={hrProfile.address||''} disabled={!canEdit} onChange={e=>hp('address',e.target.value)} style={{resize:'vertical'}}/></div>
              <div><label className="lbl">Emergency Contact</label><input className="inp" placeholder="Name" value={hrProfile.emergency_name||''} disabled={!canEdit} onChange={e=>hp('emergency_name',e.target.value)}/></div>
              <div><label className="lbl">Emergency Phone</label><input className="inp" value={hrProfile.emergency_phone||''} disabled={!canEdit} onChange={e=>hp('emergency_phone',e.target.value)}/></div>
            </div>
          </div>
        )}
        {tab==='hr'&&isAdmin&&(
          <div className="card card-pad">
            <div className="fg">
              <div><label className="lbl">Contract Type</label>
                <select className="inp" value={hrProfile.contract_type||''} onChange={e=>hp('contract_type',e.target.value)}>
                  {['','Full-time','Part-time','Contractor','Zero Hours','Apprentice'].map(t=><option key={t}>{t}</option>)}
                </select>
              </div>
              <div><label className="lbl">Start Date</label><input className="inp" type="date" value={hrProfile.start_date||''} onChange={e=>hp('start_date',e.target.value)}/></div>
              <div className="fc"><label className="lbl">HR Notes (admin only)</label><textarea className="inp" rows={5} value={hrProfile.hr_notes||''} onChange={e=>hp('hr_notes',e.target.value)} style={{resize:'vertical'}} placeholder="Performance notes, training records..."/></div>
            </div>
          </div>
        )}
        {tab==='bank'&&isAdmin&&(
          <div className="card card-pad">
            <div style={{padding:'10px 14px',background:'var(--amber-soft)',border:'1px solid rgba(200,154,45,0.22)',borderRadius:10,fontSize:13,color:'var(--amber)',marginBottom:16}}>
              Bank details are sensitive — admin access only.
            </div>
            <div className="fg">
              <div><label className="lbl">Bank Name</label><input className="inp" value={hrProfile.bank_name||''} onChange={e=>hp('bank_name',e.target.value)}/></div>
              <div><label className="lbl">Account Name</label><input className="inp" value={hrProfile.account_name||''} onChange={e=>hp('account_name',e.target.value)}/></div>
              <div><label className="lbl">Sort Code</label><input className="inp" value={hrProfile.sort_code||''} onChange={e=>hp('sort_code',e.target.value)} placeholder="12-34-56" style={{fontFamily:'var(--font-mono)'}}/></div>
              <div><label className="lbl">Account Number</label><input className="inp" value={hrProfile.account_number||''} onChange={e=>hp('account_number',e.target.value)} placeholder="12345678" style={{fontFamily:'var(--font-mono)'}}/></div>
            </div>
          </div>
        )}
        {tab==='access'&&isAdmin&&(
          <div className="card card-pad">
            <div style={{display:'flex',flexDirection:'column',gap:16}}>
              <div><label className="lbl">Role</label>
                <select className="inp" value={member.role} onChange={e=>updateRole(e.target.value)}>
                  {['staff','manager','admin','owner'].map(r=><option key={r} value={r} style={{textTransform:'capitalize'}}>{r.charAt(0).toUpperCase()+r.slice(1)}</option>)}
                </select>
              </div>
              <div><label className="lbl">Status</label>
                <select className="inp" value={member.status} onChange={e=>updateStatus(e.target.value)}>
                  {['active','suspended'].map(s=><option key={s} value={s} style={{textTransform:'capitalize'}}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>)}
                </select>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
