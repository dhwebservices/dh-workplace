-- ═══════════════════════════════════════════════════════════════
-- Test RLS Policies as the Logged-In User
-- ═══════════════════════════════════════════════════════════════

-- Set the auth context to your user
SET request.jwt.claims.sub = 'd6de1fc1-1daa-4b46-b87f-6f6c47acad7a';

-- Test 1: Can the user read their own platform_admins record?
SELECT
  id,
  email,
  'SUCCESS: Can read platform_admins' as test_result
FROM platform_admins
WHERE user_id = 'd6de1fc1-1daa-4b46-b87f-6f6c47acad7a';

-- Test 2: List all RLS policies on platform_admins
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual
FROM pg_policies
WHERE tablename = 'platform_admins';

-- Test 3: List all RLS policies on tenant_users
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual
FROM pg_policies
WHERE tablename = 'tenant_users';

-- Reset
RESET request.jwt.claims.sub;
