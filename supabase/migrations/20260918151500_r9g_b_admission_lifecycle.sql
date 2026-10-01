-- R9G-B trusted admission and lifecycle.
--
-- 1. Staffed-tablet admission: a verified permanent clinical_staff session is
--    the trust root. The server binds a fresh anonymous patient principal to a
--    new facility-bound assessment. Facility, staff profile, deployment mode
--    and owner are all derived here or verified here; none is accepted from a
--    browser body.
-- 2. The R9G-A/R9E patient operations accept that admitted shape as well as
--    unassociated web/self-service. Hospital-kiosk is still refused: there is
--    no trustworthy device identity (see docs/backend/r9g-b-admission-lifecycle.md).
-- 3. A facility-bound assessment that reaches handoff_prepared materializes
--    exactly one clinical_handoffs row in the SOAP transaction.
-- 4. Patient evidence may be appended only while the assessment is created or
--    in_progress, so a prepared handoff cannot gain answers after the fact.
-- 5. The patient-session end: created/in_progress -> cancelled and
--    priority_escalated/handoff_prepared -> closed, the R9A meanings.
-- 6. Operator-only cleanup primitives. They require an explicit cutoff, default
--    to a dry run and are not scheduled: no retention duration is approved.
--
-- Pattern, unchanged from R9G-A/R9E/R9F: SECURITY INVOKER unless a helper must
-- read auth.users, empty search_path, schema-qualified references, EXECUTE for
-- service_role only. Applied migrations are not edited; functions from earlier
-- phases are replaced here with CREATE OR REPLACE, which keeps their grants.

/* --- 1. Invariants ---------------------------------------------------------- */

-- A patient principal is bound to at most one facility. Together with the
-- admission check below (no prior assessment at all), a replayed anonymous
-- credential can never bind a second assessment.
create unique index assessment_one_facility_binding_per_owner
  on public.assessment_sessions (owner_auth_user_id)
  where facility_id is not null;

-- One clinical handoff per SOAP snapshot, and one open handoff per assessment.
create unique index clinical_handoff_one_per_soap
  on public.clinical_handoffs (soap_handoff_id);
create unique index clinical_handoff_one_open_per_assessment
  on public.clinical_handoffs (assessment_id)
  where status not in ('closed', 'cancelled');

/* --- 2. Admission shape ------------------------------------------------------ */

-- The two shapes a patient operation may act on. Anything else, including every
-- hospital-kiosk assessment, is refused as UNSUPPORTED_DEPLOYMENT.
create function public.trusted_admission_shape_ok(p_assessment_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1
    from public.assessment_sessions a
    where a.id = p_assessment_id
      and (
        (a.deployment_mode = 'web/self-service'
          and a.facility_id is null
          and a.kiosk_device_id is null
          and a.initiated_by_staff_profile_id is null)
        or (a.deployment_mode = 'staffed-tablet'
          and a.facility_id is not null
          and a.initiated_by_staff_profile_id is not null
          and a.kiosk_device_id is null
          and exists (
            select 1 from public.facilities f
            where f.id = a.facility_id and f.enabled = true
          ))
      )
  );
$$;

-- SECURITY DEFINER for the same reason as R9F's trusted_staff_identity:
-- auth.users is not readable by service_role, and the patient principal's
-- anonymity must be checked in the database as well as in the Edge Function.
-- It answers only for the single id it is given and returns one boolean.
create function public.trusted_is_anonymous_principal(p_auth_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from auth.users u
    where u.id = p_auth_user_id and u.is_anonymous = true
  );
$$;

/* --- 3. Staffed-tablet admission --------------------------------------------- */

create function public.trusted_admit_staffed_assessment(
  p_staff_auth_user_id uuid,
  p_patient_auth_user_id uuid,
  p_client_event_id uuid,
  p_contract_version text,
  p_engine_version text,
  p_knowledge_version text,
  p_safety_version text,
  p_complaint_id text,
  p_complaint_source text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_staff record;
  v_existing public.assessment_sessions%rowtype;
  v_audit public.audit_events%rowtype;
  v_assessment_id uuid;
begin
  -- The staff session is the trust root: enabled clinical_staff, permanent
  -- Auth user, enabled facility. Facility and profile come only from here.
  select * into v_staff from public.trusted_staff_identity(p_staff_auth_user_id);
  if not found then
    return jsonb_build_object('ok', false, 'code', 'STAFF_REQUIRED');
  end if;

  if p_patient_auth_user_id is null
    or p_patient_auth_user_id = p_staff_auth_user_id
    or not public.trusted_is_anonymous_principal(p_patient_auth_user_id) then
    return jsonb_build_object('ok', false, 'code', 'PATIENT_REQUIRED');
  end if;

  if p_complaint_source is null or p_complaint_source not in ('bridge-resolved', 'patient-stated')
    or p_contract_version is null or p_engine_version is null
    or p_knowledge_version is null or p_safety_version is null then
    return jsonb_build_object('ok', false, 'code', 'INVALID_REQUEST');
  end if;

  -- Serialize every admission of one patient principal.
  perform pg_advisory_xact_lock(hashtextextended('docmatch-admission:' || p_patient_auth_user_id::text, 0));

  select * into v_existing
  from public.assessment_sessions
  where owner_auth_user_id = p_patient_auth_user_id
  order by created_at, id
  limit 1
  for update;
  if found then
    select * into v_audit
    from public.audit_events
    where assessment_id = v_existing.id
      and kind = 'assessment_transition'
      and client_event_id = p_client_event_id;
    if found then
      if v_audit.reason_code = 'staff_admitted_patient'
        and v_audit.actor_staff_profile_id = v_staff.staff_profile_id
        and v_existing.facility_id = v_staff.facility_id
        and v_existing.initiated_by_staff_profile_id = v_staff.staff_profile_id
        and v_existing.complaint_id is not distinct from p_complaint_id
        and v_existing.complaint_source is not distinct from p_complaint_source then
        return jsonb_build_object('ok', true, 'outcome', 'replayed',
          'assessmentId', v_existing.id, 'status', v_existing.status);
      end if;
      return jsonb_build_object('ok', false, 'code', 'IDEMPOTENCY_CONFLICT');
    end if;
    -- The principal already owns an assessment. It is never bound again.
    return jsonb_build_object('ok', false, 'code', 'INVALID_STATE');
  end if;

  if not exists (
    select 1
    from public.complaints c
    where c.id = p_complaint_id
      and c.knowledge_version = p_knowledge_version
      and exists (
        select 1
        from public.specialty_supported_complaints l
        join public.specialties s on s.id = l.specialty_id
        where l.complaint_id = c.id and s.routing_enabled
      )
  ) then
    return jsonb_build_object('ok', false, 'code', 'COMPLAINT_NOT_SUPPORTED');
  end if;

  -- Creation and the confirmed complaint are one atomic admission. The audit
  -- row records the created -> in_progress transition and the admitting staff.
  insert into public.assessment_sessions (
    contract_version, facility_id, kiosk_device_id, owner_auth_user_id,
    initiated_by_staff_profile_id, deployment_mode, complaint_id, complaint_source,
    status, engine_version, knowledge_version, safety_version
  ) values (
    p_contract_version, v_staff.facility_id, null, p_patient_auth_user_id,
    v_staff.staff_profile_id, 'staffed-tablet', p_complaint_id, p_complaint_source,
    'in_progress', p_engine_version, p_knowledge_version, p_safety_version
  )
  returning id into v_assessment_id;

  insert into public.audit_events (
    kind, assessment_id, actor_staff_profile_id, from_status, to_status,
    reason_code, occurred_at, client_event_id
  ) values (
    'assessment_transition', v_assessment_id, v_staff.staff_profile_id, 'created', 'in_progress',
    'staff_admitted_patient', now(), p_client_event_id
  );

  return jsonb_build_object('ok', true, 'outcome', 'applied',
    'assessmentId', v_assessment_id, 'status', 'in_progress');
end;
$$;

/* --- 4. Patient operations accept the admitted shape ------------------------- */
-- Bodies are unchanged from R9G-A/R9E except the admission-shape check and,
-- for SOAP, the facility handoff materialization.

create or replace function public.trusted_record_safety_event(
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
  if not public.trusted_admission_shape_ok(v_assessment.id) then
    return jsonb_build_object('ok', false, 'code', 'UNSUPPORTED_DEPLOYMENT');
  end if;

  if jsonb_typeof(p_evidence) <> 'array' or jsonb_array_length(p_evidence) = 0
    or jsonb_array_length(p_evidence) > 32 then
    return jsonb_build_object('ok', false, 'code', 'INVALID_EVIDENCE');
  end if;

  -- One trusted safety event per assessment: after it, the assessment is
  -- priority_escalated and R3 continuation is not implemented.
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

create or replace function public.trusted_finalize_routing(
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
  if not public.trusted_admission_shape_ok(v_assessment.id) then
    return jsonb_build_object('ok', false, 'code', 'UNSUPPORTED_DEPLOYMENT');
  end if;
  if p_supporting_answer_ids is null or cardinality(p_supporting_answer_ids) > 64 then
    return jsonb_build_object('ok', false, 'code', 'INVALID_EVIDENCE');
  end if;

  -- One trusted routing result per assessment. Refinalization with
  -- supersedes_result_id remains blocked: no reviewed replacement workflow.
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

create or replace function public.trusted_prepare_soap_handoff(
  p_assessment_id uuid,
  p_owner_auth_user_id uuid,
  p_client_event_id uuid,
  p_routing_result_id uuid,
  p_routing_high_water integer,
  p_safety_high_water integer,
  p_intake_high_water integer,
  p_body_record_id uuid,
  p_soap_schema_version text,
  p_sections jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_assessment public.assessment_sessions%rowtype;
  v_result public.routing_results%rowtype;
  v_soap public.soap_handoffs%rowtype;
  v_soap_id uuid;
  v_handoff_id uuid;
begin
  select * into v_assessment
  from public.assessment_sessions
  where id = p_assessment_id and owner_auth_user_id = p_owner_auth_user_id
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'ASSESSMENT_NOT_FOUND');
  end if;
  if not public.trusted_admission_shape_ok(v_assessment.id) then
    return jsonb_build_object('ok', false, 'code', 'UNSUPPORTED_DEPLOYMENT');
  end if;

  select * into v_result
  from public.routing_results
  where id = p_routing_result_id and assessment_id = v_assessment.id;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'ROUTING_NOT_FINAL');
  end if;
  if exists (
    select 1 from public.routing_results r
    where r.assessment_id = v_assessment.id and r.supersedes_result_id = v_result.id
  ) then
    return jsonb_build_object('ok', false, 'code', 'INVALID_STATE');
  end if;

  if p_soap_schema_version is null or p_soap_schema_version <> '1.0.0-r9e'
    or p_sections is null or jsonb_typeof(p_sections) <> 'object'
    or p_sections - 'S' - 'O' - 'A' - 'P' <> '{}'::jsonb
    or jsonb_typeof(p_sections -> 'S') <> 'array'
    or jsonb_typeof(p_sections -> 'O') <> 'array'
    or jsonb_typeof(p_sections -> 'A') <> 'array'
    or jsonb_typeof(p_sections -> 'P') <> 'array' then
    return jsonb_build_object('ok', false, 'code', 'INVALID_EVIDENCE');
  end if;

  select * into v_soap
  from public.soap_handoffs
  where assessment_id = v_assessment.id
  order by recorded_at, id
  limit 1;
  if found then
    if v_soap.routing_result_id = p_routing_result_id
      and v_soap.soap_schema_version = p_soap_schema_version
      and v_soap.sections = p_sections then
      select h.id into v_handoff_id
      from public.clinical_handoffs h
      where h.soap_handoff_id = v_soap.id;
      if v_soap.client_event_id = p_client_event_id then
        return jsonb_build_object('ok', true, 'outcome', 'replayed', 'soapHandoffId', v_soap.id,
          'clinicalHandoffId', v_handoff_id, 'status', v_assessment.status);
      end if;
      return jsonb_build_object('ok', true, 'outcome', 'existing', 'soapHandoffId', v_soap.id,
        'clinicalHandoffId', v_handoff_id, 'status', v_assessment.status);
    end if;
    return jsonb_build_object('ok', false, 'code', 'IDEMPOTENCY_CONFLICT');
  end if;

  if exists (
    select 1 from public.audit_events
    where assessment_id = v_assessment.id and client_event_id = p_client_event_id
  ) then
    return jsonb_build_object('ok', false, 'code', 'IDEMPOTENCY_CONFLICT');
  end if;
  if v_assessment.status <> 'routing_complete'
    or exists (select 1 from public.safety_events where assessment_id = v_assessment.id) then
    return jsonb_build_object('ok', false, 'code', 'INVALID_STATE');
  end if;
  if not public.trusted_evidence_is_current(
    v_assessment.id, p_routing_high_water, p_safety_high_water, p_intake_high_water
  ) then
    return jsonb_build_object('ok', false, 'code', 'STALE_EVIDENCE');
  end if;
  if p_body_record_id is null then
    if exists (select 1 from public.body_selections where assessment_id = v_assessment.id) then
      return jsonb_build_object('ok', false, 'code', 'STALE_EVIDENCE');
    end if;
  elsif not exists (
    select 1 from public.body_selections b
    where b.id = p_body_record_id and b.assessment_id = v_assessment.id
      and not exists (select 1 from public.body_selections newer where newer.supersedes_record_id = b.id)
  ) then
    return jsonb_build_object('ok', false, 'code', 'STALE_EVIDENCE');
  end if;

  insert into public.soap_handoffs (
    assessment_id, routing_result_id, soap_schema_version, sections,
    generated_at, client_event_id
  ) values (
    v_assessment.id, v_result.id, p_soap_schema_version, p_sections,
    now(), p_client_event_id
  ) returning id into v_soap_id;

  update public.assessment_sessions
  set status = 'handoff_prepared', updated_at = now()
  where id = v_assessment.id;

  insert into public.audit_events (
    kind, assessment_id, from_status, to_status, reason_code, occurred_at, client_event_id
  ) values (
    'assessment_transition', v_assessment.id, 'routing_complete', 'handoff_prepared',
    'soap_handoff_prepared', now(), p_client_event_id
  );

  -- Only a facility-bound (trusted-admitted) assessment has a care team to
  -- review it. The row starts at the column default, 'prepared', which the R9F
  -- review workflow already opens from. Web/self-service never gets one.
  if v_assessment.facility_id is not null then
    insert into public.clinical_handoffs (assessment_id, soap_handoff_id, facility_id)
    values (v_assessment.id, v_soap_id, v_assessment.facility_id)
    returning id into v_handoff_id;
  end if;

  return jsonb_build_object('ok', true, 'outcome', 'applied', 'soapHandoffId', v_soap_id,
    'clinicalHandoffId', v_handoff_id, 'status', 'handoff_prepared');
end;
$$;

/* --- 5. Patient-session end -------------------------------------------------- */

-- R9A meanings only: the patient abandons an unfinished assessment (cancelled),
-- or the local encounter ends after a priority screen or a prepared handoff
-- (closed). Closing an assessment does not close or cancel its clinical
-- handoff and implies no clinical acknowledgement. routing_complete has no
-- R9A exit other than handoff_prepared, so it is refused.
create function public.trusted_end_assessment(
  p_assessment_id uuid,
  p_owner_auth_user_id uuid,
  p_client_event_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_assessment public.assessment_sessions%rowtype;
  v_audit public.audit_events%rowtype;
  v_to text;
begin
  select * into v_assessment
  from public.assessment_sessions
  where id = p_assessment_id and owner_auth_user_id = p_owner_auth_user_id
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'ASSESSMENT_NOT_FOUND');
  end if;
  if v_assessment.deployment_mode not in ('web/self-service', 'staffed-tablet') then
    return jsonb_build_object('ok', false, 'code', 'UNSUPPORTED_DEPLOYMENT');
  end if;

  select * into v_audit
  from public.audit_events
  where assessment_id = v_assessment.id and client_event_id = p_client_event_id;
  if found then
    if v_audit.kind = 'assessment_transition' and v_audit.reason_code = 'patient_session_ended' then
      return jsonb_build_object('ok', true, 'outcome', 'replayed', 'status', v_assessment.status);
    end if;
    return jsonb_build_object('ok', false, 'code', 'IDEMPOTENCY_CONFLICT');
  end if;

  if v_assessment.status in ('closed', 'expired', 'cancelled') then
    return jsonb_build_object('ok', true, 'outcome', 'existing', 'status', v_assessment.status);
  end if;
  if v_assessment.status in ('created', 'in_progress') then
    v_to := 'cancelled';
  elsif v_assessment.status in ('priority_escalated', 'handoff_prepared') then
    v_to := 'closed';
  else
    return jsonb_build_object('ok', false, 'code', 'INVALID_STATE');
  end if;

  update public.assessment_sessions
  set status = v_to, updated_at = now()
  where id = v_assessment.id;

  insert into public.audit_events (
    kind, assessment_id, from_status, to_status, reason_code, occurred_at, client_event_id
  ) values (
    'assessment_transition', v_assessment.id, v_assessment.status, v_to,
    'patient_session_ended', now(), p_client_event_id
  );

  return jsonb_build_object('ok', true, 'outcome', 'applied', 'status', v_to);
end;
$$;

/* --- 6. Evidence append window ----------------------------------------------- */

-- Same SECURITY DEFINER shape as R9C's private.patient_owns_assessment, plus
-- the lifecycle window. Once a result, priority event, SOAP or end is recorded,
-- a patient can no longer add answers that a reviewer would read as the basis
-- of the prepared handoff.
create function private.patient_can_append_evidence(p_assessment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select private.is_anonymous_patient())
    and exists (
      select 1 from public.assessment_sessions a
      where a.id = p_assessment_id
        and a.owner_auth_user_id = (select auth.uid())
        and a.status in ('created', 'in_progress')
    );
$$;

revoke all on function private.patient_can_append_evidence(uuid) from public, anon, authenticated;
grant execute on function private.patient_can_append_evidence(uuid) to authenticated;

alter policy body_patient_insert_own on public.body_selections
  with check (private.patient_can_append_evidence(assessment_id));
alter policy intake_patient_insert_own on public.intake_answers
  with check (private.patient_can_append_evidence(assessment_id));
alter policy routing_answer_patient_insert_own on public.routing_answers
  with check (private.patient_can_append_evidence(assessment_id));
alter policy safety_answer_patient_insert_own on public.safety_answers
  with check (private.patient_can_append_evidence(assessment_id));

/* --- 7. Operator-only lifecycle and cleanup primitives ----------------------- */
--
-- RETENTION_POLICY_DURATION_NOT_YET_APPROVED. Neither function has a default
-- cutoff, neither is scheduled, and both default to a dry run. They live in the
-- unexposed private schema and no Data API role may execute them, so only the
-- database owner (a trusted operator or a future approved scheduler) can run
-- them. They return counts only, never identifiers or patient content.

create function private.expire_stale_assessments(
  p_cutoff timestamptz,
  p_dry_run boolean default true,
  p_limit integer default 500
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_ids uuid[];
  v_count integer;
begin
  if p_cutoff is null then
    raise exception 'RETENTION_POLICY_DURATION_NOT_YET_APPROVED: an explicit cutoff is required';
  end if;
  if p_cutoff > now() then
    raise exception 'The cutoff must not be in the future';
  end if;
  if p_dry_run is null or p_limit is null or p_limit < 1 or p_limit > 5000 then
    raise exception 'Invalid dry-run flag or batch limit';
  end if;

  select array_agg(c.id) into v_ids
  from (
    select a.id
    from public.assessment_sessions a
    where a.status in ('created', 'in_progress')
      and a.updated_at < p_cutoff
    order by a.updated_at, a.id
    limit p_limit
    for update skip locked
  ) c;
  v_count := coalesce(cardinality(v_ids), 0);

  if p_dry_run or v_count = 0 then
    return jsonb_build_object('dryRun', p_dry_run, 'eligible', v_count, 'expired', 0);
  end if;

  insert into public.audit_events (
    kind, assessment_id, from_status, to_status, reason_code, occurred_at, client_event_id
  )
  select 'assessment_transition', a.id, a.status, 'expired', 'idle_policy_expired', now(), gen_random_uuid()
  from public.assessment_sessions a
  where a.id = any(v_ids);

  update public.assessment_sessions
  set status = 'expired', updated_at = now()
  where id = any(v_ids);

  return jsonb_build_object('dryRun', false, 'eligible', v_count, 'expired', v_count);
end;
$$;

-- An orphan is a temporary anonymous principal that owns no assessment and has
-- had no Auth activity since the cutoff: for example a sign-in whose assessment
-- insert never happened, or a web patient who refreshed before confirming a
-- concern. Principals that own any assessment are never deleted here; removing
-- clinical-routing records is a retention decision that has not been approved.
create function private.cleanup_orphan_anonymous_users(
  p_cutoff timestamptz,
  p_dry_run boolean default true,
  p_limit integer default 500
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_ids uuid[];
  v_count integer;
  v_deleted integer := 0;
begin
  if p_cutoff is null then
    raise exception 'RETENTION_POLICY_DURATION_NOT_YET_APPROVED: an explicit cutoff is required';
  end if;
  if p_cutoff > now() then
    raise exception 'The cutoff must not be in the future';
  end if;
  if p_dry_run is null or p_limit is null or p_limit < 1 or p_limit > 5000 then
    raise exception 'Invalid dry-run flag or batch limit';
  end if;

  -- FOR UPDATE conflicts with the key-share lock an in-flight assessment insert
  -- takes on its owner, so a principal that is being bound right now is skipped.
  select array_agg(c.id) into v_ids
  from (
    select u.id
    from auth.users u
    where u.is_anonymous = true
      and u.created_at < p_cutoff
      and coalesce(u.last_sign_in_at, u.created_at) < p_cutoff
      and not exists (
        select 1 from auth.sessions s
        where s.user_id = u.id
          and (s.created_at >= p_cutoff
            or s.updated_at >= p_cutoff
            or (s.refreshed_at is not null and s.refreshed_at >= (p_cutoff at time zone 'UTC')))
      )
      and not exists (select 1 from public.assessment_sessions a where a.owner_auth_user_id = u.id)
      and not exists (select 1 from public.staff_profiles sp where sp.auth_user_id = u.id)
    order by u.created_at, u.id
    limit p_limit
    for update of u skip locked
  ) c;
  v_count := coalesce(cardinality(v_ids), 0);

  if p_dry_run or v_count = 0 then
    return jsonb_build_object('dryRun', p_dry_run, 'eligible', v_count, 'deleted', 0);
  end if;

  delete from auth.users u
  where u.id = any(v_ids)
    and u.is_anonymous = true
    and not exists (select 1 from public.assessment_sessions a where a.owner_auth_user_id = u.id)
    and not exists (select 1 from public.staff_profiles sp where sp.auth_user_id = u.id);
  get diagnostics v_deleted = row_count;

  return jsonb_build_object('dryRun', false, 'eligible', v_count, 'deleted', v_deleted);
end;
$$;

/* --- 8. Privileges ------------------------------------------------------------ */

revoke all on function public.trusted_admission_shape_ok(uuid) from public, anon, authenticated;
revoke all on function public.trusted_is_anonymous_principal(uuid) from public, anon, authenticated;
revoke all on function public.trusted_admit_staffed_assessment(
  uuid, uuid, uuid, text, text, text, text, text, text
) from public, anon, authenticated;
revoke all on function public.trusted_end_assessment(uuid, uuid, uuid) from public, anon, authenticated;

grant execute on function public.trusted_admission_shape_ok(uuid) to service_role;
grant execute on function public.trusted_is_anonymous_principal(uuid) to service_role;
grant execute on function public.trusted_admit_staffed_assessment(
  uuid, uuid, uuid, text, text, text, text, text, text
) to service_role;
grant execute on function public.trusted_end_assessment(uuid, uuid, uuid) to service_role;

-- Operator-only: no Data API role, including service_role, may run cleanup.
revoke all on function private.expire_stale_assessments(timestamptz, boolean, integer)
  from public, anon, authenticated, service_role;
revoke all on function private.cleanup_orphan_anonymous_users(timestamptz, boolean, integer)
  from public, anon, authenticated, service_role;
