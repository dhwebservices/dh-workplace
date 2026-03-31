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
  status                text default 'trialing' check (status in ('trialing','active','overdue','suspended','cancelled')),
  trial_ends_at         timestamptz,
  gc_customer_id        text,
  gc_mandate_id         text,
  gc_subscription_id    text,
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

-- ── HR Profiles ──────────────────────────────────────────────
create table hr_profiles (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid references tenants(id) on delete cascade not null,
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
  tenant_user_id uuid references tenant_users(id),
  uploaded_by   uuid references tenant_users(id),
  created_at    timestamptz default now()
);
alter table documents enable row level security;
create policy "documents_isolation" on documents
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
  link            text,
  read            boolean default false,
  created_at      timestamptz default now()
);
alter table notifications enable row level security;
create policy "notifications_own" on notifications
  for all using (
    tenant_user_id = (select id from tenant_users where user_id = auth.uid() limit 1)
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

-- ── Indexes for performance ────────────────────────────────────
create index if not exists idx_tenant_users_tenant_id on tenant_users(tenant_id);
create index if not exists idx_tenant_users_user_id on tenant_users(user_id);
create index if not exists idx_clients_tenant_id on clients(tenant_id);
create index if not exists idx_tasks_tenant_id on tasks(tenant_id);
create index if not exists idx_tasks_assigned_to on tasks(assigned_to);
create index if not exists idx_leave_tenant_id on leave_requests(tenant_id);
create index if not exists idx_notifications_user_id on notifications(tenant_user_id);
create index if not exists idx_audit_tenant_id on audit_log(tenant_id);

-- ── Insert DH as first platform admin ────────────────────────
-- Run this AFTER creating your account via the sign-up page:
-- insert into platform_admins (user_id, email) values ('<your-auth-uid>', 'david@dhwebsiteservices.co.uk');
-- Then update your tenant_user role:
-- update tenant_users set role = 'superadmin' where email = 'david@dhwebsiteservices.co.uk';
