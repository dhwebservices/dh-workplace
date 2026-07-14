-- ═══════════════════════════════════════════════════════════════
-- DH Workplace — Complete Supabase Schema + RLS Policies
-- FIXED VERSION - Tables first, then helper function, then policies
-- ═══════════════════════════════════════════════════════════════

-- ── Extensions ───────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ═══════════════════════════════════════════════════════════════
-- PART 1: CREATE ALL TABLES (no RLS policies yet)
-- ═══════════════════════════════════════════════════════════════

-- ── Tenants ──────────────────────────────────────────────────
create table if not exists tenants (
  id                    uuid primary key default gen_random_uuid(),
  name                  text not null,
  slug                  text unique not null,
  custom_subdomain      text unique,
  custom_domain         text unique,
  domain_status         text default 'default' check (domain_status in ('default','subdomain_active','custom_pending','custom_active','error')),
  domain_verified_at    timestamptz,
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

-- ── Platform Admins (DH staff only) ──────────────────────────
create table if not exists platform_admins (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete cascade unique,
  email       text unique not null,
  created_at  timestamptz default now()
);

-- ── Tenant Users ─────────────────────────────────────────────
create table if not exists tenant_users (
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

-- ── HR Profiles ──────────────────────────────────────────────
create table if not exists hr_profiles (
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

-- ── Leave Requests ────────────────────────────────────────────
create table if not exists leave_requests (
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

-- ── Documents ────────────────────────────────────────────────
create table if not exists documents (
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

create table if not exists document_acknowledgements (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid references tenants(id) on delete cascade not null,
  document_id   uuid references documents(id) on delete cascade not null,
  tenant_user_id uuid references tenant_users(id) on delete cascade not null,
  acknowledged_at timestamptz default now(),
  created_at    timestamptz default now(),
  unique (document_id, tenant_user_id)
);

-- ── Clients (CRM) ────────────────────────────────────────────
create table if not exists clients (
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

-- ── Tasks ────────────────────────────────────────────────────
create table if not exists tasks (
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

-- ── Invoices ─────────────────────────────────────────────────
create table if not exists invoices (
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

-- ── Notifications ─────────────────────────────────────────────
create table if not exists notifications (
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

-- ── Banners / Announcements ──────────────────────────────────
create table if not exists banners (
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

-- ── Audit Log ─────────────────────────────────────────────────
create table if not exists audit_log (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid references tenants(id) on delete cascade not null,
  tenant_user_id  uuid references tenant_users(id),
  action          text not null,
  entity          text,
  entity_id       uuid,
  metadata        jsonb,
  created_at      timestamptz default now()
);

-- ── Webhook Endpoints ────────────────────────────────────────
create table if not exists webhook_endpoints (
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

-- ── Invitations ───────────────────────────────────────────────
create table if not exists invitations (
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

-- ── Timesheets ────────────────────────────────────────────────
create table if not exists timesheets (
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

-- ── Outreach Log ─────────────────────────────────────────────
create table if not exists outreach (
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

-- ── Automation Rules ─────────────────────────────────────────
create table if not exists automation_rules (
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

-- ── Automation Runs ──────────────────────────────────────────
create table if not exists automation_runs (
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

-- ── Portal Preferences ────────────────────────────────────────
create table if not exists portal_preferences (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade not null,
  employee_id uuid references employees(id) on delete cascade not null unique,
  theme_mode text default 'light' check (theme_mode in ('light', 'dark')),
  accent_scheme text default 'workspace',
  dashboard_density text default 'comfortable' check (dashboard_density in ('comfortable', 'compact')),
  dashboard_header_style text default 'full' check (dashboard_header_style in ('full', 'minimal')),
  show_system_banners boolean default true,
  visible_dashboard_sections jsonb default '["metrics","quick_actions","workspace","signals"]'::jsonb,
  default_landing_page text default 'dashboard',
  pinned_quick_actions jsonb default '["tasks","notifications","clients","timesheets"]'::jsonb,
  dashboard_section_order jsonb default '["metrics","quick_actions","workspace","signals"]'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ── Staff Schedule ────────────────────────────────────────────
create table if not exists staff_schedule_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade not null,
  employee_id uuid references employees(id) on delete cascade not null,
  entry_date date not null,
  start_time time,
  end_time time,
  is_available boolean default true,
  is_bookable boolean default true,
  location text,
  notes text,
  created_by uuid references tenant_users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (employee_id, entry_date)
);

-- ── Appointments ──────────────────────────────────────────────
create table if not exists appointments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade not null,
  employee_id uuid references employees(id) on delete cascade not null,
  client_id uuid references clients(id) on delete set null,
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text default 'scheduled' check (status in ('scheduled','confirmed','completed','cancelled')),
  location text,
  notes text,
  created_by uuid references tenant_users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ── Beta Signups (for marketing site) ────────────────────────
create table if not exists beta_signups (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  phone           text not null,
  source          text default 'DH Workplace beta landing page',
  ip_address      text,
  user_agent      text,
  created_at      timestamptz default now()
);

-- ═══════════════════════════════════════════════════════════════
-- PART 2: CREATE HELPER FUNCTION (now that tables exist)
-- ═══════════════════════════════════════════════════════════════

create or replace function get_tenant_id()
returns uuid language sql stable as $$
  select tenant_id from tenant_users
  where user_id = auth.uid()
  limit 1
$$;

-- ═══════════════════════════════════════════════════════════════
-- PART 3: ENABLE RLS AND CREATE POLICIES
-- ═══════════════════════════════════════════════════════════════

-- Tenants
alter table tenants enable row level security;
drop policy if exists "tenant_read_own" on tenants;
drop policy if exists "tenant_update_own" on tenants;
create policy "tenant_read_own" on tenants
  for select using (
    id = get_tenant_id()
    or exists (select 1 from platform_admins where user_id = auth.uid())
  );
create policy "tenant_update_own" on tenants
  for update using (id = get_tenant_id());

-- Platform Admins
alter table platform_admins enable row level security;
drop policy if exists "superadmin_only" on platform_admins;
create policy "superadmin_only" on platform_admins
  for all using (exists (select 1 from platform_admins pa where pa.user_id = auth.uid()));

-- Tenant Users
alter table tenant_users enable row level security;
drop policy if exists "tenant_users_isolation" on tenant_users;
create policy "tenant_users_isolation" on tenant_users
  for all using (tenant_id = get_tenant_id()
    or exists (select 1 from platform_admins where user_id = auth.uid()));

-- Employees
alter table employees enable row level security;
drop policy if exists "employees_isolation" on employees;
create policy "employees_isolation" on employees
  for all using (tenant_id = get_tenant_id()
    or exists (select 1 from platform_admins where user_id = auth.uid()));

-- Employee Permissions
alter table employee_permissions enable row level security;
drop policy if exists "employee_permissions_isolation" on employee_permissions;
create policy "employee_permissions_isolation" on employee_permissions
  for all using (tenant_id = get_tenant_id()
    or exists (select 1 from platform_admins where user_id = auth.uid()));

-- HR Profiles
alter table hr_profiles enable row level security;
drop policy if exists "hr_profiles_isolation" on hr_profiles;
drop policy if exists "hr_notes_restricted" on hr_profiles;
create policy "hr_profiles_isolation" on hr_profiles
  for all using (tenant_id = get_tenant_id()
    or exists (select 1 from platform_admins where user_id = auth.uid()));

-- Leave Requests
alter table leave_requests enable row level security;
drop policy if exists "leave_isolation" on leave_requests;
create policy "leave_isolation" on leave_requests
  for all using (tenant_id = get_tenant_id()
    or exists (select 1 from platform_admins where user_id = auth.uid()));

-- Documents
alter table documents enable row level security;
drop policy if exists "documents_isolation" on documents;
create policy "documents_isolation" on documents
  for all using (tenant_id = get_tenant_id()
    or exists (select 1 from platform_admins where user_id = auth.uid()));

-- Document Acknowledgements
alter table document_acknowledgements enable row level security;
drop policy if exists "document_acknowledgements_isolation" on document_acknowledgements;
create policy "document_acknowledgements_isolation" on document_acknowledgements
  for all using (tenant_id = get_tenant_id()
    or exists (select 1 from platform_admins where user_id = auth.uid()));

-- Clients
alter table clients enable row level security;
drop policy if exists "clients_isolation" on clients;
create policy "clients_isolation" on clients
  for all using (tenant_id = get_tenant_id()
    or exists (select 1 from platform_admins where user_id = auth.uid()));

-- Tasks
alter table tasks enable row level security;
drop policy if exists "tasks_isolation" on tasks;
create policy "tasks_isolation" on tasks
  for all using (tenant_id = get_tenant_id()
    or exists (select 1 from platform_admins where user_id = auth.uid()));

-- Invoices
alter table invoices enable row level security;
drop policy if exists "invoices_isolation" on invoices;
create policy "invoices_isolation" on invoices
  for all using (tenant_id = get_tenant_id()
    or exists (select 1 from platform_admins where user_id = auth.uid()));

-- Notifications
alter table notifications enable row level security;
drop policy if exists "notifications_own" on notifications;
create policy "notifications_own" on notifications
  for all using (
    tenant_user_id = (select id from tenant_users where user_id = auth.uid() limit 1)
    or exists (select 1 from platform_admins where user_id = auth.uid())
  );

-- Banners
alter table banners enable row level security;
drop policy if exists "banners_isolation" on banners;
create policy "banners_isolation" on banners
  for all using (
    tenant_id = get_tenant_id()
    or exists (select 1 from platform_admins where user_id = auth.uid())
  );

-- Audit Log
alter table audit_log enable row level security;
drop policy if exists "audit_isolation" on audit_log;
create policy "audit_isolation" on audit_log
  for all using (tenant_id = get_tenant_id()
    or exists (select 1 from platform_admins where user_id = auth.uid()));

-- Webhook Endpoints
alter table webhook_endpoints enable row level security;
drop policy if exists "webhook_endpoints_isolation" on webhook_endpoints;
create policy "webhook_endpoints_isolation" on webhook_endpoints
  for all using (tenant_id = get_tenant_id()
    or exists (select 1 from platform_admins where user_id = auth.uid()));

-- Invitations
alter table invitations enable row level security;
drop policy if exists "invitations_isolation" on invitations;
create policy "invitations_isolation" on invitations
  for all using (tenant_id = get_tenant_id()
    or exists (select 1 from platform_admins where user_id = auth.uid()));

-- Timesheets
alter table timesheets enable row level security;
drop policy if exists "timesheets_isolation" on timesheets;
create policy "timesheets_isolation" on timesheets
  for all using (tenant_id = get_tenant_id()
    or exists (select 1 from platform_admins where user_id = auth.uid()));

-- Outreach
alter table outreach enable row level security;
drop policy if exists "outreach_isolation" on outreach;
create policy "outreach_isolation" on outreach
  for all using (tenant_id = get_tenant_id()
    or exists (select 1 from platform_admins where user_id = auth.uid()));

-- Automation Rules
alter table automation_rules enable row level security;
drop policy if exists "automation_rules_isolation" on automation_rules;
create policy "automation_rules_isolation" on automation_rules
  for all using (tenant_id = get_tenant_id()
    or exists (select 1 from platform_admins where user_id = auth.uid()));

-- Automation Runs
alter table automation_runs enable row level security;
drop policy if exists "automation_runs_isolation" on automation_runs;
create policy "automation_runs_isolation" on automation_runs
  for all using (tenant_id = get_tenant_id()
    or exists (select 1 from platform_admins where user_id = auth.uid()));

-- Portal Preferences
alter table portal_preferences enable row level security;
drop policy if exists "portal_preferences_isolation" on portal_preferences;
create policy "portal_preferences_isolation" on portal_preferences
  for all using (
    tenant_id = get_tenant_id()
    or exists (select 1 from platform_admins where user_id = auth.uid())
  );

-- Staff Schedule Entries
alter table staff_schedule_entries enable row level security;
drop policy if exists "staff_schedule_entries_isolation" on staff_schedule_entries;
create policy "staff_schedule_entries_isolation" on staff_schedule_entries
  for all using (
    tenant_id = get_tenant_id()
    or exists (select 1 from platform_admins where user_id = auth.uid())
  );

-- Appointments
alter table appointments enable row level security;
drop policy if exists "appointments_isolation" on appointments;
create policy "appointments_isolation" on appointments
  for all using (
    tenant_id = get_tenant_id()
    or exists (select 1 from platform_admins where user_id = auth.uid())
  );

-- Beta Signups (marketing site - admin only)
alter table beta_signups enable row level security;
drop policy if exists "admin_only_beta_signups" on beta_signups;
create policy "admin_only_beta_signups" on beta_signups
  for all using (exists (select 1 from platform_admins where user_id = auth.uid()));

-- ═══════════════════════════════════════════════════════════════
-- PART 4: CREATE INDEXES
-- ═══════════════════════════════════════════════════════════════

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
create index if not exists idx_portal_preferences_tenant_id on portal_preferences(tenant_id);
create index if not exists idx_audit_tenant_id on audit_log(tenant_id);
create index if not exists idx_tenants_demo_slug on tenants(is_demo, slug);
create index if not exists idx_automation_rules_tenant_id on automation_rules(tenant_id);
create index if not exists idx_automation_runs_tenant_id on automation_runs(tenant_id);
create index if not exists idx_staff_schedule_entries_tenant_date on staff_schedule_entries(tenant_id, entry_date);
create index if not exists idx_staff_schedule_entries_employee on staff_schedule_entries(employee_id);
create index if not exists idx_appointments_tenant_start on appointments(tenant_id, starts_at);
create index if not exists idx_appointments_employee on appointments(employee_id);
create index if not exists idx_beta_signups_created_at on beta_signups(created_at desc);
create index if not exists idx_beta_signups_phone on beta_signups(phone);
