-- R9G-A trusted operations.
--
-- Three atomic write paths for the trusted Edge Functions. Each one runs in a
-- single transaction, locks the assessment row, re-checks ownership, lifecycle,
-- idempotency and evidence freshness, and only then writes.
--
-- SECURITY MODEL
--   * SECURITY INVOKER: these functions grant nothing. They run with the
--     caller's own privileges, and only service_role may call them.
--   * They live in public because PostgREST can only reach exposed schemas; the
--     private schema is deliberately not exposed (PGRST106). EXECUTE is revoked
--     from PUBLIC, anon and authenticated, so a browser session cannot call them.
--   * search_path is empty and every reference is schema-qualified.
--   * The derived values (rule IDs, specialty, belief, evidence) are computed by
--     the Edge Function from persisted evidence with the frozen engines. These
--     functions still refuse anything that does not belong to the assessment,
--     is no longer the active answer, or conflicts with an earlier write.
--
-- No table, column, constraint, grant or RLS policy from R9B/R9C is changed.

create function public.trusted_start_assessment(
  p_assessment_id uuid,
  p_owner_auth_user_id uuid,
  p_client_event_id uuid,
  p_complaint_id text,
  p_complaint_source text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_assessment public.assessment_sessions%rowtype;
  v_audit public.audit_events%rowtype;
begin
  select * into v_assessment
  from public.assessment_sessions
  where id = p_assessment_id and owner_auth_user_id = p_owner_auth_user_id
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'ASSESSMENT_NOT_FOUND');
  end if;

  if v_assessment.deployment_mode <> 'web/self-service'
    or v_assessment.facility_id is not null
    or v_assessment.kiosk_device_id is not null
    or v_assessment.initiated_by_staff_profile_id is not null then
    return jsonb_build_object('ok', false, 'code', 'UNSUPPORTED_DEPLOYMENT');
  end if;

  if p_complaint_source is null or p_complaint_source not in ('bridge-resolved', 'patient-stated') then
    return jsonb_build_object('ok', false, 'code', 'INVALID_REQUEST');
  end if;

  select * into v_audit
  from public.audit_events
  where assessment_id = v_assessment.id
    and kind = 'assessment_transition'
    and client_event_id = p_client_event_id;
  if found then
    if v_audit.from_status = 'created'
      and v_audit.to_status = 'in_progress'
      and v_audit.reason_code = 'patient_confirmed_complaint'
      and v_assessment.complaint_id is not distinct from p_complaint_id
      and v_assessment.complaint_source is not distinct from p_complaint_source then
      return jsonb_build_object('ok', true, 'outcome', 'replayed', 'status', v_assessment.status);
    end if;
    return jsonb_build_object('ok', false, 'code', 'IDEMPOTENCY_CONFLICT');
  end if;

  if v_assessment.status <> 'created' then
    return jsonb_build_object('ok', false, 'code', 'INVALID_STATE');
  end if;

  if not exists (
    select 1
    from public.complaints c
    where c.id = p_complaint_id
      and c.knowledge_version = v_assessment.knowledge_version
      and exists (
        select 1
        from public.specialty_supported_complaints l
        join public.specialties s on s.id = l.specialty_id
        where l.complaint_id = c.id and s.routing_enabled
      )
  ) then
    return jsonb_build_object('ok', false, 'code', 'COMPLAINT_NOT_SUPPORTED');
  end if;

  update public.assessment_sessions
  set complaint_id = p_complaint_id,
      complaint_source = p_complaint_source,
      status = 'in_progress',
      updated_at = now()
  where id = v_assessment.id;

  insert into public.audit_events (
    kind, assessment_id, from_status, to_status, reason_code, occurred_at, client_event_id
  ) values (
    'assessment_transition', v_assessment.id, 'created', 'in_progress',
    'patient_confirmed_complaint', now(), p_client_event_id
  );

  return jsonb_build_object('ok', true, 'outcome', 'applied', 'status', 'in_progress');
end;
$$;

-- Evidence must be an accepted, still-active selection in this assessment.
create function public.trusted_evidence_is_active(
  p_assessment_id uuid,
  p_table text,
  p_record_id uuid
)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select case p_table
    when 'routing_answers' then exists (
      select 1 from public.routing_answers r
      where r.id = p_record_id and r.assessment_id = p_assessment_id and r.operation = 'selected'
        and not exists (select 1 from public.routing_answers s where s.supersedes_record_id = r.id)
    )
    when 'safety_answers' then exists (
      select 1 from public.safety_answers r
      where r.id = p_record_id and r.assessment_id = p_assessment_id and r.operation = 'selected'
        and not exists (select 1 from public.safety_answers s where s.supersedes_record_id = r.id)
    )
    else false
  end;
$$;

-- Nothing newer than the evidence the derivation read may exist.
create function public.trusted_evidence_is_current(
  p_assessment_id uuid,
  p_routing_high_water integer,
  p_safety_high_water integer,
  p_intake_high_water integer
)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select not exists (
      select 1 from public.routing_answers
      where assessment_id = p_assessment_id and sequence > p_routing_high_water
    )
    and not exists (
      select 1 from public.safety_answers
      where assessment_id = p_assessment_id and sequence > p_safety_high_water
    )
    and not exists (
      select 1 from public.intake_answers
      where assessment_id = p_assessment_id and sequence > p_intake_high_water
    );
$$;

create function public.trusted_record_safety_event(
  p_assessment_id uuid,
  p_owner_auth_user_id uuid,
  p_client_event_id uuid,
  p_routing_high_water integer,
  p_safety_high_water integer,
  p_intake_high_water integer,
  p_fired_rule_ids text[],
  p_selected_rule_id text,
  p_rule_version text,
  p_payload_id text,
  p_severity text,
  p_continuation_policy text,
  p_triggered_at timestamptz,
  p_evidence jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_assessment public.assessment_sessions%rowtype;
  v_event public.safety_events%rowtype;
  v_event_id uuid;
  v_item record;
  v_existing_evidence jsonb;
begin
  select * into v_assessment
  from public.assessment_sessions
  where id = p_assessment_id and owner_auth_user_id = p_owner_auth_user_id
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'ASSESSMENT_NOT_FOUND');
  end if;
  if v_assessment.deployment_mode <> 'web/self-service' or v_assessment.facility_id is not null then
    return jsonb_build_object('ok', false, 'code', 'UNSUPPORTED_DEPLOYMENT');
  end if;

  if jsonb_typeof(p_evidence) <> 'array' or jsonb_array_length(p_evidence) = 0
    or jsonb_array_length(p_evidence) > 32 then
    return jsonb_build_object('ok', false, 'code', 'INVALID_EVIDENCE');
  end if;

  -- One trusted safety event per assessment in this phase: after it, the
  -- assessment is priority_escalated and R3 continuation is not implemented.
  select * into v_event
  from public.safety_events
  where assessment_id = v_assessment.id
  order by recorded_at, id
  limit 1;
  if found then
    if v_event.client_event_id <> p_client_event_id then
      return jsonb_build_object('ok', true, 'outcome', 'existing', 'safetyEventId', v_event.id,
        'status', v_assessment.status);
    end if;
    select coalesce(jsonb_agg(jsonb_build_object(
        'table', case when e.routing_answer_id is not null then 'routing_answers' else 'safety_answers' end,
        'id', coalesce(e.routing_answer_id, e.safety_answer_id)) order by e.ordinal), '[]'::jsonb)
      into v_existing_evidence
    from public.safety_event_evidence e
    where e.safety_event_id = v_event.id;
    if v_event.fired_rule_ids = p_fired_rule_ids
      and v_event.selected_rule_id = p_selected_rule_id
      and v_event.rule_version = p_rule_version
      and v_event.payload_id = p_payload_id
      and v_event.severity = p_severity
      and v_event.continuation_policy = p_continuation_policy
      and v_existing_evidence = p_evidence then
      return jsonb_build_object('ok', true, 'outcome', 'replayed', 'safetyEventId', v_event.id,
        'status', v_assessment.status);
    end if;
    return jsonb_build_object('ok', false, 'code', 'IDEMPOTENCY_CONFLICT');
  end if;

  if exists (
    select 1 from public.audit_events
    where assessment_id = v_assessment.id and client_event_id = p_client_event_id
  ) then
    return jsonb_build_object('ok', false, 'code', 'IDEMPOTENCY_CONFLICT');
  end if;

  if v_assessment.status <> 'in_progress' then
    return jsonb_build_object('ok', false, 'code', 'INVALID_STATE');
  end if;

  if not public.trusted_evidence_is_current(
    v_assessment.id, p_routing_high_water, p_safety_high_water, p_intake_high_water
  ) then
    return jsonb_build_object('ok', false, 'code', 'STALE_EVIDENCE');
  end if;

  for v_item in
    select value ->> 'table' as source_table, value ->> 'id' as record_id
    from jsonb_array_elements(p_evidence)
  loop
    if v_item.record_id is null
      or v_item.record_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or not public.trusted_evidence_is_active(v_assessment.id, v_item.source_table, v_item.record_id::uuid) then
      return jsonb_build_object('ok', false, 'code', 'INVALID_EVIDENCE');
    end if;
  end loop;

  insert into public.safety_events (
    assessment_id, fired_rule_ids, selected_rule_id, rule_version, payload_id,
    severity, continuation_policy, assessment_status_at_trigger, triggered_at, client_event_id
  ) values (
    v_assessment.id, p_fired_rule_ids, p_selected_rule_id, p_rule_version, p_payload_id,
    p_severity, p_continuation_policy, 'in_progress', p_triggered_at, p_client_event_id
  )
  returning id into v_event_id;

  insert into public.safety_event_evidence (
    safety_event_id, assessment_id, ordinal, routing_answer_id, safety_answer_id
  )
  select v_event_id, v_assessment.id, e.ordinality::integer,
    case when e.value ->> 'table' = 'routing_answers' then (e.value ->> 'id')::uuid end,
    case when e.value ->> 'table' = 'safety_answers' then (e.value ->> 'id')::uuid end
  from jsonb_array_elements(p_evidence) with ordinality as e(value, ordinality);

  update public.assessment_sessions
  set status = 'priority_escalated', updated_at = now()
  where id = v_assessment.id;

  insert into public.audit_events (
    kind, assessment_id, from_status, to_status, reason_code, occurred_at, client_event_id
  ) values (
    'assessment_transition', v_assessment.id, 'in_progress', 'priority_escalated',
    'r3_rule_fired', now(), p_client_event_id
  );

  return jsonb_build_object('ok', true, 'outcome', 'applied', 'safetyEventId', v_event_id,
    'status', 'priority_escalated');
end;
$$;

create function public.trusted_finalize_routing(
  p_assessment_id uuid,
  p_owner_auth_user_id uuid,
  p_client_event_id uuid,
  p_routing_high_water integer,
  p_safety_high_water integer,
  p_intake_high_water integer,
  p_selected_specialty_registry_id text,
  p_engine_top_specialty_id text,
  p_stop_reason text,
  p_belief_cardiology double precision,
  p_belief_pulmonology double precision,
  p_belief_neurology double precision,
  p_belief_gastroenterology double precision,
  p_belief_orthopedics double precision,
  p_belief_dermatology double precision,
  p_supporting_answer_ids uuid[]
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_assessment public.assessment_sessions%rowtype;
  v_result public.routing_results%rowtype;
  v_result_id uuid;
  v_existing_support uuid[];
  v_answer_id uuid;
begin
  select * into v_assessment
  from public.assessment_sessions
  where id = p_assessment_id and owner_auth_user_id = p_owner_auth_user_id
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'ASSESSMENT_NOT_FOUND');
  end if;
  if v_assessment.deployment_mode <> 'web/self-service' or v_assessment.facility_id is not null then
    return jsonb_build_object('ok', false, 'code', 'UNSUPPORTED_DEPLOYMENT');
  end if;
  if p_supporting_answer_ids is null or cardinality(p_supporting_answer_ids) > 64 then
    return jsonb_build_object('ok', false, 'code', 'INVALID_EVIDENCE');
  end if;

  -- One trusted routing result per assessment in this phase; refinalization
  -- with supersedes_result_id is a later, explicitly reviewed workflow.
  select * into v_result
  from public.routing_results
  where assessment_id = v_assessment.id
  order by recorded_at, id
  limit 1;
  if found then
    if v_result.client_event_id <> p_client_event_id then
      return jsonb_build_object('ok', true, 'outcome', 'existing', 'routingResultId', v_result.id,
        'status', v_assessment.status);
    end if;
    select coalesce(array_agg(s.routing_answer_id order by s.ordinal), '{}'::uuid[])
      into v_existing_support
    from public.routing_result_supporting_answers s
    where s.routing_result_id = v_result.id;
    if v_result.selected_specialty_registry_id = p_selected_specialty_registry_id
      and v_result.engine_top_specialty_id = p_engine_top_specialty_id
      and v_result.stop_reason = p_stop_reason
      and v_result.belief_cardiology = p_belief_cardiology
      and v_result.belief_pulmonology = p_belief_pulmonology
      and v_result.belief_neurology = p_belief_neurology
      and v_result.belief_gastroenterology = p_belief_gastroenterology
      and v_result.belief_orthopedics = p_belief_orthopedics
      and v_result.belief_dermatology = p_belief_dermatology
      and v_existing_support = p_supporting_answer_ids then
      return jsonb_build_object('ok', true, 'outcome', 'replayed', 'routingResultId', v_result.id,
        'status', v_assessment.status);
    end if;
    return jsonb_build_object('ok', false, 'code', 'IDEMPOTENCY_CONFLICT');
  end if;

  if exists (
    select 1 from public.audit_events
    where assessment_id = v_assessment.id and client_event_id = p_client_event_id
  ) then
    return jsonb_build_object('ok', false, 'code', 'IDEMPOTENCY_CONFLICT');
  end if;

  if v_assessment.status <> 'in_progress'
    or exists (select 1 from public.safety_events where assessment_id = v_assessment.id) then
    return jsonb_build_object('ok', false, 'code', 'INVALID_STATE');
  end if;

  if not public.trusted_evidence_is_current(
    v_assessment.id, p_routing_high_water, p_safety_high_water, p_intake_high_water
  ) then
    return jsonb_build_object('ok', false, 'code', 'STALE_EVIDENCE');
  end if;

  -- The displayed endpoint must be an enabled registry route for this
  -- complaint: the engine's own top specialty, or General Medicine.
  if not exists (
    select 1
    from public.specialties s
    join public.specialty_supported_complaints l
      on l.specialty_id = s.id and l.complaint_id = v_assessment.complaint_id
    where s.id = p_selected_specialty_registry_id
      and s.routing_enabled
      and (
        (s.id = 'general-medicine' and s.engine_specialty_id is null)
        or s.engine_specialty_id = p_engine_top_specialty_id
      )
  ) then
    return jsonb_build_object('ok', false, 'code', 'INVALID_EVIDENCE');
  end if;

  if (select count(distinct x) from unnest(p_supporting_answer_ids) as x) <> cardinality(p_supporting_answer_ids) then
    return jsonb_build_object('ok', false, 'code', 'INVALID_EVIDENCE');
  end if;
  foreach v_answer_id in array p_supporting_answer_ids loop
    if not public.trusted_evidence_is_active(v_assessment.id, 'routing_answers', v_answer_id) then
      return jsonb_build_object('ok', false, 'code', 'INVALID_EVIDENCE');
    end if;
  end loop;

  insert into public.routing_results (
    assessment_id, selected_specialty_registry_id, engine_top_specialty_id, stop_reason,
    belief_cardiology, belief_pulmonology, belief_neurology,
    belief_gastroenterology, belief_orthopedics, belief_dermatology,
    generated_at, client_event_id
  ) values (
    v_assessment.id, p_selected_specialty_registry_id, p_engine_top_specialty_id, p_stop_reason,
    p_belief_cardiology, p_belief_pulmonology, p_belief_neurology,
    p_belief_gastroenterology, p_belief_orthopedics, p_belief_dermatology,
    now(), p_client_event_id
  )
  returning id into v_result_id;

  insert into public.routing_result_supporting_answers (
    routing_result_id, assessment_id, ordinal, routing_answer_id
  )
  select v_result_id, v_assessment.id, a.ordinality::integer, a.answer_id
  from unnest(p_supporting_answer_ids) with ordinality as a(answer_id, ordinality);

  update public.assessment_sessions
  set status = 'routing_complete', updated_at = now()
  where id = v_assessment.id;

  insert into public.audit_events (
    kind, assessment_id, from_status, to_status, reason_code, occurred_at, client_event_id
  ) values (
    'assessment_transition', v_assessment.id, 'in_progress', 'routing_complete',
    'routing_finalized', now(), p_client_event_id
  );

  return jsonb_build_object('ok', true, 'outcome', 'applied', 'routingResultId', v_result_id,
    'status', 'routing_complete');
end;
$$;

-- Only the trusted server context may execute these. Supabase's default
-- privileges grant EXECUTE on new public functions to browser roles, so the
-- revocations below are required, not decorative.
revoke all on function public.trusted_start_assessment(uuid, uuid, uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.trusted_evidence_is_active(uuid, text, uuid)
  from public, anon, authenticated;
revoke all on function public.trusted_evidence_is_current(uuid, integer, integer, integer)
  from public, anon, authenticated;
revoke all on function public.trusted_record_safety_event(
  uuid, uuid, uuid, integer, integer, integer, text[], text, text, text, text, text, timestamptz, jsonb
) from public, anon, authenticated;
revoke all on function public.trusted_finalize_routing(
  uuid, uuid, uuid, integer, integer, integer, text, text, text,
  double precision, double precision, double precision,
  double precision, double precision, double precision, uuid[]
) from public, anon, authenticated;

grant execute on function public.trusted_start_assessment(uuid, uuid, uuid, text, text) to service_role;
grant execute on function public.trusted_evidence_is_active(uuid, text, uuid) to service_role;
grant execute on function public.trusted_evidence_is_current(uuid, integer, integer, integer) to service_role;
grant execute on function public.trusted_record_safety_event(
  uuid, uuid, uuid, integer, integer, integer, text[], text, text, text, text, text, timestamptz, jsonb
) to service_role;
grant execute on function public.trusted_finalize_routing(
  uuid, uuid, uuid, integer, integer, integer, text, text, text,
  double precision, double precision, double precision,
  double precision, double precision, double precision, uuid[]
) to service_role;
