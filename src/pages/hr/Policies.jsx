import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { sbGetMany, sbInsert } from '../../utils/supabase'

export default function Policies() {
  const { tenant, tenantUser } = useAuth()
  const [policies, setPolicies] = useState([])
  const [acknowledgements, setAcknowledgements] = useState([])
  const [staff, setStaff] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [tenant?.id, tenantUser?.role])

  const canViewPolicy = (doc) => {
    if (doc.visible_to === 'all') return true
    if (doc.visible_to === 'managers') return ['owner', 'admin', 'manager', 'superadmin'].includes(tenantUser?.role)
    if (doc.visible_to === 'owner') return ['owner', 'superadmin'].includes(tenantUser?.role)
    return false
  }

  const isAdmin = ['owner', 'admin', 'manager', 'superadmin'].includes(tenantUser?.role)

  const load = async () => {
    if (!tenant?.id) return
    setLoading(true)
    const [documents, ackRows, staffRows] = await Promise.all([
      sbGetMany('documents', `tenant_id=eq.${tenant.id}&category=eq.policy&order=created_at.desc`),
      sbGetMany('document_acknowledgements', `tenant_id=eq.${tenant.id}&order=acknowledged_at.desc`),
      sbGetMany('tenant_users', `tenant_id=eq.${tenant.id}&status=eq.active&order=full_name.asc`),
    ])
    setPolicies((documents || []).filter(canViewPolicy))
    setAcknowledgements(ackRows || [])
    setStaff(staffRows || [])
    setLoading(false)
  }

  const acknowledge = async (policy) => {
    try {
      await sbInsert('document_acknowledgements', {
        tenant_id: tenant.id,
        document_id: policy.id,
        tenant_user_id: tenantUser.id,
        acknowledged_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      })
      await load()
    } catch (error) {
      if (!String(error.message || '').includes('duplicate')) alert(error.message)
    }
  }

  const acknowledgedByUser = (policyId) => acknowledgements.find((row) => row.document_id === policyId && row.tenant_user_id === tenantUser?.id)
  const coverageFor = (policyId) => acknowledgements.filter((row) => row.document_id === policyId).length

  const overview = useMemo(() => {
    const requiringAck = policies.filter((policy) => policy.requires_acknowledgement)
    const mineOutstanding = requiringAck.filter((policy) => !acknowledgedByUser(policy.id)).length
    return {
      total: policies.length,
      requiringAck: requiringAck.length,
      mineOutstanding,
      covered: requiringAck.filter((policy) => coverageFor(policy.id) >= staff.length && staff.length > 0).length,
    }
  }, [policies, acknowledgements, staff.length, tenantUser?.id])

  return (
    <div className="fade-in page-stack">
      <div className="page-hd">
        <div>
          <h1 className="page-title">Policies</h1>
          <p className="page-sub">Policy acknowledgements, coverage, and compliance visibility.</p>
        </div>
      </div>
      <div className="kpi-strip">
        <div className="kpi-cell">
          <div className="kpi-cell-label">Policies</div>
          <div className="kpi-cell-value">{overview.total}</div>
        </div>
        <div className="kpi-cell">
          <div className="kpi-cell-label">Require acknowledgement</div>
          <div className="kpi-cell-value">{overview.requiringAck}</div>
        </div>
        <div className="kpi-cell">
          <div className="kpi-cell-label">Outstanding for me</div>
          <div className="kpi-cell-value">{overview.mineOutstanding}</div>
        </div>
        <div className="kpi-cell">
          <div className="kpi-cell-label">Fully covered</div>
          <div className="kpi-cell-value">{overview.covered}</div>
        </div>
      </div>
      <div className="compact-note">Policies are now meant to behave like a compliance surface, not just a file shelf. Staff can acknowledge, and admins can see coverage at a glance.</div>

      {loading ? (
        <div className="card card-pad">
          {[1, 2, 3].map(i => <div key={i} className="skel" style={{ height: 60, marginBottom: 10, borderRadius: 8 }} />)}
        </div>
      ) : policies.length === 0 ? (
        <div className="card"><div className="empty"><p>No policies uploaded yet</p></div></div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 16 }}>
          {policies.map((policy) => {
            const myAck = acknowledgedByUser(policy.id)
            const coverage = coverageFor(policy.id)
            return (
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
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                  {policy.visible_to !== 'all' && <span className="badge badge-amber" style={{ textTransform: 'capitalize' }}>{policy.visible_to}</span>}
                  {policy.requires_acknowledgement && <span className="badge badge-blue">Ack required</span>}
                  {myAck && <span className="badge badge-green">Acknowledged</span>}
                </div>
                {policy.requires_acknowledgement && (
                  <div style={{ fontSize: 12, color: 'var(--sub)', marginBottom: 12 }}>
                    Coverage: {coverage}/{staff.length || 0}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <a href={policy.file_url} target="_blank" rel="noreferrer" className="btn btn-outline btn-sm">Open Policy</a>
                  {policy.requires_acknowledgement && !myAck && (
                    <button className="btn btn-primary btn-sm" onClick={() => acknowledge(policy)}>Acknowledge</button>
                  )}
                </div>
                {isAdmin && policy.requires_acknowledgement && (
                  <div style={{ fontSize: 11, color: 'var(--faint)', marginTop: 12 }}>
                    {coverage === staff.length && staff.length > 0 ? 'Full acknowledgement coverage.' : 'Still waiting on acknowledgements.'}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
