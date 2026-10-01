-- Run against the linked project with `supabase db query --linked --file`.
-- This is one transaction. All synthetic Auth, facility, and clinical rows roll back.
-- SET LOCAL ROLE + request.jwt.claims model PostgREST's verified JWT context;
-- this does not test token signature verification or anonymous Auth enrollment.
begin;

do $setup$
declare
  pa uuid := gen_random_uuid();
  pb uuid := gen_random_uuid();
  nonstaff uuid := gen_random_uuid();
  sa uuid := gen_random_uuid();
  sb uuid := gen_random_uuid();
  disabled_staff uuid := gen_random_uuid();
  facility_admin uuid := gen_random_uuid();
  s_pa uuid := gen_random_uuid(); s_pb uuid := gen_random_uuid();
  s_nonstaff uuid := gen_random_uuid(); s_sa uuid := gen_random_uuid(); s_sb uuid := gen_random_uuid();
  s_disabled uuid := gen_random_uuid(); s_admin uuid := gen_random_uuid();
  fa uuid := gen_random_uuid();
  fb uuid := gen_random_uuid();
  aa uuid := gen_random_uuid();
  ab uuid := gen_random_uuid();
  ra uuid := gen_random_uuid();
  rb uuid := gen_random_uuid();
  soapa uuid := gen_random_uuid();
  soapb uuid := gen_random_uuid();
  handoffa uuid := gen_random_uuid();
  handoffb uuid := gen_random_uuid();
begin
  perform set_config('r9c.pa', pa::text, true);
  perform set_config('r9c.pb', pb::text, true);
  perform set_config('r9c.nonstaff', nonstaff::text, true);
  perform set_config('r9c.sa', sa::text, true);
  perform set_config('r9c.sb', sb::text, true);
  perform set_config('r9c.disabled_staff', disabled_staff::text, true);
  perform set_config('r9c.facility_admin', facility_admin::text, true);
  perform set_config('r9c.s_pa', s_pa::text, true);
  perform set_config('r9c.s_pb', s_pb::text, true);
  perform set_config('r9c.s_nonstaff', s_nonstaff::text, true);
  perform set_config('r9c.s_sa', s_sa::text, true);
  perform set_config('r9c.s_sb', s_sb::text, true);
  perform set_config('r9c.s_disabled', s_disabled::text, true);
  perform set_config('r9c.s_admin', s_admin::text, true);
  perform set_config('r9c.fa', fa::text, true);
  perform set_config('r9c.fb', fb::text, true);
  perform set_config('r9c.aa', aa::text, true);
  perform set_config('r9c.ab', ab::text, true);

  insert into auth.users (id, is_anonymous, raw_user_meta_data) values
    (pa, true, '{"_r9c_test":true}'::jsonb),
    (pb, true, '{"_r9c_test":true}'::jsonb),
    (nonstaff, false, jsonb_build_object(
      '_r9c_test', true, 'role', 'clinical_staff', 'facility_id', fa)),
    (sa, false, '{"_r9c_test":true}'::jsonb),
    (sb, false, '{"_r9c_test":true}'::jsonb),
    (disabled_staff, false, '{"_r9c_test":true}'::jsonb),
    (facility_admin, false, '{"_r9c_test":true}'::jsonb);
  insert into auth.sessions(id,user_id) values
    (s_pa,pa),(s_pb,pb),(s_nonstaff,nonstaff),(s_sa,sa),(s_sb,sb),
    (s_disabled,disabled_staff),(s_admin,facility_admin);
  insert into public.facilities (id, display_name) values
    (fa, 'R9C rollback-only facility A'), (fb, 'R9C rollback-only facility B');
  insert into public.staff_profiles (auth_user_id, facility_id, role, enabled) values
    (sa, fa, 'clinical_staff', true),
    (sb, fb, 'clinical_staff', true),
    (disabled_staff, fa, 'clinical_staff', false),
    (facility_admin, fa, 'facility_admin', true);
  insert into public.assessment_sessions
    (id, contract_version, facility_id, owner_auth_user_id, deployment_mode,
     engine_version, knowledge_version, safety_version)
  values
    (aa, 'r9c-test-only', fa, pa, 'hospital-kiosk', 'test', 'test', 'test'),
    (ab, 'r9c-test-only', fb, pb, 'hospital-kiosk', 'test', 'test', 'test');
  insert into public.routing_answers
    (assessment_id, question_id, option_id, operation, sequence,
     answered_at, client_event_id, knowledge_version)
  values
    (aa, 'test-question', 'yes', 'selected', 1, now(), gen_random_uuid(), 'test'),
    (ab, 'test-question', 'no', 'selected', 1, now(), gen_random_uuid(), 'test');
  insert into public.safety_events
    (assessment_id, fired_rule_ids, selected_rule_id, rule_version, payload_id,
     severity, continuation_policy, assessment_status_at_trigger, triggered_at, client_event_id)
  values
    (aa, array['test-rule'], 'test-rule', 'test', 'test', 'urgent', 'must_stop', 'created', now(), gen_random_uuid()),
    (ab, array['test-rule'], 'test-rule', 'test', 'test', 'urgent', 'must_stop', 'created', now(), gen_random_uuid());
  insert into public.routing_results
    (id, assessment_id, selected_specialty_registry_id, engine_top_specialty_id,
     stop_reason, belief_cardiology, belief_pulmonology, belief_neurology,
     belief_gastroenterology, belief_orthopedics, belief_dermatology,
     generated_at, client_event_id)
  values
    (ra, aa, 'cardiology', 'cardiology', 'top_probability', 1, 0, 0, 0, 0, 0, now(), gen_random_uuid()),
    (rb, ab, 'cardiology', 'cardiology', 'top_probability', 1, 0, 0, 0, 0, 0, now(), gen_random_uuid());
  insert into public.soap_handoffs
    (id, assessment_id, routing_result_id, soap_schema_version,
     sections, generated_at, client_event_id)
  values
    (soapa, aa, ra, 'test', '{"S":[],"O":[],"A":[],"P":[]}'::jsonb, now(), gen_random_uuid()),
    (soapb, ab, rb, 'test', '{"S":[],"O":[],"A":[],"P":[]}'::jsonb, now(), gen_random_uuid());
  insert into public.clinical_handoffs
    (id, assessment_id, soap_handoff_id, facility_id)
  values (handoffa, aa, soapa, fa), (handoffb, ab, soapb, fb);
  insert into public.audit_events
    (assessment_id, kind, from_status, to_status, occurred_at, client_event_id)
  values
    (aa, 'assessment_transition', 'created', 'in_progress', now(), gen_random_uuid()),
    (ab, 'assessment_transition', 'created', 'in_progress', now(), gen_random_uuid());
end
$setup$;

set local role anon;
do $public$
declare table_name text;
begin
  foreach table_name in array array[
    'assessment_sessions', 'body_selections', 'intake_answers',
    'routing_answers', 'safety_answers', 'safety_events',
    'safety_event_evidence', 'routing_results',
    'routing_result_supporting_answers', 'soap_handoffs',
    'clinical_handoffs', 'audit_events', 'staff_profiles'
  ] loop
    begin
      execute format('select count(*) from public.%I', table_name);
      raise exception 'public read of % succeeded', table_name;
    exception when insufficient_privilege then null;
    end;
  end loop;
  begin
    insert into public.assessment_sessions
      (contract_version, deployment_mode, engine_version, knowledge_version, safety_version)
    values ('r9c-test-only', 'web/self-service', 'test', 'test', 'test');
    raise exception 'public assessment write succeeded';
  exception when insufficient_privilege then null;
  end;
end
$public$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('r9c.pa'), true);
select set_config('request.jwt.claims', jsonb_build_object(
  'sub', current_setting('r9c.pa'), 'role', 'authenticated', 'is_anonymous', true,
  'session_id', current_setting('r9c.s_pa')
)::text, true);
do $patient_a$
declare own_new uuid;
begin
  if not (select private.is_anonymous_patient()) then raise exception 'patient A identity rejected'; end if;
  insert into public.assessment_sessions
    (contract_version, owner_auth_user_id, deployment_mode,
     engine_version, knowledge_version, safety_version)
  values ('r9c-test-only', current_setting('r9c.pa')::uuid,
          'web/self-service', 'test', 'test', 'test')
  returning id into own_new;
  if (select count(*) from public.assessment_sessions where id = own_new) <> 1
     or (select count(*) from public.assessment_sessions where id = current_setting('r9c.ab')::uuid) <> 0
  then raise exception 'patient A assessment read isolation failed'; end if;
  begin
    insert into public.assessment_sessions
      (contract_version, owner_auth_user_id, deployment_mode,
       engine_version, knowledge_version, safety_version)
    values ('r9c-test-only', current_setting('r9c.pb')::uuid,
            'web/self-service', 'test', 'test', 'test');
    raise exception 'patient A forged patient B ownership';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.assessment_sessions
      (contract_version, owner_auth_user_id, deployment_mode, facility_id,
       engine_version, knowledge_version, safety_version)
    values ('r9c-test-only', current_setting('r9c.pa')::uuid,
            'web/self-service', current_setting('r9c.fa')::uuid, 'test', 'test', 'test');
    raise exception 'patient A forged a facility association';
  exception when insufficient_privilege then null;
  end;
  insert into public.routing_answers
    (assessment_id, question_id, option_id, operation, sequence,
     answered_at, client_event_id, knowledge_version)
  values (own_new, 'test-question', 'yes', 'selected', 1, now(), gen_random_uuid(), 'test');
  insert into public.body_selections
    (assessment_id, region_id, view, precision, body_domain_version,
     captured_at, client_event_id)
  values (own_new, 'test-region', 'front', 'general-area', 'test', now(), gen_random_uuid());
  insert into public.safety_answers
    (assessment_id, question_id, option_id, operation, sequence,
     answered_at, client_event_id, safety_version)
  values (own_new, 'test-safety-question', 'yes', 'selected', 1, now(), gen_random_uuid(), 'test');
  begin
    insert into public.body_selections
      (assessment_id, region_id, view, precision, body_domain_version,
       captured_at, client_event_id)
    values (current_setting('r9c.ab')::uuid, 'test-region', 'front',
            'general-area', 'test', now(), gen_random_uuid());
    raise exception 'patient A wrote patient B body selection';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.safety_answers
      (assessment_id, question_id, option_id, operation, sequence,
       answered_at, client_event_id, safety_version)
    values (current_setting('r9c.ab')::uuid, 'test-safety-question', 'yes',
            'selected', 2, now(), gen_random_uuid(), 'test');
    raise exception 'patient A wrote patient B safety answer';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.routing_answers
      (assessment_id, question_id, option_id, operation, sequence,
       answered_at, client_event_id, knowledge_version)
    values (current_setting('r9c.ab')::uuid, 'test-question', 'yes', 'selected',
            2, now(), gen_random_uuid(), 'test');
    raise exception 'patient A wrote into patient B answers';
  exception when insufficient_privilege then null;
  end;
  if (select count(*) from public.routing_answers where assessment_id = current_setting('r9c.ab')::uuid) <> 0
     or (select count(*) from public.safety_events where assessment_id = current_setting('r9c.ab')::uuid) <> 0
     or (select count(*) from public.soap_handoffs where assessment_id = current_setting('r9c.ab')::uuid) <> 0
     or (select count(*) from public.routing_results where assessment_id = current_setting('r9c.ab')::uuid) <> 0
  then raise exception 'patient A saw patient B child data'; end if;
  begin
    insert into public.safety_events (assessment_id) values (own_new);
    raise exception 'patient A fabricated safety event';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.routing_results (assessment_id) values (own_new);
    raise exception 'patient A fabricated routing result';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.soap_handoffs (assessment_id) values (own_new);
    raise exception 'patient A fabricated SOAP';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.safety_event_evidence (assessment_id)
    values (current_setting('r9c.ab')::uuid);
    raise exception 'patient A inserted patient B safety evidence';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.routing_result_supporting_answers (assessment_id)
    values (current_setting('r9c.ab')::uuid);
    raise exception 'patient A inserted patient B route support';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.assessment_sessions set owner_auth_user_id = current_setting('r9c.pb')::uuid
    where id = own_new;
    raise exception 'patient A changed assessment owner';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.safety_events where assessment_id = current_setting('r9c.aa')::uuid;
    raise exception 'patient A deleted safety history';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.routing_answers set option_id = 'no'
    where assessment_id = current_setting('r9c.aa')::uuid;
    raise exception 'patient A rewrote routing history';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.clinical_handoffs set status = 'acknowledged'
    where assessment_id = current_setting('r9c.aa')::uuid;
    raise exception 'patient A forged handoff acknowledgement';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.staff_profiles (auth_user_id, facility_id, role)
    values (current_setting('r9c.pa')::uuid, current_setting('r9c.fa')::uuid, 'clinical_staff');
    raise exception 'patient A self-provisioned staff';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.specialties set routing_enabled = true where id = 'dermatology';
    raise exception 'patient A changed reference registry';
  exception when insufficient_privilege then null;
  end;
end
$patient_a$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('r9c.pb'), true);
select set_config('request.jwt.claims', jsonb_build_object(
  'sub', current_setting('r9c.pb'), 'role', 'authenticated', 'is_anonymous', true,
  'session_id', current_setting('r9c.s_pb')
)::text, true);
do $patient_b$
begin
  if (select count(*) from public.assessment_sessions where id = current_setting('r9c.ab')::uuid) <> 1
     or (select count(*) from public.assessment_sessions where id = current_setting('r9c.aa')::uuid) <> 0
     or (select count(*) from public.soap_handoffs where assessment_id = current_setting('r9c.aa')::uuid) <> 0
  then raise exception 'patient B symmetric isolation failed'; end if;
  insert into public.intake_answers
    (assessment_id, question_id, option_id, operation, sequence,
     answered_at, client_event_id, category)
  values (current_setting('r9c.ab')::uuid, 'test-intake', 'yes', 'selected',
          1, now(), gen_random_uuid(), 'character');
  begin
    insert into public.intake_answers
      (assessment_id, question_id, option_id, operation, sequence,
       answered_at, client_event_id, category)
    values (current_setting('r9c.aa')::uuid, 'test-intake', 'yes', 'selected',
            2, now(), gen_random_uuid(), 'character');
    raise exception 'patient B wrote patient A answer';
  exception when insufficient_privilege then null;
  end;
end
$patient_b$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('r9c.nonstaff'), true);
select set_config('request.jwt.claims', jsonb_build_object(
  'sub', current_setting('r9c.nonstaff'), 'role', 'authenticated',
  'is_anonymous', false, 'session_id', current_setting('r9c.s_nonstaff'),
  'user_metadata', jsonb_build_object('role', 'clinical_staff', 'facility_id', current_setting('r9c.fa'))
)::text, true);
do $nonstaff$
begin
  if (select count(*) from public.assessment_sessions) <> 0
     or (select count(*) from public.soap_handoffs) <> 0
     or (select private.clinician_facility_id()) is not null
  then raise exception 'non-staff gained patient access through metadata'; end if;
  begin
    insert into public.staff_profiles (auth_user_id, facility_id, role)
    values (current_setting('r9c.nonstaff')::uuid, current_setting('r9c.fa')::uuid, 'clinical_staff');
    raise exception 'non-staff self-provisioned profile';
  exception when insufficient_privilege then null;
  end;
end
$nonstaff$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('r9c.sa'), true);
select set_config('request.jwt.claims', jsonb_build_object(
  'sub', current_setting('r9c.sa'), 'role', 'authenticated', 'is_anonymous', false,
  'session_id', current_setting('r9c.s_sa')
)::text, true);
do $staff_a$
begin
  if (select count(*) from public.assessment_sessions where id = current_setting('r9c.aa')::uuid) <> 1
     or (select count(*) from public.assessment_sessions where id = current_setting('r9c.ab')::uuid) <> 0
     or (select count(*) from public.routing_answers where assessment_id = current_setting('r9c.aa')::uuid) <> 1
     or (select count(*) from public.routing_answers where assessment_id = current_setting('r9c.ab')::uuid) <> 0
     or (select count(*) from public.safety_events where assessment_id = current_setting('r9c.aa')::uuid) <> 1
     or (select count(*) from public.safety_events where assessment_id = current_setting('r9c.ab')::uuid) <> 0
     or (select count(*) from public.routing_results where assessment_id = current_setting('r9c.aa')::uuid) <> 1
     or (select count(*) from public.routing_results where assessment_id = current_setting('r9c.ab')::uuid) <> 0
     or (select count(*) from public.soap_handoffs where assessment_id = current_setting('r9c.aa')::uuid) <> 1
     or (select count(*) from public.soap_handoffs where assessment_id = current_setting('r9c.ab')::uuid) <> 0
     or (select count(*) from public.audit_events where assessment_id = current_setting('r9c.ab')::uuid) <> 0
     or (select count(*) from public.audit_events where assessment_id = current_setting('r9c.aa')::uuid) <> 1
     or (select count(*) from public.clinical_handoffs where assessment_id = current_setting('r9c.ab')::uuid) <> 0
  then raise exception 'staff A facility isolation failed'; end if;
  begin
    update public.clinical_handoffs set status = 'acknowledged'
    where assessment_id = current_setting('r9c.aa')::uuid;
    raise exception 'staff A bypassed trusted handoff transition';
  exception when insufficient_privilege then null;
  end;
end
$staff_a$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('r9c.sb'), true);
select set_config('request.jwt.claims', jsonb_build_object(
  'sub', current_setting('r9c.sb'), 'role', 'authenticated', 'is_anonymous', false,
  'session_id', current_setting('r9c.s_sb')
)::text, true);
do $staff_b$
begin
  if (select count(*) from public.assessment_sessions where id = current_setting('r9c.ab')::uuid) <> 1
     or (select count(*) from public.assessment_sessions where id = current_setting('r9c.aa')::uuid) <> 0
     or (select count(*) from public.routing_answers where assessment_id = current_setting('r9c.ab')::uuid) <> 1
     or (select count(*) from public.routing_answers where assessment_id = current_setting('r9c.aa')::uuid) <> 0
     or (select count(*) from public.safety_events where assessment_id = current_setting('r9c.ab')::uuid) <> 1
     or (select count(*) from public.safety_events where assessment_id = current_setting('r9c.aa')::uuid) <> 0
     or (select count(*) from public.routing_results where assessment_id = current_setting('r9c.ab')::uuid) <> 1
     or (select count(*) from public.routing_results where assessment_id = current_setting('r9c.aa')::uuid) <> 0
     or (select count(*) from public.soap_handoffs where assessment_id = current_setting('r9c.ab')::uuid) <> 1
     or (select count(*) from public.soap_handoffs where assessment_id = current_setting('r9c.aa')::uuid) <> 0
     or (select count(*) from public.audit_events where assessment_id = current_setting('r9c.aa')::uuid) <> 0
     or (select count(*) from public.audit_events where assessment_id = current_setting('r9c.ab')::uuid) <> 1
  then raise exception 'staff B facility isolation failed'; end if;
end
$staff_b$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('r9c.disabled_staff'), true);
select set_config('request.jwt.claims', jsonb_build_object(
  'sub', current_setting('r9c.disabled_staff'), 'role', 'authenticated', 'is_anonymous', false,
  'session_id', current_setting('r9c.s_disabled')
)::text, true);
do $disabled$
begin
  if (select count(*) from public.assessment_sessions) <> 0
     or (select count(*) from public.audit_events) <> 0
  then raise exception 'disabled staff retained facility access'; end if;
end
$disabled$;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('r9c.facility_admin'), true);
select set_config('request.jwt.claims', jsonb_build_object(
  'sub', current_setting('r9c.facility_admin'), 'role', 'authenticated', 'is_anonymous', false,
  'session_id', current_setting('r9c.s_admin')
)::text, true);
do $facility_admin$
begin
  if (select private.clinician_facility_id()) is not null
     or (select count(*) from public.assessment_sessions) <> 0
     or (select count(*) from public.audit_events) <> 0
  then raise exception 'facility admin gained unapproved clinical access'; end if;
end
$facility_admin$;
reset role;

set local role service_role;
do $service$
begin
  if (select count(*) from public.assessment_sessions where contract_version = 'r9c-test-only') < 2
     or not has_table_privilege('service_role', 'public.assessment_sessions', 'INSERT')
     or not has_table_privilege('service_role', 'public.soap_handoffs', 'UPDATE')
  then raise exception 'trusted service access missing'; end if;
end
$service$;
reset role;

rollback;
