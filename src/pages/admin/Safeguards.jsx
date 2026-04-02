import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { canManageWorkspaceSettings } from '../../utils/permissions'
import { getEmployeeSafeguards } from '../../utils/employees'

function StaffIssueCard({ title, subtitle, tone = 'grey', children }) {
  return (
    <div className="card card-pad">
      <div className="section-head">
        <div>
          <h3 className="panel-title">{title}</h3>
          <div className="panel-sub">{subtitle}</div>
        </div>
        <span className={`badge badge-${tone}`}>{children.length}</span>
      </div>
      <div style={{ display: 'grid', gap: 10 }}>
        {children.length ? children : <div className="compact-note">No issues found.</div>}
      </div>
    </div>
  )
}

function EmployeeRow({ employee, note, linkId }) {
  return (
    <div className="detail-card" style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 700 }}>{employee.display_name || employee.full_name || employee.email}</div>
        <div style={{ fontSize: 12, color: 'var(--faint)', fontFamily: 'var(--font-mono)', marginTop: 4 }}>
          {employee.primary_email || employee.email || 'No email'}
        </div>
        {note && <div style={{ fontSize: 12, color: 'var(--sub)', marginTop: 6 }}>{note}</div>}
      </div>
      {linkId && <Link to={`/staff/${linkId}`} className="btn btn-outline btn-sm">Open profile</Link>}
    </div>
  )
}

export default function Safeguards() {
  const { tenant, tenantUser } = useAuth()
  const canManage = canManageWorkspaceSettings(tenantUser?.role)
  const [loading, setLoading] = useState(true)
  const [issues, setIssues] = useState({
    duplicateIdentities: [],
    missingManagers: [],
    incompleteHrProfiles: [],
    sharedMailboxAsPerson: [],
    missingPermissions: [],
    tenantUsersMissingEmployee: [],
    staleOnboarding: [],
  })

  useEffect(() => {
    let active = true
    const load = async () => {
      if (!tenant?.id) return
      setLoading(true)
      const data = await getEmployeeSafeguards(tenant.id)
      if (!active) return
      setIssues(data)
      setLoading(false)
    }
    load()
    return () => { active = false }
  }, [tenant?.id])

  const summary = useMemo(() => ([
    { label: 'Duplicate identities', value: issues.duplicateIdentities.length, tone: 'var(--red)' },
    { label: 'Missing managers', value: issues.missingManagers.length, tone: 'var(--amber)' },
    { label: 'Missing permissions', value: issues.missingPermissions.length, tone: 'var(--blue)' },
    { label: 'Stale onboarding', value: issues.staleOnboarding.length, tone: 'var(--gold)' },
  ]), [issues])

  if (!canManage) return <div className="card card-pad"><p style={{ color: 'var(--faint)' }}>Owner access required.</p></div>

  return (
    <div className="fade-in page-stack">
      <div className="page-hd">
        <div>
          <h1 className="page-title">Safeguards</h1>
          <p className="page-sub">Data-quality and operational integrity checks for the people and admin layer</p>
        </div>
      </div>

      <div className="compact-note">Use this page to catch identity drift, missing permissions, onboarding issues, and manager gaps before they become support problems.</div>

      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        {summary.map(card => (
          <div key={card.label} className="stat-card">
            <div className="stat-val" style={{ color: card.tone }}>{card.value}</div>
            <div className="stat-lbl">{card.label}</div>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="card card-pad">
          {[1, 2, 3].map(i => <div key={i} className="skel" style={{ height: 60, marginBottom: 10, borderRadius: 10 }} />)}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
          <StaffIssueCard title="Duplicate identities" subtitle="People records sharing the same normalized work email" tone="red">
            {issues.duplicateIdentities.map((group, index) => (
              <div key={`duplicate-${index}`} className="detail-card">
                <div style={{ fontSize: 12, color: 'var(--faint)', marginBottom: 10, fontFamily: 'var(--font-mono)' }}>
                  {group[0]?.primary_email || 'No shared email'}
                </div>
                <div style={{ display: 'grid', gap: 10 }}>
                  {group.map(employee => (
                    <EmployeeRow key={employee.id} employee={employee} linkId={employee.id} />
                  ))}
                </div>
              </div>
            ))}
          </StaffIssueCard>

          <StaffIssueCard title="Missing managers" subtitle="Active people who should report into someone but do not" tone="amber">
            {issues.missingManagers.map(employee => (
              <EmployeeRow key={employee.id} employee={employee} note="Assign a manager relationship so org chart and reporting stay accurate." linkId={employee.id} />
            ))}
          </StaffIssueCard>

          <StaffIssueCard title="Incomplete HR profiles" subtitle="People records missing core HR fields needed for admin confidence" tone="amber">
            {issues.incompleteHrProfiles.map(employee => (
              <EmployeeRow key={employee.id} employee={employee} note="Contract, start date, phone, or emergency details are incomplete." linkId={employee.id} />
            ))}
          </StaffIssueCard>

          <StaffIssueCard title="Missing permissions rows" subtitle="Canonical employees that do not yet have a separate permission record" tone="blue">
            {issues.missingPermissions.map(employee => (
              <EmployeeRow key={employee.id} employee={employee} note="Create or repair the employee permission row so onboarding-only and page controls work properly." linkId={employee.id} />
            ))}
          </StaffIssueCard>

          <StaffIssueCard title="Tenant users missing employee rows" subtitle="Legacy tenant users that have not been linked into the canonical employee layer yet" tone="blue">
            {issues.tenantUsersMissingEmployee.map(user => (
              <EmployeeRow key={user.id} employee={user} note="This user exists in tenant_users but has no canonical employee record yet." linkId={user.id} />
            ))}
          </StaffIssueCard>

          <StaffIssueCard title="Shared mailboxes flagged as people" subtitle="Records that look like mailboxes but are still marked as human staff" tone="red">
            {issues.sharedMailboxAsPerson.map(employee => (
              <EmployeeRow key={employee.id} employee={employee} note="Mark this as a non-person/shared mailbox so it stays out of staff views and org structure." linkId={employee.id} />
            ))}
          </StaffIssueCard>

          <StaffIssueCard title="Stale onboarding records" subtitle="People still stuck in onboarding-only mode after a week" tone="gold">
            {issues.staleOnboarding.map(employee => (
              <EmployeeRow key={employee.id} employee={employee} note={`Onboarding-only for ${employee.ageDays} day${employee.ageDays === 1 ? '' : 's'}.`} linkId={employee.id} />
            ))}
          </StaffIssueCard>
        </div>
      )}
    </div>
  )
}
