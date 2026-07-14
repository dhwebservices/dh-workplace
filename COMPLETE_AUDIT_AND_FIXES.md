# Complete System Audit & Fixes

## Issues Found & Fixed

### 1. ✅ Authentication & Session Management
**Issue**: `sbGet/sbInsert/sbUpdate` were using hardcoded anon key instead of user session token
**Fix**: Modified all functions in `src/utils/supabase.js` to use `supabase.auth.getSession()` and pass session token
**Status**: FIXED

### 2. ✅ RLS Policies - Circular Dependencies
**Issue**: RLS policies had circular dependencies causing 500 errors
**Fix**: Created `SECURITY DEFINER` functions (`get_tenant_id()`, `is_platform_admin()`)
**Status**: FIXED

### 3. ✅ Stripe Webhooks Not Configured
**Issue**: Subscriptions weren't auto-activating after payment
**Fix**: 
- Added `STRIPE_WEBHOOK_SECRET` to Worker
- Added `SUPABASE_SERVICE_KEY` to Worker
- Configured webhook endpoint: https://dh-workplace-worker.aged-silence-66a7.workers.dev/webhook/stripe
**Status**: FIXED

### 4. ✅ Stripe Coupon Support
**Issue**: No way to apply discount codes for testing
**Fix**: Added coupon support to Worker and frontend
**Status**: FIXED

### 5. ⚠️  CURRENT ISSUE: Plan Upgrade Failing (500 Error)
**Issue**: When trying to upgrade plan, Worker returns 500
**Probable Cause**: One of:
1. Subscription ID mismatch in database
2. Stripe API error
3. Missing Worker environment variable

**Investigation Steps**:

Run this SQL to check subscription ID:
```sql
SELECT 
  id::text,
  name,
  owner_email,
  stripe_subscription_id,
  stripe_customer_id,
  plan,
  status
FROM tenants 
WHERE owner_email = 'hooperd216@gmail.com';
```

Expected: `stripe_subscription_id` should be `sub_1Tt86rPkzOGLeFGdxr4irux2`

If wrong, update with:
```sql
UPDATE tenants 
SET stripe_subscription_id = 'sub_1Tt86rPkzOGLeFGdxr4irux2'
WHERE owner_email = 'hooperd216@gmail.com';
```

### 6. Remaining Issues to Check

#### A. Database RLS Policies
Check all tables have proper INSERT policies for signup:
- ✅ tenants
- ✅ tenant_users  
- ❓ invitations (might need INSERT policy)
- ❓ employees
- ❓ employee_permissions

#### B. Worker Environment Variables
Verify all required secrets are set:
```bash
wrangler secret list
```

Should have:
- RESEND_API_KEY ✅
- FROM_EMAIL ✅
- STRIPE_SECRET_KEY ✅
- STRIPE_PRICE_STARTER ✅
- STRIPE_PRICE_GROWTH ✅
- STRIPE_PRICE_BUSINESS ✅
- STRIPE_WEBHOOK_SECRET ✅
- SUPABASE_URL ✅
- SUPABASE_SERVICE_KEY ✅

#### C. Frontend Error Handling
Need to add better error messages to show actual Worker errors to user

## Next Steps

1. **Verify subscription ID in database**
2. **Check Worker logs** for actual 500 error
3. **Test upgrade flow** with correct subscription ID
4. **Add error logging** to Worker for better debugging
5. **Test full signup → payment → activation flow** with new user

## Testing Checklist

- [ ] New user signup
- [ ] Email verification (if enabled)
- [ ] Complete profile
- [ ] Stripe checkout
- [ ] Webhook activation
- [ ] Login after activation
- [ ] Dashboard access
- [ ] Plan upgrade
- [ ] Billing history
- [ ] Cancel subscription
