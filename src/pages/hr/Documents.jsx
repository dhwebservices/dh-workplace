import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { sbDelete, sbGetMany, sbInsert } from '../../utils/supabase'
import { supabase } from '../../utils/supabase'

const CATEGORIES = ['general','policy','contract','payslip','onboarding']

export default function Documents() {
  const { tenant, tenantUser } = useAuth()
  const [docs, setDocs] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [uploading, setUploading] = useState(false)
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({ name:'', category:'general', visible_to:'all' })
  const [file, setFile] = useState(null)
  const fileRef = useRef()
  const isAdmin = ['owner','admin','superadmin'].includes(tenantUser?.role)

  useEffect(() => { load() }, [tenant?.id])

  const canViewDoc = (doc) => {
    if (doc.visible_to === 'all') return true
    if (doc.visible_to === 'managers') return ['owner', 'admin', 'manager', 'superadmin'].includes(tenantUser?.role)
    if (doc.visible_to === 'owner') return ['owner', 'superadmin'].includes(tenantUser?.role)
    return false
  }

  const load = async () => {
    if (!tenant?.id) return
    setLoading(true)
    const data = await sbGetMany('documents', `tenant_id=eq.${tenant.id}&order=created_at.desc`)
    setDocs(data||[])
    setLoading(false)
  }

  const upload = async () => {
    if (!file||!form.name.trim()) { alert('File and name required'); return }
    setUploading(true)
    try {
      const path = `${tenant.id}/${Date.now()}-${file.name}`
      const { error: upErr } = await supabase.storage.from('documents').upload(path, file)
      if (upErr) throw upErr
      const { data: urlData } = supabase.storage.from('documents').getPublicUrl(path)
      await sbInsert('documents', {
        tenant_id:tenant.id, name:form.name,
        category:form.category, visible_to:form.visible_to,
        file_url:urlData.publicUrl, file_path:path,
        uploaded_by:tenantUser.id, created_at:new Date().toISOString()
      })
      setModal(false); setForm({name:'',category:'general',visible_to:'all'}); setFile(null); load()
    } catch(e) { alert('Upload failed: '+e.message) }
    setUploading(false)
  }

  const deleteDoc = async (doc) => {
    if (!confirm(`Delete "${doc.name}"?`)) return
    if (doc.file_path) await supabase.storage.from('documents').remove([doc.file_path]).catch(()=>{})
    await sbDelete('documents', `id=eq.${doc.id}`)
    setDocs(p => p.filter(d => d.id!==doc.id))
  }

  const filtered = docs.filter(d => canViewDoc(d) && (filter==='all' || d.category===filter))
  const CAT_BADGE = { policy:'badge-blue', contract:'badge-amber', payslip:'badge-green', onboarding:'badge-gold', general:'badge-grey' }
  const fileIcon = (name='') => {
    const ext = name.split('.').pop().toLowerCase()
    if (ext==='pdf') return '📄'
    if (['doc','docx'].includes(ext)) return '📝'
    if (['jpg','png','jpeg'].includes(ext)) return '🖼'
    return '📁'
  }

  return (
    <div className="fade-in">
      <div className="page-hd">
        <div>
          <h1 className="page-title">Documents</h1>
          <p className="page-sub">{docs.length} document{docs.length!==1?'s':''}</p>
        </div>
        {isAdmin&&<button className="btn btn-primary" onClick={()=>setModal(true)}>+ Upload Document</button>}
      </div>
      <div style={{display:'flex',gap:8,marginBottom:24,flexWrap:'wrap'}}>
        {['all',...CATEGORIES].map(c=>(
          <button key={c} onClick={()=>setFilter(c)} className={`btn btn-sm ${filter===c?'btn-primary':'btn-outline'}`} style={{textTransform:'capitalize'}}>{c}</button>
        ))}
      </div>
      {loading ? <div className="card card-pad">{[1,2,3].map(i=><div key={i} className="skel" style={{height:60,marginBottom:10,borderRadius:8}}/>)}</div>
      : filtered.length===0 ? <div className="card"><div className="empty"><p>No documents found</p></div></div>
      : <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))',gap:16}}>
          {filtered.map(d=>(
            <div key={d.id} className="card card-pad" style={{display:'flex',gap:14,alignItems:'flex-start'}}>
              <div style={{fontSize:28,flexShrink:0}}>{fileIcon(d.name)}</div>
              <div style={{flex:1,overflow:'hidden'}}>
                <div style={{fontWeight:600,fontSize:14,marginBottom:4,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{d.name}</div>
                <div style={{display:'flex',gap:6,marginBottom:8,flexWrap:'wrap'}}>
                  <span className={`badge ${CAT_BADGE[d.category]||'badge-grey'}`} style={{textTransform:'capitalize',fontSize:10}}>{d.category}</span>
                  {d.visible_to!=='all'&&<span className="badge badge-amber" style={{fontSize:10}}>🔒 {d.visible_to}</span>}
                </div>
                <div style={{fontSize:11,color:'var(--faint)',marginBottom:10}}>{new Date(d.created_at).toLocaleDateString('en-GB')}</div>
                <div style={{display:'flex',gap:6}}>
                  <a href={d.file_url} target="_blank" rel="noreferrer" className="btn btn-outline btn-sm">View</a>
                  <a href={d.file_url} download={d.name} className="btn btn-outline btn-sm">↓</a>
                  {isAdmin&&<button className="btn btn-sm" style={{background:'var(--red-soft)',color:'var(--red)',border:'1px solid var(--red)'}} onClick={()=>deleteDoc(d)}>Del</button>}
                </div>
              </div>
            </div>
          ))}
        </div>}
      {modal&&(
        <div className="modal-overlay" onClick={()=>setModal(false)}>
          <div className="modal-box" onClick={e=>e.stopPropagation()}>
            <div className="modal-hd">
              <span style={{fontWeight:600}}>Upload Document</span>
              <button onClick={()=>setModal(false)} style={{background:'none',border:'none',cursor:'pointer',fontSize:20,color:'var(--faint)'}}>×</button>
            </div>
            <div className="modal-body">
              <div style={{display:'flex',flexDirection:'column',gap:14}}>
                <div><label className="lbl">Document Name</label><input className="inp" placeholder="Employee Handbook 2026" value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value}))}/></div>
                <div><label className="lbl">Category</label>
                  <select className="inp" value={form.category} onChange={e=>setForm(p=>({...p,category:e.target.value}))}>
                    {CATEGORIES.map(c=><option key={c} value={c} style={{textTransform:'capitalize'}}>{c.charAt(0).toUpperCase()+c.slice(1)}</option>)}
                  </select>
                </div>
                <div><label className="lbl">Visible To</label>
                  <select className="inp" value={form.visible_to} onChange={e=>setForm(p=>({...p,visible_to:e.target.value}))}>
                    <option value="all">All Staff</option>
                    <option value="managers">Managers Only</option>
                    <option value="owner">Owner Only</option>
                  </select>
                </div>
                <div>
                  <label className="lbl">File</label>
                  <input ref={fileRef} type="file" accept=".pdf,.doc,.docx,.png,.jpg,.xlsx,.csv" style={{display:'none'}} onChange={e=>setFile(e.target.files[0])}/>
                  <div style={{display:'flex',gap:8,alignItems:'center'}}>
                    <button className="btn btn-outline" onClick={()=>fileRef.current?.click()}>Choose File</button>
                    {file&&<span style={{fontSize:13,color:'var(--sub)'}}>{file.name}</span>}
                  </div>
                </div>
              </div>
            </div>
            <div className="modal-ft">
              <button className="btn btn-outline" onClick={()=>setModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={upload} disabled={uploading}>{uploading?'Uploading...':'Upload'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
