# DH Workplace: product spec (v1)

Agreed with David Hooper on 15 October 2026. This replaces the old "HR + CRM platform" scope: DH Workplace is now rotas, clock-in, time off and staff records for small UK teams (pubs, cafés, salons, care). The CRM is out.

Design reference: the approved mockups (native Apple-quality style, dark graphite app header, contextual side menus). The rules against "AI tells" are in David's notes: no eyebrow pills, no emoji icons, no icon-tile feature lists, no centred template heroes.

## Pricing

- £5 per user per month, 14-day free trial, no card to start. Stripe per-seat billing (the GoCardless code is removed).
- One price at launch. A higher tier may come later; it is not needed for multi-site support.

## Structure

```
Business (the customer account, billed)
└── Sites            e.g. The Bridge Inn, The Bridge Inn Café
    └── Departments  e.g. Bar, Kitchen, Floor (set per site)
        └── Staff    a person can work in several departments and sites
```

Each department can have a department manager and one or more supervisors.

## Roles

| Role | Scope | Default abilities |
|---|---|---|
| Owner | Whole business | Everything, including billing, closing the account and granting any permission |
| Manager | One or more sites | Rota, time off, swaps, clock-in fixes, timesheets and staff for their sites. Pay rates are off by default (owner can grant). |
| Department manager | One or more departments | Rota, time off, swaps and timesheets for their departments only |
| Supervisor (shift lead) | One or more departments | Sees who's in, handles breaks, fixes missed clock-ins and flags issues on shift. Can't edit the published rota or approve time off. |
| Staff | Their own record | Own shifts, clock in/out, request time off and swaps, availability, own documents and payslips |

### Extra permissions

Owners and managers can grant individual permissions on top of a role, when needed, scoped to a site or department. Examples: "can see pay rates", "can approve time off for Kitchen", "can edit the Bar rota", "can add staff".

Rules:
- Nobody can grant a permission they don't hold themselves.
- Billing and closing the account stay with the owner only.
- Every grant and removal is written to the activity log.
- Grants can have an end date (e.g. covering a manager's holiday).

## Sign-in

- v1:
  - email and password;
  - sign-in link by email;
  - **Sign in with Microsoft** (any Microsoft work or personal account), alongside not instead of the others.
- Later: per-business single sign-on into the customer's own domain (SAML), e.g. everyone at @bridgeinn.co.uk signs in through their company's identity provider, with an option to make it required. The database already has `sso_domain`, `sso_provider_id` and `sso_required` on businesses for this.

## v1 features

1. **Sign-up and setup:**
   - trial, Stripe checkout;
   - a wizard for business → sites (address for location clock-in) → departments → roles → invite staff;
   - invites by email, push or text (texts included free);
   - CSV import of staff.
2. **Rota:**
   - week grid with drag and drop, copy last week, templates;
   - publish with notifications;
   - open shifts staff can claim;
   - swaps approved by a manager;
   - availability;
   - cover warnings, wage bill against budget;
   - filter by site and department.
3. **Clock-in:**
   - phone clock-in only when at the site;
   - **shared tablet clock-in with a staff PIN**;
   - breaks, early/late rules;
   - manager or supervisor fixes for missed clock-outs.
4. **Time off:**
   - requests and approvals routed to the right department manager;
   - blackout dates;
   - UK entitlement worked out automatically: 5.6 weeks pro rata, and 12.07% accrual for irregular-hours staff.
5. **Timesheets:** built from clock-ins, approved, then **exported** for Xero, Sage, BrightPay or CSV.
   - No payroll is run in-app.
   - Payslips from the business's payroll provider can be uploaded so staff see them in the app.
6. **Team:**
   - profiles, contract type, emergency contact;
   - pay rates, hidden by default;
   - right-to-work and other documents;
   - policies signed in the app.
7. **Notifications:** push and email, with SMS for invites and urgent alerts (free to the customer).
8. **Apps:** iPhone and Android staff app; web for owners and managers.

## DH admin (platform)

- All businesses: trial or paying, seats, monthly revenue, last active.
- Billing actions through Stripe: refund, extend trial, comp a pilot.
- Support access only when the business has switched on "allow DH support". Every access is logged.
- Notices to all businesses.
- GDPR export and deletion.

## Security

- Every table carries the business id. Isolation is enforced by row-level security and covered by automated tests proving one business cannot read another's data.
- Data hosted in the UK (Supabase London).
- Optional two-step sign-in for owners and managers.
- Activity log of changes and permission grants.
- Standard data processing agreement.

## Later (v2+)

Announcements and messaging, tips and tronc, wage forecasting, direct Xero sync, onboarding packs, a multi-site pricing tier if needed.

## Build order

1. Fresh Supabase project (London). Schema for businesses, sites, departments, people, roles and permission grants. RLS and isolation tests first.
2. Auth (email and password, magic link, Sign in with Microsoft) and invites. Stripe per-seat billing with trial.
3. Setup wizard and team.
4. Rota (web), then publish and notifications.
5. Staff app: today, rota, clock-in, time off.
6. Clock-in rules, tablet mode, timesheets and exports.
7. Time off with UK entitlement.
8. DH admin console.
9. Pilot with 5 local businesses, fix what they hit, then launch.
