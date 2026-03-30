import { useEffect, useState } from 'react'
import { sbDelete, sbGetMany, sbInsert } from '../../utils/supabase'

const WORKER_URL = import.meta.env.VITE_WORKER_URL

export default function SuperAccess() {
  const [admins, setAdmins] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [email, setEmail] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    const data = await sbGetMany('platform_admins', 'order=created_at.asc')
    setAdmins(data || [])
    setLoading(false)
  }

  const activeAdmins = admins.filter(admin => admin.user_id)
  const pendingAdmins = admins.filter(admin => !admin.user_id)

  const sendInvite = async () => {
    const normalizedEmail = email.trim().toLowerCase()
    if (!normalizedEmail) return
    setSaving(true)
    try {
      const existing = admins.find(admin => admin.email?.toLowerCase() === normalizedEmail)
      if (!existing) {
        await sbInsert('platform_admins', {
          email: normalizedEmail,
          user_id: null,
          created_at: new Date().toISOString(),
        })
      }

      const res = await fetch(WORKER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'platform_admin_invite',
          data: {
            email: normalizedEmail,
            invite_url_base: `${window.location.origin}/platform-access`,
          },
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Unable to send platform access invite')

      setEmail('')
      setModal(false)
      await load()
      alert('Platform admin invite sent.')
    } catch (e) {
      alert(e.message)
    }
    setSaving(false)
  }

  const resendInvite = async (admin) => {
    setSaving(true)
    try {
      const res = await fetch(WORKER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'platform_admin_invite',
          data: {
            email: admin.email,
            invite_url_base: `${window.location.origin}/platform-access`,
          },
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Unable to resend platform access invite')
      alert('Invite resent.')
    } catch (e) {
      alert(e.message)
    }
    setSaving(false)
  }

  const removeAccess = async (admin) => {
    if (admin.user_id && activeAdmins.length <= 1) {
      alert('You must keep at least one active platform admin.')
      return
    }
    if (!window.confirm(`Remove platform admin access for ${admin.email}?`)) return
    setSaving(true)
    try {
      await sbDelete('platform_admins', `id=eq.${admin.id}`)
      await load()
    } catch (e) {
      alert(e.message)
    }
    setSaving(false)
  }

  return (
    <div className="fade-in page-stack">
      <div className="page-hd">
        <div>
          <h1 className="page-title">Platform Access</h1>
          <p className="page-sub">{activeAdmins.length} active admin{activeAdmins.length !== 1 ? 's' : ''} · {pendingAdmins.length} pending invite{pendingAdmins.length !== 1 ? 's' : ''}</p>
        </div>
        <button className="btn btn-primary" onClick={() => setModal(true)}>+ Invite platform admin</button>
      </div>

      <div className="compact-note">Grant super admin access to colleagues without mixing platform permissions into tenant roles.</div>

      <div className="kpi-strip">
        <div className="kpi-cell">
          <div className="kpi-cell-label">Active admins</div>
          <div className="kpi-cell-value">{activeAdmins.length}</div>
        </div>
        <div className="kpi-cell">
          <div className="kpi-cell-label">Pending invites</div>
          <div className="kpi-cell-value">{pendingAdmins.length}</div>
        </div>
        <div className="kpi-cell">
          <div className="kpi-cell-label">Access model</div>
          <div className="kpi-cell-value">Platform</div>
        </div>
        <div className="kpi-cell">
          <div className="kpi-cell-label">Tenant role needed</div>
          <div className="kpi-cell-value">No</div>
        </div>
      </div>

      <div className="card card-pad table-card">
        <div className="section-head">
          <div>
            <h3 className="panel-title">Platform admins</h3>
            <div className="panel-sub">Everyone with live access to the super admin area</div>
          </div>
        </div>
        {loading ? (
          <div style={{padding:24}}>{[1,2,3].map(i => <div key={i} className="skel" style={{height:52,marginBottom:8,borderRadius:8}} />)}</div>
        ) : activeAdmins.length === 0 ? (
          <div className="empty"><p>No active platform admins found</p></div>
        ) : (
          <table className="tbl">
            <thead><tr><th>Email</th><th>Granted</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {activeAdmins.map(admin => (
                <tr key={admin.id}>
                  <td className="t-main">{admin.email}</td>
                  <td style={{fontFamily:'var(--font-mono)',fontSize:11,color:'var(--faint)'}}>{new Date(admin.created_at).toLocaleDateString('en-GB')}</td>
                  <td><span className="badge badge-green">Active</span></td>
                  <td><button className="btn btn-outline btn-sm" onClick={() => removeAccess(admin)} disabled={saving}>Remove access</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card card-pad table-card">
        <div className="section-head">
          <div>
            <h3 className="panel-title">Pending platform invites</h3>
            <div className="panel-sub">Invitations that have been sent but not yet accepted</div>
          </div>
        </div>
        {loading ? (
          <div style={{padding:24}}>{[1,2].map(i => <div key={i} className="skel" style={{height:52,marginBottom:8,borderRadius:8}} />)}</div>
        ) : pendingAdmins.length === 0 ? (
          <div className="empty"><p>No pending platform admin invites</p></div>
        ) : (
          <table className="tbl">
            <thead><tr><th>Email</th><th>Invited</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {pendingAdmins.map(admin => (
                <tr key={admin.id}>
                  <td className="t-main">{admin.email}</td>
                  <td style={{fontFamily:'var(--font-mono)',fontSize:11,color:'var(--faint)'}}>{new Date(admin.created_at).toLocaleDateString('en-GB')}</td>
                  <td><span className="badge badge-amber">Pending</span></td>
                  <td>
                    <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
                      <button className="btn btn-outline btn-sm" onClick={() => resendInvite(admin)} disabled={saving}>Resend invite</button>
                      <button className="btn btn-outline btn-sm" onClick={() => removeAccess(admin)} disabled={saving} style={{color:'var(--red)'}}>Delete</button>
                    </div>
                  </td>
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
              <span className="modal-title">Invite platform admin</span>
              <button onClick={() => setModal(false)} style={{background:'none',border:'none',cursor:'pointer',fontSize:20,color:'var(--faint)'}}>x</button>
            </div>
            <div className="modal-body">
              <div style={{display:'flex',flexDirection:'column',gap:14}}>
                <div>
                  <label className="lbl">Email address</label>
                  <input className="inp" type="email" placeholder="colleague@dhwebsiteservices.co.uk" value={email} onChange={e => setEmail(e.target.value)} />
                </div>
              </div>
            </div>
            <div className="modal-ft">
              <button className="btn btn-outline" onClick={() => setModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={sendInvite} disabled={saving || !email.trim()}>{saving ? 'Sending...' : 'Send invite'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
