import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { canManageWorkspaceSettings } from '../../utils/permissions'
import { deleteBanner, listBanners, saveBanner } from '../../utils/banners'
import { listEmployees } from '../../utils/employees'

const PAGE_OPTIONS = [
  ['all', 'All pages'],
  ['/', 'Dashboard'],
  ['/staff', 'Staff directory'],
  ['/leave', 'Leave'],
  ['/documents', 'Documents'],
  ['/timesheets', 'Timesheets'],
  ['/clients', 'Clients'],
  ['/tasks', 'Tasks'],
  ['/pipeline', 'Pipeline'],
  ['/outreach', 'Outreach'],
  ['/billing', 'Billing'],
  ['/reports', 'Reports'],
  ['/notifications', 'Notifications'],
  ['/onboarding-hr', 'Onboarding'],
]

const ROLE_OPTIONS = [
  ['all', 'Everyone'],
  ['owner', 'Owners'],
  ['admin', 'Admins'],
  ['manager', 'Managers'],
  ['staff', 'Staff'],
  ['onboarding', 'Onboarding only'],
]

const EMPTY_FORM = {
  title: '',
  message: '',
  tone: 'info',
  target_path: 'all',
  target_role: 'all',
  target_employee_id: '',
  enabled: true,
  starts_at: '',
  ends_at: '',
}

function toneCopy(tone) {
  if (tone === 'success') return 'green'
  if (tone === 'warning') return 'amber'
  if (tone === 'urgent') return 'red'
  return 'blue'
}

export default function Banners() {
  const { tenant, tenantUser } = useAuth()
  const canManage = canManageWorkspaceSettings(tenantUser?.role)
  const [banners, setBanners] = useState([])
  const [employees, setEmployees] = useState([])
  const [form, setForm] = useState(EMPTY_FORM)
  const [editingId, setEditingId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  const load = async () => {
    if (!tenant?.id) return
    setLoading(true)
    const [bannerRows, employeeRows] = await Promise.all([
      listBanners(tenant.id),
      listEmployees(tenant.id),
    ])
    setBanners(bannerRows || [])
    setEmployees((employeeRows || []).filter((employee) => !employee.is_shared_mailbox))
    setLoading(false)
  }

  useEffect(() => { load() }, [tenant?.id])

  const previewEmployee = useMemo(
    () => employees.find((employee) => employee.id === form.target_employee_id) || null,
    [employees, form.target_employee_id],
  )

  const resetForm = () => {
    setForm(EMPTY_FORM)
    setEditingId(null)
  }

  const editBanner = (banner) => {
    setEditingId(banner.id)
    setForm({
      title: banner.title || '',
      message: banner.message || '',
      tone: banner.tone || 'info',
      target_path: banner.target_path || 'all',
      target_role: banner.target_role || 'all',
      target_employee_id: banner.target_employee_id || '',
      enabled: banner.enabled !== false,
      starts_at: banner.starts_at ? banner.starts_at.slice(0, 16) : '',
      ends_at: banner.ends_at ? banner.ends_at.slice(0, 16) : '',
    })
  }

  const onSave = async () => {
    if (!canManage) return
    if (!form.title.trim()) {
      alert('Add a banner title first.')
      return
    }
    setSaving(true)
    try {
      await saveBanner({
        bannerId: editingId,
        tenantId: tenant.id,
        tenantUserId: tenantUser?.id,
        payload: form,
      })
      resetForm()
      await load()
    } catch (error) {
      alert(error.message)
    }
    setSaving(false)
  }

  const removeBanner = async (bannerId) => {
    if (!confirm('Delete this banner?')) return
    await deleteBanner(bannerId)
    if (editingId === bannerId) resetForm()
    await load()
  }

  if (!canManage) return <div className="card card-pad"><p style={{ color: 'var(--faint)' }}>Owner access required.</p></div>
  if (loading) return <div className="spin-wrap"><div className="spin" /></div>

  return (
    <div className="fade-in page-stack">
      <div className="page-hd">
        <div>
          <h1 className="page-title">Banners</h1>
          <p className="page-sub">Targeted workspace announcements with page, role, and per-person delivery controls.</p>
        </div>
      </div>

      <div className="admin-grid-2">
        <div className="card card-pad">
          <div className="section-head">
            <div>
              <h3 className="panel-title">{editingId ? 'Edit banner' : 'Create banner'}</h3>
              <div className="panel-sub">Build a banner once, then target it to a page, a role, or a specific employee.</div>
            </div>
          </div>
          <div className="fg">
            <div>
              <label className="lbl">Title</label>
              <input className="inp" value={form.title} onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))} />
            </div>
            <div>
              <label className="lbl">Tone</label>
              <select className="inp" value={form.tone} onChange={(e) => setForm((prev) => ({ ...prev, tone: e.target.value }))}>
                {['info', 'success', 'warning', 'urgent'].map((tone) => (
                  <option key={tone} value={tone}>{tone}</option>
                ))}
              </select>
            </div>
            <div className="fc" style={{ gridColumn: '1 / -1' }}>
              <label className="lbl">Message</label>
              <textarea className="inp" rows="4" value={form.message} onChange={(e) => setForm((prev) => ({ ...prev, message: e.target.value }))} />
            </div>
            <div>
              <label className="lbl">Target page</label>
              <select className="inp" value={form.target_path} onChange={(e) => setForm((prev) => ({ ...prev, target_path: e.target.value }))}>
                {PAGE_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="lbl">Target role</label>
              <select className="inp" value={form.target_role} onChange={(e) => setForm((prev) => ({ ...prev, target_role: e.target.value }))}>
                {ROLE_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="lbl">Target employee</label>
              <select className="inp" value={form.target_employee_id} onChange={(e) => setForm((prev) => ({ ...prev, target_employee_id: e.target.value }))}>
                <option value="">All matching people</option>
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>{employee.display_name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="lbl">Starts</label>
              <input className="inp" type="datetime-local" value={form.starts_at} onChange={(e) => setForm((prev) => ({ ...prev, starts_at: e.target.value }))} />
            </div>
            <div>
              <label className="lbl">Ends</label>
              <input className="inp" type="datetime-local" value={form.ends_at} onChange={(e) => setForm((prev) => ({ ...prev, ends_at: e.target.value }))} />
            </div>
            <div className="fc" style={{ justifyContent: 'center' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--text)', marginTop: 28 }}>
                <input type="checkbox" checked={form.enabled} onChange={(e) => setForm((prev) => ({ ...prev, enabled: e.target.checked }))} />
                Banner is live
              </label>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end', marginTop: 18 }}>
            {editingId && <button className="btn btn-outline btn-sm" onClick={resetForm}>Cancel edit</button>}
            <button className="btn btn-primary btn-sm" onClick={onSave} disabled={saving}>{saving ? 'Saving...' : editingId ? 'Update banner' : 'Create banner'}</button>
          </div>
        </div>

        <div className="card card-pad">
          <div className="section-head">
            <div>
              <h3 className="panel-title">Live preview</h3>
              <div className="panel-sub">This is how the banner will appear inside the app shell when a matching person opens the targeted page.</div>
            </div>
          </div>
          <div className={`announcement-preview announcement-preview-${toneCopy(form.tone)}`}>
            <div className="announcement-preview-head">
              <span className={`badge badge-${toneCopy(form.tone)}`}>{form.tone}</span>
              <span className="announcement-preview-target">
                {(PAGE_OPTIONS.find(([value]) => value === form.target_path)?.[1]) || 'All pages'} · {(ROLE_OPTIONS.find(([value]) => value === form.target_role)?.[1]) || 'Everyone'}
                {previewEmployee ? ` · ${previewEmployee.display_name}` : ''}
              </span>
            </div>
            <div className="announcement-preview-title">{form.title || 'Announcement title'}</div>
            <div className="announcement-preview-copy">{form.message || 'Use this space for operational announcements, deadline warnings, onboarding reminders, or people-specific updates.'}</div>
          </div>
          <div className="compact-note" style={{ marginTop: 14 }}>
            Targeting is additive: page + role + person. Leave a target blank to keep the banner broader.
          </div>
        </div>
      </div>

      <div className="card card-pad">
        <div className="section-head">
          <div>
            <h3 className="panel-title">Published banners</h3>
            <div className="panel-sub">Active and scheduled announcements for this workspace.</div>
          </div>
        </div>
        <div style={{ display: 'grid', gap: 12 }}>
          {banners.length ? banners.map((banner) => (
            <div key={banner.id} className="detail-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 220 }}>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                    <span className={`badge badge-${toneCopy(banner.tone)}`}>{banner.tone}</span>
                    <span className={`badge badge-${banner.enabled ? 'green' : 'grey'}`}>{banner.enabled ? 'Live' : 'Paused'}</span>
                    <span className="badge badge-grey">{PAGE_OPTIONS.find(([value]) => value === (banner.target_path || 'all'))?.[1] || 'All pages'}</span>
                    <span className="badge badge-grey">{ROLE_OPTIONS.find(([value]) => value === (banner.target_role || 'all'))?.[1] || 'Everyone'}</span>
                    {banner.target_employee_id && <span className="badge badge-blue">Person targeted</span>}
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>{banner.title}</div>
                  {banner.message && <div style={{ fontSize: 13, color: 'var(--sub)', lineHeight: 1.55 }}>{banner.message}</div>}
                  <div style={{ fontSize: 11, color: 'var(--faint)', marginTop: 10 }}>
                    {banner.starts_at ? `Starts ${new Date(banner.starts_at).toLocaleString('en-GB')}` : 'Starts immediately'}
                    {banner.ends_at ? ` · Ends ${new Date(banner.ends_at).toLocaleString('en-GB')}` : ''}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button className="btn btn-outline btn-sm" onClick={() => editBanner(banner)}>Edit</button>
                  <button className="btn btn-outline btn-sm" onClick={() => removeBanner(banner.id)}>Delete</button>
                </div>
              </div>
            </div>
          )) : (
            <div className="compact-note">No banners created yet.</div>
          )}
        </div>
      </div>
    </div>
  )
}
