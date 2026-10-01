-- R9E trusted SOAP handoff: one transaction, no retained test records.
begin;

create function pg_temp.expect(value jsonb, wanted text, label text)
returns void language plpgsql as $$
begin
  if coalesce(value ->> 'code', value ->> 'outcome') is distinct from wanted then
    raise exception 'R9E % wanted %, got %', label, wanted, value;
  end if;
end;
$$;

create function pg_temp.fail_prepared_audit()
returns trigger language plpgsql as $$
begin
  if new.reason_code = 'soap_handoff_prepared' then
    raise exception 'forced R9E audit failure';
  end if;
  return new;
end;
$$;

do $setup$
declare
  owner_id uuid := gen_random_uuid();
  other_id uuid := gen_random_uuid();
  assessment_uuid uuid := gen_random_uuid();
  result_id uuid := gen_random_uuid();
begin
  perform set_config('r9e.owner', owner_id::text, true);
  perform set_config('r9e.other', other_id::text, true);
  perform set_config('r9e.assessment', assessment_uuid::text, true);
  perform set_config('r9e.result', result_id::text, true);
  perform set_config('r9e.key', gen_random_uuid()::text, true);
  insert into auth.users (id, is_anonymous, raw_user_meta_data) values
    (owner_id, true, '{"_r9e_test":true}'::jsonb),
    (other_id, true, '{"_r9e_test":true}'::jsonb);
  insert into public.assessment_sessions (
    id, contract_version, owner_auth_user_id, deployment_mode, status,
    complaint_id, complaint_source, engine_version, knowledge_version, safety_version
  ) values (
    assessment_uuid, '1.0.0-r9d-assessment', owner_id, 'web/self-service', 'routing_complete',
    'upper-abdominal-pain', 'bridge-resolved', '1.0.0-r1',
    '0.2.0-r2b-demonstration', '0.1.0-r3-safety-demonstration'
  );
  insert into public.routing_answers (
    assessment_id, question_id, option_id, operation, sequence, answered_at,
    client_event_id, knowledge_version
  ) values (
    assessment_uuid, 'upper-abdominal-pain-burning', 'no', 'selected', 1, now(),
    gen_random_uuid(), '0.2.0-r2b-demonstration'
  );
  insert into public.routing_results (
    id, assessment_id, selected_specialty_registry_id, engine_top_specialty_id,
    stop_reason, belief_cardiology, belief_pulmonology, belief_neurology,
    belief_gastroenterology, belief_orthopedics, belief_dermatology,
    generated_at, client_event_id
  ) values (
    result_id, assessment_uuid, 'general-medicine', 'cardiology', 'max_questions',
    1.0/6, 1.0/6, 1.0/6, 1.0/6, 1.0/6, 1.0/6, now(), gen_random_uuid()
  );
  insert into public.routing_result_supporting_answers (
    routing_result_id, assessment_id, ordinal, routing_answer_id
  ) select result_id, assessment_uuid, 1, r.id from public.routing_answers r
    where r.assessment_id = assessment_uuid;
end
$setup$;

do $privileges$
declare
  fn text := 'public.trusted_prepare_soap_handoff(uuid,uuid,uuid,uuid,integer,integer,integer,uuid,text,jsonb)';
begin
  if has_function_privilege('anon', fn, 'execute')
    or has_function_privilege('authenticated', fn, 'execute')
    or has_function_privilege('public', fn, 'execute')
    or not has_function_privilege('service_role', fn, 'execute') then
    raise exception 'R9E SOAP RPC privilege drift';
  end if;
end
$privileges$;

create trigger r9e_forced_failure before insert on public.audit_events
  for each row execute function pg_temp.fail_prepared_audit();
set local role service_role;
do $checks$
declare
  a uuid := current_setting('r9e.assessment')::uuid;
  owner_id uuid := current_setting('r9e.owner')::uuid;
  other_id uuid := current_setting('r9e.other')::uuid;
  result_id uuid := current_setting('r9e.result')::uuid;
  key_id uuid := current_setting('r9e.key')::uuid;
  note jsonb := jsonb_build_object(
    'S', jsonb_build_array(jsonb_build_object('label','Main concern','value','Upper abdominal pain')),
    'O', jsonb_build_array(jsonb_build_object('label','Measurements','value','No vital signs, measurements or examination findings were captured by DocMatch+.')),
    'A', jsonb_build_array(jsonb_build_object('label','Routing assessment','value','General Medicine is the starting point.')),
    'P', jsonb_build_array(jsonb_build_object('label','Handoff','value','Prepared for clinical handoff.'))
  );
begin
  perform pg_temp.expect(public.trusted_prepare_soap_handoff(a, other_id, key_id, result_id, 1, 0, 0,
    null, '1.0.0-r9e', note), 'ASSESSMENT_NOT_FOUND', 'other owner');
  perform pg_temp.expect(public.trusted_prepare_soap_handoff(a, owner_id, key_id, gen_random_uuid(), 1, 0, 0,
    null, '1.0.0-r9e', note), 'ROUTING_NOT_FINAL', 'foreign result');
  perform pg_temp.expect(public.trusted_prepare_soap_handoff(a, owner_id, key_id, result_id, 0, 0, 0,
    null, '1.0.0-r9e', note), 'STALE_EVIDENCE', 'newer evidence');
  perform pg_temp.expect(public.trusted_prepare_soap_handoff(a, owner_id, key_id, result_id, 1, 0, 0,
    null, 'bad-version', note), 'INVALID_EVIDENCE', 'wrong SOAP version');

  -- Force a failure after the SOAP INSERT; the caught exception is a
  -- subtransaction rollback, so no snapshot or status update may survive.
  begin
    perform public.trusted_prepare_soap_handoff(a, owner_id, key_id, result_id, 1, 0, 0,
      null, '1.0.0-r9e', note);
    raise exception 'R9E forced failure did not fire';
  exception when others then
    if sqlerrm <> 'forced R9E audit failure' then raise; end if;
  end;
end
$checks$;

reset role;
drop trigger r9e_forced_failure on public.audit_events;
set local role service_role;
do $success$
declare
  a uuid := current_setting('r9e.assessment')::uuid;
  owner_id uuid := current_setting('r9e.owner')::uuid;
  result_id uuid := current_setting('r9e.result')::uuid;
  key_id uuid := current_setting('r9e.key')::uuid;
  note jsonb := jsonb_build_object(
    'S', jsonb_build_array(jsonb_build_object('label','Main concern','value','Upper abdominal pain')),
    'O', jsonb_build_array(jsonb_build_object('label','Measurements','value','No vital signs, measurements or examination findings were captured by DocMatch+.')),
    'A', jsonb_build_array(jsonb_build_object('label','Routing assessment','value','General Medicine is the starting point.')),
    'P', jsonb_build_array(jsonb_build_object('label','Handoff','value','Prepared for clinical handoff.'))
  );
begin
  if (select count(*) from public.soap_handoffs where assessment_id = a) <> 0
    or (select status from public.assessment_sessions where id = a) <> 'routing_complete' then
    raise exception 'R9E half-failure left partial state';
  end if;

  perform pg_temp.expect(public.trusted_prepare_soap_handoff(a, owner_id, key_id, result_id, 1, 0, 0,
    null, '1.0.0-r9e', note), 'applied', 'prepare');
  if (select status from public.assessment_sessions where id = a) <> 'handoff_prepared'
    or (select count(*) from public.soap_handoffs where assessment_id = a and routing_result_id = result_id) <> 1
    or (select count(*) from public.audit_events where assessment_id = a and to_status = 'handoff_prepared') <> 1 then
    raise exception 'R9E prepared state is incoherent';
  end if;
  perform pg_temp.expect(public.trusted_prepare_soap_handoff(a, owner_id, key_id, result_id, 1, 0, 0,
    null, '1.0.0-r9e', note), 'replayed', 'same key retry');
  perform pg_temp.expect(public.trusted_prepare_soap_handoff(a, owner_id, gen_random_uuid(), result_id, 1, 0, 0,
    null, '1.0.0-r9e', note), 'existing', 'new key same payload');
  perform pg_temp.expect(public.trusted_prepare_soap_handoff(a, owner_id, key_id, result_id, 1, 0, 0,
    null, '1.0.0-r9e', jsonb_set(note, '{P,0,value}', '"Different plan"')), 'IDEMPOTENCY_CONFLICT', 'different payload');
  if (select count(*) from public.soap_handoffs where assessment_id = a) <> 1 then
    raise exception 'R9E retry created a duplicate SOAP';
  end if;
end
$success$;
rollback;
