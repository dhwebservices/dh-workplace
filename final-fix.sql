-- ═══════════════════════════════════════════════════════════════
-- Final Fix - Add Platform Admin & Verify RLS
-- ═══════════════════════════════════════════════════════════════

-- STEP 1: Check current platform_admins
SELECT * FROM platform_admins;

-- STEP 2: Insert platform admin (ignore conflicts)
DO $$
BEGIN
  INSERT INTO platform_admins (user_id, email)
  VALUES ('d6de1fc1-1daa-4b46-b87f-6f6c47acad7a', 'mgmt@dhwebsiteservices.co.uk');
EXCEPTION
  WHEN unique_violation THEN
    RAISE NOTICE 'Platform admin already exists';
  WHEN others THEN
    RAISE NOTICE 'Error: %', SQLERRM;
END $$;

-- STEP 3: Verify it was inserted
SELECT
  pa.id as admin_id,
  pa.email,
  pa.created_at,
  u.email as user_email
FROM platform_admins pa
JOIN auth.users u ON u.id = pa.user_id;

-- STEP 4: Test the RLS policy that SignIn uses
SELECT
  id,
  user_id,
  email
FROM platform_admins
WHERE user_id = 'd6de1fc1-1daa-4b46-b87f-6f6c47acad7a';
