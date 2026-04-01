import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase, sbGet, sbInsert } from '../../utils/supabase'
import { markOnboardingPending } from '../../utils/onboarding'
import { friendlyAuthError } from '../../utils/authErrors'
import { PLANS } from '../../utils/entitlements'

const WORKER_URL = import.meta.env.VITE_WORKER_URL

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export default function SignUp() {
  const navigate = useNavigate()
  const [form, setForm] = useState({ company: '', email: '', password: '', plan: 'growth' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const sf = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const submit = async (e) => {
    e.preventDefault()
    if (!form.company.trim() || !form.email.trim() || !form.password) {
      setError('All fields are required'); return
    }
    if (form.password.length < 8) {
      setError('Password must be at least 8 characters'); return
    }
    setLoading(true); setError('')
    try {
      const normalizedEmail = form.email.trim().toLowerCase()
      const platformInvite = await sbGet('platform_admins', `email=eq.${encodeURIComponent(normalizedEmail)}`)
      if (platformInvite) {
        throw new Error('This email has platform admin access waiting. Use the platform invite link or sign in instead of starting a tenant trial.')
      }

      // 1. Create auth user
      const { data: authData, error: authErr } = await supabase.auth.signUp({
        email: normalizedEmail,
        password: form.password,
        options: {
          emailRedirectTo: window.location.origin,
        },
      })
      if (authErr) throw authErr
      const userId = authData.user?.id
      const hasSession = !!authData.session
      if (!userId) throw new Error('Sign up failed — please try again')

      // 2. Create tenant
      const tenantId = crypto.randomUUID()
      const slug = slugify(form.company) + '-' + Math.random().toString(36).slice(2, 6)
      await sbInsert('tenants', {
        id:            tenantId,
        name:          form.company,
        slug,
        plan:          form.plan,
        seat_limit:    PLANS[form.plan]?.max_users || 5,
        owner_email:   normalizedEmail,
        status:        'pending_activation',
        trial_ends_at: null,
        created_at:    new Date().toISOString(),
      })

      // 3. Create tenant_user (owner)
      await sbInsert('tenant_users', {
        tenant_id:  tenantId,
        user_id:    userId,
        role:       'owner',
        email:      normalizedEmail,
        full_name:  '',
        status:     'active',
        joined_at:  new Date().toISOString(),
        created_at: new Date().toISOString(),
      })

      markOnboardingPending(userId)

      if (WORKER_URL) {
        fetch(WORKER_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'welcome',
            data: {
              to_email: form.email,
              name: form.email.split('@')[0],
              company: form.company,
              plan: PLANS[form.plan]?.name || 'Starter',
              url: `${window.location.origin}/signin`,
            },
          }),
        }).catch(() => {})
      }

      if (hasSession) {
        navigate('/onboarding')
      } else {
        navigate('/signin', {
          replace: true,
          state: {
            message: 'Check your email to confirm your account, then sign in to continue setting up your workspace.',
          },
        })
      }
    } catch (err) {
      setError(friendlyAuthError(err.message, 'Something went wrong'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight:'100vh', background:'var(--bg)', display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
      <div style={{ width:'100%', maxWidth:420 }}>
        {/* Logo */}
        <div style={{ textAlign:'center', marginBottom:32 }}>
          <div style={{ fontFamily:'var(--font-display)', fontSize:28, color:'var(--text)' }}>DH Workplace</div>
          <div style={{ fontSize:13, color:'var(--faint)', marginTop:4 }}>Create your workspace and activate billing in onboarding</div>
        </div>

        {/* Founding member badge */}
        <div style={{ background:'var(--gold-soft)', border:'1px solid var(--gold-border)', borderRadius:10, padding:'10px 16px', marginBottom:24, textAlign:'center' }}>
          <span style={{ fontSize:12, color:'var(--gold)', fontWeight:600 }}>Founding Member Offer — Activate now and lock in launch pricing forever</span>
        </div>

        <div className="card card-pad">
          <form onSubmit={submit}>
            <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
              <div>
                <label className="lbl">Company Name</label>
                <input className="inp" placeholder="Acme Ltd" value={form.company} onChange={e => sf('company', e.target.value)} />
              </div>
              <div>
                <label className="lbl">Work Email</label>
                <input className="inp" type="email" placeholder="you@company.co.uk" value={form.email} onChange={e => sf('email', e.target.value)} />
              </div>
              <div>
                <label className="lbl">Password</label>
                <input className="inp" type="password" placeholder="Min. 8 characters" value={form.password} onChange={e => sf('password', e.target.value)} />
              </div>
              <div>
                <label className="lbl">Choose Plan</label>
                <div style={{ display:'grid', gap:10 }}>
                  {Object.entries(PLANS).map(([key, plan]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => sf('plan', key)}
                      style={{
                        width:'100%',
                        textAlign:'left',
                        padding:'14px 16px',
                        borderRadius:12,
                        border:`2px solid ${form.plan === key ? 'var(--blue)' : 'var(--border)'}`,
                        background: form.plan === key ? 'rgba(53,103,200,0.08)' : '#fff',
                        cursor:'pointer',
                      }}
                    >
                      <div style={{ display:'flex', justifyContent:'space-between', gap:12, alignItems:'baseline' }}>
                        <div style={{ fontSize:15, fontWeight:700, color:'var(--text)' }}>{plan.name}</div>
                        <div style={{ fontSize:18, fontWeight:700, color:'var(--gold)' }}>£{plan.launch_price}<span style={{ fontSize:12, color:'var(--faint)', fontWeight:500 }}>/mo</span></div>
                      </div>
                      <div style={{ fontSize:12, color:'var(--faint)', marginTop:4 }}>Up to {plan.max_users} users</div>
                      <div style={{ fontSize:12, color:'var(--sub)', marginTop:8 }}>
                        {plan.features.slice(0, 3).map((feature) => ({
                          hr_directory: 'Staff directory',
                          hr_leave: 'Leave management',
                          hr_documents: 'Documents and policies',
                          hr_timesheets: 'Timesheets',
                          hr_onboarding: 'HR onboarding',
                          crm_clients: 'Client CRM',
                          crm_tasks: 'Tasks',
                          crm_pipeline: 'Sales pipeline',
                          crm_outreach: 'Outreach',
                          notifications: 'Notifications',
                          audit_log: 'Audit log',
                          reports: 'Reports',
                          client_portal: 'Client portal',
                          custom_branding: 'Custom branding',
                          api_access: 'API access',
                        }[feature] || feature)).join(' • ')}
                        {plan.features.length > 3 ? ` • +${plan.features.length - 3} more` : ''}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
              {error && <div style={{ fontSize:13, color:'var(--red)', background:'var(--red-soft)', padding:'10px 14px', borderRadius:8 }}>{error}</div>}
              <button className="btn btn-primary btn-lg" type="submit" disabled={loading} style={{ width:'100%', justifyContent:'center', marginTop:4 }}>
                {loading ? 'Creating your workspace...' : 'Create workspace'}
              </button>
            </div>
          </form>
          <div style={{ textAlign:'center', marginTop:16, fontSize:13, color:'var(--faint)' }}>
            Billing is set up during onboarding · Cancel anytime
          </div>
        </div>

        <div style={{ textAlign:'center', marginTop:20, fontSize:13, color:'var(--faint)' }}>
          Already have an account? <Link to="/signin" style={{ color:'var(--blue)', textDecoration:'none' }}>Sign in</Link>
        </div>
      </div>
    </div>
  )
}
