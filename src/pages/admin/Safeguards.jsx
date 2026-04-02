import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { canManageWorkspaceSettings } from '../../utils/permissions'
import { getEmployeeSafeguards } from '../../utils/employees'

function totalIssues(issues) {
  return (
    issues.duplicateIdentities.length +
    issues.missingManagers.length +
    issues.incompleteHrProfiles.length +
    issues.sharedMailboxAsPerson.length +
    issues.missingPermissions.length +
    issues.tenantUsersMissingEmployee.length +
    issues.staleOnboarding.length
  )
}

function healthBand(total) {
  if (total === 0) return { label: 'Healthy', tone: 'green' }
  if (total <= 5) return { label: 'Watchlist', tone: 'amber' }
  return { label: 'Needs attention', tone: 'red' }
}

function scoreFor(issues) {
  const weighted =
    issues.duplicateIdentities.length * 18 +
    issues.sharedMailboxAsPerson.length * 14 +
    issues.missingPermissions.length * 10 +
    issues.tenantUsersMissingEmployee.length * 10 +
    issues.missingManagers.length * 7 +
    issues.staleOnboarding.length * 6 +
    issues.incompleteHrProfiles.length * 4
  return Math.max(0, 100 - weighted)
}

function priorityQueue(issues) {
  const rows = []

  issues.duplicateIdentities.forEach((group) => {
    rows.push({
      id: `duplicate-${group[0]?.id || Math.random()}`,
      title: `Duplicate identity: ${group[0]?.primary_email || 'No email'}`,
      note: `${group.length} employee records are sharing the same normalized email.`,
      to: group[0]?.id ? `/staff/${group[0].id}` : '/staff',
      tone: 'red',
      cta: 'Open profile',
    })
  })

  issues.sharedMailboxAsPerson.forEach((employee) => {
    rows.push({
      id: `mailbox-${employee.id}`,
      title: `${employee.display_name} is still marked as a person`,
      note: 'Shared mailboxes should be excluded from staff records and org structure.',
      to: `/staff/${employee.id}`,
      tone: 'red',
      cta: 'Fix profile',
    })
  })

  issues.missingPermissions.forEach((employee) => {
    rows.push({
      id: `permissions-${employee.id}`,
      title: `${employee.display_name} has no permissions row`,
      note: 'Page-level access and onboarding-only mode will drift until this record is repaired.',
      to: `/staff/${employee.id}`,
      tone: 'amber',
      cta: 'Repair access',
    })
  })

  issues.staleOnboarding.forEach((employee) => {
    rows.push({
      id: `onboarding-${employee.id}`,
      title: `${employee.display_name} is stuck in onboarding`,
      note: `${employee.ageDays} days in onboarding-only mode. Review the onboarding queue and unlock them when ready.`,
      to: `/staff/${employee.id}`,
      tone: 'amber',
      cta: 'Review starter',
    })
  })

  issues.missingManagers.forEach((employee) => {
    rows.push({
      id: `manager-${employee.id}`,
      title: `${employee.display_name} has no manager`,
      note: 'Reporting lines and org chart visibility will stay incomplete until a manager is set.',
      to: `/staff/${employee.id}`,
      tone: 'blue',
      cta: 'Assign manager',
    })
  })

  issues.tenantUsersMissingEmployee.forEach((user) => {
    rows.push({
      id: `canonical-${user.id}`,
      title: `${user.full_name || user.email} is missing a canonical employee record`,
      note: 'Legacy tenant user still needs to be absorbed into the employee layer.',
      to: `/staff/${user.id}`,
      tone: 'blue',
      cta: 'Open staff',
    })
  })

  return rows
}

function SectionCard({ title, subtitle, tone, count, children }) {
  return (
    <div className="card card-pad">
      <div className="section-head">
        <div>
          <h3 className="panel-title">{title}</h3>
          <div className="panel-sub">{subtitle}</div>
        </div>
        <span className={`badge badge-${tone}`}>{count}</span>
      </div>
      <div style={{ display: 'grid', gap: 10 }}>
        {children}
      </div>
    </div>
  )
}

function IssueRow({ title, sub, to, cta = 'Open', tone = 'grey' }) {
  return (
    <div className="detail-card" style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{title}</div>
          <span className={`badge badge-${tone}`}>Issue</span>
        </div>
        <div style={{ fontSize: 12, color: 'var(--sub)', lineHeight: 1.55 }}>{sub}</div>
      </div>
      {to ? <Link to={to} className="btn btn-outline btn-sm">{cta}</Link> : null}
    </div>
  )
}

export default function Safeguards() {
  const { tenant, tenantUser } = useAuth()
  const canManage = canManageWorkspaceSettings(tenantUser?.role)
  const [loading, setLoading] = useState(true)
  const [issues, setIssues] = useState({
    employees: [],
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

  const total = useMemo(() => totalIssues(issues), [issues])
  const band = useMemo(() => healthBand(total), [total])
  const score = useMemo(() => scoreFor(issues), [issues])
  const queue = useMemo(() => priorityQueue(issues), [issues])

  const summary = useMemo(() => ([
    { label: 'Integrity score', value: `${score}%`, tone: score >= 90 ? 'var(--green)' : score >= 70 ? 'var(--amber)' : 'var(--red)' },
    { label: 'Priority issues', value: queue.length, tone: 'var(--red)' },
    { label: 'People records', value: issues.employees.length, tone: 'var(--blue)' },
    { label: 'HR gaps', value: issues.incompleteHrProfiles.length, tone: 'var(--gold)' },
  ]), [score, queue.length, issues.employees.length, issues.incompleteHrProfiles.length])

  if (!canManage) return <div className="card card-pad"><p style={{ color: 'var(--faint)' }}>Owner access required.</p></div>

  return (
    <div className="fade-in page-stack">
      <div className="page-hd">
        <div>
          <h1 className="page-title">Safeguards</h1>
          <p className="page-sub">Identity, permissions, onboarding, and HR data quality across the people layer.</p>
        </div>
        <span className={`badge badge-${band.tone}`} style={{ fontSize: 12 }}>{band.label}</span>
      </div>

      <div className="compact-note">Use this page as the admin quality console for staff data. The goal is to fix identity drift before it leaks into onboarding, permissions, HR records, or the org chart.</div>

      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        {summary.map((card) => (
          <div key={card.label} className="stat-card">
            <div className="stat-val" style={{ color: card.tone }}>{card.value}</div>
            <div className="stat-lbl">{card.label}</div>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="card card-pad">
          {[1, 2, 3].map((i) => <div key={i} className="skel" style={{ height: 72, marginBottom: 10, borderRadius: 10 }} />)}
        </div>
      ) : (
        <>
          <div className="asymmetric-grid">
            <div className="card card-pad">
              <div className="section-head">
                <div>
                  <h3 className="panel-title">Priority queue</h3>
                  <div className="panel-sub">The highest-value fixes to make next.</div>
                </div>
              </div>
              <div style={{ display: 'grid', gap: 10 }}>
                {queue.length ? queue.slice(0, 8).map((item) => (
                  <IssueRow key={item.id} title={item.title} sub={item.note} to={item.to} tone={item.tone} cta={item.cta} />
                )) : (
                  <div className="compact-note">No priority issues right now.</div>
                )}
              </div>
            </div>

            <div className="card card-pad">
              <div className="section-head">
                <div>
                  <h3 className="panel-title">Admin focus</h3>
                  <div className="panel-sub">The fastest routes back into the operational surfaces behind these issues.</div>
                </div>
              </div>
              <div className="stack-sm">
                <Link to="/staff" className="list-card" style={{ textDecoration: 'none' }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>Open staff directory</div>
                  <div style={{ fontSize: 12, color: 'var(--faint)', marginTop: 4 }}>Review canonical employee records and shared-mailbox exclusions.</div>
                </Link>
                <Link to="/org-chart" className="list-card" style={{ textDecoration: 'none' }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>Review org chart</div>
                  <div style={{ fontSize: 12, color: 'var(--faint)', marginTop: 4 }}>Spot reporting-line gaps and confirm manager coverage visually.</div>
                </Link>
                <Link to="/onboarding-hr" className="list-card" style={{ textDecoration: 'none' }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>Review onboarding queue</div>
                  <div style={{ fontSize: 12, color: 'var(--faint)', marginTop: 4 }}>Clear stale starters and move completed people out of onboarding-only mode.</div>
                </Link>
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
            <SectionCard title="Identity and access" subtitle="Canonical employee and permission integrity." tone="red" count={issues.duplicateIdentities.length + issues.sharedMailboxAsPerson.length + issues.missingPermissions.length + issues.tenantUsersMissingEmployee.length}>
              {issues.duplicateIdentities.map((group, index) => (
                <IssueRow
                  key={`duplicate-${index}`}
                  title={group[0]?.primary_email || 'Duplicate identity'}
                  sub={`${group.length} employee records are using the same normalized work email.`}
                  to={group[0]?.id ? `/staff/${group[0].id}` : '/staff'}
                  tone="red"
                  cta="Resolve"
                />
              ))}
              {issues.sharedMailboxAsPerson.map((employee) => (
                <IssueRow
                  key={`mailbox-${employee.id}`}
                  title={`${employee.display_name} is flagged as a person`}
                  sub="This record looks like a shared mailbox and should be removed from people flows."
                  to={`/staff/${employee.id}`}
                  tone="red"
                  cta="Fix"
                />
              ))}
              {issues.missingPermissions.map((employee) => (
                <IssueRow
                  key={`permission-${employee.id}`}
                  title={`${employee.display_name} has no permissions row`}
                  sub="Onboarding-only mode and page-level controls depend on this linked record."
                  to={`/staff/${employee.id}`}
                  tone="amber"
                  cta="Repair"
                />
              ))}
              {issues.tenantUsersMissingEmployee.map((user) => (
                <IssueRow
                  key={`canonical-${user.id}`}
                  title={`${user.full_name || user.email} is missing a canonical employee`}
                  sub="This legacy tenant user still needs to sync into the employee model."
                  to={`/staff/${user.id}`}
                  tone="blue"
                  cta="Review"
                />
              ))}
              {issues.duplicateIdentities.length + issues.sharedMailboxAsPerson.length + issues.missingPermissions.length + issues.tenantUsersMissingEmployee.length === 0 && (
                <div className="compact-note">No identity or access issues found.</div>
              )}
            </SectionCard>

            <SectionCard title="People structure" subtitle="Managers, reporting lines, and onboarding drift." tone="amber" count={issues.missingManagers.length + issues.staleOnboarding.length}>
              {issues.missingManagers.map((employee) => (
                <IssueRow
                  key={`manager-${employee.id}`}
                  title={`${employee.display_name} has no manager assigned`}
                  sub="Their reporting line is incomplete, which weakens approvals, org structure, and admin oversight."
                  to={`/staff/${employee.id}`}
                  tone="amber"
                  cta="Assign"
                />
              ))}
              {issues.staleOnboarding.map((employee) => (
                <IssueRow
                  key={`onboarding-${employee.id}`}
                  title={`${employee.display_name} is still in onboarding-only mode`}
                  sub={`${employee.ageDays} days since invite/creation. Clear the onboarding queue or move them to normal access.`}
                  to={`/staff/${employee.id}`}
                  tone="gold"
                  cta="Check"
                />
              ))}
              {issues.missingManagers.length + issues.staleOnboarding.length === 0 && (
                <div className="compact-note">No structure or onboarding issues found.</div>
              )}
            </SectionCard>

            <SectionCard title="HR completeness" subtitle="Core HR fields needed for confident operations." tone="gold" count={issues.incompleteHrProfiles.length}>
              {issues.incompleteHrProfiles.map((employee) => (
                <IssueRow
                  key={`hr-${employee.id}`}
                  title={`${employee.display_name} has an incomplete HR profile`}
                  sub="Contract details, start date, phone, or emergency contact fields are missing."
                  to={`/staff/${employee.id}`}
                  tone="gold"
                  cta="Complete"
                />
              ))}
              {issues.incompleteHrProfiles.length === 0 && (
                <div className="compact-note">No HR profile gaps found.</div>
              )}
            </SectionCard>
          </div>
        </>
      )}
    </div>
  )
}
