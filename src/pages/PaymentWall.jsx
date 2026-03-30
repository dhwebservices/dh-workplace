import { useAuth } from '../contexts/AuthContext'
import { Link } from 'react-router-dom'

export default function PaymentWall() {
  const { tenant, signOut } = useAuth()
  const isOverdue = tenant?.status === 'overdue'
  const isBlocked = tenant?.status === 'blocked'

  return (
    <div className="payment-wall">
      <div className="payment-wall-card">
        <h1 style={{ fontFamily:'var(--font-display)', fontSize:24, fontWeight:400, marginBottom:8 }}>
          {isOverdue ? 'Payment Required' : isBlocked ? 'Workspace Blocked' : 'Account Suspended'}
        </h1>
        <p style={{ fontSize:14, color:'var(--sub)', marginBottom:24, lineHeight:1.6 }}>
          {isOverdue
            ? 'Your subscription payment failed. Please update your Direct Debit to restore access. Your data is safe and will be available once payment is resolved.'
            : isBlocked
              ? 'This workspace has been blocked by DH Workplace. Please contact support if you believe this is a mistake.'
              : 'Your account has been suspended due to an outstanding payment. Please contact support or update your billing details.'}
        </p>
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {!isBlocked && (
            <Link to="/billing" className="btn btn-primary btn-lg" style={{ justifyContent:'center' }}>
              Update billing
            </Link>
          )}
          <a href="mailto:clients@dhwebsiteservices.co.uk" className="btn btn-outline" style={{ justifyContent:'center' }}>
            Contact Support
          </a>
          <button onClick={signOut} className="btn btn-outline" style={{ justifyContent:'center', fontSize:12, color:'var(--faint)' }}>
            Sign out
          </button>
        </div>
      </div>
    </div>
  )
}
