-- ═══════════════════════════════════════════════════════════════
-- FRESH START - Clean Slate
-- ═══════════════════════════════════════════════════════════════

-- STEP 1: Delete all existing users
DELETE FROM platform_admins;
DELETE FROM tenant_users;
DELETE FROM auth.users;

-- STEP 2: Verify everything is clean
SELECT 'Users deleted:' as status, COUNT(*) as count FROM auth.users;
SELECT 'Platform admins deleted:' as status, COUNT(*) as count FROM platform_admins;
SELECT 'Tenant users deleted:' as status, COUNT(*) as count FROM tenant_users;

-- STEP 3: You're ready for a fresh signup!
-- After running this:
-- 1. Go to http://localhost:5174/signup
-- 2. Sign up with david@dhwebsiteservices.co.uk / Work2024.
-- 3. After signup succeeds, run STEP 4 below

-- STEP 4: Make yourself a platform admin (run AFTER signing up)
-- Replace <YOUR-USER-ID> with the ID from the signup
/*
INSERT INTO platform_admins (user_id, email)
SELECT id, email FROM auth.users WHERE email = 'david@dhwebsiteservices.co.uk';
*/
