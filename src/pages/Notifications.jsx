import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { getNotificationsForUser, markNotificationRead, markNotificationsRead, sortNotifications, toggleNotificationPin } from '../utils/notifications'

function formatTime(value) {
  return new Date(value).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function toneClass(notification) {
  if (notification.is_urgent) return 'red'
  if (notification.type === 'success') return 'green'
  if (notification.type === 'warning') return 'amber'
  if (notification.type === 'error') return 'red'
  return 'blue'
}

export default function NotificationsPage() {
  const navigate = useNavigate()
  const { tenantUser } = useAuth()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [readFilter, setReadFilter] = useState('all')
  const [urgentOnly, setUrgentOnly] = useState(false)
  const [category, setCategory] = useState('all')

  const load = async () => {
    if (!tenantUser?.id) return
    setLoading(true)
    const rows = await getNotificationsForUser(tenantUser.id)
    setItems(rows)
    setLoading(false)
  }

  useEffect(() => { load() }, [tenantUser?.id])

  const categories = useMemo(() => (
    ['all', ...new Set(items.map((item) => item.category || 'general'))]
  ), [items])

  const filtered = useMemo(() => {
    return items.filter((item) => {
      if (readFilter === 'unread' && item.read) return false
      if (readFilter === 'read' && !item.read) return false
      if (urgentOnly && !item.is_urgent) return false
      if (category !== 'all' && (item.category || 'general') !== category) return false
      return true
    })
  }, [items, readFilter, urgentOnly, category])

  const unreadCount = items.filter((item) => !item.read).length
  const urgentCount = items.filter((item) => item.is_urgent).length
  const pinnedCount = items.filter((item) => item.is_pinned).length

  const openNotification = async (notification) => {
    if (!notification.read) {
      await markNotificationRead(notification.id, true)
      setItems((prev) => sortNotifications(prev.map((item) => item.id === notification.id ? { ...item, read: true, read_at: new Date().toISOString() } : item)))
    }
    if (notification.link) navigate(notification.link)
  }

  const markAll = async () => {
    const unreadIds = items.filter((item) => !item.read).map((item) => item.id)
    await markNotificationsRead(unreadIds)
    setItems((prev) => sortNotifications(prev.map((item) => ({ ...item, read: true, read_at: item.read_at || new Date().toISOString() }))))
  }

  const flipPin = async (notification) => {
    await toggleNotificationPin(notification.id, !notification.is_pinned)
    setItems((prev) => sortNotifications(prev.map((item) => item.id === notification.id ? { ...item, is_pinned: !item.is_pinned } : item)))
  }

  if (loading) return <div className="spin-wrap"><div className="spin" /></div>

  return (
    <div className="fade-in page-stack">
      <div className="page-hd">
        <div>
          <h1 className="page-title">Notifications</h1>
          <p className="page-sub">Unread alerts, urgent updates, and admin messages in one place.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-outline btn-sm" onClick={markAll} disabled={unreadCount === 0}>Mark all read</button>
        </div>
      </div>

      <div className="kpi-strip">
        <div className="kpi-cell">
          <div className="kpi-cell-label">Unread</div>
          <div className="kpi-cell-value">{unreadCount}</div>
        </div>
        <div className="kpi-cell">
          <div className="kpi-cell-label">Urgent</div>
          <div className="kpi-cell-value">{urgentCount}</div>
        </div>
        <div className="kpi-cell">
          <div className="kpi-cell-label">Pinned</div>
          <div className="kpi-cell-value">{pinnedCount}</div>
        </div>
        <div className="kpi-cell">
          <div className="kpi-cell-label">Categories</div>
          <div className="kpi-cell-value">{Math.max(categories.length - 1, 1)}</div>
        </div>
      </div>

      <div className="table-toolbar" style={{ alignItems: 'stretch' }}>
        <div className="filter-pills">
          {[
            ['all', 'All'],
            ['unread', 'Unread'],
            ['read', 'Read'],
          ].map(([value, label]) => (
            <button key={value} className={`btn btn-sm ${readFilter === value ? 'btn-primary' : 'btn-outline'}`} onClick={() => setReadFilter(value)}>
              {label}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className={`btn btn-sm ${urgentOnly ? 'btn-primary' : 'btn-outline'}`} onClick={() => setUrgentOnly((prev) => !prev)}>
            Urgent only
          </button>
          <select className="inp" style={{ minWidth: 180 }} value={category} onChange={(e) => setCategory(e.target.value)}>
            {categories.map((value) => (
              <option key={value} value={value}>{value === 'all' ? 'All categories' : value}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="card card-pad">
        <div className="section-head">
          <div>
            <h3 className="panel-title">Activity feed</h3>
            <div className="panel-sub">Pinned and unread updates stay surfaced first so operational issues do not get buried.</div>
          </div>
        </div>
        <div style={{ display: 'grid', gap: 12 }}>
          {filtered.length ? filtered.map((notification) => (
            <div key={notification.id} className="detail-card" style={{ padding: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 220 }}>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
                    <span className={`badge badge-${toneClass(notification)}`}>{notification.is_urgent ? 'Urgent' : (notification.type || 'info')}</span>
                    <span className="badge badge-grey">{notification.category || 'general'}</span>
                    {notification.is_pinned && <span className="badge badge-blue">Pinned</span>}
                    {!notification.read && <span className="badge badge-blue">Unread</span>}
                    {notification.sent_via_email && <span className="badge badge-green">Email sent</span>}
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>{notification.title}</div>
                  {notification.message && <div style={{ fontSize: 13, color: 'var(--sub)', lineHeight: 1.55 }}>{notification.message}</div>}
                  <div style={{ fontSize: 11, color: 'var(--faint)', marginTop: 10 }}>{formatTime(notification.created_at)}</div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <button className="btn btn-outline btn-sm" onClick={() => flipPin(notification)}>
                    {notification.is_pinned ? 'Unpin' : 'Pin'}
                  </button>
                  {!notification.read && (
                    <button className="btn btn-outline btn-sm" onClick={() => openNotification(notification)}>
                      Mark read
                    </button>
                  )}
                  {notification.link && (
                    <button className="btn btn-primary btn-sm" onClick={() => openNotification(notification)}>
                      Open
                    </button>
                  )}
                </div>
              </div>
            </div>
          )) : (
            <div className="compact-note">No notifications match the current filters.</div>
          )}
        </div>
      </div>
    </div>
  )
}
