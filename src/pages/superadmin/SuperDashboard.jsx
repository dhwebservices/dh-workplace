import { useState, useEffect } from 'react'
import { sbGetMany } from '../../utils/supabase'
import { Link } from 'react-router-dom'

export default function SuperDashboard() {
  const [tenants, setTenants] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    sbGetMany('tenants', 'order=created_at.desc').then(data => {
      setTenants(data || [])
      setLoading(false)
    })
  }, [])

  const stats = {
    total:    tenants.length,
    active:   tenants.filter(t => t.status === 'active').length,
    trialing: tenants.filter(t => t.status === 'trialing').length,
    overdue:  tenants.filter(t => t.status === 'overdue' || t.status === 'suspended').length,
    mrr:      tenants.filter(t => t.status === 'active').reduce((sum, t) => {
      const prices = { starter: 9, growth: 24, business: 59 }
      return sum + (prices[t.plan] || 0)
    }, 0),
  }

  return (
    <div className="fade-in page-stack">
      <div className="page-hd">
        <div>
          <h1 className="page-title">Platform Overview</h1>
          <p className="page-sub">Tenant performance, churn watch, and revenue posture</p>
        </div>
      </div>

      <div className="hero-grid">
        <div className="hero-panel">
          <div className="hero-kicker">Platform pulse</div>
          <div className="hero-title">Run every tenant like an operating system, not a spreadsheet.</div>
          <div className="hero-copy">
            Monitor revenue, risky accounts, and new workspaces from one control layer built for monthly SaaS operations.
          </div>
          <div className="hero-actions">
            <Link to="/superadmin/tenants" className="btn btn-primary">Review tenants</Link>
            <Link to="/superadmin/billing" className="btn btn-outline">Open billing view</Link>
          </div>
        </div>
        <div className="hero-panel">
          <div className="hero-kicker">Risk watch</div>
          <div className="hero-list">
            <div className="hero-list-item">
              <span className="hero-list-label">Tenants in trial</span>
              <span className="hero-list-value">{stats.trialing}</span>
            </div>
            <div className="hero-list-item">
              <span className="hero-list-label">Accounts overdue</span>
              <span className="hero-list-value">{stats.overdue}</span>
            </div>
            <div className="hero-list-item">
              <span className="hero-list-label">Monthly recurring revenue</span>
              <span className="hero-list-value">£{stats.mrr}</span>
            </div>
            <div className="hero-list-item">
              <span className="hero-list-label">Active workspaces</span>
              <span className="hero-list-value">{stats.active}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="stats-grid" style={{ gridTemplateColumns:'repeat(5, 1fr)' }}>
        {[
          { label:'Total Tenants',   val: stats.total,    colour:'var(--blue)' },
          { label:'Active',          val: stats.active,   colour:'var(--green)' },
          { label:'In Trial',        val: stats.trialing, colour:'var(--amber)' },
          { label:'Overdue',         val: stats.overdue,  colour:'var(--red)' },
          { label:'MRR',             val: `£${stats.mrr}`, colour:'var(--gold)' },
        ].map(s => (
          <div key={s.label} className="stat-card">
            <div className="stat-val" style={{ color: s.colour, fontSize: typeof s.val === 'string' ? 24 : 32 }}>{s.val}</div>
            <div className="stat-lbl">{s.label}</div>
            <div style={{ marginTop: 8, fontSize: 12, color: 'var(--faint)' }}>Live platform readout</div>
          </div>
        ))}
      </div>

      <div className="card card-pad table-card">
        <div className="section-head">
          <div>
            <h3 className="panel-title">Recent tenants</h3>
            <div className="panel-sub">Newest workspaces and their current state</div>
          </div>
          <Link to="/superadmin/tenants" className="btn btn-outline btn-sm">View all</Link>
        </div>
        {loading ? (
          <div style={{ padding:20 }}>{[1,2,3].map(i=><div key={i} className="skel" style={{ height:48,marginBottom:8,borderRadius:8 }}/>)}</div>
        ) : (
          <table className="tbl">
            <thead><tr><th>Company</th><th>Plan</th><th>Status</th><th>Owner</th><th>Joined</th><th></th></tr></thead>
            <tbody>
              {tenants.slice(0,10).map(t => (
                <tr key={t.id}>
                  <td className="t-main">{t.name}</td>
                  <td><span className="badge badge-blue" style={{ textTransform:'capitalize' }}>{t.plan}</span></td>
                  <td><span className={`badge badge-${t.status==='active'?'green':t.status==='trialing'?'amber':t.status==='overdue'?'red':'grey'}`} style={{ textTransform:'capitalize' }}>{t.status}</span></td>
                  <td style={{ fontSize:12, color:'var(--faint)' }}>{t.owner_email}</td>
                  <td style={{ fontSize:12, fontFamily:'var(--font-mono)', color:'var(--faint)' }}>{new Date(t.created_at).toLocaleDateString('en-GB')}</td>
                  <td><Link to={`/superadmin/tenants/${t.id}`} className="btn btn-outline btn-sm">View</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
