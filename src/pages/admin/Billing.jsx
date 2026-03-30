import { useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { PLANS } from '../../utils/entitlements'

const FEATURE_LABELS = {
  hr_directory: 'Staff directory',
  hr_leave: 'Leave management',
  hr_documents: 'Documents and policies',
  hr_timesheets: 'Timesheets',
  hr_onboarding: 'HR onboarding',
  crm_clients: 'Client CRM',
  crm_tasks: 'Tasks',
  crm_pipeline: 'Sales pipeline',
  crm_outreach: 'Outreach',
  notifications: 'Notifications',
  audit_log: 'Audit log',
  reports: 'Reports',
  client_portal: 'Client portal',
  custom_branding: 'Custom branding',
  api_access: 'API access',
}

export default function Billing() {
  const { tenant } = useAuth()
  const plan = PLANS[tenant?.plan||'starter']
  const currentFeatures = new Set(plan?.features || [])

  return (
    <div className="fade-in">
      <div className="page-hd">
        <div>
          <h1 className="page-title">Billing</h1>
          <p className="page-sub">Manage your subscription</p>
        </div>
      </div>
      <div style={{maxWidth:600,display:'flex',flexDirection:'column',gap:20}}>
        <div className="card card-pad">
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:20}}>
            <div>
              <h3 style={{fontFamily:'var(--font-display)',fontSize:20,fontWeight:400,marginBottom:4}}>{plan?.name||'Starter'} Plan</h3>
              <div style={{fontSize:28,fontWeight:700,color:'var(--gold)'}}>£{plan?.launch_price||9}<span style={{fontSize:14,color:'var(--faint)',fontWeight:400}}>/mo</span></div>
              <div style={{fontSize:12,color:'var(--faint)',textDecoration:'line-through'}}>Normal price: £{plan?.normal_price||19}/mo</div>
            </div>
            <span className={`badge badge-${tenant?.status==='trialing'?'amber':tenant?.status==='active'?'green':'red'}`} style={{textTransform:'capitalize',fontSize:12}}>{tenant?.status==='trialing'?'Free Trial':tenant?.status}</span>
          </div>
          {tenant?.status==='trialing'&&(
            <div style={{background:'var(--gold-soft)',border:'1px solid var(--gold-border)',borderRadius:10,padding:'12px 16px',marginBottom:16}}>
              <div style={{fontSize:13,fontWeight:600,color:'var(--gold)',marginBottom:2}}>🎉 Founding Member</div>
              <div style={{fontSize:12,color:'var(--sub)'}}>Lock in this price forever by setting up Direct Debit before your trial ends.</div>
            </div>
          )}
          <div style={{display:'flex',flexDirection:'column',gap:8,marginBottom:20}}>
            {[
              ['Trial ends', tenant?.trial_ends_at ? new Date(tenant.trial_ends_at).toLocaleDateString('en-GB') : 'N/A'],
              ['Seats included', plan?.max_users||5],
              ['Last payment', tenant?.last_payment_at ? new Date(tenant.last_payment_at).toLocaleDateString('en-GB') : 'None yet'],
              ['Next payment', tenant?.next_payment_at ? new Date(tenant.next_payment_at).toLocaleDateString('en-GB') : 'N/A'],
            ].map(([label,val])=>(
              <div key={label} style={{display:'flex',justifyContent:'space-between',padding:'8px 0',borderBottom:'1px solid var(--border2)'}}>
                <span style={{fontSize:13,color:'var(--faint)'}}>{label}</span>
                <span style={{fontSize:13,fontFamily:'var(--font-mono)'}}>{val}</span>
              </div>
            ))}
          </div>
          {!tenant?.gc_mandate_id ? (
            <div>
              <p style={{fontSize:13,color:'var(--sub)',marginBottom:12}}>Set up Direct Debit to activate your subscription. UK businesses only — via GoCardless, no card needed.</p>
              <button className="btn btn-gold" style={{width:'100%',justifyContent:'center'}}>Set up Direct Debit →</button>
            </div>
          ) : (
            <div style={{display:'flex',gap:8}}>
              <button className="btn btn-outline">Update Payment Method</button>
              <button className="btn btn-outline" style={{color:'var(--red)'}}>Cancel Subscription</button>
            </div>
          )}
        </div>
        <div className="card card-pad">
          <h3 style={{fontFamily:'var(--font-display)',fontSize:18,fontWeight:400,marginBottom:16}}>Available Plans</h3>
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12}}>
            {Object.entries(PLANS).map(([key,p])=>(
              <div key={key} style={{border:`2px solid ${tenant?.plan===key?'var(--blue)':'var(--border)'}`,borderRadius:10,padding:16,background:tenant?.plan===key?'var(--blue-soft)':'transparent'}}>
                <div style={{fontWeight:600,marginBottom:4,textTransform:'capitalize'}}>{p.name}</div>
                <div style={{fontSize:22,fontWeight:700,color:'var(--gold)'}}>£{p.launch_price}<span style={{fontSize:12,color:'var(--faint)',fontWeight:400}}>/mo</span></div>
                <div style={{fontSize:11,color:'var(--faint)',marginBottom:8}}>Up to {p.max_users} users</div>
                <div style={{display:'flex',flexDirection:'column',gap:6,marginBottom:10}}>
                  {p.features.slice(0, 4).map(feature => (
                    <div key={feature} style={{fontSize:12,color:'var(--sub)'}}>• {FEATURE_LABELS[feature] || feature}</div>
                  ))}
                  {p.features.length > 4 && <div style={{fontSize:11,color:'var(--faint)'}}>+ {p.features.length - 4} more features</div>}
                </div>
                {tenant?.plan===key ? <span className="badge badge-blue" style={{fontSize:10}}>Current plan</span>
                : <button className="btn btn-outline btn-sm" style={{width:'100%',justifyContent:'center',marginTop:4}}>Switch</button>}
              </div>
            ))}
          </div>
        </div>
        <div className="card card-pad">
          <h3 style={{fontFamily:'var(--font-display)',fontSize:18,fontWeight:400,marginBottom:16}}>Your current access</h3>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
            {Object.entries(FEATURE_LABELS).map(([feature, label]) => (
              <div key={feature} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 12px',border:'1px solid var(--border)',borderRadius:10,background:currentFeatures.has(feature)?'var(--surface2)':'transparent'}}>
                <span style={{fontSize:13,color:'var(--text)'}}>{label}</span>
                <span className={`badge ${currentFeatures.has(feature) ? 'badge-green' : 'badge-grey'}`} style={{fontSize:10}}>
                  {currentFeatures.has(feature) ? 'Included' : 'Upgrade'}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
