import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { sbGet, sbGetMany, sbInsert, sbUpdate } from '../../utils/supabase'

const WORKER_URL = import.meta.env.VITE_WORKER_URL

function parseNotes(notes) {
  if (!notes?.trim()) return []
  return notes
    .split('\n\n---\n\n')
    .filter(Boolean)
    .map((entry, index) => {
      const [header, ...body] = entry.split('\n')
      return { id: `${index}-${header}`, header, body: body.join('\n').trim() }
    })
}

export default function ClientProfile() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { tenant, tenantUser } = useAuth()
  const [client, setClient] = useState(null)
  const [invoices, setInvoices] = useState([])
  const [tasks, setTasks] = useState([])
  const [tab, setTab] = useState('overview')
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({})
  const [invModal, setInvModal] = useState(false)
  const [invForm, setInvForm] = useState({ invoice_number:'', description:'', amount:'', due_date:'' })
  const [saving, setSaving] = useState(false)
  const [noteDraft, setNoteDraft] = useState('')

  useEffect(() => { load() }, [id])

  const load = async () => {
    if (!id||!tenant?.id) return
    setLoading(true)
    const [c, inv, t] = await Promise.all([
      sbGet('clients', `id=eq.${id}&tenant_id=eq.${tenant.id}`),
      sbGetMany('invoices', `client_id=eq.${id}&order=created_at.desc`),
      sbGetMany('tasks', `client_id=eq.${id}&order=created_at.desc`),
    ])
    if (c) { setClient(c); setForm(c) }
    setInvoices(inv||[]); setTasks(t||[])
    setLoading(false)
  }

  const saveClient = async () => {
    setSaving(true)
    try {
      await sbUpdate('clients', `id=eq.${id}`, { ...form, updated_at:new Date().toISOString() })
      setClient(form); setEditing(false)
    } catch(e) { alert(e.message) }
    setSaving(false)
  }

  const createInvoice = async () => {
    if (!invForm.description||!invForm.amount) { alert('Description and amount required'); return }
    setSaving(true)
    try {
      await sbInsert('invoices', {
        tenant_id:tenant.id, client_id:id,
        invoice_number:invForm.invoice_number||null,
        description:invForm.description, amount:Number(invForm.amount),
        due_date:invForm.due_date||null, status:'unpaid',
        created_by:tenantUser.id, created_at:new Date().toISOString()
      })
      if (WORKER_URL && client.email) {
        fetch(WORKER_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'invoice_issued',
            data: {
              to_email: client.email,
              client_name: client.name,
              company: tenant?.name || 'DH Workplace',
              invoice_number: invForm.invoice_number,
              description: invForm.description,
              amount: Number(invForm.amount),
              due_date: invForm.due_date ? new Date(invForm.due_date).toLocaleDateString('en-GB') : 'On receipt',
            },
          }),
        }).catch(() => {})
      }
      setInvModal(false); setInvForm({invoice_number:'',description:'',amount:'',due_date:''})
      const inv = await sbGetMany('invoices', `client_id=eq.${id}&order=created_at.desc`)
      setInvoices(inv||[])
    } catch(e) { alert(e.message) }
    setSaving(false)
  }

  const markPaid = async (invId) => {
    await sbUpdate('invoices', `id=eq.${invId}`, { status:'paid', paid_at:new Date().toISOString() })
    setInvoices(p=>p.map(i=>i.id===invId?{...i,status:'paid'}:i))
  }

  const addNote = async () => {
    if (!noteDraft.trim()) return
    const author = tenantUser?.full_name || tenantUser?.email || 'Team member'
    const entry = `[${new Date().toLocaleString('en-GB')}] ${author}\n${noteDraft.trim()}`
    const nextNotes = client.notes?.trim() ? `${entry}\n\n---\n\n${client.notes}` : entry
    setSaving(true)
    try {
      await sbUpdate('clients', `id=eq.${id}`, { notes: nextNotes, updated_at: new Date().toISOString() })
      setClient(prev => ({ ...prev, notes: nextNotes }))
      setForm(prev => ({ ...prev, notes: nextNotes }))
      setNoteDraft('')
      setTab('notes')
    } catch (e) { alert(e.message) }
    setSaving(false)
  }

  if (loading) return <div className="spin-wrap"><div className="spin"/></div>
  if (!client) return <div className="card card-pad"><p style={{color:'var(--faint)'}}>Client not found.</p></div>

  const totalRevenue = invoices.filter(i=>i.status==='paid').reduce((sum,i)=>sum+Number(i.amount||0),0)
  const outstanding = invoices.filter(i=>i.status==='unpaid').reduce((sum,i)=>sum+Number(i.amount||0),0)
  const noteEntries = parseNotes(client.notes)

  return (
    <div className="fade-in page-stack">
      <div>
        <button onClick={()=>navigate('/clients')} className="btn btn-outline btn-sm">Back to clients</button>
      </div>
      <div className="card card-pad" style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:20}}>
        <div>
          <h1 className="page-title" style={{marginBottom:6}}>{client.name}</h1>
          <div style={{display:'flex',gap:10,flexWrap:'wrap',alignItems:'center'}}>
            {client.email&&<span style={{fontSize:13,color:'var(--faint)',fontFamily:'var(--font-mono)'}}>{client.email}</span>}
            {client.website&&<a href={client.website} target="_blank" rel="noreferrer" style={{fontSize:13,color:'var(--blue)'}}>{client.website}</a>}
            <span className={`badge badge-${client.status==='active'?'green':client.status==='lead'?'blue':'grey'}`} style={{textTransform:'capitalize'}}>{client.status}</span>
          </div>
        </div>
        <div style={{display:'flex',gap:8}}>
          <button className="btn btn-outline btn-sm" onClick={()=>setEditing(true)}>Edit</button>
          <button className="btn btn-primary btn-sm" onClick={()=>setInvModal(true)}>+ Invoice</button>
        </div>
      </div>
      <div className="stats-grid" style={{gridTemplateColumns:'repeat(3,1fr)',marginBottom:24}}>
        <div className="stat-card"><div className="stat-val" style={{color:'var(--green)',fontSize:24}}>£{totalRevenue.toLocaleString()}</div><div className="stat-lbl">Total Revenue</div></div>
        <div className="stat-card"><div className="stat-val" style={{color:'var(--amber)',fontSize:24}}>£{outstanding.toLocaleString()}</div><div className="stat-lbl">Outstanding</div></div>
        <div className="stat-card"><div className="stat-val" style={{color:'var(--blue)',fontSize:24}}>{tasks.filter(t=>t.status!=='done').length}</div><div className="stat-lbl">Open Tasks</div></div>
      </div>
      <div className="tabs">
        {[['overview','Overview'],['notes','Notes'],['invoices','Invoices'],['tasks','Tasks']].map(([k,l])=>(
          <button key={k} className={`tab${tab===k?' on':''}`} onClick={()=>setTab(k)}>{l}</button>
        ))}
      </div>
      <div className="compact-note">Manage relationship details, invoices, notes, and delivery tasks without leaving the client record.</div>
      {tab==='overview'&&(
        <div className="card card-pad">
          <div className="fg">
            <div><label className="lbl">Plan</label><p style={{margin:0,fontSize:14}}>{client.plan||'—'}</p></div>
            <div><label className="lbl">Value</label><p style={{margin:0,fontSize:14,fontFamily:'var(--font-mono)'}}>{client.value?`£${Number(client.value).toLocaleString()}`:'—'}</p></div>
            <div><label className="lbl">Phone</label><p style={{margin:0,fontSize:14}}>{client.phone||'—'}</p></div>
            <div><label className="lbl">Status</label><span className={`badge badge-${client.status==='active'?'green':client.status==='lead'?'blue':'grey'}`} style={{textTransform:'capitalize'}}>{client.status}</span></div>
            {client.notes&&<div className="fc"><label className="lbl">Notes</label><p style={{margin:0,fontSize:14,color:'var(--sub)'}}>{client.notes}</p></div>}
          </div>
        </div>
      )}
      {tab==='invoices'&&(
        <div className="card card-pad table-card">
          {invoices.length===0 ? <div className="empty"><p>No invoices yet</p></div>
          : <table className="tbl">
              <thead><tr><th>Invoice #</th><th>Description</th><th>Amount</th><th>Due</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {invoices.map(inv=>(
                  <tr key={inv.id}>
                    <td style={{fontFamily:'var(--font-mono)',fontSize:12}}>{inv.invoice_number||'—'}</td>
                    <td className="t-main">{inv.description}</td>
                    <td style={{fontFamily:'var(--font-mono)',fontWeight:600}}>£{Number(inv.amount||0).toFixed(2)}</td>
                    <td style={{fontFamily:'var(--font-mono)',fontSize:12}}>{inv.due_date?new Date(inv.due_date).toLocaleDateString('en-GB'):'—'}</td>
                    <td><span className={`badge badge-${inv.status==='paid'?'green':'amber'}`} style={{textTransform:'capitalize'}}>{inv.status}</span></td>
                    <td>{inv.status==='unpaid'&&<button className="btn btn-outline btn-sm" onClick={()=>markPaid(inv.id)}>Mark Paid</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>}
        </div>
      )}
      {tab==='notes'&&(
        <div style={{display:'grid',gridTemplateColumns:'340px 1fr',gap:20}}>
          <div className="card card-pad">
            <div className="section-head">
              <div>
                <h3 className="panel-title">Add note</h3>
                <div className="panel-sub">Keep a running client history for calls, decisions, and next steps.</div>
              </div>
            </div>
            <textarea
              className="inp"
              rows={8}
              value={noteDraft}
              onChange={e=>setNoteDraft(e.target.value)}
              placeholder="Add a client update, meeting summary, or call note..."
              style={{resize:'vertical',marginBottom:12}}
            />
            <button className="btn btn-primary" onClick={addNote} disabled={saving || !noteDraft.trim()}>
              {saving ? 'Saving...' : 'Save note'}
            </button>
          </div>
          <div className="card card-pad">
            <div className="section-head">
              <div>
                <h3 className="panel-title">Note history</h3>
                <div className="panel-sub">Every saved client update appears here in reverse chronological order.</div>
              </div>
            </div>
            {noteEntries.length===0 ? (
              <div className="empty" style={{padding:'32px 0'}}><p>No notes recorded yet</p></div>
            ) : (
              <div style={{display:'flex',flexDirection:'column',gap:14}}>
                {noteEntries.map(note=>(
                  <div key={note.id} style={{paddingBottom:14,borderBottom:'1px solid var(--border2)'}}>
                    <div style={{fontSize:12,fontWeight:700,color:'var(--faint)',marginBottom:8}}>{note.header}</div>
                    <div style={{fontSize:14,color:'var(--sub)',whiteSpace:'pre-wrap'}}>{note.body || '—'}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      {tab==='tasks'&&(
        <div className="card card-pad table-card">
          {tasks.length===0 ? <div className="empty"><p>No tasks for this client</p></div>
          : <table className="tbl">
              <thead><tr><th>Task</th><th>Priority</th><th>Status</th><th>Due</th></tr></thead>
              <tbody>
                {tasks.map(t=>(
                  <tr key={t.id}>
                    <td className="t-main">{t.title}</td>
                    <td><span className="badge badge-blue" style={{textTransform:'capitalize',fontSize:10}}>{t.priority}</span></td>
                    <td><span className="badge badge-grey" style={{textTransform:'capitalize',fontSize:10}}>{t.status?.replace('_',' ')}</span></td>
                    <td style={{fontFamily:'var(--font-mono)',fontSize:11}}>{t.due_date?new Date(t.due_date).toLocaleDateString('en-GB'):'—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>}
        </div>
      )}
      {editing&&(
        <div className="modal-overlay" onClick={()=>setEditing(false)}>
          <div className="modal-box" onClick={e=>e.stopPropagation()}>
            <div className="modal-hd"><span className="modal-title">Edit client</span><button onClick={()=>setEditing(false)} style={{background:'none',border:'none',cursor:'pointer',fontSize:20,color:'var(--faint)'}}>x</button></div>
            <div className="modal-body">
              <div className="fg">
                <div><label className="lbl">Name</label><input className="inp" value={form.name||''} onChange={e=>setForm(p=>({...p,name:e.target.value}))}/></div>
                <div><label className="lbl">Email</label><input className="inp" type="email" value={form.email||''} onChange={e=>setForm(p=>({...p,email:e.target.value}))}/></div>
                <div><label className="lbl">Phone</label><input className="inp" value={form.phone||''} onChange={e=>setForm(p=>({...p,phone:e.target.value}))}/></div>
                <div><label className="lbl">Value (£)</label><input className="inp" type="number" value={form.value||''} onChange={e=>setForm(p=>({...p,value:e.target.value}))}/></div>
                <div><label className="lbl">Status</label>
                  <select className="inp" value={form.status||'lead'} onChange={e=>setForm(p=>({...p,status:e.target.value}))}>
                    {['lead','active','inactive','lost'].map(s=><option key={s} value={s} style={{textTransform:'capitalize'}}>{s}</option>)}
                  </select>
                </div>
                <div className="fc"><label className="lbl">Notes</label><textarea className="inp" rows={3} value={form.notes||''} onChange={e=>setForm(p=>({...p,notes:e.target.value}))} style={{resize:'vertical'}}/></div>
              </div>
            </div>
            <div className="modal-ft">
              <button className="btn btn-outline" onClick={()=>setEditing(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveClient} disabled={saving}>{saving?'Saving...':'Save'}</button>
            </div>
          </div>
        </div>
      )}
      {invModal&&(
        <div className="modal-overlay" onClick={()=>setInvModal(false)}>
          <div className="modal-box" onClick={e=>e.stopPropagation()}>
            <div className="modal-hd"><span className="modal-title">Create invoice</span><button onClick={()=>setInvModal(false)} style={{background:'none',border:'none',cursor:'pointer',fontSize:20,color:'var(--faint)'}}>x</button></div>
            <div className="modal-body">
              <div style={{display:'flex',flexDirection:'column',gap:14}}>
                <div className="fg">
                  <div><label className="lbl">Invoice #</label><input className="inp" placeholder="INV-001" value={invForm.invoice_number} onChange={e=>setInvForm(p=>({...p,invoice_number:e.target.value}))}/></div>
                  <div><label className="lbl">Amount (£)</label><input className="inp" type="number" value={invForm.amount} onChange={e=>setInvForm(p=>({...p,amount:e.target.value}))}/></div>
                </div>
                <div><label className="lbl">Description *</label><input className="inp" value={invForm.description} onChange={e=>setInvForm(p=>({...p,description:e.target.value}))}/></div>
                <div><label className="lbl">Due Date</label><input className="inp" type="date" value={invForm.due_date} onChange={e=>setInvForm(p=>({...p,due_date:e.target.value}))}/></div>
              </div>
            </div>
            <div className="modal-ft">
              <button className="btn btn-outline" onClick={()=>setInvModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={createInvoice} disabled={saving}>{saving?'Creating...':'Create Invoice'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
