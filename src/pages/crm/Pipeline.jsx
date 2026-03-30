import { useState, useEffect } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { sbGetMany, sbUpdate } from '../../utils/supabase'

const STAGES = [
  { id:'lead', label:'Leads', colour:'var(--faint)' },
  { id:'qualified', label:'Qualified', colour:'var(--blue)' },
  { id:'proposal', label:'Proposal Sent', colour:'var(--amber)' },
  { id:'negotiation', label:'Negotiating', colour:'var(--gold)' },
  { id:'active', label:'Won', colour:'var(--green)' },
  { id:'lost', label:'Lost', colour:'var(--red)' },
]

export default function Pipeline() {
  const { tenant } = useAuth()
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [tenant?.id])

  const load = async () => {
    if (!tenant?.id) return
    setLoading(true)
    const data = await sbGetMany('clients', `tenant_id=eq.${tenant.id}&order=created_at.desc`)
    setClients(data||[])
    setLoading(false)
  }

  const moveStage = async (id, status) => {
    await sbUpdate('clients', `id=eq.${id}`, { status, updated_at:new Date().toISOString() })
    setClients(p=>p.map(c=>c.id===id?{...c,status}:c))
  }

  const totalValue = (stage) => clients.filter(c=>c.status===stage).reduce((sum,c)=>sum+Number(c.value||0),0)

  return (
    <div className="fade-in">
      <div className="page-hd">
        <div>
          <h1 className="page-title">Pipeline</h1>
          <p className="page-sub">{clients.filter(c=>c.status!=='lost').length} active opportunities</p>
        </div>
      </div>
      {loading ? <div style={{display:'grid',gridTemplateColumns:'repeat(6,1fr)',gap:12}}>{STAGES.map(s=><div key={s.id} className="skel" style={{height:200,borderRadius:12}}/>)}</div>
      : <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))',gap:12,overflowX:'auto'}}>
          {STAGES.map(stage=>{
            const stageClients = clients.filter(c=>c.status===stage.id)
            return (
              <div key={stage.id}>
                <div style={{marginBottom:10}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}}>
                    <span style={{fontSize:12,fontWeight:700,letterSpacing:'0.04em',textTransform:'uppercase',color:stage.colour}}>{stage.label}</span>
                    <span style={{fontSize:12,background:'var(--bg)',border:'1px solid var(--border)',borderRadius:100,padding:'1px 8px',fontWeight:600}}>{stageClients.length}</span>
                  </div>
                  {totalValue(stage.id)>0&&<div style={{fontSize:11,color:'var(--faint)',fontFamily:'var(--font-mono)'}}>£{totalValue(stage.id).toLocaleString()}</div>}
                </div>
                <div style={{display:'flex',flexDirection:'column',gap:8,minHeight:80}}>
                  {stageClients.map(c=>(
                    <div key={c.id} className="card" style={{padding:'12px 14px',borderLeft:`3px solid ${stage.colour}`}}>
                      <div style={{fontWeight:500,fontSize:13,marginBottom:4}}>{c.name}</div>
                      {c.value&&<div style={{fontSize:11,color:'var(--faint)',fontFamily:'var(--font-mono)',marginBottom:6}}>£{Number(c.value).toLocaleString()}</div>}
                      <select value={c.status} onChange={e=>moveStage(c.id,e.target.value)}
                        style={{fontSize:11,padding:'2px 6px',borderRadius:4,border:'1px solid var(--border)',background:'var(--bg)',color:'var(--text)',cursor:'pointer',width:'100%'}}>
                        {STAGES.map(s=><option key={s.id} value={s.id}>{s.label}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>}
    </div>
  )
}
