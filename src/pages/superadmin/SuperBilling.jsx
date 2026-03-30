import { useState, useEffect } from 'react'
import { sbGetMany } from '../../utils/supabase'
import { PLANS } from '../../utils/entitlements'

export default function SuperBilling() {
  const [tenants, setTenants] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    sbGetMany('tenants', 'order=created_at.desc').then(data=>{setTenants(data||[]);setLoading(false)})
  }, [])

  const active = tenants.filter(t=>t.status==='active')
  const mrr = active.reduce((sum,t)=>{
    const prices = {starter:9,growth:24,business:59}
    return sum+(prices[t.plan]||0)
  },0)
  const arr = mrr*12
  const avgRevPerTenant = active.length ? (mrr/active.length).toFixed(2) : 0
  const churnRisk = tenants.filter(t=>t.status==='overdue' || t.status === 'blocked').length

  return (
    <div className="fade-in page-stack">
      <div className="page-hd">
        <div>
          <h1 className="page-title">Platform Billing</h1>
          <p className="page-sub">Revenue overview</p>
        </div>
      </div>
      <div className="stats-grid" style={{gridTemplateColumns:'repeat(4,1fr)'}}>
        {[
          {label:'MRR', val:`£${mrr}`, colour:'var(--gold)'},
          {label:'ARR (projected)', val:`£${arr}`, colour:'var(--green)'},
          {label:'Avg per tenant', val:`£${avgRevPerTenant}`, colour:'var(--blue)'},
          {label:'Churn Risk', val:churnRisk, colour:churnRisk>0?'var(--red)':'var(--green)'},
        ].map(s=>(
          <div key={s.label} className="stat-card">
            <div className="stat-val" style={{color:s.colour,fontSize:26}}>{s.val}</div>
            <div className="stat-lbl">{s.label}</div>
          </div>
        ))}
      </div>
      <div className="compact-note">Monitor revenue mix, active billing, and risk across the full tenant base.</div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:20}}>
        <div className="card card-pad">
          <div className="section-head">
            <div>
              <h3 className="panel-title">Revenue by plan</h3>
              <div className="panel-sub">Monthly recurring revenue split by plan tier</div>
            </div>
          </div>
          {Object.entries(PLANS).map(([key,plan])=>{
            const count = active.filter(t=>t.plan===key).length
            const rev = count*plan.launch_price
            return (
              <div key={key} style={{marginBottom:16}}>
                <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
                  <span style={{fontSize:13,fontWeight:500}}>{plan.name}</span>
                  <span style={{fontSize:13,fontFamily:'var(--font-mono)'}}>£{rev}/mo · {count} tenant{count!==1?'s':''}</span>
                </div>
                <div style={{height:6,background:'var(--border)',borderRadius:100,overflow:'hidden'}}>
                  <div style={{width:`${mrr>0?(rev/mrr*100):0}%`,height:'100%',background:'var(--gold)',borderRadius:100}}/>
                </div>
              </div>
            )
          })}
        </div>
        <div className="card card-pad">
          <div className="section-head">
            <div>
              <h3 className="panel-title">Status breakdown</h3>
              <div className="panel-sub">How the tenant base is split across billing states</div>
            </div>
          </div>
          {['trialing','active','overdue','suspended','blocked'].map(status=>{
            const count = tenants.filter(t=>t.status===status).length
            const colours = {trialing:'var(--amber)',active:'var(--green)',overdue:'var(--red)',suspended:'var(--faint)',blocked:'var(--red)'}
            return (
              <div key={status} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 0',borderBottom:'1px solid var(--border2)'}}>
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                  <div style={{width:8,height:8,borderRadius:'50%',background:colours[status]}}/>
                  <span style={{fontSize:13,textTransform:'capitalize'}}>{status}</span>
                </div>
                <span style={{fontSize:16,fontWeight:700,color:colours[status]}}>{count}</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
