-- One additive backend contract migration (linked version 20260927154218). No assessment, answer, handoff or
-- Auth row is removed or rewritten. The live intake category already included
-- context, while a clean replay of repository migrations did not.
alter table public.intake_answers drop constraint if exists intake_answers_category_check;
alter table public.intake_answers add constraint intake_answers_category_check
  check (category in ('character', 'intensity', 'duration', 'onset', 'pattern', 'change', 'context'));

-- The current coverage catalog is larger than the original four weighted
-- families. These are identifiers, not new clinical priors or routing rules.
insert into public.complaints (id, label, knowledge_version, provenance_ids)
select id,
  case when id like 'pediatric-%' then 'Pediatric regional concern' else 'Regional symptom concern' end,
  '0.2.0-r2b-demonstration', array['docmatch-region-coverage-master-pass']::text[]
from unnest(array[
  'lower-abdominal-pelvic-concern', 'lower-abdominal-reproductive-concern',
  'chest-concern', 'neck-concern', 'throat-concern', 'face-eye-concern',
  'face-ear-concern', 'face-nose-concern', 'face-oral-jaw-concern',
  'face-neurologic-concern', 'face-general-concern',
  'regional-neurologic-concern', 'regional-skin-concern',
  'general-region-concern', 'head-concern', 'chest-breathing-concern',
  'upper-abdominal-concern', 'musculoskeletal-concern',
  'pediatric-under-five-region-concern',
  'pediatric-school-age-region-concern',
  'pediatric-adolescent-region-concern'
]) as catalog(id)
on conflict (id) do nothing;

-- Immutable, non-identifying context needed by the shared clinical replay.
-- The patient may insert one row into their own assessment; only the trusted
-- backend validates semantic consistency with the body/answer evidence.
create table public.assessment_clinical_context (
  assessment_id uuid primary key references public.assessment_sessions(id) on delete cascade,
  body_region_id text not null check (body_region_id ~ '^[a-z0-9][a-z0-9-]{0,79}$'),
  face_subregion_id text check (face_subregion_id is null or face_subregion_id ~ '^[a-z0-9][a-z0-9-]{0,79}$'),
  concern_id text not null check (concern_id ~ '^[a-z0-9][a-z0-9-]{0,79}$'),
  age_years smallint not null check (age_years between 0 and 130),
  sex_for_assessment text not null check (sex_for_assessment in ('female', 'male', 'intersex_or_variation')),
  reporter text check (reporter is null or reporter in ('young-person', 'caregiver')),
  client_event_id uuid not null,
  recorded_at timestamptz not null default now(),
  constraint clinical_reporter_age_check check
    (reporter is null or age_years between 12 and 17)
);
alter table public.assessment_clinical_context enable row level security;
revoke all on public.assessment_clinical_context from public, anon, authenticated;
grant select, insert, update, delete on public.assessment_clinical_context to service_role;
grant select on public.assessment_clinical_context to authenticated;
grant insert (assessment_id, body_region_id, face_subregion_id, concern_id,
  age_years, sex_for_assessment, reporter, client_event_id)
  on public.assessment_clinical_context to authenticated;
create policy clinical_context_select_scoped on public.assessment_clinical_context
  for select to authenticated using (private.can_read_assessment(assessment_id));
create policy clinical_context_patient_insert_own on public.assessment_clinical_context
  for insert to authenticated with check (private.patient_owns_assessment(assessment_id));

-- Supabase access JWTs can remain cryptographically valid after sign-out.
-- Resolve the signed session_id against Auth's current session table for both
-- Data API RLS and Edge authorization. A missing/invalid claim fails closed.
create function private.auth_session_exists(p_auth_user_id uuid, p_session_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_auth_user_id is not null and p_session_id is not null and exists (
    select 1 from auth.sessions s where s.id = p_session_id
      and s.user_id = p_auth_user_id
      and (s.not_after is null or s.not_after > now())
  );
$$;
revoke all on function private.auth_session_exists(uuid, uuid) from public, anon, authenticated;

create function private.jwt_session_active()
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  v_claim text := auth.jwt() ->> 'session_id';
begin
  if v_claim is null or v_claim !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  return private.auth_session_exists(auth.uid(), v_claim::uuid);
end;
$$;
revoke all on function private.jwt_session_active() from public, anon, authenticated;

create function public.trusted_session_active(p_auth_user_id uuid, p_session_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.auth_session_exists(p_auth_user_id, p_session_id);
$$;
revoke all on function public.trusted_session_active(uuid, uuid) from public, anon, authenticated;
grant execute on function public.trusted_session_active(uuid, uuid) to service_role;

create or replace function private.is_anonymous_patient()
returns boolean language sql stable security definer set search_path = '' as $$
  select private.jwt_session_active()
    and (select auth.jwt() ->> 'is_anonymous') = 'true'
    and exists (select 1 from auth.users u
      where u.id = (select auth.uid()) and u.is_anonymous = true);
$$;

create or replace function private.clinician_facility_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select sp.facility_id from public.staff_profiles sp
  join auth.users u on u.id = sp.auth_user_id
  join public.facilities f on f.id = sp.facility_id
  where sp.auth_user_id = (select auth.uid())
    and private.jwt_session_active()
    and (select auth.jwt() ->> 'is_anonymous') = 'false'
    and u.is_anonymous = false and sp.enabled = true
    and sp.role = 'clinical_staff' and f.enabled = true
  limit 1;
$$;
