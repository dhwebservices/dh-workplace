-- DH Workplace tenant isolation and permission tests.
-- Runs entirely inside one DO block that ends by raising the results as an exception,
-- so every row it creates is rolled back. Run it with any SQL client as the postgres role:
-- the "error" message IS the report (look for "RESULTS" and any "FAIL").

do $test$
declare
  results text[] := '{}';
  n bigint;
  ok boolean;
  -- users
  u_a_owner uuid := gen_random_uuid();
  u_a_mgr uuid := gen_random_uuid();
  u_a_dm uuid := gen_random_uuid();
  u_a_staff1 uuid := gen_random_uuid();
  u_a_staff2 uuid := gen_random_uuid();
  u_b_owner uuid := gen_random_uuid();
  u_none uuid := gen_random_uuid();
  -- business A
  b_a uuid := gen_random_uuid();
  s_a1 uuid := gen_random_uuid();
  s_a2 uuid := gen_random_uuid();
  d_a1_bar uuid := gen_random_uuid();
  d_a1_kit uuid := gen_random_uuid();
  d_a2_bar uuid := gen_random_uuid();
  p_a_owner uuid := gen_random_uuid();
  p_a_mgr uuid := gen_random_uuid();
  p_a_dm uuid := gen_random_uuid();
  p_a_staff1 uuid := gen_random_uuid();
  p_a_staff2 uuid := gen_random_uuid();
  ra_a_owner uuid := gen_random_uuid();
  -- business B
  b_b uuid := gen_random_uuid();
  s_b1 uuid := gen_random_uuid();
  d_b1_bar uuid := gen_random_uuid();
  p_b_owner uuid := gen_random_uuid();
  r record;
begin
  -- ── Setup (as postgres, RLS bypassed as table owner) ──
  insert into auth.users (id, email, aud, role) values
    (u_a_owner, 'a-owner@test.invalid', 'authenticated', 'authenticated'),
    (u_a_mgr, 'a-mgr@test.invalid', 'authenticated', 'authenticated'),
    (u_a_dm, 'a-dm@test.invalid', 'authenticated', 'authenticated'),
    (u_a_staff1, 'a-staff1@test.invalid', 'authenticated', 'authenticated'),
    (u_a_staff2, 'a-staff2@test.invalid', 'authenticated', 'authenticated'),
    (u_b_owner, 'b-owner@test.invalid', 'authenticated', 'authenticated'),
    (u_none, 'none@test.invalid', 'authenticated', 'authenticated');

  insert into workplace.businesses (id, name) values (b_a, 'Test A'), (b_b, 'Test B');
  insert into workplace.sites (id, business_id, name) values (s_a1, b_a, 'A1'), (s_a2, b_a, 'A2'), (s_b1, b_b, 'B1');
  insert into workplace.departments (id, business_id, site_id, name) values
    (d_a1_bar, b_a, s_a1, 'Bar'), (d_a1_kit, b_a, s_a1, 'Kitchen'), (d_a2_bar, b_a, s_a2, 'Bar'), (d_b1_bar, b_b, s_b1, 'Bar');
  insert into workplace.people (id, business_id, user_id, full_name) values
    (p_a_owner, b_a, u_a_owner, 'A Owner'), (p_a_mgr, b_a, u_a_mgr, 'A Manager'), (p_a_dm, b_a, u_a_dm, 'A Bar Manager'),
    (p_a_staff1, b_a, u_a_staff1, 'A Staff Bar'), (p_a_staff2, b_a, u_a_staff2, 'A Staff Kitchen'),
    (p_b_owner, b_b, u_b_owner, 'B Owner');
  insert into workplace.person_details (person_id, business_id, email) values
    (p_a_owner, b_a, 'o'), (p_a_mgr, b_a, 'm'), (p_a_dm, b_a, 'd'), (p_a_staff1, b_a, 's1'), (p_a_staff2, b_a, 's2'), (p_b_owner, b_b, 'b');
  insert into workplace.person_pay (person_id, business_id, hourly_rate_pence) values
    (p_a_staff1, b_a, 1200), (p_a_staff2, b_a, 1250), (p_b_owner, b_b, 2000);
  insert into workplace.person_departments (person_id, department_id, business_id) values
    (p_a_staff1, d_a1_bar, b_a), (p_a_staff2, d_a1_kit, b_a), (p_a_dm, d_a1_bar, b_a);
  insert into workplace.role_assignments (id, business_id, person_id, role) values (ra_a_owner, b_a, p_a_owner, 'owner');
  insert into workplace.role_assignments (business_id, person_id, role, site_id) values (b_a, p_a_mgr, 'manager', s_a1);
  insert into workplace.role_assignments (business_id, person_id, role, department_id) values (b_a, p_a_dm, 'department_manager', d_a1_bar);
  insert into workplace.role_assignments (business_id, person_id, role) values
    (b_a, p_a_staff1, 'staff'), (b_a, p_a_staff2, 'staff'), (b_b, p_b_owner, 'owner');
  insert into workplace.activity_log (business_id, action) values (b_a, 'test.a'), (b_b, 'test.b');

  -- ── 1. Business A owner cannot read anything of business B ──
  perform set_config('request.jwt.claims', json_build_object('sub', u_a_owner, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select (select count(*) from workplace.businesses where id = b_b)
       + (select count(*) from workplace.sites where business_id = b_b)
       + (select count(*) from workplace.departments where business_id = b_b)
       + (select count(*) from workplace.people where business_id = b_b)
       + (select count(*) from workplace.person_details where business_id = b_b)
       + (select count(*) from workplace.person_pay where business_id = b_b)
       + (select count(*) from workplace.person_departments where business_id = b_b)
       + (select count(*) from workplace.role_assignments where business_id = b_b)
       + (select count(*) from workplace.permission_grants where business_id = b_b)
       + (select count(*) from workplace.activity_log where business_id = b_b) into n;
  results := array_append(results, (case when n = 0 then 'PASS' else 'FAIL' end || ' 1a A owner sees 0 rows of B across all tables (got ' || n || ')')::text);
  select count(*) into n from workplace.people where business_id = b_a;
  results := array_append(results, (case when n = 5 then 'PASS' else 'FAIL' end || ' 1b A owner sees own 5 people (got ' || n || ')')::text);
  update workplace.sites set name = 'hacked' where business_id = b_b;
  get diagnostics n = row_count;
  results := array_append(results, (case when n = 0 then 'PASS' else 'FAIL' end || ' 1c A owner cannot update B sites')::text);
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub', u_b_owner, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select (select count(*) from workplace.businesses where id = b_a)
       + (select count(*) from workplace.people where business_id = b_a)
       + (select count(*) from workplace.person_pay where business_id = b_a)
       + (select count(*) from workplace.activity_log where business_id = b_a) into n;
  results := array_append(results, (case when n = 0 then 'PASS' else 'FAIL' end || ' 1d B owner sees 0 rows of A (got ' || n || ')')::text);
  execute 'reset role';

  -- ── 2. Staff only see their own details and pay ──
  perform set_config('request.jwt.claims', json_build_object('sub', u_a_staff1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from workplace.person_details;
  results := array_append(results, (case when n = 1 then 'PASS' else 'FAIL' end || ' 2a staff sees only own details (got ' || n || ')')::text);
  select count(*) into n from workplace.person_pay;
  results := array_append(results, (case when n = 1 then 'PASS' else 'FAIL' end || ' 2b staff sees only own pay (got ' || n || ')')::text);
  select count(*) into n from workplace.people;
  results := array_append(results, (case when n = 5 then 'PASS' else 'FAIL' end || ' 2c staff sees colleague names (got ' || n || ')')::text);
  update workplace.person_pay set hourly_rate_pence = 99999 where person_id = p_a_staff1;
  get diagnostics n = row_count;
  results := array_append(results, (case when n = 0 then 'PASS' else 'FAIL' end || ' 2d staff cannot change own pay')::text);
  select count(*) into n from workplace.activity_log;
  results := array_append(results, (case when n = 0 then 'PASS' else 'FAIL' end || ' 2e staff cannot read activity log')::text);
  begin
    perform workplace.assign_role(p_a_staff1, 'manager', s_a1);
    results := array_append(results, 'FAIL 2f staff promoted themselves to manager'::text);
  exception when others then
    results := array_append(results, ('PASS 2f staff cannot self-promote (' || sqlerrm || ')')::text);
  end;
  execute 'reset role';

  -- ── 3. Manager of site A1 cannot act on site A2 ──
  perform set_config('request.jwt.claims', json_build_object('sub', u_a_mgr, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  results := array_append(results, (case when workplace.has_perm(b_a, 'rota.edit', s_a1) and not workplace.has_perm(b_a, 'rota.edit', s_a2)
                              then 'PASS' else 'FAIL' end || ' 3a manager has rota.edit on A1 only')::text);
  results := array_append(results, (case when workplace.has_perm(b_a, 'rota.edit', null, d_a1_kit) and not workplace.has_perm(b_a, 'rota.edit', null, d_a2_bar)
                              then 'PASS' else 'FAIL' end || ' 3b manager covers A1 departments, not A2 departments')::text);
  update workplace.sites set name = 'renamed' where id = s_a2;
  get diagnostics n = row_count;
  results := array_append(results, (case when n = 0 then 'PASS' else 'FAIL' end || ' 3c manager cannot edit site A2')::text);
  update workplace.departments set name = 'Bar 2' where id = d_a2_bar;
  get diagnostics n = row_count;
  results := array_append(results, (case when n = 0 then 'PASS' else 'FAIL' end || ' 3d manager cannot edit A2 departments')::text);
  update workplace.departments set name = 'Main Bar' where id = d_a1_bar;
  get diagnostics n = row_count;
  results := array_append(results, (case when n = 1 then 'PASS' else 'FAIL' end || ' 3e manager can edit A1 departments')::text);
  begin
    perform workplace.assign_role(p_a_staff1, 'supervisor', null, d_a2_bar);
    results := array_append(results, 'FAIL 3f manager assigned a role in site A2'::text);
  exception when others then
    results := array_append(results, ('PASS 3f manager cannot assign roles in A2 (' || sqlerrm || ')')::text);
  end;
  begin
    perform workplace.assign_role(p_a_staff1, 'manager', s_a1);
    results := array_append(results, 'FAIL 3g manager created another manager'::text);
  exception when others then
    results := array_append(results, ('PASS 3g only owner assigns managers (' || sqlerrm || ')')::text);
  end;
  select count(*) into n from workplace.person_pay;
  results := array_append(results, (case when n = 0 then 'PASS' else 'FAIL' end || ' 3h manager cannot see pay by default (got ' || n || ')')::text);
  execute 'reset role';

  -- ── 4. Department manager limited to their department ──
  perform set_config('request.jwt.claims', json_build_object('sub', u_a_dm, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  results := array_append(results, (case when workplace.has_perm(b_a, 'rota.edit', null, d_a1_bar) and not workplace.has_perm(b_a, 'rota.edit', null, d_a1_kit)
                              then 'PASS' else 'FAIL' end || ' 4a dept manager has rota.edit for Bar only')::text);
  results := array_append(results, (case when not workplace.has_perm(b_a, 'rota.edit', s_a1) then 'PASS' else 'FAIL' end || ' 4b dept manager has no site-wide rota.edit')::text);
  select count(*) into n from workplace.person_details where person_id = p_a_staff1;
  results := array_append(results, (case when n = 1 then 'PASS' else 'FAIL' end || ' 4c dept manager sees Bar staff details')::text);
  select count(*) into n from workplace.person_details where person_id = p_a_staff2;
  results := array_append(results, (case when n = 0 then 'PASS' else 'FAIL' end || ' 4d dept manager cannot see Kitchen staff details')::text);
  update workplace.departments set name = 'x' where id = d_a1_bar;
  get diagnostics n = row_count;
  results := array_append(results, (case when n = 0 then 'PASS' else 'FAIL' end || ' 4e dept manager cannot change settings')::text);
  execute 'reset role';

  -- ── 5. Nobody can grant what they don't hold ──
  perform set_config('request.jwt.claims', json_build_object('sub', u_a_mgr, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform workplace.grant_permission(p_a_staff1, 'pay.view');
    results := array_append(results, 'FAIL 5a manager granted pay.view without holding it'::text);
  exception when others then
    results := array_append(results, ('PASS 5a manager cannot grant pay.view (' || sqlerrm || ')')::text);
  end;
  begin
    perform workplace.grant_permission(p_a_staff1, 'rota.edit', s_a2);
    results := array_append(results, 'FAIL 5b manager granted rota.edit on A2'::text);
  exception when others then
    results := array_append(results, ('PASS 5b manager cannot grant outside their site (' || sqlerrm || ')')::text);
  end;
  begin
    perform workplace.grant_permission(p_a_staff1, 'rota.edit', s_a1, null, now() + interval '7 days');
    results := array_append(results, 'PASS 5c manager can grant rota.edit on A1 with an end date'::text);
  exception when others then
    results := array_append(results, ('FAIL 5c manager could not grant within scope (' || sqlerrm || ')')::text);
  end;
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub', u_a_dm, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform workplace.grant_permission(p_a_staff1, 'rota.edit', null, d_a1_bar);
    results := array_append(results, 'FAIL 5d dept manager granted without staff.manage'::text);
  exception when others then
    results := array_append(results, ('PASS 5d dept manager cannot grant (' || sqlerrm || ')')::text);
  end;
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub', u_a_staff1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  results := array_append(results, (case when workplace.has_perm(b_a, 'rota.edit', s_a1) then 'PASS' else 'FAIL' end || ' 5e granted rota.edit takes effect for staff')::text);
  select count(*) into n from workplace.permission_grants;
  results := array_append(results, (case when n = 1 then 'PASS' else 'FAIL' end || ' 5g staff sees own grant (got ' || n || ')')::text);
  begin
    insert into workplace.permission_grants (business_id, person_id, permission, granted_by) values (b_a, p_a_staff1, 'pay.view', p_a_staff1);
    results := array_append(results, 'FAIL 5f staff inserted a grant directly'::text);
  exception when others then
    results := array_append(results, ('PASS 5f direct grant inserts blocked (' || sqlerrm || ')')::text);
  end;
  execute 'reset role';

  update workplace.permission_grants set expires_at = now() - interval '1 minute' where person_id = p_a_staff1;
  perform set_config('request.jwt.claims', json_build_object('sub', u_a_staff1, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  results := array_append(results, (case when not workplace.has_perm(b_a, 'rota.edit', s_a1) then 'PASS' else 'FAIL' end || ' 5h expired grant stops working')::text);
  execute 'reset role';

  -- ── 6. Owner-only permissions are never grantable ──
  perform set_config('request.jwt.claims', json_build_object('sub', u_a_owner, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform workplace.grant_permission(p_a_mgr, 'billing.manage');
    results := array_append(results, 'FAIL 6a billing.manage was granted'::text);
  exception when others then
    results := array_append(results, ('PASS 6a billing.manage not grantable (' || sqlerrm || ')')::text);
  end;
  begin
    perform workplace.grant_permission(p_a_mgr, 'business.close');
    results := array_append(results, 'FAIL 6b business.close was granted'::text);
  exception when others then
    results := array_append(results, ('PASS 6b business.close not grantable (' || sqlerrm || ')')::text);
  end;

  -- ── 7. The last owner can't be removed ──
  begin
    perform workplace.remove_role(ra_a_owner);
    results := array_append(results, 'FAIL 7 last owner was removed'::text);
  exception when others then
    results := array_append(results, ('PASS 7 last owner protected (' || sqlerrm || ')')::text);
  end;

  -- owner can grant pay.view, which then lets the manager see A1 staff pay
  perform workplace.grant_permission(p_a_mgr, 'pay.view', s_a1);
  select count(*) into n from workplace.activity_log where business_id = b_a and action = 'permission.granted';
  results := array_append(results, (case when n >= 1 then 'PASS' else 'FAIL' end || ' 7b grants are written to the activity log')::text);
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub', u_a_mgr, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from workplace.person_pay;
  results := array_append(results, (case when n = 2 then 'PASS' else 'FAIL' end || ' 7c manager sees A1 pay once owner grants pay.view (got ' || n || ')')::text);
  execute 'reset role';

  -- ── 8. A non-member sees nothing ──
  perform set_config('request.jwt.claims', json_build_object('sub', u_none, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select (select count(*) from workplace.businesses where id in (b_a, b_b))
       + (select count(*) from workplace.sites where business_id in (b_a, b_b))
       + (select count(*) from workplace.departments where business_id in (b_a, b_b))
       + (select count(*) from workplace.people where business_id in (b_a, b_b))
       + (select count(*) from workplace.person_details where business_id in (b_a, b_b))
       + (select count(*) from workplace.person_pay where business_id in (b_a, b_b))
       + (select count(*) from workplace.person_departments where business_id in (b_a, b_b))
       + (select count(*) from workplace.role_assignments where business_id in (b_a, b_b))
       + (select count(*) from workplace.permission_grants where business_id in (b_a, b_b))
       + (select count(*) from workplace.activity_log where business_id in (b_a, b_b)) into n;
  results := array_append(results, (case when n = 0 then 'PASS' else 'FAIL' end || ' 8 non-member sees 0 rows (got ' || n || ')')::text);

  -- ── 9. The internal log writer can't be called directly ──
  begin
    perform workplace.log(b_a, 'forged', 'x', null);
    results := array_append(results, 'FAIL 9 authenticated user called workplace.log'::text);
  exception when others then
    results := array_append(results, ('PASS 9 workplace.log not callable (' || sqlerrm || ')')::text);
  end;
  execute 'reset role';

  -- ── 10. Anonymous visitors can't touch the schema at all ──
  execute 'set local role anon';
  begin
    select count(*) into n from workplace.businesses;
    results := array_append(results, 'FAIL 10 anon read workplace.businesses'::text);
  exception when others then
    results := array_append(results, ('PASS 10 anon blocked (' || sqlerrm || ')')::text);
  end;
  execute 'reset role';

  raise exception E'RESULTS (rolled back)\n%', array_to_string(results, E'\n');
end
$test$;
