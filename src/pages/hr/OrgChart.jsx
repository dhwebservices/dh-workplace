import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { buildOrgChart, listEmployees } from '../../utils/employees'

function initials(name) {
  return String(name || '?').split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase()
}

function toneFor(role) {
  if (role === 'owner') return 'blue'
  if (role === 'admin') return 'red'
  if (role === 'manager') return 'amber'
  return 'green'
}

function OrgNode({ node, navigate, depth = 0 }) {
  const roleLabel = node.permissions?.role_preset || node.tenant_user?.role || 'staff'
  return (
    <div className="org-node-wrap">
      <button className="org-node-card" onClick={() => navigate(`/staff/${node.id}`)}>
        <div className="org-node-avatar">
          {node.avatar_url ? (
            <img src={node.avatar_url} alt={node.display_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            initials(node.display_name)
          )}
        </div>
        <div className="org-node-copy">
          <div className="org-node-name">{node.display_name}</div>
          <div className="org-node-meta">{node.job_title || 'Employee'} · {node.department || 'No department'}</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
            <span className={`badge badge-${toneFor(roleLabel)}`} style={{ textTransform: 'capitalize' }}>{roleLabel}</span>
            {node.children?.length > 0 && <span className="badge badge-grey">{node.children.length} report{node.children.length === 1 ? '' : 's'}</span>}
          </div>
        </div>
      </button>
      {node.children?.length > 0 && (
        <div className="org-children">
          {node.children.map((child) => (
            <div key={child.id} className="org-branch">
              <div className="org-connector" />
              <OrgNode node={child} navigate={navigate} depth={depth + 1} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function OrgChart() {
  const navigate = useNavigate()
  const { tenant } = useAuth()
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      if (!tenant?.id) return
      setLoading(true)
      const rows = await listEmployees(tenant.id)
      setEmployees((rows || []).filter((employee) => employee.is_person && !employee.is_shared_mailbox))
      setLoading(false)
    }
    load()
  }, [tenant?.id])

  const chart = useMemo(() => buildOrgChart(employees), [employees])
  const managerCount = employees.filter((employee) => employees.some((candidate) => candidate.manager_employee_id === employee.id)).length

  if (loading) return <div className="spin-wrap"><div className="spin" /></div>

  return (
    <div className="fade-in page-stack">
      <div className="page-hd">
        <div>
          <h1 className="page-title">Organisation chart</h1>
          <p className="page-sub">Live reporting lines built from canonical employee records and manager relationships.</p>
        </div>
      </div>

      <div className="kpi-strip">
        <div className="kpi-cell">
          <div className="kpi-cell-label">People</div>
          <div className="kpi-cell-value">{employees.length}</div>
        </div>
        <div className="kpi-cell">
          <div className="kpi-cell-label">Managers</div>
          <div className="kpi-cell-value">{managerCount}</div>
        </div>
        <div className="kpi-cell">
          <div className="kpi-cell-label">Top-level leads</div>
          <div className="kpi-cell-value">{chart.length}</div>
        </div>
        <div className="kpi-cell">
          <div className="kpi-cell-label">Mailbox exclusions</div>
          <div className="kpi-cell-value">Live</div>
        </div>
      </div>

      <div className="card card-pad">
        <div className="section-head">
          <div>
            <h3 className="panel-title">Reporting structure</h3>
            <div className="panel-sub">Click any person to open their full staff profile. Shared inboxes and non-person records are excluded automatically.</div>
          </div>
        </div>
        {chart.length ? (
          <div className="org-chart">
            {chart.map((node) => (
              <OrgNode key={node.id} node={node} navigate={navigate} />
            ))}
          </div>
        ) : (
          <div className="compact-note">No manager relationships have been set yet, so the organisation chart cannot be drawn.</div>
        )}
      </div>
    </div>
  )
}
