-- DH Workplace clock-in tests: geofence, kiosk PINs and lockout, scoped fixes, isolation, paid time.
-- Same pattern as isolation.sql: one DO block, results raised as the error message, everything rolled back.
-- now() is fixed inside a transaction, so tests move clock-in times back before clocking out.
do $test$
declare
  results text[] := '{}';
  n bigint;
  v uuid;
  r record;
  u_owner uuid := gen_random_uuid(); u_mgr2 uuid := gen_random_uuid(); u_sup uuid := gen_random_uuid();
  u_s1 uuid := gen_random_uuid(); u_s2 uuid := gen_random_uuid(); u_b uuid := gen_random_uuid();
  b_a uuid := gen_random_uuid(); s_a1 uuid := gen_random_uuid(); s_a2 uuid := gen_random_uuid();
  d_bar uuid := gen_random_uuid(); d_kit uuid := gen_random_uuid(); d_a2 uuid := gen_random_uuid();
  p_owner uuid := gen_random_uuid(); p_mgr2 uuid := gen_random_uuid(); p_sup uuid := gen_random_uuid();
  p_s1 uuid := gen_random_uuid(); p_s2 uuid := gen_random_uuid();
  b_b uuid := gen_random_uuid(); s_b uuid := gen_random_uuid(); p_b uuid := gen_random_uuid();
  sh_s1 uuid := gen_random_uuid();
  e_s1 uuid; e_s2 uuid; e_sup uuid := gen_random_uuid(); e_paid uuid := gen_random_uuid(); sh_paid uuid := gen_random_uuid();
begin
  insert into auth.users (id, email, aud, role, email_confirmed_at) values
    (u_owner, 'c-own@test.invalid', 'authenticated', 'authenticated', now()), (u_mgr2, 'c-mgr2@test.invalid', 'authenticated', 'authenticated', now()),
    (u_sup, 'c-sup@test.invalid', 'authenticated', 'authenticated', now()), (u_s1, 'c-s1@test.invalid', 'authenticated', 'authenticated', now()),
    (u_s2, 'c-s2@test.invalid', 'authenticated', 'authenticated', now()), (u_b, 'c-b@test.invalid', 'authenticated', 'authenticated', now());
  insert into workplace.businesses (id, name) values (b_a, 'A'), (b_b, 'B');
  -- A1 has a location (Pontypridd, 150 m radius); A2 has none.
  insert into workplace.sites (id, business_id, name, latitude, longitude, clock_in_radius_m) values
    (s_a1, b_a, 'A1', 51.6014, -3.3420, 150);
  insert into workplace.sites (id, business_id, name) values (s_a2, b_a, 'A2'), (s_b, b_b, 'B1');
  insert into workplace.departments (id, business_id, site_id, name) values
    (d_bar, b_a, s_a1, 'Bar'), (d_kit, b_a, s_a1, 'Kitchen'), (d_a2, b_a, s_a2, 'Bar');
  insert into workplace.people (id, business_id, user_id, full_name) values
    (p_owner, b_a, u_owner, 'Owner'), (p_mgr2, b_a, u_mgr2, 'A2 manager'), (p_sup, b_a, u_sup, 'Bar supervisor'),
    (p_s1, b_a, u_s1, 'Bar staff'), (p_s2, b_a, u_s2, 'Kitchen staff'), (p_b, b_b, u_b, 'B owner');
  insert into workplace.person_departments (person_id, department_id, business_id) values
    (p_s1, d_bar, b_a), (p_s2, d_kit, b_a), (p_sup, d_bar, b_a);
  insert into workplace.role_assignments (business_id, person_id, role) values
    (b_a, p_owner, 'owner'), (b_a, p_s1, 'staff'), (b_a, p_s2, 'staff'), (b_b, p_b, 'owner');
  insert into workplace.role_assignments (business_id, person_id, role, site_id) values (b_a, p_mgr2, 'manager', s_a2);
  insert into workplace.role_assignments (business_id, person_id, role, department_id) values (b_a, p_sup, 'supervisor', d_bar);
  -- Bar staff has a published shift that started 10 minutes ago.
  insert into workplace.shifts (id, business_id, site_id, department_id, person_id, starts_at, ends_at, published_at)
    values (sh_s1, b_a, s_a1, d_bar, p_s1, now() - interval '10 minutes', now() + interval '6 hours', now());

  -- ── Phone clock-in ──
  perform set_config('request.jwt.claims', json_build_object('sub', u_s1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    e_s1 := workplace.clock_in(b_a, s_a1, 51.6018, -3.3423);
    results := array_append(results, 'PASS C1 staff clocks in inside the geofence'::text);
  exception when others then
    results := array_append(results, ('FAIL C1 staff could not clock in on site (' || sqlerrm || ')')::text);
  end;
  select shift_id into v from workplace.clock_events where id = e_s1;
  results := array_append(results, (case when v = sh_s1 then 'PASS' else 'FAIL' end || ' C2 clock-in is linked to the published shift')::text);
  begin
    perform workplace.clock_in(b_a, s_a1, 51.6018, -3.3423);
    results := array_append(results, 'FAIL C3 clocked in twice'::text);
  exception when others then
    results := array_append(results, ('PASS C3 cannot clock in twice (' || sqlerrm || ')')::text);
  end;
  begin
    perform workplace.clock_in(b_a, s_a2, null, null);
    results := array_append(results, 'FAIL C4 clocked in at a site they don''t work at'::text);
  exception when others then
    results := array_append(results, ('PASS C4 cannot clock in at another site (' || sqlerrm || ')')::text);
  end;
  begin
    insert into workplace.clock_events (business_id, person_id, site_id, in_method) values (b_a, p_s1, s_a1, 'manager');
    results := array_append(results, 'FAIL C5 staff inserted a clock row directly'::text);
  exception when others then
    results := array_append(results, ('PASS C5 no direct inserts (' || sqlerrm || ')')::text);
  end;
  begin
    update workplace.clock_events set clock_in_at = clock_in_at - interval '3 hours' where id = e_s1;
    results := array_append(results, 'FAIL C6 staff edited their own clock-in'::text);
  exception when others then
    results := array_append(results, ('PASS C6 no direct edits (' || sqlerrm || ')')::text);
  end;
  begin
    perform 1 from workplace.person_pins;
    results := array_append(results, 'FAIL C7 staff read person_pins'::text);
  exception when others then
    results := array_append(results, ('PASS C7 PIN hashes unreadable (' || sqlerrm || ')')::text);
  end;
  begin
    perform workplace.set_my_pin(b_a, '1234');
    results := array_append(results, 'FAIL C8 easy PIN accepted'::text);
  exception when others then
    results := array_append(results, ('PASS C8 easy PIN refused (' || sqlerrm || ')')::text);
  end;
  perform workplace.set_my_pin(b_a, '4826');
  results := array_append(results, (case when workplace.has_pin(b_a) then 'PASS' else 'FAIL' end || ' C9 staff sets a PIN')::text);
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub', u_s2, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform workplace.clock_in(b_a, s_a1, 51.6100, -3.3420);
    results := array_append(results, 'FAIL C10 clocked in from 950 m away'::text);
  exception when others then
    results := array_append(results, ('PASS C10 refused outside the geofence (' || sqlerrm || ')')::text);
  end;
  begin
    perform workplace.clock_in(b_a, s_a1, null, null);
    results := array_append(results, 'FAIL C11 clocked in without a location'::text);
  exception when others then
    results := array_append(results, ('PASS C11 location required at a geofenced site (' || sqlerrm || ')')::text);
  end;
  select count(*) into n from workplace.clock_events where person_id <> p_s2;
  results := array_append(results, (case when n = 0 then 'PASS' else 'FAIL' end || ' C12 staff cannot see colleagues'' clock-ins')::text);
  begin
    perform workplace.set_my_pin(b_a, '4826');
    results := array_append(results, 'FAIL C13 duplicate PIN accepted'::text);
  exception when others then
    results := array_append(results, ('PASS C13 PIN must be unique in the business (' || sqlerrm || ')')::text);
  end;
  perform workplace.set_my_pin(b_a, '7391');
  begin
    perform * from workplace.kiosk_clock(s_a1, '7391', 'in');
    results := array_append(results, 'FAIL C14 staff ran a kiosk'::text);
  exception when others then
    results := array_append(results, ('PASS C14 staff cannot run a kiosk (' || sqlerrm || ')')::text);
  end;
  execute 'reset role';

  -- ── Kiosk run by the department supervisor ──
  perform set_config('request.jwt.claims', json_build_object('sub', u_sup, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select * into r from workplace.kiosk_clock(s_a1, '7391', 'in');
  results := array_append(results, (case when r.ok and r.person_name = 'Kitchen staff' then 'PASS' else 'FAIL' end
    || ' C15 Bar supervisor runs the A1 kiosk, Kitchen staff clocks in by PIN (' || coalesce(r.message, 'ok') || ')')::text);
  begin
    perform * from workplace.kiosk_clock(s_a2, '7391', 'in');
    results := array_append(results, 'FAIL C16 A1 supervisor ran an A2 kiosk'::text);
  exception when others then
    results := array_append(results, ('PASS C16 kiosk limited to the supervisor''s site (' || sqlerrm || ')')::text);
  end;
  select count(*) into n from workplace.clock_events where person_id = p_s1;
  results := array_append(results, (case when n = 1 then 'PASS' else 'FAIL' end || ' C17 supervisor sees their department''s clock-ins')::text);
  select count(*) into n from workplace.clock_events where person_id = p_s2;
  results := array_append(results, (case when n = 0 then 'PASS' else 'FAIL' end || ' C18 supervisor cannot see other departments'' clock-ins')::text);
  execute 'reset role';

  select id into e_s2 from workplace.clock_events where person_id = p_s2;
  update workplace.clock_events set clock_in_at = now() - interval '3 hours' where id in (e_s1, e_s2);
  insert into workplace.clock_events (id, business_id, person_id, site_id, in_method, clock_in_at, clock_out_at)
    values (e_sup, b_a, p_sup, s_a1, 'phone', now() - interval '5 hours', now() - interval '1 hour');

  perform set_config('request.jwt.claims', json_build_object('sub', u_sup, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform workplace.fix_clock_event(e_s1, null, now() - interval '1 minute', 'Forgot to clock out');
    results := array_append(results, 'PASS C19 supervisor fixes Bar staff times'::text);
  exception when others then
    results := array_append(results, ('FAIL C19 supervisor could not fix Bar staff (' || sqlerrm || ')')::text);
  end;
  begin
    perform workplace.fix_clock_event(e_s2, null, now() - interval '1 minute', 'Forgot to clock out');
    results := array_append(results, 'FAIL C20 supervisor fixed Kitchen staff times'::text);
  exception when others then
    results := array_append(results, ('PASS C20 supervisor cannot fix other departments (' || sqlerrm || ')')::text);
  end;
  begin
    perform workplace.fix_clock_event(e_sup, null, now() - interval '30 minutes', 'Stayed late');
    results := array_append(results, 'FAIL C21 supervisor fixed their own times'::text);
  exception when others then
    results := array_append(results, ('PASS C21 cannot fix your own times (' || sqlerrm || ')')::text);
  end;
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub', u_mgr2, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform workplace.fix_clock_event(e_s2, null, now() - interval '1 minute', 'Forgot');
    results := array_append(results, 'FAIL C22 A2 manager fixed an A1 clock-in'::text);
  exception when others then
    results := array_append(results, ('PASS C22 site manager cannot fix another site (' || sqlerrm || ')')::text);
  end;
  select count(*) into n from workplace.clock_events where site_id = s_a1;
  results := array_append(results, (case when n = 0 then 'PASS' else 'FAIL' end || ' C23 A2 manager cannot see A1 clock-ins')::text);
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub', u_owner, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform workplace.fix_clock_event(e_s2, null, now() - interval '1 minute', '  ');
    results := array_append(results, 'FAIL C24 fix without a reason accepted'::text);
  exception when others then
    results := array_append(results, ('PASS C24 a fix needs a reason (' || sqlerrm || ')')::text);
  end;
  perform workplace.fix_clock_event(e_s2, null, now() - interval '1 minute', 'Forgot to clock out');
  select count(*) into n from workplace.activity_log where target_id = e_s2 and action = 'clock.fixed';
  results := array_append(results, (case when n = 1 then 'PASS' else 'FAIL' end || ' C25 owner fixes and the change is logged')::text);
  -- Owner runs the A2 kiosk: Kitchen staff (A1 only) is not recognised there.
  select * into r from workplace.kiosk_clock(s_a2, '7391', 'in');
  results := array_append(results, (case when not r.ok then 'PASS' else 'FAIL' end || ' C26 PIN only works at the person''s own sites (' || coalesce(r.message, 'ok') || ')')::text);
  -- Lockout: 4 more wrong PINs at A2 (5 in total), then even a right PIN is refused.
  for i in 1..4 loop
    perform * from workplace.kiosk_clock(s_a2, '0000' || i, 'in');
  end loop;
  select * into r from workplace.kiosk_clock(s_a2, '4826', 'in');
  results := array_append(results, (case when not r.ok and r.message like 'Too many%' then 'PASS' else 'FAIL' end
    || ' C27 kiosk locks after 5 wrong PINs (' || coalesce(r.message, 'ok') || ')')::text);
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub', u_b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from workplace.clock_events where business_id = b_a;
  results := array_append(results, (case when n = 0 then 'PASS' else 'FAIL' end || ' C28 another business sees none of A''s clock-ins')::text);
  begin
    perform workplace.clock_in(b_a, s_a1, 51.6018, -3.3423);
    results := array_append(results, 'FAIL C29 outsider clocked in to A'::text);
  exception when others then
    results := array_append(results, ('PASS C29 outsider cannot clock in to A (' || sqlerrm || ')')::text);
  end;
  begin
    perform * from workplace.kiosk_clock(s_a1, '4826', 'in');
    results := array_append(results, 'FAIL C30 outsider ran A''s kiosk'::text);
  exception when others then
    results := array_append(results, ('PASS C30 outsider cannot run A''s kiosk (' || sqlerrm || ')')::text);
  end;
  execute 'reset role';

  -- ── Paid time: clocked in 10 min early, shift 17:00-23:00, 30 min unpaid break ──
  insert into workplace.shifts (id, business_id, site_id, department_id, person_id, starts_at, ends_at, published_at)
    values (sh_paid, b_a, s_a1, d_bar, p_s1, '2026-01-05 17:00Z', '2026-01-05 23:00Z', now());
  insert into workplace.clock_events (id, business_id, person_id, site_id, shift_id, in_method, clock_in_at, clock_out_at)
    values (e_paid, b_a, p_s1, s_a1, sh_paid, 'phone', '2026-01-05 16:50Z', '2026-01-05 23:00Z');
  insert into workplace.clock_breaks (business_id, clock_event_id, started_at, ended_at)
    values (b_a, e_paid, '2026-01-05 20:00Z', '2026-01-05 20:30Z');
  n := workplace.paid_minutes(e_paid);
  results := array_append(results, (case when n = 330 then 'PASS' else 'FAIL' end || ' C31 pay starts at shift start, unpaid break taken off (' || n || ' min)')::text);

  -- Breaks and clock-out through the phone functions.
  update workplace.clock_events set clock_in_at = now() - interval '2 hours', clock_out_at = null, out_method = null where id = e_s1;
  perform set_config('request.jwt.claims', json_build_object('sub', u_s1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform workplace.clock_action(b_a, 'break_start');
  begin
    perform workplace.clock_action(b_a, 'break_start');
    results := array_append(results, 'FAIL C32 two breaks at once'::text);
  exception when others then
    results := array_append(results, ('PASS C32 one break at a time (' || sqlerrm || ')')::text);
  end;
  execute 'reset role';
  update workplace.clock_breaks set started_at = now() - interval '20 minutes' where clock_event_id = e_s1;
  execute 'set local role authenticated';
  perform workplace.clock_action(b_a, 'out');
  select count(*) into n from workplace.clock_events e where e.id = e_s1 and e.clock_out_at is not null
    and exists (select 1 from workplace.clock_breaks b where b.clock_event_id = e.id and b.ended_at is not null);
  results := array_append(results, (case when n = 1 then 'PASS' else 'FAIL' end || ' C33 clocking out ends the open break')::text);
  execute 'reset role';

  execute 'set local role anon';
  begin
    perform workplace.clock_in(b_a, s_a1, 51.6018, -3.3423);
    results := array_append(results, 'FAIL C34 anon called clock_in'::text);
  exception when others then
    results := array_append(results, ('PASS C34 anon blocked (' || sqlerrm || ')')::text);
  end;
  execute 'reset role';

  raise exception E'RESULTS (rolled back)\n%', array_to_string(results, E'\n');
end
$test$;
