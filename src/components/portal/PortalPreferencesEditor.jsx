import {
  ACCENT_SCHEMES,
  DASHBOARD_SECTIONS,
  DEFAULT_PORTAL_PREFERENCES,
  LANDING_PAGE_OPTIONS,
  QUICK_ACTION_OPTIONS,
  getAllowedLandingOptions,
  getAllowedQuickActions,
  getAccentScheme,
} from '../../utils/portalPreferences'

function SectionReorder({ values, onChange }) {
  const order = values.dashboard_section_order || DEFAULT_PORTAL_PREFERENCES.dashboard_section_order

  const move = (id, direction) => {
    const index = order.indexOf(id)
    const nextIndex = direction === 'up' ? index - 1 : index + 1
    if (index < 0 || nextIndex < 0 || nextIndex >= order.length) return
    const next = [...order]
    const [item] = next.splice(index, 1)
    next.splice(nextIndex, 0, item)
    onChange({ ...values, dashboard_section_order: next })
  }

  const toggleVisibility = (id) => {
    const visible = values.visible_dashboard_sections || DEFAULT_PORTAL_PREFERENCES.visible_dashboard_sections
    const nextVisible = visible.includes(id)
      ? visible.filter((item) => item !== id)
      : [...visible, id]
    onChange({ ...values, visible_dashboard_sections: nextVisible })
  }

  return (
    <div className="portal-section-list">
      {order.map((id, index) => {
        const section = DASHBOARD_SECTIONS.find((item) => item.id === id)
        if (!section) return null
        const visible = (values.visible_dashboard_sections || []).includes(id)
        return (
          <div key={id} className={`portal-order-row ${visible ? '' : 'muted'}`}>
            <label className="portal-order-label">
              <input type="checkbox" checked={visible} onChange={() => toggleVisibility(id)} />
              <span>{section.label}</span>
            </label>
            <div className="portal-order-actions">
              <button type="button" className="btn btn-outline btn-sm" onClick={() => move(id, 'up')} disabled={index === 0}>Up</button>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => move(id, 'down')} disabled={index === order.length - 1}>Down</button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function PortalPreferencesEditor({
  values,
  onChange,
  permissionRecord,
  fallbackRole = 'staff',
  selfStaffPaths = [],
  disabled = false,
  heading = 'Portal preferences',
  subtitle = 'Control the workspace shell, dashboard density, and where this person lands after login.',
}) {
  const allowedLandingOptions = getAllowedLandingOptions(permissionRecord, fallbackRole, selfStaffPaths)
  const allowedQuickActions = getAllowedQuickActions(permissionRecord, fallbackRole, selfStaffPaths)
  const previewScheme = getAccentScheme(values.accent_scheme)

  const setValue = (key, nextValue) => onChange({ ...values, [key]: nextValue })
  const togglePinnedAction = (id) => {
    const current = values.pinned_quick_actions || []
    const next = current.includes(id)
      ? current.filter((item) => item !== id)
      : [...current, id].slice(0, 5)
    setValue('pinned_quick_actions', next)
  }

  return (
    <div className="stack-lg">
      <div className="section-head">
        <div>
          <h3 className="panel-title">{heading}</h3>
          <div className="panel-sub">{subtitle}</div>
        </div>
      </div>

      <div className="portal-preview" style={{ '--preview-accent': previewScheme.accent || '#3478f6', '--preview-soft': previewScheme.soft || 'rgba(52,120,246,0.14)' }}>
        <div className="portal-preview-shell">
          <div className="portal-preview-sidebar">
            <div className="portal-preview-brand">DH Workplace</div>
            <div className="portal-preview-nav">
              <span className="active">Dashboard</span>
              <span>Notifications</span>
              <span>Clients</span>
            </div>
          </div>
          <div className="portal-preview-content">
            <div className={`portal-preview-header ${values.dashboard_header_style === 'minimal' ? 'minimal' : ''}`}>
              <div>
                <div className="portal-preview-title">{values.dashboard_header_style === 'minimal' ? 'Workspace' : 'Your workspace, tuned your way'}</div>
                {values.dashboard_header_style === 'full' && <div className="portal-preview-copy">Theme, accents, density, sections, and quick actions all stay in sync.</div>}
              </div>
              <div className="badge badge-blue">{values.theme_mode}</div>
            </div>
            <div className={`portal-preview-grid ${values.dashboard_density === 'compact' ? 'compact' : ''}`}>
              <div className="portal-preview-panel active">Active nav + tabs use the stronger accent.</div>
              <div className="portal-preview-panel">Inactive surfaces keep a quieter tint.</div>
              <div className="portal-preview-panel wide">Cards, filters, tables, banners, and notifications inherit the same scheme without flooding the UI.</div>
            </div>
          </div>
        </div>
      </div>

      <div className="fg portal-editor-grid">
        <div className="card card-pad">
          <div className="section-head">
            <div>
              <h4 className="portal-card-title">Appearance</h4>
              <div className="panel-sub">Theme, accent, density, and header treatment.</div>
            </div>
          </div>
          <div className="stack-md">
            <div>
              <label className="lbl">Theme mode</label>
              <div className="filter-pills">
                {['light', 'dark'].map((mode) => (
                  <button key={mode} type="button" className={`btn btn-sm ${values.theme_mode === mode ? 'btn-primary' : 'btn-outline'}`} onClick={() => setValue('theme_mode', mode)} disabled={disabled}>
                    {mode[0].toUpperCase() + mode.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="lbl">Accent scheme</label>
              <div className="portal-scheme-grid">
                {ACCENT_SCHEMES.map((scheme) => {
                  const swatch = getAccentScheme(scheme.id)
                  return (
                    <button
                      key={scheme.id}
                      type="button"
                      className={`portal-swatch ${values.accent_scheme === scheme.id ? 'active' : ''}`}
                      onClick={() => setValue('accent_scheme', scheme.id)}
                      disabled={disabled}
                    >
                      <span className="portal-swatch-chip" style={{ background: swatch.accent || '#3478f6' }} />
                      <span>{scheme.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>
            <div>
              <label className="lbl">Dashboard density</label>
              <div className="filter-pills">
                {['comfortable', 'compact'].map((value) => (
                  <button key={value} type="button" className={`btn btn-sm ${values.dashboard_density === value ? 'btn-primary' : 'btn-outline'}`} onClick={() => setValue('dashboard_density', value)} disabled={disabled}>
                    {value[0].toUpperCase() + value.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="lbl">Dashboard header</label>
              <div className="filter-pills">
                {['full', 'minimal'].map((value) => (
                  <button key={value} type="button" className={`btn btn-sm ${values.dashboard_header_style === value ? 'btn-primary' : 'btn-outline'}`} onClick={() => setValue('dashboard_header_style', value)} disabled={disabled}>
                    {value[0].toUpperCase() + value.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <label className="portal-inline-toggle">
              <input type="checkbox" checked={values.show_system_banners} onChange={(event) => setValue('show_system_banners', event.target.checked)} disabled={disabled} />
              <div>
                <div className="portal-inline-title">Show system banners</div>
                <div className="compact-note">Hide in-app announcements and policy banners for this user if they prefer a quieter portal.</div>
              </div>
            </label>
          </div>
        </div>

        <div className="card card-pad">
          <div className="section-head">
            <div>
              <h4 className="portal-card-title">Entry and shortcuts</h4>
              <div className="panel-sub">Choose where the app opens and which actions stay surfaced first.</div>
            </div>
          </div>
          <div className="stack-md">
            <div>
              <label className="lbl">Default landing page</label>
              <select className="inp" value={values.default_landing_page} onChange={(event) => setValue('default_landing_page', event.target.value)} disabled={disabled}>
                {allowedLandingOptions.map((option) => (
                  <option key={option.id} value={option.id}>{option.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="lbl">Pinned quick actions</label>
              <div className="portal-chip-grid">
                {allowedQuickActions.map((action) => {
                  const active = (values.pinned_quick_actions || []).includes(action.id)
                  return (
                    <button key={action.id} type="button" className={`portal-chip ${active ? 'active' : ''}`} onClick={() => togglePinnedAction(action.id)} disabled={disabled}>
                      {action.label}
                    </button>
                  )
                })}
              </div>
              <div className="compact-note">Choose up to five shortcuts. Hidden or blocked pages stay unavailable automatically.</div>
            </div>
          </div>
        </div>

        <div className="card card-pad fc">
          <div className="section-head">
            <div>
              <h4 className="portal-card-title">Dashboard sections</h4>
              <div className="panel-sub">Pick which dashboard sections stay visible and how they stack from top to bottom.</div>
            </div>
          </div>
          <SectionReorder values={values} onChange={onChange} />
        </div>
      </div>
    </div>
  )
}
