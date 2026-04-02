import { useState, useEffect, useMemo, useRef } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { sbDelete, sbGetMany, sbInsert } from '../../utils/supabase'
import { supabase } from '../../utils/supabase'
import { canManageDocuments } from '../../utils/permissions'
import { listEmployees } from '../../utils/employees'

const CATEGORIES = ['general', 'policy', 'contract', 'payslip', 'onboarding']

function daysUntil(dateValue) {
  if (!dateValue) return null
  return Math.ceil((new Date(dateValue).getTime() - Date.now()) / 86400000)
}

export default function Documents() {
  const { tenant, tenantUser } = useAuth()
  const [docs, setDocs] = useState([])
  const [acknowledgements, setAcknowledgements] = useState([])
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [uploading, setUploading] = useState(false)
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({ name: '', category: 'general', visible_to: 'all', employee_id: '', expires_at: '', requires_acknowledgement: false })
  const [file, setFile] = useState(null)
  const fileRef = useRef()
  const canManage = canManageDocuments(tenantUser?.role)

  useEffect(() => { load() }, [tenant?.id])

  const canViewDoc = (doc) => {
    if (doc.visible_to === 'all') return true
    if (doc.visible_to === 'managers') return ['owner', 'admin', 'manager', 'superadmin'].includes(tenantUser?.role)
    if (doc.visible_to === 'owner') return ['owner', 'superadmin'].includes(tenantUser?.role)
    return false
  }

  const load = async () => {
    if (!tenant?.id) return
    setLoading(true)
    const [documents, employeeRows, ackRows] = await Promise.all([
      sbGetMany('documents', `tenant_id=eq.${tenant.id}&order=created_at.desc`),
      listEmployees(tenant.id),
      sbGetMany('document_acknowledgements', `tenant_id=eq.${tenant.id}&order=acknowledged_at.desc`),
    ])
    setDocs(documents || [])
    setEmployees((employeeRows || []).filter((employee) => employee.is_person && !employee.is_shared_mailbox))
    setAcknowledgements(ackRows || [])
    setLoading(false)
  }

  const upload = async () => {
    if (!file || !form.name.trim()) { alert('File and name required'); return }
    setUploading(true)
    try {
      const path = `${tenant.id}/${Date.now()}-${file.name}`
      const { error: upErr } = await supabase.storage.from('documents').upload(path, file)
      if (upErr) throw upErr
      const { data: urlData } = supabase.storage.from('documents').getPublicUrl(path)
      await sbInsert('documents', {
        tenant_id: tenant.id,
        name: form.name,
        category: form.category,
        visible_to: form.visible_to,
        employee_id: form.employee_id || null,
        expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : null,
        requires_acknowledgement: form.requires_acknowledgement,
        file_url: urlData.publicUrl,
        file_path: path,
        uploaded_by: tenantUser.id,
        created_at: new Date().toISOString(),
      })
      setModal(false)
      setForm({ name: '', category: 'general', visible_to: 'all', employee_id: '', expires_at: '', requires_acknowledgement: false })
      setFile(null)
      load()
    } catch (e) { alert('Upload failed: ' + e.message) }
    setUploading(false)
  }

  const deleteDoc = async (doc) => {
    if (!confirm(`Delete "${doc.name}"?`)) return
    if (doc.file_path) await supabase.storage.from('documents').remove([doc.file_path]).catch(() => {})
    await sbDelete('documents', `id=eq.${doc.id}`)
    setDocs((prev) => prev.filter((item) => item.id !== doc.id))
  }

  const filtered = docs.filter((doc) => canViewDoc(doc) && (filter === 'all' || doc.category === filter))
  const CAT_BADGE = { policy: 'badge-blue', contract: 'badge-amber', payslip: 'badge-green', onboarding: 'badge-gold', general: 'badge-grey' }
  const fileType = (name = '') => {
    const ext = name.split('.').pop().toLowerCase()
    if (ext === 'pdf') return 'PDF'
    if (['doc', 'docx'].includes(ext)) return 'DOC'
    if (['jpg', 'png', 'jpeg'].includes(ext)) return 'IMG'
    if (['xlsx', 'csv'].includes(ext)) return 'DATA'
    return 'FILE'
  }

  const employeeById = useMemo(() => new Map(employees.map((employee) => [employee.id, employee])), [employees])

  const overview = useMemo(() => {
    const visible = docs.filter(canViewDoc)
    const expiring = visible.filter((doc) => {
      const days = daysUntil(doc.expires_at)
      return days !== null && days <= 30
    }).length
    const needsAck = visible.filter((doc) => doc.requires_acknowledgement).length
    const payslips = visible.filter((doc) => doc.category === 'payslip').length
    return { total: visible.length, expiring, needsAck, payslips }
  }, [docs, tenantUser?.role])

  const ackCountFor = (documentId) => acknowledgements.filter((ack) => ack.document_id === documentId).length

  return (
    <div className="fade-in page-stack">
      <div className="page-hd">
        <div>
          <h1 className="page-title">Documents</h1>
          <p className="page-sub">Operational document control, expiry visibility, and employee-linked files.</p>
        </div>
        {canManage && <button className="btn btn-primary" onClick={() => setModal(true)}>+ Upload Document</button>}
      </div>

      <div className="kpi-strip">
        <div className="kpi-cell">
          <div className="kpi-cell-label">Visible docs</div>
          <div className="kpi-cell-value">{overview.total}</div>
        </div>
        <div className="kpi-cell">
          <div className="kpi-cell-label">Expiring in 30 days</div>
          <div className="kpi-cell-value">{overview.expiring}</div>
        </div>
        <div className="kpi-cell">
          <div className="kpi-cell-label">Needs acknowledgement</div>
          <div className="kpi-cell-value">{overview.needsAck}</div>
        </div>
        <div className="kpi-cell">
          <div className="kpi-cell-label">Payslips</div>
          <div className="kpi-cell-value">{overview.payslips}</div>
        </div>
      </div>

      <div className="table-toolbar">
        <div className="filter-pills">
          {['all', ...CATEGORIES].map((category) => (
            <button key={category} onClick={() => setFilter(category)} className={`btn btn-sm ${filter === category ? 'btn-primary' : 'btn-outline'}`} style={{ textTransform: 'capitalize' }}>
              {category}
            </button>
          ))}
        </div>
        <div className="compact-note">Use employee-linked documents for contracts and payslips, and keep expiring records visible before they become a compliance problem.</div>
      </div>

      {loading ? (
        <div className="card card-pad">{[1, 2, 3].map((i) => <div key={i} className="skel" style={{ height: 60, marginBottom: 10, borderRadius: 8 }} />)}</div>
      ) : filtered.length === 0 ? (
        <div className="card"><div className="empty"><p>No documents found</p></div></div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 16 }}>
          {filtered.map((doc) => {
            const assignedEmployee = doc.employee_id ? employeeById.get(doc.employee_id) : null
            const expiryDays = daysUntil(doc.expires_at)
            const expiryTone = expiryDays !== null && expiryDays < 0 ? 'red' : expiryDays !== null && expiryDays <= 30 ? 'amber' : 'grey'
            return (
              <div key={doc.id} className="card card-pad" style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                <div style={{ width: 50, height: 50, borderRadius: 14, background: 'var(--blue-soft)', border: '1px solid var(--blue-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: 'var(--blue)', flexShrink: 0 }}>
                  {fileType(doc.name)}
                </div>
                <div style={{ flex: 1, overflow: 'hidden' }}>
                  <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.name}</div>
                  <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
                    <span className={`badge ${CAT_BADGE[doc.category] || 'badge-grey'}`} style={{ textTransform: 'capitalize', fontSize: 10 }}>{doc.category}</span>
                    {doc.visible_to !== 'all' && <span className="badge badge-amber" style={{ fontSize: 10, textTransform: 'capitalize' }}>{doc.visible_to}</span>}
                    {doc.requires_acknowledgement && <span className="badge badge-blue" style={{ fontSize: 10 }}>Ack required</span>}
                    {expiryDays !== null && <span className={`badge badge-${expiryTone}`} style={{ fontSize: 10 }}>{expiryDays < 0 ? 'Expired' : `${expiryDays}d left`}</span>}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--faint)', marginBottom: 8 }}>
                    Uploaded {new Date(doc.created_at).toLocaleDateString('en-GB')}
                    {assignedEmployee ? ` · ${assignedEmployee.display_name}` : ''}
                  </div>
                  {doc.requires_acknowledgement && (
                    <div style={{ fontSize: 11, color: 'var(--sub)', marginBottom: 10 }}>
                      {ackCountFor(doc.id)} acknowledgement{ackCountFor(doc.id) === 1 ? '' : 's'} recorded
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <a href={doc.file_url} target="_blank" rel="noreferrer" className="btn btn-outline btn-sm">View</a>
                    <a href={doc.file_url} download={doc.name} className="btn btn-outline btn-sm">Download</a>
                    {canManage && <button className="btn btn-sm btn-outline" style={{ color: 'var(--red)', borderColor: 'rgba(222,91,77,0.22)', background: 'var(--red-soft)' }} onClick={() => deleteDoc(doc)}>Delete</button>}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {modal && (
        <div className="modal-overlay" onClick={() => setModal(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-hd">
              <span style={{ fontWeight: 600 }}>Upload document</span>
              <button onClick={() => setModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: 'var(--faint)' }}>×</button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div><label className="lbl">Document Name</label><input className="inp" placeholder="Employee Handbook 2026" value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} /></div>
                <div><label className="lbl">Category</label>
                  <select className="inp" value={form.category} onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))}>
                    {CATEGORIES.map((category) => <option key={category} value={category} style={{ textTransform: 'capitalize' }}>{category.charAt(0).toUpperCase() + category.slice(1)}</option>)}
                  </select>
                </div>
                <div><label className="lbl">Visible To</label>
                  <select className="inp" value={form.visible_to} onChange={(e) => setForm((prev) => ({ ...prev, visible_to: e.target.value }))}>
                    <option value="all">All Staff</option>
                    <option value="managers">Managers Only</option>
                    <option value="owner">Owner Only</option>
                  </select>
                </div>
                <div><label className="lbl">Assign to employee</label>
                  <select className="inp" value={form.employee_id} onChange={(e) => setForm((prev) => ({ ...prev, employee_id: e.target.value }))}>
                    <option value="">Not employee-specific</option>
                    {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.display_name}</option>)}
                  </select>
                </div>
                <div><label className="lbl">Expiry date</label><input className="inp" type="date" value={form.expires_at} onChange={(e) => setForm((prev) => ({ ...prev, expires_at: e.target.value }))} /></div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--text)' }}>
                  <input type="checkbox" checked={form.requires_acknowledgement} onChange={(e) => setForm((prev) => ({ ...prev, requires_acknowledgement: e.target.checked }))} />
                  Require acknowledgement
                </label>
                <div>
                  <label className="lbl">File</label>
                  <input ref={fileRef} type="file" accept=".pdf,.doc,.docx,.png,.jpg,.xlsx,.csv" style={{ display: 'none' }} onChange={(e) => setFile(e.target.files[0])} />
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <button className="btn btn-outline" onClick={() => fileRef.current?.click()}>Choose File</button>
                    {file && <span style={{ fontSize: 13, color: 'var(--sub)' }}>{file.name}</span>}
                  </div>
                </div>
              </div>
            </div>
            <div className="modal-ft">
              <button className="btn btn-outline" onClick={() => setModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={upload} disabled={uploading}>{uploading ? 'Uploading...' : 'Upload'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
