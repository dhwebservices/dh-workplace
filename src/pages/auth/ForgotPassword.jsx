import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../utils/supabase'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    if (!email.trim()) {
      setError('Please enter your email address')
      return
    }
    setLoading(true)
    setError('')
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/signin`,
    })
    if (resetError) {
      setError(resetError.message)
      setLoading(false)
      return
    }
    setSent(true)
    setLoading(false)
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 420 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, color: 'var(--text)' }}>Reset password</div>
          <div style={{ fontSize: 13, color: 'var(--faint)', marginTop: 4 }}>We’ll send you a secure reset link</div>
        </div>
        <div className="card card-pad">
          <form onSubmit={submit}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label className="lbl">Email</label>
                <input className="inp" type="email" placeholder="you@company.co.uk" value={email} onChange={e => setEmail(e.target.value)} />
              </div>
              {error && <div style={{ fontSize: 13, color: 'var(--red)', background: 'var(--red-soft)', padding: '10px 14px', borderRadius: 8 }}>{error}</div>}
              {sent && <div style={{ fontSize: 13, color: 'var(--green)', background: 'var(--green-soft)', padding: '10px 14px', borderRadius: 8 }}>Reset link sent. Check your inbox.</div>}
              <button className="btn btn-primary" type="submit" disabled={loading} style={{ width: '100%', justifyContent: 'center' }}>
                {loading ? 'Sending...' : 'Send reset link'}
              </button>
            </div>
          </form>
          <div style={{ textAlign: 'center', marginTop: 18, fontSize: 13 }}>
            <Link to="/signin" style={{ color: 'var(--faint)', textDecoration: 'none' }}>Back to sign in</Link>
          </div>
        </div>
      </div>
    </div>
  )
}
