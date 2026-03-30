import { useState, useEffect, useMemo } from 'react'
import { sbGetMany } from '../../utils/supabase'
import { Link } from 'react-router-dom'

export default function SuperDashboard() {
  const [tenants, setTenants] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

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
    overdue:  tenants.filter(t => t.status === 'overdue' || t.status === 'suspended' || t.status === 'blocked').length,
    mrr:      tenants.filter(t => t.status === 'active').reduce((sum, t) => {
      const prices = { starter: 9, growth: 24, business: 59 }
      return sum + (prices[t.plan] || 0)
    }, 0),
  }

  const now = Date.now()
  const threeDaysFromNow = now + 3 * 86400000
  const attention = {
    blocked: tenants.filter(t => t.status === 'blocked'),
    overdue: tenants.filter(t => t.status === 'overdue' || t.status === 'suspended'),
    endingTrial: tenants.filter(t => t.status === 'trialing' && t.trial_ends_at && new Date(t.trial_ends_at).getTime() <= threeDaysFromNow),
    noMandate: tenants.filter(t => t.status !== 'cancelled' && !t.gc_mandate_id),
    seatRisk: tenants.filter(t => (t.seat_limit || 5) <= 1),
    soloOwner: tenants.filter(t => t.status !== 'cancelled').filter(t => !t.gc_mandate_id || !t.gc_subscription_id),
  }

  const alerts = [
    { label: 'Blocked tenants', items: attention.blocked, tone: 'red', note: 'Cannot sign in until unblocked' },
    { label: 'Billing at risk', items: attention.overdue, tone: 'red', note: 'Overdue or suspended workspaces' },
    { label: 'Trials ending soon', items: attention.endingTrial, tone: 'amber', note: 'Trial ends within 3 days' },
    { label: 'No mandate set', items: attention.noMandate, tone: 'amber', note: 'No Direct Debit mandate on file' },
  ].filter(section => section.items.length > 0)
  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return []
    return tenants.filter(tenant =>
      tenant.name?.toLowerCase().includes(q) ||
      tenant.owner_email?.toLowerCase().includes(q) ||
      tenant.slug?.toLowerCase().includes(q)
    ).slice(0, 6)
  }, [search, tenants])

  return (
    <div className="fade-in page-stack">
      <div className="page-hd">
        <div>
          <h1 className="page-title">Platform Overview</h1>
          <p className="page-sub">Tenant performance, churn watch, and revenue posture</p>
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

      <div className="table-toolbar">
        <div className="compact-note">Review tenants, revenue, and risk from one platform-level view.</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link to="/superadmin/tenants" className="btn btn-primary btn-sm">Review tenants</Link>
          <Link to="/superadmin/billing" className="btn btn-outline btn-sm">Open billing view</Link>
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1.05fr 0.95fr', gap:20 }}>
        <div className="card card-pad">
          <div className="section-head">
            <div>
              <h3 className="panel-title">Needs attention</h3>
              <div className="panel-sub">The tenant issues most likely to need follow-up today</div>
            </div>
            <span className={`badge badge-${alerts.length > 0 ? 'red' : 'green'}`}>{alerts.length > 0 ? `${alerts.length} live alerts` : 'Clear'}</span>
          </div>
          {loading ? (
            <div style={{ padding:20 }}>{[1,2,3].map(i => <div key={i} className="skel" style={{ height:54, marginBottom:10, borderRadius:10 }} />)}</div>
          ) : alerts.length === 0 ? (
            <div style={{padding:'14px 16px',borderRadius:12,background:'var(--green-soft)',border:'1px solid var(--green)',color:'var(--green)',fontSize:13}}>
              No priority platform alerts right now.
            </div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
              {alerts.map(section => (
                <div key={section.label} style={{ border:'1px solid var(--border)', borderRadius:12, padding:'14px 16px', background:'var(--card)' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', gap:12, marginBottom:8 }}>
                    <div>
                      <div style={{ fontSize:14, fontWeight:700 }}>{section.label}</div>
                      <div style={{ fontSize:12, color:'var(--faint)' }}>{section.note}</div>
                    </div>
                    <span className={`badge badge-${section.tone}`}>{section.items.length}</span>
                  </div>
                  <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                    {section.items.slice(0, 3).map(tenant => (
                      <div key={`${section.label}-${tenant.id}`} style={{ display:'flex', justifyContent:'space-between', gap:12, alignItems:'center' }}>
                        <div>
                          <div style={{ fontSize:13, fontWeight:600 }}>{tenant.name}</div>
                          <div style={{ fontSize:11, color:'var(--faint)', fontFamily:'var(--font-mono)' }}>{tenant.owner_email}</div>
                        </div>
                        <Link to={`/superadmin/tenants/${tenant.id}`} className="btn btn-outline btn-sm">Open</Link>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card card-pad">
          <div className="section-head">
            <div>
              <h3 className="panel-title">Platform watchlist</h3>
              <div className="panel-sub">Commercial and operational signals across the current tenant base</div>
            </div>
          </div>
          <div style={{ marginBottom:16 }}>
            <label className="lbl">Global search</label>
            <input className="inp" placeholder="Search company, owner email, or slug" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          {search.trim() && (
            <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:16 }}>
              {searchResults.length === 0 ? (
                <div style={{ fontSize:13, color:'var(--faint)' }}>No tenants matched your search.</div>
              ) : (
                searchResults.map(tenant => (
                  <div key={`search-${tenant.id}`} style={{ display:'flex', justifyContent:'space-between', gap:12, alignItems:'center', padding:'10px 12px', border:'1px solid var(--border)', borderRadius:10, background:'var(--bg)' }}>
                    <div>
                      <div style={{ fontSize:13, fontWeight:600 }}>{tenant.name}</div>
                      <div style={{ fontSize:11, color:'var(--faint)', fontFamily:'var(--font-mono)' }}>{tenant.owner_email}</div>
                    </div>
                    <Link to={`/superadmin/tenants/${tenant.id}`} className="btn btn-outline btn-sm">Open</Link>
                  </div>
                ))
              )}
            </div>
          )}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            {[
              { label:'Trials ending soon', value: attention.endingTrial.length, note:'Upgrade prompts needed', tone:'var(--amber)' },
              { label:'No mandate', value: attention.noMandate.length, note:'Billing setup incomplete', tone:'var(--gold)' },
              { label:'Blocked / suspended', value: attention.blocked.length + attention.overdue.length, note:'Access or payment issue', tone:'var(--red)' },
              { label:'Active revenue', value: `£${stats.mrr}`, note:`${stats.active} active tenants`, tone:'var(--green)' },
            ].map(item => (
              <div key={item.label} style={{ padding:'16px', border:'1px solid var(--border)', borderRadius:12, background:'var(--bg)' }}>
                <div style={{ fontSize:24, fontWeight:700, color:item.tone }}>{item.value}</div>
                <div style={{ fontSize:12, textTransform:'uppercase', letterSpacing:'0.08em', color:'var(--faint)', marginTop:8 }}>{item.label}</div>
                <div style={{ fontSize:12, color:'var(--sub)', marginTop:6 }}>{item.note}</div>
              </div>
            ))}
          </div>
        </div>
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
                  <td><span className={`badge badge-${t.status==='active'?'green':t.status==='trialing'?'amber':t.status==='overdue' || t.status === 'blocked' ?'red':'grey'}`} style={{ textTransform:'capitalize' }}>{t.status}</span></td>
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
