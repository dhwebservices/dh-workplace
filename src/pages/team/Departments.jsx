import { useCallback, useEffect, useState } from 'react'
import { friendlyError, supabase } from '../../lib/supabase'
import { useWorkspace } from '../../lib/workspace'

const COLOURS = ['blue', 'orange', 'green', 'purple', 'red', 'teal', 'grey']

export default function Departments() {
  const { businessId, can } = useWorkspace()
  const [sites, setSites] = useState([])
  const [departments, setDepartments] = useState([])
  const [newName, setNewName] = useState({})
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!businessId) return
    const [s, d] = await Promise.all([
      supabase.from('sites').select('id, name, address').eq('business_id', businessId).order('name'),
      supabase.from('departments').select('id, name, colour, site_id').eq('business_id', businessId).order('name'),
    ])
    setSites(s.data || [])
    setDepartments(d.data || [])
  }, [businessId])

  useEffect(() => { load() }, [load])

  async function add(site) {
    const name = (newName[site.id] || '').trim()
    if (!name) return
    const colour = COLOURS[departments.filter((d) => d.site_id === site.id).length % COLOURS.length]
    const { error: e } = await supabase.from('departments').insert({ business_id: businessId, site_id: site.id, name, colour })
    if (e) setError(friendlyError(e))
    setNewName({ ...newName, [site.id]: '' })
    load()
  }

  return (
    <>
      <div className="page-head"><h1>Departments</h1></div>
      {error && <div className="banner draft" style={{ color: 'var(--red)' }}>{error}</div>}
      {sites.map((site) => (
        <div key={site.id} style={{ padding: '0 22px 22px' }}>
          <div className="panel" style={{ maxWidth: 640 }}>
            <h3>{site.name} <span>{site.address || ''}</span></h3>
            <div className="group" style={{ marginTop: 0 }}>
              {departments.filter((d) => d.site_id === site.id).map((d) => (
                <div className="item" key={d.id}>
                  <span className={`chip c-${d.colour}`} style={{ minHeight: 0, padding: '3px 10px' }}><b style={{ fontSize: 12.5 }}>{d.name}</b></span>
                </div>
              ))}
            </div>
            {can('settings.manage') && (
              <form style={{ display: 'flex', gap: 8, marginTop: 10 }} onSubmit={(e) => { e.preventDefault(); add(site) }}>
                <input className="input" placeholder="New department" value={newName[site.id] || ''}
                  onChange={(e) => setNewName({ ...newName, [site.id]: e.target.value })} />
                <button className="btn">Add</button>
              </form>
            )}
          </div>
        </div>
      ))}
    </>
  )
}
