-- ═══════════════════════════════════════════════════════════════
-- COMPLETE RLS ISOLATION VERIFICATION
-- ═══════════════════════════════════════════════════════════════
-- This checks that staff can ONLY see what they should see

-- 1. Check ALL tables have RLS enabled
SELECT
  schemaname,
  tablename,
  CASE
    WHEN rowsecurity THEN '✅ ENABLED'
    ELSE '❌ DISABLED'
  END as rls_status
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename NOT LIKE 'pg_%'
  AND tablename NOT IN ('spatial_ref_sys')
ORDER BY rls_status DESC, tablename;

-- 2. List ALL policies on each table
SELECT
  tablename,
  policyname,
  cmd,
  CASE
    WHEN qual IS NOT NULL THEN 'Has USING clause'
    ELSE 'No USING'
  END as has_using,
  CASE
    WHEN with_check IS NOT NULL THEN 'Has WITH CHECK'
    ELSE 'No WITH CHECK'
  END as has_with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, cmd;

-- 3. Check sensitive tables that staff should NOT access directly
SELECT
  'Checking sensitive tables...' as check_name;

-- Check if employees table isolates by tenant
SELECT
  'employees' as table_name,
  policyname,
  cmd,
  LEFT(qual::text, 100) as policy_condition
FROM pg_policies
WHERE tablename = 'employees';

-- Check if clients table isolates by tenant (staff shouldn't see these)
SELECT
  'clients' as table_name,
  policyname,
  cmd,
  LEFT(qual::text, 100) as policy_condition
FROM pg_policies
WHERE tablename = 'clients';

-- Check if tasks table isolates by tenant (staff shouldn't see these)
SELECT
  'tasks' as table_name,
  policyname,
  cmd,
  LEFT(qual::text, 100) as policy_condition
FROM pg_policies
WHERE tablename = 'tasks';

-- Check if reports/audit tables are restricted
SELECT
  'audit_log' as table_name,
  policyname,
  cmd,
  LEFT(qual::text, 100) as policy_condition
FROM pg_policies
WHERE tablename = 'audit_log';

-- 4. Check employee_permissions table (this controls fine-grained access)
SELECT
  tablename,
  policyname,
  cmd,
  LEFT(qual::text, 150) as policy_condition
FROM pg_policies
WHERE tablename = 'employee_permissions';

-- 5. Verify leave requests isolation (staff should only see their own)
SELECT
  tablename,
  policyname,
  cmd,
  LEFT(qual::text, 150) as policy_condition
FROM pg_policies
WHERE tablename = 'leave_requests';

-- 6. Verify timesheets isolation
SELECT
  tablename,
  policyname,
  cmd,
  LEFT(qual::text, 150) as policy_condition
FROM pg_policies
WHERE tablename = 'timesheets';

-- 7. Check documents table - staff should see only docs visible to them
SELECT
  tablename,
  policyname,
  cmd,
  LEFT(qual::text, 150) as policy_condition
FROM pg_policies
WHERE tablename = 'documents';
