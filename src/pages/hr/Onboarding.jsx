import { useState, useEffect } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { sbGetMany, sbInsert, sbUpdate } from '../../utils/supabase'

const DEFAULT_CHECKLIST = [
  'Send welcome email', 'Set up email account', 'Add to team channels',
  'Assign IT equipment', 'Complete contract signing', 'ID verification',
  'Emergency contact form', 'Bank details form', 'Payroll setup',
  'First day induction', 'Introduction to team', 'System access setup',
  'Health & safety briefing', 'Review company policies', '30-day check-in scheduled'
]

export default function Onboarding() {
  const { tenant, tenantUser } = useAuth()
  const [staff, setStaff] = useState([])
  const [selected, setSelected] = useState(null)
  const [checklist, setChecklist] = useState([])
  const [loading, setLoading] = useState(true)
  const isAdmin = ['owner','admin','superadmin'].includes(tenantUser?.role)

  useEffect(() => { load() }, [tenant?.id])

  const load = async () => {
    if (!tenant?.id) return
    setLoading(true)
    const onboarding = await sbGetMany('tenant_users', `tenant_id=eq.${tenant.id}&status=eq.invited&order=created_at.desc`)
    setStaff(onboarding||[])
    setLoading(false)
  }

  const selectStaff = (member) => {
    setSelected(member)
    const saved = member.onboarding_checklist || []
    setChecklist(DEFAULT_CHECKLIST.map(item => ({ item, done: saved.includes(item) })))
  }

  const toggle = async (item) => {
    const updated = checklist.map(c => c.item===item ? {...c,done:!c.done} : c)
    setChecklist(updated)
    const done = updated.filter(c=>c.done).map(c=>c.item)
    await sbUpdate('tenant_users', `id=eq.${selected.id}`, { onboarding_checklist: done })
    const allDone = updated.every(c=>c.done)
    if (allDone) {
      await sbUpdate('tenant_users', `id=eq.${selected.id}`, { status:'active' })
      setSelected(p=>({...p,status:'active'}))
      setStaff(p=>p.filter(s=>s.id!==selected.id))
    }
  }

  const progress = checklist.length ? Math.round(checklist.filter(c=>c.done).length/checklist.length*100) : 0

  return (
    <div className="fade-in">
      <div className="page-hd">
        <div>
          <h1 className="page-title">Onboarding</h1>
          <p className="page-sub">{staff.length} new starter{staff.length!==1?'s':''} in progress</p>
        </div>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'280px 1fr',gap:20,alignItems:'start'}}>
        <div className="card" style={{overflow:'hidden'}}>
          <div style={{padding:'12px 16px',borderBottom:'1px solid var(--border)',fontWeight:600,fontSize:13}}>New Starters</div>
          {loading ? <div style={{padding:16}}><div className="skel" style={{height:48,borderRadius:8}}/></div>
          : staff.length===0 ? <div className="empty" style={{padding:24}}><p>No pending onboarding</p></div>
          : staff.map(s=>(
            <button key={s.id} onClick={()=>selectStaff(s)}
              style={{width:'100%',padding:'14px 16px',border:'none',borderBottom:'1px solid var(--border)',background:selected?.id===s.id?'var(--bg)':'transparent',cursor:'pointer',textAlign:'left',transition:'background 0.15s'}}>
              <div style={{fontWeight:500,fontSize:13,color:'var(--text)',marginBottom:2}}>{s.full_name||s.email}</div>
              <div style={{fontSize:11,color:'var(--faint)',fontFamily:'var(--font-mono)'}}>{s.email}</div>
            </button>
          ))}
        </div>
        {selected ? (
          <div className="card card-pad">
            <div style={{marginBottom:20}}>
              <h2 style={{fontFamily:'var(--font-display)',fontSize:22,fontWeight:400,marginBottom:4}}>{selected.full_name||selected.email}</h2>
              <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:12}}>
                <div style={{flex:1,height:6,background:'var(--border)',borderRadius:100,overflow:'hidden'}}>
                  <div style={{width:`${progress}%`,height:'100%',background:'var(--green)',borderRadius:100,transition:'width 0.3s'}}/>
                </div>
                <span style={{fontSize:13,fontWeight:600,color:progress===100?'var(--green)':'var(--sub)'}}>{progress}%</span>
              </div>
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:8}}>
              {checklist.map(({item,done})=>(
                <button key={item} onClick={()=>isAdmin&&toggle(item)}
                  style={{display:'flex',alignItems:'center',gap:12,padding:'12px 14px',borderRadius:8,border:'1px solid',borderColor:done?'var(--green)':'var(--border)',background:done?'var(--green-soft)':'transparent',cursor:isAdmin?'pointer':'default',textAlign:'left',transition:'all 0.15s'}}>
                  <div style={{width:20,height:20,borderRadius:'50%',border:`2px solid ${done?'var(--green)':'var(--border)'}`,background:done?'var(--green)':'transparent',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,transition:'all 0.15s'}}>
                    {done&&<span style={{color:'#fff',fontSize:11}}>✓</span>}
                  </div>
                  <span style={{fontSize:13,color:done?'var(--green)':'var(--text)',fontWeight:done?500:400,textDecoration:done?'line-through':'none'}}>{item}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="card card-pad" style={{textAlign:'center',padding:48}}>
            <div style={{fontSize:32,marginBottom:12}}>🎓</div>
            <p style={{color:'var(--faint)',fontSize:14}}>Select a new starter to view their onboarding checklist</p>
          </div>
        )}
      </div>
    </div>
  )
}
