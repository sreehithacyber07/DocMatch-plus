-- R9F trusted staff handoff transitions: one transaction, always rolled back.
-- Run with `supabase db query --linked --file supabase/tests/r9f_staff_handoff.sql`.
begin;

create function pg_temp.expect(value jsonb, wanted text, label text)
returns void language plpgsql as $$
begin
  if coalesce(value ->> 'code', value ->> 'outcome') is distinct from wanted then
    raise exception 'R9F % wanted %, got %', label, wanted, value;
  end if;
end;
$$;

do $setup$
declare
  fa uuid := gen_random_uuid();
  fb uuid := gen_random_uuid();
  staff_a uuid := gen_random_uuid();
  staff_a2 uuid := gen_random_uuid();
  staff_b uuid := gen_random_uuid();
  disabled uuid := gen_random_uuid();
  admin_user uuid := gen_random_uuid();
  outsider uuid := gen_random_uuid();
  patient uuid := gen_random_uuid();
  assessment_a uuid := gen_random_uuid();
  assessment_b uuid := gen_random_uuid();
  result_a uuid := gen_random_uuid();
  result_b uuid := gen_random_uuid();
  soap_a uuid := gen_random_uuid();
  soap_b uuid := gen_random_uuid();
  handoff_a uuid := gen_random_uuid();
  handoff_b uuid := gen_random_uuid();
  note jsonb := jsonb_build_object(
    'S', jsonb_build_array(jsonb_build_object('label', 'Main concern', 'value', 'Headache')),
    'O', jsonb_build_array(jsonb_build_object('label', 'Measurements', 'value', 'No vital signs, measurements or examination findings were captured by DocMatch+.')),
    'A', jsonb_build_array(jsonb_build_object('label', 'Routing assessment', 'value', 'Neurology is the next clinical direction.')),
    'P', jsonb_build_array(jsonb_build_object('label', 'Handoff', 'value', 'Prepared for clinical handoff.')));
begin
  perform set_config('r9f.fa', fa::text, true);
  perform set_config('r9f.fb', fb::text, true);
  perform set_config('r9f.staff_a', staff_a::text, true);
  perform set_config('r9f.staff_a2', staff_a2::text, true);
  perform set_config('r9f.staff_b', staff_b::text, true);
  perform set_config('r9f.disabled', disabled::text, true);
  perform set_config('r9f.admin_user', admin_user::text, true);
  perform set_config('r9f.outsider', outsider::text, true);
  perform set_config('r9f.patient', patient::text, true);
  perform set_config('r9f.handoff_a', handoff_a::text, true);
  perform set_config('r9f.handoff_b', handoff_b::text, true);
  perform set_config('r9f.assessment_a', assessment_a::text, true);

  insert into auth.users (id, is_anonymous, raw_user_meta_data) values
    (staff_a, false, '{"_r9f_test":true}'::jsonb),
    (staff_a2, false, '{"_r9f_test":true}'::jsonb),
    (staff_b, false, '{"_r9f_test":true}'::jsonb),
    (disabled, false, '{"_r9f_test":true}'::jsonb),
    (admin_user, false, '{"_r9f_test":true}'::jsonb),
    -- A permanent account that claims staff rights in editable metadata.
    (outsider, false, '{"_r9f_test":true,"role":"clinical_staff","facility_id":"spoofed"}'::jsonb),
    (patient, true, '{"_r9f_test":true}'::jsonb);
  insert into public.facilities (id, display_name, enabled) values
    (fa, 'R9F rollback facility A', true),
    (fb, 'R9F rollback facility B', true);
  insert into public.staff_profiles (auth_user_id, facility_id, role, enabled) values
    (staff_a, fa, 'clinical_staff', true),
    (staff_a2, fa, 'clinical_staff', true),
    (staff_b, fb, 'clinical_staff', true),
    (disabled, fa, 'clinical_staff', false),
    (admin_user, fa, 'facility_admin', true);

  -- Facility-bound assessments are the only ones a handoff can reference.
  insert into public.assessment_sessions (
    id, contract_version, facility_id, owner_auth_user_id, deployment_mode, status,
    complaint_id, complaint_source, engine_version, knowledge_version, safety_version
  ) values
    (assessment_a, 'r9f-test-only', fa, null, 'hospital-kiosk', 'handoff_prepared',
      'headache', 'bridge-resolved', '1.0.0-r1', '0.2.0-r2b-demonstration', '0.1.0-r3-safety-demonstration'),
    (assessment_b, 'r9f-test-only', fb, null, 'hospital-kiosk', 'handoff_prepared',
      'headache', 'bridge-resolved', '1.0.0-r1', '0.2.0-r2b-demonstration', '0.1.0-r3-safety-demonstration');
  insert into public.routing_results (
    id, assessment_id, selected_specialty_registry_id, engine_top_specialty_id, stop_reason,
    belief_cardiology, belief_pulmonology, belief_neurology,
    belief_gastroenterology, belief_orthopedics, belief_dermatology, generated_at, client_event_id
  ) values
    (result_a, assessment_a, 'neurology', 'neurology', 'top_probability', 0, 0, 1, 0, 0, 0, now(), gen_random_uuid()),
    (result_b, assessment_b, 'neurology', 'neurology', 'top_probability', 0, 0, 1, 0, 0, 0, now(), gen_random_uuid());
  insert into public.soap_handoffs (
    id, assessment_id, routing_result_id, soap_schema_version, sections, generated_at, client_event_id
  ) values
    (soap_a, assessment_a, result_a, '1.0.0-r9e', note, now(), gen_random_uuid()),
    (soap_b, assessment_b, result_b, '1.0.0-r9e', note, now(), gen_random_uuid());
  insert into public.clinical_handoffs (id, assessment_id, soap_handoff_id, facility_id, status) values
    (handoff_a, assessment_a, soap_a, fa, 'prepared'),
    (handoff_b, assessment_b, soap_b, fb, 'prepared');
end
$setup$;

do $privileges$
declare
  fn text;
begin
  foreach fn in array array[
    'public.trusted_staff_identity(uuid)',
    'public.trusted_staff_workspace(uuid)',
    'public.trusted_transition_handoff(uuid,uuid,uuid,text,text)',
    'public.trusted_open_handoff(uuid,uuid,uuid)',
    'public.trusted_acknowledge_handoff(uuid,uuid,uuid)'
  ] loop
    if has_function_privilege('anon', fn, 'execute')
      or has_function_privilege('authenticated', fn, 'execute')
      or has_function_privilege('public', fn, 'execute') then
      raise exception 'R9F browser role can execute %', fn;
    end if;
    if not has_function_privilege('service_role', fn, 'execute') then
      raise exception 'R9F service_role cannot execute %', fn;
    end if;
    -- Every function pins search_path; only the auth.users reader is definer.
    if exists (select 1 from pg_proc where oid = fn::regprocedure
      and (proconfig is null or not ('search_path=""' = any(proconfig)))) then
      raise exception 'R9F function does not pin search_path: %', fn;
    end if;
    if fn <> 'public.trusted_staff_identity(uuid)'
      and exists (select 1 from pg_proc where oid = fn::regprocedure and prosecdef) then
      raise exception 'R9F unexpected security definer: %', fn;
    end if;
  end loop;
end
$privileges$;

-- A signed-in browser session cannot reach the transitions at all.
set local role authenticated;
select set_config('request.jwt.claims', jsonb_build_object(
  'sub', current_setting('r9f.staff_a'), 'role', 'authenticated', 'is_anonymous', false)::text, true);
do $browser$
begin
  begin
    perform public.trusted_open_handoff(current_setting('r9f.handoff_a')::uuid,
      current_setting('r9f.staff_a')::uuid, gen_random_uuid());
    raise exception 'R9F authenticated role executed a trusted transition';
  exception when insufficient_privilege then null;
  end;
end
$browser$;
reset role;

set local role service_role;
do $authorization$
declare
  handoff_a uuid := current_setting('r9f.handoff_a')::uuid;
  key uuid := gen_random_uuid();
begin
  perform pg_temp.expect(public.trusted_open_handoff(handoff_a, current_setting('r9f.outsider')::uuid, key),
    'STAFF_REQUIRED', 'permanent non-staff with spoofed metadata');
  perform pg_temp.expect(public.trusted_open_handoff(handoff_a, current_setting('r9f.patient')::uuid, key),
    'STAFF_REQUIRED', 'anonymous patient');
  perform pg_temp.expect(public.trusted_open_handoff(handoff_a, current_setting('r9f.disabled')::uuid, key),
    'STAFF_REQUIRED', 'disabled staff');
  perform pg_temp.expect(public.trusted_open_handoff(handoff_a, current_setting('r9f.admin_user')::uuid, key),
    'STAFF_REQUIRED', 'facility_admin has no clinical access');
  perform pg_temp.expect(public.trusted_open_handoff(handoff_a, gen_random_uuid(), key),
    'STAFF_REQUIRED', 'unknown actor');
  perform pg_temp.expect(public.trusted_open_handoff(handoff_a, current_setting('r9f.staff_b')::uuid, key),
    'HANDOFF_NOT_FOUND', 'other facility staff');
  perform pg_temp.expect(public.trusted_open_handoff(gen_random_uuid(), current_setting('r9f.staff_a')::uuid, key),
    'HANDOFF_NOT_FOUND', 'unknown handoff');
  perform pg_temp.expect(public.trusted_acknowledge_handoff(handoff_a, current_setting('r9f.staff_a')::uuid, key),
    'INVALID_STATE', 'acknowledge before open');
  perform pg_temp.expect(public.trusted_staff_workspace(current_setting('r9f.outsider')::uuid),
    'STAFF_REQUIRED', 'workspace for non-staff');
  if (public.trusted_staff_workspace(current_setting('r9f.staff_a')::uuid) ->> 'facilityName')
    <> 'R9F rollback facility A' then
    raise exception 'R9F workspace context is wrong';
  end if;
  -- The linked project can contain unrelated audit history; only this fixture
  -- handoff must remain untouched by refused calls.
  if (select count(*) from public.audit_events where clinical_handoff_id = handoff_a) <> 0
    or (select status from public.clinical_handoffs where id = handoff_a) <> 'prepared' then
    raise exception 'R9F refused calls changed state';
  end if;
end
$authorization$;

do $lifecycle$
declare
  handoff_a uuid := current_setting('r9f.handoff_a')::uuid;
  assessment_a uuid := current_setting('r9f.assessment_a')::uuid;
  staff_a uuid := current_setting('r9f.staff_a')::uuid;
  staff_a2 uuid := current_setting('r9f.staff_a2')::uuid;
  staff_b uuid := current_setting('r9f.staff_b')::uuid;
  open_key uuid := gen_random_uuid();
  ack_key uuid := gen_random_uuid();
  profile_a uuid := (select id from public.staff_profiles where auth_user_id = current_setting('r9f.staff_a')::uuid);
  evidence_digest text;
begin
  select md5(string_agg(t, '|')) into evidence_digest from (
    select (select string_agg(sections::text, ',') from public.soap_handoffs) as t
    union all select (select string_agg(selected_specialty_registry_id || stop_reason, ',') from public.routing_results)
  ) digest;

  perform pg_temp.expect(public.trusted_open_handoff(handoff_a, staff_a, open_key), 'applied', 'open');
  if (select status from public.clinical_handoffs where id = handoff_a) <> 'opened' then
    raise exception 'R9F open did not transition';
  end if;
  if (select count(*) from public.audit_events where clinical_handoff_id = handoff_a
    and kind = 'handoff_transition' and from_status = 'prepared' and to_status = 'opened'
    and reason_code = 'handoff_opened' and actor_staff_profile_id = profile_a
    and assessment_id = assessment_a and override_action is null and override_reason is null) <> 1 then
    raise exception 'R9F open audit is missing or not minimal';
  end if;

  perform pg_temp.expect(public.trusted_open_handoff(handoff_a, staff_a, open_key), 'replayed', 'open replay');
  perform pg_temp.expect(public.trusted_acknowledge_handoff(handoff_a, staff_a, open_key),
    'IDEMPOTENCY_CONFLICT', 'key reused for another action');
  perform pg_temp.expect(public.trusted_open_handoff(handoff_a, staff_a, gen_random_uuid()), 'existing', 'second open key');
  perform pg_temp.expect(public.trusted_open_handoff(handoff_a, staff_a2, gen_random_uuid()),
    'existing', 'second reviewer in the same facility');
  if (select count(*) from public.audit_events where clinical_handoff_id = handoff_a) <> 1 then
    raise exception 'R9F repeated opens duplicated audit events';
  end if;

  perform pg_temp.expect(public.trusted_acknowledge_handoff(handoff_a, staff_b, gen_random_uuid()),
    'HANDOFF_NOT_FOUND', 'cross-facility acknowledgement');
  perform pg_temp.expect(public.trusted_acknowledge_handoff(handoff_a, staff_a, ack_key), 'applied', 'acknowledge');
  if (select status from public.clinical_handoffs where id = handoff_a) <> 'acknowledged' then
    raise exception 'R9F acknowledgement did not transition';
  end if;
  perform pg_temp.expect(public.trusted_acknowledge_handoff(handoff_a, staff_a, ack_key), 'replayed', 'acknowledge replay');
  perform pg_temp.expect(public.trusted_acknowledge_handoff(handoff_a, staff_a2, gen_random_uuid()),
    'existing', 'already acknowledged');
  perform pg_temp.expect(public.trusted_open_handoff(handoff_a, staff_a, gen_random_uuid()),
    'existing', 'open after acknowledgement never regresses');
  if (select count(*) from public.audit_events where clinical_handoff_id = handoff_a) <> 2
    or (select status from public.clinical_handoffs where id = handoff_a) <> 'acknowledged' then
    raise exception 'R9F acknowledgement duplicated events or regressed status';
  end if;

  -- Clinical evidence is untouched by review.
  if evidence_digest <> (select md5(string_agg(t, '|')) from (
      select (select string_agg(sections::text, ',') from public.soap_handoffs) as t
      union all select (select string_agg(selected_specialty_registry_id || stop_reason, ',') from public.routing_results)
    ) after_digest) then
    raise exception 'R9F review mutated clinical evidence';
  end if;

  -- Authorization is re-checked per call, never cached from an earlier one.
  update public.staff_profiles set enabled = false where auth_user_id = staff_a;
  perform pg_temp.expect(public.trusted_open_handoff(current_setting('r9f.handoff_b')::uuid, staff_a, gen_random_uuid()),
    'STAFF_REQUIRED', 'staff disabled after earlier success');
  update public.staff_profiles set enabled = true where auth_user_id = staff_a;
  update public.facilities set enabled = false where id = current_setting('r9f.fa')::uuid;
  perform pg_temp.expect(public.trusted_staff_workspace(staff_a), 'STAFF_REQUIRED', 'facility disabled');
  perform pg_temp.expect(public.trusted_open_handoff(handoff_a, staff_a, gen_random_uuid()),
    'STAFF_REQUIRED', 'facility disabled blocks transitions');
end
$lifecycle$;
reset role;

select 'R9F STAFF HANDOFF HARNESS PASSED' as result;
rollback;
