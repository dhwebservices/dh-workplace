-- DH Workplace timesheet tests: rows, scoping, pay visibility, approval, manual entries, isolation.
-- Same pattern as isolation.sql: one DO block, results raised as the error message, everything rolled back.
do $test$
declare
  results text[] := '{}';
  n bigint;
  v uuid;
  r record;
  u_owner uuid := gen_random_uuid(); u_dm uuid := gen_random_uuid(); u_sup uuid := gen_random_uuid();
  u_s1 uuid := gen_random_uuid(); u_s2 uuid := gen_random_uuid(); u_b uuid := gen_random_uuid();
  b_a uuid := gen_random_uuid(); s_a uuid := gen_random_uuid(); d_bar uuid := gen_random_uuid(); d_kit uuid := gen_random_uuid();
  p_owner uuid := gen_random_uuid(); p_dm uuid := gen_random_uuid(); p_sup uuid := gen_random_uuid();
  p_s1 uuid := gen_random_uuid(); p_s2 uuid := gen_random_uuid();
  b_b uuid := gen_random_uuid(); p_b uuid := gen_random_uuid();
  sh uuid := gen_random_uuid(); e1 uuid := gen_random_uuid(); e1open uuid := gen_random_uuid(); e2 uuid := gen_random_uuid();
begin
  insert into auth.users (id, email, aud, role, email_confirmed_at) values
    (u_owner, 'ts-own@test.invalid', 'authenticated', 'authenticated', now()), (u_dm, 'ts-dm@test.invalid', 'authenticated', 'authenticated', now()),
    (u_sup, 'ts-sup@test.invalid', 'authenticated', 'authenticated', now()), (u_s1, 'ts-s1@test.invalid', 'authenticated', 'authenticated', now()),
    (u_s2, 'ts-s2@test.invalid', 'authenticated', 'authenticated', now()), (u_b, 'ts-b@test.invalid', 'authenticated', 'authenticated', now());
  insert into workplace.businesses (id, name) values (b_a, 'A'), (b_b, 'B');
  insert into workplace.sites (id, business_id, name) values (s_a, b_a, 'A1');
  insert into workplace.departments (id, business_id, site_id, name) values (d_bar, b_a, s_a, 'Bar'), (d_kit, b_a, s_a, 'Kitchen');
  insert into workplace.people (id, business_id, user_id, full_name) values
    (p_owner, b_a, u_owner, 'Owner'), (p_dm, b_a, u_dm, 'Bar manager'), (p_sup, b_a, u_sup, 'Bar supervisor'),
    (p_s1, b_a, u_s1, 'Bar staff'), (p_s2, b_a, u_s2, 'Kitchen staff'), (p_b, b_b, u_b, 'B owner');
  insert into workplace.person_departments (person_id, department_id, business_id) values
    (p_dm, d_bar, b_a), (p_sup, d_bar, b_a), (p_s1, d_bar, b_a), (p_s2, d_kit, b_a);
  insert into workplace.role_assignments (business_id, person_id, role) values
    (b_a, p_owner, 'owner'), (b_a, p_s1, 'staff'), (b_a, p_s2, 'staff'), (b_b, p_b, 'owner');
  insert into workplace.role_assignments (business_id, person_id, role, department_id) values
    (b_a, p_dm, 'department_manager', d_bar), (b_a, p_sup, 'supervisor', d_bar);
  insert into workplace.person_details (person_id, business_id, payroll_id) values (p_s1, b_a, 'BR001');
  insert into workplace.person_pay (person_id, business_id, hourly_rate_pence, effective_from) values (p_s1, b_a, 1221, '2026-04-01');
  -- Bar staff: clocked in 10 min before a 17:00-23:00 (UK 18:00-00:00 BST) shift with a 30 min break; plus an open clock-in.
  insert into workplace.shifts (id, business_id, site_id, department_id, person_id, starts_at, ends_at, published_at)
    values (sh, b_a, s_a, d_bar, p_s1, '2026-10-05 16:00Z', '2026-10-05 22:00Z', now());
  insert into workplace.clock_events (id, business_id, person_id, site_id, shift_id, in_method, out_method, clock_in_at, clock_out_at) values
    (e1, b_a, p_s1, s_a, sh, 'phone', 'phone', '2026-10-05 15:50Z', '2026-10-05 22:00Z'),
    (e2, b_a, p_s2, s_a, null, 'kiosk', 'kiosk', '2026-10-05 08:00Z', '2026-10-05 16:00Z');
  insert into workplace.clock_events (id, business_id, person_id, site_id, in_method, clock_in_at) values
    (e1open, b_a, p_s1, s_a, 'phone', '2026-10-06 16:00Z');
  insert into workplace.clock_breaks (business_id, clock_event_id, started_at, ended_at) values
    (b_a, e1, '2026-10-05 19:00Z', '2026-10-05 19:30Z');

  perform set_config('request.jwt.claims', json_build_object('sub', u_owner, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from workplace.timesheet_rows(b_a, '2026-10-05', '2026-10-11');
  results := array_append(results, (case when n = 3 then 'PASS' else 'FAIL' end || ' S1 owner sees all 3 clock-ins (' || n || ')')::text);
  select * into r from workplace.timesheet_rows(b_a, '2026-10-05', '2026-10-11') where event_id = e1;
  results := array_append(results, (case when r.paid_minutes = 330 and r.break_minutes = 30 and r.hourly_rate_pence = 1221
      and r.payroll_id = 'BR001' and r.department_name = 'Bar' and r.work_date = '2026-10-05' then 'PASS' else 'FAIL' end
    || ' S2 row has paid 330 min, 30 min break, rate, payroll ID and department ('
    || r.paid_minutes || ', ' || r.break_minutes || ', ' || coalesce(r.hourly_rate_pence::text, 'null') || ')')::text);
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub', u_dm, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from workplace.timesheet_rows(b_a, '2026-10-05', '2026-10-11') where person_id = p_s2;
  results := array_append(results, (case when n = 0 then 'PASS' else 'FAIL' end || ' S3 Bar manager does not see Kitchen timesheets')::text);
  select * into r from workplace.timesheet_rows(b_a, '2026-10-05', '2026-10-11') where event_id = e1;
  results := array_append(results, (case when r.event_id is not null and r.hourly_rate_pence is null and r.payroll_id = 'BR001' then 'PASS' else 'FAIL' end
    || ' S4 Bar manager sees Bar hours and payroll ID but not the pay rate')::text);
  n := workplace.approve_clock_events(array[e1, e1open, e2]);
  results := array_append(results, (case when n = 1 then 'PASS' else 'FAIL' end
    || ' S5 Bar manager approves the closed Bar clock-in only, not the open one or Kitchen (' || n || ')')::text);
  select count(*) into n from workplace.clock_events where id = e1 and approved_by = p_dm;
  results := array_append(results, (case when n = 1 then 'PASS' else 'FAIL' end || ' S6 approval recorded')::text);
  select count(*) into n from workplace.activity_log where business_id = b_a and action = 'timesheets.approved';
  results := array_append(results, (case when n = 0 then 'PASS' else 'FAIL' end || ' S7 department manager cannot read the activity log')::text);
  -- The 6 Oct clock-in is still open, so it overlaps anything later; close it first.
  execute 'reset role';
  update workplace.clock_events set clock_out_at = '2026-10-06 22:00Z' where id = e1open;
  execute 'set local role authenticated';
  begin
    v := workplace.add_clock_event(b_a, p_s1, s_a, '2026-10-07 16:00Z', '2026-10-07 22:00Z', 30, 'Phone died, worked the shift');
    select paid_minutes into n from workplace.timesheet_rows(b_a, '2026-10-05', '2026-10-11') where event_id = v;
    results := array_append(results, (case when n = 330 then 'PASS' else 'FAIL' end || ' S8 Bar manager adds a missed clock-in (' || n || ' paid min)')::text);
  exception when others then
    results := array_append(results, ('FAIL S8 could not add a missed clock-in (' || sqlerrm || ')')::text);
  end;
  begin
    perform workplace.add_clock_event(b_a, p_s1, s_a, '2026-10-07 18:00Z', '2026-10-07 20:00Z', 0, 'Dup');
    results := array_append(results, 'FAIL S9 overlapping clock-in added'::text);
  exception when others then
    results := array_append(results, ('PASS S9 overlapping clock-in refused (' || sqlerrm || ')')::text);
  end;
  begin
    perform workplace.add_clock_event(b_a, p_s2, s_a, '2026-10-07 08:00Z', '2026-10-07 16:00Z', 0, 'Forgot');
    results := array_append(results, 'FAIL S10 Bar manager added Kitchen hours'::text);
  exception when others then
    results := array_append(results, ('PASS S10 Bar manager cannot add Kitchen hours (' || sqlerrm || ')')::text);
  end;
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub', u_sup, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  n := workplace.approve_clock_events(array[e1open]);
  results := array_append(results, (case when n = 0 then 'PASS' else 'FAIL' end || ' S11 supervisor cannot approve timesheets')::text);
  perform workplace.fix_clock_event(e1, '2026-10-05 16:00Z', '2026-10-05 22:30Z', 'Stayed to cash up');
  execute 'reset role';
  select count(*) into n from workplace.clock_events where id = e1 and approved_at is null;
  results := array_append(results, (case when n = 1 then 'PASS' else 'FAIL' end || ' S12 a fix after approval needs approving again')::text);

  perform set_config('request.jwt.claims', json_build_object('sub', u_s1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from workplace.timesheet_rows(b_a, '2026-10-05', '2026-10-11') where person_id <> p_s1;
  results := array_append(results, (case when n = 0 then 'PASS' else 'FAIL' end || ' S13 staff see only their own timesheet')::text);
  n := workplace.approve_clock_events(array[e1]);
  results := array_append(results, (case when n = 0 then 'PASS' else 'FAIL' end || ' S14 staff cannot approve their own hours')::text);
  begin
    perform workplace.add_clock_event(b_a, p_s1, s_a, '2026-10-08 16:00Z', '2026-10-08 22:00Z', 0, 'Trust me');
    results := array_append(results, 'FAIL S15 staff added their own hours'::text);
  exception when others then
    results := array_append(results, ('PASS S15 staff cannot add hours (' || sqlerrm || ')')::text);
  end;
  begin
    perform workplace.unapprove_clock_event(e1);
    results := array_append(results, 'FAIL S16 staff unapproved hours'::text);
  exception when others then
    results := array_append(results, ('PASS S16 staff cannot unapprove (' || sqlerrm || ')')::text);
  end;
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub', u_b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from workplace.timesheet_rows(b_a, '2026-10-01', '2026-10-31');
  results := array_append(results, (case when n = 0 then 'PASS' else 'FAIL' end || ' S17 another business sees none of A''s timesheets')::text);
  n := workplace.approve_clock_events(array[e1, e2]);
  results := array_append(results, (case when n = 0 then 'PASS' else 'FAIL' end || ' S18 another business cannot approve A''s hours')::text);
  begin
    perform workplace.add_clock_event(b_a, p_s1, s_a, '2026-10-09 16:00Z', '2026-10-09 22:00Z', 0, 'x');
    results := array_append(results, 'FAIL S19 outsider added hours'::text);
  exception when others then
    results := array_append(results, ('PASS S19 outsider cannot add hours (' || sqlerrm || ')')::text);
  end;
  begin
    perform workplace.unapprove_clock_event(e2);
    results := array_append(results, 'FAIL S20 outsider unapproved hours'::text);
  exception when others then
    results := array_append(results, ('PASS S20 outsider cannot unapprove (' || sqlerrm || ')')::text);
  end;
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub', u_owner, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  n := workplace.approve_clock_events(array[e1, e2]);
  results := array_append(results, (case when n = 2 then 'PASS' else 'FAIL' end || ' S21 owner approves across departments (' || n || ')')::text);
  select count(*) into n from workplace.activity_log where business_id = b_a and action = 'timesheets.approved';
  results := array_append(results, (case when n = 2 then 'PASS' else 'FAIL' end || ' S22 approvals are in the activity log (' || n || ')')::text);
  execute 'reset role';

  execute 'set local role anon';
  begin
    perform * from workplace.timesheet_rows(b_a, '2026-10-01', '2026-10-31');
    results := array_append(results, 'FAIL S23 anon read timesheets'::text);
  exception when others then
    results := array_append(results, ('PASS S23 anon blocked (' || sqlerrm || ')')::text);
  end;
  execute 'reset role';

  raise exception E'RESULTS (rolled back)\n%', array_to_string(results, E'\n');
end
$test$;
