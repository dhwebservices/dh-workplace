// Initials on a soft colour picked from the name, so the same person always gets the same colour.
const PALETTE = [
  ['#e6dcf3', '#5b3d8a'], ['#d6e6f5', '#2a5f8f'], ['#efe0d2', '#6b4a2f'], ['#f3e3d3', '#8a5a24'],
  ['#e9ecd5', '#5c6420'], ['#dcefe2', '#2c6b40'], ['#dde3f0', '#3c4f7d'], ['#f5dede', '#8a3434'],
]

export function initials(name = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return ((parts[0]?.[0] || '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?'
}

export default function Avatar({ name, size = 30 }) {
  let hash = 0
  for (const ch of name || '') hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  const [bg, fg] = PALETTE[hash % PALETTE.length]
  return (
    <i className="avatar" style={{ background: bg, color: fg, width: size, height: size, fontSize: size * 0.36, fontStyle: 'normal' }}>
      {initials(name)}
    </i>
  )
}
