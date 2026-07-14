-- ═══════════════════════════════════════════════════════════════
-- Clean RLS Fix - No Duplicates
-- Run this to fix 500 errors on login
-- ═══════════════════════════════════════════════════════════════

-- Drop ALL existing policies on tenant_users
drop policy if exists "tenant_users_isolation" on tenant_users;
drop policy if exists "tenant_users_select_own" on tenant_users;
drop policy if exists "tenant_users_insert_signup" on tenant_users;
drop policy if exists "tenant_users_update_own" on tenant_users;
drop policy if exists "tenant_users_delete" on tenant_users;

-- Create fresh policies for tenant_users
create policy "tenant_users_select" on tenant_users
  for select
  using (
    user_id = auth.uid()
    or exists (select 1 from platform_admins where user_id = auth.uid())
  );

create policy "tenant_users_insert" on tenant_users
  for insert
  with check (user_id = auth.uid());

create policy "tenant_users_update" on tenant_users
  for update
  using (user_id = auth.uid());

create policy "tenant_users_delete" on tenant_users
  for delete
  using (
    user_id = auth.uid()
    or exists (select 1 from platform_admins where user_id = auth.uid())
  );

-- Drop ALL existing policies on platform_admins
drop policy if exists "superadmin_only" on platform_admins;
drop policy if exists "platform_admins_select" on platform_admins;
drop policy if exists "platform_admins_insert" on platform_admins;
drop policy if exists "platform_admins_update" on platform_admins;
drop policy if exists "platform_admins_delete" on platform_admins;

-- Create fresh policies for platform_admins
create policy "platform_admins_select" on platform_admins
  for select
  using (user_id = auth.uid());

create policy "platform_admins_insert" on platform_admins
  for insert
  with check (
    exists (select 1 from platform_admins where user_id = auth.uid())
  );

create policy "platform_admins_update" on platform_admins
  for update
  using (
    exists (select 1 from platform_admins where user_id = auth.uid())
  );

create policy "platform_admins_delete" on platform_admins
  for delete
  using (
    exists (select 1 from platform_admins where user_id = auth.uid())
  );

-- Update get_tenant_id to be security definer (bypasses RLS)
create or replace function get_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select tenant_id
  from tenant_users
  where user_id = auth.uid()
  limit 1
$$;

-- Verify
select 'RLS policies cleaned and fixed!' as status;
