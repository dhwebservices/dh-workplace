import { useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { sbUpdate } from '../../utils/supabase'
import { canManageWorkspaceSettings } from '../../utils/permissions'
import { can } from '../../utils/entitlements'
import { sendWebhookEvent } from '../../utils/webhooks'

export default function Settings() {
  const { tenant, tenantUser, employeePermissions, refreshTenant } = useAuth()
  const [form, setForm] = useState({ name: tenant?.name||'', primary_colour: tenant?.primary_colour||'#0071E3', logo_url: tenant?.logo_url || '' })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const canManage = canManageWorkspaceSettings({ role: tenantUser?.role, permissionRecord: employeePermissions })
  const canWhiteLabel = can(tenant, 'custom_branding')

  const save = async () => {
    if (!canManage) return
    setSaving(true)
    try {
      await sbUpdate('tenants', `id=eq.${tenant.id}`, { name:form.name, primary_colour:form.primary_colour, logo_url: form.logo_url || null, updated_at:new Date().toISOString() })
      sendWebhookEvent({
        tenantId: tenant.id,
        event: 'tenant.updated',
        payload: {
          name: form.name,
          primary_colour: form.primary_colour,
          logo_url: form.logo_url || null,
        },
      })
      await refreshTenant()
      setSaved(true); setTimeout(()=>setSaved(false),3000)
    } catch(e) { alert(e.message) }
    setSaving(false)
  }

  if (!canManage) return <div className="card card-pad"><p style={{color:'var(--faint)'}}>Owner access required.</p></div>

  return (
    <div className="fade-in page-stack">
      <div className="page-hd">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-sub">Workspace preferences</p>
        </div>
        {saved&&<span style={{fontSize:13,color:'var(--green)'}}>Saved</span>}
      </div>
      <div className="compact-note">Manage your workspace identity, colour, plan visibility, and commercial settings from one page.</div>
      <div style={{maxWidth:560,display:'flex',flexDirection:'column',gap:20}}>
        <div className="card card-pad">
          <div className="section-head">
            <div>
              <h3 className="panel-title">Workspace</h3>
              <div className="panel-sub">Core tenant details and brand settings</div>
            </div>
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:14}}>
            <div><label className="lbl">Company Name</label><input className="inp" value={form.name} disabled={!canManage} onChange={e=>setForm(p=>({...p,name:e.target.value}))}/></div>
            <div><label className="lbl">Brand Colour</label>
              <div style={{display:'flex',gap:10,alignItems:'center'}}>
                <input type="color" value={form.primary_colour} disabled={!canManage} onChange={e=>setForm(p=>({...p,primary_colour:e.target.value}))} style={{width:40,height:40,borderRadius:8,border:'1px solid var(--border)',cursor:'pointer',padding:2}}/>
                <input className="inp" value={form.primary_colour} disabled={!canManage} onChange={e=>setForm(p=>({...p,primary_colour:e.target.value}))} style={{fontFamily:'var(--font-mono)',maxWidth:120}}/>
              </div>
              <div style={{fontSize:12,color:'var(--faint)',marginTop:6}}>Used for workspace accents and preview styling.</div>
            </div>
          </div>
        </div>
        <div className="card card-pad">
          <div className="section-head">
            <div>
              <h3 className="panel-title">White-label controls</h3>
              <div className="panel-sub">Business plan workspaces can replace the default shell identity with their own logo.</div>
            </div>
          </div>
          {!canWhiteLabel && (
            <div style={{marginBottom:16,padding:14,border:'1px solid var(--border)',borderRadius:12,background:'var(--surface-strong)',fontSize:13,color:'var(--sub)'}}>
              White-label controls unlock on the Business plan. Trial workspaces can preview them before choosing a plan.
            </div>
          )}
          <div style={{display:'flex',flexDirection:'column',gap:14}}>
            <div>
              <label className="lbl">Logo URL</label>
              <input className="inp" value={form.logo_url} disabled={!canManage || !canWhiteLabel} placeholder="https://your-domain/logo.png" onChange={e=>setForm(p=>({...p,logo_url:e.target.value}))}/>
              <div style={{fontSize:12,color:'var(--faint)',marginTop:6}}>Displayed in the sidebar and workspace shell when custom branding is available.</div>
            </div>
            <div style={{border:'1px solid var(--border)',borderRadius:12,padding:16,background:'var(--surface-strong)'}}>
              <div style={{fontSize:12,color:'var(--faint)',marginBottom:10,textTransform:'uppercase',letterSpacing:'0.08em'}}>Preview</div>
              <div style={{display:'flex',alignItems:'center',gap:12}}>
                {form.logo_url ? (
                  <img src={form.logo_url} alt="Workspace logo" style={{width:40,height:40,borderRadius:10,objectFit:'cover',border:'1px solid var(--border)'}} />
                ) : (
                  <div style={{width:40,height:40,borderRadius:10,background:form.primary_colour,color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:700}}>
                    {(form.name || 'D')[0]?.toUpperCase()}
                  </div>
                )}
                <div>
                  <div style={{fontSize:15,fontWeight:700,color:'var(--text)'}}>{form.name || 'DH Workplace'}</div>
                  <div style={{fontSize:12,color:'var(--faint)'}}>{canWhiteLabel ? 'Custom shell branding preview' : 'Workspace branding preview'}</div>
                </div>
              </div>
            </div>
          </div>
          {canManage&&<button className="btn btn-primary" style={{marginTop:20}} onClick={save} disabled={saving}>{saving?'Saving...':'Save Changes'}</button>}
        </div>
        <div className="card card-pad">
          <div className="section-head">
            <div>
              <h3 className="panel-title">Plan and usage</h3>
              <div className="panel-sub">A quick view of access, status, and workspace capacity</div>
            </div>
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:10}}>
            {[
              ['Plan', <span className="badge badge-blue" style={{textTransform:'capitalize'}}>{tenant?.plan||'starter'}</span>],
              ['Status', <span className={`badge badge-${tenant?.status==='active'?'green':'amber'}`} style={{textTransform:'capitalize'}}>{tenant?.status === 'pending_activation' ? 'pending activation' : tenant?.status}</span>],
              ['Seats', `${tenant?.seat_limit||5} max`],
              ['Activation', tenant?.status === 'pending_activation' ? 'Billing setup required' : 'Complete'],
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
