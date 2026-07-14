import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { sbUpdate } from '../../utils/supabase'
import { canManageWorkspaceSettings } from '../../utils/permissions'
import { can } from '../../utils/entitlements'
import { sendWebhookEvent } from '../../utils/webhooks'
import { deriveSubdomainSuggestion, getTenantSubdomainUrl, isReservedSubdomain, isSubdomainAvailable, isValidCustomDomain, isValidSubdomain, normalizeDomain, normalizeSubdomain } from '../../utils/tenantDomains'

export default function Settings() {
  const { tenant, tenantUser, employeePermissions, refreshTenant } = useAuth()
  const [form, setForm] = useState({
    name: tenant?.name || '',
    primary_colour: tenant?.primary_colour || '#0071E3',
    logo_url: tenant?.logo_url || '',
    custom_subdomain: tenant?.custom_subdomain || '',
    custom_domain: tenant?.custom_domain || '',
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [checkingSubdomain, setCheckingSubdomain] = useState(false)
  const [subdomainFeedback, setSubdomainFeedback] = useState('')
  const canManage = canManageWorkspaceSettings({ role: tenantUser?.role, permissionRecord: employeePermissions })
  const canWhiteLabel = can(tenant, 'custom_branding')

  useEffect(() => {
    setForm({
      name: tenant?.name || '',
      primary_colour: tenant?.primary_colour || '#0071E3',
      logo_url: tenant?.logo_url || '',
      custom_subdomain: tenant?.custom_subdomain || '',
      custom_domain: tenant?.custom_domain || '',
    })
  }, [tenant?.id, tenant?.name, tenant?.primary_colour, tenant?.logo_url, tenant?.custom_subdomain, tenant?.custom_domain])

  const normalizedSubdomain = useMemo(() => normalizeSubdomain(form.custom_subdomain), [form.custom_subdomain])
  const normalizedCustomDomain = useMemo(() => normalizeDomain(form.custom_domain), [form.custom_domain])
  const suggestedSubdomain = useMemo(() => deriveSubdomainSuggestion(tenant), [tenant])
  const subdomainPreview = useMemo(() => getTenantSubdomainUrl(normalizedSubdomain || suggestedSubdomain), [normalizedSubdomain, suggestedSubdomain])

  const validateSubdomain = async (value = normalizedSubdomain) => {
    const normalized = normalizeSubdomain(value)
    if (!normalized) {
      setSubdomainFeedback('Set a tenant URL or keep using the main app domain.')
      return true
    }
    if (!isValidSubdomain(normalized)) {
      setSubdomainFeedback(isReservedSubdomain(normalized)
        ? 'That URL is reserved. Choose a different subdomain.'
        : 'Use at least 3 characters with letters, numbers, or hyphens only.')
      return false
    }
    setCheckingSubdomain(true)
    const available = await isSubdomainAvailable(normalized, tenant?.id)
    setCheckingSubdomain(false)
    setSubdomainFeedback(available ? 'This tenant URL is available.' : 'That tenant URL is already in use.')
    return available
  }

  const save = async () => {
    if (!canManage) return
    const hasValidSubdomain = await validateSubdomain()
    if (!hasValidSubdomain) return
    if (normalizedCustomDomain && !isValidCustomDomain(normalizedCustomDomain)) {
      alert('Enter a valid custom domain, for example portal.yourbusiness.co.uk')
      return
    }

    // Validate logo URL (security)
    if (form.logo_url && form.logo_url.trim()) {
      try {
        const url = new URL(form.logo_url)
        if (url.protocol !== 'https:') {
          alert('Logo URL must use HTTPS for security')
          return
        }
        // Check for common file extensions
        const ext = url.pathname.split('.').pop().toLowerCase()
        if (!['png', 'jpg', 'jpeg', 'svg', 'webp'].includes(ext)) {
          alert('Logo URL must point to a valid image file (PNG, JPG, SVG, or WebP)')
          return
        }
      } catch (e) {
        alert('Please enter a valid HTTPS URL for the logo')
        return
      }
    }

    setSaving(true)
    try {
      const domainStatus = normalizedCustomDomain
        ? 'custom_pending'
        : normalizedSubdomain
          ? 'subdomain_active'
          : 'default'
      await sbUpdate('tenants', `id=eq.${tenant.id}`, {
        name: form.name,
        primary_colour: form.primary_colour,
        logo_url: form.logo_url || null,
        custom_subdomain: normalizedSubdomain || null,
        custom_domain: normalizedCustomDomain || null,
        domain_status: domainStatus,
        updated_at: new Date().toISOString(),
      })
      sendWebhookEvent({
        tenantId: tenant.id,
        event: 'tenant.updated',
        payload: {
          name: form.name,
          primary_colour: form.primary_colour,
          logo_url: form.logo_url || null,
          custom_subdomain: normalizedSubdomain || null,
          custom_domain: normalizedCustomDomain || null,
          domain_status: domainStatus,
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
      <div className="compact-note">Manage your workspace identity, colour, tenant URL, and commercial settings from one page.</div>
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
              <h3 className="panel-title">Workspace domain</h3>
              <div className="panel-sub">Give this workspace its own DH Workplace URL now, and optionally add a customer-owned domain later.</div>
            </div>
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:14}}>
            <div>
              <label className="lbl">Tenant URL on DH Workplace</label>
              <div style={{display:'grid',gridTemplateColumns:'minmax(0,1fr) auto',gap:10,alignItems:'center'}}>
                <input
                  className="inp"
                  value={form.custom_subdomain}
                  disabled={!canManage}
                  placeholder={suggestedSubdomain || 'yourbusiness'}
                  onChange={e=>setForm(p=>({...p,custom_subdomain:e.target.value}))}
                  onBlur={() => { validateSubdomain(form.custom_subdomain) }}
                />
                <span style={{fontSize:12,color:'var(--faint)',whiteSpace:'nowrap'}}>.dhworkplace.co.uk</span>
              </div>
              <div style={{fontSize:12,color:'var(--faint)',marginTop:6}}>
                Recommended for most customers. Example: <span style={{fontFamily:'var(--font-mono)'}}>{subdomainPreview || 'https://yourbusiness.dhworkplace.co.uk'}</span>
              </div>
              <div style={{fontSize:12,color:checkingSubdomain ? 'var(--blue)' : subdomainFeedback.includes('available') ? 'var(--green)' : 'var(--faint)',marginTop:6}}>
                {checkingSubdomain ? 'Checking availability…' : (subdomainFeedback || 'Use letters, numbers, and hyphens only.')}
              </div>
            </div>
            <div>
              <label className="lbl">Customer-owned domain</label>
              <input
                className="inp"
                value={form.custom_domain}
                disabled={!canManage}
                placeholder="portal.yourbusiness.co.uk"
                onChange={e=>setForm(p=>({...p,custom_domain:e.target.value}))}
              />
              <div style={{fontSize:12,color:'var(--faint)',marginTop:6}}>
                Optional. Save the domain now and we can complete DNS and Cloudflare hostname activation in the next phase.
              </div>
            </div>
            <div style={{border:'1px solid var(--border)',borderRadius:12,padding:14,background:'var(--surface-strong)'}}>
              <div style={{fontSize:12,color:'var(--faint)',marginBottom:10,textTransform:'uppercase',letterSpacing:'0.08em'}}>Live routing state</div>
              <div style={{display:'flex',flexDirection:'column',gap:10}}>
                <div className="detail-row">
                  <span className="detail-row-label">Current app URL</span>
                  <span className="detail-row-value">{tenant?.custom_domain || tenant?.custom_subdomain ? (tenant?.custom_domain || getTenantSubdomainUrl(tenant?.custom_subdomain)) : 'https://app.dhworkplace.co.uk'}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-row-label">Domain status</span>
                  <span className="badge badge-blue" style={{textTransform:'capitalize'}}>{(tenant?.domain_status || 'default').replace('_',' ')}</span>
                </div>
                <div style={{fontSize:12,color:'var(--faint)'}}>
                  Subdomains on <span style={{fontFamily:'var(--font-mono)'}}>dhworkplace.co.uk</span> can be activated immediately. Customer-owned domains are stored now and can be verified in the Cloudflare custom-hostname phase.
                </div>
              </div>
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
      {canManage&&<button className="btn btn-primary" style={{marginTop:20,alignSelf:'flex-start'}} onClick={save} disabled={saving || checkingSubdomain}>{saving?'Saving...':'Save Changes'}</button>}
    </div>
  )
}
