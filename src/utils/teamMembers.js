import { sbDelete, sbGet, sbInsert } from './supabase'

const WORKER_URL = import.meta.env.VITE_WORKER_URL

export async function logAuditEvent({ tenantId, actorId = null, action, entity = null, entityId = null, metadata = null }) {
  try {
    await sbInsert('audit_log', {
      tenant_id: tenantId,
      tenant_user_id: actorId,
      action,
      entity,
      entity_id: entityId,
      metadata,
      created_at: new Date().toISOString(),
    })
  } catch (err) {
    console.warn('Audit log insert failed:', err)
  }
}

export async function getMemberHistory(memberId) {
  const checks = await Promise.all([
    sbGet('hr_profiles', `tenant_user_id=eq.${memberId}`),
    sbGet('leave_requests', `tenant_user_id=eq.${memberId}`),
    sbGet('leave_requests', `reviewed_by=eq.${memberId}`),
    sbGet('documents', `tenant_user_id=eq.${memberId}`),
    sbGet('documents', `uploaded_by=eq.${memberId}`),
    sbGet('clients', `assigned_to=eq.${memberId}`),
    sbGet('clients', `created_by=eq.${memberId}`),
    sbGet('tasks', `assigned_to=eq.${memberId}`),
    sbGet('tasks', `created_by=eq.${memberId}`),
    sbGet('invoices', `created_by=eq.${memberId}`),
    sbGet('timesheets', `tenant_user_id=eq.${memberId}`),
    sbGet('timesheets', `approved_by=eq.${memberId}`),
    sbGet('outreach', `created_by=eq.${memberId}`),
    sbGet('notifications', `tenant_user_id=eq.${memberId}`),
    sbGet('audit_log', `tenant_user_id=eq.${memberId}`),
  ])

  const labels = [
    'HR profile',
    'Leave requests',
    'Leave approvals',
    'Documents',
    'Uploads',
    'Assigned clients',
    'Created clients',
    'Assigned tasks',
    'Created tasks',
    'Invoices',
    'Timesheets',
    'Timesheet approvals',
    'Outreach activity',
    'Notifications',
    'Audit history',
  ]

  const hits = checks.map((result, index) => (result ? labels[index] : null)).filter(Boolean)
  return { hasHistory: hits.length > 0, hits }
}

export async function removePendingInvite({ tenantId, memberId, email, actorId = null }) {
  const encodedEmail = encodeURIComponent((email || '').trim().toLowerCase())
  await Promise.all([
    sbDelete('invitations', `tenant_id=eq.${tenantId}&email=eq.${encodedEmail}&accepted_at=is.null`),
    sbDelete('tenant_users', `id=eq.${memberId}`),
  ])

  await logAuditEvent({
    tenantId,
    actorId,
    action: 'invite_deleted',
    entity: 'tenant_user',
    entityId: memberId,
    metadata: { email },
  })
}

export async function deleteMemberSafely({ tenantId, member, actorId = null }) {
  if (member.status === 'active') {
    throw new Error('Active members should be suspended first so access is removed safely.')
  }

  const history = await getMemberHistory(member.id)
  if (history.hasHistory) {
    throw new Error(`This member has linked records: ${history.hits.join(', ')}. Keep them suspended instead of deleting them.`)
  }

  const encodedEmail = encodeURIComponent((member.email || '').trim().toLowerCase())
  await Promise.all([
    sbDelete('invitations', `tenant_id=eq.${tenantId}&email=eq.${encodedEmail}`),
    sbDelete('tenant_users', `id=eq.${member.id}`),
  ])

  await logAuditEvent({
    tenantId,
    actorId,
    action: 'member_deleted',
    entity: 'tenant_user',
    entityId: member.id,
    metadata: { email: member.email, role: member.role, status: member.status },
  })
}

export async function sendInviteEmail({ email, fullName, invitedBy, company, role, token }) {
  if (!WORKER_URL) {
    return { ok: false, error: 'VITE_WORKER_URL is not configured' }
  }

  try {
    const response = await fetch(WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'invite',
        data: {
          to_email: email,
          name: fullName || email.split('@')[0],
          invited_by: invitedBy,
          company,
          role,
          invite_url: `${window.location.origin}/invite/${token}`,
        },
      }),
    })

    if (!response.ok) {
      let message = ''
      try {
        const payload = await response.json()
        message = payload?.error || payload?.message || ''
      } catch {
        message = await response.text()
      }
      return { ok: false, error: message || `Worker request failed with status ${response.status}` }
    }

    return { ok: true }
  } catch (err) {
    return { ok: false, error: err.message || 'Could not reach the email worker' }
  }
}
