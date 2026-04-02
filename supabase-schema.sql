-- ═══════════════════════════════════════════════════════════════
-- DH Workplace — Complete Supabase Schema + RLS Policies
-- Run this in Supabase SQL Editor on your new project
-- ═══════════════════════════════════════════════════════════════

-- ── Extensions ───────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ── Helper: get current user's tenant_id ─────────────────────
create or replace function get_tenant_id()
returns uuid language sql stable as $$
  select tenant_id from tenant_users
  where user_id = auth.uid()
  limit 1
$$;

-- ── Tenants ──────────────────────────────────────────────────
create table tenants (
  id                    uuid primary key default gen_random_uuid(),
  name                  text not null,
  slug                  text unique not null,
  plan                  text default 'starter' check (plan in ('starter','growth','business')),
  seat_limit            int default 5,
  logo_url              text,
  primary_colour        text default '#0071E3',
  is_demo               boolean default false,
  demo_template         text,
  owner_email           text not null,
  status                text default 'pending_activation' check (status in ('trialing','pending_activation','active','overdue','suspended','blocked','cancelled')),
  trial_ends_at         timestamptz,
  gc_customer_id        text,
  gc_mandate_id         text,
  gc_subscription_id    text,
  stripe_customer_id    text,
  stripe_subscription_id text,
  stripe_price_id       text,
  subscription_started_at timestamptz,
  last_payment_at       timestamptz,
  next_payment_at       timestamptz,
  grace_period_ends_at  timestamptz,
  created_at            timestamptz default now(),
  updated_at            timestamptz default now()
);

-- Tenants: only platform admins or the tenant owner can read
alter table tenants enable row level security;
create policy "tenant_read_own" on tenants
  for select using (
    id = get_tenant_id()
    or exists (select 1 from platform_admins where user_id = auth.uid())
  );
create policy "tenant_update_own" on tenants
  for update using (id = get_tenant_id());

-- ── Platform Admins (DH staff only) ──────────────────────────
create table platform_admins (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete cascade unique,
  email       text unique not null,
  created_at  timestamptz default now()
);
alter table platform_admins enable row level security;
create policy "superadmin_only" on platform_admins
  for all using (exists (select 1 from platform_admins pa where pa.user_id = auth.uid()));

-- ── Tenant Users ─────────────────────────────────────────────
create table tenant_users (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid references tenants(id) on delete cascade not null,
  user_id     uuid references auth.users(id) on delete cascade,
  role        text default 'staff' check (role in ('owner','admin','manager','staff','superadmin')),
  full_name   text,
  job_title   text,
  department  text,
  email       text,
  avatar_url  text,
  status      text default 'active' check (status in ('active','invited','suspended')),
  invited_at  timestamptz,
  joined_at   timestamptz,
  created_at  timestamptz default now(),
  unique(tenant_id, user_id)
);
alter table tenant_users enable row level security;
create policy "tenant_users_isolation" on tenant_users
  for all using (tenant_id = get_tenant_id()
    or exists (select 1 from platform_admins where user_id = auth.uid()));

-- ── Canonical Employees ──────────────────────────────────────
create table if not exists employees (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid references tenants(id) on delete cascade not null,
  tenant_user_id    uuid references tenant_users(id) on delete set null,
  primary_email     text,
  first_name        text,
  last_name         text,
  display_name      text not null,
  job_title         text,
  department        text,
  manager_employee_id uuid references employees(id) on delete set null,
  is_person         boolean default true,
  is_shared_mailbox boolean default false,
  status            text default 'active' check (status in ('active','invited','suspended')),
  avatar_url        text,
  external_microsoft_id text,
  external_microsoft_user_principal_name text,
  onboarding_mode   boolean default false,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now(),
  unique (tenant_id, primary_email)
);
alter table employees enable row level security;
create policy "employees_isolation" on employees
  for all using (tenant_id = get_tenant_id()
    or exists (select 1 from platform_admins where user_id = auth.uid()));

create table if not exists employee_permissions (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid references tenants(id) on delete cascade not null,
  employee_id       uuid references employees(id) on delete cascade not null unique,
  role_preset       text default 'staff' check (role_preset in ('owner','admin','manager','staff','onboarding')),
  page_overrides    jsonb default '{}'::jsonb,
  onboarding_only   boolean default false,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);
alter table employee_permissions enable row level security;
create policy "employee_permissions_isolation" on employee_permissions
  for all using (tenant_id = get_tenant_id()
    or exists (select 1 from platform_admins where user_id = auth.uid()));

-- ── HR Profiles ──────────────────────────────────────────────
create table hr_profiles (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid references tenants(id) on delete cascade not null,
  employee_id     uuid references employees(id) on delete cascade,
  tenant_user_id  uuid references tenant_users(id) on delete cascade,
  contract_type   text,
  start_date      date,
  manager_id      uuid references tenant_users(id),
  phone           text,
  personal_email  text,
  address         text,
  emergency_name  text,
  emergency_phone text,
  bank_name       text,
  account_name    text,
  sort_code       text,
  account_number  text,
  hr_notes        text,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);
alter table hr_profiles enable row level security;
create policy "hr_profiles_isolation" on hr_profiles
  for all using (tenant_id = get_tenant_id()
    or exists (select 1 from platform_admins where user_id = auth.uid()));
-- HR notes only visible to owner/admin/manager
create policy "hr_notes_restricted" on hr_profiles
  for select using (
    tenant_id = get_tenant_id()
    and (
      exists (select 1 from tenant_users where user_id = auth.uid() and role in ('owner','admin','manager'))
      or tenant_user_id = (select id from tenant_users where user_id = auth.uid() limit 1)
    )
  );

-- ── Leave Requests ────────────────────────────────────────────
create table leave_requests (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid references tenants(id) on delete cascade not null,
  tenant_user_id uuid references tenant_users(id) on delete cascade,
  type          text default 'annual' check (type in ('annual','sick','compassionate','unpaid','other')),
  start_date    date not null,
  end_date      date not null,
  days          numeric,
  status        text default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  notes         text,
  reviewed_by   uuid references tenant_users(id),
  reviewed_at   timestamptz,
  created_at    timestamptz default now()
);
alter table leave_requests enable row level security;
create policy "leave_isolation" on leave_requests
  for all using (tenant_id = get_tenant_id()
    or exists (select 1 from platform_admins where user_id = auth.uid()));

-- ── Documents ────────────────────────────────────────────────
create table documents (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid references tenants(id) on delete cascade not null,
  name          text not null,
  category      text default 'general' check (category in ('policy','contract','payslip','general','onboarding')),
  file_url      text,
  file_path     text,
  visible_to    text default 'all' check (visible_to in ('all','managers','owner')),
  employee_id   uuid references employees(id) on delete set null,
  expires_at    timestamptz,
  requires_acknowledgement boolean default false,
  tenant_user_id uuid references tenant_users(id),
  uploaded_by   uuid references tenant_users(id),
  created_at    timestamptz default now()
);
alter table documents enable row level security;
create policy "documents_isolation" on documents
  for all using (tenant_id = get_tenant_id()
    or exists (select 1 from platform_admins where user_id = auth.uid()));

create table document_acknowledgements (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid references tenants(id) on delete cascade not null,
  document_id   uuid references documents(id) on delete cascade not null,
  tenant_user_id uuid references tenant_users(id) on delete cascade not null,
  acknowledged_at timestamptz default now(),
  created_at    timestamptz default now(),
  unique (document_id, tenant_user_id)
);
alter table document_acknowledgements enable row level security;
create policy "document_acknowledgements_isolation" on document_acknowledgements
  for all using (tenant_id = get_tenant_id()
    or exists (select 1 from platform_admins where user_id = auth.uid()));

-- ── Clients (CRM) ────────────────────────────────────────────
create table clients (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid references tenants(id) on delete cascade not null,
  name          text not null,
  email         text,
  phone         text,
  website       text,
  status        text default 'lead' check (status in ('lead','active','inactive','lost')),
  plan          text,
  value         numeric,
  notes         text,
  assigned_to   uuid references tenant_users(id),
  created_by    uuid references tenant_users(id),
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);
alter table clients enable row level security;
create policy "clients_isolation" on clients
  for all using (tenant_id = get_tenant_id()
    or exists (select 1 from platform_admins where user_id = auth.uid()));

-- ── Tasks ────────────────────────────────────────────────────
create table tasks (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid references tenants(id) on delete cascade not null,
  title         text not null,
  description   text,
  status        text default 'todo' check (status in ('todo','in_progress','done','cancelled')),
  priority      text default 'medium' check (priority in ('low','medium','high','urgent')),
  assigned_to   uuid references tenant_users(id),
  client_id     uuid references clients(id) on delete set null,
  due_date      date,
  created_by    uuid references tenant_users(id),
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);
alter table tasks enable row level security;
create policy "tasks_isolation" on tasks
  for all using (tenant_id = get_tenant_id()
    or exists (select 1 from platform_admins where user_id = auth.uid()));

-- ── Invoices ─────────────────────────────────────────────────
create table invoices (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid references tenants(id) on delete cascade not null,
  client_id       uuid references clients(id) on delete set null,
  invoice_number  text,
  description     text,
  amount          numeric,
  status          text default 'unpaid' check (status in ('unpaid','paid','overdue','cancelled')),
  due_date        date,
  paid_at         timestamptz,
  created_by      uuid references tenant_users(id),
  created_at      timestamptz default now()
);
alter table invoices enable row level security;
create policy "invoices_isolation" on invoices
  for all using (tenant_id = get_tenant_id()
    or exists (select 1 from platform_admins where user_id = auth.uid()));

-- ── Notifications ─────────────────────────────────────────────
create table notifications (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid references tenants(id) on delete cascade not null,
  tenant_user_id  uuid references tenant_users(id) on delete cascade,
  title           text not null,
  message         text,
  type            text default 'info' check (type in ('info','success','warning','error')),
  category        text default 'general',
  is_urgent       boolean default false,
  is_pinned       boolean default false,
  link            text,
  sent_via_email  boolean default false,
  created_by      uuid references tenant_users(id),
  read            boolean default false,
  read_at         timestamptz,
  created_at      timestamptz default now()
);
alter table notifications enable row level security;
create policy "notifications_own" on notifications
  for all using (
    tenant_user_id = (select id from tenant_users where user_id = auth.uid() limit 1)
    or exists (select 1 from platform_admins where user_id = auth.uid())
  );

-- ── Banners / Announcements ──────────────────────────────────
create table banners (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid references tenants(id) on delete cascade not null,
  title             text not null,
  message           text,
  tone              text default 'info' check (tone in ('info','success','warning','urgent')),
  target_path       text,
  target_role       text,
  target_employee_id uuid references employees(id) on delete cascade,
  enabled           boolean default true,
  starts_at         timestamptz,
  ends_at           timestamptz,
  created_by        uuid references tenant_users(id),
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);
alter table banners enable row level security;
create policy "banners_isolation" on banners
  for all using (
    tenant_id = get_tenant_id()
    or exists (select 1 from platform_admins where user_id = auth.uid())
  );

-- ── Audit Log ─────────────────────────────────────────────────
create table audit_log (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid references tenants(id) on delete cascade not null,
  tenant_user_id  uuid references tenant_users(id),
  action          text not null,
  entity          text,
  entity_id       uuid,
  metadata        jsonb,
  created_at      timestamptz default now()
);
alter table audit_log enable row level security;
create policy "audit_isolation" on audit_log
  for all using (tenant_id = get_tenant_id()
    or exists (select 1 from platform_admins where user_id = auth.uid()));

-- ── Webhook Endpoints ────────────────────────────────────────
create table webhook_endpoints (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid references tenants(id) on delete cascade not null,
  label           text not null,
  target_url      text not null,
  secret          text,
  events          text[] default '{}',
  enabled         boolean default true,
  last_tested_at  timestamptz,
  created_by      uuid references tenant_users(id),
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);
alter table webhook_endpoints enable row level security;
create policy "webhook_endpoints_isolation" on webhook_endpoints
  for all using (tenant_id = get_tenant_id()
    or exists (select 1 from platform_admins where user_id = auth.uid()));

-- ── Invitations ───────────────────────────────────────────────
create table invitations (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid references tenants(id) on delete cascade not null,
  email       text not null,
  role        text default 'staff',
  full_name   text,
  token       text unique default encode(gen_random_bytes(32), 'hex'),
  invited_by  uuid references tenant_users(id),
  accepted_at timestamptz,
  expires_at  timestamptz default (now() + interval '7 days'),
  created_at  timestamptz default now()
);
alter table invitations enable row level security;
create policy "invitations_isolation" on invitations
  for all using (tenant_id = get_tenant_id()
    or exists (select 1 from platform_admins where user_id = auth.uid()));

-- ── Timesheets ────────────────────────────────────────────────
create table timesheets (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid references tenants(id) on delete cascade not null,
  tenant_user_id  uuid references tenant_users(id) on delete cascade,
  date            date not null,
  hours           numeric not null,
  description     text,
  client_id       uuid references clients(id) on delete set null,
  status          text default 'pending' check (status in ('pending','approved','rejected')),
  approved_by     uuid references tenant_users(id),
  created_at      timestamptz default now()
);
alter table timesheets enable row level security;
create policy "timesheets_isolation" on timesheets
  for all using (tenant_id = get_tenant_id()
    or exists (select 1 from platform_admins where user_id = auth.uid()));

-- ── Outreach Log ─────────────────────────────────────────────
create table outreach (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid references tenants(id) on delete cascade not null,
  business_name   text,
  contact_name    text,
  email           text,
  phone           text,
  website         text,
  status          text default 'not_contacted' check (status in ('not_contacted','contacted','replied','converted','not_interested')),
  notes           text,
  last_contacted  timestamptz,
  created_by      uuid references tenant_users(id),
  created_at      timestamptz default now()
);
alter table outreach enable row level security;
create policy "outreach_isolation" on outreach
  for all using (tenant_id = get_tenant_id()
    or exists (select 1 from platform_admins where user_id = auth.uid()));

-- ── Automation Rules ─────────────────────────────────────────
create table automation_rules (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid references tenants(id) on delete cascade not null,
  rule_type       text not null check (rule_type in ('invite_follow_up', 'leave_approval', 'timesheet_approval', 'trial_ending', 'billing_attention')),
  enabled         boolean default false,
  cadence         text default 'daily' check (cadence in ('daily', 'weekly')),
  channels        text[] default '{"in_app"}',
  threshold_days  integer default 3,
  last_run_at     timestamptz,
  next_run_at     timestamptz,
  created_by      uuid references tenant_users(id),
  created_at      timestamptz default now(),
  updated_at      timestamptz default now(),
  unique (tenant_id, rule_type)
);
alter table automation_rules enable row level security;
create policy "automation_rules_isolation" on automation_rules
  for all using (tenant_id = get_tenant_id()
    or exists (select 1 from platform_admins where user_id = auth.uid()));

-- ── Automation Runs ──────────────────────────────────────────
create table automation_runs (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid references tenants(id) on delete cascade not null,
  rule_type         text not null check (rule_type in ('invite_follow_up', 'leave_approval', 'timesheet_approval', 'trial_ending', 'billing_attention')),
  status            text default 'running' check (status in ('running', 'success', 'failed')),
  notifications_sent integer default 0,
  emails_sent       integer default 0,
  error_message     text,
  triggered_by      uuid references tenant_users(id),
  started_at        timestamptz default now(),
  completed_at      timestamptz,
  created_at        timestamptz default now()
);
alter table automation_runs enable row level security;
create policy "automation_runs_isolation" on automation_runs
  for all using (tenant_id = get_tenant_id()
    or exists (select 1 from platform_admins where user_id = auth.uid()));

-- ── Indexes for performance ────────────────────────────────────
create index if not exists idx_tenant_users_tenant_id on tenant_users(tenant_id);
create index if not exists idx_tenant_users_user_id on tenant_users(user_id);
create index if not exists idx_employees_tenant_id on employees(tenant_id);
create index if not exists idx_employees_tenant_user_id on employees(tenant_user_id);
create index if not exists idx_employee_permissions_tenant_id on employee_permissions(tenant_id);
create index if not exists idx_clients_tenant_id on clients(tenant_id);
create index if not exists idx_tasks_tenant_id on tasks(tenant_id);
create index if not exists idx_tasks_assigned_to on tasks(assigned_to);
create index if not exists idx_leave_tenant_id on leave_requests(tenant_id);
create index if not exists idx_notifications_user_id on notifications(tenant_user_id);
create index if not exists idx_notifications_tenant_created_at on notifications(tenant_id, created_at desc);
create index if not exists idx_notifications_read_state on notifications(tenant_user_id, read);
create index if not exists idx_documents_employee_id on documents(employee_id);
create index if not exists idx_documents_expires_at on documents(expires_at);
create index if not exists idx_document_acknowledgements_document_id on document_acknowledgements(document_id);
create index if not exists idx_banners_tenant_id on banners(tenant_id);
create index if not exists idx_banners_target_employee on banners(target_employee_id);
create index if not exists idx_audit_tenant_id on audit_log(tenant_id);
create index if not exists idx_tenants_demo_slug on tenants(is_demo, slug);
create index if not exists idx_automation_rules_tenant_id on automation_rules(tenant_id);
create index if not exists idx_automation_runs_tenant_id on automation_runs(tenant_id);

-- ── Insert DH as first platform admin ────────────────────────
-- Run this AFTER creating your account via the sign-up page:
-- insert into platform_admins (user_id, email) values ('<your-auth-uid>', 'david@dhwebsiteservices.co.uk');
-- Then update your tenant_user role:
-- update tenant_users set role = 'superadmin' where email = 'david@dhwebsiteservices.co.uk';

-- Optional later additions:
-- alter table tenants add column if not exists is_demo boolean default false;
-- alter table tenants add column if not exists demo_template text;
-- alter table tenants add column if not exists demo_access_key text;
alter table notifications add column if not exists category text default 'general';
alter table notifications add column if not exists is_urgent boolean default false;
alter table notifications add column if not exists is_pinned boolean default false;
alter table notifications add column if not exists sent_via_email boolean default false;
alter table notifications add column if not exists created_by uuid references tenant_users(id);
alter table notifications add column if not exists read_at timestamptz;
alter table documents add column if not exists employee_id uuid references employees(id) on delete set null;
alter table documents add column if not exists expires_at timestamptz;
alter table documents add column if not exists requires_acknowledgement boolean default false;
create table if not exists document_acknowledgements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade not null,
  document_id uuid references documents(id) on delete cascade not null,
  tenant_user_id uuid references tenant_users(id) on delete cascade not null,
  acknowledged_at timestamptz default now(),
  created_at timestamptz default now(),
  unique (document_id, tenant_user_id)
);
alter table document_acknowledgements enable row level security;
drop policy if exists document_acknowledgements_isolation on document_acknowledgements;
create policy "document_acknowledgements_isolation" on document_acknowledgements
  for all using (
    tenant_id = get_tenant_id()
    or exists (select 1 from platform_admins where user_id = auth.uid())
  );
create table if not exists banners (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade not null,
  title text not null,
  message text,
  tone text default 'info' check (tone in ('info','success','warning','urgent')),
  target_path text,
  target_role text,
  target_employee_id uuid references employees(id) on delete cascade,
  enabled boolean default true,
  starts_at timestamptz,
  ends_at timestamptz,
  created_by uuid references tenant_users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table banners enable row level security;
drop policy if exists banners_isolation on banners;
create policy "banners_isolation" on banners
  for all using (
    tenant_id = get_tenant_id()
    or exists (select 1 from platform_admins where user_id = auth.uid())
  );
