import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../utils/supabase'

export default function AuthCallback() {
  const navigate = useNavigate()

  useEffect(() => {
    // Handle the email confirmation or password reset callback
    supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        // User successfully confirmed email or reset password
        navigate('/', { replace: true })
      } else if (event === 'PASSWORD_RECOVERY') {
        // Redirect to password reset page
        navigate('/reset-password', { replace: true })
      } else if (event === 'USER_UPDATED') {
        // Email confirmed or password changed
        navigate('/', { replace: true })
      }
    })
  }, [navigate])

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 18, color: 'var(--text)', marginBottom: 8 }}>Verifying...</div>
        <div style={{ fontSize: 13, color: 'var(--faint)' }}>Please wait while we confirm your email.</div>
      </div>
    </div>
  )
}
