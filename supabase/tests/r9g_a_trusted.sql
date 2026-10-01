-- R9G-A trusted operation harness.
-- Run with `supabase db query --linked --file supabase/tests/r9g_a_trusted.sql`.
-- One transaction ending in ROLLBACK: every synthetic Auth user, assessment and
-- derived row disappears. The RPCs are called as service_role, the only role
-- allowed to execute them; browser roles are checked to be refused.
begin;

create function pg_temp.expect(result jsonb, expected text, label text)
returns void language plpgsql as $$
begin
  if coalesce(result ->> 'code', result ->> 'outcome') is distinct from expected then
    raise exception 'R9G-A harness % expected % got %', label, expected, result;
  end if;
end;
$$;

do $setup$
declare
  pa uuid := gen_random_uuid();
  pb uuid := gen_random_uuid();
  fa uuid := gen_random_uuid();
  a_start uuid := gen_random_uuid();
  a_safety uuid := gen_random_uuid();
  a_stale uuid := gen_random_uuid();
  a_route uuid := gen_random_uuid();
  a_gm uuid := gen_random_uuid();
  a_kiosk uuid := gen_random_uuid();
  b_other uuid := gen_random_uuid();
  v text := '1.0.0-r9d-assessment';
begin
  perform set_config('r9ga.pa', pa::text, true);
  perform set_config('r9ga.pb', pb::text, true);
  perform set_config('r9ga.a_start', a_start::text, true);
  perform set_config('r9ga.a_safety', a_safety::text, true);
  perform set_config('r9ga.a_stale', a_stale::text, true);
  perform set_config('r9ga.a_route', a_route::text, true);
  perform set_config('r9ga.a_gm', a_gm::text, true);
  perform set_config('r9ga.a_kiosk', a_kiosk::text, true);
  perform set_config('r9ga.b_other', b_other::text, true);

  insert into auth.users (id, is_anonymous, raw_user_meta_data) values
    (pa, true, '{"_r9ga_test":true}'::jsonb),
    (pb, true, '{"_r9ga_test":true}'::jsonb);
  insert into public.facilities (id, display_name) values (fa, 'R9G-A rollback-only facility');
  insert into public.kiosk_devices (id, facility_id, mode) values (gen_random_uuid(), fa, 'hospital-kiosk');

  insert into public.assessment_sessions
    (id, contract_version, owner_auth_user_id, deployment_mode, status, complaint_id, complaint_source,
     engine_version, knowledge_version, safety_version)
  values
    (a_start, v, pa, 'web/self-service', 'created', null, null, '1.0.0-r1', '0.2.0-r2b-demonstration', '0.1.0-r3-safety-demonstration'),
    (a_safety, v, pa, 'web/self-service', 'in_progress', 'headache', 'bridge-resolved', '1.0.0-r1', '0.2.0-r2b-demonstration', '0.1.0-r3-safety-demonstration'),
    (a_stale, v, pa, 'web/self-service', 'in_progress', 'headache', 'bridge-resolved', '1.0.0-r1', '0.2.0-r2b-demonstration', '0.1.0-r3-safety-demonstration'),
    (a_route, v, pa, 'web/self-service', 'in_progress', 'joint-musculoskeletal-pain', 'bridge-resolved', '1.0.0-r1', '0.2.0-r2b-demonstration', '0.1.0-r3-safety-demonstration'),
    (a_gm, v, pa, 'web/self-service', 'in_progress', 'upper-abdominal-pain', 'patient-stated', '1.0.0-r1', '0.2.0-r2b-demonstration', '0.1.0-r3-safety-demonstration'),
    (b_other, v, pb, 'web/self-service', 'in_progress', 'headache', 'bridge-resolved', '1.0.0-r1', '0.2.0-r2b-demonstration', '0.1.0-r3-safety-demonstration');
  insert into public.assessment_sessions
    (id, contract_version, facility_id, owner_auth_user_id, deployment_mode, status,
     engine_version, knowledge_version, safety_version)
  values (a_kiosk, v, fa, pa, 'hospital-kiosk', 'created', '1.0.0-r1', '0.2.0-r2b-demonstration', '0.1.0-r3-safety-demonstration');

  -- Safety evidence: one active trigger answer, and one superseded answer.
  insert into public.safety_answers (id, assessment_id, question_id, option_id, operation, sequence, answered_at, client_event_id, safety_version) values
    ('00000000-0000-4000-8000-00000000a001', a_safety, 'safety-headache-sudden-extremely-painful', 'yes', 'selected', 1, now(), gen_random_uuid(), '0.1.0-r3-safety-demonstration'),
    ('00000000-0000-4000-8000-00000000a002', a_safety, 'safety-headache-new-one-sided-weakness', 'yes', 'selected', 2, now(), gen_random_uuid(), '0.1.0-r3-safety-demonstration'),
    ('00000000-0000-4000-8000-00000000c001', a_stale, 'safety-headache-sudden-extremely-painful', 'yes', 'selected', 1, now(), gen_random_uuid(), '0.1.0-r3-safety-demonstration'),
    ('00000000-0000-4000-8000-00000000b001', b_other, 'safety-headache-sudden-extremely-painful', 'yes', 'selected', 1, now(), gen_random_uuid(), '0.1.0-r3-safety-demonstration');
  insert into public.safety_answers (id, assessment_id, question_id, option_id, operation, sequence, answered_at, client_event_id, supersedes_record_id, safety_version) values
    ('00000000-0000-4000-8000-00000000a003', a_safety, 'safety-headache-new-one-sided-weakness', null, 'cleared', 3, now(), gen_random_uuid(), '00000000-0000-4000-8000-00000000a002', '0.1.0-r3-safety-demonstration');

  -- Routing evidence: r1 active, r2 superseded by a clear.
  insert into public.routing_answers (id, assessment_id, question_id, option_id, operation, sequence, answered_at, client_event_id, knowledge_version) values
    ('00000000-0000-4000-8000-00000000d001', a_route, 'joint-musculoskeletal-pain-injury', 'yes', 'selected', 1, now(), gen_random_uuid(), '0.2.0-r2b-demonstration'),
    ('00000000-0000-4000-8000-00000000d002', a_route, 'joint-musculoskeletal-pain-spasm', 'no', 'selected', 2, now(), gen_random_uuid(), '0.2.0-r2b-demonstration'),
    ('00000000-0000-4000-8000-00000000e001', a_gm, 'upper-abdominal-pain-burning', 'no', 'selected', 1, now(), gen_random_uuid(), '0.2.0-r2b-demonstration'),
    ('00000000-0000-4000-8000-00000000b002', b_other, 'headache-one-sided', 'no', 'selected', 1, now(), gen_random_uuid(), '0.2.0-r2b-demonstration');
  insert into public.routing_answers (id, assessment_id, question_id, option_id, operation, sequence, answered_at, client_event_id, supersedes_record_id, knowledge_version) values
    ('00000000-0000-4000-8000-00000000d003', a_route, 'joint-musculoskeletal-pain-spasm', null, 'cleared', 3, now(), gen_random_uuid(), '00000000-0000-4000-8000-00000000d002', '0.2.0-r2b-demonstration');
end
$setup$;

-- Browser roles cannot execute any trusted function.
do $privileges$
declare
  fn text;
begin
  foreach fn in array array[
    'public.trusted_start_assessment(uuid,uuid,uuid,text,text)',
    'public.trusted_evidence_is_active(uuid,text,uuid)',
    'public.trusted_evidence_is_current(uuid,integer,integer,integer)',
    'public.trusted_record_safety_event(uuid,uuid,uuid,integer,integer,integer,text[],text,text,text,text,text,timestamptz,jsonb)',
    'public.trusted_finalize_routing(uuid,uuid,uuid,integer,integer,integer,text,text,text,double precision,double precision,double precision,double precision,double precision,double precision,uuid[])'
  ] loop
    if has_function_privilege('anon', fn, 'execute') or has_function_privilege('authenticated', fn, 'execute')
      or has_function_privilege('public', fn, 'execute') then
      raise exception 'browser role can execute %', fn;
    end if;
    if not has_function_privilege('service_role', fn, 'execute') then
      raise exception 'service_role cannot execute %', fn;
    end if;
    if exists (select 1 from pg_proc where oid = fn::regprocedure and (prosecdef or proconfig is null
      or not ('search_path=""' = any(proconfig)))) then
      raise exception 'unsafe function definition %', fn;
    end if;
  end loop;
end
$privileges$;

set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('r9ga.pa'), true);
select set_config('request.jwt.claims', jsonb_build_object(
  'sub', current_setting('r9ga.pa'), 'role', 'authenticated', 'is_anonymous', true)::text, true);
do $browser$
begin
  begin
    perform public.trusted_start_assessment(current_setting('r9ga.a_start')::uuid,
      current_setting('r9ga.pa')::uuid, gen_random_uuid(), 'headache', 'bridge-resolved');
    raise exception 'authenticated patient executed a trusted function';
  exception when insufficient_privilege then null;
  end;
end
$browser$;
reset role;

set local role service_role;
do $start$
declare
  pa uuid := current_setting('r9ga.pa')::uuid;
  pb uuid := current_setting('r9ga.pb')::uuid;
  a uuid := current_setting('r9ga.a_start')::uuid;
  k uuid := gen_random_uuid();
begin
  perform pg_temp.expect(public.trusted_start_assessment(a, pb, k, 'headache', 'bridge-resolved'), 'ASSESSMENT_NOT_FOUND', 'start as other patient');
  perform pg_temp.expect(public.trusted_start_assessment(gen_random_uuid(), pa, k, 'headache', 'bridge-resolved'), 'ASSESSMENT_NOT_FOUND', 'start unknown');
  perform pg_temp.expect(public.trusted_start_assessment(a, pa, k, 'headache', 'kiosk-asserted'), 'INVALID_REQUEST', 'start bad source');
  perform pg_temp.expect(public.trusted_start_assessment(a, pa, k, 'skin-concern', 'bridge-resolved'), 'COMPLAINT_NOT_SUPPORTED', 'start disabled complaint');
  perform pg_temp.expect(public.trusted_start_assessment(a, pa, k, 'chest-pain', 'bridge-resolved'), 'COMPLAINT_NOT_SUPPORTED', 'start unknown complaint');
  perform pg_temp.expect(public.trusted_start_assessment(current_setting('r9ga.a_kiosk')::uuid, pa, k, 'headache', 'bridge-resolved'), 'UNSUPPORTED_DEPLOYMENT', 'start kiosk');
  perform pg_temp.expect(public.trusted_start_assessment(a, pa, k, 'headache', 'patient-stated'), 'applied', 'start');
  if (select status || complaint_id || complaint_source from public.assessment_sessions where id = a) <> 'in_progressheadachepatient-stated' then
    raise exception 'start did not set service-owned fields';
  end if;
  if (select count(*) from public.audit_events where assessment_id = a and kind = 'assessment_transition'
      and from_status = 'created' and to_status = 'in_progress' and actor_staff_profile_id is null) <> 1 then
    raise exception 'start audit missing';
  end if;
  perform pg_temp.expect(public.trusted_start_assessment(a, pa, k, 'headache', 'patient-stated'), 'replayed', 'start replay');
  perform pg_temp.expect(public.trusted_start_assessment(a, pa, k, 'headache', 'bridge-resolved'), 'IDEMPOTENCY_CONFLICT', 'start conflicting reuse');
  perform pg_temp.expect(public.trusted_start_assessment(a, pa, gen_random_uuid(), 'headache', 'patient-stated'), 'INVALID_STATE', 'start twice');
  if (select count(*) from public.audit_events where assessment_id = a) <> 1 then
    raise exception 'start duplicated audit';
  end if;
end
$start$;

do $safety$
declare
  pa uuid := current_setting('r9ga.pa')::uuid;
  pb uuid := current_setting('r9ga.pb')::uuid;
  a uuid := current_setting('r9ga.a_safety')::uuid;
  k uuid := gen_random_uuid();
  good jsonb := '[{"table":"safety_answers","id":"00000000-0000-4000-8000-00000000a001"}]';
  fired text[] := array['headache-sudden-extremely-painful'];
  first_id text;
begin
  perform pg_temp.expect(public.trusted_record_safety_event(a, pb, k, 0, 3, 0, fired, fired[1], '0.1.0-r3-safety-demonstration',
    'india-emergency-112', 'emergency', 'must_stop', now(), good), 'ASSESSMENT_NOT_FOUND', 'safety as other patient');
  perform pg_temp.expect(public.trusted_record_safety_event(a, pa, k, 0, 3, 0, fired, fired[1], 'v', 'p', 'emergency', 'must_stop', now(),
    '[{"table":"safety_answers","id":"00000000-0000-4000-8000-00000000b001"}]'), 'INVALID_EVIDENCE', 'safety cites other assessment');
  perform pg_temp.expect(public.trusted_record_safety_event(a, pa, k, 0, 3, 0, fired, fired[1], 'v', 'p', 'emergency', 'must_stop', now(),
    '[{"table":"safety_answers","id":"00000000-0000-4000-8000-00000000a002"}]'), 'INVALID_EVIDENCE', 'safety cites superseded answer');
  perform pg_temp.expect(public.trusted_record_safety_event(a, pa, k, 0, 3, 0, fired, fired[1], 'v', 'p', 'emergency', 'must_stop', now(),
    '[{"table":"audit_events","id":"00000000-0000-4000-8000-00000000a001"}]'), 'INVALID_EVIDENCE', 'safety cites wrong table');
  perform pg_temp.expect(public.trusted_record_safety_event(a, pa, k, 0, 3, 0, fired, fired[1], 'v', 'p', 'emergency', 'must_stop', now(),
    '[]'), 'INVALID_EVIDENCE', 'safety without evidence');
  perform pg_temp.expect(public.trusted_record_safety_event(a, pa, k, 0, 2, 0, fired, fired[1], 'v', 'p', 'emergency', 'must_stop', now(),
    good), 'STALE_EVIDENCE', 'safety with stale high water');
  perform pg_temp.expect(public.trusted_record_safety_event(current_setting('r9ga.a_start')::uuid, pa, gen_random_uuid(), 0, 0, 0, fired, fired[1],
    'v', 'p', 'emergency', 'must_stop', now(), good), 'INVALID_EVIDENCE', 'safety cites another of my assessments');

  perform pg_temp.expect(public.trusted_record_safety_event(a, pa, k, 0, 3, 0, fired, fired[1], '0.1.0-r3-safety-demonstration',
    'india-emergency-112', 'emergency', 'must_stop', now(), good), 'applied', 'safety');
  select id::text into first_id from public.safety_events where assessment_id = a;
  if (select status from public.assessment_sessions where id = a) <> 'priority_escalated'
    or (select count(*) from public.safety_event_evidence where assessment_id = a) <> 1
    or (select count(*) from public.audit_events where assessment_id = a and to_status = 'priority_escalated') <> 1 then
    raise exception 'safety write incomplete';
  end if;
  perform pg_temp.expect(public.trusted_record_safety_event(a, pa, k, 0, 3, 0, fired, fired[1], '0.1.0-r3-safety-demonstration',
    'india-emergency-112', 'emergency', 'must_stop', now(), good), 'replayed', 'safety replay');
  perform pg_temp.expect(public.trusted_record_safety_event(a, pa, k, 0, 3, 0, fired, fired[1], '0.1.0-r3-safety-demonstration',
    'urgent-assessment', 'urgent', 'must_stop', now(), good), 'IDEMPOTENCY_CONFLICT', 'safety conflicting reuse');
  if (public.trusted_record_safety_event(a, pa, gen_random_uuid(), 0, 3, 0, fired, fired[1], '0.1.0-r3-safety-demonstration',
    'india-emergency-112', 'emergency', 'must_stop', now(), good) ->> 'safetyEventId') <> first_id then
    raise exception 'second key created or hid the existing event';
  end if;
  if (select count(*) from public.safety_events where assessment_id = a) <> 1 then
    raise exception 'duplicate safety event';
  end if;
  perform pg_temp.expect(public.trusted_finalize_routing(a, pa, gen_random_uuid(), 0, 3, 0, 'general-medicine', 'neurology', 'max_questions',
    0, 0, 1, 0, 0, 0, array[]::uuid[]), 'INVALID_STATE', 'finalize after escalation');

  perform pg_temp.expect(public.trusted_record_safety_event(current_setting('r9ga.a_stale')::uuid, pa, gen_random_uuid(), 0, 0, 0, fired, fired[1],
    'v', 'p', 'emergency', 'must_stop', now(),
    '[{"table":"safety_answers","id":"00000000-0000-4000-8000-00000000c001"}]'), 'STALE_EVIDENCE', 'safety evidence arrived after derivation');
end
$safety$;

do $routing$
declare
  pa uuid := current_setting('r9ga.pa')::uuid;
  pb uuid := current_setting('r9ga.pb')::uuid;
  a uuid := current_setting('r9ga.a_route')::uuid;
  k uuid := gen_random_uuid();
  support uuid[] := array['00000000-0000-4000-8000-00000000d001']::uuid[];
begin
  perform pg_temp.expect(public.trusted_finalize_routing(a, pb, k, 3, 0, 0, 'orthopaedics', 'orthopedics', 'top_probability',
    0, 0, 0, 0, 1, 0, support), 'ASSESSMENT_NOT_FOUND', 'finalize as other patient');
  perform pg_temp.expect(public.trusted_finalize_routing(a, pa, k, 3, 0, 0, 'dermatology', 'dermatology', 'top_probability',
    0, 0, 0, 0, 0, 1, support), 'INVALID_EVIDENCE', 'finalize to disabled specialty');
  perform pg_temp.expect(public.trusted_finalize_routing(a, pa, k, 3, 0, 0, 'orthopaedics', 'cardiology', 'top_probability',
    1, 0, 0, 0, 0, 0, support), 'INVALID_EVIDENCE', 'finalize endpoint not the engine top');
  perform pg_temp.expect(public.trusted_finalize_routing(a, pa, k, 3, 0, 0, 'cardiology', 'cardiology', 'top_probability',
    1, 0, 0, 0, 0, 0, support), 'INVALID_EVIDENCE', 'finalize to a specialty that does not serve the complaint');
  perform pg_temp.expect(public.trusted_finalize_routing(a, pa, k, 3, 0, 0, 'orthopaedics', 'orthopedics', 'top_probability',
    0, 0, 0, 0, 1, 0, array['00000000-0000-4000-8000-00000000d002']::uuid[]), 'INVALID_EVIDENCE', 'finalize cites superseded answer');
  perform pg_temp.expect(public.trusted_finalize_routing(a, pa, k, 3, 0, 0, 'orthopaedics', 'orthopedics', 'top_probability',
    0, 0, 0, 0, 1, 0, array['00000000-0000-4000-8000-00000000b002']::uuid[]), 'INVALID_EVIDENCE', 'finalize cites another assessment');
  perform pg_temp.expect(public.trusted_finalize_routing(a, pa, k, 3, 0, 0, 'orthopaedics', 'orthopedics', 'top_probability',
    0, 0, 0, 0, 1, 0, array['00000000-0000-4000-8000-00000000d001', '00000000-0000-4000-8000-00000000d001']::uuid[]), 'INVALID_EVIDENCE', 'finalize duplicate support');
  perform pg_temp.expect(public.trusted_finalize_routing(a, pa, k, 2, 0, 0, 'orthopaedics', 'orthopedics', 'top_probability',
    0, 0, 0, 0, 1, 0, support), 'STALE_EVIDENCE', 'finalize stale');
  perform pg_temp.expect(public.trusted_finalize_routing(current_setting('r9ga.a_start')::uuid, pa, gen_random_uuid(), 0, 0, 0,
    'neurology', 'neurology', 'top_probability', 0, 0, 1, 0, 0, 0, array[]::uuid[]), 'applied', 'finalize started assessment (no evidence)');

  perform pg_temp.expect(public.trusted_finalize_routing(a, pa, k, 3, 0, 0, 'orthopaedics', 'orthopedics', 'top_probability',
    0, 0, 0, 0, 1, 0, support), 'applied', 'finalize');
  if (select status from public.assessment_sessions where id = a) <> 'routing_complete'
    or (select count(*) from public.routing_result_supporting_answers where assessment_id = a) <> 1
    or (select count(*) from public.audit_events where assessment_id = a and to_status = 'routing_complete') <> 1 then
    raise exception 'finalize write incomplete';
  end if;
  perform pg_temp.expect(public.trusted_finalize_routing(a, pa, k, 3, 0, 0, 'orthopaedics', 'orthopedics', 'top_probability',
    0, 0, 0, 0, 1, 0, support), 'replayed', 'finalize replay');
  perform pg_temp.expect(public.trusted_finalize_routing(a, pa, k, 3, 0, 0, 'general-medicine', 'orthopedics', 'max_questions',
    0, 0, 0, 0, 1, 0, support), 'IDEMPOTENCY_CONFLICT', 'finalize conflicting reuse');
  perform pg_temp.expect(public.trusted_finalize_routing(a, pa, gen_random_uuid(), 3, 0, 0, 'orthopaedics', 'orthopedics', 'top_probability',
    0, 0, 0, 0, 1, 0, support), 'existing', 'finalize second key');
  if (select count(*) from public.routing_results where assessment_id = a) <> 1 then
    raise exception 'duplicate routing result';
  end if;
  perform pg_temp.expect(public.trusted_record_safety_event(a, pa, gen_random_uuid(), 3, 0, 0, array['joint-sudden-hot-swollen'],
    'joint-sudden-hot-swollen', 'v', 'p', 'urgent', 'must_stop', now(),
    '[{"table":"routing_answers","id":"00000000-0000-4000-8000-00000000d001"}]'), 'INVALID_STATE', 'safety after finalization');

  -- General Medicine is accepted whatever the engine top was.
  perform pg_temp.expect(public.trusted_finalize_routing(current_setting('r9ga.a_gm')::uuid, pa, gen_random_uuid(), 1, 0, 0,
    'general-medicine', 'dermatology', 'max_questions', 0.2, 0.2, 0.2, 0.2, 0.0, 0.2,
    array['00000000-0000-4000-8000-00000000e001']::uuid[]), 'applied', 'finalize general medicine fallback');
end
$routing$;
reset role;

select 'R9G-A TRUSTED OPERATION HARNESS PASSED' as result;
rollback;
