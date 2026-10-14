import { DHMark } from '../../components/Icons'

export default function AuthFrame({ children }) {
  return (
    <div className="auth">
      <div className="auth-form">
        <div className="brand-row"><span className="mark" style={{ background: 'var(--graphite)' }}><DHMark /></span>Workplace</div>
        {children}
      </div>
      <div className="auth-art" aria-hidden="true">
        <img src="/product-rota.jpg" alt="" />
      </div>
    </div>
  )
}
