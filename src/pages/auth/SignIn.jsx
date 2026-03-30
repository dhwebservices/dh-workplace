import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { sbGet, supabase } from '../../utils/supabase'

export default function SignIn() {
  const navigate = useNavigate()
  const [form, setForm] = useState({ email: '', password: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    setLoading(true); setError('')
    const { data, error: err } = await supabase.auth.signInWithPassword({ email: form.email, password: form.password })
    if (err) { setError(err.message); setLoading(false); return }

    try {
      const authUser = data?.user
      if (authUser) {
        const [tenantUser, platformAdmin] = await Promise.all([
          sbGet('tenant_users', `user_id=eq.${authUser.id}`),
          sbGet('platform_admins', `user_id=eq.${authUser.id}`),
        ])

        if (tenantUser && !platformAdmin) {
          const tenant = await sbGet('tenants', `id=eq.${tenantUser.tenant_id}`)
          if (tenant?.status === 'blocked' || tenant?.status === 'suspended') {
            await supabase.auth.signOut()
            setError('This workspace has been blocked. Please contact DH Workplace support.')
            setLoading(false)
            return
          }
          if (tenant?.status === 'cancelled') {
            await supabase.auth.signOut()
            setError('This workspace is no longer active. Please contact support if you believe this is a mistake.')
            setLoading(false)
            return
          }
        }
      }
    } catch (checkError) {
      await supabase.auth.signOut()
      setError('We could not verify your workspace access. Please try again.')
      setLoading(false)
      return
    }

    navigate('/')
  }

  return (
    <div style={{ minHeight:'100vh', background:'var(--bg)', display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
      <div style={{ width:'100%', maxWidth:400 }}>
        <div style={{ textAlign:'center', marginBottom:32 }}>
          <div style={{ fontFamily:'var(--font-display)', fontSize:28, color:'var(--text)' }}>DH Workplace</div>
          <div style={{ fontSize:13, color:'var(--faint)', marginTop:4 }}>Sign in to your workspace</div>
        </div>
        <div className="card card-pad">
          <form onSubmit={submit}>
            <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
              <div>
                <label className="lbl">Email</label>
                <input className="inp" type="email" placeholder="you@company.co.uk" value={form.email} onChange={e => setForm(p => ({...p, email: e.target.value}))} />
              </div>
              <div>
                <label className="lbl">Password</label>
                <input className="inp" type="password" placeholder="Your password" value={form.password} onChange={e => setForm(p => ({...p, password: e.target.value}))} />
              </div>
              {error && <div style={{ fontSize:13, color:'var(--red)', background:'var(--red-soft)', padding:'10px 14px', borderRadius:8 }}>{error}</div>}
              <button className="btn btn-primary" type="submit" disabled={loading} style={{ width:'100%', justifyContent:'center' }}>
                {loading ? 'Signing in...' : 'Sign in'}
              </button>
              <Link to="/forgot" style={{ textAlign:'center', fontSize:13, color:'var(--faint)', textDecoration:'none' }}>Forgot password?</Link>
            </div>
          </form>
        </div>
        <div style={{ textAlign:'center', marginTop:20, fontSize:13, color:'var(--faint)' }}>
          Don't have an account? <Link to="/signup" style={{ color:'var(--blue)', textDecoration:'none' }}>Start free trial</Link>
        </div>
      </div>
    </div>
  )
}
