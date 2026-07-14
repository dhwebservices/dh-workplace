-- ═══════════════════════════════════════════════════════════════
-- Fix RLS for Signup - Allow Creating Tenants & Employees
-- ═══════════════════════════════════════════════════════════════

-- TENANTS: Allow authenticated users to INSERT (for signup)
DROP POLICY IF EXISTS "tenant_insert_signup" ON tenants;
CREATE POLICY "tenant_insert_signup" ON tenants
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- EMPLOYEES: Allow INSERT during signup
DROP POLICY IF EXISTS "employees_insert" ON employees;
CREATE POLICY "employees_insert" ON employees
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- EMPLOYEE_PERMISSIONS: Allow INSERT during signup
DROP POLICY IF EXISTS "employee_permissions_insert" ON employee_permissions;
CREATE POLICY "employee_permissions_insert" ON employee_permissions
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- PORTAL_PREFERENCES: Allow INSERT during signup
DROP POLICY IF EXISTS "portal_preferences_insert" ON portal_preferences;
CREATE POLICY "portal_preferences_insert" ON portal_preferences
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- HR_PROFILES: Allow INSERT during signup
DROP POLICY IF EXISTS "hr_profiles_insert" ON hr_profiles;
CREATE POLICY "hr_profiles_insert" ON hr_profiles
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Verify
SELECT 'Signup RLS policies fixed!' as status;
