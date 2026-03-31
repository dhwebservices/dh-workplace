import { sbDelete, sbGet, sbInsert } from './supabase'

const TEMPLATES = {
  agency: {
    key: 'agency',
    label: 'Agency Ops',
    tenantName: 'Northstar Creative',
    plan: 'business',
    seat_limit: 40,
    primary_colour: '#0071E3',
  },
  smb: {
    key: 'smb',
    label: 'Small Business',
    tenantName: 'Riverside Property Services',
    plan: 'growth',
    seat_limit: 15,
    primary_colour: '#2563EB',
  },
}

export function listDemoTemplates() {
  return Object.values(TEMPLATES)
}

export async function createDemoTenant(templateKey = 'agency') {
  const template = TEMPLATES[templateKey] || TEMPLATES.agency
  const tenantId = crypto.randomUUID()
  const slug = `demo-${template.tenantName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${Math.random().toString(36).slice(2, 6)}`
  const now = new Date().toISOString()

  await sbInsert('tenants', {
    id: tenantId,
    name: `${template.tenantName} Demo`,
    slug,
    plan: template.plan,
    seat_limit: template.seat_limit,
    owner_email: `demo+${slug}@dhworkplace.co.uk`,
    status: 'active',
    primary_colour: template.primary_colour,
    is_demo: true,
    demo_template: template.key,
    created_at: now,
    updated_at: now,
  })

  await seedDemoData(tenantId, template)
  return await sbGet('tenants', `id=eq.${tenantId}`)
}

export async function resetDemoTenant(tenant) {
  if (!tenant?.id) throw new Error('Demo tenant not found')
  const template = TEMPLATES[tenant.demo_template] || TEMPLATES.agency
  const tenantId = tenant.id

  await sbDelete('webhook_deliveries', `tenant_id=eq.${tenantId}`)
  await sbDelete('webhook_endpoints', `tenant_id=eq.${tenantId}`)
  await sbDelete('audit_log', `tenant_id=eq.${tenantId}`)
  await sbDelete('notifications', `tenant_id=eq.${tenantId}`)
  await sbDelete('invitations', `tenant_id=eq.${tenantId}`)
  await sbDelete('timesheets', `tenant_id=eq.${tenantId}`)
  await sbDelete('invoices', `tenant_id=eq.${tenantId}`)
  await sbDelete('tasks', `tenant_id=eq.${tenantId}`)
  await sbDelete('outreach', `tenant_id=eq.${tenantId}`)
  await sbDelete('documents', `tenant_id=eq.${tenantId}`)
  await sbDelete('leave_requests', `tenant_id=eq.${tenantId}`)
  await sbDelete('hr_profiles', `tenant_id=eq.${tenantId}`)
  await sbDelete('clients', `tenant_id=eq.${tenantId}`)
  await sbDelete('tenant_users', `tenant_id=eq.${tenantId}`)

  await seedDemoData(tenantId, template)
}

async function seedDemoData(tenantId, template) {
  const seed = buildSeed(tenantId, template)

  for (const row of seed.tenantUsers) await sbInsert('tenant_users', row)
  for (const row of seed.hrProfiles) await sbInsert('hr_profiles', row)
  for (const row of seed.clients) await sbInsert('clients', row)
  for (const row of seed.tasks) await sbInsert('tasks', row)
  for (const row of seed.leaveRequests) await sbInsert('leave_requests', row)
  for (const row of seed.documents) await sbInsert('documents', row)
  for (const row of seed.timesheets) await sbInsert('timesheets', row)
  for (const row of seed.outreach) await sbInsert('outreach', row)
  for (const row of seed.invoices) await sbInsert('invoices', row)
  for (const row of seed.notifications) await sbInsert('notifications', row)
  for (const row of seed.auditLog) await sbInsert('audit_log', row)
}

function buildSeed(tenantId, template) {
  const now = new Date()
  const staff = [
    member(tenantId, 'owner', 'Amelia Hart', 'Managing Director', 'Leadership', 'amelia@northstarcreative.co.uk'),
    member(tenantId, 'admin', 'Jordan Ellis', 'Operations Lead', 'Operations', 'jordan@northstarcreative.co.uk'),
    member(tenantId, 'manager', 'Priya Shah', 'Client Services Manager', 'Client Services', 'priya@northstarcreative.co.uk'),
    member(tenantId, 'staff', 'Lucas Reed', 'Project Coordinator', 'Delivery', 'lucas@northstarcreative.co.uk'),
    member(tenantId, 'staff', 'Eve Morgan', 'Content Executive', 'Marketing', 'eve@northstarcreative.co.uk'),
  ]

  const clients = [
    client(tenantId, 'Axiom Legal', 'active', 12000),
    client(tenantId, 'Harbour Dental', 'active', 8200),
    client(tenantId, 'Meridian Build', 'lead', 5400),
    client(tenantId, 'Westfield Care', 'active', 14600),
    client(tenantId, 'Pioneer Fitness', 'inactive', 2100),
  ]

  const today = isoDate(now)
  const inThreeDays = isoDate(offsetDays(now, 3))
  const inSevenDays = isoDate(offsetDays(now, 7))
  const lastWeek = isoDate(offsetDays(now, -7))
  const yesterday = isoDate(offsetDays(now, -1))

  return {
    tenantUsers: staff,
    hrProfiles: [
      hrProfile(tenantId, staff[0].id, staff[2].id, 'permanent'),
      hrProfile(tenantId, staff[2].id, staff[0].id, 'permanent'),
      hrProfile(tenantId, staff[3].id, staff[2].id, 'full_time'),
      hrProfile(tenantId, staff[4].id, staff[2].id, 'full_time'),
    ],
    clients,
    tasks: [
      task(tenantId, 'Prepare Q2 client reporting pack', 'in_progress', 'high', staff[2].id, clients[0].id, inThreeDays),
      task(tenantId, 'Approve homepage copy revisions', 'todo', 'medium', staff[3].id, clients[1].id, inSevenDays),
      task(tenantId, 'Chase signed proposal', 'todo', 'urgent', staff[2].id, clients[2].id, tomorrow()),
      task(tenantId, 'Finalise onboarding checklist', 'done', 'low', staff[1].id, null, yesterday),
      task(tenantId, 'Review July campaign assets', 'todo', 'high', staff[4].id, clients[3].id, inSevenDays),
    ],
    leaveRequests: [
      leave(tenantId, staff[3].id, 'annual', inSevenDays, isoDate(offsetDays(now, 10)), 4, 'pending'),
      leave(tenantId, staff[4].id, 'annual', isoDate(offsetDays(now, 14)), isoDate(offsetDays(now, 16)), 3, 'approved', staff[2].id),
    ],
    documents: [
      documentRow(tenantId, 'Employee Handbook.pdf', 'policy', 'all', staff[1].id),
      documentRow(tenantId, 'Remote Working Policy.pdf', 'policy', 'all', staff[1].id),
      documentRow(tenantId, 'Client Handover Checklist.docx', 'general', 'managers', staff[2].id),
    ],
    timesheets: [
      timesheet(tenantId, staff[3].id, lastWeek, 7.5, 'Delivery coordination for Axiom Legal', clients[0].id, 'approved', staff[2].id),
      timesheet(tenantId, staff[4].id, yesterday, 6.0, 'Content edits for Westfield Care', clients[3].id, 'pending'),
      timesheet(tenantId, staff[2].id, today, 4.5, 'Client review and scheduling', clients[1].id, 'pending'),
    ],
    outreach: [
      outreachRow(tenantId, 'Brightstone Finance', 'Sophie Walsh', 'contacted'),
      outreachRow(tenantId, 'Kingsley Optics', 'Marcus Lane', 'replied'),
      outreachRow(tenantId, 'Elm & Co Interiors', 'Nina Frost', 'converted'),
    ],
    invoices: [
      invoiceRow(tenantId, clients[0].id, 'INV-2401', 'Monthly retained support', 2400, 'paid', lastWeek, staff[1].id),
      invoiceRow(tenantId, clients[1].id, 'INV-2402', 'Landing page refresh', 1750, 'unpaid', inSevenDays, staff[1].id),
      invoiceRow(tenantId, clients[3].id, 'INV-2403', 'Campaign rollout', 3200, 'paid', yesterday, staff[1].id),
    ],
    notifications: [
      notificationRow(tenantId, staff[2].id, 'Pending leave approval', 'A leave request is waiting for review.', '/leave'),
      notificationRow(tenantId, staff[1].id, 'Invoice due this week', 'One invoice remains unpaid.', '/reports'),
    ],
    auditLog: [
      auditRow(tenantId, staff[0].id, 'demo.seeded', 'workspace', { template: template.key }),
      auditRow(tenantId, staff[1].id, 'client.created', 'client', { count: clients.length }),
    ],
  }
}

function member(tenantId, role, fullName, jobTitle, department, email) {
  return {
    id: crypto.randomUUID(),
    tenant_id: tenantId,
    role,
    full_name: fullName,
    job_title: jobTitle,
    department,
    email,
    status: 'active',
    joined_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
  }
}

function hrProfile(tenantId, tenantUserId, managerId, contractType) {
  return {
    id: crypto.randomUUID(),
    tenant_id: tenantId,
    tenant_user_id: tenantUserId,
    contract_type: contractType,
    start_date: isoDate(offsetDays(new Date(), -180)),
    manager_id: managerId,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
}

function client(tenantId, name, status, value) {
  return {
    id: crypto.randomUUID(),
    tenant_id: tenantId,
    name,
    status,
    value,
    email: `hello@${name.toLowerCase().replace(/[^a-z0-9]+/g, '')}.co.uk`,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
}

function task(tenantId, title, status, priority, assignedTo, clientId, dueDate) {
  return {
    id: crypto.randomUUID(),
    tenant_id: tenantId,
    title,
    status,
    priority,
    assigned_to: assignedTo,
    client_id: clientId,
    due_date: dueDate,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
}

function leave(tenantId, tenantUserId, type, startDate, endDate, days, status, reviewedBy = null) {
  return {
    id: crypto.randomUUID(),
    tenant_id: tenantId,
    tenant_user_id: tenantUserId,
    type,
    start_date: startDate,
    end_date: endDate,
    days,
    status,
    reviewed_by: reviewedBy,
    reviewed_at: reviewedBy ? new Date().toISOString() : null,
    created_at: new Date().toISOString(),
  }
}

function documentRow(tenantId, name, category, visibleTo, uploadedBy) {
  return {
    id: crypto.randomUUID(),
    tenant_id: tenantId,
    name,
    category,
    visible_to: visibleTo,
    uploaded_by: uploadedBy,
    created_at: new Date().toISOString(),
  }
}

function timesheet(tenantId, tenantUserId, date, hours, description, clientId, status, approvedBy = null) {
  return {
    id: crypto.randomUUID(),
    tenant_id: tenantId,
    tenant_user_id: tenantUserId,
    date,
    hours,
    description,
    client_id: clientId,
    status,
    approved_by: approvedBy,
    created_at: new Date().toISOString(),
  }
}

function outreachRow(tenantId, businessName, contactName, status) {
  return {
    id: crypto.randomUUID(),
    tenant_id: tenantId,
    business_name: businessName,
    contact_name: contactName,
    email: `${contactName.toLowerCase().replace(/[^a-z]+/g, '.')}@${businessName.toLowerCase().replace(/[^a-z0-9]+/g, '')}.co.uk`,
    status,
    created_at: new Date().toISOString(),
  }
}

function invoiceRow(tenantId, clientId, invoiceNumber, description, amount, status, dueDate, createdBy) {
  return {
    id: crypto.randomUUID(),
    tenant_id: tenantId,
    client_id: clientId,
    invoice_number: invoiceNumber,
    description,
    amount,
    status,
    due_date: dueDate,
    paid_at: status === 'paid' ? new Date().toISOString() : null,
    created_by: createdBy,
    created_at: new Date().toISOString(),
  }
}

function notificationRow(tenantId, tenantUserId, title, message, link) {
  return {
    id: crypto.randomUUID(),
    tenant_id: tenantId,
    tenant_user_id: tenantUserId,
    title,
    message,
    link,
    created_at: new Date().toISOString(),
  }
}

function auditRow(tenantId, tenantUserId, action, entity, metadata) {
  return {
    id: crypto.randomUUID(),
    tenant_id: tenantId,
    tenant_user_id: tenantUserId,
    action,
    entity,
    metadata,
    created_at: new Date().toISOString(),
  }
}

function isoDate(value) {
  return new Date(value).toISOString().slice(0, 10)
}

function offsetDays(base, amount) {
  const date = new Date(base)
  date.setDate(date.getDate() + amount)
  return date
}

function tomorrow() {
  return isoDate(offsetDays(new Date(), 1))
}
