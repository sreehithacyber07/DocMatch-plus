-- R9F trusted staff handoff review.
--
-- Staff READS already work through the R9C facility policies, which re-check an
-- enabled clinical_staff profile and an enabled facility on every request. This
-- migration adds only the two privileged transitions, in the R9G-A pattern:
-- SECURITY INVOKER, empty search_path, schema-qualified, EXECUTE for
-- service_role only, one transaction per call with the handoff row locked.
--
-- The caller's staff identity is resolved here from the authenticated Auth user
-- id the Edge Function verified. No staff profile, facility or role is ever
-- accepted from a request body.
--
-- No R9B table, column, constraint or index and no R9C grant or policy changes.

-- The only staff authority: an enabled clinical_staff profile whose permanent
-- Auth user is not anonymous, in an enabled facility.
--
-- SECURITY DEFINER for one reason, the same one R9C documents for its private
-- helpers: `auth.users` is not readable by service_role, and the anonymity of
-- the account must be checked in the database as well as in the Edge Function.
-- The function answers only for the single Auth user id it is given, returns no
-- Auth column, and EXECUTE is revoked from PUBLIC, anon and authenticated.
create function public.trusted_staff_identity(p_auth_user_id uuid)
returns table (staff_profile_id uuid, facility_id uuid, facility_name text, staff_role text)
language sql
stable
security definer
set search_path = ''
as $$
  select sp.id, sp.facility_id, f.display_name, sp.role
  from public.staff_profiles sp
  join auth.users u on u.id = sp.auth_user_id
  join public.facilities f on f.id = sp.facility_id
  where sp.auth_user_id = p_auth_user_id
    and u.is_anonymous = false
    and sp.enabled = true
    and sp.role = 'clinical_staff'
    and f.enabled = true
  limit 1;
$$;

-- Shared body for both transitions. `p_to_status` is one of two fixed values
-- chosen by the calling function, never by a request.
create function public.trusted_transition_handoff(
  p_handoff_id uuid,
  p_actor_auth_user_id uuid,
  p_client_event_id uuid,
  p_to_status text,
  p_reason_code text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_staff record;
  v_handoff public.clinical_handoffs%rowtype;
  v_audit public.audit_events%rowtype;
  v_allowed_from text[];
begin
  if p_to_status = 'opened' then
    v_allowed_from := array['prepared', 'available_for_review'];
  elsif p_to_status = 'acknowledged' then
    v_allowed_from := array['opened'];
  else
    return jsonb_build_object('ok', false, 'code', 'INTERNAL');
  end if;

  select * into v_staff from public.trusted_staff_identity(p_actor_auth_user_id);
  if not found then
    return jsonb_build_object('ok', false, 'code', 'STAFF_REQUIRED');
  end if;

  select * into v_handoff
  from public.clinical_handoffs
  where id = p_handoff_id
  for update;
  -- A handoff in another facility is reported exactly like a missing one.
  if not found or v_handoff.facility_id <> v_staff.facility_id then
    return jsonb_build_object('ok', false, 'code', 'HANDOFF_NOT_FOUND');
  end if;

  select * into v_audit
  from public.audit_events
  where assessment_id = v_handoff.assessment_id
    and client_event_id = p_client_event_id;
  if found then
    if v_audit.kind = 'handoff_transition'
      and v_audit.clinical_handoff_id = v_handoff.id
      and v_audit.to_status = p_to_status
      and v_audit.reason_code = p_reason_code
      and v_audit.actor_staff_profile_id = v_staff.staff_profile_id then
      return jsonb_build_object('ok', true, 'outcome', 'replayed',
        'handoffId', v_handoff.id, 'status', v_handoff.status);
    end if;
    return jsonb_build_object('ok', false, 'code', 'IDEMPOTENCY_CONFLICT');
  end if;

  -- Already in or past the requested state: report it, write nothing. A second
  -- reviewer opening the same handoff is not an error and not a second event.
  if v_handoff.status = p_to_status
    or (p_to_status = 'opened' and v_handoff.status = 'acknowledged') then
    return jsonb_build_object('ok', true, 'outcome', 'existing',
      'handoffId', v_handoff.id, 'status', v_handoff.status);
  end if;
  if not (v_handoff.status = any(v_allowed_from)) then
    return jsonb_build_object('ok', false, 'code', 'INVALID_STATE');
  end if;

  update public.clinical_handoffs
  set status = p_to_status, updated_at = now()
  where id = v_handoff.id;

  insert into public.audit_events (
    kind, assessment_id, clinical_handoff_id, actor_staff_profile_id,
    from_status, to_status, reason_code, occurred_at, client_event_id
  ) values (
    'handoff_transition', v_handoff.assessment_id, v_handoff.id, v_staff.staff_profile_id,
    v_handoff.status, p_to_status, p_reason_code, now(), p_client_event_id
  );

  return jsonb_build_object('ok', true, 'outcome', 'applied',
    'handoffId', v_handoff.id, 'status', p_to_status);
end;
$$;

create function public.trusted_open_handoff(
  p_handoff_id uuid,
  p_actor_auth_user_id uuid,
  p_client_event_id uuid
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select public.trusted_transition_handoff(
    p_handoff_id, p_actor_auth_user_id, p_client_event_id, 'opened', 'handoff_opened');
$$;

-- Acknowledgement records only that an authorized clinician acknowledged the
-- prepared handoff. It asserts no diagnosis, assignment, appointment or
-- treatment, and changes no clinical evidence.
create function public.trusted_acknowledge_handoff(
  p_handoff_id uuid,
  p_actor_auth_user_id uuid,
  p_client_event_id uuid
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select public.trusted_transition_handoff(
    p_handoff_id, p_actor_auth_user_id, p_client_event_id, 'acknowledged', 'handoff_acknowledged');
$$;

-- The workspace context a signed-in staff member may see about themselves.
create function public.trusted_staff_workspace(p_auth_user_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(
    (select jsonb_build_object('ok', true, 'authorized', true,
        'facilityName', s.facility_name, 'role', s.staff_role)
     from public.trusted_staff_identity(p_auth_user_id) s),
    jsonb_build_object('ok', false, 'code', 'STAFF_REQUIRED'));
$$;

revoke all on function public.trusted_staff_identity(uuid) from public, anon, authenticated;
revoke all on function public.trusted_transition_handoff(uuid, uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.trusted_open_handoff(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.trusted_acknowledge_handoff(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.trusted_staff_workspace(uuid) from public, anon, authenticated;

grant execute on function public.trusted_staff_identity(uuid) to service_role;
grant execute on function public.trusted_transition_handoff(uuid, uuid, uuid, text, text) to service_role;
grant execute on function public.trusted_open_handoff(uuid, uuid, uuid) to service_role;
grant execute on function public.trusted_acknowledge_handoff(uuid, uuid, uuid) to service_role;
grant execute on function public.trusted_staff_workspace(uuid) to service_role;
