-- ═══════════════════════════════════════════════════════════════
-- Fix Platform Admins RLS - Allow users to check if they're admins
-- ═══════════════════════════════════════════════════════════════

-- Drop all platform_admins SELECT policies
DROP POLICY IF EXISTS "platform_admins_select" ON platform_admins;
DROP POLICY IF EXISTS "superadmin_only" ON platform_admins;

-- Create a new SELECT policy that allows users to check if THEY are an admin
-- This MUST NOT have a circular dependency
CREATE POLICY "platform_admins_select_self" ON platform_admins
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR
    auth.uid() IN (SELECT user_id FROM platform_admins)
  );

-- Allow existing platform admins to INSERT new admins
DROP POLICY IF EXISTS "platform_admins_insert" ON platform_admins;
CREATE POLICY "platform_admins_insert" ON platform_admins
  FOR INSERT
  WITH CHECK (
    auth.uid() IN (SELECT user_id FROM platform_admins)
  );

-- Allow existing platform admins to UPDATE
DROP POLICY IF EXISTS "platform_admins_update" ON platform_admins;
CREATE POLICY "platform_admins_update" ON platform_admins
  FOR UPDATE
  USING (
    auth.uid() IN (SELECT user_id FROM platform_admins)
  );

-- Allow existing platform admins to DELETE
DROP POLICY IF EXISTS "platform_admins_delete" ON platform_admins;
CREATE POLICY "platform_admins_delete" ON platform_admins
  FOR DELETE
  USING (
    auth.uid() IN (SELECT user_id FROM platform_admins)
  );

-- Verify policies
SELECT
  tablename,
  policyname,
  cmd,
  qual
FROM pg_policies
WHERE tablename = 'platform_admins';
