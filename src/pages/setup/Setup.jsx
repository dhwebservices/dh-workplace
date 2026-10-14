import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { friendlyError, supabase } from '../../lib/supabase'
import { useWorkspace } from '../../lib/workspace'
import { DHMark } from '../../components/Icons'

const COLOURS = ['blue', 'orange', 'green', 'purple', 'red', 'teal', 'grey']
const SWATCH = { blue: '#155f96', orange: '#93500f', green: '#1d6b33', purple: '#5a3a9e', red: '#a3301f', teal: '#17635d', grey: '#48484a' }

export default function Setup() {
  const { user, refresh, setBusinessId } = useWorkspace()
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [business, setBusiness] = useState({
    name: '', ownerName: user?.user_metadata?.full_name || '', siteName: '', address: '',
  })
  const [created, setCreated] = useState(null) // { businessId, siteId }
  const [departments, setDepartments] = useState([
    { name: 'Bar', colour: 'blue' }, { name: 'Kitchen', colour: 'orange' }, { name: 'Floor', colour: 'green' },
  ])
  const [savedDepartments, setSavedDepartments] = useState([])
  const [invites, setInvites] = useState([{ name: '', email: '', department: '' }])

  async function run(action) {
    setBusy(true)
    setError('')
    try {
      await action()
    } catch (e) {
      setError(friendlyError(e))
    }
    setBusy(false)
  }

  const saveBusiness = (event) => {
    event.preventDefault()
    run(async () => {
      const { data: businessId, error: e1 } = await supabase.rpc('create_business', {
        p_name: business.name, p_owner_name: business.ownerName, p_site_name: business.siteName || business.name,
      })
      if (e1) throw e1
      const { data: site, error: e2 } = await supabase.from('sites').select('id').eq('business_id', businessId).single()
      if (e2) throw e2
      if (business.address) await supabase.from('sites').update({ address: business.address }).eq('id', site.id)
      setCreated({ businessId, siteId: site.id })
      setStep(2)
    })
  }

  const saveDepartments = (event) => {
    event.preventDefault()
    run(async () => {
      const rows = departments.filter((d) => d.name.trim()).map((d) => ({
        business_id: created.businessId, site_id: created.siteId, name: d.name.trim(), colour: d.colour,
      }))
      const { data, error: e } = await supabase.from('departments').insert(rows).select('id, name')
      if (e) throw e
      setSavedDepartments(data)
      setInvites([{ name: '', email: '', department: data[0]?.id || '' }])
      setStep(3)
    })
  }

  const saveInvites = (event) => {
    event.preventDefault()
    run(async () => {
      for (const invite of invites.filter((i) => i.name.trim() && i.email.trim())) {
        const { error: e } = await supabase.rpc('invite_person', {
          p_business: created.businessId, p_full_name: invite.name, p_email: invite.email,
          p_department: invite.department || null,
        })
        if (e) throw e
      }
      await finish()
    })
  }

  async function finish() {
    await refresh()
    setBusinessId(created.businessId)
    navigate('/rota')
  }

  return (
    <div className="setup">
      <div className="brand-row"><span className="mark" style={{ background: 'var(--graphite)' }}><DHMark /></span>Workplace</div>
      <div className="steps">{[1, 2, 3].map((n) => <i key={n} className={n <= step ? 'on' : ''} />)}</div>

      {step === 1 && (
        <form className="stack" onSubmit={saveBusiness}>
          <h1>Your business</h1>
          <p className="sub">This is what your team will see when they open Workplace.</p>
          <label className="field"><span>Business name</span>
            <input className="input" required value={business.name} onChange={(e) => setBusiness({ ...business, name: e.target.value })} />
          </label>
          <label className="field"><span>Your name</span>
            <input className="input" required value={business.ownerName} onChange={(e) => setBusiness({ ...business, ownerName: e.target.value })} />
          </label>
          <div className="row2">
            <label className="field"><span>Site name <em>if different</em></span>
              <input className="input" placeholder={business.name} value={business.siteName} onChange={(e) => setBusiness({ ...business, siteName: e.target.value })} />
            </label>
            <label className="field"><span>Postcode or address</span>
              <input className="input" value={business.address} onChange={(e) => setBusiness({ ...business, address: e.target.value })} />
            </label>
          </div>
          <p className="form-note">The address lets staff clock in only when they’re actually at work. You can add more sites later.</p>
          {error && <p className="form-error">{error}</p>}
          <button className="btn primary lg" disabled={busy}>Continue</button>
        </form>
      )}

      {step === 2 && (
        <form className="stack" onSubmit={saveDepartments}>
          <h1>Departments</h1>
          <p className="sub">Group your team the way your rota works. Each department gets its own colour on the rota.</p>
          <div className="list-edit">
            {departments.map((d, i) => (
              <div className="item" key={i}>
                <button type="button" className="swatch" style={{ background: SWATCH[d.colour] }} aria-label="Change colour"
                  onClick={() => setDepartments(departments.map((x, j) => j === i ? { ...x, colour: COLOURS[(COLOURS.indexOf(x.colour) + 1) % COLOURS.length] } : x))} />
                <input className="input" value={d.name} onChange={(e) => setDepartments(departments.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} />
                <button type="button" className="btn" onClick={() => setDepartments(departments.filter((_, j) => j !== i))}>Remove</button>
              </div>
            ))}
          </div>
          <button type="button" className="link-btn" style={{ justifySelf: 'start' }}
            onClick={() => setDepartments([...departments, { name: '', colour: COLOURS[departments.length % COLOURS.length] }])}>Add a department</button>
          {error && <p className="form-error">{error}</p>}
          <button className="btn primary lg" disabled={busy || !departments.some((d) => d.name.trim())}>Continue</button>
        </form>
      )}

      {step === 3 && (
        <form className="stack" onSubmit={saveInvites}>
          <h1>Add your team</h1>
          <p className="sub">They’ll join your rota when they sign up with the same email. You can add more people any time.</p>
          <div className="list-edit">
            {invites.map((inv, i) => (
              <div className="item" key={i}>
                <input className="input" placeholder="Name" value={inv.name} onChange={(e) => setInvites(invites.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} />
                <input className="input" type="email" placeholder="Email" value={inv.email} onChange={(e) => setInvites(invites.map((x, j) => j === i ? { ...x, email: e.target.value } : x))} />
                <select className="input" style={{ maxWidth: 140 }} value={inv.department} onChange={(e) => setInvites(invites.map((x, j) => j === i ? { ...x, department: e.target.value } : x))}>
                  {savedDepartments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
            ))}
          </div>
          <button type="button" className="link-btn" style={{ justifySelf: 'start' }}
            onClick={() => setInvites([...invites, { name: '', email: '', department: savedDepartments[0]?.id || '' }])}>Add another person</button>
          {error && <p className="form-error">{error}</p>}
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn primary lg" disabled={busy}>Finish Setup</button>
            <button type="button" className="btn lg" disabled={busy} onClick={() => run(finish)}>Skip for Now</button>
          </div>
        </form>
      )}
    </div>
  )
}
