-- ═══════════════════════════════════════════════════════════════
-- Manually Confirm User Email
-- Use this to confirm a user's email without clicking the verification link
-- ═══════════════════════════════════════════════════════════════

-- OPTION 1: Confirm a specific user by email
UPDATE auth.users
SET email_confirmed_at = NOW()
WHERE email = 'your-email@example.com';

-- OPTION 2: Confirm all unconfirmed users (use with caution!)
-- UPDATE auth.users
-- SET email_confirmed_at = NOW()
-- WHERE email_confirmed_at IS NULL;

-- OPTION 3: Check which users are unconfirmed
SELECT
  id,
  email,
  email_confirmed_at,
  created_at
FROM auth.users
WHERE email_confirmed_at IS NULL
ORDER BY created_at DESC;

-- OPTION 4: Confirm david@dhwebsiteservices.co.uk specifically
UPDATE auth.users
SET email_confirmed_at = NOW()
WHERE email = 'david@dhwebsiteservices.co.uk';
