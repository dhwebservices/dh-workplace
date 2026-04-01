import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../utils/supabase'

const WORKER_URL = import.meta.env.VITE_WORKER_URL

export default function AcceptInvite() {
  const { token } = useParams()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [invitation, setInvitation] = useState(null)
  const [form, setForm] = useState({ full_name: '', password: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const loadInvite = async () => {
      if (!WORKER_URL || !token) {
        setError('Invitation lookup is unavailable')
        setLoading(false)
        return
      }
      try {
        const res = await fetch(WORKER_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'invite_lookup', data: { token } }),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Unable to load invitation')
        setInvitation(json)
        setForm(prev => ({ ...prev, full_name: json.invitation.full_name || '' }))
      } catch (e) {
        setError(e.message || 'Unable to load invitation')
      }
      setLoading(false)
    }

    loadInvite()
  }, [token])

  const submit = async (e) => {
    e.preventDefault()
    if (!invitation) return
    if (form.password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }
    setSaving(true)
    setError('')
    try {
      let authUser = null
      let hasSession = false

      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: invitation.invitation.email,
        password: form.password,
        options: {
          emailRedirectTo: `${window.location.origin}/signin`,
        },
      })

      if (signUpError) {
        const message = signUpError.message || ''
        if (/already registered|already been registered|user already registered/i.test(message)) {
          const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
            email: invitation.invitation.email,
            password: form.password,
          })
          if (signInError) throw new Error('This invited email already has an account. Sign in with its existing password or reset it first.')
          authUser = signInData.user
          hasSession = !!signInData.session
        } else {
          throw signUpError
        }
      } else {
        authUser = signUpData.user
        hasSession = !!signUpData.session
      }

      const userId = authUser?.id
      if (!userId) throw new Error('Account creation failed')

      const acceptRes = await fetch(WORKER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'invite_accept',
          data: {
            token,
            user_id: userId,
            full_name: form.full_name,
          },
        }),
      })
      const acceptJson = await acceptRes.json()
      if (!acceptRes.ok) throw new Error(acceptJson.error || 'Unable to accept invitation')

      if (hasSession) {
        navigate('/')
      } else {
        navigate('/signin', {
          replace: true,
          state: {
            message: 'Your invitation has been accepted. Confirm your email, then sign in to access the workspace.',
          },
        })
      }
    } catch (e) {
      setError(e.message || 'Unable to accept invitation')
    }
    setSaving(false)
  }

  if (loading) return <div className="spin-wrap"><div className="spin"/></div>

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 440 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, color: 'var(--text)' }}>Accept invitation</div>
          {invitation?.tenant && <div style={{ fontSize: 13, color: 'var(--faint)', marginTop: 4 }}>Join {invitation.tenant.name} on DH Workplace</div>}
        </div>
        <div className="card card-pad">
          {error && <div style={{ fontSize: 13, color: 'var(--red)', background: 'var(--red-soft)', padding: '10px 14px', borderRadius: 8, marginBottom: 14 }}>{error}</div>}
          {invitation ? (
            <form onSubmit={submit}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label className="lbl">Invited email</label>
                  <input className="inp" value={invitation.invitation.email} disabled />
                </div>
                <div>
                  <label className="lbl">Full name</label>
                  <input className="inp" value={form.full_name} onChange={e => setForm(prev => ({ ...prev, full_name: e.target.value }))} />
                </div>
                <div>
                  <label className="lbl">Password</label>
                  <input className="inp" type="password" value={form.password} onChange={e => setForm(prev => ({ ...prev, password: e.target.value }))} placeholder="At least 8 characters" />
                </div>
                <button className="btn btn-primary" type="submit" disabled={saving} style={{ width: '100%', justifyContent: 'center' }}>
                  {saving ? 'Joining workspace...' : 'Accept invitation'}
                </button>
              </div>
            </form>
          ) : (
            <div style={{ fontSize: 14, color: 'var(--faint)' }}>This invitation could not be loaded.</div>
          )}
          <div style={{ textAlign: 'center', marginTop: 18, fontSize: 13 }}>
            <Link to="/signin" style={{ color: 'var(--faint)', textDecoration: 'none' }}>Back to sign in</Link>
          </div>
        </div>
      </div>
    </div>
  )
}
