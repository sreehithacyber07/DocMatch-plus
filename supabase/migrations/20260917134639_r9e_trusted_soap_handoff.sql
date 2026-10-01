-- A recoverable second phase of finalization. R9G-A continues to create the
-- routing result and its support rows; this operation atomically prepares the
-- SOAP snapshot and advances routing_complete -> handoff_prepared.
create function public.trusted_prepare_soap_handoff(
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
      if v_soap.client_event_id = p_client_event_id then
        return jsonb_build_object('ok', true, 'outcome', 'replayed', 'soapHandoffId', v_soap.id,
          'status', v_assessment.status);
      end if;
      return jsonb_build_object('ok', true, 'outcome', 'existing', 'soapHandoffId', v_soap.id,
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

  return jsonb_build_object('ok', true, 'outcome', 'applied', 'soapHandoffId', v_soap_id,
    'status', 'handoff_prepared');
end;
$$;

revoke all on function public.trusted_prepare_soap_handoff(
  uuid, uuid, uuid, uuid, integer, integer, integer, uuid, text, jsonb
) from public, anon, authenticated;
grant execute on function public.trusted_prepare_soap_handoff(
  uuid, uuid, uuid, uuid, integer, integer, integer, uuid, text, jsonb
) to service_role;
