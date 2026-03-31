import { useState, useEffect } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { sbGetMany, sbInsert, sbUpdate } from '../../utils/supabase'
import { canApproveLeave } from '../../utils/permissions'
import { sendWebhookEvent } from '../../utils/webhooks'

const TYPES = ['annual','sick','compassionate','unpaid','other']
const WORKER_URL = import.meta.env.VITE_WORKER_URL

function calcDays(s, e) {
  if (!s || !e) return 0
  return Math.max(1, Math.ceil((new Date(e) - new Date(s)) / 86400000) + 1)
}

export default function LeaveRequests() {
  const { tenant, tenantUser } = useAuth()
  const [requests, setRequests] = useState([])
  const [staff, setStaff] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('all')
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({ type:'annual', start_date:'', end_date:'', notes:'' })
  const [saving, setSaving] = useState(false)
  const sf = (k,v) => setForm(p=>({...p,[k]:v}))
  const canReview = canApproveLeave(tenantUser?.role)

  useEffect(() => { load() }, [tenant?.id])

  const load = async () => {
    if (!tenant?.id) return
    setLoading(true)
    const [reqs, s] = await Promise.all([
      sbGetMany('leave_requests', `tenant_id=eq.${tenant.id}&order=created_at.desc`),
      sbGetMany('tenant_users', `tenant_id=eq.${tenant.id}&order=full_name.asc`),
    ])
    setRequests(reqs||[]); setStaff(s||[]); setLoading(false)
  }

  const submit = async () => {
    if (!form.start_date||!form.end_date) { alert('Dates required'); return }
    setSaving(true)
    try {
      await sbInsert('leave_requests', {
        tenant_id:tenant.id, tenant_user_id:tenantUser.id,
        type:form.type, start_date:form.start_date, end_date:form.end_date,
        days:calcDays(form.start_date,form.end_date),
        notes:form.notes||null, status:'pending', created_at:new Date().toISOString()
      })
      const managers = staff.filter(member => ['owner','admin','manager','superadmin'].includes(member.role) && member.id !== tenantUser.id)
      await Promise.all(managers.map(manager => sbInsert('notifications', {
        tenant_id: tenant.id,
        tenant_user_id: manager.id,
        title: 'New leave request',
        message: `${tenantUser.full_name || tenantUser.email} submitted ${calcDays(form.start_date, form.end_date)} day${calcDays(form.start_date, form.end_date) !== 1 ? 's' : ''} of ${form.type} leave`,
        type: 'warning',
        link: '/leave',
        created_at: new Date().toISOString(),
      })))
      sendWebhookEvent({
        tenantId: tenant.id,
        event: 'leave.request.created',
        payload: {
          tenant_user_id: tenantUser.id,
          type: form.type,
          start_date: form.start_date,
          end_date: form.end_date,
          days: calcDays(form.start_date, form.end_date),
        },
      })
      setModal(false); setForm({type:'annual',start_date:'',end_date:'',notes:''}); load()
    } catch(e) { alert(e.message) }
    setSaving(false)
  }

  const review = async (id, status) => {
    if (!canReview) return
    await sbUpdate('leave_requests', `id=eq.${id}`, { status, reviewed_by:tenantUser.id, reviewed_at:new Date().toISOString() })
    const request = requests.find(r => r.id === id)
    const member = staff.find(s => s.id === request?.tenant_user_id)
    setRequests(p => p.map(r => r.id===id ? {...r,status} : r))

    if (request && member) {
      sendWebhookEvent({
        tenantId: tenant.id,
        event: 'leave.request.updated',
        payload: {
          request_id: id,
          tenant_user_id: request.tenant_user_id,
          status,
          reviewed_by: tenantUser.id,
        },
      })
      await sbInsert('notifications', {
        tenant_id: tenant.id,
        tenant_user_id: member.id,
        title: `Leave request ${status}`,
        message: `Your ${request.type} leave request for ${new Date(request.start_date).toLocaleDateString('en-GB')} to ${new Date(request.end_date).toLocaleDateString('en-GB')} was ${status}.`,
        type: status === 'approved' ? 'success' : 'error',
        link: '/leave',
        created_at: new Date().toISOString(),
      })

      if (WORKER_URL && member.email) {
        await fetch(WORKER_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: status === 'approved' ? 'leave_request_approved' : 'leave_request_rejected',
            data: {
              to_email: member.email,
              staff_name: member.full_name || member.email,
              start_date: new Date(request.start_date).toLocaleDateString('en-GB'),
              end_date: new Date(request.end_date).toLocaleDateString('en-GB'),
              notes: request.notes || '',
              url: `${window.location.origin}/leave`,
            },
          }),
        }).catch(() => {})
      }
    }
  }

  const getName = id => staff.find(s=>s.id===id)?.full_name || 'Unknown'
  const filtered = requests.filter(r => {
    if (!canReview && r.tenant_user_id !== tenantUser?.id) return false
    if (tab==='mine') return r.tenant_user_id===tenantUser?.id
    if (tab==='pending') return r.status==='pending'
    if (tab==='approved') return r.status==='approved'
    return true
  })
  const tabs = [[canReview ? 'all' : 'mine', canReview ? 'All' : 'My Requests'],['mine','Mine'],['pending','Pending'],['approved','Approved']]
    .filter((item, index, arr) => arr.findIndex(other => other[0] === item[0]) === index)
  const SB = { pending:'badge-amber', approved:'badge-green', rejected:'badge-red', cancelled:'badge-grey' }

  return (
    <div className="fade-in page-stack">
      <div className="page-hd">
        <div>
          <h1 className="page-title">Leave Requests</h1>
          <p className="page-sub">{requests.filter(r=>r.status==='pending').length} pending approval</p>
        </div>
        <button className="btn btn-primary" onClick={()=>setModal(true)}>+ Request Leave</button>
      </div>
      <div className="tabs">
        {tabs.map(([k,l])=>(
          <button key={k} className={`tab${tab===k?' on':''}`} onClick={()=>setTab(k)}>{l}</button>
        ))}
      </div>
      <div className="compact-note">Keep upcoming time off, approvals, and staff availability in one place.</div>
      <div className="card card-pad table-card">
        {loading ? <div style={{padding:24}}>{[1,2,3].map(i=><div key={i} className="skel" style={{height:52,marginBottom:8,borderRadius:8}}/>)}</div>
        : filtered.length===0 ? <div className="empty"><p>No leave requests</p></div>
        : <table className="tbl">
            <thead><tr>
              {canReview&&<th>Staff</th>}
              <th>Type</th><th>From</th><th>To</th><th>Days</th><th>Status</th><th>Notes</th>
              {canReview&&<th>Actions</th>}
            </tr></thead>
            <tbody>
              {filtered.map(r=>(
                <tr key={r.id}>
                  {canReview&&<td className="t-main">{getName(r.tenant_user_id)}</td>}
                  <td style={{textTransform:'capitalize'}}>{r.type}</td>
                  <td style={{fontFamily:'var(--font-mono)',fontSize:12}}>{new Date(r.start_date).toLocaleDateString('en-GB')}</td>
                  <td style={{fontFamily:'var(--font-mono)',fontSize:12}}>{new Date(r.end_date).toLocaleDateString('en-GB')}</td>
                  <td style={{fontWeight:600}}>{r.days}</td>
                  <td><span className={`badge ${SB[r.status]||'badge-grey'}`} style={{textTransform:'capitalize'}}>{r.status}</span></td>
                  <td style={{color:'var(--faint)',fontSize:12,maxWidth:160,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.notes||'—'}</td>
                  {canReview&&<td>{r.status==='pending' && r.tenant_user_id !== tenantUser?.id && <div style={{display:'flex',gap:6}}>
                    <button className="btn btn-sm btn-outline" style={{color:'var(--green)', borderColor:'rgba(36,160,107,0.22)', background:'var(--green-soft)'}} onClick={()=>review(r.id,'approved')}>Approve</button>
                    <button className="btn btn-sm btn-outline" style={{color:'var(--red)', borderColor:'rgba(222,91,77,0.22)', background:'var(--red-soft)'}} onClick={()=>review(r.id,'rejected')}>Reject</button>
                  </div>}</td>}
                </tr>
              ))}
            </tbody>
          </table>}
      </div>
      {modal&&(
        <div className="modal-overlay" onClick={()=>setModal(false)}>
          <div className="modal-box" onClick={e=>e.stopPropagation()}>
            <div className="modal-hd">
              <span style={{fontWeight:600}}>Request Leave</span>
              <button onClick={()=>setModal(false)} style={{background:'none',border:'none',cursor:'pointer',fontSize:20,color:'var(--faint)'}}>×</button>
            </div>
            <div className="modal-body">
              <div style={{display:'flex',flexDirection:'column',gap:14}}>
                <div><label className="lbl">Type</label>
                  <select className="inp" value={form.type} onChange={e=>sf('type',e.target.value)}>
                    {TYPES.map(t=><option key={t} value={t}>{t.charAt(0).toUpperCase()+t.slice(1)}</option>)}
                  </select>
                </div>
                <div className="fg">
                  <div><label className="lbl">Start Date</label><input className="inp" type="date" value={form.start_date} onChange={e=>sf('start_date',e.target.value)}/></div>
                  <div><label className="lbl">End Date</label><input className="inp" type="date" value={form.end_date} min={form.start_date} onChange={e=>sf('end_date',e.target.value)}/></div>
                </div>
                {form.start_date&&form.end_date&&(
                  <div style={{background:'var(--blue-soft)',borderRadius:8,padding:'10px 14px',fontSize:13,color:'var(--blue)'}}>
                    <strong>{calcDays(form.start_date,form.end_date)} day{calcDays(form.start_date,form.end_date)!==1?'s':''}</strong> requested
                  </div>
                )}
                <div><label className="lbl">Notes</label>
                  <textarea className="inp" rows={3} value={form.notes} onChange={e=>sf('notes',e.target.value)} placeholder="Optional details..." style={{resize:'vertical'}}/>
                </div>
              </div>
            </div>
            <div className="modal-ft">
              <button className="btn btn-outline" onClick={()=>setModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={submit} disabled={saving}>{saving?'Submitting...':'Submit Request'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
