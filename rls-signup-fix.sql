-- ═══════════════════════════════════════════════════════════════
-- RLS Policy Fix for Sign-Up Flow
-- Allows new users to create tenants and tenant_user records
-- ═══════════════════════════════════════════════════════════════

-- Allow authenticated users to create new tenants (for sign-up)
drop policy if exists "tenant_insert_signup" on tenants;
create policy "tenant_insert_signup" on tenants
  for insert
  with check (auth.uid() is not null);

-- Allow authenticated users to create tenant_user records
drop policy if exists "tenant_users_insert_signup" on tenant_users;
create policy "tenant_users_insert_signup" on tenant_users
  for insert
  with check (
    auth.uid() is not null
    and (user_id = auth.uid() or auth.uid() is not null)
  );

-- Allow users to update their own tenant_user record
drop policy if exists "tenant_users_update_own" on tenant_users;
create policy "tenant_users_update_own" on tenant_users
  for update
  using (user_id = auth.uid() or tenant_id = get_tenant_id());

-- Allow users to insert employees for their tenant
drop policy if exists "employees_insert" on employees;
create policy "employees_insert" on employees
  for insert
  with check (tenant_id = get_tenant_id() or auth.uid() is not null);

-- Allow users to update employees in their tenant
drop policy if exists "employees_update" on employees;
create policy "employees_update" on employees
  for update
  using (tenant_id = get_tenant_id());

-- Allow users to delete employees in their tenant
drop policy if exists "employees_delete" on employees;
create policy "employees_delete" on employees
  for delete
  using (tenant_id = get_tenant_id());

-- Allow users to insert employee permissions
drop policy if exists "employee_permissions_insert" on employee_permissions;
create policy "employee_permissions_insert" on employee_permissions
  for insert
  with check (tenant_id = get_tenant_id() or auth.uid() is not null);

-- Allow users to update employee permissions
drop policy if exists "employee_permissions_update" on employee_permissions;
create policy "employee_permissions_update" on employee_permissions
  for update
  using (tenant_id = get_tenant_id());

-- Allow users to insert their own HR profile
drop policy if exists "hr_profiles_insert" on hr_profiles;
create policy "hr_profiles_insert" on hr_profiles
  for insert
  with check (tenant_id = get_tenant_id() or auth.uid() is not null);

-- Allow users to update HR profiles in their tenant
drop policy if exists "hr_profiles_update" on hr_profiles;
create policy "hr_profiles_update" on hr_profiles
  for update
  using (tenant_id = get_tenant_id());

-- Allow users to insert portal preferences
drop policy if exists "portal_preferences_insert" on portal_preferences;
create policy "portal_preferences_insert" on portal_preferences
  for insert
  with check (tenant_id = get_tenant_id() or auth.uid() is not null);

-- Allow users to update portal preferences
drop policy if exists "portal_preferences_update" on portal_preferences;
create policy "portal_preferences_update" on portal_preferences
  for update
  using (tenant_id = get_tenant_id());

-- Allow users to insert documents
drop policy if exists "documents_insert" on documents;
create policy "documents_insert" on documents
  for insert
  with check (tenant_id = get_tenant_id());

-- Allow users to update documents
drop policy if exists "documents_update" on documents;
create policy "documents_update" on documents
  for update
  using (tenant_id = get_tenant_id());

-- Allow users to delete documents
drop policy if exists "documents_delete" on documents;
create policy "documents_delete" on documents
  for delete
  using (tenant_id = get_tenant_id());

-- Similar policies for other tables that need insert/update/delete
-- Clients
drop policy if exists "clients_insert" on clients;
create policy "clients_insert" on clients for insert with check (tenant_id = get_tenant_id());
drop policy if exists "clients_update" on clients;
create policy "clients_update" on clients for update using (tenant_id = get_tenant_id());
drop policy if exists "clients_delete" on clients;
create policy "clients_delete" on clients for delete using (tenant_id = get_tenant_id());

-- Tasks
drop policy if exists "tasks_insert" on tasks;
create policy "tasks_insert" on tasks for insert with check (tenant_id = get_tenant_id());
drop policy if exists "tasks_update" on tasks;
create policy "tasks_update" on tasks for update using (tenant_id = get_tenant_id());
drop policy if exists "tasks_delete" on tasks;
create policy "tasks_delete" on tasks for delete using (tenant_id = get_tenant_id());

-- Leave Requests
drop policy if exists "leave_insert" on leave_requests;
create policy "leave_insert" on leave_requests for insert with check (tenant_id = get_tenant_id());
drop policy if exists "leave_update" on leave_requests;
create policy "leave_update" on leave_requests for update using (tenant_id = get_tenant_id());
drop policy if exists "leave_delete" on leave_requests;
create policy "leave_delete" on leave_requests for delete using (tenant_id = get_tenant_id());

-- Invoices
drop policy if exists "invoices_insert" on invoices;
create policy "invoices_insert" on invoices for insert with check (tenant_id = get_tenant_id());
drop policy if exists "invoices_update" on invoices;
create policy "invoices_update" on invoices for update using (tenant_id = get_tenant_id());
drop policy if exists "invoices_delete" on invoices;
create policy "invoices_delete" on invoices for delete using (tenant_id = get_tenant_id());

-- Notifications
drop policy if exists "notifications_insert" on notifications;
create policy "notifications_insert" on notifications for insert with check (tenant_id = get_tenant_id());
drop policy if exists "notifications_update" on notifications;
create policy "notifications_update" on notifications for update using (
  tenant_user_id = (select id from tenant_users where user_id = auth.uid() limit 1)
  or exists (select 1 from platform_admins where user_id = auth.uid())
);
drop policy if exists "notifications_delete" on notifications;
create policy "notifications_delete" on notifications for delete using (
  tenant_user_id = (select id from tenant_users where user_id = auth.uid() limit 1)
);

-- Timesheets
drop policy if exists "timesheets_insert" on timesheets;
create policy "timesheets_insert" on timesheets for insert with check (tenant_id = get_tenant_id());
drop policy if exists "timesheets_update" on timesheets;
create policy "timesheets_update" on timesheets for update using (tenant_id = get_tenant_id());
drop policy if exists "timesheets_delete" on timesheets;
create policy "timesheets_delete" on timesheets for delete using (tenant_id = get_tenant_id());

-- Invitations
drop policy if exists "invitations_insert" on invitations;
create policy "invitations_insert" on invitations for insert with check (tenant_id = get_tenant_id());
drop policy if exists "invitations_update" on invitations;
create policy "invitations_update" on invitations for update using (tenant_id = get_tenant_id());
drop policy if exists "invitations_delete" on invitations;
create policy "invitations_delete" on invitations for delete using (tenant_id = get_tenant_id());

-- Outreach
drop policy if exists "outreach_insert" on outreach;
create policy "outreach_insert" on outreach for insert with check (tenant_id = get_tenant_id());
drop policy if exists "outreach_update" on outreach;
create policy "outreach_update" on outreach for update using (tenant_id = get_tenant_id());
drop policy if exists "outreach_delete" on outreach;
create policy "outreach_delete" on outreach for delete using (tenant_id = get_tenant_id());

-- Banners
drop policy if exists "banners_insert" on banners;
create policy "banners_insert" on banners for insert with check (tenant_id = get_tenant_id());
drop policy if exists "banners_update" on banners;
create policy "banners_update" on banners for update using (tenant_id = get_tenant_id());
drop policy if exists "banners_delete" on banners;
create policy "banners_delete" on banners for delete using (tenant_id = get_tenant_id());

-- Automation Rules
drop policy if exists "automation_rules_insert" on automation_rules;
create policy "automation_rules_insert" on automation_rules for insert with check (tenant_id = get_tenant_id());
drop policy if exists "automation_rules_update" on automation_rules;
create policy "automation_rules_update" on automation_rules for update using (tenant_id = get_tenant_id());
drop policy if exists "automation_rules_delete" on automation_rules;
create policy "automation_rules_delete" on automation_rules for delete using (tenant_id = get_tenant_id());

-- Automation Runs
drop policy if exists "automation_runs_insert" on automation_runs;
create policy "automation_runs_insert" on automation_runs for insert with check (tenant_id = get_tenant_id());
drop policy if exists "automation_runs_update" on automation_runs;
create policy "automation_runs_update" on automation_runs for update using (tenant_id = get_tenant_id());

-- Audit Log
drop policy if exists "audit_insert" on audit_log;
create policy "audit_insert" on audit_log for insert with check (tenant_id = get_tenant_id());

-- Document Acknowledgements
drop policy if exists "document_acknowledgements_insert" on document_acknowledgements;
create policy "document_acknowledgements_insert" on document_acknowledgements for insert with check (tenant_id = get_tenant_id());

-- Webhook Endpoints
drop policy if exists "webhook_endpoints_insert" on webhook_endpoints;
create policy "webhook_endpoints_insert" on webhook_endpoints for insert with check (tenant_id = get_tenant_id());
drop policy if exists "webhook_endpoints_update" on webhook_endpoints;
create policy "webhook_endpoints_update" on webhook_endpoints for update using (tenant_id = get_tenant_id());
drop policy if exists "webhook_endpoints_delete" on webhook_endpoints;
create policy "webhook_endpoints_delete" on webhook_endpoints for delete using (tenant_id = get_tenant_id());

-- Staff Schedule
drop policy if exists "staff_schedule_insert" on staff_schedule_entries;
create policy "staff_schedule_insert" on staff_schedule_entries for insert with check (tenant_id = get_tenant_id());
drop policy if exists "staff_schedule_update" on staff_schedule_entries;
create policy "staff_schedule_update" on staff_schedule_entries for update using (tenant_id = get_tenant_id());
drop policy if exists "staff_schedule_delete" on staff_schedule_entries;
create policy "staff_schedule_delete" on staff_schedule_entries for delete using (tenant_id = get_tenant_id());

-- Appointments
drop policy if exists "appointments_insert" on appointments;
create policy "appointments_insert" on appointments for insert with check (tenant_id = get_tenant_id());
drop policy if exists "appointments_update" on appointments;
create policy "appointments_update" on appointments for update using (tenant_id = get_tenant_id());
drop policy if exists "appointments_delete" on appointments;
create policy "appointments_delete" on appointments for delete using (tenant_id = get_tenant_id());
