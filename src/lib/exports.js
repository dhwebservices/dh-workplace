// Timesheet exports for the business's payroll provider. Workplace doesn't run payroll; these files
// carry approved hours into Xero, Sage or BrightPay (or anything that takes a CSV).
// Rows come from the timesheet_rows database function.

function csvCell(value) {
  if (value === null || value === undefined) return ''
  const text = String(value)
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function toCsv(header, rows) {
  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n'
}

const ukDate = (iso) => iso.split('-').reverse().join('/')
const hours = (minutes) => (minutes / 60).toFixed(2)
const time = (value) => (value ? new Date(value).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '')

function splitName(full) {
  const parts = String(full).trim().split(/\s+/)
  return { first: parts.slice(0, -1).join(' ') || parts[0], last: parts.length > 1 ? parts[parts.length - 1] : '' }
}

// One total per person for the period.
function totals(rows) {
  const map = new Map()
  for (const r of rows) {
    const t = map.get(r.person_id) || { ...r, minutes: 0 }
    t.minutes += r.paid_minutes
    map.set(r.person_id, t)
  }
  return [...map.values()].sort((a, b) => a.full_name.localeCompare(b.full_name))
}

export const EXPORTS = {
  csv: {
    label: 'CSV (every clock-in)',
    build: (rows) => toCsv(
      ['Payroll ID', 'Name', 'Site', 'Department', 'Date', 'Clock in', 'Clock out', 'Break minutes', 'Paid hours', 'Hourly rate', 'Pay', 'Changed by a manager'],
      rows.map((r) => [r.payroll_id, r.full_name, r.site_name, r.department_name, ukDate(r.work_date), time(r.clock_in_at), time(r.clock_out_at),
        r.break_minutes, hours(r.paid_minutes),
        r.hourly_rate_pence == null ? '' : (r.hourly_rate_pence / 100).toFixed(2),
        r.hourly_rate_pence == null ? '' : ((r.paid_minutes / 60) * r.hourly_rate_pence / 100).toFixed(2),
        r.fixed ? `Yes: ${r.fix_reason || ''}` : '']),
    ),
  },
  // Xero Payroll (UK) timesheet import: one line per employee per day against an earnings rate.
  xero: {
    label: 'Xero Payroll',
    build: (rows) => {
      const byDay = new Map()
      for (const r of rows) {
        const key = `${r.person_id}|${r.work_date}`
        const t = byDay.get(key) || { name: r.full_name, date: r.work_date, minutes: 0 }
        t.minutes += r.paid_minutes
        byDay.set(key, t)
      }
      return toCsv(['Employee', 'Earnings Rate', 'Date', 'Hours'],
        [...byDay.values()].sort((a, b) => a.name.localeCompare(b.name) || a.date.localeCompare(b.date))
          .map((t) => [t.name, 'Ordinary Hours', ukDate(t.date), hours(t.minutes)]))
    },
  },
  // Sage 50 Payroll: hours per employee reference for the pay period.
  sage: {
    label: 'Sage Payroll',
    build: (rows) => toCsv(['Reference', 'Surname', 'Forename', 'Payment', 'Hours'],
      totals(rows).map((t) => { const n = splitName(t.full_name); return [t.payroll_id, n.last, n.first, 'Basic Hours', hours(t.minutes)] })),
  },
  // BrightPay: hours per employee, matched on the payroll ID during import.
  brightpay: {
    label: 'BrightPay',
    build: (rows) => toCsv(['Employee ID', 'First Name', 'Surname', 'Hours'],
      totals(rows).map((t) => { const n = splitName(t.full_name); return [t.payroll_id, n.first, n.last, hours(t.minutes)] })),
  },
}

export function downloadCsv(filename, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
