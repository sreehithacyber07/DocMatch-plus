-- Live-safe canonical outcome and two-facility RLS fixture. Always rolls back.
begin;

do $setup$
declare
  fa uuid := gen_random_uuid(); fb uuid := gen_random_uuid();
  sa uuid := gen_random_uuid(); sb uuid := gen_random_uuid();
  pa uuid := gen_random_uuid(); pb uuid := gen_random_uuid(); ph uuid := gen_random_uuid();
  ssa uuid := gen_random_uuid(); ssb uuid := gen_random_uuid();
  aa uuid := gen_random_uuid(); ab uuid := gen_random_uuid(); ah uuid := gen_random_uuid();
  key_a uuid := gen_random_uuid(); key_b uuid := gen_random_uuid(); key_h uuid := gen_random_uuid();
  result_a uuid; result_b uuid; r jsonb;
  route jsonb := jsonb_build_object(
    'status','route','specialtyId','general-medicine','routeType','parent-fallback',
    'sharedService',false,'urgency','none','urgentRuleIds','[]'::jsonb,
    'hardStopRuleId',null,'firedRuleIds','[]'::jsonb,'fallbackReason','SPECIALTY_EVIDENCE_CALIBRATION_REQUIRED',
    'gate',null,'supportingEvidenceQuestionIds','[]'::jsonb,
    'calibration','SPECIALTY_EVIDENCE_CALIBRATION_REQUIRED',
    'evidenceBasis','source-backed-prototype-pending-clinical-review');
  stop jsonb := jsonb_build_object(
    'status','hard-stop','specialtyId',null,'routeType',null,
    'sharedService',false,'urgency','none','urgentRuleIds','[]'::jsonb,
    'hardStopRuleId','fixture-hard-stop','firedRuleIds','["fixture-hard-stop"]'::jsonb,
    'fallbackReason',null,'gate',null,'supportingEvidenceQuestionIds','[]'::jsonb,
    'calibration','not-applicable','evidenceBasis','source-backed-prototype-pending-clinical-review');
  note jsonb := jsonb_build_object(
    'S',jsonb_build_array(jsonb_build_object('label','Main concern','value','Headache')),
    'O',jsonb_build_array(jsonb_build_object('label','Measurements','value','No measurements captured')),
    'A',jsonb_build_array(jsonb_build_object('label','Routing assessment','value','General Medicine direction')),
    'P',jsonb_build_array(jsonb_build_object('label','Handoff','value','Prepared for clinical handoff')));
begin
  perform set_config('canonical.fa',fa::text,true);
  perform set_config('canonical.fb',fb::text,true);
  perform set_config('canonical.sa',sa::text,true);
  perform set_config('canonical.sb',sb::text,true);
  perform set_config('canonical.pa',pa::text,true);
  perform set_config('canonical.pb',pb::text,true);
  perform set_config('canonical.ph',ph::text,true);
  perform set_config('canonical.ssa',ssa::text,true);
  perform set_config('canonical.ssb',ssb::text,true);
  perform set_config('canonical.aa',aa::text,true);
  perform set_config('canonical.ab',ab::text,true);
  perform set_config('canonical.ah',ah::text,true);
  perform set_config('canonical.key_a',key_a::text,true);
  perform set_config('canonical.route',route::text,true);
  perform set_config('canonical.note',note::text,true);

  insert into auth.users(id,is_anonymous) values (sa,false),(sb,false),(pa,true),(pb,true),(ph,true);
  insert into auth.sessions(id,user_id) values
    (ssa,sa),(ssb,sb),(gen_random_uuid(),pa),(gen_random_uuid(),pb),(gen_random_uuid(),ph);
  insert into public.facilities(id,display_name) values
    (fa,'Canonical rollback facility A'),(fb,'Canonical rollback facility B');
  insert into public.staff_profiles(auth_user_id,facility_id,role) values
    (sa,fa,'clinical_staff'),(sb,fb,'clinical_staff');
end
$setup$;

-- Setup the assessment rows separately so their staff profile IDs are exact.
do $assessments$
declare
  fa uuid := current_setting('canonical.fa')::uuid;
  fb uuid := current_setting('canonical.fb')::uuid;
  sa uuid := current_setting('canonical.sa')::uuid;
  sb uuid := current_setting('canonical.sb')::uuid;
  pa uuid := current_setting('canonical.pa')::uuid;
  pb uuid := current_setting('canonical.pb')::uuid;
  ph uuid := current_setting('canonical.ph')::uuid;
  spa uuid; spb uuid;
begin
  select id into spa from public.staff_profiles where auth_user_id=sa;
  select id into spb from public.staff_profiles where auth_user_id=sb;
  insert into public.assessment_sessions(id,contract_version,facility_id,owner_auth_user_id,
    initiated_by_staff_profile_id,deployment_mode,status,complaint_id,complaint_source,
    engine_version,knowledge_version,safety_version) values
    (current_setting('canonical.aa')::uuid,'1.0.0-r9d-assessment',fa,pa,spa,'staffed-tablet',
      'in_progress','headache','bridge-resolved','1.0.0-r1','0.2.0-r2b-demonstration','0.1.0-r3-safety-demonstration'),
    (current_setting('canonical.ab')::uuid,'1.0.0-r9d-assessment',fb,pb,spb,'staffed-tablet',
      'in_progress','headache','bridge-resolved','1.0.0-r1','0.2.0-r2b-demonstration','0.1.0-r3-safety-demonstration'),
    (current_setting('canonical.ah')::uuid,'1.0.0-r9d-assessment',fa,ph,spa,'staffed-tablet',
      'in_progress','headache','bridge-resolved','1.0.0-r1','0.2.0-r2b-demonstration','0.1.0-r3-safety-demonstration');
end
$assessments$;

-- The two outputs commit atomically, then retry under the same and a new key.
set local role service_role;
do $finalize$
declare
  aa uuid := current_setting('canonical.aa')::uuid;
  ab uuid := current_setting('canonical.ab')::uuid;
  ah uuid := current_setting('canonical.ah')::uuid;
  pa uuid := current_setting('canonical.pa')::uuid;
  pb uuid := current_setting('canonical.pb')::uuid;
  ph uuid := current_setting('canonical.ph')::uuid;
  route jsonb := current_setting('canonical.route')::jsonb;
  note jsonb := current_setting('canonical.note')::jsonb;
  key_a uuid := current_setting('canonical.key_a')::uuid;
  r jsonb; id_a uuid;
begin
  r := public.trusted_finalize_canonical_clinical(aa,pa,key_a,0,0,0,route,note,'[]'::jsonb,null);
  if r->>'outcome' <> 'applied' or r->>'status' <> 'handoff_prepared' then
    raise exception 'canonical route not applied: %',r;
  end if;
  id_a := (r->>'resultId')::uuid;
  perform set_config('canonical.result_a',id_a::text,true);
  r := public.trusted_finalize_canonical_clinical(aa,pa,key_a,0,0,0,route,note,'[]'::jsonb,null);
  if r->>'outcome' <> 'replayed' or (r->>'resultId')::uuid <> id_a then
    raise exception 'canonical same-key retry duplicated: %',r;
  end if;
  r := public.trusted_finalize_canonical_clinical(aa,pa,gen_random_uuid(),0,0,0,route,note,'[]'::jsonb,null);
  if r->>'outcome' <> 'existing' or (r->>'resultId')::uuid <> id_a then
    raise exception 'canonical new-key retry duplicated: %',r;
  end if;
  r := public.trusted_finalize_canonical_clinical(aa,pa,key_a,0,0,0,
    route || '{"specialtyId":"neurology"}'::jsonb,note,'[]'::jsonb,null);
  if r->>'code' <> 'IDEMPOTENCY_CONFLICT' then
    raise exception 'changed same-key outcome was accepted: %',r;
  end if;
  r := public.trusted_finalize_canonical_clinical(ab,pb,gen_random_uuid(),0,0,0,route,note,'[]'::jsonb,null);
  if r->>'outcome' <> 'applied' then raise exception 'facility B route failed: %',r; end if;
  perform set_config('canonical.result_b',r->>'resultId',true);
  r := public.trusted_finalize_canonical_clinical(ah,ph,gen_random_uuid(),0,0,0,
    jsonb_build_object('status','hard-stop','specialtyId',null,'routeType',null,
      'sharedService',false,'urgency','none','urgentRuleIds','[]'::jsonb,
      'hardStopRuleId','fixture-hard-stop','firedRuleIds','["fixture-hard-stop"]'::jsonb,
      'fallbackReason',null,'gate',null,'supportingEvidenceQuestionIds','[]'::jsonb,
      'calibration','not-applicable','evidenceBasis','source-backed-prototype-pending-clinical-review'),
    null,'[]'::jsonb,null);
  if r->>'outcome' <> 'applied' or r->>'status' <> 'priority_escalated' then
    raise exception 'hard stop failed: %',r;
  end if;
  if (select count(*) from public.canonical_clinical_outcomes where assessment_id=aa) <> 1
    or (select count(*) from public.audit_events where assessment_id=aa and reason_code='canonical_clinical_finalized') <> 1
    or (select soap_sections is null from public.canonical_clinical_outcomes where assessment_id=aa)
    or (select soap_sections is not null from public.canonical_clinical_outcomes where assessment_id=ah) then
    raise exception 'atomic/idempotent row invariant failed';
  end if;
end
$finalize$;
reset role;

-- Actual RLS: signed staff A sees A only; B sees B only; no browser write.
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('canonical.sa'),
  'role','authenticated','is_anonymous',false,'session_id',current_setting('canonical.ssa'))::text,true);
do $staff_a$
begin
  if (select count(*) from public.canonical_clinical_outcomes) <> 2
    or exists(select 1 from public.canonical_clinical_outcomes
      where assessment_id=current_setting('canonical.ab')::uuid)
    or (select count(*) from public.canonical_clinical_outcomes where handoff_status is not null) <> 1 then
    raise exception 'staff A RLS facility isolation failed';
  end if;
  begin
    update public.canonical_clinical_outcomes set handoff_status='acknowledged';
    raise exception 'staff A forged handoff state';
  exception when insufficient_privilege then null; end;
  begin
    perform public.trusted_finalize_canonical_clinical(current_setting('canonical.aa')::uuid,
      current_setting('canonical.pa')::uuid,gen_random_uuid(),0,0,0,
      current_setting('canonical.route')::jsonb,current_setting('canonical.note')::jsonb,'[]'::jsonb,null);
    raise exception 'browser executed trusted finalizer';
  exception when insufficient_privilege then null; end;
end
$staff_a$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('canonical.sb'),
  'role','authenticated','is_anonymous',false,'session_id',current_setting('canonical.ssb'))::text,true);
do $staff_b$
begin
  if (select count(*) from public.canonical_clinical_outcomes) <> 1
    or exists(select 1 from public.canonical_clinical_outcomes
      where assessment_id=current_setting('canonical.aa')::uuid) then
    raise exception 'staff B RLS facility isolation failed';
  end if;
end
$staff_b$;
reset role;

set local role service_role;
do $review$
declare r jsonb; k uuid := gen_random_uuid();
begin
  r := public.trusted_transition_canonical_handoff(current_setting('canonical.result_b')::uuid,
    current_setting('canonical.sa')::uuid,k,'opened');
  if r->>'code' <> 'HANDOFF_NOT_FOUND' then raise exception 'cross-facility review succeeded: %',r; end if;
  r := public.trusted_transition_canonical_handoff(current_setting('canonical.result_a')::uuid,
    current_setting('canonical.sb')::uuid,k,'opened');
  if r->>'code' <> 'HANDOFF_NOT_FOUND' then raise exception 'inverse cross-facility review succeeded: %',r; end if;
  r := public.trusted_transition_canonical_handoff(current_setting('canonical.result_a')::uuid,
    current_setting('canonical.sa')::uuid,k,'opened');
  if r->>'outcome' <> 'applied' then raise exception 'same-facility open failed: %',r; end if;
  r := public.trusted_transition_canonical_handoff(current_setting('canonical.result_a')::uuid,
    current_setting('canonical.sa')::uuid,k,'opened');
  if r->>'outcome' <> 'replayed' then raise exception 'same-facility retry duplicated: %',r; end if;
  if (select count(*) from public.canonical_handoff_events
      where outcome_id=current_setting('canonical.result_a')::uuid) <> 1 then
    raise exception 'duplicate handoff event';
  end if;
end
$review$;
reset role;
rollback;
