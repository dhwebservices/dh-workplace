import { useState, useEffect } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { sbGetMany, sbInsert, sbUpdate } from '../../utils/supabase'
import { canManageCRM } from '../../utils/permissions'

const EMPTY = { business_name:'', contact_name:'', email:'', phone:'', website:'', status:'not_contacted', notes:'' }
const STATUS_COLOURS = { not_contacted:'badge-grey', contacted:'badge-blue', replied:'badge-amber', converted:'badge-green', not_interested:'badge-red' }

export default function Outreach() {
  const { tenant, tenantUser, employeePermissions } = useAuth()
  const [leads, setLeads] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ ...EMPTY })
  const [saving, setSaving] = useState(false)
  const sf = (k,v) => setForm(p=>({...p,[k]:v}))
  const canManage = canManageCRM({ role: tenantUser?.role, permissionRecord: employeePermissions })

  useEffect(() => { load() }, [tenant?.id])

  const load = async () => {
    if (!tenant?.id) return
    setLoading(true)
    const data = await sbGetMany('outreach', `tenant_id=eq.${tenant.id}&order=created_at.desc`)
    setLeads(data||[])
    setLoading(false)
  }

  const open = (lead=null) => { setEditing(lead); setForm(lead?{...EMPTY,...lead}:{...EMPTY}); setModal(true) }

  const save = async () => {
    if (!canManage) return
    if (!form.business_name.trim()) { alert('Business name required'); return }
    setSaving(true)
    try {
      if (editing) {
        await sbUpdate('outreach', `id=eq.${editing.id}`, { ...form, last_contacted:form.status!=='not_contacted'?new Date().toISOString():null })
      } else {
        await sbInsert('outreach', { ...form, tenant_id:tenant.id, created_by:tenantUser.id, created_at:new Date().toISOString(), last_contacted:form.status!=='not_contacted'?new Date().toISOString():null })
      }
      setModal(false); load()
    } catch(e) { alert(e.message) }
    setSaving(false)
  }

  const filtered = leads.filter(l => {
    const q = search.toLowerCase()
    const matchSearch = !q||l.business_name?.toLowerCase().includes(q)||l.contact_name?.toLowerCase().includes(q)
    const matchFilter = filter==='all'||l.status===filter
    return matchSearch&&matchFilter
  })

  return (
    <div className="fade-in page-stack">
      <div className="page-hd">
        <div>
          <h1 className="page-title">Outreach</h1>
          <p className="page-sub">{leads.filter(l=>l.status==='contacted').length} contacted · {leads.filter(l=>l.status==='converted').length} converted</p>
        </div>
        {canManage && <button className="btn btn-primary" onClick={()=>open()}>+ Add Lead</button>}
      </div>
      <div className="table-toolbar">
        <div className="search-shell" style={{minWidth:200}}>
          <input className="inp" placeholder="Search leads..." value={search} onChange={e=>setSearch(e.target.value)}/>
          <span className="search-icon" />
        </div>
        <div className="filter-pills">
          {['all','not_contacted','contacted','replied','converted','not_interested'].map(s=>(
            <button key={s} onClick={()=>setFilter(s)} className={`btn btn-sm ${filter===s?'btn-primary':'btn-outline'}`} style={{textTransform:'capitalize',fontSize:11}}>{s.replace(/_/g,' ')}</button>
          ))}
        </div>
        <div className="compact-note">Track early-stage leads before they become full CRM clients.</div>
      </div>
      <div className="card card-pad table-card">
        {loading ? <div style={{padding:24}}>{[1,2,3].map(i=><div key={i} className="skel" style={{height:52,marginBottom:8,borderRadius:8}}/>)}</div>
        : filtered.length===0 ? <div className="empty"><p>No leads found</p></div>
        : <table className="tbl">
            <thead><tr><th>Business</th><th>Contact</th><th>Email</th><th>Status</th><th>Last Contacted</th><th></th></tr></thead>
            <tbody>
              {filtered.map(l=>(
                <tr key={l.id}>
                  <td className="t-main">{l.business_name}</td>
                  <td style={{color:'var(--sub)',fontSize:13}}>{l.contact_name||'—'}</td>
                  <td style={{fontFamily:'var(--font-mono)',fontSize:11,color:'var(--faint)'}}>{l.email||'—'}</td>
                  <td><span className={`badge ${STATUS_COLOURS[l.status]||'badge-grey'}`} style={{textTransform:'capitalize',fontSize:10}}>{l.status?.replace(/_/g,' ')}</span></td>
                  <td style={{fontSize:11,color:'var(--faint)',fontFamily:'var(--font-mono)'}}>{l.last_contacted?new Date(l.last_contacted).toLocaleDateString('en-GB'):'—'}</td>
                  <td>{canManage && <button className="btn btn-outline btn-sm" onClick={()=>open(l)}>Edit</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>}
      </div>
      {modal&&(
        <div className="modal-overlay" onClick={()=>setModal(false)}>
          <div className="modal-box" onClick={e=>e.stopPropagation()}>
            <div className="modal-hd">
              <span className="modal-title">{editing?'Edit lead':'Add lead'}</span>
              <button onClick={()=>setModal(false)} style={{background:'none',border:'none',cursor:'pointer',fontSize:20,color:'var(--faint)'}}>x</button>
            </div>
            <div className="modal-body">
              <div className="fg">
                <div><label className="lbl">Business Name *</label><input className="inp" value={form.business_name} onChange={e=>sf('business_name',e.target.value)}/></div>
                <div><label className="lbl">Contact Name</label><input className="inp" value={form.contact_name} onChange={e=>sf('contact_name',e.target.value)}/></div>
                <div><label className="lbl">Email</label><input className="inp" type="email" value={form.email} onChange={e=>sf('email',e.target.value)}/></div>
                <div><label className="lbl">Phone</label><input className="inp" value={form.phone} onChange={e=>sf('phone',e.target.value)}/></div>
                <div className="fc"><label className="lbl">Website</label><input className="inp" value={form.website} onChange={e=>sf('website',e.target.value)} placeholder="https://"/></div>
                <div><label className="lbl">Status</label>
                  <select className="inp" value={form.status} onChange={e=>sf('status',e.target.value)}>
                    {['not_contacted','contacted','replied','converted','not_interested'].map(s=><option key={s} value={s} style={{textTransform:'capitalize'}}>{s.replace(/_/g,' ')}</option>)}
                  </select>
                </div>
                <div className="fc"><label className="lbl">Notes</label><textarea className="inp" rows={3} value={form.notes} onChange={e=>sf('notes',e.target.value)} style={{resize:'vertical'}}/></div>
              </div>
            </div>
            <div className="modal-ft">
              <button className="btn btn-outline" onClick={()=>setModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={save} disabled={saving}>{saving?'Saving...':'Save'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
