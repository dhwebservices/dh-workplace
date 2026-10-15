-- Supervisors and department managers are scoped to departments, not sites. Clock permissions
-- now also count when held for the person's department (fixes, reads) or for any department
-- at the site (running a kiosk tablet).
create function workplace.has_perm_in_site(p_business uuid, p_perm text, p_site uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select workplace.has_perm(p_business, p_perm, p_site)
    or exists (
      select 1 from workplace.departments d
      where d.site_id = p_site and d.business_id = p_business
        and workplace.has_perm(p_business, p_perm, null, d.id)
    )
$$;

drop policy clock_events_read on workplace.clock_events;
create policy clock_events_read on workplace.clock_events for select to authenticated using (
  person_id = workplace.my_person_id(business_id)
  or workplace.has_perm(business_id, 'clock.fix', site_id)
  or workplace.has_perm_over_person(business_id, 'clock.fix', person_id)
  or workplace.has_perm_over_person(business_id, 'timesheets.approve', person_id)
);

create or replace function workplace.fix_clock_event(p_event uuid, p_clock_in timestamptz, p_clock_out timestamptz, p_reason text)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  e workplace.clock_events;
begin
  select * into e from workplace.clock_events where id = p_event;
  if e.id is null then
    raise exception 'Not found' using errcode = 'P0002';
  end if;
  if not (workplace.has_perm(e.business_id, 'clock.fix', e.site_id)
          or workplace.has_perm_over_person(e.business_id, 'clock.fix', e.person_id)) then
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

create or replace function workplace.kiosk_clock(p_site uuid, p_pin text, p_action text)
returns table (ok boolean, message text, person_name text, at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  v_business uuid;
  v_person uuid;
  v_name text;
begin
  select business_id into v_business from workplace.sites where id = p_site;
  if v_business is null or not workplace.has_perm_in_site(v_business, 'clock.fix', p_site) then
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

revoke execute on function workplace.has_perm_in_site(uuid, text, uuid) from public, anon;
grant execute on function workplace.has_perm_in_site(uuid, text, uuid) to authenticated;
