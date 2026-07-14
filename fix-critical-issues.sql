-- ═══════════════════════════════════════════════════════════════
-- FIX CRITICAL ISSUES - Production Readiness
-- ═══════════════════════════════════════════════════════════════

-- 1. Fix Invitations RLS Policy
-- Allow users to create invitations for their own tenant
DROP POLICY IF EXISTS "invitations_insert" ON invitations;
CREATE POLICY "invitations_insert" ON invitations
  FOR INSERT
  WITH CHECK (
    tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM platform_admins WHERE user_id = auth.uid())
  );

-- Also ensure SELECT policy exists for invitations
DROP POLICY IF EXISTS "invitations_isolation" ON invitations;
CREATE POLICY "invitations_select" ON invitations
  FOR SELECT
  USING (
    tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM platform_admins WHERE user_id = auth.uid())
  );

-- Allow updating own tenant's invitations
DROP POLICY IF EXISTS "invitations_update" ON invitations;
CREATE POLICY "invitations_update" ON invitations
  FOR UPDATE
  USING (
    tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM platform_admins WHERE user_id = auth.uid())
  );

-- Allow deleting own tenant's invitations
DROP POLICY IF EXISTS "invitations_delete" ON invitations;
CREATE POLICY "invitations_delete" ON invitations
  FOR DELETE
  USING (
    tenant_id IN (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM platform_admins WHERE user_id = auth.uid())
  );

-- 2. Clean up any test data
UPDATE tenants
SET stripe_subscription_id = NULL,
    status = 'pending_activation'
WHERE stripe_subscription_id = 'sub_test'
  OR stripe_subscription_id = 'manual_test_activation';

-- 3. Verify RLS is enabled on all critical tables
DO $$
DECLARE
  tbl text;
BEGIN
  FOR tbl IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename IN (
        'tenants', 'tenant_users', 'platform_admins', 'employees',
        'clients', 'tasks', 'documents', 'leave_requests', 'timesheets',
        'invitations', 'notifications', 'audit_log', 'banners'
      )
      AND NOT EXISTS (
        SELECT 1 FROM pg_class
        WHERE relname = tablename
        AND relrowsecurity = true
      )
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    RAISE NOTICE 'Enabled RLS on table: %', tbl;
  END LOOP;
END $$;

-- 4. Verify all policies applied correctly
SELECT
  'RLS Policies Applied Successfully' as status,
  COUNT(*) as policy_count
FROM pg_policies
WHERE tablename IN (
  'tenants', 'tenant_users', 'platform_admins', 'invitations'
);

-- Display invitation policies
SELECT
  tablename,
  policyname,
  cmd
FROM pg_policies
WHERE tablename = 'invitations'
ORDER BY cmd;
