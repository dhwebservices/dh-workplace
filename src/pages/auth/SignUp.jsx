import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { friendlyError, supabase } from '../../lib/supabase'
import { useWorkspace } from '../../lib/workspace'
import AuthFrame from './AuthFrame'

export default function SignUp() {
  const { user } = useWorkspace()
  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState('')
  const update = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  if (user) return <Navigate to="/" replace />

  async function submit(event) {
    event.preventDefault()
    setStatus('busy')
    setError('')
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: { data: { full_name: form.name }, emailRedirectTo: `${location.origin}/` },
    })
    if (signUpError) {
      setError(friendlyError(signUpError))
      setStatus('idle')
      return
    }
    setStatus(data.session ? 'idle' : 'check-email')
  }

  return (
    <AuthFrame>
      <div>
        <h1>Start your free trial</h1>
        <p className="sub">14 days free, then £5 per person a month. No card needed to start.</p>
      </div>
      {status === 'check-email' ? (
        <div className="banner info" style={{ margin: 0 }}>
          Nearly there. We’ve sent a link to <b>{form.email}</b>. Open it to confirm your email and set up your business.
        </div>
      ) : (
        <form className="stack" onSubmit={submit}>
          <label className="field"><span>Your name</span>
            <input className="input" autoComplete="name" required value={form.name} onChange={update('name')} />
          </label>
          <label className="field"><span>Work email</span>
            <input className="input" type="email" autoComplete="email" required value={form.email} onChange={update('email')} />
          </label>
          <label className="field"><span>Password <em>at least 8 characters</em></span>
            <input className="input" type="password" autoComplete="new-password" minLength={8} required value={form.password} onChange={update('password')} />
          </label>
          {error && <p className="form-error">{error}</p>}
          <button className="btn primary lg block" disabled={status === 'busy'}>Create Account</button>
        </form>
      )}
      <p className="form-note">Been invited by your manager? Sign up with the email they used and you’ll join their rota automatically.</p>
      <p className="form-note">Already have an account? <Link to="/signin">Sign in</Link></p>
    </AuthFrame>
  )
}
