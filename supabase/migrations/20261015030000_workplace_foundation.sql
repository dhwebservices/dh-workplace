-- DH Workplace foundation: tenancy, structure, people, roles, scoped permission grants, activity log.
-- Everything lives in its own `workplace` schema inside the portal project, isolated from the portal's tables.
-- Access is decided only by these functions and RLS; writes that change who can do what go through
-- security-definer functions so nobody can grant more than they hold.

create schema if not exists workplace;

-- ── Tables ──────────────────────────────────────────────────────────────────

create table workplace.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 120),
  timezone text not null default 'Europe/London',
  allow_dh_support boolean not null default false,
  trial_ends_at timestamptz not null default now() + interval '14 days',
  billing_status text not null default 'trialing'
    check (billing_status in ('trialing', 'active', 'past_due', 'paused', 'cancelled')),
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  -- Later: single sign-on into the customer's own domain (Supabase SAML SSO needs a paid plan).
  sso_domain text unique,
  sso_provider_id uuid,
  sso_required boolean not null default false,
  created_at timestamptz not null default now()
);

create table workplace.sites (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references workplace.businesses(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  address text,
  latitude double precision,
  longitude double precision,
  clock_in_radius_m integer not null default 150 check (clock_in_radius_m between 25 and 2000),
  created_at timestamptz not null default now(),
  unique (id, business_id)
);

create table workplace.departments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  site_id uuid not null,
  name text not null check (length(trim(name)) between 1 and 80),
  colour text not null default 'blue' check (colour in ('blue', 'orange', 'green', 'purple', 'red', 'teal', 'grey')),
  created_at timestamptz not null default now(),
  unique (id, business_id),
  foreign key (site_id, business_id) references workplace.sites(id, business_id) on delete cascade
);

-- Names only: visible to everyone in the business (staff need to see who they work with).
create table workplace.people (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references workplace.businesses(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  full_name text not null check (length(trim(full_name)) between 1 and 120),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (id, business_id),
  unique (business_id, user_id)
);

-- Contact and contract details: the person themselves and staff managers only.
create table workplace.person_details (
  person_id uuid primary key,
  business_id uuid not null,
  email text,
  phone text,
  contract_type text check (contract_type in ('full_time', 'part_time', 'zero_hours', 'casual')),
  start_date date,
  emergency_contact jsonb,
  foreign key (person_id, business_id) references workplace.people(id, business_id) on delete cascade
);

-- Pay: hidden by default, even from managers (needs pay.view).
create table workplace.person_pay (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null,
  business_id uuid not null,
  hourly_rate_pence integer not null check (hourly_rate_pence >= 0),
  effective_from date not null default current_date,
  created_at timestamptz not null default now(),
  foreign key (person_id, business_id) references workplace.people(id, business_id) on delete cascade
);

create table workplace.person_departments (
  person_id uuid not null,
  department_id uuid not null,
  business_id uuid not null,
  is_primary boolean not null default false,
  primary key (person_id, department_id),
  foreign key (person_id, business_id) references workplace.people(id, business_id) on delete cascade,
  foreign key (department_id, business_id) references workplace.departments(id, business_id) on delete cascade
);

-- Role assignments. Scope rules: owner = whole business, manager = a site,
-- department_manager / supervisor = a department, staff = whole business (own data only).
create table workplace.role_assignments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  person_id uuid not null,
  role text not null check (role in ('owner', 'manager', 'department_manager', 'supervisor', 'staff')),
  site_id uuid,
  department_id uuid,
  created_at timestamptz not null default now(),
  foreign key (person_id, business_id) references workplace.people(id, business_id) on delete cascade,
  foreign key (site_id, business_id) references workplace.sites(id, business_id) on delete cascade,
  foreign key (department_id, business_id) references workplace.departments(id, business_id) on delete cascade,
  check (
    (role in ('owner', 'staff') and site_id is null and department_id is null) or
    (role = 'manager' and site_id is not null and department_id is null) or
    (role in ('department_manager', 'supervisor') and department_id is not null and site_id is null)
  )
);
create unique index role_assignments_unique on workplace.role_assignments
  (person_id, role, coalesce(site_id, '00000000-0000-0000-0000-000000000000'), coalesce(department_id, '00000000-0000-0000-0000-000000000000'));

-- Extra permissions granted on top of a role, optionally scoped and time-limited.
create table workplace.permission_grants (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  person_id uuid not null,
  permission text not null,
  site_id uuid,
  department_id uuid,
  granted_by uuid not null,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (person_id, business_id) references workplace.people(id, business_id) on delete cascade,
  foreign key (granted_by, business_id) references workplace.people(id, business_id),
  foreign key (site_id, business_id) references workplace.sites(id, business_id) on delete cascade,
  foreign key (department_id, business_id) references workplace.departments(id, business_id) on delete cascade,
  check (site_id is null or department_id is null)
);

create table workplace.activity_log (
  id bigint generated always as identity primary key,
  business_id uuid not null references workplace.businesses(id) on delete cascade,
  actor_person_id uuid,
  action text not null,
  target_type text,
  target_id uuid,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- DH staff who run the platform. Support access to a business still needs that business's consent.
create table workplace.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index on workplace.sites (business_id);
create index on workplace.departments (site_id);
create index on workplace.people (user_id);
create index on workplace.person_departments (department_id);
create index on workplace.role_assignments (person_id);
create index on workplace.permission_grants (person_id) where revoked_at is null;
create index on workplace.activity_log (business_id, created_at desc);

-- ── Permission model ────────────────────────────────────────────────────────

-- The full vocabulary. billing.manage and business.close are owner-only and can never be granted.
create function workplace.all_permissions() returns text[]
language sql immutable as $$
  select array[
    'rota.view_all', 'rota.edit', 'rota.publish', 'shifts.approve_swaps',
    'timeoff.approve', 'timesheets.approve', 'clock.fix',
    'staff.view_details', 'staff.manage', 'pay.view', 'pay.edit',
    'settings.manage', 'activity.view', 'billing.manage', 'business.close'
  ]
$$;

create function workplace.role_permissions(p_role text) returns text[]
language sql immutable as $$
  select case p_role
    when 'owner' then workplace.all_permissions()
    when 'manager' then array['rota.view_all', 'rota.edit', 'rota.publish', 'shifts.approve_swaps', 'timeoff.approve',
                              'timesheets.approve', 'clock.fix', 'staff.view_details', 'staff.manage', 'settings.manage', 'activity.view']
    when 'department_manager' then array['rota.view_all', 'rota.edit', 'rota.publish', 'shifts.approve_swaps',
                                         'timeoff.approve', 'timesheets.approve', 'clock.fix', 'staff.view_details']
    when 'supervisor' then array['rota.view_all', 'clock.fix']
    else array[]::text[]
  end
$$;

create function workplace.my_person_id(p_business uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select id from workplace.people
  where business_id = p_business and user_id = auth.uid() and active
$$;

create function workplace.is_member(p_business uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from workplace.people
    where business_id = p_business and user_id = auth.uid() and active
  )
$$;

-- Does the signed-in user hold p_perm for this scope?
-- Scope resolution: a business-wide holder covers everything; a site holder covers the site and its
-- departments; a department holder covers that department. A null target scope means "anywhere in
-- the business" and is satisfied only by a business-wide holder.
create function workplace.has_perm(p_business uuid, p_perm text, p_site uuid default null, p_department uuid default null)
returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  v_person uuid;
  v_site uuid := p_site;
begin
  v_person := workplace.my_person_id(p_business);
  if v_person is null then
    return false;
  end if;

  if p_department is not null and v_site is null then
    select site_id into v_site from workplace.departments where id = p_department and business_id = p_business;
  end if;

  return exists (
    select 1
    from workplace.role_assignments ra
    where ra.person_id = v_person
      and p_perm = any (workplace.role_permissions(ra.role))
      and (
        (ra.site_id is null and ra.department_id is null)
        or (ra.site_id is not null and ra.site_id = v_site)
        or (ra.department_id is not null and ra.department_id = p_department)
      )
  ) or exists (
    select 1
    from workplace.permission_grants g
    where g.person_id = v_person
      and g.permission = p_perm
      and g.revoked_at is null
      and (g.expires_at is null or g.expires_at > now())
      and (
        (g.site_id is null and g.department_id is null)
        or (g.site_id is not null and g.site_id = v_site)
        or (g.department_id is not null and g.department_id = p_department)
      )
  );
end
$$;

-- True if the user holds p_perm anywhere in the business (used for "show this menu" checks).
create function workplace.has_perm_anywhere(p_business uuid, p_perm text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from workplace.role_assignments ra
    where ra.person_id = workplace.my_person_id(p_business)
      and p_perm = any (workplace.role_permissions(ra.role))
  ) or exists (
    select 1 from workplace.permission_grants g
    where g.person_id = workplace.my_person_id(p_business)
      and g.permission = p_perm and g.revoked_at is null
      and (g.expires_at is null or g.expires_at > now())
  )
$$;

-- Can the signed-in user act on this person for p_perm? True if they hold it for any department
-- the person works in, or business-wide.
create function workplace.has_perm_over_person(p_business uuid, p_perm text, p_person uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select workplace.has_perm(p_business, p_perm)
    or exists (
      select 1 from workplace.person_departments pd
      where pd.person_id = p_person and pd.business_id = p_business
        and workplace.has_perm(p_business, p_perm, null, pd.department_id)
    )
$$;

create function workplace.is_platform_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from workplace.platform_admins where user_id = auth.uid())
$$;

create function workplace.log(p_business uuid, p_action text, p_target_type text, p_target uuid, p_detail jsonb default '{}'::jsonb)
returns void
language sql security definer set search_path = '' as $$
  insert into workplace.activity_log (business_id, actor_person_id, action, target_type, target_id, detail)
  values (p_business, workplace.my_person_id(p_business), p_action, p_target_type, p_target, coalesce(p_detail, '{}'::jsonb))
$$;

-- ── Privileged actions (the only way to change ownership, roles and grants) ─

create function workplace.create_business(p_name text, p_owner_name text, p_site_name text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_business uuid;
  v_person uuid;
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;

  insert into workplace.businesses (name) values (p_name) returning id into v_business;
  insert into workplace.sites (business_id, name) values (v_business, coalesce(nullif(trim(p_site_name), ''), p_name));
  insert into workplace.people (business_id, user_id, full_name) values (v_business, auth.uid(), p_owner_name) returning id into v_person;
  insert into workplace.person_details (person_id, business_id, email)
    select v_person, v_business, email from auth.users where id = auth.uid();
  insert into workplace.role_assignments (business_id, person_id, role) values (v_business, v_person, 'owner');
  perform workplace.log(v_business, 'business.created', 'business', v_business);
  return v_business;
end
$$;

-- Assign a role. Owners can assign anything except creating another owner is allowed only by an owner.
-- A manager can assign department_manager / supervisor / staff within their own sites only.
create function workplace.assign_role(p_person uuid, p_role text, p_site uuid default null, p_department uuid default null)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_business uuid;
  v_dept_site uuid;
  v_id uuid;
begin
  select business_id into v_business from workplace.people where id = p_person;
  if v_business is null then
    raise exception 'Person not found' using errcode = 'P0002';
  end if;

  if p_role in ('owner', 'manager') then
    if not workplace.has_perm(v_business, 'billing.manage') then
      raise exception 'Only the owner can assign % roles', p_role using errcode = '42501';
    end if;
  elsif p_role in ('department_manager', 'supervisor') then
    select site_id into v_dept_site from workplace.departments where id = p_department and business_id = v_business;
    if not workplace.has_perm(v_business, 'staff.manage', v_dept_site) then
      raise exception 'You can only assign roles in sites you manage' using errcode = '42501';
    end if;
  elsif p_role = 'staff' then
    if not workplace.has_perm_anywhere(v_business, 'staff.manage') then
      raise exception 'Not allowed' using errcode = '42501';
    end if;
  end if;

  insert into workplace.role_assignments (business_id, person_id, role, site_id, department_id)
  values (v_business, p_person, p_role, p_site, p_department)
  on conflict do nothing
  returning id into v_id;

  perform workplace.log(v_business, 'role.assigned', 'person', p_person,
    jsonb_build_object('role', p_role, 'site_id', p_site, 'department_id', p_department));
  return v_id;
end
$$;

create function workplace.remove_role(p_assignment uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  r workplace.role_assignments;
  v_dept_site uuid;
begin
  select * into r from workplace.role_assignments where id = p_assignment;
  if r.id is null then
    raise exception 'Not found' using errcode = 'P0002';
  end if;

  if r.role in ('owner', 'manager') then
    if not workplace.has_perm(r.business_id, 'billing.manage') then
      raise exception 'Only the owner can remove % roles', r.role using errcode = '42501';
    end if;
    if r.role = 'owner' and (select count(*) from workplace.role_assignments where business_id = r.business_id and role = 'owner') <= 1 then
      raise exception 'A business must keep at least one owner' using errcode = '23514';
    end if;
  else
    select site_id into v_dept_site from workplace.departments where id = r.department_id;
    if not workplace.has_perm(r.business_id, 'staff.manage', v_dept_site) then
      raise exception 'Not allowed' using errcode = '42501';
    end if;
  end if;

  delete from workplace.role_assignments where id = p_assignment;
  perform workplace.log(r.business_id, 'role.removed', 'person', r.person_id, jsonb_build_object('role', r.role));
end
$$;

-- Grant an extra permission. The granter must hold staff.manage AND the permission itself for the
-- same scope, so nobody can hand out more than they have. Owner-only permissions can't be granted.
create function workplace.grant_permission(p_person uuid, p_permission text, p_site uuid default null,
                                           p_department uuid default null, p_expires_at timestamptz default null)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_business uuid;
  v_id uuid;
begin
  if p_permission in ('billing.manage', 'business.close') then
    raise exception '% stays with the owner and cannot be granted', p_permission using errcode = '42501';
  end if;
  if not (p_permission = any (workplace.all_permissions())) then
    raise exception 'Unknown permission %', p_permission using errcode = '22023';
  end if;
  if p_site is not null and p_department is not null then
    raise exception 'Scope a grant to a site or a department, not both' using errcode = '22023';
  end if;

  select business_id into v_business from workplace.people where id = p_person;
  if v_business is null then
    raise exception 'Person not found' using errcode = 'P0002';
  end if;

  if not (workplace.has_perm(v_business, 'staff.manage', p_site, p_department)
          and workplace.has_perm(v_business, p_permission, p_site, p_department)) then
    raise exception 'You can only grant permissions you hold for that scope' using errcode = '42501';
  end if;

  insert into workplace.permission_grants (business_id, person_id, permission, site_id, department_id, granted_by, expires_at)
  values (v_business, p_person, p_permission, p_site, p_department, workplace.my_person_id(v_business), p_expires_at)
  returning id into v_id;

  perform workplace.log(v_business, 'permission.granted', 'person', p_person,
    jsonb_build_object('permission', p_permission, 'site_id', p_site, 'department_id', p_department, 'expires_at', p_expires_at));
  return v_id;
end
$$;

create function workplace.revoke_permission(p_grant uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  g workplace.permission_grants;
begin
  select * into g from workplace.permission_grants where id = p_grant and revoked_at is null;
  if g.id is null then
    raise exception 'Not found' using errcode = 'P0002';
  end if;
  if not workplace.has_perm(g.business_id, 'staff.manage', g.site_id, g.department_id) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;

  update workplace.permission_grants set revoked_at = now() where id = p_grant;
  perform workplace.log(g.business_id, 'permission.revoked', 'person', g.person_id, jsonb_build_object('permission', g.permission));
end
$$;

-- ── Row-level security ──────────────────────────────────────────────────────

alter table workplace.businesses enable row level security;
alter table workplace.sites enable row level security;
alter table workplace.departments enable row level security;
alter table workplace.people enable row level security;
alter table workplace.person_details enable row level security;
alter table workplace.person_pay enable row level security;
alter table workplace.person_departments enable row level security;
alter table workplace.role_assignments enable row level security;
alter table workplace.permission_grants enable row level security;
alter table workplace.activity_log enable row level security;
alter table workplace.platform_admins enable row level security;

create policy businesses_read on workplace.businesses for select to authenticated
  using (workplace.is_member(id) or (workplace.is_platform_admin() and allow_dh_support));
create policy businesses_update on workplace.businesses for update to authenticated
  using (workplace.has_perm(id, 'settings.manage')) with check (workplace.has_perm(id, 'settings.manage'));

create policy sites_read on workplace.sites for select to authenticated using (workplace.is_member(business_id));
create policy sites_write on workplace.sites for all to authenticated
  using (workplace.has_perm(business_id, 'settings.manage', id))
  with check (workplace.has_perm(business_id, 'settings.manage'));

create policy departments_read on workplace.departments for select to authenticated using (workplace.is_member(business_id));
create policy departments_write on workplace.departments for all to authenticated
  using (workplace.has_perm(business_id, 'settings.manage', site_id))
  with check (workplace.has_perm(business_id, 'settings.manage', site_id));

create policy people_read on workplace.people for select to authenticated using (workplace.is_member(business_id));
create policy people_insert on workplace.people for insert to authenticated
  with check (workplace.has_perm_anywhere(business_id, 'staff.manage'));
create policy people_update on workplace.people for update to authenticated
  using (workplace.has_perm_over_person(business_id, 'staff.manage', id))
  with check (workplace.has_perm_over_person(business_id, 'staff.manage', id));

create policy details_read on workplace.person_details for select to authenticated
  using (person_id = workplace.my_person_id(business_id)
         or workplace.has_perm_over_person(business_id, 'staff.view_details', person_id));
create policy details_write on workplace.person_details for all to authenticated
  using (person_id = workplace.my_person_id(business_id)
         or workplace.has_perm_over_person(business_id, 'staff.manage', person_id))
  with check (person_id = workplace.my_person_id(business_id)
         or workplace.has_perm_over_person(business_id, 'staff.manage', person_id));

create policy pay_read on workplace.person_pay for select to authenticated
  using (person_id = workplace.my_person_id(business_id)
         or workplace.has_perm_over_person(business_id, 'pay.view', person_id));
create policy pay_write on workplace.person_pay for all to authenticated
  using (workplace.has_perm_over_person(business_id, 'pay.edit', person_id))
  with check (workplace.has_perm_over_person(business_id, 'pay.edit', person_id));

create policy person_departments_read on workplace.person_departments for select to authenticated
  using (workplace.is_member(business_id));
create policy person_departments_write on workplace.person_departments for all to authenticated
  using (workplace.has_perm(business_id, 'staff.manage', null, department_id))
  with check (workplace.has_perm(business_id, 'staff.manage', null, department_id));

-- Roles and grants are readable (the app shows who manages what); writes only via the functions above.
create policy roles_read on workplace.role_assignments for select to authenticated using (workplace.is_member(business_id));
create policy grants_read on workplace.permission_grants for select to authenticated
  using (person_id = workplace.my_person_id(business_id) or workplace.has_perm_anywhere(business_id, 'staff.manage'));

create policy activity_read on workplace.activity_log for select to authenticated
  using (workplace.has_perm(business_id, 'activity.view'));

create policy platform_admins_self on workplace.platform_admins for select to authenticated using (user_id = auth.uid());

-- ── Grants ──────────────────────────────────────────────────────────────────

revoke all on schema workplace from public, anon;
grant usage on schema workplace to authenticated, service_role;
grant select, insert, update, delete on all tables in schema workplace to authenticated;
revoke insert, update, delete on workplace.role_assignments, workplace.permission_grants,
  workplace.activity_log, workplace.platform_admins, workplace.businesses from authenticated;
grant update on workplace.businesses to authenticated;
grant all on all tables in schema workplace to service_role;
revoke execute on all functions in schema workplace from public, anon;
grant execute on all functions in schema workplace to authenticated, service_role;
-- The log writer is internal only; callers go through the privileged functions above.
revoke execute on function workplace.log(uuid, text, text, uuid, jsonb) from authenticated;
