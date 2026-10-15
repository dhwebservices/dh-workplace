-- DH Workplace: time off. Requests go to whoever holds timeoff.approve over the person (their
-- department manager, site manager or the owner). Blackout dates block holiday requests.
-- UK entitlement: 5.6 weeks pro rata (capped at 28 days) for regular hours; 12.07% of hours
-- worked for irregular-hours staff (zero hours and casual). Everything is in hours.
-- All writes go through functions; staff can't insert or edit requests directly.

alter table workplace.businesses
  add column if not exists holiday_year_start_month smallint not null default 1
    check (holiday_year_start_month between 1 and 12);

alter table workplace.person_details
  add column if not exists weekly_hours numeric(4,1) check (weekly_hours is null or weekly_hours between 0 and 80),
  add column if not exists days_per_week numeric(2,1) check (days_per_week is null or days_per_week between 0.5 and 7);

-- Staff can edit their own contact details, but not the fields that set their holiday or payroll.
create function workplace.person_details_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if workplace.has_perm_over_person(new.business_id, 'staff.manage', new.person_id) then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.contract_type is not null or new.start_date is not null or new.weekly_hours is not null
       or new.days_per_week is not null or new.payroll_id is not null then
      raise exception 'Only a manager can set contract details' using errcode = '42501';
    end if;
  elsif (new.contract_type, new.start_date, new.weekly_hours, new.days_per_week, new.payroll_id)
        is distinct from (old.contract_type, old.start_date, old.weekly_hours, old.days_per_week, old.payroll_id) then
    raise exception 'Only a manager can change contract details' using errcode = '42501';
  end if;
  return new;
end
$$;
create trigger person_details_guard before insert or update on workplace.person_details
  for each row when (current_user = 'authenticated') execute function workplace.person_details_guard();

-- ── Tables ──────────────────────────────────────────────────────────────────
create table workplace.time_off_requests (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  person_id uuid not null,
  kind text not null default 'holiday' check (kind in ('holiday', 'unpaid', 'sick', 'other')),
  starts_on date not null,
  ends_on date not null,
  hours numeric(6,2) not null default 0 check (hours >= 0),
  reason text check (reason is null or length(reason) <= 300),
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined', 'cancelled')),
  decided_by uuid,
  decided_at timestamptz,
  decision_note text check (decision_note is null or length(decision_note) <= 300),
  created_at timestamptz not null default now(),
  check (ends_on >= starts_on and ends_on - starts_on <= 60),
  foreign key (person_id, business_id) references workplace.people(id, business_id) on delete cascade
);
create index on workplace.time_off_requests (business_id, starts_on);
create index on workplace.time_off_requests (person_id, starts_on);

-- No holiday in these dates. Null site and department = the whole business.
create table workplace.time_off_blackouts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references workplace.businesses(id) on delete cascade,
  site_id uuid,
  department_id uuid,
  starts_on date not null,
  ends_on date not null,
  reason text check (reason is null or length(reason) <= 120),
  created_at timestamptz not null default now(),
  check (ends_on >= starts_on),
  foreign key (site_id, business_id) references workplace.sites(id, business_id) on delete cascade,
  foreign key (department_id, business_id) references workplace.departments(id, business_id) on delete cascade
);
create index on workplace.time_off_blackouts (business_id, starts_on);

-- ── Entitlement ─────────────────────────────────────────────────────────────
create function workplace.holiday_year(p_business uuid, p_on date)
returns table (year_start date, year_end date)
language sql stable security definer set search_path = '' as $$
  select s, (s + interval '1 year' - interval '1 day')::date
  from (
    select case when make_date(extract(year from p_on)::int, b.holiday_year_start_month, 1) <= p_on
                then make_date(extract(year from p_on)::int, b.holiday_year_start_month, 1)
                else make_date(extract(year from p_on)::int - 1, b.holiday_year_start_month, 1) end as s
    from workplace.businesses b where b.id = p_business
  ) y
$$;

-- No access check: callers below check it.
create function workplace._holiday_balance(p_person uuid, p_on date)
returns table (year_start date, year_end date, method text, entitlement_hours numeric, hours_per_day numeric,
               taken_hours numeric, booked_hours numeric, pending_hours numeric, remaining_hours numeric)
language plpgsql stable security definer set search_path = '' as $$
declare
  p workplace.people;
  d workplace.person_details;
  v_start date; v_end date;
  v_method text;
  v_ent numeric;
  v_hpd numeric;
  v_worked numeric;
  v_taken numeric; v_booked numeric; v_pending numeric;
begin
  select * into p from workplace.people where id = p_person;
  select * into d from workplace.person_details where person_id = p_person;
  select y.year_start, y.year_end into v_start, v_end from workplace.holiday_year(p.business_id, p_on) y;

  if d.contract_type in ('zero_hours', 'casual') then
    -- Irregular hours: 12.07% of paid hours worked this holiday year.
    v_method := 'accrued';
    select coalesce(sum(workplace.paid_minutes(e.id)), 0) / 60.0 into v_worked
    from workplace.clock_events e
    where e.person_id = p_person and e.clock_out_at is not null
      and e.clock_in_at >= v_start and e.clock_in_at < (least(p_on, v_end) + 1);
    v_ent := round(v_worked * 0.1207, 2);
  elsif d.weekly_hours is not null and d.days_per_week is not null and d.weekly_hours > 0 then
    -- Regular hours: 5.6 weeks, capped at 28 days, pro rata for a start part way through the year.
    v_method := 'contract';
    v_hpd := d.weekly_hours / d.days_per_week;
    v_ent := least(5.6 * d.weekly_hours, 28 * v_hpd);
    if d.start_date is not null and d.start_date > v_start then
      v_ent := v_ent * greatest(0, v_end - d.start_date + 1)::numeric / (v_end - v_start + 1);
    end if;
    v_ent := round(v_ent, 2);
  else
    v_method := 'not_set';
  end if;

  select coalesce(sum(r.hours) filter (where r.status = 'approved' and r.starts_on <= p_on), 0),
         coalesce(sum(r.hours) filter (where r.status = 'approved' and r.starts_on > p_on), 0),
         coalesce(sum(r.hours) filter (where r.status = 'pending'), 0)
    into v_taken, v_booked, v_pending
  from workplace.time_off_requests r
  where r.person_id = p_person and r.kind = 'holiday' and r.starts_on between v_start and v_end;

  return query select v_start, v_end, v_method, v_ent, round(v_hpd, 2), v_taken, v_booked, v_pending,
    case when v_ent is null then null else round(v_ent - v_taken - v_booked - v_pending, 2) end;
end
$$;

create function workplace.holiday_balance(p_business uuid, p_person uuid, p_on date default null)
returns table (year_start date, year_end date, method text, entitlement_hours numeric, hours_per_day numeric,
               taken_hours numeric, booked_hours numeric, pending_hours numeric, remaining_hours numeric)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (select 1 from workplace.people where id = p_person and business_id = p_business)
     or not (p_person = workplace.my_person_id(p_business)
             or workplace.has_perm_over_person(p_business, 'timeoff.approve', p_person)
             or workplace.has_perm_over_person(p_business, 'staff.view_details', p_person)) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  return query select * from workplace._holiday_balance(p_person,
    coalesce(p_on, (now() at time zone (select timezone from workplace.businesses where id = p_business))::date));
end
$$;

-- Hours a request takes off: the person's rota shifts in those dates if there are any,
-- otherwise their working days in the range at their contracted hours per day.
create function workplace._time_off_hours(p_person uuid, p_starts date, p_ends date)
returns numeric
language plpgsql stable security definer set search_path = '' as $$
declare
  v_tz text;
  v_shift numeric;
  d workplace.person_details;
  v_days int := p_ends - p_starts + 1;
  v_work int;
begin
  select b.timezone into v_tz from workplace.people p join workplace.businesses b on b.id = p.business_id where p.id = p_person;
  select sum(extract(epoch from (s.ends_at - s.starts_at)) / 3600 - s.break_minutes / 60.0) into v_shift
  from workplace.shifts s
  where s.person_id = p_person and (s.starts_at at time zone v_tz)::date between p_starts and p_ends;
  if coalesce(v_shift, 0) > 0 then
    return round(v_shift, 2);
  end if;
  select * into d from workplace.person_details where person_id = p_person;
  if d.weekly_hours is null or d.days_per_week is null or d.days_per_week = 0 then
    return null;
  end if;
  select count(*) into v_work from generate_series(p_starts, p_ends, interval '1 day') g
  where d.days_per_week > 5 or extract(isodow from g) < 6;
  return round(least(v_work, ceil(v_days * d.days_per_week / 7)) * d.weekly_hours / d.days_per_week, 2);
end
$$;

-- ── Requests ────────────────────────────────────────────────────────────────
create function workplace.request_time_off(p_business uuid, p_starts date, p_ends date, p_kind text default 'holiday',
                                           p_reason text default null, p_hours numeric default null)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_person uuid := workplace.my_person_id(p_business);
  v_hours numeric;
  v_left numeric;
  v_block text;
  v_id uuid;
begin
  if v_person is null then
    raise exception 'Not a member of this business' using errcode = '42501';
  end if;
  if p_ends < p_starts then
    raise exception 'The end date is before the start date' using errcode = '22023';
  end if;
  if p_kind not in ('holiday', 'unpaid', 'sick', 'other') then
    raise exception 'Unknown kind of time off' using errcode = '22023';
  end if;
  if exists (select 1 from workplace.time_off_requests where person_id = v_person and status in ('pending', 'approved')
             and starts_on <= p_ends and ends_on >= p_starts) then
    raise exception 'You already have time off in those dates' using errcode = '23505';
  end if;
  if p_kind in ('holiday', 'unpaid') then
    select coalesce(bo.reason, 'a busy period') into v_block
    from workplace.time_off_blackouts bo
    where bo.business_id = p_business and bo.starts_on <= p_ends and bo.ends_on >= p_starts
      and ((bo.site_id is null and bo.department_id is null)
        or bo.department_id in (select department_id from workplace.person_departments where person_id = v_person)
        or bo.site_id in (select d.site_id from workplace.person_departments pd join workplace.departments d on d.id = pd.department_id
                          where pd.person_id = v_person))
    limit 1;
    if v_block is not null then
      raise exception 'Those dates are blocked for holiday (%)', v_block using errcode = '23P01';
    end if;
  end if;
  v_hours := coalesce(p_hours, workplace._time_off_hours(v_person, p_starts, p_ends), 0);
  if p_kind = 'holiday' then
    select remaining_hours into v_left from workplace._holiday_balance(v_person, p_starts);
    if v_left is not null and v_hours > v_left + 0.01 then
      raise exception 'That''s % hours and you have % hours left this holiday year', v_hours, greatest(v_left, 0) using errcode = '22023';
    end if;
  end if;
  insert into workplace.time_off_requests (business_id, person_id, kind, starts_on, ends_on, hours, reason)
  values (p_business, v_person, p_kind, p_starts, p_ends, v_hours, nullif(trim(p_reason), ''))
  returning id into v_id;
  return v_id;
end
$$;

create function workplace.decide_time_off(p_request uuid, p_approve boolean, p_note text default null, p_hours numeric default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  r workplace.time_off_requests;
begin
  select * into r from workplace.time_off_requests where id = p_request;
  if r.id is null then
    raise exception 'Not found' using errcode = 'P0002';
  end if;
  if not workplace.has_perm_over_person(r.business_id, 'timeoff.approve', r.person_id) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if r.person_id = workplace.my_person_id(r.business_id) and not workplace.has_perm(r.business_id, 'billing.manage') then
    raise exception 'Ask another manager to approve your own time off' using errcode = '42501';
  end if;
  if r.status <> 'pending' then
    raise exception 'This request has already been %', r.status using errcode = '22023';
  end if;
  update workplace.time_off_requests
     set status = case when p_approve then 'approved' else 'declined' end,
         hours = coalesce(p_hours, hours),
         decided_by = workplace.my_person_id(r.business_id), decided_at = now(),
         decision_note = nullif(trim(p_note), '')
   where id = p_request;
  perform workplace.log(r.business_id, case when p_approve then 'timeoff.approved' else 'timeoff.declined' end,
    'time_off_request', p_request, jsonb_build_object('person', r.person_id, 'from', r.starts_on, 'to', r.ends_on));
end
$$;

-- The person cancels their own request (pending, or approved and not started yet);
-- an approver can cancel any request they could approve.
create function workplace.cancel_time_off(p_request uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  r workplace.time_off_requests;
  v_mine boolean;
begin
  select * into r from workplace.time_off_requests where id = p_request;
  if r.id is null then
    raise exception 'Not found' using errcode = 'P0002';
  end if;
  v_mine := r.person_id = workplace.my_person_id(r.business_id);
  if not (v_mine or workplace.has_perm_over_person(r.business_id, 'timeoff.approve', r.person_id)) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if r.status not in ('pending', 'approved') then
    raise exception 'This request is already %', r.status using errcode = '22023';
  end if;
  if v_mine and r.status = 'approved' and r.starts_on <= current_date
     and not workplace.has_perm_over_person(r.business_id, 'timeoff.approve', r.person_id) then
    raise exception 'This time off has started; ask your manager to change it' using errcode = '42501';
  end if;
  update workplace.time_off_requests set status = 'cancelled' where id = p_request;
  perform workplace.log(r.business_id, 'timeoff.cancelled', 'time_off_request', p_request, '{}'::jsonb);
end
$$;

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table workplace.time_off_requests enable row level security;
alter table workplace.time_off_blackouts enable row level security;

-- Own requests, requests you can approve, and (for planning the rota) requests of people whose rota you see.
create policy time_off_read on workplace.time_off_requests for select to authenticated using (
  person_id = workplace.my_person_id(business_id)
  or workplace.has_perm_over_person(business_id, 'timeoff.approve', person_id)
  or workplace.has_perm_over_person(business_id, 'rota.view_all', person_id)
);

create policy blackouts_read on workplace.time_off_blackouts for select to authenticated using (workplace.is_member(business_id));
create policy blackouts_write on workplace.time_off_blackouts for all to authenticated
  using (workplace.has_perm(business_id, 'timeoff.approve', site_id, department_id))
  with check (workplace.has_perm(business_id, 'timeoff.approve', site_id, department_id));

grant select on workplace.time_off_requests to authenticated;
grant select, insert, update, delete on workplace.time_off_blackouts to authenticated;
grant all on workplace.time_off_requests, workplace.time_off_blackouts to service_role;

revoke execute on all functions in schema workplace from public, anon;
grant execute on function workplace.holiday_balance(uuid, uuid, date) to authenticated;
grant execute on function workplace.request_time_off(uuid, date, date, text, text, numeric) to authenticated;
grant execute on function workplace.decide_time_off(uuid, boolean, text, numeric) to authenticated;
grant execute on function workplace.cancel_time_off(uuid) to authenticated;
revoke execute on function workplace._holiday_balance(uuid, date) from authenticated;
revoke execute on function workplace._time_off_hours(uuid, date, date) from authenticated;
revoke execute on function workplace.holiday_year(uuid, date) from authenticated;
revoke execute on function workplace.person_details_guard() from authenticated;
