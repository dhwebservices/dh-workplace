-- DH Workplace: rota shifts, invites without a service key, and helpers the app uses for menus.

-- ── Shifts ──────────────────────────────────────────────────────────────────
-- A shift with no person is an open shift staff can claim later.
-- Drafts (published_at is null) are visible only to people who can see the whole rota for that department.
create table workplace.shifts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  site_id uuid not null,
  department_id uuid not null,
  person_id uuid,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  break_minutes integer not null default 0 check (break_minutes between 0 and 240),
  label text check (label is null or length(label) <= 60),
  notes text check (notes is null or length(notes) <= 500),
  published_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at and ends_at - starts_at <= interval '24 hours'),
  foreign key (site_id, business_id) references workplace.sites(id, business_id) on delete cascade,
  foreign key (department_id, business_id) references workplace.departments(id, business_id) on delete cascade,
  foreign key (person_id, business_id) references workplace.people(id, business_id) on delete set null (person_id)
);
create index on workplace.shifts (business_id, starts_at);
create index on workplace.shifts (person_id, starts_at);
create index on workplace.shifts (department_id, starts_at);

-- The shift's department must belong to the shift's site.
create function workplace.shifts_check_scope() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from workplace.departments where id = new.department_id and site_id = new.site_id) then
    raise exception 'Department does not belong to that site' using errcode = '23514';
  end if;
  new.updated_at := now();
  if tg_op = 'INSERT' then
    new.created_by := coalesce(new.created_by, workplace.my_person_id(new.business_id));
  end if;
  return new;
end
$$;
create trigger shifts_check_scope before insert or update on workplace.shifts
  for each row execute function workplace.shifts_check_scope();

alter table workplace.shifts enable row level security;

create policy shifts_read on workplace.shifts for select to authenticated using (
  person_id = workplace.my_person_id(business_id)
  or workplace.has_perm(business_id, 'rota.view_all', null, department_id)
  or (
    published_at is not null
    and exists (
      select 1 from workplace.person_departments pd
      where pd.department_id = shifts.department_id
        and pd.person_id = workplace.my_person_id(shifts.business_id)
    )
  )
);
create policy shifts_insert on workplace.shifts for insert to authenticated
  with check (workplace.has_perm(business_id, 'rota.edit', null, department_id));
create policy shifts_update on workplace.shifts for update to authenticated
  using (workplace.has_perm(business_id, 'rota.edit', null, department_id))
  with check (workplace.has_perm(business_id, 'rota.edit', null, department_id));
create policy shifts_delete on workplace.shifts for delete to authenticated
  using (workplace.has_perm(business_id, 'rota.edit', null, department_id));

grant select, insert, update, delete on workplace.shifts to authenticated;
grant all on workplace.shifts to service_role;

-- Publish every draft shift in a date range the caller is allowed to publish.
create function workplace.publish_shifts(p_business uuid, p_from timestamptz, p_to timestamptz, p_site uuid default null)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_count integer;
begin
  update workplace.shifts s
     set published_at = now()
   where s.business_id = p_business
     and s.published_at is null
     and s.starts_at >= p_from and s.starts_at < p_to
     and (p_site is null or s.site_id = p_site)
     and workplace.has_perm(p_business, 'rota.publish', null, s.department_id);
  get diagnostics v_count = row_count;
  if v_count > 0 then
    perform workplace.log(p_business, 'rota.published', 'site', p_site,
      jsonb_build_object('from', p_from, 'to', p_to, 'shifts', v_count));
  end if;
  return v_count;
end
$$;

-- ── Invites (no service key needed) ─────────────────────────────────────────
-- A manager adds a person with an email; when someone signs up or signs in with that
-- email, claim_invites() links their account to every person record waiting for it.
create function workplace.invite_person(p_business uuid, p_full_name text, p_email text,
                                        p_department uuid default null, p_contract text default null)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_person uuid;
  v_site uuid;
begin
  if p_department is not null then
    select site_id into v_site from workplace.departments where id = p_department and business_id = p_business;
    if v_site is null then
      raise exception 'Department not found' using errcode = 'P0002';
    end if;
    if not workplace.has_perm(p_business, 'staff.manage', v_site) then
      raise exception 'You can only add staff to sites you manage' using errcode = '42501';
    end if;
  elsif not workplace.has_perm(p_business, 'staff.manage') then
    raise exception 'Choose a department you manage' using errcode = '42501';
  end if;

  insert into workplace.people (business_id, full_name) values (p_business, trim(p_full_name)) returning id into v_person;
  insert into workplace.person_details (person_id, business_id, email, contract_type)
    values (v_person, p_business, lower(trim(p_email)), p_contract);
  insert into workplace.role_assignments (business_id, person_id, role) values (p_business, v_person, 'staff');
  if p_department is not null then
    insert into workplace.person_departments (person_id, department_id, business_id, is_primary)
      values (v_person, p_department, p_business, true);
  end if;
  perform workplace.log(p_business, 'person.invited', 'person', v_person, jsonb_build_object('email', lower(trim(p_email))));
  return v_person;
end
$$;

create function workplace.claim_invites()
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_email text;
  v_count integer;
begin
  select lower(email) into v_email from auth.users where id = auth.uid() and email_confirmed_at is not null;
  if v_email is null then
    return 0;
  end if;

  update workplace.people p
     set user_id = auth.uid()
    from workplace.person_details d
   where d.person_id = p.id
     and p.user_id is null
     and lower(d.email) = v_email
     and not exists (select 1 from workplace.people x where x.business_id = p.business_id and x.user_id = auth.uid());
  get diagnostics v_count = row_count;
  return v_count;
end
$$;

-- ── Helpers for the app ─────────────────────────────────────────────────────
-- Every business the signed-in user belongs to, with their roles. Used for the venue switcher.
create function workplace.my_businesses()
returns table (business_id uuid, business_name text, person_id uuid, full_name text, roles text[])
language sql stable security definer set search_path = '' as $$
  select b.id, b.name, p.id, p.full_name,
         coalesce(array_agg(distinct ra.role) filter (where ra.role is not null), '{}')
  from workplace.people p
  join workplace.businesses b on b.id = p.business_id
  left join workplace.role_assignments ra on ra.person_id = p.id
  where p.user_id = auth.uid() and p.active
  group by b.id, b.name, p.id, p.full_name
  order by b.name
$$;

-- Permissions the user holds anywhere in a business (for showing menus; data access is still enforced by RLS).
create function workplace.my_permissions(p_business uuid)
returns text[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(distinct perm), '{}')
  from (
    select unnest(workplace.role_permissions(ra.role)) as perm
    from workplace.role_assignments ra
    where ra.person_id = workplace.my_person_id(p_business)
    union
    select g.permission
    from workplace.permission_grants g
    where g.person_id = workplace.my_person_id(p_business)
      and g.revoked_at is null and (g.expires_at is null or g.expires_at > now())
  ) x
$$;

revoke execute on function workplace.publish_shifts(uuid, timestamptz, timestamptz, uuid) from public, anon;
revoke execute on function workplace.invite_person(uuid, text, text, uuid, text) from public, anon;
revoke execute on function workplace.claim_invites() from public, anon;
revoke execute on function workplace.my_businesses() from public, anon;
revoke execute on function workplace.my_permissions(uuid) from public, anon;
revoke execute on function workplace.shifts_check_scope() from public, anon, authenticated;
grant execute on function workplace.publish_shifts(uuid, timestamptz, timestamptz, uuid) to authenticated;
grant execute on function workplace.invite_person(uuid, text, text, uuid, text) to authenticated;
grant execute on function workplace.claim_invites() to authenticated;
grant execute on function workplace.my_businesses() to authenticated;
grant execute on function workplace.my_permissions(uuid) to authenticated;
