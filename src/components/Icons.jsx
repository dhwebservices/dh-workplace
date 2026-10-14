// Line icons drawn to one grid (24px, 1.7 stroke). No emoji anywhere in the UI.
function Icon({ size = 18, children }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  )
}

export const SearchIcon = (p) => <Icon {...p}><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></Icon>
export const BellIcon = (p) => <Icon {...p}><path d="M6 16.5V11a6 6 0 1 1 12 0v5.5l1.5 2h-15z" /><path d="M10 20.5a2 2 0 0 0 4 0" /></Icon>
export const HelpIcon = (p) => <Icon {...p}><circle cx="12" cy="12" r="9" /><path d="M9.6 9.3a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.1-2.4 3.6M12 17h.01" /></Icon>
export const ChevronDown = (p) => <Icon size={14} {...p}><path d="m8 10 4 4 4-4" /></Icon>
export const ClockIcon = (p) => <Icon {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></Icon>
export const PlusIcon = (p) => <Icon {...p}><path d="M12 5v14M5 12h14" /></Icon>

export function DHMark({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <path d="M1 2h6.2c1.6 0 2.4 1.6 2.6 4.4H1z" fill="#8f9196" />
      <path d="M9 2h5.4v3.2c0 .7-.5 1.2-1.2 1.2H9.8C9.6 4.3 9.3 2.8 9 2z" fill="#d7d8da" />
      <path d="M1 9.6h8.8c-.2 2.8-1 4.4-2.6 4.4H2.2A1.2 1.2 0 0 1 1 12.8z" fill="#8f9196" />
      <path d="M9.8 9.6h4.6v3.2c0 .7-.5 1.2-1.2 1.2H9c.4-.8.7-2.3.8-4.4z" fill="#d7d8da" />
    </svg>
  )
}
