-- R9G-B admission, handoff materialization, lifecycle end and cleanup
-- primitives: one transaction, always rolled back.
-- Run with `supabase db query --linked --file supabase/tests/r9g_b_admission_lifecycle.sql`.
begin;

create function pg_temp.expect(value jsonb, wanted text, label text)
returns void language plpgsql as $$
begin
  if coalesce(value ->> 'code', value ->> 'outcome') is distinct from wanted then
    raise exception 'R9G-B % wanted %, got %', label, wanted, value;
  end if;
end;
$$;

-- Test-only fixed timestamps stand in for "old" rows. They are fixtures, not a
-- retention duration: the primitives under test take an explicit cutoff.
do $setup$
declare
  fa uuid := gen_random_uuid();
  fb uuid := gen_random_uuid();
  fd uuid := gen_random_uuid();
  staff_a uuid := gen_random_uuid();
  staff_b uuid := gen_random_uuid();
  staff_d uuid := gen_random_uuid();
  disabled uuid := gen_random_uuid();
  admin_user uuid := gen_random_uuid();
  outsider uuid := gen_random_uuid();
  p1 uuid := gen_random_uuid();
  p2 uuid := gen_random_uuid();
  p3 uuid := gen_random_uuid();
  p4 uuid := gen_random_uuid();
  p5 uuid := gen_random_uuid();
  p6 uuid := gen_random_uuid();
  orphan uuid := gen_random_uuid();
  old_owner uuid := gen_random_uuid();
  recent_orphan uuid := gen_random_uuid();
  active_orphan uuid := gen_random_uuid();
  old_permanent uuid := gen_random_uuid();
begin
  perform set_config('r9gb.fa', fa::text, true);
  perform set_config('r9gb.fb', fb::text, true);
  perform set_config('r9gb.fd', fd::text, true);
  perform set_config('r9gb.staff_a', staff_a::text, true);
  perform set_config('r9gb.staff_b', staff_b::text, true);
  perform set_config('r9gb.staff_d', staff_d::text, true);
  perform set_config('r9gb.disabled', disabled::text, true);
  perform set_config('r9gb.admin_user', admin_user::text, true);
  perform set_config('r9gb.outsider', outsider::text, true);
  perform set_config('r9gb.p1', p1::text, true);
  perform set_config('r9gb.p2', p2::text, true);
  perform set_config('r9gb.p3', p3::text, true);
  perform set_config('r9gb.p4', p4::text, true);
  perform set_config('r9gb.p5', p5::text, true);
  perform set_config('r9gb.p6', p6::text, true);
  perform set_config('r9gb.orphan', orphan::text, true);
  perform set_config('r9gb.old_owner', old_owner::text, true);
  perform set_config('r9gb.recent_orphan', recent_orphan::text, true);
  perform set_config('r9gb.active_orphan', active_orphan::text, true);
  perform set_config('r9gb.old_permanent', old_permanent::text, true);

  insert into auth.users (id, is_anonymous, raw_user_meta_data, created_at) values
    (staff_a, false, '{"_r9gb_test":true}'::jsonb, now()),
    (staff_b, false, '{"_r9gb_test":true}'::jsonb, now()),
    (staff_d, false, '{"_r9gb_test":true}'::jsonb, now()),
    (disabled, false, '{"_r9gb_test":true}'::jsonb, now()),
    (admin_user, false, '{"_r9gb_test":true}'::jsonb, now()),
    (outsider, false, '{"_r9gb_test":true,"role":"clinical_staff","facility_id":"spoofed"}'::jsonb, now()),
    (p1, true, '{"_r9gb_test":true}'::jsonb, now()),
    (p2, true, '{"_r9gb_test":true}'::jsonb, now()),
    (p3, true, '{"_r9gb_test":true}'::jsonb, now()),
    (p4, true, '{"_r9gb_test":true}'::jsonb, now()),
    (p5, true, '{"_r9gb_test":true}'::jsonb, now()),
    (p6, true, '{"_r9gb_test":true}'::jsonb, now()),
    (orphan, true, '{"_r9gb_test":true}'::jsonb, '2000-01-01T00:00:00Z'),
    (old_owner, true, '{"_r9gb_test":true}'::jsonb, '2000-01-01T00:00:00Z'),
    (recent_orphan, true, '{"_r9gb_test":true}'::jsonb, now()),
    (active_orphan, true, '{"_r9gb_test":true}'::jsonb, '2000-01-01T00:00:00Z'),
    (old_permanent, false, '{"_r9gb_test":true}'::jsonb, '2000-01-01T00:00:00Z');
  -- An old anonymous principal whose session was used after the cutoff.
  insert into auth.sessions (id, user_id, created_at, updated_at)
    values (gen_random_uuid(), active_orphan, '2000-01-01T00:00:00Z', now());

  insert into public.facilities (id, display_name, enabled) values
    (fa, 'R9G-B rollback facility A', true),
    (fb, 'R9G-B rollback facility B', true),
    (fd, 'R9G-B rollback disabled facility', false);
  insert into public.staff_profiles (auth_user_id, facility_id, role, enabled) values
    (staff_a, fa, 'clinical_staff', true),
    (staff_b, fb, 'clinical_staff', true),
    (staff_d, fd, 'clinical_staff', true),
    (disabled, fa, 'clinical_staff', false),
    (admin_user, fa, 'facility_admin', true);

  -- p2 already owns an unassociated web assessment.
  insert into public.assessment_sessions (
    contract_version, owner_auth_user_id, deployment_mode, engine_version, knowledge_version, safety_version
  ) values ('1.0.0-r9d-assessment', p2, 'web/self-service', '1.0.0-r1', '0.2.0-r2b-demonstration',
    '0.1.0-r3-safety-demonstration');
  -- An old principal that owns an assessment is never an orphan.
  insert into public.assessment_sessions (
    contract_version, owner_auth_user_id, deployment_mode, engine_version, knowledge_version, safety_version,
    created_at, updated_at
  ) values ('1.0.0-r9d-assessment', old_owner, 'web/self-service', '1.0.0-r1', '0.2.0-r2b-demonstration',
    '0.1.0-r3-safety-demonstration', '2000-01-01T00:00:00Z', '2000-01-01T00:00:00Z');
  -- A service-written hospital-kiosk row: no trusted path may act on it.
  insert into public.assessment_sessions (
    contract_version, facility_id, owner_auth_user_id, deployment_mode, status, complaint_id, complaint_source,
    engine_version, knowledge_version, safety_version
  ) values ('1.0.0-r9d-assessment', fa, p5, 'hospital-kiosk', 'in_progress', 'headache', 'bridge-resolved',
    '1.0.0-r1', '0.2.0-r2b-demonstration', '0.1.0-r3-safety-demonstration');
end
$setup$;

/* --- Privileges ----------------------------------------------------------- */

do $privileges$
declare
  fn text;
begin
  foreach fn in array array[
    'public.trusted_admission_shape_ok(uuid)',
    'public.trusted_is_anonymous_principal(uuid)',
    'public.trusted_admit_staffed_assessment(uuid,uuid,uuid,text,text,text,text,text,text)',
    'public.trusted_end_assessment(uuid,uuid,uuid)',
    'public.trusted_record_safety_event(uuid,uuid,uuid,integer,integer,integer,text[],text,text,text,text,text,timestamptz,jsonb)',
    'public.trusted_finalize_routing(uuid,uuid,uuid,integer,integer,integer,text,text,text,double precision,double precision,double precision,double precision,double precision,double precision,uuid[])',
    'public.trusted_prepare_soap_handoff(uuid,uuid,uuid,uuid,integer,integer,integer,uuid,text,jsonb)'
  ] loop
    if has_function_privilege('anon', fn, 'execute')
      or has_function_privilege('authenticated', fn, 'execute')
      or has_function_privilege('public', fn, 'execute') then
      raise exception 'R9G-B browser role can execute %', fn;
    end if;
    if not has_function_privilege('service_role', fn, 'execute') then
      raise exception 'R9G-B service_role cannot execute %', fn;
    end if;
    if exists (select 1 from pg_proc where oid = fn::regprocedure
      and (proconfig is null or not ('search_path=""' = any(proconfig)))) then
      raise exception 'R9G-B function does not pin search_path: %', fn;
    end if;
    if fn <> 'public.trusted_is_anonymous_principal(uuid)'
      and exists (select 1 from pg_proc where oid = fn::regprocedure and prosecdef) then
      raise exception 'R9G-B unexpected security definer: %', fn;
    end if;
  end loop;

  foreach fn in array array[
    'private.expire_stale_assessments(timestamptz,boolean,integer)',
    'private.cleanup_orphan_anonymous_users(timestamptz,boolean,integer)'
  ] loop
    if has_function_privilege('anon', fn, 'execute')
      or has_function_privilege('authenticated', fn, 'execute')
      or has_function_privilege('service_role', fn, 'execute')
      or has_function_privilege('public', fn, 'execute') then
      raise exception 'R9G-B cleanup primitive is callable by a Data API role: %', fn;
    end if;
    if exists (select 1 from pg_proc where oid = fn::regprocedure and prosecdef) then
      raise exception 'R9G-B cleanup primitive is security definer: %', fn;
    end if;
  end loop;

  if has_function_privilege('anon', 'private.patient_can_append_evidence(uuid)', 'execute')
    or not has_function_privilege('authenticated', 'private.patient_can_append_evidence(uuid)', 'execute') then
    raise exception 'R9G-B append helper grants are wrong';
  end if;

  -- No staff override or continuation operation exists.
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private') and p.proname ~* 'override|continu') then
    raise exception 'R9G-B an override or continuation function exists';
  end if;
  if (select count(*) from pg_policies where schemaname = 'public') <> 17 then
    raise exception 'R9G-B policy count changed';
  end if;
end
$privileges$;

/* --- Admission authority -------------------------------------------------- */

set local role service_role;
do $admission$
declare
  admit_key uuid := gen_random_uuid();
  result jsonb;
  v_assessment uuid;
  profile_a uuid := (select id from public.staff_profiles where auth_user_id = current_setting('r9gb.staff_a')::uuid);
  p1 uuid := current_setting('r9gb.p1')::uuid;
  staff_a uuid := current_setting('r9gb.staff_a')::uuid;
  v text := '1.0.0-r9d-assessment';
  e text := '1.0.0-r1';
  k text := '0.2.0-r2b-demonstration';
  s text := '0.1.0-r3-safety-demonstration';
begin
  perform pg_temp.expect(public.trusted_admit_staffed_assessment(current_setting('r9gb.outsider')::uuid, p1,
    gen_random_uuid(), v, e, k, s, 'headache', 'bridge-resolved'), 'STAFF_REQUIRED', 'permanent non-staff with spoofed metadata');
  perform pg_temp.expect(public.trusted_admit_staffed_assessment(current_setting('r9gb.disabled')::uuid, p1,
    gen_random_uuid(), v, e, k, s, 'headache', 'bridge-resolved'), 'STAFF_REQUIRED', 'disabled staff');
  perform pg_temp.expect(public.trusted_admit_staffed_assessment(current_setting('r9gb.admin_user')::uuid, p1,
    gen_random_uuid(), v, e, k, s, 'headache', 'bridge-resolved'), 'STAFF_REQUIRED', 'facility_admin');
  perform pg_temp.expect(public.trusted_admit_staffed_assessment(current_setting('r9gb.staff_d')::uuid, p1,
    gen_random_uuid(), v, e, k, s, 'headache', 'bridge-resolved'), 'STAFF_REQUIRED', 'disabled facility');
  perform pg_temp.expect(public.trusted_admit_staffed_assessment(current_setting('r9gb.p3')::uuid, p1,
    gen_random_uuid(), v, e, k, s, 'headache', 'bridge-resolved'), 'STAFF_REQUIRED', 'anonymous caller as staff');
  perform pg_temp.expect(public.trusted_admit_staffed_assessment(staff_a, current_setting('r9gb.outsider')::uuid,
    gen_random_uuid(), v, e, k, s, 'headache', 'bridge-resolved'), 'PATIENT_REQUIRED', 'permanent account as patient');
  perform pg_temp.expect(public.trusted_admit_staffed_assessment(staff_a, staff_a,
    gen_random_uuid(), v, e, k, s, 'headache', 'bridge-resolved'), 'PATIENT_REQUIRED', 'staff as own patient');
  perform pg_temp.expect(public.trusted_admit_staffed_assessment(staff_a, gen_random_uuid(),
    gen_random_uuid(), v, e, k, s, 'headache', 'bridge-resolved'), 'PATIENT_REQUIRED', 'unknown principal');
  perform pg_temp.expect(public.trusted_admit_staffed_assessment(staff_a, p1,
    gen_random_uuid(), v, e, k, s, 'skin-concern', 'bridge-resolved'), 'COMPLAINT_NOT_SUPPORTED', 'unapproved complaint');
  perform pg_temp.expect(public.trusted_admit_staffed_assessment(staff_a, p1,
    gen_random_uuid(), v, e, k, s, 'headache', 'forged-source'), 'INVALID_REQUEST', 'bad complaint source');
  perform pg_temp.expect(public.trusted_admit_staffed_assessment(staff_a, current_setting('r9gb.p2')::uuid,
    gen_random_uuid(), v, e, k, s, 'headache', 'bridge-resolved'), 'INVALID_STATE', 'principal already owns a web assessment');
  if (select count(*) from public.assessment_sessions where owner_auth_user_id = p1) <> 0 then
    raise exception 'R9G-B refused admissions created an assessment';
  end if;

  result := public.trusted_admit_staffed_assessment(staff_a, p1, admit_key, v, e, k, s, 'headache', 'bridge-resolved');
  perform pg_temp.expect(result, 'applied', 'admission');
  v_assessment := (result ->> 'assessmentId')::uuid;
  perform set_config('r9gb.a1', v_assessment::text, true);
  if not exists (select 1 from public.assessment_sessions a where a.id = v_assessment
    and a.owner_auth_user_id = p1 and a.facility_id = current_setting('r9gb.fa')::uuid
    and a.initiated_by_staff_profile_id = profile_a and a.kiosk_device_id is null
    and a.deployment_mode = 'staffed-tablet' and a.status = 'in_progress'
    and a.complaint_id = 'headache' and a.complaint_source = 'bridge-resolved') then
    raise exception 'R9G-B admitted assessment has the wrong server-derived shape';
  end if;
  if (select count(*) from public.audit_events where assessment_id = v_assessment
    and kind = 'assessment_transition' and from_status = 'created' and to_status = 'in_progress'
    and reason_code = 'staff_admitted_patient' and actor_staff_profile_id = profile_a
    and client_event_id = admit_key) <> 1 then
    raise exception 'R9G-B admission audit is missing';
  end if;

  perform pg_temp.expect(public.trusted_admit_staffed_assessment(staff_a, p1, admit_key, v, e, k, s,
    'headache', 'bridge-resolved'), 'replayed', 'admission replay');
  if (public.trusted_admit_staffed_assessment(staff_a, p1, admit_key, v, e, k, s, 'headache', 'bridge-resolved')
    ->> 'assessmentId')::uuid <> v_assessment then
    raise exception 'R9G-B replay returned a different assessment';
  end if;
  perform pg_temp.expect(public.trusted_admit_staffed_assessment(staff_a, p1, admit_key, v, e, k, s,
    'upper-abdominal-pain', 'bridge-resolved'), 'IDEMPOTENCY_CONFLICT', 'same key, different complaint');
  perform pg_temp.expect(public.trusted_admit_staffed_assessment(current_setting('r9gb.staff_b')::uuid, p1, admit_key,
    v, e, k, s, 'headache', 'bridge-resolved'), 'IDEMPOTENCY_CONFLICT', 'same key, other facility staff');
  perform pg_temp.expect(public.trusted_admit_staffed_assessment(staff_a, p1, gen_random_uuid(), v, e, k, s,
    'headache', 'bridge-resolved'), 'INVALID_STATE', 'duplicate admission with a new key');
  perform pg_temp.expect(public.trusted_admit_staffed_assessment(current_setting('r9gb.staff_b')::uuid, p1,
    gen_random_uuid(), v, e, k, s, 'headache', 'bridge-resolved'), 'INVALID_STATE', 'rebinding to facility B');
  if (select count(*) from public.assessment_sessions where owner_auth_user_id = p1) <> 1 then
    raise exception 'R9G-B a replayed principal bound a second assessment';
  end if;

  -- Database backstop: one facility binding per principal.
  begin
    insert into public.assessment_sessions (contract_version, facility_id, owner_auth_user_id, deployment_mode,
      engine_version, knowledge_version, safety_version)
    values (v, current_setting('r9gb.fb')::uuid, p1, 'hospital-kiosk', e, k, s);
    raise exception 'R9G-B second facility binding was accepted';
  exception when unique_violation then null;
  end;

  -- A second admitted patient, for isolation and lifecycle checks.
  result := public.trusted_admit_staffed_assessment(staff_a, current_setting('r9gb.p4')::uuid, gen_random_uuid(),
    v, e, k, s, 'joint-musculoskeletal-pain', 'patient-stated');
  perform pg_temp.expect(result, 'applied', 'second admission');
  perform set_config('r9gb.a4', result ->> 'assessmentId', true);
  -- A Facility B patient.
  result := public.trusted_admit_staffed_assessment(current_setting('r9gb.staff_b')::uuid,
    current_setting('r9gb.p6')::uuid, gen_random_uuid(), v, e, k, s, 'headache', 'bridge-resolved');
  perform pg_temp.expect(result, 'applied', 'facility B admission');
  perform set_config('r9gb.a6', result ->> 'assessmentId', true);
end
$admission$;
reset role;

/* --- Browser roles: patient ownership and facility isolation -------------- */

set local role authenticated;
select set_config('request.jwt.claims', jsonb_build_object(
  'sub', current_setting('r9gb.p1'), 'role', 'authenticated', 'is_anonymous', true)::text, true);
do $patient$
declare
  a1 uuid := current_setting('r9gb.a1')::uuid;
  answer_id uuid;
begin
  if (select count(*) from public.assessment_sessions where id = a1) <> 1 then
    raise exception 'R9G-B admitted patient cannot read own assessment';
  end if;
  insert into public.routing_answers (assessment_id, question_id, option_id, operation, sequence,
    answered_at, client_event_id, knowledge_version)
  values (a1, 'headache-one-sided', 'yes', 'selected', 1, now(), gen_random_uuid(), '0.2.0-r2b-demonstration')
  returning id into answer_id;
  perform set_config('r9gb.a1_answer', answer_id::text, true);

  begin
    perform public.trusted_admit_staffed_assessment(gen_random_uuid(), current_setting('r9gb.p1')::uuid,
      gen_random_uuid(), 'x', 'x', 'x', 'x', 'headache', 'bridge-resolved');
    raise exception 'R9G-B browser role executed admission';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.trusted_end_assessment(a1, current_setting('r9gb.p1')::uuid, gen_random_uuid());
    raise exception 'R9G-B browser role executed end';
  exception when insufficient_privilege then null;
  end;
  begin
    perform private.cleanup_orphan_anonymous_users(now(), true, 1);
    raise exception 'R9G-B browser role executed cleanup';
  exception when insufficient_privilege then null;
  end;
  -- A browser session cannot self-admit a facility-bound or tablet assessment.
  begin
    insert into public.assessment_sessions (contract_version, owner_auth_user_id, deployment_mode,
      engine_version, knowledge_version, safety_version)
    values ('1.0.0-r9d-assessment', current_setting('r9gb.p1')::uuid, 'staffed-tablet',
      '1.0.0-r1', '0.2.0-r2b-demonstration', '0.1.0-r3-safety-demonstration');
    raise exception 'R9G-B browser self-admitted a staffed-tablet assessment';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.assessment_sessions (contract_version, owner_auth_user_id, deployment_mode,
      engine_version, knowledge_version, safety_version, facility_id)
    values ('1.0.0-r9d-assessment', current_setting('r9gb.p1')::uuid, 'web/self-service',
      '1.0.0-r1', '0.2.0-r2b-demonstration', '0.1.0-r3-safety-demonstration', current_setting('r9gb.fa')::uuid);
    raise exception 'R9G-B browser supplied a facility';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.clinical_handoffs (assessment_id, soap_handoff_id, facility_id)
    values (a1, gen_random_uuid(), current_setting('r9gb.fa')::uuid);
    raise exception 'R9G-B browser inserted a clinical handoff';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.assessment_sessions set status = 'closed' where id = a1;
    raise exception 'R9G-B browser updated lifecycle';
  exception when insufficient_privilege then null;
  end;
end
$patient$;

select set_config('request.jwt.claims', jsonb_build_object(
  'sub', current_setting('r9gb.p3'), 'role', 'authenticated', 'is_anonymous', true)::text, true);
do $other_patient$
begin
  if (select count(*) from public.assessment_sessions where id = current_setting('r9gb.a1')::uuid) <> 0
    or (select count(*) from public.routing_answers where assessment_id = current_setting('r9gb.a1')::uuid) <> 0 then
    raise exception 'R9G-B another patient can read an admitted assessment';
  end if;
  begin
    insert into public.routing_answers (assessment_id, question_id, option_id, operation, sequence,
      answered_at, client_event_id, knowledge_version)
    values (current_setting('r9gb.a1')::uuid, 'headache-sudden-severe', 'no', 'selected', 2, now(),
      gen_random_uuid(), '0.2.0-r2b-demonstration');
    raise exception 'R9G-B another patient wrote admitted evidence';
  exception when insufficient_privilege then null;
  end;
end
$other_patient$;

select set_config('request.jwt.claims', jsonb_build_object(
  'sub', current_setting('r9gb.staff_a'), 'role', 'authenticated', 'is_anonymous', false)::text, true);
do $staff_a_read$
begin
  if (select count(*) from public.assessment_sessions where id = current_setting('r9gb.a1')::uuid) <> 1
    or (select count(*) from public.assessment_sessions where id = current_setting('r9gb.a6')::uuid) <> 0 then
    raise exception 'R9G-B facility A staff scope is wrong';
  end if;
end
$staff_a_read$;
reset role;

/* --- Routing, SOAP and handoff materialization ---------------------------- */

set local role service_role;
do $materialize$
declare
  a1 uuid := current_setting('r9gb.a1')::uuid;
  p1 uuid := current_setting('r9gb.p1')::uuid;
  answer_id uuid := current_setting('r9gb.a1_answer')::uuid;
  finalize_key uuid := gen_random_uuid();
  soap_key uuid := gen_random_uuid();
  result jsonb;
  result_id uuid;
  handoff_id uuid;
  note jsonb := jsonb_build_object(
    'S', jsonb_build_array(jsonb_build_object('label', 'Main concern', 'value', 'Headache')),
    'O', jsonb_build_array(jsonb_build_object('label', 'Measurements', 'value', 'No vital signs, measurements or examination findings were captured by DocMatch+.')),
    'A', jsonb_build_array(jsonb_build_object('label', 'Routing assessment', 'value', 'Neurology is the next clinical direction.')),
    'P', jsonb_build_array(jsonb_build_object('label', 'Handoff', 'value', 'Prepared for clinical handoff.')));
begin
  result := public.trusted_finalize_routing(a1, p1, finalize_key, 1, 0, 0, 'neurology', 'neurology',
    'top_probability', 0, 0, 1, 0, 0, 0, array[answer_id]);
  perform pg_temp.expect(result, 'applied', 'staffed finalize');
  result_id := (result ->> 'routingResultId')::uuid;
  perform set_config('r9gb.a1_result', result_id::text, true);

  -- Refinalization stays blocked: another key returns the one stored result.
  perform pg_temp.expect(public.trusted_finalize_routing(a1, p1, gen_random_uuid(), 1, 0, 0, 'general-medicine',
    'neurology', 'max_questions', 0, 0, 1, 0, 0, 0, array[answer_id]), 'existing', 'refinalize with a new key');
  if (select count(*) from public.routing_results where assessment_id = a1) <> 1 then
    raise exception 'R9G-B a second routing result was written';
  end if;

  perform pg_temp.expect(public.trusted_prepare_soap_handoff(a1, current_setting('r9gb.p3')::uuid, soap_key,
    result_id, 1, 0, 0, null, '1.0.0-r9e', note), 'ASSESSMENT_NOT_FOUND', 'cross-patient SOAP');
  result := public.trusted_prepare_soap_handoff(a1, p1, soap_key, result_id, 1, 0, 0, null, '1.0.0-r9e', note);
  perform pg_temp.expect(result, 'applied', 'staffed SOAP');
  handoff_id := (result ->> 'clinicalHandoffId')::uuid;
  if handoff_id is null then
    raise exception 'R9G-B facility-bound SOAP did not materialize a handoff';
  end if;
  perform set_config('r9gb.h1', handoff_id::text, true);
  if not exists (select 1 from public.clinical_handoffs h where h.id = handoff_id and h.assessment_id = a1
    and h.soap_handoff_id = (result ->> 'soapHandoffId')::uuid
    and h.facility_id = current_setting('r9gb.fa')::uuid and h.status = 'prepared') then
    raise exception 'R9G-B handoff linkage is wrong';
  end if;

  result := public.trusted_prepare_soap_handoff(a1, p1, soap_key, result_id, 1, 0, 0, null, '1.0.0-r9e', note);
  perform pg_temp.expect(result, 'replayed', 'SOAP replay');
  if (result ->> 'clinicalHandoffId')::uuid <> handoff_id then
    raise exception 'R9G-B SOAP replay reported another handoff';
  end if;
  perform pg_temp.expect(public.trusted_prepare_soap_handoff(a1, p1, gen_random_uuid(), result_id, 1, 0, 0, null,
    '1.0.0-r9e', note), 'existing', 'SOAP with a new key');
  if (select count(*) from public.clinical_handoffs where assessment_id = a1) <> 1
    or (select count(*) from public.soap_handoffs where assessment_id = a1) <> 1 then
    raise exception 'R9G-B retries duplicated SOAP or handoff rows';
  end if;

  -- Database backstop: one handoff per SOAP snapshot.
  begin
    insert into public.clinical_handoffs (assessment_id, soap_handoff_id, facility_id, status)
    values (a1, (result ->> 'soapHandoffId')::uuid, current_setting('r9gb.fa')::uuid, 'cancelled');
    raise exception 'R9G-B duplicate handoff for one SOAP was accepted';
  exception when unique_violation then null;
  end;

  -- The web shape still never materializes a handoff.
  if public.trusted_admission_shape_ok(a1) is not true then
    raise exception 'R9G-B admitted shape was not accepted';
  end if;
  if public.trusted_admission_shape_ok(
    (select id from public.assessment_sessions where owner_auth_user_id = current_setting('r9gb.p5')::uuid)) then
    raise exception 'R9G-B hospital-kiosk shape was accepted';
  end if;
end
$materialize$;
reset role;

-- Once the route is final, the patient can no longer append evidence.
set local role authenticated;
select set_config('request.jwt.claims', jsonb_build_object(
  'sub', current_setting('r9gb.p1'), 'role', 'authenticated', 'is_anonymous', true)::text, true);
do $append_window$
begin
  begin
    insert into public.routing_answers (assessment_id, question_id, option_id, operation, sequence,
      answered_at, client_event_id, knowledge_version)
    values (current_setting('r9gb.a1')::uuid, 'headache-sudden-severe', 'no', 'selected', 2, now(),
      gen_random_uuid(), '0.2.0-r2b-demonstration');
    raise exception 'R9G-B evidence was appended after handoff preparation';
  exception when insufficient_privilege then null;
  end;
  if (select count(*) from public.soap_handoffs where assessment_id = current_setting('r9gb.a1')::uuid) <> 1 then
    raise exception 'R9G-B patient cannot read own SOAP after admission';
  end if;
  if (select count(*) from public.clinical_handoffs) <> 0 then
    raise exception 'R9G-B patient can read clinical handoffs';
  end if;
end
$append_window$;

select set_config('request.jwt.claims', jsonb_build_object(
  'sub', current_setting('r9gb.staff_a'), 'role', 'authenticated', 'is_anonymous', false)::text, true);
do $queue_a$
begin
  if (select count(*) from public.clinical_handoffs where id = current_setting('r9gb.h1')::uuid) <> 1 then
    raise exception 'R9G-B facility A staff cannot see the materialized handoff';
  end if;
end
$queue_a$;
select set_config('request.jwt.claims', jsonb_build_object(
  'sub', current_setting('r9gb.staff_b'), 'role', 'authenticated', 'is_anonymous', false)::text, true);
do $queue_b$
begin
  if (select count(*) from public.clinical_handoffs where id = current_setting('r9gb.h1')::uuid) <> 0
    or (select count(*) from public.soap_handoffs where assessment_id = current_setting('r9gb.a1')::uuid) <> 0 then
    raise exception 'R9G-B facility B staff can see facility A clinical data';
  end if;
end
$queue_b$;
reset role;

/* --- Review, lifecycle end, kiosk refusal, facility revocation ------------ */

set local role service_role;
do $lifecycle$
declare
  a1 uuid := current_setting('r9gb.a1')::uuid;
  a4 uuid := current_setting('r9gb.a4')::uuid;
  p1 uuid := current_setting('r9gb.p1')::uuid;
  p4 uuid := current_setting('r9gb.p4')::uuid;
  kiosk uuid := (select id from public.assessment_sessions where owner_auth_user_id = current_setting('r9gb.p5')::uuid);
  end_key uuid := gen_random_uuid();
  web_id uuid := (select id from public.assessment_sessions where owner_auth_user_id = current_setting('r9gb.p2')::uuid);
begin
  -- The R9F review path works on a materialized handoff.
  perform pg_temp.expect(public.trusted_open_handoff(current_setting('r9gb.h1')::uuid,
    current_setting('r9gb.staff_b')::uuid, gen_random_uuid()), 'HANDOFF_NOT_FOUND', 'facility B opens A');
  perform pg_temp.expect(public.trusted_open_handoff(current_setting('r9gb.h1')::uuid,
    current_setting('r9gb.staff_a')::uuid, gen_random_uuid()), 'applied', 'facility A opens');

  -- Ending: handoff_prepared -> closed; the handoff keeps its review state.
  perform pg_temp.expect(public.trusted_end_assessment(a1, current_setting('r9gb.p3')::uuid, end_key),
    'ASSESSMENT_NOT_FOUND', 'end by another patient');
  perform pg_temp.expect(public.trusted_end_assessment(a1, p1, end_key), 'applied', 'end prepared');
  if (select status from public.assessment_sessions where id = a1) <> 'closed'
    or (select status from public.clinical_handoffs where id = current_setting('r9gb.h1')::uuid) <> 'opened' then
    raise exception 'R9G-B end changed the handoff or did not close';
  end if;
  perform pg_temp.expect(public.trusted_end_assessment(a1, p1, end_key), 'replayed', 'end replay');
  perform pg_temp.expect(public.trusted_end_assessment(a1, p1, gen_random_uuid()), 'existing', 'end already closed');
  if (select count(*) from public.audit_events where assessment_id = a1
    and reason_code = 'patient_session_ended' and from_status = 'handoff_prepared' and to_status = 'closed') <> 1 then
    raise exception 'R9G-B end audit is missing or duplicated';
  end if;
  perform pg_temp.expect(public.trusted_end_assessment(a1, p1,
    (select client_event_id from public.audit_events where assessment_id = a1 and reason_code = 'staff_admitted_patient')),
    'IDEMPOTENCY_CONFLICT', 'end with the admission key');

  -- Ending an unfinished assessment cancels it; a cancelled one cannot finalize.
  perform pg_temp.expect(public.trusted_end_assessment(a4, p4, gen_random_uuid()), 'applied', 'end unfinished');
  if (select status from public.assessment_sessions where id = a4) <> 'cancelled' then
    raise exception 'R9G-B unfinished end did not cancel';
  end if;
  perform pg_temp.expect(public.trusted_finalize_routing(a4, p4, gen_random_uuid(), 0, 0, 0, 'orthopaedics',
    'orthopedics', 'top_probability', 0, 0, 0, 0, 1, 0, array[]::uuid[]), 'INVALID_STATE', 'finalize after cancel');

  -- The web shape still ends normally and never has a handoff.
  perform pg_temp.expect(public.trusted_end_assessment(web_id, current_setting('r9gb.p2')::uuid, gen_random_uuid()),
    'applied', 'web end');
  if (select status from public.assessment_sessions where id = web_id) <> 'cancelled' then
    raise exception 'R9G-B web created assessment did not cancel';
  end if;

  -- Hospital-kiosk remains refused by every trusted path.
  perform pg_temp.expect(public.trusted_finalize_routing(kiosk, current_setting('r9gb.p5')::uuid, gen_random_uuid(),
    0, 0, 0, 'neurology', 'neurology', 'top_probability', 0, 0, 1, 0, 0, 0, array[]::uuid[]),
    'UNSUPPORTED_DEPLOYMENT', 'kiosk finalize');
  perform pg_temp.expect(public.trusted_end_assessment(kiosk, current_setting('r9gb.p5')::uuid, gen_random_uuid()),
    'UNSUPPORTED_DEPLOYMENT', 'kiosk end');
  perform pg_temp.expect(public.trusted_start_assessment(kiosk, current_setting('r9gb.p5')::uuid, gen_random_uuid(),
    'headache', 'bridge-resolved'), 'UNSUPPORTED_DEPLOYMENT', 'kiosk start');

  -- A disabled facility stops trusted patient operations on its assessments.
  update public.facilities set enabled = false where id = current_setting('r9gb.fb')::uuid;
  perform pg_temp.expect(public.trusted_finalize_routing(current_setting('r9gb.a6')::uuid,
    current_setting('r9gb.p6')::uuid, gen_random_uuid(), 0, 0, 0, 'neurology', 'neurology', 'top_probability',
    0, 0, 1, 0, 0, 0, array[]::uuid[]), 'UNSUPPORTED_DEPLOYMENT', 'facility disabled after admission');
  update public.facilities set enabled = true where id = current_setting('r9gb.fb')::uuid;

  -- A staffed-tablet red flag: priority_escalated, no route, then closed.
  insert into public.safety_answers (assessment_id, question_id, option_id, operation, sequence, answered_at,
    client_event_id, safety_version)
  values (current_setting('r9gb.a6')::uuid, 'headache-thunderclap', 'yes', 'selected', 1, now(),
    gen_random_uuid(), '0.1.0-r3-safety-demonstration');
  perform pg_temp.expect(public.trusted_record_safety_event(current_setting('r9gb.a6')::uuid,
    current_setting('r9gb.p6')::uuid, gen_random_uuid(), 0, 1, 0, array['r3-test-rule'], 'r3-test-rule', '1',
    'r3-test-payload', 'emergency', 'must_stop', now(),
    jsonb_build_array(jsonb_build_object('table', 'safety_answers', 'id',
      (select id from public.safety_answers where assessment_id = current_setting('r9gb.a6')::uuid)))),
    'applied', 'staffed safety event');
  perform pg_temp.expect(public.trusted_finalize_routing(current_setting('r9gb.a6')::uuid,
    current_setting('r9gb.p6')::uuid, gen_random_uuid(), 0, 1, 0, 'neurology', 'neurology', 'top_probability',
    0, 0, 1, 0, 0, 0, array[]::uuid[]), 'INVALID_STATE', 'finalize after priority escalation');
  if exists (select 1 from public.clinical_handoffs where assessment_id = current_setting('r9gb.a6')::uuid) then
    raise exception 'R9G-B a priority assessment materialized a handoff';
  end if;
  perform pg_temp.expect(public.trusted_end_assessment(current_setting('r9gb.a6')::uuid,
    current_setting('r9gb.p6')::uuid, gen_random_uuid()), 'applied', 'end priority');
  if (select status from public.assessment_sessions where id = current_setting('r9gb.a6')::uuid) <> 'closed' then
    raise exception 'R9G-B priority end did not close';
  end if;
end
$lifecycle$;
reset role;

/* --- Operator primitives (database owner only) ---------------------------- */

do $cleanup$
declare
  result jsonb;
  stale uuid;
begin
  begin
    perform private.cleanup_orphan_anonymous_users(null);
    raise exception 'R9G-B cleanup accepted a missing cutoff';
  exception when raise_exception then
    if sqlerrm not like 'RETENTION_POLICY_DURATION_NOT_YET_APPROVED%' then raise; end if;
  end;
  begin
    perform private.expire_stale_assessments(null);
    raise exception 'R9G-B expiry accepted a missing cutoff';
  exception when raise_exception then
    if sqlerrm not like 'RETENTION_POLICY_DURATION_NOT_YET_APPROVED%' then raise; end if;
  end;
  begin
    perform private.cleanup_orphan_anonymous_users(now() + interval '1 second');
    raise exception 'R9G-B cleanup accepted a future cutoff';
  exception when raise_exception then
    if sqlerrm like 'R9G-B%' then raise; end if;
  end;

  -- Default is a dry run: it counts and deletes nothing.
  result := private.cleanup_orphan_anonymous_users('2001-01-01T00:00:00Z');
  if (result ->> 'dryRun')::boolean is not true or (result ->> 'eligible')::integer <> 1
    or (result ->> 'deleted')::integer <> 0
    or not exists (select 1 from auth.users where id = current_setting('r9gb.orphan')::uuid) then
    raise exception 'R9G-B cleanup dry run is wrong: %', result;
  end if;
  result := private.cleanup_orphan_anonymous_users('2001-01-01T00:00:00Z', false);
  if (result ->> 'deleted')::integer <> 1
    or exists (select 1 from auth.users where id = current_setting('r9gb.orphan')::uuid) then
    raise exception 'R9G-B cleanup did not delete the eligible orphan: %', result;
  end if;
  if (select count(*) from auth.users where id in (
      current_setting('r9gb.old_owner')::uuid, current_setting('r9gb.recent_orphan')::uuid,
      current_setting('r9gb.active_orphan')::uuid, current_setting('r9gb.old_permanent')::uuid,
      current_setting('r9gb.staff_a')::uuid, current_setting('r9gb.p1')::uuid)) <> 6 then
    raise exception 'R9G-B cleanup deleted an owner, a recent or active principal, or a permanent user';
  end if;
  if result::text ~* '[0-9a-f]{8}-[0-9a-f]{4}' then
    raise exception 'R9G-B cleanup returned identifiers';
  end if;

  -- Expiry: an unfinished assessment idle since before the cutoff.
  stale := (select id from public.assessment_sessions where owner_auth_user_id = current_setting('r9gb.old_owner')::uuid);
  result := private.expire_stale_assessments('2001-01-01T00:00:00Z');
  if (result ->> 'eligible')::integer <> 1 or (result ->> 'expired')::integer <> 0
    or (select status from public.assessment_sessions where id = stale) <> 'created' then
    raise exception 'R9G-B expiry dry run is wrong: %', result;
  end if;
  result := private.expire_stale_assessments('2001-01-01T00:00:00Z', false);
  if (result ->> 'expired')::integer <> 1
    or (select status from public.assessment_sessions where id = stale) <> 'expired'
    or (select count(*) from public.audit_events where assessment_id = stale
      and reason_code = 'idle_policy_expired' and from_status = 'created' and to_status = 'expired') <> 1 then
    raise exception 'R9G-B expiry did not transition and audit: %', result;
  end if;
  if (select status from public.assessment_sessions where id = current_setting('r9gb.a1')::uuid) <> 'closed' then
    raise exception 'R9G-B expiry touched a finished assessment';
  end if;
  -- Expiry and lifecycle end never delete anything.
  if not exists (select 1 from public.assessment_sessions where id = stale)
    or not exists (select 1 from auth.users where id = current_setting('r9gb.old_owner')::uuid) then
    raise exception 'R9G-B expiry deleted a record';
  end if;
end
$cleanup$;

select 'R9G-B ADMISSION LIFECYCLE HARNESS PASSED' as result;
rollback;
