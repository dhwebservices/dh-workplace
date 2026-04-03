import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { PAGE_PERMISSION_GROUPS, canManageStaffAccess, getPermissionOverrideDefaults, visibleStaffProfileTabs } from '../../utils/permissions'
import { getEmployeeByIdentifier, saveEmployeeHrProfile, saveEmployeePermissions, saveEmployeeProfile, updateEmployeeLifecycle } from '../../utils/employees'
import { sendCustomNotification } from '../../utils/notifications'
import PortalPreferencesEditor from '../../components/portal/PortalPreferencesEditor'
import { applyPortalAppearance, savePortalPreferences, sanitizePortalPreferences } from '../../utils/portalPreferences'

const TABS = [
  ['profile', 'Profile'],
  ['hr', 'HR details'],
  ['bank', 'Bank details'],
  ['permissions', 'Permissions'],
  ['documents', 'Documents'],
  ['payslips', 'Payslips'],
  ['manager', 'Manager summary'],
  ['portal', 'Portal'],
  ['onboarding', 'Onboarding'],
  ['lifecycle', 'Lifecycle'],
  ['notifications', 'Notifications'],
  ['history', 'Notification history'],
]

function InfoRow({ label, value, mono = false }) {
  return (
    <div className="detail-row">
      <span className="detail-row-label">{label}</span>
      <span className="detail-row-value" style={mono ? { fontFamily: 'var(--font-mono)' } : undefined}>{value || '—'}</span>
    </div>
  )
}

export default function StaffProfile() {
  const { userId } = useParams()
  const navigate = useNavigate()
  const { tenant, tenantUser, employeePermissions, user } = useAuth()
  const [employee, setEmployee] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('profile')
  const [saving, setSaving] = useState(false)
  const [profileForm, setProfileForm] = useState({ display_name: '', job_title: '', department: '', primary_email: '' })
  const [hrForm, setHrForm] = useState({
    contract_type: '',
    start_date: '',
    manager_id: '',
    phone: '',
    personal_email: '',
    address: '',
    emergency_name: '',
    emergency_phone: '',
    bank_name: '',
    account_name: '',
    sort_code: '',
    account_number: '',
    hr_notes: '',
  })
  const [permissionForm, setPermissionForm] = useState({ role_preset: 'staff', onboarding_only: false, page_overrides: {} })
  const [portalForm, setPortalForm] = useState(null)
  const [notificationForm, setNotificationForm] = useState({
    title: '',
    message: '',
    category: 'admin',
    isUrgent: false,
    isPinned: false,
    sendEmail: false,
  })
  const canManage = canManageStaffAccess({ role: tenantUser?.role, permissionRecord: employeePermissions })

  const load = async () => {
    if (!tenant?.id || !userId) return
    setLoading(true)
    const data = await getEmployeeByIdentifier(tenant.id, userId)
    setEmployee(data)
    setProfileForm({
      display_name: data?.display_name || '',
      job_title: data?.job_title || '',
      department: data?.department || '',
      primary_email: data?.primary_email || '',
    })
    setHrForm({
      contract_type: data?.hr_profile?.contract_type || '',
      start_date: data?.hr_profile?.start_date || '',
      manager_id: data?.hr_profile?.manager_id || data?.manager?.tenant_user_id || '',
      phone: data?.hr_profile?.phone || '',
      personal_email: data?.hr_profile?.personal_email || '',
      address: data?.hr_profile?.address || '',
      emergency_name: data?.hr_profile?.emergency_name || '',
      emergency_phone: data?.hr_profile?.emergency_phone || '',
      bank_name: data?.hr_profile?.bank_name || '',
      account_name: data?.hr_profile?.account_name || '',
      sort_code: data?.hr_profile?.sort_code || '',
      account_number: data?.hr_profile?.account_number || '',
      hr_notes: data?.hr_profile?.hr_notes || '',
    })
    setPermissionForm({
      role_preset: data?.permissions?.role_preset || data?.tenant_user?.role || 'staff',
      onboarding_only: !!(data?.permissions?.onboarding_only || data?.onboarding_mode),
      page_overrides: getPermissionOverrideDefaults(data?.permissions, data?.tenant_user?.role || 'staff'),
    })
    setPortalForm(sanitizePortalPreferences(data?.portal_preferences || {}, {
      permissionRecord: data?.permissions,
      fallbackRole: data?.tenant_user?.role || 'staff',
      selfStaffPaths: [data?.id, data?.tenant_user_id].filter(Boolean).map((identifier) => `/staff/${identifier}`),
    }))
    setLoading(false)
  }

  useEffect(() => { load() }, [tenant?.id, userId])

  const viewingOwnProfile = useMemo(() => {
    if (!employee || !user) return false
    return employee.tenant_user?.user_id === user.id
  }, [employee, user])

  const directReports = employee?.direct_reports || []
  const notifications = employee?.notifications || []
  const employeeDocuments = employee?.documents || []
  const employeePayslips = employee?.payslips || []
  const allowedTabs = visibleStaffProfileTabs(employeePermissions, canManage)
  const safeTab = allowedTabs.includes(tab) ? tab : allowedTabs[0]
  const staffSelfPaths = [employee?.id, employee?.tenant_user_id, employee?.tenant_user?.user_id].filter(Boolean).map((identifier) => `/staff/${identifier}`)

  const saveProfile = async () => {
    if (!employee?.id) return
    setSaving(true)
    try {
      await saveEmployeeProfile(employee.id, profileForm)
      await load()
      alert('Profile updated.')
    } catch (error) {
      alert(error.message)
    }
    setSaving(false)
  }

  const saveHr = async () => {
    if (!employee?.id) return
    setSaving(true)
    try {
      await saveEmployeeHrProfile({
        employee,
        tenantId: tenant.id,
        values: hrForm,
      })
      await load()
      alert('HR details updated.')
    } catch (error) {
      alert(error.message)
    }
    setSaving(false)
  }

  const savePermissions = async () => {
    if (!employee?.id) return
    setSaving(true)
    try {
      await saveEmployeePermissions({
        permissionId: employee.permissions?.id,
        tenantId: tenant.id,
        employeeId: employee.id,
        rolePreset: permissionForm.role_preset,
        onboardingOnly: permissionForm.onboarding_only,
        pageOverrides: permissionForm.page_overrides,
      })
      await saveEmployeeProfile(employee.id, { onboarding_mode: permissionForm.onboarding_only })
      await load()
      alert('Permissions updated.')
    } catch (error) {
      alert(error.message)
    }
    setSaving(false)
  }

  const savePortal = async () => {
    if (!employee?.id || !portalForm) return
    setSaving(true)
    try {
      await savePortalPreferences({
        preferenceId: employee.portal_preferences?.id,
        tenantId: tenant.id,
        employeeId: employee.id,
        values: portalForm,
      })
      if (viewingOwnProfile) {
        applyPortalAppearance(portalForm, tenant?.primary_colour || null)
      }
      await load()
      alert('Portal preferences updated.')
    } catch (error) {
      alert(error.message)
    }
    setSaving(false)
  }

  const setLifecycle = async (nextStatus) => {
    if (!employee) return
    setSaving(true)
    try {
      await updateEmployeeLifecycle(employee, nextStatus)
      await load()
      alert(`Employee marked ${nextStatus}.`)
    } catch (error) {
      alert(error.message)
    }
    setSaving(false)
  }

  const sendNotification = async () => {
    if (!employee?.tenant_user_id) {
      alert('This employee is not linked to a live portal account yet.')
      return
    }
    if (!notificationForm.title.trim()) {
      alert('Add a notification title first.')
      return
    }
    setSaving(true)
    try {
      await sendCustomNotification({
        tenant_id: tenant.id,
        recipient_tenant_user_id: employee.tenant_user_id,
        title: notificationForm.title.trim(),
        message: notificationForm.message.trim(),
        category: notificationForm.category,
        is_urgent: notificationForm.isUrgent,
        is_pinned: notificationForm.isPinned,
        send_email: notificationForm.sendEmail,
        link: '/notifications',
      })
      setNotificationForm({
        title: '',
        message: '',
        category: 'admin',
        isUrgent: false,
        isPinned: false,
        sendEmail: false,
      })
      await load()
      alert('Notification sent.')
    } catch (error) {
      alert(error.message)
    }
    setSaving(false)
  }

  const managers = useMemo(() => {
    const map = new Map()
    ;[employee?.manager, ...(directReports || [])].filter(Boolean).forEach((person) => {
      if (person?.tenant_user_id) map.set(person.tenant_user_id, person)
    })
    return Array.from(map.values())
  }, [employee?.manager, directReports])

  if (loading) return <div className="spin-wrap"><div className="spin" /></div>
  if (!employee) return <div className="card card-pad"><p style={{ color: 'var(--faint)' }}>Employee not found.</p></div>
  if (!canManage && !viewingOwnProfile) return <div className="card card-pad"><p style={{ color: 'var(--faint)' }}>You can only view your own profile.</p></div>

  return (
    <div className="fade-in page-stack">
      <div>
        <button onClick={() => navigate('/staff')} className="btn btn-outline btn-sm">Back to staff directory</button>
      </div>

      <div className="page-hd">
        <div>
          <h1 className="page-title">{employee.display_name}</h1>
          <p className="page-sub">{employee.job_title || employee.tenant_user?.role || 'Employee'} · {employee.department || 'No department set'}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <span className={`badge badge-${employee.status === 'active' ? 'green' : employee.status === 'suspended' ? 'grey' : 'amber'}`} style={{ textTransform: 'capitalize' }}>{employee.status}</span>
          {employee.is_shared_mailbox && <span className="badge badge-red">Shared mailbox</span>}
          {permissionForm.onboarding_only && <span className="badge badge-blue">Onboarding only</span>}
        </div>
      </div>

      <div className="table-toolbar">
        <div className="filter-pills">
          {TABS.filter(([key]) => allowedTabs.includes(key)).map(([key, label]) => (
            <button key={key} className={`btn btn-sm ${safeTab === key ? 'btn-primary' : 'btn-outline'}`} onClick={() => setTab(key)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="kpi-strip">
        <div className="kpi-cell">
          <div className="kpi-cell-label">Identity</div>
          <div className="kpi-cell-value">{employee.is_shared_mailbox ? 'Mailbox' : 'Person'}</div>
        </div>
        <div className="kpi-cell">
          <div className="kpi-cell-label">Role preset</div>
          <div className="kpi-cell-value" style={{ textTransform: 'capitalize' }}>{permissionForm.role_preset}</div>
        </div>
        <div className="kpi-cell">
          <div className="kpi-cell-label">Manager</div>
          <div className="kpi-cell-value">{employee.manager?.display_name || 'Not assigned'}</div>
        </div>
        <div className="kpi-cell">
          <div className="kpi-cell-label">Direct reports</div>
          <div className="kpi-cell-value">{directReports.length}</div>
        </div>
      </div>

      {safeTab === 'profile' && (
        <div className="card card-pad">
          <div className="section-head">
            <div>
              <h3 className="panel-title">Canonical profile</h3>
              <div className="panel-sub">This employee record is the source of truth for staff identity, manager linking, and future sync safety.</div>
            </div>
          </div>
          <div className="fg" style={{ marginBottom: 20 }}>
            <div>
              <label className="lbl">Display name</label>
              <input className="inp" value={profileForm.display_name} onChange={e => setProfileForm(prev => ({ ...prev, display_name: e.target.value }))} disabled={!canManage} />
            </div>
            <div>
              <label className="lbl">Primary work email</label>
              <input className="inp" value={profileForm.primary_email} onChange={e => setProfileForm(prev => ({ ...prev, primary_email: e.target.value }))} disabled={!canManage} />
            </div>
            <div>
              <label className="lbl">Job title</label>
              <input className="inp" value={profileForm.job_title} onChange={e => setProfileForm(prev => ({ ...prev, job_title: e.target.value }))} disabled={!canManage} />
            </div>
            <div>
              <label className="lbl">Department</label>
              <input className="inp" value={profileForm.department} onChange={e => setProfileForm(prev => ({ ...prev, department: e.target.value }))} disabled={!canManage} />
            </div>
          </div>
          <div style={{ display: 'grid', gap: 2 }}>
            <InfoRow label="Canonical employee ID" value={employee.id} mono />
            <InfoRow label="Linked tenant user" value={employee.tenant_user_id || 'Not linked'} mono />
            <InfoRow label="Auth user" value={employee.tenant_user?.user_id || 'Not linked'} mono />
            <InfoRow label="Microsoft object" value={employee.external_microsoft_id || 'Not set'} mono />
          </div>
          {canManage && (
            <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-primary btn-sm" onClick={saveProfile} disabled={saving}>Save profile</button>
            </div>
          )}
        </div>
      )}

      {safeTab === 'hr' && (
        <div className="card card-pad">
          <div className="section-head">
            <div>
              <h3 className="panel-title">HR details</h3>
              <div className="panel-sub">Operational HR data linked to this canonical employee record.</div>
            </div>
          </div>
          <div className="fg" style={{ marginBottom: 18 }}>
            <div>
              <label className="lbl">Contract type</label>
              <input className="inp" value={hrForm.contract_type} onChange={e => setHrForm(prev => ({ ...prev, contract_type: e.target.value }))} disabled={!canManage} />
            </div>
            <div>
              <label className="lbl">Start date</label>
              <input className="inp" type="date" value={hrForm.start_date} onChange={e => setHrForm(prev => ({ ...prev, start_date: e.target.value }))} disabled={!canManage} />
            </div>
            <div>
              <label className="lbl">Phone</label>
              <input className="inp" value={hrForm.phone} onChange={e => setHrForm(prev => ({ ...prev, phone: e.target.value }))} disabled={!canManage} />
            </div>
            <div>
              <label className="lbl">Personal email</label>
              <input className="inp" value={hrForm.personal_email} onChange={e => setHrForm(prev => ({ ...prev, personal_email: e.target.value }))} disabled={!canManage} />
            </div>
            <div className="fc" style={{ gridColumn: '1 / -1' }}>
              <label className="lbl">Address</label>
              <textarea className="inp" rows="3" value={hrForm.address} onChange={e => setHrForm(prev => ({ ...prev, address: e.target.value }))} disabled={!canManage} />
            </div>
            <div>
              <label className="lbl">Emergency contact</label>
              <input className="inp" value={hrForm.emergency_name} onChange={e => setHrForm(prev => ({ ...prev, emergency_name: e.target.value }))} disabled={!canManage} />
            </div>
            <div>
              <label className="lbl">Emergency phone</label>
              <input className="inp" value={hrForm.emergency_phone} onChange={e => setHrForm(prev => ({ ...prev, emergency_phone: e.target.value }))} disabled={!canManage} />
            </div>
            <div className="fc" style={{ gridColumn: '1 / -1' }}>
              <label className="lbl">HR notes</label>
              <textarea className="inp" rows="4" value={hrForm.hr_notes} onChange={e => setHrForm(prev => ({ ...prev, hr_notes: e.target.value }))} disabled={!canManage} />
            </div>
          </div>
          {canManage && (
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-primary btn-sm" onClick={saveHr} disabled={saving}>Save HR details</button>
            </div>
          )}
        </div>
      )}

      {safeTab === 'bank' && (
        <div className="card card-pad">
          <div className="section-head">
            <div>
              <h3 className="panel-title">Bank details</h3>
              <div className="panel-sub">Payroll-adjacent bank information captured against the employee’s HR profile.</div>
            </div>
          </div>
          <div className="fg" style={{ marginBottom: 18 }}>
            <div>
              <label className="lbl">Bank name</label>
              <input className="inp" value={hrForm.bank_name} onChange={e => setHrForm(prev => ({ ...prev, bank_name: e.target.value }))} disabled={!canManage} />
            </div>
            <div>
              <label className="lbl">Account name</label>
              <input className="inp" value={hrForm.account_name} onChange={e => setHrForm(prev => ({ ...prev, account_name: e.target.value }))} disabled={!canManage} />
            </div>
            <div>
              <label className="lbl">Sort code</label>
              <input className="inp" value={hrForm.sort_code} onChange={e => setHrForm(prev => ({ ...prev, sort_code: e.target.value }))} disabled={!canManage} />
            </div>
            <div>
              <label className="lbl">Account number</label>
              <input className="inp" value={hrForm.account_number} onChange={e => setHrForm(prev => ({ ...prev, account_number: e.target.value }))} disabled={!canManage} />
            </div>
          </div>
          <div className="compact-note">Keep sensitive data here rather than scattering it across onboarding notes or ad hoc documents.</div>
          {canManage && (
            <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-primary btn-sm" onClick={saveHr} disabled={saving}>Save bank details</button>
            </div>
          )}
        </div>
      )}

      {safeTab === 'permissions' && (
        <div className="card card-pad">
          <div className="section-head">
            <div>
              <h3 className="panel-title">Permissions</h3>
              <div className="panel-sub">Role presets now live separately so page overrides and onboarding-only access can sit on top cleanly.</div>
            </div>
          </div>
          <div className="fg">
            <div>
              <label className="lbl">Role preset</label>
              <select className="inp" value={permissionForm.role_preset} onChange={e => setPermissionForm(prev => ({ ...prev, role_preset: e.target.value }))} disabled={!canManage}>
                {['owner', 'admin', 'manager', 'staff', 'onboarding'].map(role => (
                  <option key={role} value={role}>{role.charAt(0).toUpperCase() + role.slice(1)}</option>
                ))}
              </select>
            </div>
            <div className="fc">
              <label className="lbl">Onboarding-only access</label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--text)', marginTop: 10 }}>
                <input type="checkbox" checked={permissionForm.onboarding_only} onChange={e => setPermissionForm(prev => ({ ...prev, onboarding_only: e.target.checked }))} disabled={!canManage} />
                Force onboarding-only navigation and hide normal app access
              </label>
            </div>
          </div>
          <div className="compact-note">Role presets set the baseline. Per-page overrides below let you fine-tune the user’s portal without exposing disabled pages through nav, routes, landing pages, or quick actions.</div>
          {!permissionForm.onboarding_only && (
            <div className="stack-md" style={{ marginTop: 18 }}>
              {PAGE_PERMISSION_GROUPS.map((group) => (
                <div key={group.id} className="detail-card">
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>{group.label}</div>
                  <div className="portal-chip-grid">
                    {group.items.map((item) => {
                      const active = !!permissionForm.page_overrides[item.key]
                      return (
                        <button
                          key={item.key}
                          type="button"
                          className={`portal-chip ${active ? 'active' : ''}`}
                          onClick={() => setPermissionForm((prev) => ({
                            ...prev,
                            page_overrides: {
                              ...prev.page_overrides,
                              [item.key]: !prev.page_overrides[item.key],
                            },
                          }))}
                          disabled={!canManage}
                        >
                          {item.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
          {canManage && (
            <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-primary btn-sm" onClick={savePermissions} disabled={saving}>Save permissions</button>
            </div>
          )}
        </div>
      )}

      {safeTab === 'manager' && (
        <div className="card card-pad">
          <div className="section-head">
            <div>
              <h3 className="panel-title">Manager summary</h3>
              <div className="panel-sub">The reporting line is now anchored to canonical employees instead of loose text fields.</div>
            </div>
          </div>
          <div style={{ display: 'grid', gap: 2, marginBottom: 18 }}>
            <InfoRow label="Manager" value={employee.manager?.display_name || 'Not assigned'} />
            <InfoRow label="Manager email" value={employee.manager?.primary_email || '—'} mono />
            <InfoRow label="Direct reports" value={String(directReports.length)} />
          </div>
          <div style={{ display: 'grid', gap: 12 }}>
            {directReports.length ? directReports.map(report => (
              <button key={report.id} className="detail-card" style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => navigate(`/staff/${report.id}`)}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{report.display_name}</div>
                <div style={{ fontSize: 12, color: 'var(--faint)', marginTop: 4 }}>{report.job_title || report.permissions?.role_preset || report.tenant_user?.role || 'Employee'}</div>
              </button>
            )) : <div className="compact-note">No direct reports yet.</div>}
          </div>
        </div>
      )}

      {safeTab === 'documents' && (
        <div className="card card-pad">
          <div className="section-head">
            <div>
              <h3 className="panel-title">Documents</h3>
              <div className="panel-sub">Employee-linked files kept directly on this profile for faster admin review.</div>
            </div>
          </div>
          <div style={{ display: 'grid', gap: 12 }}>
            {employeeDocuments.length ? employeeDocuments.map((doc) => (
              <div key={doc.id} className="detail-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 6, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>{doc.name}</div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
                      <span className="badge badge-grey" style={{ textTransform: 'capitalize' }}>{doc.category}</span>
                      {doc.requires_acknowledgement && <span className="badge badge-blue">Ack required</span>}
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--faint)' }}>{new Date(doc.created_at).toLocaleDateString('en-GB')}</div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <a href={doc.file_url} target="_blank" rel="noreferrer" className="btn btn-outline btn-sm">View</a>
                  <a href={doc.file_url} download={doc.name} className="btn btn-outline btn-sm">Download</a>
                </div>
              </div>
            )) : <div className="compact-note">No employee-linked documents yet.</div>}
          </div>
        </div>
      )}

      {safeTab === 'payslips' && (
        <div className="card card-pad">
          <div className="section-head">
            <div>
              <h3 className="panel-title">Payslips</h3>
              <div className="panel-sub">A focused payroll document view so admins do not need to filter the full document centre.</div>
            </div>
          </div>
          <div style={{ display: 'grid', gap: 12 }}>
            {employeePayslips.length ? employeePayslips.map((doc) => (
              <div key={doc.id} className="detail-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 6, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>{doc.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--faint)', marginTop: 4 }}>{new Date(doc.created_at).toLocaleDateString('en-GB')}</div>
                  </div>
                  <span className="badge badge-green">Payslip</span>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <a href={doc.file_url} target="_blank" rel="noreferrer" className="btn btn-outline btn-sm">View</a>
                  <a href={doc.file_url} download={doc.name} className="btn btn-outline btn-sm">Download</a>
                </div>
              </div>
            )) : <div className="compact-note">No payslips linked to this employee yet.</div>}
          </div>
        </div>
      )}

      {safeTab === 'portal' && portalForm && (
        <div className="card card-pad">
          <PortalPreferencesEditor
            values={portalForm}
            onChange={(next) => setPortalForm(sanitizePortalPreferences(next, {
              permissionRecord: employee.permissions,
              fallbackRole: employee.tenant_user?.role || 'staff',
              selfStaffPaths: staffSelfPaths,
            }))}
            permissionRecord={employee.permissions}
            fallbackRole={employee.tenant_user?.role || 'staff'}
            selfStaffPaths={staffSelfPaths}
            disabled={!canManage && !viewingOwnProfile}
            heading={viewingOwnProfile ? 'My portal settings' : 'Portal settings'}
            subtitle={viewingOwnProfile
              ? 'Tune your own shell, dashboard, and entry point.'
              : 'Adjust this staff member’s portal theme, density, shortcuts, and dashboard shape without affecting the wider workspace.'}
          />
          {(canManage || viewingOwnProfile) && (
            <div style={{ marginTop: 18, display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-primary btn-sm" onClick={savePortal} disabled={saving}>Save portal settings</button>
            </div>
          )}
        </div>
      )}

      {safeTab === 'onboarding' && (
        <div className="card card-pad">
          <div className="section-head">
            <div>
              <h3 className="panel-title">Onboarding mode</h3>
              <div className="panel-sub">This is the first foundation for onboarding-only access without manually unchecking every page.</div>
            </div>
          </div>
          <div style={{ display: 'grid', gap: 2 }}>
            <InfoRow label="Current mode" value={permissionForm.onboarding_only ? 'Onboarding only' : 'Normal access'} />
            <InfoRow label="Account status" value={employee.status} />
            <InfoRow label="Unread notifications" value={String(notifications.filter(item => !item.read).length)} />
          </div>
        </div>
      )}

      {safeTab === 'lifecycle' && (
        <div className="card card-pad">
          <div className="section-head">
            <div>
              <h3 className="panel-title">Lifecycle controls</h3>
              <div className="panel-sub">Suspend, reinstate, and keep the canonical employee state aligned with the live portal account.</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btn-outline btn-sm" onClick={() => setLifecycle('active')} disabled={saving || !canManage}>Mark active</button>
            <button className="btn btn-outline btn-sm" onClick={() => setLifecycle('invited')} disabled={saving || !canManage}>Return to onboarding</button>
            <button className="btn btn-outline btn-sm" onClick={() => setLifecycle('suspended')} disabled={saving || !canManage}>Suspend access</button>
          </div>
        </div>
      )}

      {safeTab === 'notifications' && (
        <div className="card card-pad">
          <div className="section-head">
            <div>
              <h3 className="panel-title">Notifications</h3>
              <div className="panel-sub">Send targeted portal and email updates directly from the employee control centre.</div>
            </div>
          </div>
          {canManage && (
            <div className="detail-card" style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Send custom notification</div>
              <div className="fg" style={{ marginBottom: 14 }}>
                <div>
                  <label className="lbl">Title</label>
                  <input className="inp" value={notificationForm.title} onChange={e => setNotificationForm(prev => ({ ...prev, title: e.target.value }))} />
                </div>
                <div>
                  <label className="lbl">Category</label>
                  <select className="inp" value={notificationForm.category} onChange={e => setNotificationForm(prev => ({ ...prev, category: e.target.value }))}>
                    {['admin', 'hr', 'billing', 'task', 'policy', 'general'].map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </div>
                <div className="fc" style={{ gridColumn: '1 / -1' }}>
                  <label className="lbl">Message</label>
                  <textarea className="inp" rows="4" value={notificationForm.message} onChange={e => setNotificationForm(prev => ({ ...prev, message: e.target.value }))} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginBottom: 14 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--text)' }}>
                  <input type="checkbox" checked={notificationForm.isUrgent} onChange={e => setNotificationForm(prev => ({ ...prev, isUrgent: e.target.checked }))} />
                  Mark as urgent
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--text)' }}>
                  <input type="checkbox" checked={notificationForm.isPinned} onChange={e => setNotificationForm(prev => ({ ...prev, isPinned: e.target.checked }))} />
                  Pin in their centre
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--text)' }}>
                  <input type="checkbox" checked={notificationForm.sendEmail} onChange={e => setNotificationForm(prev => ({ ...prev, sendEmail: e.target.checked }))} />
                  Send to email too
                </label>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button className="btn btn-primary btn-sm" onClick={sendNotification} disabled={saving}>Send notification</button>
              </div>
            </div>
          )}
        </div>
      )}

      {safeTab === 'history' && (
        <div className="card card-pad">
          <div className="section-head">
            <div>
              <h3 className="panel-title">Notification history</h3>
              <div className="panel-sub">A clean audit trail of what this employee has already received in their portal and inbox.</div>
            </div>
          </div>
          <div style={{ display: 'grid', gap: 12 }}>
            {notifications.length ? notifications.map(note => (
              <div key={note.id} className="detail-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 6 }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>{note.title}</div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
                      <span className={`badge badge-${note.is_urgent ? 'red' : note.type === 'success' ? 'green' : note.type === 'warning' ? 'amber' : note.type === 'error' ? 'red' : 'blue'}`}>{note.is_urgent ? 'Urgent' : (note.type || 'info')}</span>
                      <span className="badge badge-grey">{note.category || 'general'}</span>
                      {note.is_pinned && <span className="badge badge-blue">Pinned</span>}
                      {note.sent_via_email && <span className="badge badge-green">Email sent</span>}
                    </div>
                  </div>
                  <span className={`badge badge-${note.read ? 'grey' : 'blue'}`}>{note.read ? 'Read' : 'Unread'}</span>
                </div>
                <div style={{ fontSize: 13, color: 'var(--sub)' }}>{note.message || 'No message'}</div>
                <div style={{ fontSize: 11, color: 'var(--faint)', marginTop: 8 }}>{new Date(note.created_at).toLocaleString('en-GB')}</div>
              </div>
            )) : <div className="compact-note">No notifications recorded for this user yet.</div>}
          </div>
        </div>
      )}
    </div>
  )
}
