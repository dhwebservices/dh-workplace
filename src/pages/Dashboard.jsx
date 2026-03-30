import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { sbGetMany } from '../utils/supabase'
import { getTrialDaysLeft } from '../utils/entitlements'
import { Link } from 'react-router-dom'

export default function Dashboard() {
  const { tenant, tenantUser } = useAuth()
  const [stats, setStats] = useState({ staff: 0, clients: 0, tasks: 0, leaves: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!tenant?.id) return
    const tid = `tenant_id=eq.${tenant.id}`
    Promise.all([
      sbGetMany('tenant_users', tid),
      sbGetMany('clients', tid),
      sbGetMany('tasks', `${tid}&status=neq.done`),
      sbGetMany('leave_requests', `${tid}&status=eq.pending`),
    ]).then(([staff, clients, tasks, leaves]) => {
      setStats({ staff: staff.length, clients: clients.length, tasks: tasks.length, leaves: leaves.length })
      setLoading(false)
    })
  }, [tenant?.id])

  const trialDays = getTrialDaysLeft(tenant)
  const greeting = new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 17 ? 'Good afternoon' : 'Good evening'
  const activeStatus = tenant?.status === 'trialing' ? 'Trial workspace' : tenant?.status === 'active' ? 'Subscription active' : 'Billing attention'

  return (
    <div className="fade-in page-stack">
      <div className="page-hd">
        <div>
          <h1 className="page-title">{greeting}{tenantUser?.full_name ? `, ${tenantUser.full_name.split(' ')[0]}` : ''}</h1>
          <p className="page-sub">{new Date().toLocaleDateString('en-GB', { weekday:'long', day:'numeric', month:'long', year:'numeric' })} · Everything important in one place</p>
        </div>
      </div>

      <div className="hero-grid">
        <div className="hero-panel">
          <div className="hero-kicker">Workspace health</div>
          <div className="hero-title">{tenant?.name || 'Your workspace'} is moving.</div>
          <div className="hero-copy">
            Track people, client work, billing readiness, and operational follow-through from a single command centre.
          </div>
          <div className="status-band">
            <span className="badge badge-blue" style={{ textTransform:'capitalize' }}>{tenant?.plan || 'starter'} plan</span>
            <span className={`badge badge-${tenant?.status === 'trialing' ? 'amber' : tenant?.status === 'active' ? 'green' : 'red'}`}>{activeStatus}</span>
            <span className="status-pill">{stats.staff} of {tenant?.seat_limit || 5} seats in use</span>
          </div>
          <div className="hero-actions">
            <Link to="/team" className="btn btn-primary">Manage team</Link>
            <Link to="/billing" className="btn btn-outline">{tenant?.gc_mandate_id ? 'Review billing' : 'Set up billing'}</Link>
            <Link to="/tasks" className="btn btn-outline">Open task board</Link>
          </div>
        </div>
        <div className="hero-panel">
          <div className="hero-kicker">At a glance</div>
          <div className="hero-list">
            <div className="hero-list-item">
              <span className="hero-list-label">Team health</span>
              <span className="hero-list-value">{stats.staff} active records</span>
            </div>
            <div className="hero-list-item">
              <span className="hero-list-label">Client workload</span>
              <span className="hero-list-value">{stats.tasks} open tasks across {stats.clients} clients</span>
            </div>
            <div className="hero-list-item">
              <span className="hero-list-label">Approvals</span>
              <span className="hero-list-value">{stats.leaves} leave request{stats.leaves !== 1 ? 's' : ''} pending</span>
            </div>
            <div className="hero-list-item">
              <span className="hero-list-label">Billing state</span>
              <span className="hero-list-value">{tenant?.gc_subscription_id ? 'Subscription live' : tenant?.gc_mandate_id ? 'Mandate saved' : 'Direct Debit not set'}</span>
            </div>
          </div>
        </div>
      </div>

      {tenant?.status === 'trialing' && (
        <div className="card card-pad" style={{ borderColor:'var(--gold-border)', background:'linear-gradient(180deg, rgba(185,150,63,0.12), rgba(255,255,255,0.9))' }}>
          <div>
            <div style={{ fontSize:14, fontWeight:600, color:'var(--gold)' }}>
              {trialDays > 0 ? `${trialDays} days left in your free trial` : 'Your free trial has ended'}
            </div>
            <div style={{ fontSize:13, color:'var(--sub)', marginTop:2 }}>
              Set up Direct Debit to keep access — Founding Member price: <strong>£9/mo</strong>
            </div>
          </div>
          <div className="hero-actions" style={{ marginTop:14 }}>
            <Link to="/billing" className="btn btn-gold btn-sm">Set up billing</Link>
            <Link to="/billing" className="btn btn-outline btn-sm">Compare plans</Link>
          </div>
        </div>
      )}

      <div className="stats-grid">
        {[
          { label: 'Team Members', val: stats.staff,   link: '/staff',   colour: 'var(--blue)' },
          { label: 'Active Clients', val: stats.clients, link: '/clients', colour: 'var(--green)' },
          { label: 'Open Tasks',   val: stats.tasks,   link: '/tasks',   colour: 'var(--amber)' },
          { label: 'Pending Leave', val: stats.leaves, link: '/leave',   colour: 'var(--red)' },
        ].map(s => (
          <Link key={s.label} to={s.link} style={{ textDecoration:'none' }}>
            <div className="stat-card" style={{ cursor:'pointer', transition:'all 0.2s' }}
              onMouseOver={e => { e.currentTarget.style.borderColor = s.colour; e.currentTarget.style.transform = 'translateY(-2px)' }}
              onMouseOut={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.transform = 'none' }}>
              {loading
                ? <div className="skel" style={{ width:48, height:40, marginBottom:8 }} />
                : <div className="stat-val" style={{ color: s.colour }}>{s.val}</div>
              }
              <div className="stat-lbl">{s.label}</div>
              <div style={{ marginTop:10, fontSize:13, color:'var(--sub)' }}>Open</div>
            </div>
          </Link>
        ))}
      </div>

      <div className="asymmetric-grid">
        <div className="card card-pad">
          <div className="section-head">
            <div>
              <h3 className="panel-title">Quick actions</h3>
              <div className="panel-sub">The most common workspace moves</div>
            </div>
          </div>
          <div className="stack-sm">
            {[
              { label:'Add team member',  to:'/staff', note:'Invite a new person and assign their role' },
              { label:'Add client',       to:'/clients', note:'Create a client account and assign ownership' },
              { label:'Create task',      to:'/tasks', note:'Capture operational work and due dates' },
              { label:'Log leave request',to:'/leave', note:'Submit or review upcoming time away' },
            ].map(a => (
              <Link key={a.label} to={a.to} className="list-card" style={{ textDecoration:'none' }}>
                <div style={{ fontSize:14, fontWeight:600, color:'var(--text)' }}>{a.label}</div>
                <div style={{ fontSize:12, color:'var(--faint)', marginTop:4 }}>{a.note}</div>
              </Link>
            ))}
          </div>
        </div>
        <div className="card card-pad">
          <div className="section-head">
            <div>
              <h3 className="panel-title">Workspace summary</h3>
              <div className="panel-sub">Commercial and operational readiness</div>
            </div>
          </div>
          <div className="stack-md">
            <div className="detail-row">
              <span className="detail-row-label">Plan</span>
              <span className="badge badge-blue" style={{ textTransform:'capitalize' }}>{tenant?.plan || 'starter'}</span>
            </div>
            <div className="detail-row">
              <span className="detail-row-label">Status</span>
              <span className={`badge badge-${tenant?.status === 'active' || tenant?.status === 'trialing' ? 'green' : 'amber'}`} style={{ textTransform:'capitalize' }}>
                {tenant?.status === 'trialing' ? 'Free Trial' : tenant?.status}
              </span>
            </div>
            <div className="detail-row">
              <span className="detail-row-label">Seat limit</span>
              <span className="detail-row-value">{stats.staff} / {tenant?.seat_limit || 5} used</span>
            </div>
            <div className="detail-row">
              <span className="detail-row-label">Billing</span>
              <span className="detail-row-value">{tenant?.gc_subscription_id ? 'Subscription live' : tenant?.gc_mandate_id ? 'Mandate saved' : 'Action needed'}</span>
            </div>
            <div className="detail-row">
              <span className="detail-row-label">Focus</span>
              <span className="detail-row-value">{stats.tasks > 0 ? `${stats.tasks} open tasks` : 'No urgent task backlog'}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
