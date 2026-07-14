-- ═══════════════════════════════════════════════════════════════
-- COMPLETE FIX - All RLS Issues
-- ═══════════════════════════════════════════════════════════════
-- This fixes:
-- 1. Circular dependencies in platform_admins/tenant_users
-- 2. Missing INSERT policy on tenants (signup failure)
-- 3. All policies use SECURITY DEFINER functions to avoid recursion

-- ═══════════════════════════════════════════════════════════════
-- STEP 1: Create helper functions (SECURITY DEFINER = bypass RLS)
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION is_platform_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM platform_admins
    WHERE user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION get_tenant_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tenant_id FROM tenant_users
  WHERE user_id = auth.uid()
  LIMIT 1;
$$;

-- ═══════════════════════════════════════════════════════════════
-- STEP 2: Fix PLATFORM_ADMINS policies (no circular dependency)
-- ═══════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "platform_admins_select" ON platform_admins;
DROP POLICY IF EXISTS "platform_admins_select_self" ON platform_admins;
DROP POLICY IF EXISTS "platform_admins_select_own" ON platform_admins;
DROP POLICY IF EXISTS "superadmin_only" ON platform_admins;

-- Users can read their OWN record only (no recursion)
CREATE POLICY "platform_admins_select" ON platform_admins
  FOR SELECT
  USING (user_id = auth.uid());

-- Only platform admins can INSERT new admins (uses SECURITY DEFINER function)
DROP POLICY IF EXISTS "platform_admins_insert" ON platform_admins;
CREATE POLICY "platform_admins_insert" ON platform_admins
  FOR INSERT
  WITH CHECK (is_platform_admin());

DROP POLICY IF EXISTS "platform_admins_update" ON platform_admins;
CREATE POLICY "platform_admins_update" ON platform_admins
  FOR UPDATE
  USING (is_platform_admin());

DROP POLICY IF EXISTS "platform_admins_delete" ON platform_admins;
CREATE POLICY "platform_admins_delete" ON platform_admins
  FOR DELETE
  USING (is_platform_admin());

-- ═══════════════════════════════════════════════════════════════
-- STEP 3: Fix TENANT_USERS policies
-- ═══════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "tenant_users_select" ON tenant_users;
CREATE POLICY "tenant_users_select" ON tenant_users
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR is_platform_admin()
  );

DROP POLICY IF EXISTS "tenant_users_insert" ON tenant_users;
DROP POLICY IF EXISTS "tenant_users_insert_signup" ON tenant_users;
CREATE POLICY "tenant_users_insert" ON tenant_users
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "tenant_users_update" ON tenant_users;
CREATE POLICY "tenant_users_update" ON tenant_users
  FOR UPDATE
  USING (user_id = auth.uid() OR is_platform_admin());

DROP POLICY IF EXISTS "tenant_users_delete" ON tenant_users;
CREATE POLICY "tenant_users_delete" ON tenant_users
  FOR DELETE
  USING (user_id = auth.uid() OR is_platform_admin());

-- ═══════════════════════════════════════════════════════════════
-- STEP 4: Fix TENANTS policies (ADD MISSING INSERT POLICY!)
-- ═══════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "tenant_read_own" ON tenants;
CREATE POLICY "tenant_read_own" ON tenants
  FOR SELECT
  USING (
    id = get_tenant_id()
    OR is_platform_admin()
  );

-- THIS WAS MISSING - allows signup to create tenant
DROP POLICY IF EXISTS "tenant_insert_signup" ON tenants;
CREATE POLICY "tenant_insert_signup" ON tenants
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "tenant_update_own" ON tenants;
CREATE POLICY "tenant_update_own" ON tenants
  FOR UPDATE
  USING (id = get_tenant_id() OR is_platform_admin());

DROP POLICY IF EXISTS "tenant_delete" ON tenants;
CREATE POLICY "tenant_delete" ON tenants
  FOR DELETE
  USING (is_platform_admin());

-- ═══════════════════════════════════════════════════════════════
-- STEP 5: Fix other tables that might block signup
-- ═══════════════════════════════════════════════════════════════

-- EMPLOYEES
DROP POLICY IF EXISTS "employees_insert" ON employees;
CREATE POLICY "employees_insert" ON employees
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- EMPLOYEE_PERMISSIONS
DROP POLICY IF EXISTS "employee_permissions_insert" ON employee_permissions;
CREATE POLICY "employee_permissions_insert" ON employee_permissions
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- PORTAL_PREFERENCES
DROP POLICY IF EXISTS "portal_preferences_insert" ON portal_preferences;
CREATE POLICY "portal_preferences_insert" ON portal_preferences
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- HR_PROFILES
DROP POLICY IF EXISTS "hr_profiles_insert" ON hr_profiles;
CREATE POLICY "hr_profiles_insert" ON hr_profiles
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- ═══════════════════════════════════════════════════════════════
-- VERIFICATION
-- ═══════════════════════════════════════════════════════════════

SELECT 'COMPLETE FIX APPLIED!' as status;

SELECT
  tablename,
  policyname,
  cmd
FROM pg_policies
WHERE tablename IN ('tenants', 'tenant_users', 'platform_admins')
ORDER BY tablename, cmd;
