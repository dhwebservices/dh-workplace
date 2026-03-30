import { useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { sbUpdate } from '../../utils/supabase'

export default function Settings() {
  const { tenant, tenantUser, refreshTenant } = useAuth()
  const [form, setForm] = useState({ name: tenant?.name||'', primary_colour: tenant?.primary_colour||'#0071E3' })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const isOwner = ['owner','superadmin'].includes(tenantUser?.role)

  const save = async () => {
    if (!isOwner) return
    setSaving(true)
    try {
      await sbUpdate('tenants', `id=eq.${tenant.id}`, { name:form.name, primary_colour:form.primary_colour, updated_at:new Date().toISOString() })
      await refreshTenant()
      setSaved(true); setTimeout(()=>setSaved(false),3000)
    } catch(e) { alert(e.message) }
    setSaving(false)
  }

  return (
    <div className="fade-in">
      <div className="page-hd">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-sub">Workspace preferences</p>
        </div>
        {saved&&<span style={{fontSize:13,color:'var(--green)'}}>✓ Saved</span>}
      </div>
      <div style={{maxWidth:560,display:'flex',flexDirection:'column',gap:20}}>
        <div className="card card-pad">
          <h3 style={{fontFamily:'var(--font-display)',fontSize:18,fontWeight:400,marginBottom:16}}>Workspace</h3>
          <div style={{display:'flex',flexDirection:'column',gap:14}}>
            <div><label className="lbl">Company Name</label><input className="inp" value={form.name} disabled={!isOwner} onChange={e=>setForm(p=>({...p,name:e.target.value}))}/></div>
            <div><label className="lbl">Brand Colour</label>
              <div style={{display:'flex',gap:10,alignItems:'center'}}>
                <input type="color" value={form.primary_colour} disabled={!isOwner} onChange={e=>setForm(p=>({...p,primary_colour:e.target.value}))} style={{width:40,height:40,borderRadius:8,border:'1px solid var(--border)',cursor:'pointer',padding:2}}/>
                <input className="inp" value={form.primary_colour} disabled={!isOwner} onChange={e=>setForm(p=>({...p,primary_colour:e.target.value}))} style={{fontFamily:'var(--font-mono)',maxWidth:120}}/>
              </div>
            </div>
          </div>
          {isOwner&&<button className="btn btn-primary" style={{marginTop:20}} onClick={save} disabled={saving}>{saving?'Saving...':'Save Changes'}</button>}
        </div>
        <div className="card card-pad">
          <h3 style={{fontFamily:'var(--font-display)',fontSize:18,fontWeight:400,marginBottom:16}}>Plan & Usage</h3>
          <div style={{display:'flex',flexDirection:'column',gap:10}}>
            {[
              ['Plan', <span className="badge badge-blue" style={{textTransform:'capitalize'}}>{tenant?.plan||'starter'}</span>],
              ['Status', <span className={`badge badge-${tenant?.status==='trialing'?'amber':tenant?.status==='active'?'green':'red'}`} style={{textTransform:'capitalize'}}>{tenant?.status}</span>],
              ['Seats', `${tenant?.seat_limit||5} max`],
              ['Trial Ends', tenant?.trial_ends_at ? new Date(tenant.trial_ends_at).toLocaleDateString('en-GB') : 'N/A'],
            ].map(([label,val])=>(
              <div key={label} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 0',borderBottom:'1px solid var(--border2)'}}>
                <span style={{fontSize:13,color:'var(--faint)'}}>{label}</span>
                <span style={{fontSize:13}}>{val}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
