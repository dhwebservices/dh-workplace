-- DH Workplace time-off tests: UK entitlement, requests, routing, blackouts, isolation.
-- Same pattern as isolation.sql: one DO block, results raised as the error message, everything rolled back.
-- Holiday year runs January to December; balances are checked as at 15 Oct 2026.
do $test$
declare
  results text[] := '{}';
  n bigint;
  x numeric;
  v uuid;
  r record;
  u_owner uuid := gen_random_uuid(); u_ft uuid := gen_random_uuid(); u_dmbar uuid := gen_random_uuid();
  u_dmkit uuid := gen_random_uuid(); u_b uuid := gen_random_uuid();
  b_a uuid := gen_random_uuid(); s_a uuid := gen_random_uuid(); d_bar uuid := gen_random_uuid(); d_kit uuid := gen_random_uuid();
  p_owner uuid := gen_random_uuid(); p_ft uuid := gen_random_uuid(); p_six uuid := gen_random_uuid(); p_pt uuid := gen_random_uuid();
  p_new uuid := gen_random_uuid(); p_zero uuid := gen_random_uuid(); p_dmbar uuid := gen_random_uuid(); p_dmkit uuid := gen_random_uuid();
  b_b uuid := gen_random_uuid(); p_b uuid := gen_random_uuid();
  req uuid; req2 uuid;
  on_day date := '2026-10-15';
begin
  insert into auth.users (id, email, aud, role, email_confirmed_at) values
    (u_owner, 't-own@test.invalid', 'authenticated', 'authenticated', now()), (u_ft, 't-ft@test.invalid', 'authenticated', 'authenticated', now()),
    (u_dmbar, 't-dmbar@test.invalid', 'authenticated', 'authenticated', now()), (u_dmkit, 't-dmkit@test.invalid', 'authenticated', 'authenticated', now()),
    (u_b, 't-b@test.invalid', 'authenticated', 'authenticated', now());
  insert into workplace.businesses (id, name) values (b_a, 'A'), (b_b, 'B');
  insert into workplace.sites (id, business_id, name) values (s_a, b_a, 'A1');
  insert into workplace.departments (id, business_id, site_id, name) values (d_bar, b_a, s_a, 'Bar'), (d_kit, b_a, s_a, 'Kitchen');
  insert into workplace.people (id, business_id, user_id, full_name) values
    (p_owner, b_a, u_owner, 'Owner'), (p_ft, b_a, u_ft, 'Full time'), (p_six, b_a, null, 'Six days'), (p_pt, b_a, null, 'Part time'),
    (p_new, b_a, null, 'July starter'), (p_zero, b_a, null, 'Zero hours'), (p_dmbar, b_a, u_dmbar, 'Bar manager'),
    (p_dmkit, b_a, u_dmkit, 'Kitchen manager'), (p_b, b_b, u_b, 'B owner');
  insert into workplace.person_departments (person_id, department_id, business_id) values
    (p_ft, d_bar, b_a), (p_six, d_bar, b_a), (p_pt, d_kit, b_a), (p_new, d_bar, b_a), (p_zero, d_bar, b_a),
    (p_dmbar, d_bar, b_a), (p_dmkit, d_kit, b_a);
  insert into workplace.role_assignments (business_id, person_id, role) values (b_a, p_owner, 'owner'), (b_a, p_ft, 'staff'), (b_b, p_b, 'owner');
  insert into workplace.role_assignments (business_id, person_id, role, department_id) values
    (b_a, p_dmbar, 'department_manager', d_bar), (b_a, p_dmkit, 'department_manager', d_kit);
  insert into workplace.person_details (person_id, business_id, contract_type, weekly_hours, days_per_week, start_date) values
    (p_ft, b_a, 'full_time', 40, 5, '2020-01-01'), (p_six, b_a, 'full_time', 48, 6, '2020-01-01'),
    (p_pt, b_a, 'part_time', 24, 3, '2020-01-01'), (p_new, b_a, 'full_time', 40, 5, '2026-07-01'),
    (p_zero, b_a, 'zero_hours', null, null, '2025-01-01');
  -- Zero hours: ten 10-hour days worked this year = 100 paid hours.
  insert into workplace.clock_events (business_id, person_id, site_id, in_method, clock_in_at, clock_out_at)
    select b_a, p_zero, s_a, 'phone', g, g + interval '10 hours'
    from generate_series(timestamptz '2026-03-02 09:00Z', '2026-03-11 09:00Z', interval '1 day') g;

  -- ── Entitlement (as the owner) ──
  perform set_config('request.jwt.claims', json_build_object('sub', u_owner, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select * into r from workplace.holiday_balance(b_a, p_ft, on_day);
  results := array_append(results, (case when r.entitlement_hours = 224 and r.hours_per_day = 8 and r.year_start = '2026-01-01' then 'PASS' else 'FAIL' end
    || ' T1 full time 40h over 5 days gets 5.6 weeks = 224h (' || r.entitlement_hours || 'h)')::text);
  select * into r from workplace.holiday_balance(b_a, p_six, on_day);
  results := array_append(results, (case when r.entitlement_hours = 224 then 'PASS' else 'FAIL' end
    || ' T2 six-day worker capped at 28 days = 224h (' || r.entitlement_hours || 'h)')::text);
  select * into r from workplace.holiday_balance(b_a, p_pt, on_day);
  results := array_append(results, (case when r.entitlement_hours = 134.4 then 'PASS' else 'FAIL' end
    || ' T3 part time 24h over 3 days gets 134.4h (' || r.entitlement_hours || 'h)')::text);
  select * into r from workplace.holiday_balance(b_a, p_new, on_day);
  results := array_append(results, (case when r.entitlement_hours = 112.92 then 'PASS' else 'FAIL' end
    || ' T4 1 July starter gets 184/365 of 224h = 112.92h (' || r.entitlement_hours || 'h)')::text);
  select * into r from workplace.holiday_balance(b_a, p_zero, on_day);
  results := array_append(results, (case when r.entitlement_hours = 12.07 and r.method = 'accrued' then 'PASS' else 'FAIL' end
    || ' T5 zero hours accrues 12.07% of 100h worked = 12.07h (' || r.entitlement_hours || 'h)')::text);
  execute 'reset role';

  -- ── Requests (as the full-time Bar member) ──
  perform set_config('request.jwt.claims', json_build_object('sub', u_ft, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  req := workplace.request_time_off(b_a, '2026-11-16', '2026-11-20', 'holiday', 'Family holiday');
  select hours into x from workplace.time_off_requests where id = req;
  results := array_append(results, (case when x = 40 then 'PASS' else 'FAIL' end || ' T6 Mon-Fri off with no rota = 5 days x 8h = 40h (' || x || 'h)')::text);
  begin
    perform workplace.request_time_off(b_a, '2026-11-20', '2026-11-23');
    results := array_append(results, 'FAIL T7 overlapping request accepted'::text);
  exception when others then
    results := array_append(results, ('PASS T7 overlapping request refused (' || sqlerrm || ')')::text);
  end;
  begin
    perform workplace.request_time_off(b_a, '2026-12-01', '2026-12-31', 'holiday', null, 300);
    results := array_append(results, 'FAIL T8 request over the balance accepted'::text);
  exception when others then
    results := array_append(results, ('PASS T8 request over the balance refused (' || sqlerrm || ')')::text);
  end;
  begin
    insert into workplace.time_off_requests (business_id, person_id, starts_on, ends_on, status) values (b_a, p_ft, '2026-12-01', '2026-12-01', 'approved');
    results := array_append(results, 'FAIL T9 staff inserted an approved request directly'::text);
  exception when others then
    results := array_append(results, ('PASS T9 no direct inserts (' || sqlerrm || ')')::text);
  end;
  begin
    perform workplace.decide_time_off(req, true);
    results := array_append(results, 'FAIL T10 staff approved their own request'::text);
  exception when others then
    results := array_append(results, ('PASS T10 staff cannot approve (' || sqlerrm || ')')::text);
  end;
  begin
    perform workplace.holiday_balance(b_a, p_pt, on_day);
    results := array_append(results, 'FAIL T11 staff read a colleague''s balance'::text);
  exception when others then
    results := array_append(results, ('PASS T11 staff cannot see colleagues'' balances (' || sqlerrm || ')')::text);
  end;
  begin
    insert into workplace.time_off_blackouts (business_id, starts_on, ends_on) values (b_a, '2026-12-24', '2026-12-26');
    results := array_append(results, 'FAIL T12 staff added a blackout'::text);
  exception when others then
    results := array_append(results, ('PASS T12 staff cannot add blackouts (' || sqlerrm || ')')::text);
  end;
  update workplace.person_details set phone = '07700900123' where person_id = p_ft;
  get diagnostics n = row_count;
  results := array_append(results, (case when n = 1 then 'PASS' else 'FAIL' end || ' T13 staff can still edit their own phone number')::text);
  begin
    update workplace.person_details set weekly_hours = 60 where person_id = p_ft;
    results := array_append(results, 'FAIL T14 staff raised their own contracted hours'::text);
  exception when others then
    results := array_append(results, ('PASS T14 staff cannot change their contract hours (' || sqlerrm || ')')::text);
  end;
  execute 'reset role';

  -- ── Routing: Kitchen manager can't see or decide a Bar request; Bar manager can ──
  perform set_config('request.jwt.claims', json_build_object('sub', u_dmkit, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from workplace.time_off_requests where id = req;
  results := array_append(results, (case when n = 0 then 'PASS' else 'FAIL' end || ' T15 Kitchen manager does not see Bar requests')::text);
  begin
    perform workplace.decide_time_off(req, true);
    results := array_append(results, 'FAIL T16 Kitchen manager approved a Bar request'::text);
  exception when others then
    results := array_append(results, ('PASS T16 Kitchen manager cannot approve Bar requests (' || sqlerrm || ')')::text);
  end;
  begin
    insert into workplace.time_off_blackouts (business_id, department_id, starts_on, ends_on, reason) values (b_a, d_bar, '2026-12-24', '2026-12-26', 'Christmas');
    results := array_append(results, 'FAIL T17 Kitchen manager blocked Bar dates'::text);
  exception when others then
    results := array_append(results, ('PASS T17 Kitchen manager cannot block Bar dates (' || sqlerrm || ')')::text);
  end;
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub', u_dmbar, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from workplace.time_off_requests where id = req and status = 'pending';
  results := array_append(results, (case when n = 1 then 'PASS' else 'FAIL' end || ' T18 Bar manager sees the Bar request')::text);
  perform workplace.decide_time_off(req, true, 'Enjoy it');
  select count(*) into n from workplace.time_off_requests where id = req and status = 'approved' and decided_by = p_dmbar;
  results := array_append(results, (case when n = 1 then 'PASS' else 'FAIL' end || ' T19 Bar manager approves it')::text);
  begin
    perform workplace.decide_time_off(req, false);
    results := array_append(results, 'FAIL T20 decided twice'::text);
  exception when others then
    results := array_append(results, ('PASS T20 cannot decide twice (' || sqlerrm || ')')::text);
  end;
  select * into r from workplace.holiday_balance(b_a, p_ft, on_day);
  results := array_append(results, (case when r.booked_hours = 40 and r.remaining_hours = 184 then 'PASS' else 'FAIL' end
    || ' T21 balance shows 40h booked, 184h left (' || r.remaining_hours || 'h)')::text);
  begin
    insert into workplace.time_off_blackouts (business_id, department_id, starts_on, ends_on, reason) values (b_a, d_bar, '2026-12-24', '2026-12-26', 'Christmas');
    results := array_append(results, 'PASS T22 Bar manager blocks Christmas for the Bar'::text);
  exception when others then
    results := array_append(results, ('FAIL T22 Bar manager could not add a blackout (' || sqlerrm || ')')::text);
  end;
  begin
    insert into workplace.time_off_blackouts (business_id, starts_on, ends_on) values (b_a, '2026-12-31', '2026-12-31');
    results := array_append(results, 'FAIL T23 department manager blocked the whole business'::text);
  exception when others then
    results := array_append(results, ('PASS T23 department manager cannot block the whole business (' || sqlerrm || ')')::text);
  end;
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub', u_ft, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform workplace.request_time_off(b_a, '2026-12-23', '2026-12-24', 'holiday');
    results := array_append(results, 'FAIL T24 holiday booked in a blackout'::text);
  exception when others then
    results := array_append(results, ('PASS T24 blackout dates refused (' || sqlerrm || ')')::text);
  end;
  req2 := workplace.request_time_off(b_a, '2026-12-24', '2026-12-24', 'sick', 'Flu');
  results := array_append(results, 'PASS T25 sickness can still be logged in a blackout'::text);
  perform workplace.cancel_time_off(req2);
  select count(*) into n from workplace.time_off_requests where id = req2 and status = 'cancelled';
  results := array_append(results, (case when n = 1 then 'PASS' else 'FAIL' end || ' T26 staff cancel their own request')::text);
  execute 'reset role';

  -- Hours come from the rota when there are shifts: a 6h and a 9h shift with 30 min break = 14.5h.
  insert into workplace.shifts (business_id, site_id, department_id, person_id, starts_at, ends_at, break_minutes) values
    (b_a, s_a, d_bar, p_ft, '2026-11-02 17:00Z', '2026-11-02 23:00Z', 0),
    (b_a, s_a, d_bar, p_ft, '2026-11-03 09:00Z', '2026-11-03 18:00Z', 30);
  execute 'set local role authenticated';
  req2 := workplace.request_time_off(b_a, '2026-11-02', '2026-11-04', 'holiday');
  select hours into x from workplace.time_off_requests where id = req2;
  results := array_append(results, (case when x = 14.5 then 'PASS' else 'FAIL' end || ' T27 hours taken from the rota (' || x || 'h)')::text);
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub', u_b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from workplace.time_off_requests where business_id = b_a;
  results := array_append(results, (case when n = 0 then 'PASS' else 'FAIL' end || ' T28 another business sees none of A''s requests')::text);
  begin
    perform workplace.holiday_balance(b_a, p_ft, on_day);
    results := array_append(results, 'FAIL T29 outsider read a balance'::text);
  exception when others then
    results := array_append(results, ('PASS T29 outsider cannot read balances (' || sqlerrm || ')')::text);
  end;
  begin
    perform workplace.decide_time_off(req2, true);
    results := array_append(results, 'FAIL T30 outsider approved a request'::text);
  exception when others then
    results := array_append(results, ('PASS T30 outsider cannot approve (' || sqlerrm || ')')::text);
  end;
  begin
    perform workplace.cancel_time_off(req2);
    results := array_append(results, 'FAIL T33 outsider cancelled a request'::text);
  exception when others then
    results := array_append(results, ('PASS T33 outsider cannot cancel (' || sqlerrm || ')')::text);
  end;
  execute 'reset role';

  -- Owner can change contract hours.
  perform set_config('request.jwt.claims', json_build_object('sub', u_owner, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  update workplace.person_details set weekly_hours = 37.5 where person_id = p_ft;
  get diagnostics n = row_count;
  results := array_append(results, (case when n = 1 then 'PASS' else 'FAIL' end || ' T31 owner can change contract hours')::text);
  execute 'reset role';

  -- Part timer on 3 days a week taking Mon-Fri off uses 3 days, not 5.
  x := workplace._time_off_hours(p_pt, '2026-11-16', '2026-11-20');
  results := array_append(results, (case when x = 24 then 'PASS' else 'FAIL' end || ' T34 3-day worker taking a week off uses 3 days x 8h = 24h (' || x || 'h)')::text);

  execute 'set local role anon';
  begin
    perform workplace.request_time_off(b_a, '2026-11-16', '2026-11-20');
    results := array_append(results, 'FAIL T32 anon requested time off'::text);
  exception when others then
    results := array_append(results, ('PASS T32 anon blocked (' || sqlerrm || ')')::text);
  end;
  execute 'reset role';

  raise exception E'RESULTS (rolled back)\n%', array_to_string(results, E'\n');
end
$test$;
