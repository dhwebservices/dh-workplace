import { sbGet, sbInsert, sbUpdate } from './supabase'

const WORKER_URL = import.meta.env.VITE_WORKER_URL

function inviteToken() {
  return `${crypto.randomUUID().replace(/-/g, '')}${Math.random().toString(16).slice(2, 10)}`
}

export async function inviteMember({ tenant, tenantUser, email, role, fullName }) {
  const normalizedEmail = email.trim().toLowerCase()
  const encodedEmail = encodeURIComponent(normalizedEmail)
  const token = inviteToken()

  const [existingInvite, existingTenantUser] = await Promise.all([
    sbGet('invitations', `tenant_id=eq.${tenant.id}&email=eq.${encodedEmail}&accepted_at=is.null`),
    sbGet('tenant_users', `tenant_id=eq.${tenant.id}&email=eq.${encodedEmail}`),
  ])

  if (existingTenantUser?.status === 'active') {
    throw new Error('That user is already on the team')
  }

  if (existingInvite?.id) {
    await sbUpdate('invitations', `id=eq.${existingInvite.id}`, {
      role,
      full_name: fullName || null,
      invited_by: tenantUser.id,
      expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
      created_at: new Date().toISOString(),
    })
  } else {
    await sbInsert('invitations', {
      tenant_id: tenant.id,
      email: normalizedEmail,
      role,
      full_name: fullName || null,
      token,
      invited_by: tenantUser.id,
      created_at: new Date().toISOString(),
    })
  }

  if (existingTenantUser?.id) {
    await sbUpdate('tenant_users', `id=eq.${existingTenantUser.id}`, {
      role,
      full_name: fullName || existingTenantUser.full_name || null,
      status: 'invited',
      invited_at: new Date().toISOString(),
      email: normalizedEmail,
    })
  } else {
    await sbInsert('tenant_users', {
      tenant_id: tenant.id,
      user_id: null,
      role,
      full_name: fullName || null,
      email: normalizedEmail,
      status: 'invited',
      invited_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    })
  }

  const finalToken = existingInvite?.token || token
  if (WORKER_URL) {
    fetch(WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'invite',
        data: {
          to_email: normalizedEmail,
          name: fullName || normalizedEmail.split('@')[0],
          invited_by: tenantUser.full_name || tenantUser.email,
          company: tenant.name,
          role,
          invite_url: `${window.location.origin}/invite/${finalToken}`,
        },
      }),
    }).catch(() => {})
  }

  return finalToken
}
