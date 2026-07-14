# Supabase Database Setup for DH Workplace

## Option 1: Via Supabase Dashboard (Recommended)

1. Go to https://supabase.com/dashboard/project/fwpmjwcaoaaqjeruufoo/sql/new
2. Copy the **entire contents** of `supabase-schema.sql`
3. Paste into the SQL editor
4. Click "Run" or press Cmd/Ctrl + Enter
5. Wait for completion (should take ~10-15 seconds)

## Option 2: Via psql Command Line

```bash
cd /Users/david/dh-workplace

# Replace YOUR_DB_PASSWORD with your database password from Supabase Settings → Database
psql "postgresql://postgres:YOUR_DB_PASSWORD@db.fwpmjwcaoaaqjeruufoo.supabase.co:5432/postgres" < supabase-schema.sql
```

## Option 3: Using a Simple Bash Script

```bash
cd /Users/david/dh-workplace
chmod +x apply-schema-via-api.sh
./apply-schema-via-api.sh
```

## Verification

After running the schema, verify it worked:

1. Go to https://supabase.com/dashboard/project/fwpmjwcaoaaqjeruufoo/editor
2. You should see these tables:
   - tenants
   - platform_admins
   - tenant_users
   - employees
   - employee_permissions
   - hr_profiles
   - leave_requests
   - documents
   - document_acknowledgements
   - clients
   - tasks
   - invoices
   - notifications
   - banners
   - audit_log
   - webhook_endpoints
   - invitations
   - timesheets
   - outreach
   - automation_rules
   - automation_runs
   - portal_preferences
   - staff_schedule_entries
   - appointments

## Next Steps

Once the schema is applied:

1. ✅ Test authentication - sign up at your app URL
2. ✅ Run this SQL to make yourself a platform admin:

```sql
-- Get your user ID first
SELECT id, email FROM auth.users WHERE email = 'david@dhwebsiteservices.co.uk';

-- Then insert (replace <your-user-id> with the ID from above)
INSERT INTO platform_admins (user_id, email) 
VALUES ('<your-user-id>', 'david@dhwebsiteservices.co.uk');

-- And update your tenant_user role
UPDATE tenant_users 
SET role = 'superadmin' 
WHERE email = 'david@dhwebsiteservices.co.uk';
```

3. ✅ Deploy the Cloudflare Worker (see CLOUDFLARE_WORKER_SETUP.md)
4. ✅ Build and test the app locally:

```bash
cd /Users/david/dh-workplace
npm install
npm run dev
```

## Troubleshooting

### "relation already exists" errors
This means some tables are already created. You can either:
- Drop them first: `DROP TABLE table_name CASCADE;`
- Or skip those CREATE TABLE statements

### Permission errors
Make sure you're using the **service_role** key, not the anon key, for migrations.

### RLS Policy conflicts
If you get RLS policy errors, drop existing policies first:
```sql
DROP POLICY IF EXISTS "policy_name" ON table_name;
```
