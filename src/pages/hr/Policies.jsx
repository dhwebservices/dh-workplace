import { useEffect, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { sbGetMany } from '../../utils/supabase'

export default function Policies() {
  const { tenant } = useAuth()
  const [policies, setPolicies] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [tenant?.id])

  const load = async () => {
    if (!tenant?.id) return
    setLoading(true)
    const data = await sbGetMany('documents', `tenant_id=eq.${tenant.id}&category=eq.policy&order=created_at.desc`)
    setPolicies((data || []).filter(doc => !doc.deleted_at))
    setLoading(false)
  }

  return (
    <div className="fade-in">
      <div className="page-hd">
        <div>
          <h1 className="page-title">Policies</h1>
          <p className="page-sub">Company handbooks, policy packs, and compliance documents</p>
        </div>
      </div>

      {loading ? (
        <div className="card card-pad">
          {[1, 2, 3].map(i => <div key={i} className="skel" style={{ height: 60, marginBottom: 10, borderRadius: 8 }} />)}
        </div>
      ) : policies.length === 0 ? (
        <div className="card">
          <div className="empty"><p>No policies uploaded yet</p></div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 16 }}>
          {policies.map(policy => (
            <div key={policy.id} className="card card-pad">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>{policy.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--faint)' }}>
                    Uploaded {new Date(policy.created_at).toLocaleDateString('en-GB')}
                  </div>
                </div>
                <span className="badge badge-blue" style={{ textTransform: 'capitalize' }}>Policy</span>
              </div>
              {policy.visible_to !== 'all' && (
                <div style={{ fontSize: 12, color: 'var(--faint)', marginBottom: 12 }}>
                  Visible to: {policy.visible_to}
                </div>
              )}
              <a href={policy.file_url} target="_blank" rel="noreferrer" className="btn btn-outline btn-sm">Open Policy</a>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
