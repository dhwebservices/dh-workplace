# DH Workplace

Multi-tenant HR + CRM SaaS platform for UK small businesses.

## Stack
- React 18 + Vite
- Supabase (Postgres + Auth + Storage)
- GoCardless (Direct Debit billing)
- Resend (email)
- Cloudflare Pages (frontend) + Cloudflare Worker (API/email/GC)

## Setup

### 1. Supabase
Create a new Supabase project at supabase.com, then run `supabase-schema.sql` in the SQL editor.

### 2. Environment variables
Create `.env.local`:
```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_WORKER_URL=https://your-worker.workers.dev
```

### 3. Cloudflare Worker
Deploy `cloudflare-worker.js` to a new Worker called `dh-workplace-worker`.
Add these secrets via `wrangler secret put` or the Cloudflare dashboard:
- `RESEND_API_KEY`
- `FROM_EMAIL`
- `GC_ACCESS_TOKEN`
- `GC_WEBHOOK_SECRET`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`

### 4. GoCardless Webhook
In GoCardless dashboard → Developers → Webhooks:
- URL: `https://your-worker.workers.dev/webhook/gocardless`
- Copy the webhook secret → set as `GC_WEBHOOK_SECRET` in worker

### 5. Platform Admin
After signing up with your DH email:
```sql
insert into platform_admins (user_id, email) 
values ('<your-auth-uid>', 'david@dhwebsiteservices.co.uk');

update tenant_users 
set role = 'superadmin' 
where email = 'david@dhwebsiteservices.co.uk';
```

### 6. Cloudflare Pages
Connect `github.com/dhwebservices/dh-workplace` to Cloudflare Pages.
Build command: `npm run build`
Output directory: `dist`

## Dev
```bash
npm install
npm run dev
```

## Pricing
| Plan     | Launch | Normal | Seats |
|----------|--------|--------|-------|
| Starter  | £9/mo  | £19/mo | 5     |
| Growth   | £24/mo | £49/mo | 15    |
| Business | £59/mo | £99/mo | 40    |

Founding Members (first 50) lock in launch pricing forever.
