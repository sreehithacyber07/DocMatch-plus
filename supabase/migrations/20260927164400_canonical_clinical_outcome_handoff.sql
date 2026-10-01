-- Second additive migration: a canonical, server-derived result and its SOAP
-- snapshot are one row and one transaction. Legacy R1 results/handoffs remain
-- readable and unchanged. No patient-entered free text or identity is stored.
-- The legacy start RPC requires one enabled parent-service support link. The
-- current complaint catalog already exists; these missing reference links only
-- permit admission, and never decide the canonical specialty direction.
insert into public.specialty_supported_complaints (specialty_id, complaint_id, ordinal)
select 'general-medicine', missing.id,
  (select coalesce(max(ordinal), 0) from public.specialty_supported_complaints
    where specialty_id = 'general-medicine')
    + row_number() over (order by missing.id)
from (
  select c.id from public.complaints c
  where not exists (select 1 from public.specialty_supported_complaints l
    where l.specialty_id = 'general-medicine' and l.complaint_id = c.id)
) missing
on conflict (specialty_id, complaint_id) do nothing;

create table public.canonical_clinical_outcomes (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null unique references public.assessment_sessions(id) on delete cascade,
  facility_id uuid references public.facilities(id) on delete restrict,
  client_event_id uuid not null,
  outcome jsonb not null,
  specialty_id text references public.specialties(id) on delete restrict,
  evidence_refs jsonb not null default '[]'::jsonb,
  body_selection_id uuid,
  soap_schema_version text,
  soap_sections jsonb,
  handoff_status text check (handoff_status in ('prepared', 'opened', 'acknowledged')),
  recorded_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (assessment_id, id),
  constraint canonical_outcome_facility_fk foreign key (assessment_id, facility_id)
    references public.assessment_sessions(id, facility_id) on delete cascade,
  constraint canonical_outcome_body_fk foreign key (assessment_id, body_selection_id)
    references public.body_selections(assessment_id, id) on delete restrict,
  constraint canonical_outcome_shape check (
    jsonb_typeof(outcome) = 'object'
    and outcome->>'status' in ('route', 'hard-stop')
    and outcome->>'urgency' in ('none', 'urgent')
    and jsonb_typeof(outcome->'urgentRuleIds') = 'array'
    and jsonb_typeof(outcome->'firedRuleIds') = 'array'
    and jsonb_typeof(outcome->'supportingEvidenceQuestionIds') = 'array'
    and jsonb_typeof(evidence_refs) = 'array'
    and jsonb_array_length(evidence_refs) <= 80
    and (
      (outcome->>'status' = 'route'
        and specialty_id is not null
        and specialty_id = outcome->>'specialtyId'
        and outcome->>'routeType' in ('weighted-demonstration', 'direction-gate', 'parent-fallback')
        and outcome->'hardStopRuleId' = 'null'::jsonb
        and soap_schema_version = '1.0.0-r9e'
        and jsonb_typeof(soap_sections) = 'object'
        and soap_sections ?& array['S', 'O', 'A', 'P']
        and jsonb_typeof(soap_sections->'S') = 'array'
        and jsonb_typeof(soap_sections->'O') = 'array'
        and jsonb_typeof(soap_sections->'A') = 'array'
        and jsonb_typeof(soap_sections->'P') = 'array'
        and soap_sections - 'S' - 'O' - 'A' - 'P' = '{}'::jsonb
        and handoff_status is not null)
      or
      (outcome->>'status' = 'hard-stop'
        and specialty_id is null
        and outcome->'specialtyId' = 'null'::jsonb
        and outcome->'routeType' = 'null'::jsonb
        and length(outcome->>'hardStopRuleId') > 0
        and soap_schema_version is null and soap_sections is null
        and handoff_status is null)
    )
  )
);
create index canonical_clinical_outcomes_facility_queue_idx
  on public.canonical_clinical_outcomes (facility_id, recorded_at desc)
  where handoff_status is not null;
create index canonical_clinical_outcomes_specialty_idx
  on public.canonical_clinical_outcomes (specialty_id) where specialty_id is not null;
alter table public.canonical_clinical_outcomes enable row level security;
revoke all on public.canonical_clinical_outcomes from public, anon, authenticated;
grant select on public.canonical_clinical_outcomes to authenticated;
grant select, insert, update, delete on public.canonical_clinical_outcomes to service_role;
create policy canonical_outcome_read_scoped on public.canonical_clinical_outcomes
  for select to authenticated using (private.can_read_assessment(assessment_id));

-- Review events are facility-only, and carry no copied clinical content.
create table public.canonical_handoff_events (
  id uuid primary key default gen_random_uuid(),
  outcome_id uuid not null,
  assessment_id uuid not null references public.assessment_sessions(id) on delete cascade,
  actor_staff_profile_id uuid not null references public.staff_profiles(id) on delete restrict,
  client_event_id uuid not null,
  from_status text not null check (from_status in ('prepared', 'opened')),
  to_status text not null check (to_status in ('opened', 'acknowledged')),
  occurred_at timestamptz not null default now(),
  constraint canonical_handoff_outcome_same_assessment_fk
    foreign key (assessment_id, outcome_id)
    references public.canonical_clinical_outcomes(assessment_id, id) on delete cascade,
  unique (outcome_id, client_event_id)
);
create index canonical_handoff_events_assessment_idx
  on public.canonical_handoff_events (assessment_id, occurred_at);
alter table public.canonical_handoff_events enable row level security;
revoke all on public.canonical_handoff_events from public, anon, authenticated;
grant select on public.canonical_handoff_events to authenticated;
grant select, insert, update, delete on public.canonical_handoff_events to service_role;
create policy canonical_handoff_events_staff_read on public.canonical_handoff_events
  for select to authenticated using (private.clinician_can_read_assessment(assessment_id));

-- Only the service role can submit this server-computed payload. One assessment
-- row lock serializes concurrent finalization, evidence FK inserts and retries.
create function public.trusted_finalize_canonical_clinical(
  p_assessment_id uuid,
  p_owner_auth_user_id uuid,
  p_client_event_id uuid,
  p_routing_high_water integer,
  p_safety_high_water integer,
  p_intake_high_water integer,
  p_outcome jsonb,
  p_sections jsonb,
  p_evidence_refs jsonb,
  p_body_record_id uuid
)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_assessment public.assessment_sessions%rowtype;
  v_existing public.canonical_clinical_outcomes%rowtype;
  v_id uuid;
  v_ref jsonb;
  v_ref_id uuid;
  v_ref_table text;
  v_to_status text;
begin
  select * into v_assessment from public.assessment_sessions
    where id = p_assessment_id and owner_auth_user_id = p_owner_auth_user_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'ASSESSMENT_NOT_FOUND');
  end if;
  if not public.trusted_admission_shape_ok(v_assessment.id) then
    return jsonb_build_object('ok', false, 'code', 'UNSUPPORTED_DEPLOYMENT');
  end if;
  select * into v_existing from public.canonical_clinical_outcomes
    where assessment_id = v_assessment.id;
  if found then
    if v_existing.client_event_id = p_client_event_id then
      if v_existing.outcome is distinct from p_outcome
        or v_existing.soap_sections is distinct from p_sections
        or v_existing.evidence_refs is distinct from p_evidence_refs
        or v_existing.body_selection_id is distinct from p_body_record_id then
        return jsonb_build_object('ok', false, 'code', 'IDEMPOTENCY_CONFLICT');
      end if;
      return jsonb_build_object('ok', true, 'outcome', 'replayed', 'resultId', v_existing.id,
        'status', v_assessment.status);
    end if;
    return jsonb_build_object('ok', true, 'outcome', 'existing', 'resultId', v_existing.id,
      'status', v_assessment.status);
  end if;
  if v_assessment.status <> 'in_progress'
    or exists (select 1 from public.routing_results where assessment_id = v_assessment.id)
    or exists (select 1 from public.safety_events where assessment_id = v_assessment.id) then
    return jsonb_build_object('ok', false, 'code', 'INVALID_STATE');
  end if;
  if exists (select 1 from public.audit_events
      where assessment_id = v_assessment.id and client_event_id = p_client_event_id) then
    return jsonb_build_object('ok', false, 'code', 'IDEMPOTENCY_CONFLICT');
  end if;
  if not public.trusted_evidence_is_current(v_assessment.id,
    p_routing_high_water, p_safety_high_water, p_intake_high_water) then
    return jsonb_build_object('ok', false, 'code', 'STALE_EVIDENCE');
  end if;
  if p_outcome is null or jsonb_typeof(p_outcome) <> 'object'
    or p_outcome->>'status' not in ('route', 'hard-stop')
    or p_evidence_refs is null or jsonb_typeof(p_evidence_refs) <> 'array'
    or jsonb_array_length(p_evidence_refs) > 80 then
    return jsonb_build_object('ok', false, 'code', 'INVALID_EVIDENCE');
  end if;
  if p_body_record_id is not null and not exists (
    select 1 from public.body_selections
    where id = p_body_record_id and assessment_id = v_assessment.id
  ) then
    return jsonb_build_object('ok', false, 'code', 'INVALID_EVIDENCE');
  end if;
  for v_ref in select value from jsonb_array_elements(p_evidence_refs) loop
    v_ref_table := v_ref->>'table';
    if v_ref_table not in ('intake_answers', 'routing_answers', 'safety_answers')
      or coalesce(v_ref->>'recordId', '') !~*
        '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      return jsonb_build_object('ok', false, 'code', 'INVALID_EVIDENCE');
    end if;
    v_ref_id := (v_ref->>'recordId')::uuid;
    if v_ref_table = 'intake_answers' then
      if not exists (select 1 from public.intake_answers a
        where a.id = v_ref_id and a.assessment_id = v_assessment.id and a.operation = 'selected'
          and not exists (select 1 from public.intake_answers s where s.supersedes_record_id = a.id)) then
        return jsonb_build_object('ok', false, 'code', 'INVALID_EVIDENCE');
      end if;
    elsif not public.trusted_evidence_is_active(v_assessment.id, v_ref_table, v_ref_id) then
      return jsonb_build_object('ok', false, 'code', 'INVALID_EVIDENCE');
    end if;
  end loop;
  if p_outcome->>'status' = 'route' then
    if not exists (select 1 from public.specialties where id = p_outcome->>'specialtyId') then
      return jsonb_build_object('ok', false, 'code', 'INVALID_EVIDENCE');
    end if;
    v_to_status := 'handoff_prepared';
  else
    v_to_status := 'priority_escalated';
  end if;
  insert into public.canonical_clinical_outcomes (
    assessment_id, facility_id, client_event_id, outcome, specialty_id,
    evidence_refs, body_selection_id, soap_schema_version, soap_sections, handoff_status
  ) values (
    v_assessment.id, v_assessment.facility_id, p_client_event_id, p_outcome,
    p_outcome->>'specialtyId', p_evidence_refs, p_body_record_id,
    case when v_to_status = 'handoff_prepared' then '1.0.0-r9e' else null end,
    p_sections, case when v_to_status = 'handoff_prepared' then 'prepared' else null end
  ) returning id into v_id;
  update public.assessment_sessions set status = v_to_status, updated_at = now()
    where id = v_assessment.id;
  insert into public.audit_events (
    kind, assessment_id, from_status, to_status, reason_code, occurred_at, client_event_id
  ) values (
    'assessment_transition', v_assessment.id, 'in_progress', v_to_status,
    'canonical_clinical_finalized', now(), p_client_event_id
  );
  return jsonb_build_object('ok', true, 'outcome', 'applied', 'resultId', v_id,
    'status', v_to_status);
end;
$$;
revoke all on function public.trusted_finalize_canonical_clinical(
  uuid, uuid, uuid, integer, integer, integer, jsonb, jsonb, jsonb, uuid
) from public, anon, authenticated;
grant execute on function public.trusted_finalize_canonical_clinical(
  uuid, uuid, uuid, integer, integer, integer, jsonb, jsonb, jsonb, uuid
) to service_role;

create function public.trusted_transition_canonical_handoff(
  p_handoff_id uuid, p_actor_auth_user_id uuid, p_client_event_id uuid, p_to_status text
)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_staff record;
  v_handoff public.canonical_clinical_outcomes%rowtype;
  v_event public.canonical_handoff_events%rowtype;
begin
  if p_to_status not in ('opened', 'acknowledged') then
    return jsonb_build_object('ok', false, 'code', 'INVALID_REQUEST');
  end if;
  select * into v_staff from public.trusted_staff_identity(p_actor_auth_user_id);
  if not found then return jsonb_build_object('ok', false, 'code', 'STAFF_REQUIRED'); end if;
  select * into v_handoff from public.canonical_clinical_outcomes
    where id = p_handoff_id for update;
  if not found or v_handoff.facility_id is distinct from v_staff.facility_id
    or v_handoff.handoff_status is null then
    return jsonb_build_object('ok', false, 'code', 'HANDOFF_NOT_FOUND');
  end if;
  select * into v_event from public.canonical_handoff_events
    where outcome_id = v_handoff.id and client_event_id = p_client_event_id;
  if found then
    if v_event.to_status = p_to_status and v_event.actor_staff_profile_id = v_staff.staff_profile_id then
      return jsonb_build_object('ok', true, 'outcome', 'replayed', 'handoffId', v_handoff.id,
        'status', v_handoff.handoff_status);
    end if;
    return jsonb_build_object('ok', false, 'code', 'IDEMPOTENCY_CONFLICT');
  end if;
  if v_handoff.handoff_status = p_to_status
    or (p_to_status = 'opened' and v_handoff.handoff_status = 'acknowledged') then
    return jsonb_build_object('ok', true, 'outcome', 'existing', 'handoffId', v_handoff.id,
      'status', v_handoff.handoff_status);
  end if;
  if not ((p_to_status = 'opened' and v_handoff.handoff_status = 'prepared')
    or (p_to_status = 'acknowledged' and v_handoff.handoff_status = 'opened')) then
    return jsonb_build_object('ok', false, 'code', 'INVALID_STATE');
  end if;
  insert into public.canonical_handoff_events (
    outcome_id, assessment_id, actor_staff_profile_id, client_event_id, from_status, to_status
  ) values (
    v_handoff.id, v_handoff.assessment_id, v_staff.staff_profile_id,
    p_client_event_id, v_handoff.handoff_status, p_to_status
  );
  update public.canonical_clinical_outcomes set handoff_status = p_to_status,
    updated_at = now() where id = v_handoff.id;
  return jsonb_build_object('ok', true, 'outcome', 'applied', 'handoffId', v_handoff.id,
    'status', p_to_status);
end;
$$;
revoke all on function public.trusted_transition_canonical_handoff(uuid, uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.trusted_transition_canonical_handoff(uuid, uuid, uuid, text)
  to service_role;
