-- Check if your user was created in Supabase Auth
SELECT id, email, created_at, confirmed_at
FROM auth.users
ORDER BY created_at DESC
LIMIT 5;

-- Check if any tenants were created
SELECT id, name, owner_email, created_at
FROM tenants
ORDER BY created_at DESC
LIMIT 5;

-- Check tenant_users
SELECT id, email, full_name, role, created_at
FROM tenant_users
ORDER BY created_at DESC
LIMIT 5;
