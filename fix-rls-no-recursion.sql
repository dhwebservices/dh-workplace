-- ═══════════════════════════════════════════════════════════════
-- Fix RLS - NO RECURSION - Simple Direct Policies
-- ═══════════════════════════════════════════════════════════════

-- PLATFORM_ADMINS: Just allow users to read their own record - THAT'S IT
DROP POLICY IF EXISTS "platform_admins_select_self" ON platform_admins;
CREATE POLICY "platform_admins_select_own" ON platform_admins
  FOR SELECT
  USING (user_id = auth.uid());

-- No circular dependency - just a simple direct check!

-- For INSERT/UPDATE/DELETE, we'll use a helper function that's SECURITY DEFINER
-- This bypasses RLS when checking if someone is an admin

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

-- Now use this function for write operations
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

-- TENANT_USERS: Use the same pattern
DROP POLICY IF EXISTS "tenant_users_select" ON tenant_users;
CREATE POLICY "tenant_users_select" ON tenant_users
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR is_platform_admin()
  );

DROP POLICY IF EXISTS "tenant_users_insert" ON tenant_users;
CREATE POLICY "tenant_users_insert" ON tenant_users
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "tenant_users_update" ON tenant_users;
CREATE POLICY "tenant_users_update" ON tenant_users
  FOR UPDATE
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "tenant_users_delete" ON tenant_users;
CREATE POLICY "tenant_users_delete" ON tenant_users
  FOR DELETE
  USING (user_id = auth.uid() OR is_platform_admin());

-- Verify no circular dependencies
SELECT 'RLS policies fixed - no more recursion!' as status;

SELECT
  tablename,
  policyname,
  cmd
FROM pg_policies
WHERE tablename IN ('platform_admins', 'tenant_users')
ORDER BY tablename, cmd;
