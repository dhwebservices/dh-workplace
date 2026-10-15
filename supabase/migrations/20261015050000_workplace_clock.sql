-- DH Workplace: clock-in. Phone clock-in with a site geofence, tablet (kiosk) PIN clock-in,
-- breaks, manager/supervisor fixes, and paid time that starts at the shift start.
-- All writes go through functions; staff can't insert or edit clock rows directly.

alter table workplace.person_details
  add column if not exists payroll_id text check (payroll_id is null or length(payroll_id) <= 40);

-- ── Tables ──────────────────────────────────────────────────────────────────
create table workplace.clock_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  person_id uuid not null,
  site_id uuid not null,
  shift_id uuid references workplace.shifts(id) on delete set null,
  clock_in_at timestamptz not null default now(),
  clock_out_at timestamptz,
  in_method text not null check (in_method in ('phone', 'kiosk', 'manager')),
  out_method text check (out_method in ('phone', 'kiosk', 'manager')),
  in_distance_m integer,
  fixed_by uuid,
  fix_reason text check (fix_reason is null or length(fix_reason) <= 300),
  approved_by uuid,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  check (clock_out_at is null or clock_out_at > clock_in_at),
  foreign key (person_id, business_id) references workplace.people(id, business_id) on delete cascade,
  foreign key (site_id, business_id) references workplace.sites(id, business_id) on delete cascade
);
create index on workplace.clock_events (business_id, clock_in_at);
create index on workplace.clock_events (person_id, clock_in_at);
-- One open clock-in per person.
create unique index clock_events_one_open on workplace.clock_events (person_id) where clock_out_at is null;

create table workplace.clock_breaks (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  clock_event_id uuid not null references workplace.clock_events(id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  paid boolean not null default false,
  check (ended_at is null or ended_at > started_at)
);
create index on workplace.clock_breaks (clock_event_id);
create unique index clock_breaks_one_open on workplace.clock_breaks (clock_event_id) where ended_at is null;

-- Kiosk PINs: bcrypt hashes only, never the PIN.
create table workplace.person_pins (
  person_id uuid primary key,
  business_id uuid not null,
  pin_hash text not null,
  updated_at timestamptz not null default now(),
  foreign key (person_id, business_id) references workplace.people(id, business_id) on delete cascade
);

-- Failed kiosk PIN attempts per site, for lockout.
create table workplace.kiosk_attempts (
  id bigint generated always as identity primary key,
  site_id uuid not null references workplace.sites(id) on delete cascade,
  attempted_at timestamptz not null default now()
);
create index on workplace.kiosk_attempts (site_id, attempted_at);

-- ── Helpers ─────────────────────────────────────────────────────────────────
-- Great-circle distance in metres.
create function workplace.distance_m(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns double precision
language sql immutable as $$
  select 2 * 6371000 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  ))
$$;

-- Paid time for one clock event: pay starts at the shift start if they clocked in early,
-- runs to clock-out, minus unpaid breaks. Open events count up to now.
-- Runs as the caller, so it only answers for events the caller can already see.
create function workplace.paid_minutes(p_event uuid)
returns integer
language sql stable set search_path = '' as $$
  select greatest(0, round(extract(epoch from (
      coalesce(e.clock_out_at, now()) - greatest(e.clock_in_at, coalesce(s.starts_at, e.clock_in_at))
    )) / 60
    - coalesce((
      select sum(extract(epoch from (coalesce(b.ended_at, coalesce(e.clock_out_at, now())) - b.started_at)) / 60)
      from workplace.clock_breaks b where b.clock_event_id = e.id and not b.paid
    ), 0)))::integer
  from workplace.clock_events e
  left join workplace.shifts s on s.id = e.shift_id
  where e.id = p_event
$$;

-- Does this person work at this site (any department there, or a role scoped to it)?
create function workplace.person_works_at(p_person uuid, p_site uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from workplace.person_departments pd join workplace.departments d on d.id = pd.department_id
    where pd.person_id = p_person and d.site_id = p_site
  ) or exists (
    select 1 from workplace.role_assignments ra
    where ra.person_id = p_person and (ra.site_id = p_site or ra.role = 'owner'
      or ra.department_id in (select id from workplace.departments where site_id = p_site))
  )
$$;

-- The published shift this clock-in belongs to: starts within 2 hours either side of now.
create function workplace.matching_shift(p_person uuid, p_site uuid, p_at timestamptz)
returns uuid
language sql stable security definer set search_path = '' as $$
  select id from workplace.shifts
  where person_id = p_person and site_id = p_site and published_at is not null
    and starts_at between p_at - interval '2 hours' and p_at + interval '2 hours'
  order by abs(extract(epoch from (starts_at - p_at)))
  limit 1
$$;

-- Internal: open a clock event (shared by phone and kiosk).
create function workplace._clock_in(p_business uuid, p_person uuid, p_site uuid, p_method text, p_distance integer)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if exists (select 1 from workplace.clock_events where person_id = p_person and clock_out_at is null) then
    raise exception 'Already clocked in' using errcode = '23505';
  end if;
  insert into workplace.clock_events (business_id, person_id, site_id, shift_id, in_method, in_distance_m)
  values (p_business, p_person, p_site, workplace.matching_shift(p_person, p_site, now()), p_method, p_distance)
  returning id into v_id;
  return v_id;
end
$$;

create function workplace._clock_action(p_person uuid, p_action text, p_method text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_event uuid;
begin
  select id into v_event from workplace.clock_events where person_id = p_person and clock_out_at is null;
  if v_event is null then
    raise exception 'Not clocked in' using errcode = 'P0002';
  end if;
  if p_action = 'out' then
    update workplace.clock_breaks set ended_at = now() where clock_event_id = v_event and ended_at is null;
    update workplace.clock_events set clock_out_at = now(), out_method = p_method where id = v_event;
  elsif p_action = 'break_start' then
    if exists (select 1 from workplace.clock_breaks where clock_event_id = v_event and ended_at is null) then
      raise exception 'Already on a break' using errcode = '23505';
    end if;
    insert into workplace.clock_breaks (business_id, clock_event_id)
      select business_id, id from workplace.clock_events where id = v_event;
  elsif p_action = 'break_end' then
    update workplace.clock_breaks set ended_at = now() where clock_event_id = v_event and ended_at is null;
    if not found then
      raise exception 'Not on a break' using errcode = 'P0002';
    end if;
  else
    raise exception 'Unknown action %', p_action using errcode = '22023';
  end if;
  return v_event;
end
$$;

-- ── Phone clock-in ──────────────────────────────────────────────────────────
-- If the site has a location set, the phone must be inside its radius.
create function workplace.clock_in(p_business uuid, p_site uuid, p_lat double precision default null, p_lng double precision default null)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_person uuid := workplace.my_person_id(p_business);
  s workplace.sites;
  v_distance integer;
begin
  if v_person is null then
    raise exception 'Not a member of this business' using errcode = '42501';
  end if;
  select * into s from workplace.sites where id = p_site and business_id = p_business;
  if s.id is null or not workplace.person_works_at(v_person, p_site) then
    raise exception 'You don''t work at this site' using errcode = '42501';
  end if;
  if s.latitude is not null and s.longitude is not null then
    if p_lat is null or p_lng is null then
      raise exception 'Location is needed to clock in here' using errcode = '22023';
    end if;
    v_distance := round(workplace.distance_m(s.latitude, s.longitude, p_lat, p_lng));
    if v_distance > s.clock_in_radius_m then
      raise exception 'You need to be at % to clock in (you''re % m away)', s.name, v_distance using errcode = '42501';
    end if;
  end if;
  return workplace._clock_in(p_business, v_person, p_site, 'phone', v_distance);
end
$$;

-- 'out' | 'break_start' | 'break_end' for the signed-in person.
create function workplace.clock_action(p_business uuid, p_action text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_person uuid := workplace.my_person_id(p_business);
begin
  if v_person is null then
    raise exception 'Not a member of this business' using errcode = '42501';
  end if;
  return workplace._clock_action(v_person, p_action, 'phone');
end
$$;

-- ── Kiosk PINs ──────────────────────────────────────────────────────────────
create function workplace.pin_owner(p_business uuid, p_pin text)
returns uuid
language sql stable security definer set search_path = '' as $$
  select pp.person_id from workplace.person_pins pp
  join workplace.people p on p.id = pp.person_id and p.active
  where pp.business_id = p_business and pp.pin_hash = extensions.crypt(p_pin, pp.pin_hash)
  limit 1
$$;

create function workplace.set_my_pin(p_business uuid, p_pin text)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_person uuid := workplace.my_person_id(p_business);
  v_other uuid;
begin
  if v_person is null then
    raise exception 'Not a member of this business' using errcode = '42501';
  end if;
  if p_pin !~ '^[0-9]{4,6}$' then
    raise exception 'Use a PIN of 4 to 6 digits' using errcode = '22023';
  end if;
  if p_pin ~ '^(.)\1+$' or p_pin in ('1234', '12345', '123456', '4321', '654321') then
    raise exception 'That PIN is too easy to guess' using errcode = '22023';
  end if;
  v_other := workplace.pin_owner(p_business, p_pin);
  if v_other is not null and v_other <> v_person then
    raise exception 'That PIN is taken, choose another' using errcode = '23505';
  end if;
  insert into workplace.person_pins (person_id, business_id, pin_hash)
  values (v_person, p_business, extensions.crypt(p_pin, extensions.gen_salt('bf', 8)))
  on conflict (person_id) do update set pin_hash = excluded.pin_hash, updated_at = now();
end
$$;

create function workplace.has_pin(p_business uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from workplace.person_pins where person_id = workplace.my_person_id(p_business))
$$;

-- A tablet at the site is signed in by a manager or supervisor (clock.fix for that site).
-- Staff type their PIN; 5 wrong PINs in 5 minutes locks the kiosk for 5 minutes.
-- Returns ok = false with a message rather than raising, so failed attempts are kept for the lockout.
create function workplace.kiosk_clock(p_site uuid, p_pin text, p_action text)
returns table (ok boolean, message text, person_name text, at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  v_business uuid;
  v_person uuid;
  v_name text;
begin
  select business_id into v_business from workplace.sites where id = p_site;
  if v_business is null or not workplace.has_perm(v_business, 'clock.fix', p_site) then
    raise exception 'This device isn''t set up as a clock-in tablet for that site' using errcode = '42501';
  end if;
  if (select count(*) from workplace.kiosk_attempts where site_id = p_site and attempted_at > now() - interval '5 minutes') >= 5 then
    return query select false, 'Too many wrong PINs. Try again in a few minutes.'::text, null::text, now();
    return;
  end if;
  v_person := workplace.pin_owner(v_business, p_pin);
  if v_person is null or not workplace.person_works_at(v_person, p_site) then
    insert into workplace.kiosk_attempts (site_id) values (p_site);
    return query select false, 'PIN not recognised'::text, null::text, now();
    return;
  end if;
  select full_name into v_name from workplace.people where id = v_person;
  begin
    if p_action = 'in' then
      perform workplace._clock_in(v_business, v_person, p_site, 'kiosk', null);
    else
      perform workplace._clock_action(v_person, p_action, 'kiosk');
    end if;
  exception when others then
    return query select false, sqlerrm, v_name, now();
    return;
  end;
  return query select true, null::text, v_name, now();
end
$$;

-- ── Manager / supervisor fixes ──────────────────────────────────────────────
create function workplace.fix_clock_event(p_event uuid, p_clock_in timestamptz, p_clock_out timestamptz, p_reason text)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  e workplace.clock_events;
begin
  select * into e from workplace.clock_events where id = p_event;
  if e.id is null then
    raise exception 'Not found' using errcode = 'P0002';
  end if;
  if not workplace.has_perm(e.business_id, 'clock.fix', e.site_id) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if e.person_id = workplace.my_person_id(e.business_id) and not workplace.has_perm(e.business_id, 'billing.manage') then
    raise exception 'Ask another manager to fix your own times' using errcode = '42501';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Add a reason for the change' using errcode = '22023';
  end if;
  update workplace.clock_breaks set ended_at = coalesce(p_clock_out, ended_at)
    where clock_event_id = p_event and ended_at is null and p_clock_out is not null;
  update workplace.clock_events
     set clock_in_at = coalesce(p_clock_in, clock_in_at),
         clock_out_at = p_clock_out,
         out_method = case when p_clock_out is not null then 'manager' else out_method end,
         fixed_by = workplace.my_person_id(e.business_id),
         fix_reason = p_reason,
         approved_by = null, approved_at = null
   where id = p_event;
  perform workplace.log(e.business_id, 'clock.fixed', 'clock_event', p_event,
    jsonb_build_object('from_in', e.clock_in_at, 'from_out', e.clock_out_at, 'to_in', p_clock_in, 'to_out', p_clock_out, 'reason', p_reason));
end
$$;

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table workplace.clock_events enable row level security;
alter table workplace.clock_breaks enable row level security;
alter table workplace.person_pins enable row level security;
alter table workplace.kiosk_attempts enable row level security;

create policy clock_events_read on workplace.clock_events for select to authenticated using (
  person_id = workplace.my_person_id(business_id)
  or workplace.has_perm(business_id, 'clock.fix', site_id)
  or workplace.has_perm_over_person(business_id, 'timesheets.approve', person_id)
);
create policy clock_breaks_read on workplace.clock_breaks for select to authenticated using (
  exists (select 1 from workplace.clock_events e where e.id = clock_event_id)
);
-- person_pins and kiosk_attempts: no policies, so no direct access at all.

grant select on workplace.clock_events, workplace.clock_breaks to authenticated;
grant all on workplace.clock_events, workplace.clock_breaks, workplace.person_pins, workplace.kiosk_attempts to service_role;
revoke all on workplace.person_pins, workplace.kiosk_attempts from authenticated;

revoke execute on all functions in schema workplace from public, anon;
grant execute on function workplace.clock_in(uuid, uuid, double precision, double precision) to authenticated;
grant execute on function workplace.clock_action(uuid, text) to authenticated;
grant execute on function workplace.set_my_pin(uuid, text) to authenticated;
grant execute on function workplace.has_pin(uuid) to authenticated;
grant execute on function workplace.kiosk_clock(uuid, text, text) to authenticated;
grant execute on function workplace.fix_clock_event(uuid, timestamptz, timestamptz, text) to authenticated;
grant execute on function workplace.paid_minutes(uuid) to authenticated;
grant execute on function workplace.distance_m(double precision, double precision, double precision, double precision) to authenticated;
revoke execute on function workplace._clock_in(uuid, uuid, uuid, text, integer) from authenticated;
revoke execute on function workplace._clock_action(uuid, text, text) from authenticated;
revoke execute on function workplace.pin_owner(uuid, text) from authenticated;
revoke execute on function workplace.person_works_at(uuid, uuid) from authenticated;
revoke execute on function workplace.matching_shift(uuid, uuid, timestamptz) from authenticated;
