import { useState, useEffect } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { sbGetMany, sbInsert, sbUpdate } from '../../utils/supabase'

const EMPTY = { title:'', description:'', priority:'medium', assigned_to:'', client_id:'', due_date:'' }
const PRIORITIES = { low:'badge-grey', medium:'badge-blue', high:'badge-amber', urgent:'badge-red' }
const STATUSES = ['todo','in_progress','done','cancelled']

export default function Tasks() {
  const { tenant, tenantUser } = useAuth()
  const [tasks, setTasks] = useState([])
  const [staff, setStaff] = useState([])
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('mine')
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({ ...EMPTY })
  const [saving, setSaving] = useState(false)
  const sf = (k,v) => setForm(p=>({...p,[k]:v}))

  useEffect(() => { load() }, [tenant?.id])

  const load = async () => {
    if (!tenant?.id) return
    setLoading(true)
    const [t, s, c] = await Promise.all([
      sbGetMany('tasks', `tenant_id=eq.${tenant.id}&order=created_at.desc`),
      sbGetMany('tenant_users', `tenant_id=eq.${tenant.id}&order=full_name.asc`),
      sbGetMany('clients', `tenant_id=eq.${tenant.id}&order=name.asc`),
    ])
    setTasks(t||[]); setStaff(s||[]); setClients(c||[])
    setLoading(false)
  }

  const create = async () => {
    if (!form.title.trim()) { alert('Title required'); return }
    setSaving(true)
    try {
      await sbInsert('tasks', {
        tenant_id:tenant.id, created_by:tenantUser.id,
        title:form.title, description:form.description||null,
        priority:form.priority, status:'todo',
        assigned_to:form.assigned_to||null,
        client_id:form.client_id||null,
        due_date:form.due_date||null,
        created_at:new Date().toISOString()
      })
      if (form.assigned_to && form.assigned_to !== tenantUser.id) {
        await sbInsert('notifications', {
          tenant_id: tenant.id,
          tenant_user_id: form.assigned_to,
          title: 'New task assigned',
          message: `${tenantUser.full_name || tenantUser.email} assigned you "${form.title}"`,
          type: 'info',
          link: '/tasks',
          created_at: new Date().toISOString(),
        })
      }
      setModal(false); setForm({...EMPTY}); load()
    } catch(e) { alert(e.message) }
    setSaving(false)
  }

  const updateStatus = async (id, status) => {
    await sbUpdate('tasks', `id=eq.${id}`, { status, updated_at:new Date().toISOString() })
    setTasks(p=>p.map(t=>t.id===id?{...t,status}:t))
  }

  const getName = id => staff.find(s=>s.id===id)?.full_name||'Unassigned'
  const getClient = id => clients.find(c=>c.id===id)?.name||null

  const filtered = tasks.filter(t => {
    if (tab==='mine') return t.assigned_to===tenantUser?.id||t.created_by===tenantUser?.id
    if (tab==='open') return t.status==='todo'||t.status==='in_progress'
    if (tab==='done') return t.status==='done'
    return true
  })

  return (
    <div className="fade-in">
      <div className="page-hd">
        <div>
          <h1 className="page-title">Tasks</h1>
          <p className="page-sub">{tasks.filter(t=>t.status!=='done'&&t.status!=='cancelled').length} open tasks</p>
        </div>
        <button className="btn btn-primary" onClick={()=>setModal(true)}>+ Create Task</button>
      </div>
      <div className="tabs">
        {[['mine','My Tasks'],['all','All Tasks'],['open','Open'],['done','Done']].map(([k,l])=>(
          <button key={k} className={`tab${tab===k?' on':''}`} onClick={()=>setTab(k)}>{l}</button>
        ))}
      </div>
      <div style={{display:'flex',flexDirection:'column',gap:10}}>
        {loading ? [1,2,3].map(i=><div key={i} className="skel" style={{height:76,borderRadius:12}}/>)
        : filtered.length===0 ? <div className="card"><div className="empty"><p>No tasks found</p></div></div>
        : filtered.map(t=>(
          <div key={t.id} className="card" style={{padding:'16px 20px',display:'flex',gap:16,alignItems:'flex-start',opacity:t.status==='done'||t.status==='cancelled'?0.6:1}}>
            <button onClick={()=>updateStatus(t.id,t.status==='done'?'todo':'done')}
              style={{width:22,height:22,borderRadius:'50%',border:`2px solid ${t.status==='done'?'var(--green)':'var(--border)'}`,background:t.status==='done'?'var(--green)':'transparent',cursor:'pointer',flexShrink:0,marginTop:2,display:'flex',alignItems:'center',justifyContent:'center',transition:'all 0.15s'}}>
              {t.status==='done'&&<span style={{color:'#fff',fontSize:11}}>✓</span>}
            </button>
            <div style={{flex:1}}>
              <div style={{fontWeight:500,fontSize:14,marginBottom:4,textDecoration:t.status==='done'?'line-through':'none'}}>{t.title}</div>
              {t.description&&<div style={{fontSize:12,color:'var(--faint)',marginBottom:6}}>{t.description}</div>}
              <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
                <span className={`badge ${PRIORITIES[t.priority]||'badge-grey'}`} style={{textTransform:'capitalize',fontSize:10}}>{t.priority}</span>
                <span style={{fontSize:11,color:'var(--faint)'}}>→ {getName(t.assigned_to)}</span>
                {getClient(t.client_id)&&<span style={{fontSize:11,color:'var(--faint)'}}>🏢 {getClient(t.client_id)}</span>}
                {t.due_date&&<span style={{fontSize:11,color:new Date(t.due_date)<new Date()?'var(--red)':'var(--faint)'}}>📅 {new Date(t.due_date).toLocaleDateString('en-GB')}</span>}
              </div>
            </div>
            <select value={t.status} onChange={e=>updateStatus(t.id,e.target.value)}
              style={{fontSize:12,padding:'4px 8px',borderRadius:6,border:'1px solid var(--border)',background:'var(--bg)',color:'var(--text)',cursor:'pointer',textTransform:'capitalize'}}>
              {STATUSES.map(s=><option key={s} value={s} style={{textTransform:'capitalize'}}>{s.replace('_',' ')}</option>)}
            </select>
          </div>
        ))}
      </div>
      {modal&&(
        <div className="modal-overlay" onClick={()=>setModal(false)}>
          <div className="modal-box" onClick={e=>e.stopPropagation()}>
            <div className="modal-hd">
              <span style={{fontWeight:600}}>Create Task</span>
              <button onClick={()=>setModal(false)} style={{background:'none',border:'none',cursor:'pointer',fontSize:20,color:'var(--faint)'}}>×</button>
            </div>
            <div className="modal-body">
              <div style={{display:'flex',flexDirection:'column',gap:14}}>
                <div><label className="lbl">Task Title *</label><input className="inp" placeholder="What needs to be done?" value={form.title} onChange={e=>sf('title',e.target.value)}/></div>
                <div><label className="lbl">Description</label><textarea className="inp" rows={2} value={form.description} onChange={e=>sf('description',e.target.value)} style={{resize:'vertical'}}/></div>
                <div className="fg">
                  <div><label className="lbl">Priority</label>
                    <select className="inp" value={form.priority} onChange={e=>sf('priority',e.target.value)}>
                      {['low','medium','high','urgent'].map(p=><option key={p} value={p} style={{textTransform:'capitalize'}}>{p.charAt(0).toUpperCase()+p.slice(1)}</option>)}
                    </select>
                  </div>
                  <div><label className="lbl">Due Date</label><input className="inp" type="date" value={form.due_date} onChange={e=>sf('due_date',e.target.value)}/></div>
                </div>
                <div className="fg">
                  <div><label className="lbl">Assign To</label>
                    <select className="inp" value={form.assigned_to} onChange={e=>sf('assigned_to',e.target.value)}>
                      <option value="">— Unassigned —</option>
                      {staff.map(s=><option key={s.id} value={s.id}>{s.full_name||s.email}</option>)}
                    </select>
                  </div>
                  <div><label className="lbl">Client</label>
                    <select className="inp" value={form.client_id} onChange={e=>sf('client_id',e.target.value)}>
                      <option value="">— No client —</option>
                      {clients.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            </div>
            <div className="modal-ft">
              <button className="btn btn-outline" onClick={()=>setModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={create} disabled={saving}>{saving?'Creating...':'Create Task'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
