import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../utils/supabase'

const WORKER_URL = import.meta.env.VITE_WORKER_URL

export default function AcceptPlatformAdmin() {
  const { token } = useParams()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [invite, setInvite] = useState(null)
  const [form, setForm] = useState({ password: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const loadInvite = async () => {
      if (!WORKER_URL || !token) {
        setError('Platform access lookup is unavailable')
        setLoading(false)
        return
      }
      try {
        const res = await fetch(WORKER_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'platform_admin_lookup', data: { token } }),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Unable to load platform access invite')
        setInvite(json)
      } catch (e) {
        setError(e.message || 'Unable to load platform access invite')
      }
      setLoading(false)
    }

    loadInvite()
  }, [token])

  const submit = async (e) => {
    e.preventDefault()
    if (!invite) return
    if (form.password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }

    setSaving(true)
    setError('')
    try {
      let authUser = null
      const signUpRes = await supabase.auth.signUp({
        email: invite.email,
        password: form.password,
      })

      if (signUpRes.error && !/already registered|already been registered/i.test(signUpRes.error.message || '')) {
        throw signUpRes.error
      }

      if (signUpRes.data?.user?.id) {
        authUser = signUpRes.data.user
      } else {
        const signInRes = await supabase.auth.signInWithPassword({
          email: invite.email,
          password: form.password,
        })
        if (signInRes.error) throw new Error('This email already has an account. Sign in with that password to accept platform access.')
        authUser = signInRes.data.user
      }

      if (!authUser?.id) throw new Error('Unable to create or load your account')

      const acceptRes = await fetch(WORKER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'platform_admin_accept',
          data: {
            token,
            user_id: authUser.id,
          },
        }),
      })
      const acceptJson = await acceptRes.json()
      if (!acceptRes.ok) throw new Error(acceptJson.error || 'Unable to accept platform access')

      navigate('/superadmin')
    } catch (e) {
      setError(e.message || 'Unable to accept platform access')
    }
    setSaving(false)
  }

  if (loading) return <div className="spin-wrap"><div className="spin" /></div>

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 440 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, color: 'var(--text)' }}>Platform access</div>
          <div style={{ fontSize: 13, color: 'var(--faint)', marginTop: 4 }}>Accept access to the DH Workplace super admin area</div>
        </div>
        <div className="card card-pad">
          {error && <div style={{ fontSize: 13, color: 'var(--red)', background: 'var(--red-soft)', padding: '10px 14px', borderRadius: 8, marginBottom: 14 }}>{error}</div>}
          {invite ? (
            <form onSubmit={submit}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label className="lbl">Email</label>
                  <input className="inp" value={invite.email} disabled />
                </div>
                <div>
                  <label className="lbl">Password</label>
                  <input className="inp" type="password" value={form.password} onChange={e => setForm(prev => ({ ...prev, password: e.target.value }))} placeholder="Use your account password or create a new one" />
                </div>
                <button className="btn btn-primary" type="submit" disabled={saving} style={{ width: '100%', justifyContent: 'center' }}>
                  {saving ? 'Activating access...' : 'Accept platform access'}
                </button>
              </div>
            </form>
          ) : (
            <div style={{ fontSize: 14, color: 'var(--faint)' }}>This platform admin invitation could not be loaded.</div>
          )}
          <div style={{ textAlign: 'center', marginTop: 18, fontSize: 13 }}>
            <Link to="/signin" style={{ color: 'var(--faint)', textDecoration: 'none' }}>Back to sign in</Link>
          </div>
        </div>
      </div>
    </div>
  )
}
