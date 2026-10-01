-- Postgres applies SELECT policy to INSERT ... RETURNING. A stable helper that
-- re-queries the new assessment cannot see that row in the command snapshot.
-- Evaluate the patient predicate against the row itself instead; the staff
-- branch still derives its facility from the private, trusted profile helper.
drop policy assessment_select_patient_or_clinician_scope
  on public.assessment_sessions;

create policy assessment_select_patient_or_clinician_scope
on public.assessment_sessions for select to authenticated
using (
  ((select private.is_anonymous_patient())
    and owner_auth_user_id = (select auth.uid()))
  or (facility_id is not null
    and facility_id = (select private.clinician_facility_id()))
);
