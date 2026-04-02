import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { sbGetMany, sbInsert, sbUpdate } from '../../utils/supabase'
import { canManageCRM } from '../../utils/permissions'
import { sendWebhookEvent } from '../../utils/webhooks'

const EMPTY = { name:'', email:'', phone:'', website:'', status:'lead', plan:'', value:'', notes:'' }
const STATUS_COLOURS = { lead:'blue', active:'green', inactive:'grey', lost:'red' }

export default function Clients() {
  const { tenant, tenantUser, employeePermissions } = useAuth()
  const navigate = useNavigate()
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ ...EMPTY })
  const [saving, setSaving] = useState(false)
  const sf = (k,v) => setForm(p => ({...p,[k]:v}))
  const canManage = canManageCRM({ role: tenantUser?.role, permissionRecord: employeePermissions })

  useEffect(() => { load() }, [tenant?.id])

  const load = async () => {
    if (!tenant?.id) return
    setLoading(true)
    const data = await sbGetMany('clients', `tenant_id=eq.${tenant.id}&order=created_at.desc`)
    setClients(data)
    setLoading(false)
  }

  const open = (client = null) => {
    setEditing(client)
    setForm(client ? { ...EMPTY, ...client } : { ...EMPTY })
    setModal(true)
  }

  const save = async () => {
    if (!canManage) return
    if (!form.name.trim()) { alert('Name is required'); return }
    setSaving(true)
    try {
      const payload = { ...form, value: form.value ? Number(form.value) : null }
      if (editing) {
        await sbUpdate('clients', `id=eq.${editing.id}`, { ...payload, updated_at: new Date().toISOString() })
        sendWebhookEvent({ tenantId: tenant.id, event: 'client.updated', payload: { client_id: editing.id, name: payload.name, status: payload.status, value: payload.value } })
      } else {
        await sbInsert('clients', { ...payload, tenant_id: tenant.id, created_at: new Date().toISOString() })
        sendWebhookEvent({ tenantId: tenant.id, event: 'client.created', payload: { name: payload.name, status: payload.status, value: payload.value } })
      }
      setModal(false); load()
    } catch(e) { alert('Save failed: ' + e.message) }
    setSaving(false)
  }

  const filtered = clients.filter(c => {
    const q = search.toLowerCase()
    const matchesSearch = !q || c.name?.toLowerCase().includes(q) || c.email?.toLowerCase().includes(q)
    const matchesFilter = filter === 'all' || c.status === filter
    return matchesSearch && matchesFilter
  })

  return (
    <div className="fade-in page-stack">
      <div className="page-hd">
        <div>
          <h1 className="page-title">Clients</h1>
          <p className="page-sub">{clients.filter(c=>c.status==='active').length} active · {clients.length} total</p>
        </div>
        {canManage && <button className="btn btn-primary" onClick={() => open()}>+ Add Client</button>}
      </div>

      <div className="table-toolbar">
        <div className="search-shell" style={{ minWidth: 260 }}>
          <input className="inp" placeholder="Search clients..." value={search} onChange={e => setSearch(e.target.value)} />
          <span className="search-icon" />
        </div>
        <div className="filter-pills">
          {['all','lead','active','inactive'].map(s => (
            <button key={s} onClick={() => setFilter(s)} className={`btn btn-sm ${filter===s?'btn-primary':'btn-outline'}`} style={{ textTransform:'capitalize' }}>{s}</button>
          ))}
        </div>
        <div className="compact-note">Open a client to manage tasks, notes, and invoices.</div>
      </div>

      <div className="card card-pad table-card">
        {loading ? (
          <div style={{ padding:24 }}>{[1,2,3].map(i=><div key={i} className="skel" style={{ height:48, marginBottom:8, borderRadius:8 }}/>)}</div>
        ) : filtered.length === 0 ? (
          <div className="empty"><p>No clients found</p></div>
        ) : (
          <table className="tbl">
            <thead><tr><th>Client</th><th>Contact</th><th>Plan</th><th>Value</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.id} style={{ cursor:'pointer' }} onClick={() => navigate(`/clients/${c.id}`)}>
                  <td className="t-main">{c.name}</td>
                  <td style={{ color:'var(--faint)', fontSize:12 }}>{c.email || '—'}</td>
                  <td>{c.plan || '—'}</td>
                  <td style={{ fontFamily:'var(--font-mono)', fontSize:12 }}>{c.value ? `£${Number(c.value).toLocaleString()}` : '—'}</td>
                  <td><span className={`badge badge-${STATUS_COLOURS[c.status] || 'grey'}`} style={{ textTransform:'capitalize' }}>{c.status}</span></td>
                  <td>{canManage && <button className="btn btn-outline btn-sm" onClick={e => { e.stopPropagation(); open(c) }}>Edit</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modal && (
        <div className="modal-overlay" onClick={() => setModal(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-hd">
              <span style={{ fontWeight:600 }}>{editing ? 'Edit Client' : 'Add Client'}</span>
              <button onClick={() => setModal(false)} style={{ background:'none',border:'none',cursor:'pointer',fontSize:20,color:'var(--faint)' }}>×</button>
            </div>
            <div className="modal-body">
              <div className="fg">
                <div><label className="lbl">Business Name *</label><input className="inp" value={form.name} onChange={e=>sf('name',e.target.value)} placeholder="Acme Ltd"/></div>
                <div><label className="lbl">Contact Email</label><input className="inp" type="email" value={form.email} onChange={e=>sf('email',e.target.value)}/></div>
                <div><label className="lbl">Phone</label><input className="inp" value={form.phone} onChange={e=>sf('phone',e.target.value)}/></div>
                <div><label className="lbl">Website</label><input className="inp" value={form.website} onChange={e=>sf('website',e.target.value)}/></div>
                <div><label className="lbl">Status</label>
                  <select className="inp" value={form.status} onChange={e=>sf('status',e.target.value)}>
                    {['lead','active','inactive','lost'].map(s=><option key={s} value={s} style={{ textTransform:'capitalize' }}>{s}</option>)}
                  </select>
                </div>
                <div><label className="lbl">Value (£)</label><input className="inp" type="number" value={form.value} onChange={e=>sf('value',e.target.value)}/></div>
                <div className="fc"><label className="lbl">Notes</label><textarea className="inp" rows={3} value={form.notes} onChange={e=>sf('notes',e.target.value)} style={{ resize:'vertical' }}/></div>
              </div>
            </div>
            <div className="modal-ft">
              <button className="btn btn-outline" onClick={() => setModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
