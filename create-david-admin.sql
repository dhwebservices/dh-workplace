-- ═══════════════════════════════════════════════════════════════
-- Make mgmt@dhwebsiteservices.co.uk a Platform Admin
-- AND create david@dhwebsiteservices.co.uk account
-- ═══════════════════════════════════════════════════════════════

-- OPTION 1: Make the existing mgmt@ account a platform admin
INSERT INTO platform_admins (user_id, email)
VALUES ('d6de1fc1-1daa-4b46-b87f-6f6c47acad7a', 'mgmt@dhwebsiteservices.co.uk')
ON CONFLICT (email) DO NOTHING;

-- OPTION 2: Manually create david@dhwebsiteservices.co.uk account
-- Note: This creates the auth record directly
INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  email_change,
  email_change_token_new,
  recovery_token
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  gen_random_uuid(),
  'authenticated',
  'authenticated',
  'david@dhwebsiteservices.co.uk',
  crypt('Work2024.', gen_salt('bf')),
  NOW(),
  '{"provider":"email","providers":["email"]}',
  '{}',
  NOW(),
  NOW(),
  '',
  '',
  '',
  ''
)
ON CONFLICT (email) DO UPDATE
SET
  encrypted_password = crypt('Work2024.', gen_salt('bf')),
  email_confirmed_at = NOW()
RETURNING id, email;

-- Make david@ a platform admin too
INSERT INTO platform_admins (user_id, email)
SELECT id, email FROM auth.users WHERE email = 'david@dhwebsiteservices.co.uk'
ON CONFLICT (email) DO NOTHING;

-- Verify both accounts
SELECT
  u.id,
  u.email,
  u.email_confirmed_at,
  CASE WHEN pa.id IS NOT NULL THEN 'YES' ELSE 'NO' END as is_platform_admin
FROM auth.users u
LEFT JOIN platform_admins pa ON pa.user_id = u.id
WHERE u.email IN ('mgmt@dhwebsiteservices.co.uk', 'david@dhwebsiteservices.co.uk')
ORDER BY u.email;
