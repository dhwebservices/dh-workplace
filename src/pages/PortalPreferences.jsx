import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import PortalPreferencesEditor from '../components/portal/PortalPreferencesEditor'
import { applyPortalAppearance, savePortalPreferences, sanitizePortalPreferences } from '../utils/portalPreferences'

export default function PortalPreferencesPage() {
  const { tenant, tenantUser, employeeRecord, employeePermissions, portalPreferences, setPortalPreferences, refreshTenant } = useAuth()
  const [form, setForm] = useState(portalPreferences)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setForm(portalPreferences)
  }, [portalPreferences])

  const selfStaffPaths = useMemo(() => (
    [employeeRecord?.id, employeeRecord?.tenant_user_id, tenantUser?.id]
      .filter(Boolean)
      .map((identifier) => `/staff/${identifier}`)
  ), [employeeRecord?.id, employeeRecord?.tenant_user_id, tenantUser?.id])

  const effectiveForm = form || portalPreferences

  const updateForm = (next) => {
    const sanitized = sanitizePortalPreferences(next, {
      permissionRecord: employeePermissions,
      fallbackRole: tenantUser?.role,
      selfStaffPaths,
    })
    setForm(sanitized)
    applyPortalAppearance(sanitized, tenant?.primary_colour || null)
  }

  const save = async () => {
    if (!tenant?.id || !employeeRecord?.id || !effectiveForm) return
    setSaving(true)
    try {
      await savePortalPreferences({
        preferenceId: portalPreferences?.id,
        tenantId: tenant.id,
        employeeId: employeeRecord.id,
        values: effectiveForm,
      })
      setPortalPreferences(effectiveForm)
      await refreshTenant()
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (error) {
      alert(error.message)
    }
    setSaving(false)
  }

  if (!employeeRecord) {
    return <div className="card card-pad"><p style={{ color: 'var(--faint)' }}>Portal preferences are available once your staff profile is linked.</p></div>
  }

  return (
    <div className="fade-in page-stack">
      <div className="page-hd">
        <div>
          <h1 className="page-title">Personalisation</h1>
          <p className="page-sub">Shape how your workspace looks, where it opens, and which dashboard surfaces stay in view.</p>
        </div>
        {saved && <span style={{ fontSize: 13, color: 'var(--green)', fontWeight: 700 }}>Saved</span>}
      </div>

      <div className="compact-note">These preferences are stored against your internal employee profile, so admins can review or update them from your staff profile when needed.</div>

      {effectiveForm && (
        <div className="card card-pad">
          <PortalPreferencesEditor
            values={effectiveForm}
            onChange={updateForm}
            permissionRecord={employeePermissions}
            fallbackRole={tenantUser?.role}
            selfStaffPaths={selfStaffPaths}
            heading="Your portal settings"
            subtitle="Tune the shell, dashboard, and entry point without changing anyone else’s workspace."
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
            <button className="btn btn-primary" onClick={save} disabled={saving}>
              {saving ? 'Saving...' : 'Save portal preferences'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
