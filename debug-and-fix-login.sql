-- ═══════════════════════════════════════════════════════════════
-- Debug and Fix Login Issues
-- ═══════════════════════════════════════════════════════════════

-- STEP 1: Check ALL users in the system
SELECT
  id,
  email,
  email_confirmed_at,
  created_at,
  raw_user_meta_data
FROM auth.users
ORDER BY created_at DESC;

-- STEP 2: Check platform_admins
SELECT * FROM platform_admins;

-- STEP 3: Check tenant_users
SELECT * FROM tenant_users;

-- STEP 4: If david@dhwebsiteservices.co.uk exists, fix it
DO $$
DECLARE
  user_uuid uuid;
BEGIN
  -- Find the user
  SELECT id INTO user_uuid
  FROM auth.users
  WHERE email = 'david@dhwebsiteservices.co.uk'
  LIMIT 1;

  IF user_uuid IS NOT NULL THEN
    -- Confirm email
    UPDATE auth.users
    SET email_confirmed_at = NOW()
    WHERE id = user_uuid;

    -- Set password (plaintext will be hashed by Supabase)
    -- We'll use a different approach - set via Supabase API instead

    -- Make platform admin
    INSERT INTO platform_admins (user_id, email)
    VALUES (user_uuid, 'david@dhwebsiteservices.co.uk')
    ON CONFLICT (email) DO NOTHING;

    RAISE NOTICE 'Updated user: %', user_uuid;
  ELSE
    RAISE NOTICE 'User david@dhwebsiteservices.co.uk not found!';
  END IF;
END $$;

-- STEP 5: Alternative - Check if there's a user with a similar email
SELECT
  id,
  email,
  email_confirmed_at
FROM auth.users
WHERE email ILIKE '%david%'
   OR email ILIKE '%dhwebsite%';
