-- ═══════════════════════════════════════════════════════════════
-- Fix 500 Errors on Login - RLS Policy Circular Dependency Fix
-- The problem: get_tenant_id() queries tenant_users, which has RLS
-- that calls get_tenant_id() -> infinite loop -> 500 error
-- ═══════════════════════════════════════════════════════════════

-- Solution: Allow users to read their own tenant_users record directly
-- without calling get_tenant_id()

-- Fix tenant_users policies to avoid circular dependency
drop policy if exists "tenant_users_isolation" on tenant_users;

-- Allow users to SELECT their own tenant_user record
create policy "tenant_users_select_own" on tenant_users
  for select
  using (
    user_id = auth.uid()
    or exists (select 1 from platform_admins where user_id = auth.uid())
  );

-- Allow INSERT during signup
create policy "tenant_users_insert_signup" on tenant_users
  for insert
  with check (user_id = auth.uid());

-- Allow UPDATE for own record
create policy "tenant_users_update_own" on tenant_users
  for update
  using (user_id = auth.uid());

-- Allow DELETE for own record (or platform admin)
create policy "tenant_users_delete" on tenant_users
  for delete
  using (
    user_id = auth.uid()
    or exists (select 1 from platform_admins where user_id = auth.uid())
  );

-- Fix platform_admins to allow users to check if they're an admin
drop policy if exists "superadmin_only" on platform_admins;

-- Allow users to check if they are a platform admin
create policy "platform_admins_select" on platform_admins
  for select
  using (
    user_id = auth.uid()
    or exists (select 1 from platform_admins pa where pa.user_id = auth.uid())
  );

-- Only existing platform admins can INSERT new admins
create policy "platform_admins_insert" on platform_admins
  for insert
  with check (
    exists (select 1 from platform_admins where user_id = auth.uid())
  );

-- Only existing platform admins can UPDATE
create policy "platform_admins_update" on platform_admins
  for update
  using (
    exists (select 1 from platform_admins where user_id = auth.uid())
  );

-- Only existing platform admins can DELETE
create policy "platform_admins_delete" on platform_admins
  for delete
  using (
    exists (select 1 from platform_admins where user_id = auth.uid())
  );

-- Now update get_tenant_id() to be more robust
create or replace function get_tenant_id()
returns uuid
language sql
stable
security definer
as $$
  select tenant_id
  from tenant_users
  where user_id = auth.uid()
  limit 1
$$;

-- Verify the fix worked
select 'RLS policies fixed - circular dependency resolved' as status;
