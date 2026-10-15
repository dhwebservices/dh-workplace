import { useCallback, useEffect, useMemo, useState } from 'react'
import { friendlyError, supabase } from '../../lib/supabase'
import { useWorkspace } from '../../lib/workspace'
import Avatar from '../../components/Avatar'

const CONTRACTS = { full_time: 'Full time', part_time: 'Part time', zero_hours: 'Zero hours', casual: 'Casual' }
const ROLE_NAMES = { owner: 'Owner', manager: 'Manager', department_manager: 'Department manager', supervisor: 'Supervisor', staff: 'Staff' }
const ROLE_ORDER = ['owner', 'manager', 'department_manager', 'supervisor', 'staff']

export default function People() {
  const { businessId, can } = useWorkspace()
  const [people, setPeople] = useState([])
  const [details, setDetails] = useState([])
  const [roles, setRoles] = useState([])
  const [memberships, setMemberships] = useState([])
  const [departments, setDepartments] = useState([])
  const [filter, setFilter] = useState('all')
  const [inviting, setInviting] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', department: '', contract: 'part_time' })
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!businessId) return
    const [p, d, r, m, dept] = await Promise.all([
      supabase.from('people').select('id, full_name, user_id, active').eq('business_id', businessId).order('full_name'),
      supabase.from('person_details').select('person_id, email, contract_type').eq('business_id', businessId),
      supabase.from('role_assignments').select('person_id, role').eq('business_id', businessId),
      supabase.from('person_departments').select('person_id, department_id').eq('business_id', businessId),
      supabase.from('departments').select('id, name').eq('business_id', businessId).order('name'),
    ])
    setPeople(p.data || [])
    setDetails(d.data || [])
    setRoles(r.data || [])
    setMemberships(m.data || [])
    setDepartments(dept.data || [])
    setForm((f) => ({ ...f, department: f.department || dept.data?.[0]?.id || '' }))
  }, [businessId])

  useEffect(() => { load() }, [load])

  const rows = useMemo(() => people.map((person) => {
    const detail = details.find((x) => x.person_id === person.id)
    const personRoles = roles.filter((x) => x.person_id === person.id).map((x) => x.role)
    const topRole = ROLE_ORDER.find((r) => personRoles.includes(r)) || 'staff'
    const deptNames = memberships.filter((x) => x.person_id === person.id)
      .map((x) => departments.find((d) => d.id === x.department_id)?.name).filter(Boolean)
    return { person, detail, topRole, deptNames, contract: detail?.contract_type }
  }), [people, details, roles, memberships, departments])

  const counts = Object.keys(CONTRACTS).map((k) => [k, rows.filter((r) => r.contract === k).length]).filter(([, n]) => n)
  const shown = filter === 'all' ? rows : rows.filter((r) => r.contract === filter)

  async function invite(event) {
    event.preventDefault()
    setError('')
    const { error: e } = await supabase.rpc('invite_person', {
      p_business: businessId, p_full_name: form.name, p_email: form.email,
      p_department: form.department || null, p_contract: form.contract || null,
    })
    if (e) {
      setError(friendlyError(e))
      return
    }
    setInviting(false)
    setForm({ name: '', email: '', department: departments[0]?.id || '', contract: 'part_time' })
    load()
  }

  return (
    <>
      <div className="page-head">
        <h1>People</h1>
        <div className="spacer" />
        {can('staff.manage') && <button className="btn primary" type="button" onClick={() => setInviting(true)}>Add Person</button>}
      </div>
      <div className="filters">
        <button className={`filter${filter === 'all' ? ' on' : ''}`} type="button" onClick={() => setFilter('all')}>All {rows.length}</button>
        {counts.map(([k, n]) => (
          <button key={k} className={`filter${filter === k ? ' on' : ''}`} type="button" onClick={() => setFilter(k)}>{CONTRACTS[k]} {n}</button>
        ))}
      </div>
      {rows.length <= 1 && can('staff.manage') ? (
        <div className="empty-state">
          <h2>Add your team</h2>
          <p>Add each person with their email. When they sign up with that email, they’ll see the rota straight away.</p>
          <button className="btn primary lg" type="button" onClick={() => setInviting(true)}>Add Person</button>
        </div>
      ) : (
        <table className="list people-table">
          <thead><tr><th>Name</th><th>Role</th><th>Department</th><th>Contract</th><th>Status</th></tr></thead>
          <tbody>
            {shown.map(({ person, detail, topRole, deptNames, contract }) => (
              <tr key={person.id}>
                <td><div className="person"><Avatar name={person.full_name} /><div><b>{person.full_name}</b><span>{detail?.email || ''}</span></div></div></td>
                <td>{ROLE_NAMES[topRole]}</td>
                <td>{deptNames.join(', ') || <span className="muted">None</span>}</td>
                <td>{CONTRACTS[contract] || <span className="muted">Not set</span>}</td>
                <td>{person.user_id ? <span className="status ok">Joined</span> : <span className="status wait">Invited</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {inviting && (
        <div className="scrim" onClick={() => setInviting(false)}>
          <form className="dialog" onClick={(e) => e.stopPropagation()} onSubmit={invite}>
            <h2>Add a person</h2>
            <label className="field"><span>Name</span>
              <input className="input" required autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </label>
            <label className="field"><span>Email</span>
              <input className="input" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </label>
            <div className="row2">
              <label className="field"><span>Department</span>
                <select className="input" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })}>
                  {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </label>
              <label className="field"><span>Contract</span>
                <select className="input" value={form.contract} onChange={(e) => setForm({ ...form, contract: e.target.value })}>
                  {Object.entries(CONTRACTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </label>
            </div>
            <p className="form-note">They’ll join when they sign up at app.dhworkplace.co.uk with this email.</p>
            {error && <p className="form-error">{error}</p>}
            <div className="actions">
              <button type="button" className="btn" onClick={() => setInviting(false)}>Cancel</button>
              <button className="btn primary">Add Person</button>
            </div>
          </form>
        </div>
      )}
    </>
  )
}
