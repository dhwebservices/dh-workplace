# Quick Fix - Get Logged In Now

## Option 1: Invite Yourself via Dashboard (EASIEST)

1. Go to: https://supabase.com/dashboard/project/fwpmjwcaoaaqjeruufoo/auth/users
2. Click **"Invite user"** button (top right)
3. Enter email: `david@dhwebsiteservices.co.uk`
4. Click **Send Invite**
5. Check your email and click the link
6. Set your password
7. Done!

---

## Option 2: Configure Redirect URLs First

Before password reset will work, you MUST do this:

### A. Set Redirect URLs
1. Go to: https://supabase.com/dashboard/project/fwpmjwcaoaaqjeruufoo/auth/url-configuration
2. Set **Site URL**: `http://localhost:5174`
3. Add to **Redirect URLs** (one per line):
   ```
   http://localhost:5174
   http://localhost:5174/auth/callback
   http://localhost:5174/*
   https://app.dhworkplace.co.uk
   https://app.dhworkplace.co.uk/auth/callback
   https://app.dhworkplace.co.uk/*
   ```
4. Click **Save**

### B. Now Try Password Reset Again
After saving the URLs, click the reset link in your email again.

---

## Option 3: Manual SQL Password Set

Run this SQL (simplest approach):

```sql
-- Set password for mgmt@ account
UPDATE auth.users
SET encrypted_password = crypt('Work2024.', gen_salt('bf'))
WHERE email = 'mgmt@dhwebsiteservices.co.uk';

-- Make them a platform admin
INSERT INTO platform_admins (user_id, email)
VALUES ('d6de1fc1-1daa-4b46-b87f-6f6c47acad7a', 'mgmt@dhwebsiteservices.co.uk')
ON CONFLICT DO NOTHING;
```

Then log in with:
- Email: `mgmt@dhwebsiteservices.co.uk`
- Password: `Work2024.`

---

## Recommended: Do Option 3 (SQL)

It's the fastest. Just run that SQL, then log in immediately.
