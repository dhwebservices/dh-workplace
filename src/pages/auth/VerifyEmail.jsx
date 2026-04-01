import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../../utils/supabase'

const COPY = {
  loading: {
    title: 'Verifying your email',
    body: 'Please wait while we confirm your DH Workplace account.',
  },
  success: {
    title: 'Email confirmed',
    body: 'Your email has been verified successfully. You can continue into DH Workplace now.',
  },
  error: {
    title: 'Verification link issue',
    body: 'This verification link is missing information, has expired, or has already been used.',
  },
}

export default function VerifyEmail() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [status, setStatus] = useState('loading')
  const [message, setMessage] = useState(COPY.loading.body)

  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type') || 'email'

  useEffect(() => {
    let cancelled = false

    const verify = async () => {
      if (!tokenHash) {
        if (!cancelled) {
          setStatus('error')
          setMessage('This confirmation link is incomplete. Request a new verification email and try again.')
        }
        return
      }

      const { error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type,
      })

      if (cancelled) return

      if (error) {
        setStatus('error')
        setMessage(error.message || 'We could not verify this email link.')
        return
      }

      setStatus('success')
      setMessage(COPY.success.body)
    }

    verify()
    return () => { cancelled = true }
  }, [tokenHash, type])

  const primaryAction = useMemo(() => {
    if (status === 'success') {
      return {
        label: 'Continue to DH Workplace',
        action: () => navigate('/', { replace: true }),
      }
    }
    return {
      label: 'Back to sign in',
      action: () => navigate('/signin', { replace: true }),
    }
  }, [navigate, status])

  const tone = status === 'success' ? 'var(--green)' : status === 'error' ? 'var(--red)' : 'var(--blue)'
  const background = status === 'success' ? 'var(--green-soft)' : status === 'error' ? 'var(--red-soft)' : 'var(--blue-soft)'

  return (
    <div style={{ minHeight:'100vh', background:'var(--bg)', display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
      <div style={{ width:'100%', maxWidth:440 }}>
        <div style={{ textAlign:'center', marginBottom:32 }}>
          <div style={{ fontFamily:'var(--font-display)', fontSize:28, color:'var(--text)' }}>DH Workplace</div>
          <div style={{ fontSize:13, color:'var(--faint)', marginTop:4 }}>Account verification</div>
        </div>

        <div className="card card-pad" style={{ display:'flex', flexDirection:'column', gap:18 }}>
          <div style={{ width:52, height:52, borderRadius:16, background, border:`1px solid ${tone}`, display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, color:tone, fontSize:18 }}>
            {status === 'success' ? 'OK' : status === 'error' ? '!' : '...'}
          </div>

          <div>
            <h1 style={{ fontFamily:'var(--font-display)', fontSize:28, lineHeight:1.1, margin:'0 0 8px', fontWeight:700 }}>
              {COPY[status].title}
            </h1>
            <p style={{ margin:0, fontSize:14, lineHeight:1.6, color:'var(--sub)' }}>
              {message}
            </p>
          </div>

          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            <button className="btn btn-primary btn-lg" onClick={primaryAction.action} style={{ width:'100%', justifyContent:'center' }}>
              {primaryAction.label}
            </button>
            <Link to="/signin" style={{ textAlign:'center', fontSize:13, color:'var(--faint)', textDecoration:'none' }}>
              Open sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
