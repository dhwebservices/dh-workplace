# DH Workplace Setup Instructions

## ⚠️ SECURITY WARNING

**NEVER commit API keys, secrets, or passwords to Git!**

All secrets should be stored in:
- `.env.local` (for local development)
- Cloudflare Worker secrets (for production)
- Supabase environment variables (for database)

---

## 1. Supabase Setup

### Create Project
1. Go to https://supabase.com
2. Create new project: `dh-workplace`
3. Save your project URL and keys

### Configure Environment
Create `.env.local` in the project root:

```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key_here
```

**Note**: The ANON key is public and safe to expose in frontend. The SERVICE key is SECRET and should ONLY be used server-side.

### Run Database Schema
1. Open Supabase SQL Editor
2. Copy contents of `supabase-schema-fixed.sql`
3. Run the SQL
4. Then run `CRITICAL_PERMISSION_FIXES.sql`

---

## 2. Resend Email Setup

### Get API Key
1. Go to https://resend.com
2. Create API key
3. **NEVER commit this key to Git!**

### Configure SMTP in Supabase
1. Go to Supabase → Settings → Authentication
2. Enable Email provider
3. Configure SMTP:
   - **Host**: `smtp.resend.com`
   - **Port**: `465`
   - **Username**: `resend`
   - **Password**: `YOUR_RESEND_API_KEY` (from step 2)
   - **Sender Email**: `noreply@dhwebsiteservices.co.uk`
   - **Sender Name**: `DH Workplace`

### Verify Domain
1. Go to Resend → Domains
2. Add domain: `dhwebsiteservices.co.uk`
3. Add DNS records provided by Resend
4. Wait for verification

---

## 3. Cloudflare Worker Setup

### Deploy Worker
```bash
cd dh-workplace
npx wrangler deploy
```

### Add Secrets
```bash
# Add Stripe secret key
npx wrangler secret put STRIPE_SECRET_KEY
# Paste your sk_live_... key

# Add Stripe webhook secret
npx wrangler secret put STRIPE_WEBHOOK_SECRET
# Paste your whsec_... key

# Add Supabase service key
npx wrangler secret put SUPABASE_SERVICE_KEY
# Paste your service key (starts with sb_secret_...)
```

**IMPORTANT**: Secrets added via `wrangler secret put` are encrypted and NEVER visible in code or logs.

### Configure Worker URL
Add to `.env.local`:
```bash
VITE_WORKER_URL=https://your-worker.workers.dev
```

---

## 4. Stripe Setup

### Create Products
1. Go to Stripe Dashboard → Products
2. Create 3 products:
   - **Starter**: £9/month
   - **Growth**: £19/month  
   - **Business**: £49/month

### Get Price IDs
Save the `price_xxx` IDs from each product.

### Configure Webhook
1. Stripe Dashboard → Webhooks
2. Add endpoint: `https://your-worker.workers.dev/webhook/stripe`
3. Select events:
   - `invoice.paid`
   - `invoice.payment_failed`
   - `customer.subscription.deleted`
   - `customer.subscription.updated`
4. Copy webhook signing secret (starts with `whsec_`)
5. Add to Worker secrets (see above)

---

## 5. Frontend Deployment

### Cloudflare Pages
1. Connect GitHub repository to Cloudflare Pages
2. Build settings:
   - **Build command**: `npm run build`
   - **Build output**: `dist`
3. Environment variables:
   - `VITE_SUPABASE_URL`: Your Supabase URL
   - `VITE_SUPABASE_ANON_KEY`: Your Supabase anon key
   - `VITE_WORKER_URL`: Your worker URL

---

## 6. Security Checklist

- [ ] All secrets in `.env.local` (NOT committed)
- [ ] `.gitignore` includes `.env*` files
- [ ] Cloudflare Worker secrets set via `wrangler secret put`
- [ ] No API keys in frontend code
- [ ] No API keys in markdown/documentation files
- [ ] Supabase RLS policies enabled on all tables
- [ ] CRITICAL_PERMISSION_FIXES.sql has been run
- [ ] Email verification enabled in Supabase (for production)
- [ ] CORS configured correctly on Worker
- [ ] Rate limiting enabled (recommended)

---

## 7. Testing

### Local Development
```bash
npm install
npm run dev
```

### Test Authentication
1. Sign up with test email
2. Check Supabase → Authentication → Users
3. Verify email sent via Resend

### Test Billing
1. Use Stripe test card: `4242 4242 4242 4242`
2. Any future expiry date
3. Any 3-digit CVC
4. Check webhook fires in Worker logs

---

## Troubleshooting

### "Missing Supabase environment variables"
- Check `.env.local` exists
- Restart dev server after creating/editing `.env.local`

### Email not sending
- Check Resend domain is verified
- Check SMTP credentials in Supabase
- Check Resend API key is valid

### Webhook not working
- Check Worker URL is correct
- Check webhook secret matches Stripe
- Check Worker logs for errors

---

## Support

For issues, check:
1. Supabase logs (Logs & Analytics)
2. Cloudflare Worker logs (View in Cloudflare dashboard)
3. Resend logs (Resend dashboard → Logs)
4. Browser console (F12 → Console)
