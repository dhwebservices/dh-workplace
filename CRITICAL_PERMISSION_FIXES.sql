-- ═══════════════════════════════════════════════════════════════
-- CRITICAL PERMISSION FIXES - STAFF DATA ISOLATION
-- ═══════════════════════════════════════════════════════════════
-- ISSUE: Staff can see ALL tenant data via database queries
-- FIX: Add role-based RLS policies using employee_permissions

-- Helper function to get user's permission record
CREATE OR REPLACE FUNCTION get_user_permissions()
RETURNS TABLE (
  role_preset text,
  crm_clients boolean,
  crm_tasks boolean,
  audit boolean,
  reports boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(ep.role_preset, tu.role) as role_preset,
    COALESCE((ep.page_overrides->>'crm_clients')::boolean, false) as crm_clients,
    COALESCE((ep.page_overrides->>'crm_tasks')::boolean, false) as crm_tasks,
    COALESCE((ep.page_overrides->>'audit')::boolean, false) as audit,
    COALESCE((ep.page_overrides->>'reports')::boolean, false) as reports
  FROM tenant_users tu
  LEFT JOIN employee_permissions ep ON ep.employee_id = tu.id
  WHERE tu.user_id = auth.uid()
  LIMIT 1;
$$;

-- Helper to check if user has permission
CREATE OR REPLACE FUNCTION has_permission(permission_key text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE permission_key
    WHEN 'crm' THEN EXISTS (
      SELECT 1 FROM get_user_permissions()
      WHERE role_preset IN ('owner', 'admin', 'manager', 'superadmin')
         OR crm_clients = true
         OR crm_tasks = true
    )
    WHEN 'audit' THEN EXISTS (
      SELECT 1 FROM get_user_permissions()
      WHERE role_preset IN ('owner', 'admin', 'superadmin')
         OR audit = true
    )
    WHEN 'reports' THEN EXISTS (
      SELECT 1 FROM get_user_permissions()
      WHERE role_preset IN ('owner', 'admin', 'manager', 'superadmin')
         OR reports = true
    )
    WHEN 'documents_manage' THEN EXISTS (
      SELECT 1 FROM get_user_permissions()
      WHERE role_preset IN ('owner', 'admin', 'superadmin')
    )
    ELSE false
  END;
$$;

-- ═══════════════════════════════════════════════════════════════
-- 1. FIX CLIENTS TABLE - Manager+ only
-- ═══════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "clients_isolation" ON clients;

-- SELECT: Only managers+ can see clients
CREATE POLICY "clients_select" ON clients
  FOR SELECT
  USING (
    tenant_id = get_tenant_id()
    AND (
      has_permission('crm')
      OR EXISTS (SELECT 1 FROM platform_admins WHERE user_id = auth.uid())
    )
  );

-- INSERT/UPDATE/DELETE: Only managers+ can modify
CREATE POLICY "clients_insert" ON clients
  FOR INSERT
  WITH CHECK (
    tenant_id = get_tenant_id()
    AND (
      has_permission('crm')
      OR EXISTS (SELECT 1 FROM platform_admins WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "clients_update" ON clients
  FOR UPDATE
  USING (
    tenant_id = get_tenant_id()
    AND (
      has_permission('crm')
      OR EXISTS (SELECT 1 FROM platform_admins WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "clients_delete" ON clients
  FOR DELETE
  USING (
    tenant_id = get_tenant_id()
    AND (
      has_permission('crm')
      OR EXISTS (SELECT 1 FROM platform_admins WHERE user_id = auth.uid())
    )
  );

-- ═══════════════════════════════════════════════════════════════
-- 2. FIX TASKS TABLE - Manager+ only
-- ═══════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "tasks_isolation" ON tasks;

CREATE POLICY "tasks_select" ON tasks
  FOR SELECT
  USING (
    tenant_id = get_tenant_id()
    AND (
      has_permission('crm')
      OR EXISTS (SELECT 1 FROM platform_admins WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "tasks_insert" ON tasks
  FOR INSERT
  WITH CHECK (
    tenant_id = get_tenant_id()
    AND (
      has_permission('crm')
      OR EXISTS (SELECT 1 FROM platform_admins WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "tasks_update" ON tasks
  FOR UPDATE
  USING (
    tenant_id = get_tenant_id()
    AND (
      has_permission('crm')
      OR EXISTS (SELECT 1 FROM platform_admins WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "tasks_delete" ON tasks
  FOR DELETE
  USING (
    tenant_id = get_tenant_id()
    AND (
      has_permission('crm')
      OR EXISTS (SELECT 1 FROM platform_admins WHERE user_id = auth.uid())
    )
  );

-- ═══════════════════════════════════════════════════════════════
-- 3. FIX INVOICES TABLE - Manager+ only
-- ═══════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "invoices_isolation" ON invoices;

CREATE POLICY "invoices_select" ON invoices
  FOR SELECT
  USING (
    tenant_id = get_tenant_id()
    AND (
      has_permission('crm')
      OR EXISTS (SELECT 1 FROM platform_admins WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "invoices_insert" ON invoices
  FOR INSERT
  WITH CHECK (
    tenant_id = get_tenant_id()
    AND (
      has_permission('crm')
      OR EXISTS (SELECT 1 FROM platform_admins WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "invoices_update" ON invoices
  FOR UPDATE
  USING (
    tenant_id = get_tenant_id()
    AND (
      has_permission('crm')
      OR EXISTS (SELECT 1 FROM platform_admins WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "invoices_delete" ON invoices
  FOR DELETE
  USING (
    tenant_id = get_tenant_id()
    AND (
      has_permission('crm')
      OR EXISTS (SELECT 1 FROM platform_admins WHERE user_id = auth.uid())
    )
  );

-- ═══════════════════════════════════════════════════════════════
-- 4. FIX AUDIT_LOG TABLE - Admin+ only
-- ═══════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "audit_isolation" ON audit_log;

CREATE POLICY "audit_select" ON audit_log
  FOR SELECT
  USING (
    tenant_id = get_tenant_id()
    AND (
      has_permission('audit')
      OR EXISTS (SELECT 1 FROM platform_admins WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "audit_insert" ON audit_log
  FOR INSERT
  WITH CHECK (
    tenant_id = get_tenant_id()
  );

-- ═══════════════════════════════════════════════════════════════
-- 5. FIX LEAVE_REQUESTS - Staff see only their own
-- ═══════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "leave_isolation" ON leave_requests;

-- Staff see only their own; managers see all
CREATE POLICY "leave_select" ON leave_requests
  FOR SELECT
  USING (
    tenant_id = get_tenant_id()
    AND (
      -- Own leave requests
      tenant_user_id = (SELECT id FROM tenant_users WHERE user_id = auth.uid() AND tenant_id = leave_requests.tenant_id)
      -- OR manager+
      OR EXISTS (
        SELECT 1 FROM get_user_permissions()
        WHERE role_preset IN ('owner', 'admin', 'manager', 'superadmin')
      )
      OR EXISTS (SELECT 1 FROM platform_admins WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "leave_insert" ON leave_requests
  FOR INSERT
  WITH CHECK (
    tenant_id = get_tenant_id()
  );

CREATE POLICY "leave_update" ON leave_requests
  FOR UPDATE
  USING (
    tenant_id = get_tenant_id()
    AND (
      -- Own leave or manager+
      tenant_user_id = (SELECT id FROM tenant_users WHERE user_id = auth.uid() AND tenant_id = leave_requests.tenant_id)
      OR EXISTS (
        SELECT 1 FROM get_user_permissions()
        WHERE role_preset IN ('owner', 'admin', 'manager', 'superadmin')
      )
      OR EXISTS (SELECT 1 FROM platform_admins WHERE user_id = auth.uid())
    )
  );

-- ═══════════════════════════════════════════════════════════════
-- 6. FIX TIMESHEETS - Staff see only their own
-- ═══════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "timesheets_isolation" ON timesheets;

CREATE POLICY "timesheets_select" ON timesheets
  FOR SELECT
  USING (
    tenant_id = get_tenant_id()
    AND (
      -- Own timesheets
      tenant_user_id = (SELECT id FROM tenant_users WHERE user_id = auth.uid() AND tenant_id = timesheets.tenant_id)
      -- OR manager+
      OR EXISTS (
        SELECT 1 FROM get_user_permissions()
        WHERE role_preset IN ('owner', 'admin', 'manager', 'superadmin')
      )
      OR EXISTS (SELECT 1 FROM platform_admins WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "timesheets_insert" ON timesheets
  FOR INSERT
  WITH CHECK (
    tenant_id = get_tenant_id()
  );

CREATE POLICY "timesheets_update" ON timesheets
  FOR UPDATE
  USING (
    tenant_id = get_tenant_id()
    AND (
      tenant_user_id = (SELECT id FROM tenant_users WHERE user_id = auth.uid() AND tenant_id = timesheets.tenant_id)
      OR EXISTS (
        SELECT 1 FROM get_user_permissions()
        WHERE role_preset IN ('owner', 'admin', 'manager', 'superadmin')
      )
      OR EXISTS (SELECT 1 FROM platform_admins WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "timesheets_delete" ON timesheets
  FOR DELETE
  USING (
    tenant_id = get_tenant_id()
    AND (
      tenant_user_id = (SELECT id FROM tenant_users WHERE user_id = auth.uid() AND tenant_id = timesheets.tenant_id)
      OR EXISTS (
        SELECT 1 FROM get_user_permissions()
        WHERE role_preset IN ('owner', 'admin', 'manager', 'superadmin')
      )
      OR EXISTS (SELECT 1 FROM platform_admins WHERE user_id = auth.uid())
    )
  );

-- ═══════════════════════════════════════════════════════════════
-- 7. FIX DOCUMENTS - Respect visible_to field
-- ═══════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "documents_isolation" ON documents;

CREATE POLICY "documents_select" ON documents
  FOR SELECT
  USING (
    tenant_id = get_tenant_id()
    AND (
      -- visible_to='all': everyone can see
      visible_to = 'all'
      -- visible_to='managers': only manager+
      OR (
        visible_to = 'managers'
        AND EXISTS (
          SELECT 1 FROM get_user_permissions()
          WHERE role_preset IN ('owner', 'admin', 'manager', 'superadmin')
        )
      )
      -- visible_to='owner': only owner
      OR (
        visible_to = 'owner'
        AND EXISTS (
          SELECT 1 FROM get_user_permissions()
          WHERE role_preset IN ('owner', 'superadmin')
        )
      )
      -- Employee-specific document
      OR employee_id IN (
        SELECT e.id FROM employees e
        INNER JOIN tenant_users tu ON tu.id = e.tenant_user_id
        WHERE tu.user_id = auth.uid()
      )
      OR EXISTS (SELECT 1 FROM platform_admins WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "documents_insert" ON documents
  FOR INSERT
  WITH CHECK (
    tenant_id = get_tenant_id()
    AND (
      has_permission('documents_manage')
      OR EXISTS (SELECT 1 FROM platform_admins WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "documents_update" ON documents
  FOR UPDATE
  USING (
    tenant_id = get_tenant_id()
    AND (
      has_permission('documents_manage')
      OR EXISTS (SELECT 1 FROM platform_admins WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "documents_delete" ON documents
  FOR DELETE
  USING (
    tenant_id = get_tenant_id()
    AND (
      has_permission('documents_manage')
      OR EXISTS (SELECT 1 FROM platform_admins WHERE user_id = auth.uid())
    )
  );

-- ═══════════════════════════════════════════════════════════════
-- VERIFICATION
-- ═══════════════════════════════════════════════════════════════

-- Check all policies are applied
SELECT
  tablename,
  COUNT(*) as policy_count
FROM pg_policies
WHERE tablename IN (
  'clients', 'tasks', 'invoices', 'audit_log',
  'leave_requests', 'timesheets', 'documents'
)
GROUP BY tablename
ORDER BY tablename;

-- Should show multiple policies per table
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE tablename IN (
  'clients', 'tasks', 'invoices', 'audit_log',
  'leave_requests', 'timesheets', 'documents'
)
ORDER BY tablename, cmd, policyname;
