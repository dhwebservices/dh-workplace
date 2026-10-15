// Week helpers. Weeks start on Monday, as UK rotas do.

export function startOfWeek(date) {
  const d = new Date(date)
  const day = (d.getDay() + 6) % 7
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - day)
  return d
}

export function addDays(date, days) {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

export function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

// "5 – 11" for whole hours, "3 – 11:30" otherwise; 24-hour input becomes 12-hour UK style.
function shortTime(date) {
  const h = date.getHours() % 12 || 12
  const m = date.getMinutes()
  return m ? `${h}:${String(m).padStart(2, '0')}` : `${h}`
}

export function shiftRange(start, end) {
  return `${shortTime(new Date(start))} – ${shortTime(new Date(end))}`
}

export function weekLabel(weekStart) {
  const end = addDays(weekStart, 6)
  const sameMonth = weekStart.getMonth() === end.getMonth()
  const startText = weekStart.toLocaleDateString('en-GB', sameMonth ? { day: 'numeric' } : { day: 'numeric', month: 'long' })
  const endText = end.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })
  return `${startText} – ${endText}`
}

// "6h", "5h 40m", "45m" for people to read; hoursBetween stays numeric for sums.
export function formatHours(hours) {
  const total = Math.round(hours * 60)
  const h = Math.floor(total / 60)
  const m = total % 60
  if (!h) return `${m}m`
  return m ? `${h}h ${m}m` : `${h}h`
}

export function hoursBetween(start, end, breakMinutes = 0) {
  return Math.max(0, (new Date(end) - new Date(start)) / 3600000 - breakMinutes / 60)
}

// Parse quick entries like "17-23", "5-11", "11-7", "6-12", "10:30-18", "5pm-11pm" into a start and end
// on the given day. Bare small numbers are read the way rota writers mean them: "5-11" is 5pm to 11pm,
// "11-7" is 11am to 7pm, "6-12" is 6pm to midnight. Returns null when it can't be read.
export function parseShiftInput(text, day) {
  const match = String(text).trim().toLowerCase()
    .match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:-|–|to)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/)
  if (!match) return null
  const [, sh, sm = '0', sap, eh, em = '0', eap] = match
  const withMeridiem = (hour, ap) => (ap === 'pm' && hour < 12 ? hour + 12 : ap === 'am' && hour === 12 ? 0 : hour)

  let start = withMeridiem(Number(sh), sap)
  if (!sap && start < 8) start += 12

  let end = withMeridiem(Number(eh), eap)
  if (!eap) {
    if (end === 12 && start >= 12) end = 24
    else if (end <= start && end < 12 && end + 12 > start) end += 12
  }
  if (start > 23 || end > 24 || Number(sm) > 59 || Number(em) > 59) return null

  const startDate = new Date(day)
  startDate.setHours(start, Number(sm), 0, 0)
  const endDate = new Date(day)
  endDate.setHours(end, Number(em), 0, 0)
  if (endDate <= startDate) endDate.setDate(endDate.getDate() + 1)
  return { start: startDate, end: endDate }
}
