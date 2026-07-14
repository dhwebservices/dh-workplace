# Fix Supabase Email Verification & Password Reset

## Problem 1: Email Verification Shows Blank Page

The verification link goes to Supabase's default page instead of your app.

### Fix: Configure Redirect URLs

1. Go to **Supabase Dashboard** → **Authentication** → **URL Configuration**
   https://supabase.com/dashboard/project/fwpmjwcaoaaqjeruufoo/auth/url-configuration

2. Set these values:

   **Site URL**: `http://localhost:5173` (for development)
   - For production: `https://app.dhworkplace.co.uk`

   **Redirect URLs** (add all of these):
   ```
   http://localhost:5173
   http://localhost:5173/auth/callback
   https://app.dhworkplace.co.uk
   https://app.dhworkplace.co.uk/auth/callback
   ```

3. Click **Save**

---

## Problem 2: Password Reset Emails Not Sending

Supabase is using its default email service instead of Resend.

### Fix: Connect Resend to Supabase Auth

1. Go to **Supabase Dashboard** → **Project Settings** → **Auth**
   https://supabase.com/dashboard/project/fwpmjwcaoaaqjeruufoo/settings/auth

2. Scroll down to **SMTP Settings**

3. Enable **Custom SMTP** and enter:

   **SMTP Host**: `smtp.resend.com`
   **Port**: `587`
   **Username**: `resend`
   **Password**: `re_6VUTwf2J_DrfVDsBj8AFeUQN2wCu1LaJy`
   **Sender email**: `DH Workplace <noreply@dhwebsiteservices.co.uk>`
   **Sender name**: `DH Workplace`

4. Click **Save**

---

## Problem 3: Customize Email Templates

Make the verification and reset emails look professional.

1. Go to **Supabase Dashboard** → **Authentication** → **Email Templates**
   https://supabase.com/dashboard/project/fwpmjwcaoaaqjeruufoo/auth/templates

2. Click on **Confirm signup** template and replace with:

```html
<h2>Confirm your email</h2>
<p>Hi there,</p>
<p>Thanks for signing up for DH Workplace! Click the button below to verify your email address.</p>
<p><a href="{{ .ConfirmationURL }}">Verify email address</a></p>
<p>If the button doesn't work, copy this link into your browser:</p>
<p>{{ .ConfirmationURL }}</p>
<p>If you didn't create an account, you can safely ignore this email.</p>
```

3. Click on **Reset password** template and replace with:

```html
<h2>Reset your password</h2>
<p>Hi there,</p>
<p>You requested to reset your password for DH Workplace. Click the button below to set a new password.</p>
<p><a href="{{ .ConfirmationURL }}">Reset password</a></p>
<p>If the button doesn't work, copy this link into your browser:</p>
<p>{{ .ConfirmationURL }}</p>
<p>This link expires in 1 hour.</p>
<p>If you didn't request this, you can safely ignore this email.</p>
```

4. Click **Save** on each template

---

## Quick Test

After making these changes:

1. **Test Email Sending**: Try password reset again - you should receive an email within 1 minute

2. **Test Verification**: Create a new test account - verification email should arrive and clicking the link should redirect to your app

3. **Check Email in Spam**: If still not receiving, check spam/junk folder

---

## Alternative: Manually Confirm Users

If you need to confirm a user immediately while fixing the email issue:

```sql
-- Manually confirm a user's email
UPDATE auth.users
SET email_confirmed_at = NOW(),
    confirmed_at = NOW()
WHERE email = 'user@example.com';
```

---

## For Your Specific Case

Since you created a test account and it's waiting for verification:

**Option 1**: Run the manual confirmation SQL above with your test email

**Option 2**: Fix the email settings above, then use "Resend verification email" in Supabase dashboard:
- Go to Authentication → Users
- Find your user
- Click the three dots → Resend confirmation email

**Option 3**: Just create a new test account after fixing the email settings
