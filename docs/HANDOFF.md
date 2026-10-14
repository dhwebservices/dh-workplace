# DH Workplace: handoff (read first)

## Build status (15 Oct 2026, build agent): all app work on branch `rebuild`, never main

- **Database (portal project xtunnfdwltfesscmpove, schema `workplace`), applied:**
  - foundation;
  - rota;
  - rota_hide_drafts.

  Migrations are in supabase/migrations.
- **Tests:** supabase/tests/isolation.sql (39 checks) and supabase/tests/rota.sql (21 checks), all passing. Run each through execute_sql: the results come back as the error message and everything is rolled back.
- **App (src/), new, in the approved design:**
  - sign in (password, email link, Microsoft button);
  - sign up;
  - 3-step setup wizard (business, departments, invite team);
  - dark header with business switcher;
  - Rota week grid: quick entry ("5-11"), drafts, publish, copy last week, open shifts, cover row;
  - Team (People with an add-person dialog, Departments) with a side menu;
  - staff Today screen.

  Clock-ins, Time Off and Pay show "Not ready yet".
- **Invites need no service key:** invite_person stores the email, and claim_invites links the account when that email signs in (confirmed emails only).
- **Blocked on David (dashboard):**
  - expose the `workplace` schema to the API;
  - confirm emails must be ON;
  - add redirect URLs;
  - enable the Azure provider if wanted.

  Details are in the final report and project_dh_workplace.md.


Last updated 15 October 2026, ~02:50, at the end of a long Claude Code session with David.

## Where things stand

- **Spec agreed:** `docs/PRODUCT_SPEC.md`. Do not re-litigate it.
- **Designs approved:** `docs/design/`:
  - `native.html`: the staff phone app (Today, On shift, Time Off);
  - `desk3.html`: the owner rota with the dark graphite header;
  - `team.html`: the Team page with its contextual side menu;
  - `home2.html`: the marketing hero.

  Open them over a local http server; they use relative images.
- **Live now:**
  - dhworkplace.co.uk is an early-access holding page (repo `dhwebservices/dhworkplace`). Its form emails mgmt@ and sends a confirmation from noreply@dhwebsiteservices.co.uk. Verified working; David tested it himself.
  - app.dhworkplace.co.uk 302s to it (this repo, `public/_redirects`).
- **The old app code in this repo** (`src/`, the HR+CRM version) is the starting point, but most of it will be rewritten to the new spec and design. The old Supabase project it pointed to (fwpmjwcaoaaqjeruufoo) was deleted by David; there were no users.

## Open decision (ask David before building the database)

The Supabase org is on the FREE plan, and both live slots are used (dh-portal, hereabout). David asked to use the staff portal project (`xtunnfdwltfesscmpove`) with a `DHWORKPLACE_` prefix. Advice given:
- Use a separate Postgres **schema** `workplace` instead of name prefixes.
- **Rotate the portal's exposed service_role key** (flagged since 26 Aug 2026) BEFORE any real customer data goes in. Rotating it breaks every consumer until updated: the portal, `dh-signature` (sig.dhwebsiteservices.co.uk), the website functions and the workers. Do it with David present.
- Check whether the portal uses Supabase Auth or only Microsoft Entra; Workplace customers would share `auth.users`.
- Move Workplace to its own paid project before launch (free plan has no backups).

David had not yet answered whether to start in the portal project on that basis, or when to rotate the key.

## Build order (from the spec)

1. Schema `workplace`: businesses, sites, departments, people, memberships (role scoped to site/department), permission grants (scoped, granted_by, expires_at), activity log. RLS on everything, plus isolation tests.
2. Auth and invites; Stripe per-seat billing with a 14-day trial (remove GoCardless).
3. Setup wizard and team.
4. Rota web, then publish and notifications.
5. Staff app.
6. Clock-in (geofence and tablet PIN mode), then timesheets and payroll exports.
7. Time off with UK entitlement (5.6 weeks pro rata; 12.07% accrual for irregular hours).
8. DH admin console.
9. Pilots (Jack sources 5 from the call sheet).

## David's design rules (he spots these instantly)

- No eyebrow or announcement pills.
- No emoji icons.
- No icon-in-tinted-square feature lists.
- No centred template hero with two buttons.
- No monospace times or small-caps labels.
- Use the system font (SF), real SVG icons, a strong DH graphite plus a single blue (#1b86d1). Fix gaps with scale, not filler.
- Keep layouts conventional. Novelty themes were rejected (7 of them).
