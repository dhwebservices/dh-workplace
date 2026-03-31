import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { sbGet, sbGetMany, sbInsert, sbUpdate, supabase } from '../../utils/supabase'
import { PLANS } from '../../utils/entitlements'
import { deleteMemberSafely, logAuditEvent, removePendingInvite, sendInviteEmail } from '../../utils/teamMembers'
import { buildDemoAccessUrl, ensureDemoAccess, regenerateDemoAccess, resetDemoTenant } from '../../utils/demoTenant'

const WORKER_URL = import.meta.env.VITE_WORKER_URL

export default function SuperTenant() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [tenant, setTenant] = useState(null)
  const [users, setUsers] = useState([])
  const [invites, setInvites] = useState([])
  const [logs, setLogs] = useState([])
  const [stats, setStats] = useState({ clients: 0, tasks: 0, documents: 0, leave: 0, timesheets: 0, invoices: 0, outreach: 0 })
  const [supportNote, setSupportNote] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [passwordModal, setPasswordModal] = useState({ open: false, user: null })
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [resettingDemo, setResettingDemo] = useState(false)
  const [demoAccessBusy, setDemoAccessBusy] = useState(false)

  useEffect(() => { load() }, [id])

  const load = async () => {
    setLoading(true)
    const [t, u, i, l, clients, tasks, documents, leaveRequests, timesheets, invoices, outreach] = await Promise.all([
      sbGet('tenants', `id=eq.${id}`),
      sbGetMany('tenant_users', `tenant_id=eq.${id}&order=created_at.asc`),
      sbGetMany('invitations', `tenant_id=eq.${id}&accepted_at=is.null&order=created_at.desc`),
      sbGetMany('audit_log', `tenant_id=eq.${id}&order=created_at.desc&limit=30`),
      sbGetMany('clients', `tenant_id=eq.${id}`),
      sbGetMany('tasks', `tenant_id=eq.${id}`),
      sbGetMany('documents', `tenant_id=eq.${id}`),
      sbGetMany('leave_requests', `tenant_id=eq.${id}`),
      sbGetMany('timesheets', `tenant_id=eq.${id}`),
      sbGetMany('invoices', `tenant_id=eq.${id}`),
      sbGetMany('outreach', `tenant_id=eq.${id}`),
    ])
    setTenant(t)
    setUsers(u||[])
    setInvites(i||[])
    setLogs(l||[])
    setStats({
      clients: (clients || []).length,
      tasks: (tasks || []).length,
      documents: (documents || []).length,
      leave: (leaveRequests || []).length,
      timesheets: (timesheets || []).length,
      invoices: (invoices || []).length,
      outreach: (outreach || []).length,
    })
    setLoading(false)
  }

  const updateTenant = async (payload) => {
    setSaving(true)
    try {
      await sbUpdate('tenants', `id=eq.${id}`, { ...payload, updated_at:new Date().toISOString() })
      await logAuditEvent({ tenantId: id, action: 'tenant_updated_by_platform_admin', entity: 'tenant', entityId: id, metadata: payload })
      setTenant(p=>({...p,...payload}))
    } catch(e) { alert(e.message) }
    setSaving(false)
  }

  const extendTrial = async (days) => {
    const base = tenant?.trial_ends_at && new Date(tenant.trial_ends_at) > new Date() ? new Date(tenant.trial_ends_at) : new Date()
    base.setDate(base.getDate() + days)
    await updateTenant({ trial_ends_at: base.toISOString(), status: tenant.status === 'cancelled' ? 'trialing' : tenant.status })
  }

  const addSupportNote = async () => {
    if (!supportNote.trim()) return
    setSaving(true)
    try {
      await sbInsert('audit_log', {
        tenant_id: id,
        tenant_user_id: null,
        action: 'support_note_added',
        entity: 'tenant',
        entity_id: id,
        metadata: { note: supportNote.trim(), source: 'platform_admin' },
        created_at: new Date().toISOString(),
      })
      setSupportNote('')
      await load()
    } catch (e) {
      alert(e.message)
    }
    setSaving(false)
  }

  const toggleMemberStatus = async (member, nextStatus) => {
    setSaving(true)
    try {
      await sbUpdate('tenant_users', `id=eq.${member.id}`, { status: nextStatus })
      await logAuditEvent({ tenantId: id, action: nextStatus === 'suspended' ? 'member_suspended_by_platform_admin' : 'member_reinstated_by_platform_admin', entity: 'tenant_user', entityId: member.id, metadata: { email: member.email } })
      await load()
    } catch (e) {
      alert(e.message)
    }
    setSaving(false)
  }

  const deletePending = async (member) => {
    if (!window.confirm(`Delete the pending invite for ${member.email}?`)) return
    setSaving(true)
    try {
      await removePendingInvite({ tenantId: id, memberId: member.id, email: member.email })
      await load()
    } catch (e) {
      alert(e.message)
    }
    setSaving(false)
  }

  const deleteMember = async (member) => {
    if (!window.confirm(`Permanently delete ${member.full_name || member.email}? This is only safe for suspended members with no linked history.`)) return
    setSaving(true)
    try {
      await deleteMemberSafely({ tenantId: id, member })
      await load()
    } catch (e) {
      alert(e.message)
    }
    setSaving(false)
  }

  const resendInvite = async (invite) => {
    setSaving(true)
    try {
      const result = await sendInviteEmail({
        email: invite.email,
        fullName: invite.full_name,
        invitedBy: 'DH Workplace Support',
        company: tenant.name,
        role: invite.role,
        token: invite.token,
      })
      if (!result.ok) throw new Error(result.error)
      await logAuditEvent({ tenantId: id, action: 'invite_resent_by_platform_admin', entity: 'invitation', entityId: invite.id, metadata: { email: invite.email } })
      alert('Invitation resent.')
    } catch (e) {
      alert(e.message)
    }
    setSaving(false)
  }

  const removeInvitation = async (invite) => {
    const member = users.find(user => user.email?.toLowerCase() === invite.email?.toLowerCase() && user.status === 'invited')
    if (!member) {
      alert('No pending tenant user was found for this invite.')
      return
    }
    if (!window.confirm(`Delete the pending invite for ${invite.email}?`)) return
    setSaving(true)
    try {
      await removePendingInvite({ tenantId: id, memberId: member.id, email: invite.email })
      await load()
    } catch (e) {
      alert(e.message)
    }
    setSaving(false)
  }

  const sendResetEmail = async (user) => {
    if (!user?.email || !user?.user_id) return
    setSaving(true)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
        redirectTo: `${window.location.origin}/signin`,
      })
      if (error) throw error
      await logAuditEvent({ tenantId: id, action: 'member_reset_email_sent_by_platform_admin', entity: 'tenant_user', entityId: user.id, metadata: { email: user.email } })
      alert(`Reset email sent to ${user.email}.`)
    } catch (e) {
      alert(e.message)
    }
    setSaving(false)
  }

  const openPasswordModal = (user) => {
    setNewPassword('')
    setConfirmPassword('')
    setPasswordModal({ open: true, user })
  }

  const closePasswordModal = () => {
    if (saving) return
    setPasswordModal({ open: false, user: null })
    setNewPassword('')
    setConfirmPassword('')
  }

  const savePassword = async () => {
    if (!passwordModal.user?.user_id) return
    if (newPassword.length < 10) {
      alert('Use a password with at least 10 characters.')
      return
    }
    if (newPassword !== confirmPassword) {
      alert('Passwords do not match.')
      return
    }

    setSaving(true)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData?.session?.access_token
      if (!token) throw new Error('You need an active session to set a password.')

      const res = await fetch(WORKER_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          type: 'auth_set_password',
          data: {
            user_id: passwordModal.user.user_id,
            password: newPassword,
          },
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Unable to set password')

      await logAuditEvent({ tenantId: id, action: 'member_password_set_by_platform_admin', entity: 'tenant_user', entityId: passwordModal.user.id, metadata: { email: passwordModal.user.email } })
      alert(`Password updated for ${passwordModal.user.email}.`)
      closePasswordModal()
    } catch (e) {
      alert(e.message)
    }
    setSaving(false)
  }

  const resetDemo = async () => {
    if (!tenant?.is_demo) return
    if (!window.confirm('Reset this demo tenant back to its seeded state?')) return
    setResettingDemo(true)
    try {
      await resetDemoTenant(tenant)
      await load()
      alert('Demo tenant reset.')
    } catch (e) {
      alert(e.message)
    }
    setResettingDemo(false)
  }

  const copyDemoLink = async () => {
    if (!tenant?.is_demo) return
    setDemoAccessBusy(true)
    try {
      const refreshedTenant = await ensureDemoAccess(tenant.id)
      const url = buildDemoAccessUrl(refreshedTenant)
      await navigator.clipboard.writeText(url)
      setTenant(refreshedTenant)
      alert('Read-only demo link copied.')
    } catch (e) {
      alert(e.message)
    }
    setDemoAccessBusy(false)
  }

  const regenerateDemoLink = async () => {
    if (!tenant?.is_demo) return
    if (!window.confirm('Regenerate the public demo link? The old demo URL will stop working.')) return
    setDemoAccessBusy(true)
    try {
      const refreshedTenant = await regenerateDemoAccess(tenant.id)
      const url = buildDemoAccessUrl(refreshedTenant)
      await navigator.clipboard.writeText(url)
      setTenant(refreshedTenant)
      alert('A new demo link has been generated and copied.')
    } catch (e) {
      alert(e.message)
    }
    setDemoAccessBusy(false)
  }

  if (loading) return <div className="spin-wrap"><div className="spin"/></div>
  if (!tenant) return <div className="card card-pad"><p style={{color:'var(--faint)'}}>Tenant not found.</p></div>

  const activeUsers = users.filter(user => user.status === 'active').length
  const invitedUsers = users.filter(user => user.status === 'invited').length
  const suspendedUsers = users.filter(user => user.status === 'suspended').length
  const seatUsage = users.filter(user => user.status !== 'suspended').length
  const trialEndsSoon = tenant.trial_ends_at && new Date(tenant.trial_ends_at) < new Date(Date.now() + 3 * 86400000)
  const healthFlags = [
    !tenant.gc_mandate_id && tenant.status !== 'cancelled' ? 'No billing mandate on file' : null,
    trialEndsSoon ? 'Trial ends within 3 days' : null,
    tenant.status === 'overdue' ? 'Payment issue requires attention' : null,
    tenant.status === 'blocked' ? 'Workspace is blocked from signing in' : null,
    seatUsage >= (tenant.seat_limit || 5) ? 'Seat limit reached' : null,
    activeUsers <= 1 ? 'Only one active user on this tenant' : null,
  ].filter(Boolean)
  const supportNotes = logs.filter(log => log.action === 'support_note_added')
  const recentActivity = logs.filter(log => log.action !== 'support_note_added')
  const statusBadge = tenant.status === 'active' ? 'green' : tenant.status === 'trialing' ? 'amber' : tenant.status === 'overdue' || tenant.status === 'blocked' ? 'red' : 'grey'
  const openInvoices = stats.invoices

  return (
    <div className="fade-in page-stack">
      <div>
        <button onClick={()=>navigate('/superadmin/tenants')} className="btn btn-outline btn-sm">Back to tenants</button>
      </div>
      <div className="page-hd">
        <div>
          <h1 className="page-title">{tenant.name}</h1>
          <p className="page-sub">{tenant.owner_email} · Joined {new Date(tenant.created_at).toLocaleDateString('en-GB')}</p>
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
          {tenant.is_demo && <span className="badge badge-grey">Demo tenant</span>}
          {tenant.demo_template && <span className="badge badge-gold">{tenant.demo_template}</span>}
          <span className={`badge badge-${statusBadge}`} style={{textTransform:'capitalize',fontSize:13}}>{tenant.status}</span>
        </div>
      </div>
      <div className="table-toolbar" style={{ alignItems:'center' }}>
        <div className="compact-note">Use the quick actions below to handle access, billing posture, and tenant recovery without leaving this record.</div>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          {tenant.status === 'blocked' ? (
            <button className="btn btn-outline btn-sm" onClick={() => updateTenant({ status:'active' })} disabled={saving}>Unblock tenant</button>
          ) : (
            <button className="btn btn-outline btn-sm" onClick={() => updateTenant({ status:'blocked' })} disabled={saving}>Block tenant</button>
          )}
          <button className="btn btn-outline btn-sm" onClick={() => extendTrial(7)} disabled={saving}>Extend trial 7 days</button>
          <button className="btn btn-outline btn-sm" onClick={() => updateTenant({ status:'active', grace_period_ends_at:null })} disabled={saving}>Mark billing healthy</button>
          {tenant.is_demo && <button className="btn btn-outline btn-sm" onClick={copyDemoLink} disabled={saving || demoAccessBusy}>{demoAccessBusy ? 'Preparing link...' : 'Copy demo link'}</button>}
          {tenant.is_demo && <button className="btn btn-outline btn-sm" onClick={regenerateDemoLink} disabled={saving || demoAccessBusy}>Regenerate demo link</button>}
          {tenant.is_demo && <button className="btn btn-outline btn-sm" onClick={resetDemo} disabled={saving || resettingDemo}>{resettingDemo ? 'Resetting demo...' : 'Reset demo data'}</button>}
          <button className="btn btn-outline btn-sm" onClick={load} disabled={saving}>Refresh tenant</button>
        </div>
      </div>
      <div className="kpi-strip">
        <div className="kpi-cell">
          <div className="kpi-cell-label">Plan</div>
          <div className="kpi-cell-value" style={{textTransform:'capitalize'}}>{tenant.plan}</div>
        </div>
        <div className="kpi-cell">
          <div className="kpi-cell-label">Users</div>
          <div className="kpi-cell-value">{activeUsers} active</div>
        </div>
        <div className="kpi-cell">
          <div className="kpi-cell-label">Billing</div>
          <div className="kpi-cell-value">{tenant.gc_subscription_id ? 'Live' : tenant.gc_mandate_id ? 'Mandate' : 'Action needed'}</div>
        </div>
        <div className="kpi-cell">
          <div className="kpi-cell-label">Seat usage</div>
          <div className="kpi-cell-value">{seatUsage}/{tenant.seat_limit || 5}</div>
        </div>
      </div>
      <div className="stats-grid" style={{gridTemplateColumns:'repeat(4,1fr)',marginBottom:0}}>
        {[
          { label:'Users', value: `${activeUsers} active`, note: `${invitedUsers} invited · ${suspendedUsers} suspended`, colour:'var(--blue)' },
          { label:'Seat Usage', value: `${seatUsage}/${tenant.seat_limit || 5}`, note: tenant.plan, colour: seatUsage >= (tenant.seat_limit || 5) ? 'var(--red)' : 'var(--green)' },
          { label:'Billing', value: tenant.gc_mandate_id ? 'Mandate set' : 'No mandate', note: tenant.last_payment_at ? `Last payment ${new Date(tenant.last_payment_at).toLocaleDateString('en-GB')}` : 'No successful payment yet', colour: tenant.gc_mandate_id ? 'var(--green)' : 'var(--amber)' },
          { label:'Workspace', value: `${stats.clients} clients`, note: `${stats.tasks} tasks · ${openInvoices} invoices`, colour:'var(--gold)' },
        ].map(card => (
          <div key={card.label} className="stat-card">
            <div className="stat-val" style={{color:card.colour,fontSize:24}}>{card.value}</div>
            <div className="stat-lbl">{card.label}</div>
            <div style={{marginTop:6,fontSize:12,color:'var(--faint)'}}>{card.note}</div>
          </div>
        ))}
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1.2fr 0.8fr',gap:20,marginBottom:20}}>
        <div className="card card-pad">
          <div className="section-head">
            <div>
              <h3 className="panel-title">Tenant health</h3>
              <div className="panel-sub">Operational and billing flags that need attention</div>
            </div>
          </div>
          {healthFlags.length === 0 ? (
            <div style={{padding:'12px 14px',borderRadius:10,background:'var(--green-soft)',border:'1px solid var(--green)',color:'var(--green)',fontSize:13}}>
              No risk flags at the moment.
            </div>
          ) : (
            <div style={{display:'flex',flexDirection:'column',gap:10}}>
              {healthFlags.map(flag => (
                <div key={flag} style={{padding:'12px 14px',borderRadius:10,background:'var(--amber-soft)',border:'1px solid var(--amber)',color:'var(--amber)',fontSize:13}}>
                  {flag}
                </div>
              ))}
            </div>
          )}
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12,marginTop:16}}>
            {[
              ['Documents', stats.documents],
              ['Leave requests', stats.leave],
              ['Timesheets', stats.timesheets],
              ['Invoices', stats.invoices],
              ['Outreach records', stats.outreach],
              ['Pending invites', invites.length],
            ].map(([label, value]) => (
              <div key={label} style={{padding:'14px 16px',border:'1px solid var(--border)',borderRadius:12,background:'var(--bg)'}}>
                <div style={{fontSize:22,fontWeight:700,lineHeight:1.1}}>{value}</div>
                <div style={{fontSize:12,color:'var(--faint)',marginTop:6}}>{label}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="card card-pad">
          <div className="section-head">
            <div>
              <h3 className="panel-title">Tenant details</h3>
              <div className="panel-sub">Commercial identifiers and support reference points</div>
            </div>
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:10}}>
            {[
              ['Slug', tenant.slug],
              ['Plan', tenant.plan],
              ['Tenant Type', tenant.is_demo ? 'Demo' : 'Live'],
              ['Demo Template', tenant.demo_template || '—'],
              ['Seat Limit', tenant.seat_limit],
              ['Owner Email', tenant.owner_email],
              ['GC Customer', tenant.gc_customer_id||'Not set'],
              ['GC Mandate', tenant.gc_mandate_id||'Not set'],
              ['GC Subscription', tenant.gc_subscription_id||'Not set'],
              ['Trial Ends', tenant.trial_ends_at?new Date(tenant.trial_ends_at).toLocaleDateString('en-GB'):'N/A'],
              ['Next Payment', tenant.next_payment_at?new Date(tenant.next_payment_at).toLocaleDateString('en-GB'):'Not scheduled'],
              ['Grace Ends', tenant.grace_period_ends_at?new Date(tenant.grace_period_ends_at).toLocaleDateString('en-GB'):'None'],
            ].map(([label,val])=>(
              <div key={label} style={{display:'flex',justifyContent:'space-between',gap:16,padding:'8px 0',borderBottom:'1px solid var(--border2)'}}>
                <span style={{fontSize:13,color:'var(--faint)'}}>{label}</span>
                <span style={{fontSize:13,fontFamily:'var(--font-mono)',color:'var(--text)',textAlign:'right'}}>{val}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'0.9fr 1.1fr',gap:20,marginBottom:20}}>
        <div style={{display:'flex',flexDirection:'column',gap:16}}>
          <div className="card card-pad">
            <div className="section-head">
              <div>
                <h3 className="panel-title">Platform actions</h3>
                <div className="panel-sub">Adjust plan, status, and seat limits without leaving the tenant record</div>
              </div>
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:10}}>
              <div>
                <label className="lbl">Change Plan</label>
                <select className="inp" value={tenant.plan} onChange={e=>updateTenant({plan:e.target.value,seat_limit:PLANS[e.target.value]?.max_users||5})} disabled={saving}>
                  {Object.entries(PLANS).map(([key,p])=><option key={key} value={key}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label className="lbl">Change Status</label>
                <select className="inp" value={tenant.status} onChange={e=>updateTenant({status:e.target.value})} disabled={saving}>
                  {['trialing','active','overdue','suspended','blocked','cancelled'].map(s=><option key={s} value={s} style={{textTransform:'capitalize'}}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>)}
                </select>
              </div>
              <div>
                <label className="lbl">Seat Limit</label>
                <input className="inp" type="number" min="1" value={tenant.seat_limit || 5} onChange={e=>setTenant(p=>({...p,seat_limit:Number(e.target.value)||1}))} />
                <div style={{marginTop:8}}>
                  <button className="btn btn-outline btn-sm" onClick={()=>updateTenant({seat_limit:tenant.seat_limit || 5})} disabled={saving}>Save seat limit</button>
                </div>
              </div>
              <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                <button className="btn btn-outline btn-sm" onClick={()=>extendTrial(7)} disabled={saving}>Extend trial 7 days</button>
                <button className="btn btn-outline btn-sm" onClick={()=>updateTenant({status:'active',grace_period_ends_at:null})} disabled={saving}>Mark billing healthy</button>
                <button className="btn btn-outline btn-sm" onClick={load} disabled={saving}>Refresh data</button>
              </div>
            </div>
          </div>
          <div className="card card-pad">
            <div className="section-head">
              <div>
                <h3 className="panel-title">Support notes</h3>
                <div className="panel-sub">Internal notes stored against the tenant audit trail</div>
              </div>
            </div>
            <textarea className="inp" rows={4} value={supportNote} onChange={e=>setSupportNote(e.target.value)} placeholder="Add an internal note about billing, support, onboarding, or account context." style={{resize:'vertical'}} />
            <div style={{marginTop:12,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <span style={{fontSize:12,color:'var(--faint)'}}>Notes are stored in the tenant audit trail.</span>
              <button className="btn btn-primary btn-sm" onClick={addSupportNote} disabled={saving || !supportNote.trim()}>Save note</button>
            </div>
            <div style={{marginTop:16,display:'flex',flexDirection:'column',gap:10}}>
              {supportNotes.length === 0 ? (
                <div style={{fontSize:13,color:'var(--faint)'}}>No support notes yet.</div>
              ) : supportNotes.slice(0, 5).map(note => (
                <div key={note.id} style={{padding:'12px 14px',border:'1px solid var(--border)',borderRadius:10,background:'var(--bg)'}}>
                  <div style={{fontSize:13,color:'var(--text)',marginBottom:6}}>{note.metadata?.note || 'Note unavailable'}</div>
                  <div style={{fontSize:11,color:'var(--faint)',fontFamily:'var(--font-mono)'}}>{new Date(note.created_at).toLocaleString('en-GB')}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="card card-pad">
          <div className="section-head">
            <div>
              <h3 className="panel-title">Team members ({users.length})</h3>
              <div className="panel-sub">User lifecycle, invitations, and account access in one place</div>
            </div>
          </div>
          <div style={{overflowX:'auto'}}>
            <table className="tbl">
              <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Joined</th><th>Actions</th></tr></thead>
              <tbody>
                {users.map(user => (
                  <tr key={user.id}>
                    <td className="t-main">{user.full_name || '—'}</td>
                    <td style={{fontFamily:'var(--font-mono)',fontSize:11,color:'var(--faint)'}}>{user.email}</td>
                    <td><span className="badge badge-blue" style={{textTransform:'capitalize'}}>{user.role}</span></td>
                    <td><span className={`badge badge-${user.status==='active'?'green':user.status==='invited'?'amber':'grey'}`} style={{textTransform:'capitalize'}}>{user.status}</span></td>
                    <td style={{fontFamily:'var(--font-mono)',fontSize:11,color:'var(--faint)'}}>{user.joined_at ? new Date(user.joined_at).toLocaleDateString('en-GB') : '—'}</td>
                    <td>
                      <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                        {user.status === 'invited' ? (
                          <button className="btn btn-sm" onClick={()=>deletePending(user)} disabled={saving}
                            style={{background:'var(--red-soft)',color:'var(--red)',border:'1px solid var(--red)'}}>
                            Delete invite
                          </button>
                        ) : (
                          <>
                            {user.user_id && (
                              <>
                                <button className="btn btn-sm btn-outline" onClick={()=>sendResetEmail(user)} disabled={saving}>
                                  Reset password
                                </button>
                                <button className="btn btn-sm btn-outline" onClick={()=>openPasswordModal(user)} disabled={saving}>
                                  Set password
                                </button>
                              </>
                            )}
                            <button className="btn btn-sm btn-outline" onClick={()=>toggleMemberStatus(user, user.status === 'active' ? 'suspended' : 'active')} disabled={saving}>
                              {user.status === 'active' ? 'Suspend' : 'Reinstate'}
                            </button>
                            {user.status === 'suspended' && (
                              <button className="btn btn-sm" onClick={()=>deleteMember(user)} disabled={saving}
                                style={{background:'var(--red-soft)',color:'var(--red)',border:'1px solid var(--red)'}}>
                                Delete member
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'0.9fr 1.1fr',gap:20}}>
        <div className="card card-pad">
          <div className="section-head">
            <div>
              <h3 className="panel-title">Pending invitations ({invites.length})</h3>
              <div className="panel-sub">Resend, review, or remove open invitations for this tenant</div>
            </div>
          </div>
          {invites.length === 0 ? (
            <div style={{fontSize:13,color:'var(--faint)'}}>No open invitations.</div>
          ) : (
            <div style={{display:'flex',flexDirection:'column',gap:10}}>
              {invites.map(invite => (
                <div key={invite.id} style={{padding:'12px 14px',border:'1px solid var(--border)',borderRadius:12,background:'var(--bg)'}}>
                  <div style={{display:'flex',justifyContent:'space-between',gap:16,marginBottom:8}}>
                    <div>
                      <div style={{fontSize:13,fontWeight:600}}>{invite.full_name || invite.email}</div>
                      <div style={{fontSize:11,color:'var(--faint)',fontFamily:'var(--font-mono)'}}>{invite.email}</div>
                    </div>
                    <span className="badge badge-amber" style={{textTransform:'capitalize'}}>{invite.role}</span>
                  </div>
                  <div style={{fontSize:11,color:'var(--faint)',marginBottom:10}}>
                    Sent {new Date(invite.created_at).toLocaleString('en-GB')} · Expires {invite.expires_at ? new Date(invite.expires_at).toLocaleDateString('en-GB') : 'in 7 days'}
                  </div>
                  <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                    <button className="btn btn-outline btn-sm" onClick={()=>resendInvite(invite)} disabled={saving}>Resend email</button>
                    <button className="btn btn-sm" onClick={()=>removeInvitation(invite)} disabled={saving}
                      style={{background:'var(--red-soft)',color:'var(--red)',border:'1px solid var(--red)'}}>
                      Delete invite
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="card card-pad">
          <div className="section-head">
            <div>
              <h3 className="panel-title">Recent activity</h3>
              <div className="panel-sub">Latest tenant events, support notes, and operational changes</div>
            </div>
          </div>
          {recentActivity.length === 0 ? (
            <div style={{fontSize:13,color:'var(--faint)'}}>No recent activity yet.</div>
          ) : (
            <div style={{display:'flex',flexDirection:'column',gap:10}}>
              {recentActivity.map(log => (
                <div key={log.id} style={{display:'flex',justifyContent:'space-between',gap:16,padding:'10px 0',borderBottom:'1px solid var(--border2)'}}>
                  <div>
                    <div style={{fontSize:13,fontWeight:500,textTransform:'capitalize'}}>{log.action?.replace(/_/g,' ')}</div>
                    <div style={{fontSize:12,color:'var(--faint)'}}>{log.entity || 'tenant'}{log.metadata ? ` · ${JSON.stringify(log.metadata)}` : ''}</div>
                  </div>
                  <div style={{fontSize:11,color:'var(--faint)',fontFamily:'var(--font-mono)',whiteSpace:'nowrap'}}>{new Date(log.created_at).toLocaleString('en-GB')}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {passwordModal.open && (
        <div className="modal-overlay" onClick={closePasswordModal}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-hd">
              <span className="modal-title">Set user password</span>
              <button onClick={closePasswordModal} style={{background:'none',border:'none',cursor:'pointer',fontSize:20,color:'var(--faint)'}}>x</button>
            </div>
            <div className="modal-body">
              <div style={{display:'flex',flexDirection:'column',gap:14}}>
                <div style={{fontSize:13,color:'var(--faint)'}}>
                  Set a new password for <strong style={{color:'var(--text)'}}>{passwordModal.user?.email}</strong>.
                </div>
                <div>
                  <label className="lbl">New password</label>
                  <input className="inp" type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="At least 10 characters" />
                </div>
                <div>
                  <label className="lbl">Confirm password</label>
                  <input className="inp" type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Re-enter password" />
                </div>
              </div>
            </div>
            <div className="modal-ft">
              <button className="btn btn-outline" onClick={closePasswordModal}>Cancel</button>
              <button className="btn btn-primary" onClick={savePassword} disabled={saving || !newPassword || !confirmPassword}>
                {saving ? 'Saving...' : 'Save password'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
