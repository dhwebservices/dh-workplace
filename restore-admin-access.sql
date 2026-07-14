-- ═══════════════════════════════════════════════════════════════
-- Restore Admin Access for david@dhwebsiteservices.co.uk
-- Run this in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════

-- STEP 1: Check if user exists
SELECT id, email, created_at, confirmed_at
FROM auth.users
WHERE email = 'david@dhwebsiteservices.co.uk';

-- STEP 2: Add to platform_admins (this gives global access)
-- Replace <USER_ID> with the ID from STEP 1 above
-- Or run this if you see the user exists:

DO $$
DECLARE
  user_uuid uuid;
BEGIN
  -- Get the user ID
  SELECT id INTO user_uuid
  FROM auth.users
  WHERE email = 'david@dhwebsiteservices.co.uk'
  LIMIT 1;

  -- Check if we found a user
  IF user_uuid IS NOT NULL THEN
    -- Add to platform_admins (global admin access)
    INSERT INTO platform_admins (user_id, email)
    VALUES (user_uuid, 'david@dhwebsiteservices.co.uk')
    ON CONFLICT (email) DO NOTHING;

    -- Update tenant_user role to superadmin (if record exists)
    UPDATE tenant_users
    SET role = 'superadmin'
    WHERE email = 'david@dhwebsiteservices.co.uk';

    RAISE NOTICE 'Success! Admin access restored for david@dhwebsiteservices.co.uk';
  ELSE
    RAISE NOTICE 'User not found. You may need to sign up first.';
  END IF;
END $$;

-- STEP 3: Verify it worked
SELECT
  pa.id as platform_admin_id,
  pa.email,
  pa.created_at,
  u.id as user_id
FROM platform_admins pa
JOIN auth.users u ON u.id = pa.user_id
WHERE pa.email = 'david@dhwebsiteservices.co.uk';

-- STEP 4: Check tenant_user role
SELECT
  id,
  tenant_id,
  email,
  full_name,
  role,
  status
FROM tenant_users
WHERE email = 'david@dhwebsiteservices.co.uk';
