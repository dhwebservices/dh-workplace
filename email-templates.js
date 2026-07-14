/**
 * DH Workplace — Modern Email Templates
 * Responsive, accessible, dark-mode ready email templates
 */

// ── Brand Colors ────────────────────────────────────────────────
const COLORS = {
  brand: {
    primary: '#1D1D1F',
    accent: '#C9A84C',
    accentLight: '#E5D9B6',
  },
  light: {
    bg: '#F5F5F7',
    surface: '#FFFFFF',
    surfaceAlt: '#F9F9F9',
    text: '#1D1D1F',
    textSecondary: '#555555',
    textMuted: '#86868B',
    border: '#E5E5E5',
  },
  dark: {
    bg: '#000000',
    surface: '#1C1C1E',
    surfaceAlt: '#2C2C2E',
    text: '#FFFFFF',
    textSecondary: '#AEAEB2',
    textMuted: '#8E8E93',
    border: '#38383A',
  },
  status: {
    success: '#34C759',
    warning: '#FF9500',
    error: '#FF3B30',
    info: '#007AFF',
  }
}

// ── Email Wrapper ────────────────────────────────────────────────
function emailWrap(content, { darkMode = false } = {}) {
  const theme = darkMode ? COLORS.dark : COLORS.light

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <title>DH Workplace</title>
  <!--[if mso]>
  <style type="text/css">
    table {border-collapse:collapse;border-spacing:0;margin:0;}
    div, td {padding:0;}
  </style>
  <![endif]-->
  <style>
    @media (prefers-color-scheme: dark) {
      .email-wrapper { background: ${COLORS.dark.bg} !important; }
      .email-header { background: ${COLORS.brand.primary} !important; }
      .email-body { background: ${COLORS.dark.surface} !important; border-color: ${COLORS.dark.border} !important; color: ${COLORS.dark.text} !important; }
      .text-primary { color: ${COLORS.dark.text} !important; }
      .text-secondary { color: ${COLORS.dark.textSecondary} !important; }
      .text-muted { color: ${COLORS.dark.textMuted} !important; }
      .surface-alt { background: ${COLORS.dark.surfaceAlt} !important; }
      .email-footer { color: ${COLORS.dark.textMuted} !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:${theme.bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;">
  <div class="email-wrapper" style="background:${theme.bg};padding:20px 10px;">
    <div style="max-width:600px;margin:0 auto;">
      <!-- Header -->
      <div class="email-header" style="background:${COLORS.brand.primary};padding:24px 32px;border-radius:16px 16px 0 0;">
        <table role="presentation" style="width:100%;">
          <tr>
            <td>
              <span style="color:${COLORS.brand.accent};font-size:22px;font-weight:700;letter-spacing:-0.5px;">DH Workplace</span>
            </td>
          </tr>
        </table>
      </div>

      <!-- Body -->
      <div class="email-body" style="background:${theme.surface};padding:40px 32px;border:1px solid ${theme.border};border-top:none;border-radius:0 0 16px 16px;">
        ${content}
      </div>

      <!-- Footer -->
      <div class="email-footer" style="text-align:center;padding:24px 16px;color:${theme.textMuted};font-size:12px;line-height:1.5;">
        <p style="margin:0 0 8px;">DH Workplace</p>
        <p style="margin:0 0 8px;">Powered by DH Website Services · Pontypridd, Wales</p>
        <p style="margin:0;">
          <a href="mailto:clients@dhwebsiteservices.co.uk" style="color:${COLORS.brand.accent};text-decoration:none;">Contact Support</a>
        </p>
      </div>
    </div>
  </div>
</body>
</html>`
}

// ── Button Component ─────────────────────────────────────────────
function button(url, text, { variant = 'primary', fullWidth = false } = {}) {
  const styles = {
    primary: {
      bg: COLORS.brand.primary,
      color: '#FFFFFF',
      borderColor: COLORS.brand.primary,
    },
    secondary: {
      bg: 'transparent',
      color: COLORS.brand.primary,
      borderColor: COLORS.brand.primary,
    },
    accent: {
      bg: COLORS.brand.accent,
      color: COLORS.brand.primary,
      borderColor: COLORS.brand.accent,
    }
  }

  const style = styles[variant]
  const width = fullWidth ? 'width:100%;display:block;' : 'display:inline-block;'

  return `<a href="${url}" style="${width}background:${style.bg};color:${style.color};padding:14px 28px;border-radius:12px;text-decoration:none;font-weight:600;font-size:15px;border:2px solid ${style.borderColor};text-align:center;transition:all 0.2s;">${text}</a>`
}

// ── Info Card Component ──────────────────────────────────────────
function infoCard(items, { tone = 'neutral' } = {}) {
  const tones = {
    neutral: COLORS.light.surfaceAlt,
    success: '#E8F5E9',
    warning: '#FFF3E0',
    info: '#E3F2FD',
  }

  const rows = items.map(({ label, value, highlight = false }) => `
    <tr>
      <td style="padding:8px 0;font-size:14px;color:${COLORS.light.textSecondary};">${label}</td>
      <td style="padding:8px 0;text-align:right;font-size:14px;${highlight ? `font-weight:700;color:${COLORS.brand.accent};font-size:16px;` : ''}">${value}</td>
    </tr>
  `).join('')

  return `
    <div class="surface-alt" style="background:${tones[tone]};border-radius:12px;padding:24px;margin:24px 0;">
      <table role="presentation" style="width:100%;border-collapse:collapse;">
        ${rows}
      </table>
    </div>`
}

// ── Divider ──────────────────────────────────────────────────────
function divider() {
  return `<div style="height:1px;background:${COLORS.light.border};margin:32px 0;"></div>`
}

// ── Text Styles ──────────────────────────────────────────────────
function h1(text) {
  return `<h1 class="text-primary" style="color:${COLORS.light.text};font-size:28px;font-weight:700;margin:0 0 16px;line-height:1.3;letter-spacing:-0.5px;">${text}</h1>`
}

function h2(text) {
  return `<h2 class="text-primary" style="color:${COLORS.light.text};font-size:22px;font-weight:700;margin:0 0 12px;line-height:1.3;letter-spacing:-0.3px;">${text}</h2>`
}

function p(text, { size = 'base', color = 'secondary' } = {}) {
  const sizes = { sm: '13px', base: '15px', lg: '17px' }
  const colors = {
    primary: COLORS.light.text,
    secondary: COLORS.light.textSecondary,
    muted: COLORS.light.textMuted,
  }

  return `<p class="text-${color}" style="color:${colors[color]};font-size:${sizes[size]};margin:0 0 16px;line-height:1.6;">${text}</p>`
}

function badge(text, { color = 'accent' } = {}) {
  const colors = {
    accent: { bg: COLORS.brand.accentLight, text: COLORS.brand.primary },
    success: { bg: '#E8F5E9', text: '#2E7D32' },
    warning: { bg: '#FFF3E0', text: '#EF6C00' },
    info: { bg: '#E3F2FD', text: '#1565C0' },
  }

  const c = colors[color]
  return `<span style="display:inline-block;background:${c.bg};color:${c.text};padding:4px 12px;border-radius:6px;font-size:13px;font-weight:600;margin:0 4px 4px 0;">${text}</span>`
}

// ────────────────────────────────────────────────────────────────
// Email Templates
// ────────────────────────────────────────────────────────────────

export const templates = {

  welcome: (data) => {
    const content = `
      ${h1('Welcome to DH Workplace!')}
      ${p(`Hi ${data.name || 'there'}, your workspace is ready to go.`)}
      ${infoCard([
        { label: 'Workspace', value: data.company },
        { label: 'Plan', value: data.plan || 'Starter' },
        { label: 'Monthly cost', value: '£9/mo during launch', highlight: false },
      ])}
      ${p('Your workspace includes HR management, CRM, timesheets, and more — all in one place.', { size: 'sm', color: 'muted' })}
      ${button(data.url || 'https://app.dhworkplace.co.uk', 'Go to your workspace', { fullWidth: true })}
      ${divider()}
      ${p('Questions? Reply to this email or contact our support team.', { size: 'sm', color: 'muted' })}
    `

    return {
      html: emailWrap(content),
      text: `Welcome to DH Workplace

Hi ${data.name || 'there'},

Your workspace is ready.

Workspace: ${data.company}
Plan: ${data.plan || 'Starter'}
Monthly cost: £9/mo during launch

Go to your workspace: ${data.url || 'https://app.dhworkplace.co.uk'}

Questions? Reply to this email or contact clients@dhwebsiteservices.co.uk`
    }
  },

  invite: (data) => {
    const content = `
      ${h1('You've been invited!')}
      ${p(`Hi ${data.name || 'there'},`)}
      ${p(`<strong>${data.invited_by}</strong> has invited you to join <strong>${data.company}</strong> on DH Workplace.`)}
      ${infoCard([
        { label: 'Company', value: data.company },
        { label: 'Your role', value: data.role.charAt(0).toUpperCase() + data.role.slice(1) },
      ])}
      ${button(data.invite_url, 'Accept invitation', { fullWidth: true })}
      ${divider()}
      ${p('This invitation expires in 7 days. If you weren\'t expecting this, you can safely ignore it.', { size: 'sm', color: 'muted' })}
      ${p('If the button doesn\'t work, copy this link:', { size: 'sm', color: 'muted' })}
      ${p(`<span style="word-break:break-all;font-size:12px;color:${COLORS.light.textMuted};">${data.invite_url}</span>`, { size: 'sm' })}
    `

    return {
      html: emailWrap(content),
      text: `You've been invited to DH Workplace

Hi ${data.name || 'there'},

${data.invited_by} has invited you to join ${data.company} on DH Workplace as ${data.role}.

Accept invitation: ${data.invite_url}

This invitation expires in 7 days.`
    }
  },

  leave_request_submitted: (data) => {
    const content = `
      ${h2('New Leave Request')}
      ${p('A team member has submitted a leave request for your approval.')}
      ${infoCard([
        { label: 'Staff member', value: data.staff_name },
        { label: 'Type', value: data.leave_type },
        { label: 'Dates', value: `${data.start_date} → ${data.end_date}` },
        { label: 'Days', value: data.days, highlight: true },
      ])}
      ${data.notes ? `${p(`<strong>Note:</strong> ${data.notes}`, { size: 'sm' })}` : ''}
      ${button(data.url || '#', 'Review request', { fullWidth: true })}
    `

    return {
      html: emailWrap(content),
      text: `New Leave Request

Staff member: ${data.staff_name}
Type: ${data.leave_type}
Dates: ${data.start_date} → ${data.end_date}
Days: ${data.days}
${data.notes ? `Note: ${data.notes}\n` : ''}
Review: ${data.url || '#'}`
    }
  },

  leave_request_approved: (data) => {
    const content = `
      ${h2('Leave Request Approved ✓')}
      ${p(`Hi ${data.staff_name},`)}
      ${p(`Your leave request for <strong>${data.start_date} → ${data.end_date}</strong> has been <strong style="color:${COLORS.status.success};">approved</strong>.`)}
      ${data.notes ? infoCard([{ label: 'Manager note', value: data.notes }], { tone: 'success' }) : ''}
      ${button(data.url || '#', 'View in portal')}
    `

    return {
      html: emailWrap(content),
      text: `Leave Request Approved

Hi ${data.staff_name},

Your leave request for ${data.start_date} → ${data.end_date} has been approved.
${data.notes ? `Manager note: ${data.notes}\n` : ''}
View: ${data.url || '#'}`
    }
  },

  leave_request_rejected: (data) => {
    const content = `
      ${h2('Leave Request Update')}
      ${p(`Hi ${data.staff_name},`)}
      ${p(`Your leave request for <strong>${data.start_date} → ${data.end_date}</strong> was not approved at this time.`)}
      ${data.notes ? infoCard([{ label: 'Manager note', value: data.notes }], { tone: 'warning' }) : ''}
      ${p('If you have questions, please speak with your manager.', { size: 'sm', color: 'muted' })}
      ${button(data.url || '#', 'View in portal', { variant: 'secondary' })}
    `

    return {
      html: emailWrap(content),
      text: `Leave Request Update

Hi ${data.staff_name},

Your leave request for ${data.start_date} → ${data.end_date} was not approved.
${data.notes ? `Manager note: ${data.notes}\n` : ''}
View: ${data.url || '#'}`
    }
  },

  invoice_issued: (data) => {
    const content = `
      ${h2(`Invoice from ${data.company || 'DH Workplace'}`)}
      ${p(`Hi ${data.client_name || 'there'},`)}
      ${p('A new invoice is ready for your review.')}
      ${infoCard([
        { label: 'Invoice #', value: data.invoice_number || 'N/A' },
        { label: 'Description', value: data.description },
        { label: 'Due date', value: data.due_date || 'On receipt' },
        { label: 'Total', value: `£${Number(data.amount || 0).toFixed(2)}`, highlight: true },
      ])}
      ${data.payment_url ? button(data.payment_url, 'Pay now', { fullWidth: true, variant: 'accent' }) : ''}
    `

    return {
      html: emailWrap(content),
      text: `Invoice from ${data.company || 'DH Workplace'}

Hi ${data.client_name || 'there'},

Invoice #: ${data.invoice_number || 'N/A'}
Description: ${data.description}
Due date: ${data.due_date || 'On receipt'}
Total: £${Number(data.amount || 0).toFixed(2)}

${data.payment_url ? `Pay now: ${data.payment_url}` : ''}`
    }
  },

  password_reset: (data) => {
    const content = `
      ${h2('Reset Your Password')}
      ${p(`Hi ${data.name || 'there'},`)}
      ${p('You requested to reset your password. Click the button below to create a new one.')}
      ${button(data.reset_url, 'Reset password', { fullWidth: true })}
      ${divider()}
      ${p('This link expires in 1 hour. If you didn\'t request this, you can safely ignore this email.', { size: 'sm', color: 'muted' })}
    `

    return {
      html: emailWrap(content),
      text: `Reset Your Password

Hi ${data.name || 'there'},

You requested to reset your password.

Reset link: ${data.reset_url}

This link expires in 1 hour. If you didn't request this, ignore this email.`
    }
  },

  trial_ending: (data) => {
    const content = `
      ${h2('Your trial is ending soon')}
      ${p(`Hi ${data.name || 'there'},`)}
      ${p(`Your DH Workplace trial for <strong>${data.company}</strong> ends in <strong>${data.days_left} days</strong>.`)}
      ${p('To keep your workspace active, set up billing now.')}
      ${button(data.billing_url || '#', 'Set up billing', { fullWidth: true, variant: 'accent' })}
      ${divider()}
      ${p('After your trial ends, your data will be preserved for 30 days. Set up billing anytime to reactivate.', { size: 'sm', color: 'muted' })}
    `

    return {
      html: emailWrap(content),
      text: `Your trial is ending soon

Hi ${data.name || 'there'},

Your DH Workplace trial for ${data.company} ends in ${data.days_left} days.

Set up billing: ${data.billing_url || '#'}

Your data will be preserved for 30 days after trial ends.`
    }
  },
}

// ── Export helper for Cloudflare Worker ──────────────────────────
export function renderEmail(type, data) {
  const template = templates[type]
  if (!template) {
    throw new Error(`Unknown email template: ${type}`)
  }

  const result = template(data)
  return {
    html: result.html,
    text: result.text,
    subject: getSubject(type, data),
  }
}

function getSubject(type, data) {
  const subjects = {
    welcome: 'Welcome to DH Workplace - Your workspace is ready',
    invite: `Invitation to join ${data.company} on DH Workplace`,
    leave_request_submitted: `Leave request - ${data.staff_name}`,
    leave_request_approved: 'Leave Request Approved',
    leave_request_rejected: 'Leave Request Update',
    invoice_issued: `Invoice ${data.invoice_number || ''} from ${data.company || 'DH Workplace'}`,
    password_reset: 'Reset your DH Workplace password',
    trial_ending: `Your DH Workplace trial ends in ${data.days_left} days`,
  }

  return subjects[type] || 'DH Workplace Notification'
}
