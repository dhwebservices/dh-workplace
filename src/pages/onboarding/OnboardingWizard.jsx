import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { sbUpdate } from '../../utils/supabase'
import { inviteMember } from '../../utils/invitations'

const STEPS = ['Your profile', 'Invite team', 'Set up billing']

export default function OnboardingWizard() {
  const { user, tenant, tenantUser, refreshTenant } = useAuth()
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)

  // Step 0 state
  const [profile, setProfile] = useState({ full_name: '', job_title: '' })

  // Step 1 state
  const [invites, setInvites] = useState([{ email: '', role: 'staff' }])

  const saveProfile = async () => {
    if (!profile.full_name.trim()) { alert('Please enter your name'); return }
    setSaving(true)
    try {
      await sbUpdate('tenant_users', `user_id=eq.${user.id}`, {
        full_name: profile.full_name,
        job_title: profile.job_title,
      })
      setStep(1)
    } catch(e) { alert(e.message) }
    setSaving(false)
  }

  const saveInvites = async () => {
    // Filter out empty emails
    const valid = invites.filter(i => i.email.trim())
    if (valid.length > 0) {
      setSaving(true)
      try {
        for (const inv of valid) {
          await inviteMember({
            tenant,
            tenantUser: { ...tenantUser, id: tenantUser?.id || user.id, email: tenantUser?.email || user.email, full_name: tenantUser?.full_name },
            email: inv.email,
            role: inv.role,
            fullName: '',
          })
        }
      } catch(e) { console.warn('Invite failed:', e) }
      setSaving(false)
    }
    setStep(2)
  }

  const finish = async () => {
    // If no billing set up, they're on trial — just go to dashboard
    await refreshTenant()
    navigate('/')
  }

  return (
    <div style={{ minHeight:'100vh', background:'var(--bg)', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:20 }}>
      <div style={{ width:'100%', maxWidth:560 }}>

        {/* Header */}
        <div style={{ textAlign:'center', marginBottom:40 }}>
          <div style={{ fontFamily:'var(--font-display)', fontSize:28, marginBottom:8 }}>Welcome to DH Workplace</div>
          <div style={{ fontSize:13, color:'var(--faint)' }}>Let's get your workspace set up — takes under 2 minutes</div>
        </div>

        {/* Step indicators */}
        <div style={{ display:'flex', alignItems:'center', marginBottom:32, gap:0 }}>
          {STEPS.map((s, i) => (
            <div key={i} style={{ flex:1, display:'flex', alignItems:'center' }}>
              <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:4, flex:1 }}>
                <div style={{ width:28, height:28, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700, background: i < step ? 'var(--green)' : i === step ? 'var(--text)' : 'var(--border)', color: i <= step ? '#fff' : 'var(--faint)', transition:'all 0.2s' }}>
                  {i < step ? '✓' : i + 1}
                </div>
                <div style={{ fontSize:11, fontWeight:500, color: i === step ? 'var(--text)' : 'var(--faint)', whiteSpace:'nowrap' }}>{s}</div>
              </div>
              {i < STEPS.length - 1 && <div style={{ height:1, flex:1, background: i < step ? 'var(--green)' : 'var(--border)', marginBottom:20, transition:'background 0.3s' }} />}
            </div>
          ))}
        </div>

        <div className="card card-pad">
          {/* Step 0: Profile */}
          {step === 0 && (
            <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
              <div>
                <h2 style={{ fontFamily:'var(--font-display)', fontSize:22, fontWeight:400, marginBottom:4 }}>Your profile</h2>
                <p style={{ fontSize:13, color:'var(--faint)' }}>Tell your team who you are</p>
              </div>
              <div>
                <label className="lbl">Full Name</label>
                <input className="inp" placeholder="David Hooper" value={profile.full_name} onChange={e => setProfile(p => ({...p, full_name: e.target.value}))} />
              </div>
              <div>
                <label className="lbl">Job Title</label>
                <input className="inp" placeholder="Director" value={profile.job_title} onChange={e => setProfile(p => ({...p, job_title: e.target.value}))} />
              </div>
              <button className="btn btn-primary" onClick={saveProfile} disabled={saving} style={{ alignSelf:'flex-end' }}>
                {saving ? 'Saving...' : 'Continue →'}
              </button>
            </div>
          )}

          {/* Step 1: Invite team */}
          {step === 1 && (
            <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
              <div>
                <h2 style={{ fontFamily:'var(--font-display)', fontSize:22, fontWeight:400, marginBottom:4 }}>Invite your team</h2>
                <p style={{ fontSize:13, color:'var(--faint)' }}>Optional — you can invite people later from Settings</p>
              </div>
              {invites.map((inv, i) => (
                <div key={i} style={{ display:'grid', gridTemplateColumns:'1fr auto', gap:8 }}>
                  <input className="inp" type="email" placeholder={`colleague${i+1}@company.co.uk`} value={inv.email} onChange={e => { const n = [...invites]; n[i].email = e.target.value; setInvites(n) }} />
                  <select className="inp" style={{ width:'auto' }} value={inv.role} onChange={e => { const n = [...invites]; n[i].role = e.target.value; setInvites(n) }}>
                    <option value="admin">Admin</option>
                    <option value="manager">Manager</option>
                    <option value="staff">Staff</option>
                  </select>
                </div>
              ))}
              {invites.length < 4 && (
                <button className="btn btn-outline btn-sm" onClick={() => setInvites(p => [...p, { email:'', role:'staff' }])} style={{ alignSelf:'flex-start' }}>
                  + Add another
                </button>
              )}
              <div style={{ display:'flex', justifyContent:'space-between', marginTop:8 }}>
                <button className="btn btn-outline" onClick={() => setStep(2)}>Skip for now</button>
                <button className="btn btn-primary" onClick={saveInvites} disabled={saving}>
                  {saving ? 'Sending...' : 'Continue →'}
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Billing */}
          {step === 2 && (
            <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
              <div>
                <h2 style={{ fontFamily:'var(--font-display)', fontSize:22, fontWeight:400, marginBottom:4 }}>Set up billing</h2>
                <p style={{ fontSize:13, color:'var(--faint)' }}>Your 14-day free trial has started. Set up Direct Debit now or later — we'll remind you before your trial ends.</p>
              </div>
              <div style={{ background:'var(--gold-soft)', border:'1px solid var(--gold-border)', borderRadius:10, padding:16 }}>
                <div style={{ fontSize:13, fontWeight:600, color:'var(--gold)', marginBottom:4 }}>🎉 Founding Member</div>
                <div style={{ fontSize:13, color:'var(--sub)' }}>You're one of our first customers. Lock in <strong>£9/mo</strong> forever — normal price will be £19/mo.</div>
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                <button className="btn btn-gold btn-lg" onClick={finish} style={{ justifyContent:'center' }}>
                  Set up Direct Debit later →
                </button>
                <button className="btn btn-outline" onClick={finish} style={{ justifyContent:'center', fontSize:12 }}>
                  Skip — go to dashboard
                </button>
              </div>
              <div style={{ fontSize:12, color:'var(--faint)', textAlign:'center' }}>UK Direct Debit via GoCardless · Cancel anytime</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
