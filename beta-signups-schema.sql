-- ═══════════════════════════════════════════════════════════════
-- Beta Signups Table for Marketing Site
-- Run this AFTER the main schema
-- ═══════════════════════════════════════════════════════════════

-- ── Beta Signups (for marketing landing page) ────────────────────
create table if not exists beta_signups (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  phone           text not null,
  source          text default 'DH Workplace beta landing page',
  ip_address      text,
  user_agent      text,
  created_at      timestamptz default now()
);

-- RLS: Only platform admins can read beta signups
alter table beta_signups enable row level security;
create policy "admin_only_beta_signups" on beta_signups
  for all using (exists (select 1 from platform_admins where user_id = auth.uid()));

-- Index for quick lookups
create index if not exists idx_beta_signups_created_at on beta_signups(created_at desc);
create index if not exists idx_beta_signups_phone on beta_signups(phone);
