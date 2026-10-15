-- Fixes found by supabase/tests/time_off.sql:
-- 1. For a caller outside the business, my_person_id() is null, so "p_person = my_person_id()"
--    was null and the access checks in holiday_balance and cancel_time_off never raised.
-- 2. Working days for a request with no rota: count per week, capped at days_per_week,
--    so a 5-day worker taking Mon-Fri is 5 days, not 4.
create or replace function workplace.holiday_balance(p_business uuid, p_person uuid, p_on date default null)
returns table (year_start date, year_end date, method text, entitlement_hours numeric, hours_per_day numeric,
               taken_hours numeric, booked_hours numeric, pending_hours numeric, remaining_hours numeric)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (select 1 from workplace.people where id = p_person and business_id = p_business)
     or not coalesce(p_person = workplace.my_person_id(p_business)
             or workplace.has_perm_over_person(p_business, 'timeoff.approve', p_person)
             or workplace.has_perm_over_person(p_business, 'staff.view_details', p_person), false) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  return query select * from workplace._holiday_balance(p_person,
    coalesce(p_on, (now() at time zone (select timezone from workplace.businesses where id = p_business))::date));
end
$$;

create or replace function workplace.cancel_time_off(p_request uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  r workplace.time_off_requests;
  v_mine boolean;
  v_approver boolean;
begin
  select * into r from workplace.time_off_requests where id = p_request;
  if r.id is null then
    raise exception 'Not found' using errcode = 'P0002';
  end if;
  v_mine := coalesce(r.person_id = workplace.my_person_id(r.business_id), false);
  v_approver := coalesce(workplace.has_perm_over_person(r.business_id, 'timeoff.approve', r.person_id), false);
  if not (v_mine or v_approver) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if r.status not in ('pending', 'approved') then
    raise exception 'This request is already %', r.status using errcode = '22023';
  end if;
  if r.status = 'approved' and r.starts_on <= current_date and not v_approver then
    raise exception 'This time off has started; ask your manager to change it' using errcode = '42501';
  end if;
  update workplace.time_off_requests set status = 'cancelled' where id = p_request;
  perform workplace.log(r.business_id, 'timeoff.cancelled', 'time_off_request', p_request, '{}'::jsonb);
end
$$;

create or replace function workplace._time_off_hours(p_person uuid, p_starts date, p_ends date)
returns numeric
language plpgsql stable security definer set search_path = '' as $$
declare
  v_tz text;
  v_shift numeric;
  d workplace.person_details;
  v_work numeric;
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
  -- Per week: weekdays off (or every day for 6-7 day workers), capped at their days per week.
  select sum(least(cnt, d.days_per_week)) into v_work
  from (
    select date_trunc('week', g) wk, count(*) cnt
    from generate_series(p_starts, p_ends, interval '1 day') g
    where d.days_per_week > 5 or extract(isodow from g) < 6
    group by 1
  ) w;
  return round(coalesce(v_work, 0) * d.weekly_hours / d.days_per_week, 2);
end
$$;
revoke execute on function workplace._time_off_hours(uuid, date, date) from public, anon, authenticated;
