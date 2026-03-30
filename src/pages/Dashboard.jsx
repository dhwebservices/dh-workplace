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

  return (
    <div className="fade-in">
      <div className="page-hd">
        <div>
          <h1 className="page-title">{greeting}{tenantUser?.full_name ? `, ${tenantUser.full_name.split(' ')[0]}` : ''}</h1>
          <p className="page-sub">{new Date().toLocaleDateString('en-GB', { weekday:'long', day:'numeric', month:'long', year:'numeric' })}</p>
        </div>
      </div>

      {/* Trial banner */}
      {tenant?.status === 'trialing' && (
        <div style={{ background:'var(--gold-soft)', border:'1px solid var(--gold-border)', borderRadius:12, padding:'16px 20px', marginBottom:24, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div>
            <div style={{ fontSize:14, fontWeight:600, color:'var(--gold)' }}>
              {trialDays > 0 ? `${trialDays} days left in your free trial` : 'Your free trial has ended'}
            </div>
            <div style={{ fontSize:13, color:'var(--sub)', marginTop:2 }}>
              Set up Direct Debit to keep access — Founding Member price: <strong>£9/mo</strong>
            </div>
          </div>
          <Link to="/billing" className="btn btn-gold btn-sm">Set up billing →</Link>
        </div>
      )}

      {/* Stats */}
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
            </div>
          </Link>
        ))}
      </div>

      {/* Quick actions */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
        <div className="card card-pad">
          <h3 style={{ fontFamily:'var(--font-display)', fontSize:18, fontWeight:400, marginBottom:16 }}>Quick Actions</h3>
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {[
              { label:'+ Add team member',  to:'/staff' },
              { label:'+ Add client',       to:'/clients' },
              { label:'+ Create task',      to:'/tasks' },
              { label:'+ Log leave request',to:'/leave' },
            ].map(a => (
              <Link key={a.label} to={a.to} className="btn btn-outline" style={{ justifyContent:'flex-start', borderRadius:8 }}>{a.label}</Link>
            ))}
          </div>
        </div>
        <div className="card card-pad">
          <h3 style={{ fontFamily:'var(--font-display)', fontSize:18, fontWeight:400, marginBottom:16 }}>Workspace</h3>
          <div style={{ fontSize:13, color:'var(--sub)', display:'flex', flexDirection:'column', gap:10 }}>
            <div style={{ display:'flex', justifyContent:'space-between' }}>
              <span style={{ color:'var(--faint)' }}>Plan</span>
              <span className="badge badge-blue" style={{ textTransform:'capitalize' }}>{tenant?.plan || 'starter'}</span>
            </div>
            <div style={{ display:'flex', justifyContent:'space-between' }}>
              <span style={{ color:'var(--faint)' }}>Status</span>
              <span className={`badge badge-${tenant?.status === 'active' || tenant?.status === 'trialing' ? 'green' : 'amber'}`} style={{ textTransform:'capitalize' }}>
                {tenant?.status === 'trialing' ? 'Free Trial' : tenant?.status}
              </span>
            </div>
            <div style={{ display:'flex', justifyContent:'space-between' }}>
              <span style={{ color:'var(--faint)' }}>Seat limit</span>
              <span>{stats.staff} / {tenant?.seat_limit || 5} used</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
