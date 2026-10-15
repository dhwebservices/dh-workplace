-- DH Workplace: timesheets. Built from clock-ins; approved by whoever holds timesheets.approve over
-- the person; exported (generic CSV, Xero, Sage, BrightPay) by the app from timesheet_rows.
-- No payroll is run in the app.

-- One row per clock-in in the range. Runs as the caller, so RLS on clock_events, shifts, people,
-- person_details and person_pay decides what each person sees: staff get their own rows only, and
-- the pay rate is null unless the caller holds pay.view for that person.
create function workplace.timesheet_rows(p_business uuid, p_from date, p_to date, p_site uuid default null)
returns table (
  event_id uuid, person_id uuid, full_name text, payroll_id text, site_id uuid, site_name text,
  department_name text, work_date date, clock_in_at timestamptz, clock_out_at timestamptz,
  shift_starts_at timestamptz, shift_ends_at timestamptz, break_minutes integer, paid_minutes integer,
  hourly_rate_pence integer, approved boolean, approved_at timestamptz, fixed boolean, fix_reason text
)
language sql stable security invoker set search_path = '' as $$
  select e.id, e.person_id, p.full_name, pd.payroll_id, e.site_id, si.name,
         coalesce(dsh.name, (select d.name from workplace.person_departments x join workplace.departments d on d.id = x.department_id
                             where x.person_id = e.person_id and d.site_id = e.site_id order by d.name limit 1)),
         (e.clock_in_at at time zone b.timezone)::date,
         e.clock_in_at, e.clock_out_at, s.starts_at, s.ends_at,
         coalesce((select round(sum(extract(epoch from (coalesce(cb.ended_at, coalesce(e.clock_out_at, now())) - cb.started_at)) / 60))::integer
                   from workplace.clock_breaks cb where cb.clock_event_id = e.id and not cb.paid), 0),
         workplace.paid_minutes(e.id),
         (select pp.hourly_rate_pence from workplace.person_pay pp
           where pp.person_id = e.person_id and pp.effective_from <= (e.clock_in_at at time zone b.timezone)::date
           order by pp.effective_from desc limit 1),
         e.approved_at is not null, e.approved_at, e.fixed_by is not null, e.fix_reason
  from workplace.clock_events e
  join workplace.businesses b on b.id = e.business_id
  join workplace.people p on p.id = e.person_id
  join workplace.sites si on si.id = e.site_id
  left join workplace.person_details pd on pd.person_id = e.person_id
  left join workplace.shifts s on s.id = e.shift_id
  left join workplace.departments dsh on dsh.id = s.department_id
  where e.business_id = p_business
    and (p_site is null or e.site_id = p_site)
    and (e.clock_in_at at time zone b.timezone)::date between p_from and p_to
  order by p.full_name, e.clock_in_at
$$;

-- Approve closed clock-ins. Returns how many were approved; anything the caller can't approve is skipped.
create function workplace.approve_clock_events(p_events uuid[])
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  e workplace.clock_events;
  v_count integer := 0;
  v_me uuid;
  v_business uuid;
begin
  for e in select * from workplace.clock_events where id = any (p_events) and approved_at is null loop
    v_me := workplace.my_person_id(e.business_id);
    if v_me is null or e.clock_out_at is null then
      continue;
    end if;
    if not (workplace.has_perm(e.business_id, 'timesheets.approve', e.site_id)
            or workplace.has_perm_over_person(e.business_id, 'timesheets.approve', e.person_id)) then
      continue;
    end if;
    if e.person_id = v_me and not workplace.has_perm(e.business_id, 'billing.manage') then
      continue;
    end if;
    update workplace.clock_events set approved_by = v_me, approved_at = now() where id = e.id;
    v_count := v_count + 1;
    v_business := e.business_id;
  end loop;
  if v_count > 0 then
    perform workplace.log(v_business, 'timesheets.approved', 'clock_event', null, jsonb_build_object('count', v_count));
  end if;
  return v_count;
end
$$;

create function workplace.unapprove_clock_event(p_event uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  e workplace.clock_events;
begin
  select * into e from workplace.clock_events where id = p_event;
  if e.id is null then
    raise exception 'Not found' using errcode = 'P0002';
  end if;
  if not coalesce(workplace.has_perm(e.business_id, 'timesheets.approve', e.site_id)
                  or workplace.has_perm_over_person(e.business_id, 'timesheets.approve', e.person_id), false) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  update workplace.clock_events set approved_by = null, approved_at = null where id = p_event;
  perform workplace.log(e.business_id, 'timesheets.unapproved', 'clock_event', p_event, '{}'::jsonb);
end
$$;

-- Approvers can also add a missed clock-in (e.g. someone forgot entirely), with a reason.
create function workplace.add_clock_event(p_business uuid, p_person uuid, p_site uuid, p_in timestamptz, p_out timestamptz,
                                          p_break_minutes integer, p_reason text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := workplace.my_person_id(p_business);
  v_id uuid;
begin
  if v_me is null or not exists (select 1 from workplace.people where id = p_person and business_id = p_business)
     or not coalesce(workplace.has_perm(p_business, 'clock.fix', p_site)
                     or workplace.has_perm_over_person(p_business, 'clock.fix', p_person), false) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if p_person = v_me and not workplace.has_perm(p_business, 'billing.manage') then
    raise exception 'Ask another manager to add your own times' using errcode = '42501';
  end if;
  if not workplace.person_works_at(p_person, p_site) then
    raise exception 'They don''t work at this site' using errcode = '22023';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Add a reason' using errcode = '22023';
  end if;
  if p_out is null or p_out <= p_in or p_out - p_in > interval '24 hours' then
    raise exception 'Check the times' using errcode = '22023';
  end if;
  if exists (select 1 from workplace.clock_events where person_id = p_person
             and clock_in_at < p_out and coalesce(clock_out_at, now()) > p_in) then
    raise exception 'That overlaps another clock-in' using errcode = '23P01';
  end if;
  insert into workplace.clock_events (business_id, person_id, site_id, shift_id, clock_in_at, clock_out_at,
                                      in_method, out_method, fixed_by, fix_reason)
  values (p_business, p_person, p_site, workplace.matching_shift(p_person, p_site, p_in), p_in, p_out,
          'manager', 'manager', v_me, p_reason)
  returning id into v_id;
  if coalesce(p_break_minutes, 0) > 0 then
    insert into workplace.clock_breaks (business_id, clock_event_id, started_at, ended_at)
    values (p_business, v_id, p_in + (p_out - p_in) / 2, p_in + (p_out - p_in) / 2 + make_interval(mins => p_break_minutes));
  end if;
  perform workplace.log(p_business, 'clock.added', 'clock_event', v_id, jsonb_build_object('person', p_person, 'reason', p_reason));
  return v_id;
end
$$;

revoke execute on all functions in schema workplace from public, anon;
grant execute on function workplace.timesheet_rows(uuid, date, date, uuid) to authenticated;
grant execute on function workplace.approve_clock_events(uuid[]) to authenticated;
grant execute on function workplace.unapprove_clock_event(uuid) to authenticated;
grant execute on function workplace.add_clock_event(uuid, uuid, uuid, timestamptz, timestamptz, integer, text) to authenticated;
