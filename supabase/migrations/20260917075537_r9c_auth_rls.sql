-- R9C access boundary. R9B clinical tables and frozen engines are unchanged.
-- Browser writes are limited to initial admission and patient-reported events.

-- This existing event-trigger function needs no Data API execution privilege.
-- The event trigger remains installed and enabled.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;

-- Private helpers avoid recursive RLS on assessment_sessions and keep staff
-- profiles inaccessible to ordinary Data API callers.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create function private.is_anonymous_patient()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and (select auth.jwt() ->> 'is_anonymous') = 'true'
    and exists (
      select 1 from auth.users u
      where u.id = (select auth.uid()) and u.is_anonymous = true
    );
$$;

create function private.clinician_facility_id()
returns uuid
language sql stable security definer
set search_path = ''
as $$
  select sp.facility_id
  from public.staff_profiles sp
  join auth.users u on u.id = sp.auth_user_id
  join public.facilities f on f.id = sp.facility_id
  where sp.auth_user_id = (select auth.uid())
    and (select auth.jwt() ->> 'is_anonymous') = 'false'
    and u.is_anonymous = false
    and sp.enabled = true
    and sp.role = 'clinical_staff'
    and f.enabled = true
  limit 1;
$$;

create function private.patient_owns_assessment(p_assessment_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select (select private.is_anonymous_patient())
    and exists (
      select 1 from public.assessment_sessions a
      where a.id = p_assessment_id
        and a.owner_auth_user_id = (select auth.uid())
    );
$$;

create function private.clinician_can_read_assessment(p_assessment_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.assessment_sessions a
    where a.id = p_assessment_id
      and a.facility_id is not null
      and a.facility_id = (select private.clinician_facility_id())
  );
$$;

create function private.can_read_assessment(p_assessment_id uuid)
returns boolean
language sql stable security invoker
set search_path = ''
as $$
  select private.patient_owns_assessment(p_assessment_id)
      or private.clinician_can_read_assessment(p_assessment_id);
$$;

revoke all on function private.is_anonymous_patient() from public, anon, authenticated;
revoke all on function private.clinician_facility_id() from public, anon, authenticated;
revoke all on function private.patient_owns_assessment(uuid) from public, anon, authenticated;
revoke all on function private.clinician_can_read_assessment(uuid) from public, anon, authenticated;
revoke all on function private.can_read_assessment(uuid) from public, anon, authenticated;
grant execute on function private.is_anonymous_patient() to authenticated;
grant execute on function private.clinician_facility_id() to authenticated;
grant execute on function private.patient_owns_assessment(uuid) to authenticated;
grant execute on function private.clinician_can_read_assessment(uuid) to authenticated;
grant execute on function private.can_read_assessment(uuid) to authenticated;

-- Reassert the R9B default-deny posture before assigning narrow privileges.
revoke all on public.facilities, public.kiosk_devices, public.staff_profiles,
  public.specialties, public.complaints, public.specialty_supported_complaints,
  public.assessment_sessions, public.body_selections, public.intake_answers,
  public.routing_answers, public.safety_answers, public.safety_events,
  public.safety_event_evidence, public.routing_results,
  public.routing_result_supporting_answers, public.soap_handoffs,
  public.clinical_handoffs, public.audit_events
  from public, anon, authenticated;

-- Only a trusted service context may write derived results, safety triggers,
-- handoff transitions, audit events, staff/site data and reference catalogs.
grant select, insert, update, delete on public.facilities, public.kiosk_devices,
  public.staff_profiles, public.specialties, public.complaints,
  public.specialty_supported_complaints, public.assessment_sessions,
  public.body_selections, public.intake_answers, public.routing_answers,
  public.safety_answers, public.safety_events, public.safety_event_evidence,
  public.routing_results, public.routing_result_supporting_answers,
  public.soap_handoffs, public.clinical_handoffs, public.audit_events
  to service_role;

-- SELECT is shared at the SQL-grant layer. RLS distinguishes temporary
-- anonymous patients from permanent, facility-scoped clinical staff.
grant select on public.assessment_sessions, public.body_selections,
  public.intake_answers, public.routing_answers, public.safety_answers,
  public.safety_events, public.safety_event_evidence, public.routing_results,
  public.routing_result_supporting_answers, public.soap_handoffs,
  public.clinical_handoffs, public.audit_events to authenticated;

-- Column grants prevent callers from supplying server clocks, generated IDs,
-- facility/device/staff bindings, or lifecycle status on admission.
grant insert (contract_version, owner_auth_user_id, deployment_mode,
  engine_version, knowledge_version, safety_version)
  on public.assessment_sessions to authenticated;
grant insert (assessment_id, region_id, view, precision, point_x, point_y,
  body_domain_version, captured_at, client_event_id, supersedes_record_id)
  on public.body_selections to authenticated;
grant insert (assessment_id, question_id, option_id, operation, sequence,
  answered_at, client_event_id, supersedes_record_id, category)
  on public.intake_answers to authenticated;
grant insert (assessment_id, question_id, option_id, operation, sequence,
  answered_at, client_event_id, supersedes_record_id, knowledge_version)
  on public.routing_answers to authenticated;
grant insert (assessment_id, question_id, option_id, operation, sequence,
  answered_at, client_event_id, supersedes_record_id, safety_version)
  on public.safety_answers to authenticated;

-- A browser admission is deliberately unassociated self-service only.
-- Staffed/kiosk device admission needs a future trusted bootstrap.
create policy assessment_patient_insert_own
on public.assessment_sessions for insert to authenticated
with check (
  (select private.is_anonymous_patient())
  and owner_auth_user_id = (select auth.uid())
  and status = 'created'
  and facility_id is null
  and kiosk_device_id is null
  and initiated_by_staff_profile_id is null
  and complaint_id is null
  and complaint_source is null
  and deployment_mode = 'web/self-service'
);

create policy assessment_select_patient_or_clinician_scope
on public.assessment_sessions for select to authenticated
using (private.can_read_assessment(id));

-- Patient-originated evidence remains append-only. No browser UPDATE/DELETE
-- grants or policies are installed for any evidence table.
create policy body_select_patient_or_clinician_scope
on public.body_selections for select to authenticated
using (private.can_read_assessment(assessment_id));
create policy body_patient_insert_own
on public.body_selections for insert to authenticated
with check (private.patient_owns_assessment(assessment_id));

create policy intake_select_patient_or_clinician_scope
on public.intake_answers for select to authenticated
using (private.can_read_assessment(assessment_id));
create policy intake_patient_insert_own
on public.intake_answers for insert to authenticated
with check (private.patient_owns_assessment(assessment_id));

create policy routing_answer_select_patient_or_clinician_scope
on public.routing_answers for select to authenticated
using (private.can_read_assessment(assessment_id));
create policy routing_answer_patient_insert_own
on public.routing_answers for insert to authenticated
with check (private.patient_owns_assessment(assessment_id));

create policy safety_answer_select_patient_or_clinician_scope
on public.safety_answers for select to authenticated
using (private.can_read_assessment(assessment_id));
create policy safety_answer_patient_insert_own
on public.safety_answers for insert to authenticated
with check (private.patient_owns_assessment(assessment_id));

-- Derived safety, routing, and SOAP data can be read within scope but only a
-- trusted service can finalize/insert them after clinical validation.
create policy safety_event_select_patient_or_clinician_scope
on public.safety_events for select to authenticated
using (private.can_read_assessment(assessment_id));
create policy safety_evidence_select_patient_or_clinician_scope
on public.safety_event_evidence for select to authenticated
using (private.can_read_assessment(assessment_id));
create policy routing_result_select_patient_or_clinician_scope
on public.routing_results for select to authenticated
using (private.can_read_assessment(assessment_id));
create policy result_support_select_patient_or_clinician_scope
on public.routing_result_supporting_answers for select to authenticated
using (private.can_read_assessment(assessment_id));
create policy soap_select_patient_or_clinician_scope
on public.soap_handoffs for select to authenticated
using (private.can_read_assessment(assessment_id));

-- Clinical workflow and audit are staff-only reads; transitions remain
-- trusted-service operations until R9G can validate and audit them atomically.
create policy clinical_handoff_clinician_select_facility
on public.clinical_handoffs for select to authenticated
using (private.clinician_can_read_assessment(assessment_id));
create policy audit_clinician_select_facility
on public.audit_events for select to authenticated
using (private.clinician_can_read_assessment(assessment_id));
