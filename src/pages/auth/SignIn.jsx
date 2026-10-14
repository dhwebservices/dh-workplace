import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { friendlyError, supabase } from '../../lib/supabase'
import { useWorkspace } from '../../lib/workspace'
import AuthFrame from './AuthFrame'

export default function SignIn() {
  const { user } = useWorkspace()
  const [mode, setMode] = useState('password')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState('')

  if (user) return <Navigate to="/" replace />

  async function submit(event) {
    event.preventDefault()
    setStatus('busy')
    setError('')
    const result = mode === 'password'
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: `${location.origin}/` } })
    if (result.error) {
      setError(friendlyError(result.error))
      setStatus('idle')
    } else {
      setStatus(mode === 'link' ? 'sent' : 'idle')
    }
  }

  async function microsoft() {
    setError('')
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'azure',
      options: { scopes: 'email', redirectTo: `${location.origin}/` },
    })
    if (oauthError) setError(friendlyError(oauthError))
  }

  return (
    <AuthFrame>
      <div>
        <h1>Sign in</h1>
        <p className="sub">Rotas, clock-in and time off for your team.</p>
      </div>
      {status === 'sent' ? (
        <div className="banner info" style={{ margin: 0 }}>
          We’ve emailed a sign-in link to <b>{email}</b>. Open it on this device.
        </div>
      ) : (
        <form className="stack" onSubmit={submit}>
          <label className="field"><span>Email</span>
            <input className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          {mode === 'password' && (
            <label className="field"><span>Password</span>
              <input className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>
          )}
          {error && <p className="form-error">{error}</p>}
          <button className="btn primary lg block" disabled={status === 'busy'}>
            {mode === 'password' ? 'Sign In' : 'Email Me a Sign-in Link'}
          </button>
          <button type="button" className="link-btn" onClick={() => setMode(mode === 'password' ? 'link' : 'password')}>
            {mode === 'password' ? 'Use a sign-in link instead' : 'Use a password instead'}
          </button>
        </form>
      )}
      <div className="divider">or</div>
      <button type="button" className="btn lg block" onClick={microsoft}>
        <svg width="16" height="16" viewBox="0 0 21 21" aria-hidden="true"><rect width="10" height="10" fill="#f25022" /><rect x="11" width="10" height="10" fill="#7fba00" /><rect y="11" width="10" height="10" fill="#00a4ef" /><rect x="11" y="11" width="10" height="10" fill="#ffb900" /></svg>
        Sign in with Microsoft
      </button>
      <p className="form-note">New to Workplace? <Link to="/signup">Create an account</Link></p>
    </AuthFrame>
  )
}
