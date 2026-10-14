-- DH Workplace rota, invite and helper tests. Same pattern as isolation.sql:
-- one DO block, results raised as the error message, everything rolled back.
do $test$
declare
  results text[] := '{}';
  n bigint;
  v uuid;
  arr text[];
  u_owner uuid := gen_random_uuid(); u_mgr uuid := gen_random_uuid(); u_dm uuid := gen_random_uuid();
  u_s1 uuid := gen_random_uuid(); u_s2 uuid := gen_random_uuid(); u_b uuid := gen_random_uuid();
  u_inv uuid := gen_random_uuid(); u_unconf uuid := gen_random_uuid();
  b_a uuid := gen_random_uuid(); s_a1 uuid := gen_random_uuid(); s_a2 uuid := gen_random_uuid();
  d_bar uuid := gen_random_uuid(); d_kit uuid := gen_random_uuid(); d_a2 uuid := gen_random_uuid();
  p_owner uuid := gen_random_uuid(); p_mgr uuid := gen_random_uuid(); p_dm uuid := gen_random_uuid();
  p_s1 uuid := gen_random_uuid(); p_s2 uuid := gen_random_uuid();
  b_b uuid := gen_random_uuid(); s_b uuid := gen_random_uuid(); d_b uuid := gen_random_uuid(); p_b uuid := gen_random_uuid();
  t0 timestamptz := date_trunc('week', now()) + interval '7 days';
begin
  insert into auth.users (id, email, aud, role, email_confirmed_at) values
    (u_owner, 'own@test.invalid', 'authenticated', 'authenticated', now()), (u_mgr, 'mgr@test.invalid', 'authenticated', 'authenticated', now()),
    (u_dm, 'dm@test.invalid', 'authenticated', 'authenticated', now()), (u_s1, 's1@test.invalid', 'authenticated', 'authenticated', now()),
    (u_s2, 's2@test.invalid', 'authenticated', 'authenticated', now()), (u_b, 'b@test.invalid', 'authenticated', 'authenticated', now()),
    (u_inv, 'newstarter@test.invalid', 'authenticated', 'authenticated', now()),
    (u_unconf, 'unconfirmed@test.invalid', 'authenticated', 'authenticated', null);
  insert into workplace.businesses (id, name) values (b_a, 'A'), (b_b, 'B');
  insert into workplace.sites (id, business_id, name) values (s_a1, b_a, 'A1'), (s_a2, b_a, 'A2'), (s_b, b_b, 'B1');
  insert into workplace.departments (id, business_id, site_id, name) values
    (d_bar, b_a, s_a1, 'Bar'), (d_kit, b_a, s_a1, 'Kitchen'), (d_a2, b_a, s_a2, 'Bar'), (d_b, b_b, s_b, 'Bar');
  insert into workplace.people (id, business_id, user_id, full_name) values
    (p_owner, b_a, u_owner, 'Owner'), (p_mgr, b_a, u_mgr, 'Manager'), (p_dm, b_a, u_dm, 'Bar manager'),
    (p_s1, b_a, u_s1, 'Bar staff'), (p_s2, b_a, u_s2, 'Kitchen staff'), (p_b, b_b, u_b, 'B owner');
  insert into workplace.person_departments (person_id, department_id, business_id) values
    (p_s1, d_bar, b_a), (p_s2, d_kit, b_a), (p_dm, d_bar, b_a);
  insert into workplace.role_assignments (business_id, person_id, role) values (b_a, p_owner, 'owner'), (b_a, p_s1, 'staff'), (b_a, p_s2, 'staff'), (b_b, p_b, 'owner');
  insert into workplace.role_assignments (business_id, person_id, role, site_id) values (b_a, p_mgr, 'manager', s_a1);
  insert into workplace.role_assignments (business_id, person_id, role, department_id) values (b_a, p_dm, 'department_manager', d_bar);

  -- dept manager builds the Bar rota
  perform set_config('request.jwt.claims', json_build_object('sub', u_dm, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    insert into workplace.shifts (business_id, site_id, department_id, person_id, starts_at, ends_at)
      values (b_a, s_a1, d_bar, p_s1, t0 + interval '17 hours', t0 + interval '23 hours');
    results := array_append(results, 'PASS R1 dept manager adds a Bar shift'::text);
  exception when others then
    results := array_append(results, ('FAIL R1 dept manager could not add a Bar shift (' || sqlerrm || ')')::text);
  end;
  begin
    insert into workplace.shifts (business_id, site_id, department_id, person_id, starts_at, ends_at)
      values (b_a, s_a1, d_kit, p_s2, t0 + interval '11 hours', t0 + interval '19 hours');
    results := array_append(results, 'FAIL R2 dept manager added a Kitchen shift'::text);
  exception when others then
    results := array_append(results, ('PASS R2 dept manager cannot add Kitchen shifts (' || sqlerrm || ')')::text);
  end;
  execute 'reset role';

  -- site manager builds Kitchen but not site A2
  perform set_config('request.jwt.claims', json_build_object('sub', u_mgr, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  insert into workplace.shifts (business_id, site_id, department_id, person_id, starts_at, ends_at)
    values (b_a, s_a1, d_kit, p_s2, t0 + interval '11 hours', t0 + interval '19 hours');
  begin
    insert into workplace.shifts (business_id, site_id, department_id, starts_at, ends_at)
      values (b_a, s_a2, d_a2, t0 + interval '11 hours', t0 + interval '19 hours');
    results := array_append(results, 'FAIL R3 site manager added a shift in another site'::text);
  exception when others then
    results := array_append(results, ('PASS R3 site manager cannot add shifts in another site (' || sqlerrm || ')')::text);
  end;
  begin
    insert into workplace.shifts (business_id, site_id, department_id, starts_at, ends_at)
      values (b_a, s_a1, d_a2, t0 + interval '11 hours', t0 + interval '19 hours');
    results := array_append(results, 'FAIL R4 shift accepted with a department from another site'::text);
  exception when others then
    results := array_append(results, ('PASS R4 department must belong to the shift site (' || sqlerrm || ')')::text);
  end;
  execute 'reset role';

  -- staff can't write, and can't see drafts (even their own)
  perform set_config('request.jwt.claims', json_build_object('sub', u_s1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    insert into workplace.shifts (business_id, site_id, department_id, person_id, starts_at, ends_at)
      values (b_a, s_a1, d_bar, p_s1, t0 + interval '30 hours', t0 + interval '36 hours');
    results := array_append(results, 'FAIL R5 staff added a shift'::text);
  exception when others then
    results := array_append(results, ('PASS R5 staff cannot add shifts (' || sqlerrm || ')')::text);
  end;
  select count(*) into n from workplace.shifts;
  results := array_append(results, (case when n = 0 then 'PASS' else 'FAIL' end || ' R6 staff see no draft shifts, not even their own (got ' || n || ')')::text);
  execute 'reset role';

  -- dept manager publishes: only Bar goes live
  perform set_config('request.jwt.claims', json_build_object('sub', u_dm, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select workplace.publish_shifts(b_a, t0, t0 + interval '7 days') into n;
  results := array_append(results, (case when n = 1 then 'PASS' else 'FAIL' end || ' R7 dept manager publishes only their Bar shift (published ' || n || ')')::text);
  execute 'reset role';
  select count(*) into n from workplace.shifts where department_id = d_kit and published_at is null;
  results := array_append(results, (case when n = 1 then 'PASS' else 'FAIL' end || ' R8 Kitchen draft stays a draft')::text);

  perform set_config('request.jwt.claims', json_build_object('sub', u_s1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from workplace.shifts;
  results := array_append(results, (case when n = 1 then 'PASS' else 'FAIL' end || ' R9 Bar staff see the published Bar shift only (got ' || n || ')')::text);
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', u_s2, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from workplace.shifts;
  results := array_append(results, (case when n = 0 then 'PASS' else 'FAIL' end || ' R10 Kitchen staff see no Bar shifts and no Kitchen draft (got ' || n || ')')::text);
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', u_b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from workplace.shifts where business_id = b_a;
  results := array_append(results, (case when n = 0 then 'PASS' else 'FAIL' end || ' R11 another business sees no shifts (got ' || n || ')')::text);
  execute 'reset role';

  -- invites
  perform set_config('request.jwt.claims', json_build_object('sub', u_dm, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform workplace.invite_person(b_a, 'X', 'x@test.invalid', d_bar);
    results := array_append(results, 'FAIL R12 dept manager invited staff without staff.manage'::text);
  exception when others then
    results := array_append(results, ('PASS R12 dept manager cannot invite (' || sqlerrm || ')')::text);
  end;
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', u_mgr, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform workplace.invite_person(b_a, 'Y', 'y@test.invalid', d_a2);
    results := array_append(results, 'FAIL R13 manager invited into another site'::text);
  exception when others then
    results := array_append(results, ('PASS R13 manager cannot invite into another site (' || sqlerrm || ')')::text);
  end;
  select workplace.invite_person(b_a, 'New Starter', 'NewStarter@test.invalid', d_bar, 'part_time') into v;
  results := array_append(results, (case when v is not null then 'PASS' else 'FAIL' end || ' R14 manager invites a new starter into Bar')::text);
  select workplace.invite_person(b_a, 'Not Confirmed', 'unconfirmed@test.invalid', d_bar) into v;
  arr := workplace.my_permissions(b_a);
  results := array_append(results, (case when 'rota.edit' = any(arr) and not ('pay.view' = any(arr)) then 'PASS' else 'FAIL' end || ' R15 my_permissions reflects manager role')::text);
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub', u_inv, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select workplace.claim_invites() into n;
  results := array_append(results, (case when n = 1 then 'PASS' else 'FAIL' end || ' R16 confirmed email claims its invite (claimed ' || n || ')')::text);
  select count(*) into n from workplace.shifts;
  results := array_append(results, (case when n = 1 then 'PASS' else 'FAIL' end || ' R17 new starter now sees the published Bar rota (got ' || n || ')')::text);
  select count(*) into n from workplace.my_businesses();
  results := array_append(results, (case when n = 1 then 'PASS' else 'FAIL' end || ' R18 my_businesses lists the new business')::text);
  arr := workplace.my_permissions(b_a);
  results := array_append(results, (case when cardinality(arr) = 0 then 'PASS' else 'FAIL' end || ' R19 staff have no management permissions')::text);
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub', u_unconf, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select workplace.claim_invites() into n;
  results := array_append(results, (case when n = 0 then 'PASS' else 'FAIL' end || ' R20 unconfirmed email cannot claim an invite')::text);
  execute 'reset role';

  execute 'set local role anon';
  begin
    perform workplace.my_businesses();
    results := array_append(results, 'FAIL R21 anon called my_businesses'::text);
  exception when others then
    results := array_append(results, ('PASS R21 anon blocked (' || sqlerrm || ')')::text);
  end;
  execute 'reset role';

  raise exception E'RESULTS (rolled back)\n%', array_to_string(results, E'\n');
end
$test$;
