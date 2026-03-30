import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { sbGetMany } from '../../utils/supabase'

export default function SuperTenants() {
  const [tenants, setTenants] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const navigate = useNavigate()

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    const data = await sbGetMany('tenants', 'order=created_at.desc')
    setTenants(data||[])
    setLoading(false)
  }

  const filtered = tenants.filter(t => {
    const q = search.toLowerCase()
    const matchSearch = !q||t.name?.toLowerCase().includes(q)||t.owner_email?.toLowerCase().includes(q)
    const matchFilter = filter==='all'||t.status===filter
    return matchSearch&&matchFilter
  })

  return (
    <div className="fade-in page-stack">
      <div className="page-hd">
        <div>
          <h1 className="page-title">All Tenants</h1>
          <p className="page-sub">{tenants.length} total workspaces across the platform</p>
        </div>
      </div>
      <div className="table-toolbar">
        <div className="search-shell">
          <input className="inp" placeholder="Search tenants..." value={search} onChange={e=>setSearch(e.target.value)}/>
          <span className="search-icon" />
        </div>
        <div className="filter-pills">
          {['all','trialing','active','overdue','suspended'].map(s=>(
            <button key={s} onClick={()=>setFilter(s)} className={`btn btn-sm ${filter===s?'btn-primary':'btn-outline'}`} style={{textTransform:'capitalize'}}>{s}</button>
          ))}
        </div>
        <div className="compact-note">
          {['trialing','active','overdue','suspended'].map(status => `${status}: ${tenants.filter(t => t.status === status).length}`).join(' · ')}
        </div>
      </div>
      <div className="card card-pad table-card">
        {loading ? <div style={{padding:24}}>{[1,2,3].map(i=><div key={i} className="skel" style={{height:52,marginBottom:8,borderRadius:8}}/>)}</div>
        : filtered.length===0 ? <div className="empty"><p>No tenants found</p></div>
        : <table className="tbl">
            <thead><tr><th>Company</th><th>Plan</th><th>Status</th><th>Owner</th><th>Joined</th><th></th></tr></thead>
            <tbody>
              {filtered.map(t=>(
                <tr key={t.id} style={{cursor:'pointer'}} onClick={()=>navigate(`/superadmin/tenants/${t.id}`)}>
                  <td className="t-main">{t.name}</td>
                  <td><span className="badge badge-blue" style={{textTransform:'capitalize'}}>{t.plan}</span></td>
                  <td><span className={`badge badge-${t.status==='active'?'green':t.status==='trialing'?'amber':t.status==='overdue'?'red':'grey'}`} style={{textTransform:'capitalize'}}>{t.status}</span></td>
                  <td style={{fontFamily:'var(--font-mono)',fontSize:11,color:'var(--faint)'}}>{t.owner_email}</td>
                  <td style={{fontFamily:'var(--font-mono)',fontSize:11,color:'var(--faint)'}}>{new Date(t.created_at).toLocaleDateString('en-GB')}</td>
                  <td><button className="btn btn-outline btn-sm" onClick={e=>{e.stopPropagation();navigate(`/superadmin/tenants/${t.id}`)}}>View</button></td>
                </tr>
              ))}
            </tbody>
          </table>}
      </div>
    </div>
  )
}
