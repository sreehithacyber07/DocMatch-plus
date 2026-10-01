-- R9B foundation. No browser grants or RLS policies are introduced here.
-- IDs, versions, and clinical meanings follow the approved R9A contract.

create table public.facilities (
  id uuid primary key default gen_random_uuid(),
  display_name text not null check (length(btrim(display_name)) > 0),
  enabled boolean not null default true
);

create table public.kiosk_devices (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities(id) on delete restrict,
  mode text not null check (mode in ('hospital-kiosk', 'staffed-tablet')),
  enabled boolean not null default true,
  unique (id, facility_id)
);

create table public.staff_profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete restrict,
  facility_id uuid not null references public.facilities(id) on delete restrict,
  role text not null check (role in ('clinical_staff', 'facility_admin')),
  enabled boolean not null default true,
  unique (id, facility_id)
);

create table public.specialties (
  id text primary key check (length(btrim(id)) > 0),
  canonical_name text not null check (length(btrim(canonical_name)) > 0),
  patient_facing_name text not null check (length(btrim(patient_facing_name)) > 0),
  category text not null check (category in ('broad', 'super')),
  routing_enabled boolean not null,
  engine_specialty_id text unique check (
    engine_specialty_id is null or engine_specialty_id in (
      'cardiology', 'pulmonology', 'neurology',
      'gastroenterology', 'orthopedics', 'dermatology'
    )
  ),
  evidence_status text not null check (evidence_status in (
    'active-demonstration', 'fallback-endpoint',
    'proposed-needs-review', 'not-modelled'
  )),
  source text not null check (length(btrim(source)) > 0)
);

create table public.complaints (
  id text primary key check (length(btrim(id)) > 0),
  label text not null check (length(btrim(label)) > 0),
  knowledge_version text not null check (length(btrim(knowledge_version)) > 0),
  provenance_ids text[] not null check (cardinality(provenance_ids) > 0)
);

-- R9A's supportedComplaints array is a projection of this FK-backed relation.
create table public.specialty_supported_complaints (
  specialty_id text not null references public.specialties(id) on delete restrict,
  complaint_id text not null references public.complaints(id) on delete restrict,
  ordinal integer not null check (ordinal > 0),
  primary key (specialty_id, complaint_id),
  unique (specialty_id, ordinal)
);

create table public.assessment_sessions (
  id uuid primary key default gen_random_uuid(),
  contract_version text not null check (length(btrim(contract_version)) > 0),
  facility_id uuid references public.facilities(id) on delete restrict,
  kiosk_device_id uuid,
  owner_auth_user_id uuid references auth.users(id) on delete restrict,
  initiated_by_staff_profile_id uuid,
  deployment_mode text not null check (deployment_mode in (
    'hospital-kiosk', 'staffed-tablet', 'web/self-service'
  )),
  complaint_id text references public.complaints(id) on delete restrict,
  complaint_source text check (
    complaint_source is null or complaint_source in ('bridge-resolved', 'patient-stated')
  ),
  status text not null default 'created' check (status in (
    'created', 'in_progress', 'priority_escalated', 'routing_complete',
    'handoff_prepared', 'closed', 'expired', 'cancelled'
  )),
  engine_version text not null check (length(btrim(engine_version)) > 0),
  knowledge_version text not null check (length(btrim(knowledge_version)) > 0),
  safety_version text not null check (length(btrim(safety_version)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint assessment_complaint_pair_check check (
    (complaint_id is null) = (complaint_source is null)
  ),
  constraint assessment_active_complaint_check check (
    status in ('created', 'expired', 'cancelled') or complaint_id is not null
  ),
  constraint assessment_device_requires_facility_check check (
    kiosk_device_id is null or facility_id is not null
  ),
  constraint assessment_staff_requires_facility_check check (
    initiated_by_staff_profile_id is null or facility_id is not null
  ),
  constraint assessment_timestamps_check check (updated_at >= created_at),
  constraint assessment_device_facility_fk foreign key (kiosk_device_id, facility_id)
    references public.kiosk_devices(id, facility_id) on delete restrict,
  constraint assessment_staff_facility_fk foreign key (initiated_by_staff_profile_id, facility_id)
    references public.staff_profiles(id, facility_id) on delete restrict,
  unique (id, facility_id)
);

create table public.body_selections (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessment_sessions(id) on delete cascade,
  region_id text not null check (length(btrim(region_id)) > 0),
  view text not null check (view in ('front', 'back')),
  precision text not null check (precision in ('general-area', 'exact-point')),
  point_x double precision,
  point_y double precision,
  body_domain_version text not null check (length(btrim(body_domain_version)) > 0),
  captured_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  client_event_id uuid not null,
  supersedes_record_id uuid,
  constraint body_point_precision_check check (
    (precision = 'general-area' and point_x is null and point_y is null)
    or (precision = 'exact-point' and point_x is not null and point_y is not null
      and point_x between 0 and 1 and point_y between 0 and 1)
  ),
  unique (assessment_id, id),
  unique (assessment_id, client_event_id),
  unique (supersedes_record_id),
  constraint body_supersedes_same_assessment_fk foreign key (assessment_id, supersedes_record_id)
    references public.body_selections(assessment_id, id) on delete cascade,
  constraint body_not_self_supersede_check check (supersedes_record_id is distinct from id)
);

create table public.intake_answers (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessment_sessions(id) on delete cascade,
  question_id text not null check (length(btrim(question_id)) > 0),
  option_id text,
  operation text not null check (operation in ('selected', 'cleared')),
  sequence integer not null check (sequence > 0),
  answered_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  client_event_id uuid not null,
  supersedes_record_id uuid,
  category text not null check (category in (
    'character', 'intensity', 'duration', 'onset', 'pattern', 'change', 'context'
  )),
  constraint intake_answer_operation_check check (
    (operation = 'selected' and option_id is not null and length(btrim(option_id)) > 0)
    or (operation = 'cleared' and option_id is null and supersedes_record_id is not null)
  ),
  unique (assessment_id, question_id, id),
  unique (assessment_id, client_event_id),
  unique (assessment_id, sequence),
  unique (supersedes_record_id),
  constraint intake_supersedes_same_question_fk foreign key (assessment_id, question_id, supersedes_record_id)
    references public.intake_answers(assessment_id, question_id, id) on delete cascade,
  constraint intake_not_self_supersede_check check (supersedes_record_id is distinct from id)
);

create table public.routing_answers (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessment_sessions(id) on delete cascade,
  question_id text not null check (length(btrim(question_id)) > 0),
  option_id text,
  operation text not null check (operation in ('selected', 'cleared')),
  sequence integer not null check (sequence > 0),
  answered_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  client_event_id uuid not null,
  supersedes_record_id uuid,
  knowledge_version text not null check (length(btrim(knowledge_version)) > 0),
  constraint routing_answer_operation_check check (
    (operation = 'selected' and option_id is not null and length(btrim(option_id)) > 0)
    or (operation = 'cleared' and option_id is null and supersedes_record_id is not null)
  ),
  unique (assessment_id, question_id, id),
  unique (assessment_id, id),
  unique (assessment_id, client_event_id),
  unique (assessment_id, sequence),
  unique (supersedes_record_id),
  constraint routing_supersedes_same_question_fk foreign key (assessment_id, question_id, supersedes_record_id)
    references public.routing_answers(assessment_id, question_id, id) on delete cascade,
  constraint routing_not_self_supersede_check check (supersedes_record_id is distinct from id)
);

create table public.safety_answers (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessment_sessions(id) on delete cascade,
  question_id text not null check (length(btrim(question_id)) > 0),
  option_id text,
  operation text not null check (operation in ('selected', 'cleared')),
  sequence integer not null check (sequence > 0),
  answered_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  client_event_id uuid not null,
  supersedes_record_id uuid,
  safety_version text not null check (length(btrim(safety_version)) > 0),
  constraint safety_answer_operation_check check (
    (operation = 'selected' and option_id is not null and length(btrim(option_id)) > 0)
    or (operation = 'cleared' and option_id is null and supersedes_record_id is not null)
  ),
  unique (assessment_id, question_id, id),
  unique (assessment_id, id),
  unique (assessment_id, client_event_id),
  unique (assessment_id, sequence),
  unique (supersedes_record_id),
  constraint safety_answer_supersedes_same_question_fk foreign key (assessment_id, question_id, supersedes_record_id)
    references public.safety_answers(assessment_id, question_id, id) on delete cascade,
  constraint safety_answer_not_self_supersede_check check (supersedes_record_id is distinct from id)
);

create table public.safety_events (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessment_sessions(id) on delete cascade,
  fired_rule_ids text[] not null check (cardinality(fired_rule_ids) > 0),
  selected_rule_id text not null,
  rule_version text not null check (length(btrim(rule_version)) > 0),
  payload_id text not null check (length(btrim(payload_id)) > 0),
  severity text not null check (severity in ('emergency', 'urgent')),
  continuation_policy text not null check (
    continuation_policy in ('must_stop', 'may_continue_after_acknowledgement')
  ),
  assessment_status_at_trigger text not null check (assessment_status_at_trigger in (
    'created', 'in_progress', 'priority_escalated', 'routing_complete',
    'handoff_prepared', 'closed', 'expired', 'cancelled'
  )),
  triggered_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  client_event_id uuid not null,
  constraint safety_selected_rule_fired_check check (selected_rule_id = any(fired_rule_ids)),
  unique (assessment_id, id),
  unique (assessment_id, client_event_id)
);

-- A safety rule may cite either an R3-owned answer or an R1 routing answer.
-- Two typed FKs preserve that provenance without copying patient text.
create table public.safety_event_evidence (
  safety_event_id uuid not null,
  assessment_id uuid not null,
  ordinal integer not null check (ordinal > 0),
  routing_answer_id uuid,
  safety_answer_id uuid,
  primary key (safety_event_id, ordinal),
  constraint safety_evidence_one_source_check check (
    num_nonnulls(routing_answer_id, safety_answer_id) = 1
  ),
  constraint safety_evidence_event_fk foreign key (assessment_id, safety_event_id)
    references public.safety_events(assessment_id, id) on delete cascade,
  constraint safety_evidence_routing_fk foreign key (assessment_id, routing_answer_id)
    references public.routing_answers(assessment_id, id) on delete cascade,
  constraint safety_evidence_safety_fk foreign key (assessment_id, safety_answer_id)
    references public.safety_answers(assessment_id, id) on delete cascade
);

create table public.routing_results (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessment_sessions(id) on delete cascade,
  selected_specialty_registry_id text not null
    references public.specialties(id) on delete restrict,
  engine_top_specialty_id text not null check (engine_top_specialty_id in (
    'cardiology', 'pulmonology', 'neurology',
    'gastroenterology', 'orthopedics', 'dermatology'
  )),
  stop_reason text not null check (stop_reason in (
    'top_probability', 'margin', 'max_questions', 'question_pool_exhausted'
  )),
  belief_cardiology double precision not null check (belief_cardiology between 0 and 1),
  belief_pulmonology double precision not null check (belief_pulmonology between 0 and 1),
  belief_neurology double precision not null check (belief_neurology between 0 and 1),
  belief_gastroenterology double precision not null check (belief_gastroenterology between 0 and 1),
  belief_orthopedics double precision not null check (belief_orthopedics between 0 and 1),
  belief_dermatology double precision not null check (belief_dermatology between 0 and 1),
  generated_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  client_event_id uuid not null,
  supersedes_result_id uuid,
  constraint routing_belief_normalized_check check (
    abs(
      belief_cardiology + belief_pulmonology + belief_neurology +
      belief_gastroenterology + belief_orthopedics + belief_dermatology - 1.0
    ) <= 1e-9
  ),
  unique (assessment_id, id),
  unique (assessment_id, client_event_id),
  unique (supersedes_result_id),
  constraint routing_result_supersedes_same_assessment_fk foreign key (assessment_id, supersedes_result_id)
    references public.routing_results(assessment_id, id) on delete cascade,
  constraint routing_result_not_self_supersede_check check (supersedes_result_id is distinct from id)
);

create table public.routing_result_supporting_answers (
  routing_result_id uuid not null,
  assessment_id uuid not null,
  ordinal integer not null check (ordinal > 0),
  routing_answer_id uuid not null,
  primary key (routing_result_id, ordinal),
  unique (routing_result_id, routing_answer_id),
  constraint result_support_result_fk foreign key (assessment_id, routing_result_id)
    references public.routing_results(assessment_id, id) on delete cascade,
  constraint result_support_answer_fk foreign key (assessment_id, routing_answer_id)
    references public.routing_answers(assessment_id, id) on delete cascade
);

create table public.soap_handoffs (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessment_sessions(id) on delete cascade,
  routing_result_id uuid not null,
  soap_schema_version text not null check (length(btrim(soap_schema_version)) > 0),
  sections jsonb not null,
  generated_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  client_event_id uuid not null,
  supersedes_handoff_id uuid,
  constraint soap_sections_shape_check check (
    jsonb_typeof(sections) = 'object'
    and sections ?& array['S', 'O', 'A', 'P']
    and jsonb_typeof(sections -> 'S') = 'array'
    and jsonb_typeof(sections -> 'O') = 'array'
    and jsonb_typeof(sections -> 'A') = 'array'
    and jsonb_typeof(sections -> 'P') = 'array'
    and sections - 'S' - 'O' - 'A' - 'P' = '{}'::jsonb
  ),
  unique (assessment_id, id),
  unique (assessment_id, client_event_id),
  unique (supersedes_handoff_id),
  constraint soap_result_same_assessment_fk foreign key (assessment_id, routing_result_id)
    references public.routing_results(assessment_id, id) on delete cascade,
  constraint soap_supersedes_same_assessment_fk foreign key (assessment_id, supersedes_handoff_id)
    references public.soap_handoffs(assessment_id, id) on delete cascade,
  constraint soap_not_self_supersede_check check (supersedes_handoff_id is distinct from id)
);

create table public.clinical_handoffs (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null,
  soap_handoff_id uuid not null,
  facility_id uuid not null references public.facilities(id) on delete restrict,
  status text not null default 'prepared' check (status in (
    'prepared', 'available_for_review', 'opened', 'acknowledged', 'closed', 'cancelled'
  )),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clinical_handoff_timestamps_check check (updated_at >= created_at),
  constraint handoff_same_facility_fk foreign key (assessment_id, facility_id)
    references public.assessment_sessions(id, facility_id) on delete cascade,
  constraint handoff_soap_same_assessment_fk foreign key (assessment_id, soap_handoff_id)
    references public.soap_handoffs(assessment_id, id) on delete cascade,
  unique (assessment_id, id)
);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in (
    'assessment_transition', 'handoff_transition', 'staff_override_recorded'
  )),
  assessment_id uuid not null references public.assessment_sessions(id) on delete cascade,
  clinical_handoff_id uuid,
  actor_staff_profile_id uuid references public.staff_profiles(id) on delete restrict,
  from_status text,
  to_status text,
  reason_code text,
  override_fired_rule_ids text[],
  override_original_payload_id text,
  override_original_continuation_policy text check (
    override_original_continuation_policy is null or
    override_original_continuation_policy in ('must_stop', 'may_continue_after_acknowledgement')
  ),
  override_action text check (
    override_action is null or override_action in (
      'request_continuation', 'transfer_to_clinician', 'document_only'
    )
  ),
  override_reason text,
  override_automatic_continuation_enabled boolean,
  occurred_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  client_event_id uuid not null,
  constraint audit_handoff_same_assessment_fk foreign key (assessment_id, clinical_handoff_id)
    references public.clinical_handoffs(assessment_id, id) on delete cascade,
  constraint audit_kind_shape_check check (
    (
      kind = 'assessment_transition'
      and clinical_handoff_id is null
      and from_status is not null and to_status is not null
      and from_status in (
        'created', 'in_progress', 'priority_escalated', 'routing_complete',
        'handoff_prepared', 'closed', 'expired', 'cancelled'
      )
      and to_status in (
        'created', 'in_progress', 'priority_escalated', 'routing_complete',
        'handoff_prepared', 'closed', 'expired', 'cancelled'
      )
      and override_fired_rule_ids is null
      and override_original_payload_id is null
      and override_original_continuation_policy is null
      and override_action is null and override_reason is null
      and override_automatic_continuation_enabled is null
    )
    or (
      kind = 'handoff_transition'
      and clinical_handoff_id is not null
      and from_status is not null and to_status is not null
      and from_status in (
        'prepared', 'available_for_review', 'opened', 'acknowledged', 'closed', 'cancelled'
      )
      and to_status in (
        'prepared', 'available_for_review', 'opened', 'acknowledged', 'closed', 'cancelled'
      )
      and override_fired_rule_ids is null
      and override_original_payload_id is null
      and override_original_continuation_policy is null
      and override_action is null and override_reason is null
      and override_automatic_continuation_enabled is null
    )
    or (
      kind = 'staff_override_recorded'
      and clinical_handoff_id is null and actor_staff_profile_id is not null
      and from_status is null and to_status is null
      and reason_code is not null and length(btrim(reason_code)) > 0
      and override_fired_rule_ids is not null
      and cardinality(override_fired_rule_ids) > 0
      and override_original_payload_id is not null
      and override_original_continuation_policy is not null
      and override_action is not null
      and override_reason is not null and length(btrim(override_reason)) > 0
      and override_automatic_continuation_enabled is not null
      and override_automatic_continuation_enabled = false
    )
  ),
  unique (assessment_id, kind, client_event_id)
);

-- Foreign-key and future ownership/review paths; the unique constraints above
-- already provide per-assessment event lookup indexes.
create index kiosk_devices_facility_idx on public.kiosk_devices(facility_id);
create index staff_profiles_facility_idx on public.staff_profiles(facility_id);
create index specialty_supported_complaint_idx
  on public.specialty_supported_complaints(complaint_id);
create index assessment_owner_idx on public.assessment_sessions(owner_auth_user_id)
  where owner_auth_user_id is not null;
create index assessment_facility_status_idx on public.assessment_sessions(facility_id, status, created_at desc)
  where facility_id is not null;
create index assessment_device_idx on public.assessment_sessions(kiosk_device_id)
  where kiosk_device_id is not null;
create index assessment_staff_idx on public.assessment_sessions(initiated_by_staff_profile_id)
  where initiated_by_staff_profile_id is not null;
create index assessment_status_created_idx on public.assessment_sessions(status, created_at desc);
create index body_assessment_idx on public.body_selections(assessment_id);
create index intake_assessment_idx on public.intake_answers(assessment_id);
create index routing_answer_assessment_idx on public.routing_answers(assessment_id);
create index safety_answer_assessment_idx on public.safety_answers(assessment_id);
create index safety_event_assessment_idx on public.safety_events(assessment_id);
create index safety_evidence_assessment_idx on public.safety_event_evidence(assessment_id, safety_event_id);
create index safety_evidence_routing_idx on public.safety_event_evidence(assessment_id, routing_answer_id)
  where routing_answer_id is not null;
create index safety_evidence_safety_idx on public.safety_event_evidence(assessment_id, safety_answer_id)
  where safety_answer_id is not null;
create index result_assessment_idx on public.routing_results(assessment_id);
create index result_selected_specialty_idx on public.routing_results(selected_specialty_registry_id);
create index result_support_answer_idx on public.routing_result_supporting_answers(assessment_id, routing_answer_id);
create index soap_assessment_idx on public.soap_handoffs(assessment_id);
create index handoff_facility_status_idx on public.clinical_handoffs(facility_id, status, created_at desc);
create index handoff_assessment_idx on public.clinical_handoffs(assessment_id);
create index audit_assessment_time_idx on public.audit_events(assessment_id, occurred_at desc);
create index audit_handoff_idx on public.audit_events(clinical_handoff_id)
  where clinical_handoff_id is not null;
create index audit_staff_idx on public.audit_events(actor_staff_profile_id)
  where actor_staff_profile_id is not null;

-- New public tables remain closed until R9C defines authenticated ownership
-- and facility policies. RLS and SQL privileges are separate controls.
alter table public.facilities enable row level security;
alter table public.kiosk_devices enable row level security;
alter table public.staff_profiles enable row level security;
alter table public.specialties enable row level security;
alter table public.complaints enable row level security;
alter table public.specialty_supported_complaints enable row level security;
alter table public.assessment_sessions enable row level security;
alter table public.body_selections enable row level security;
alter table public.intake_answers enable row level security;
alter table public.routing_answers enable row level security;
alter table public.safety_answers enable row level security;
alter table public.safety_events enable row level security;
alter table public.safety_event_evidence enable row level security;
alter table public.routing_results enable row level security;
alter table public.routing_result_supporting_answers enable row level security;
alter table public.soap_handoffs enable row level security;
alter table public.clinical_handoffs enable row level security;
alter table public.audit_events enable row level security;

revoke all on public.facilities, public.kiosk_devices, public.staff_profiles,
  public.specialties, public.complaints, public.specialty_supported_complaints,
  public.assessment_sessions,
  public.body_selections, public.intake_answers, public.routing_answers,
  public.safety_answers, public.safety_events, public.safety_event_evidence,
  public.routing_results, public.routing_result_supporting_answers,
  public.soap_handoffs, public.clinical_handoffs, public.audit_events
  from public, anon, authenticated;

-- The approved application registry, including disabled taxonomy entries.
-- Reference rows only: no facility, patient, staff, emergency, or handoff data.
insert into public.complaints (id, label, knowledge_version, provenance_ids) values
  ('upper-abdominal-pain', 'Upper abdominal pain', '0.2.0-r2b-demonstration',
    array['docmatch-r2b-founder-requirement', 'aha-acc-chest-pain-2021', 'nice-cg184-dyspepsia']),
  ('shortness-of-breath', 'Shortness of breath', '0.2.0-r2b-demonstration',
    array['docmatch-r2b-founder-requirement', 'nhs-shortness-of-breath-2024']),
  ('headache', 'Headache', '0.2.0-r2b-demonstration',
    array['docmatch-r2b-founder-requirement', 'who-headache-disorders-2025', 'nice-cg150-headaches']),
  ('joint-musculoskeletal-pain', 'Joint or muscle pain', '0.2.0-r2b-demonstration',
    array['docmatch-r2b-founder-requirement', 'nice-ng226-osteoarthritis',
      'nhs-sprains-strains-2024', 'aaos-stress-fractures']);

insert into public.specialties (
  id, canonical_name, patient_facing_name, category, routing_enabled,
  engine_specialty_id, evidence_status, source
) values
  ('general-medicine', 'General Medicine', 'General Medicine', 'broad', true,
    null, 'fallback-endpoint', 'https://natboard.edu.in/dnbbroad'),
  ('cardiology', 'Cardiology', 'Cardiology', 'super', true,
    'cardiology', 'active-demonstration', 'https://natboard.edu.in/dnbsuper'),
  ('respiratory-medicine', 'Respiratory Medicine', 'Respiratory Medicine', 'broad', true,
    'pulmonology', 'active-demonstration', 'https://natboard.edu.in/dnbbroad'),
  ('neurology', 'Neurology', 'Neurology', 'super', true,
    'neurology', 'active-demonstration', 'https://natboard.edu.in/dnbsuper'),
  ('medical-gastroenterology', 'Medical Gastroenterology', 'Gastroenterology', 'super', true,
    'gastroenterology', 'active-demonstration', 'https://natboard.edu.in/dnbsuper'),
  ('orthopaedics', 'Orthopaedics', 'Orthopaedics', 'broad', true,
    'orthopedics', 'active-demonstration', 'https://natboard.edu.in/dnbbroad'),
  ('dermatology', 'Dermatology, Venereology and Leprosy', 'Dermatology', 'broad', false,
    'dermatology', 'proposed-needs-review', 'https://natboard.edu.in/dnbbroad');

insert into public.specialties (
  id, canonical_name, patient_facing_name, category, routing_enabled,
  engine_specialty_id, evidence_status, source
)
select id, canonical_name, patient_facing_name, category, false,
  null, evidence_status,
  case category when 'broad' then 'https://natboard.edu.in/dnbbroad'
    else 'https://natboard.edu.in/dnbsuper' end
from (values
  ('otorhinolaryngology', 'Otorhinolaryngology (ENT)', 'ENT', 'broad', 'proposed-needs-review'),
  ('family-medicine', 'Family Medicine', 'Family Medicine', 'broad', 'not-modelled'),
  ('emergency-medicine', 'Emergency Medicine', 'Emergency Medicine', 'broad', 'not-modelled'),
  ('general-surgery', 'General Surgery', 'General Surgery', 'broad', 'proposed-needs-review'),
  ('ophthalmology', 'Ophthalmology', 'Eye care', 'broad', 'proposed-needs-review'),
  ('obstetrics-gynaecology', 'Obstetrics and Gynaecology', 'Obstetrics and Gynaecology', 'broad', 'proposed-needs-review'),
  ('paediatrics', 'Paediatrics', 'Paediatrics', 'broad', 'not-modelled'),
  ('psychiatry', 'Psychiatry', 'Psychiatry', 'broad', 'not-modelled'),
  ('physical-medicine-rehabilitation', 'Physical Medicine and Rehabilitation',
    'Physical Medicine and Rehabilitation', 'broad', 'not-modelled'),
  ('geriatric-medicine', 'Geriatric Medicine', 'Geriatric Medicine', 'broad', 'not-modelled'),
  ('nephrology', 'Nephrology', 'Nephrology', 'super', 'proposed-needs-review'),
  ('urology', 'Urology', 'Urology', 'super', 'proposed-needs-review'),
  ('clinical-immunology-rheumatology', 'Clinical Immunology and Rheumatology',
    'Rheumatology', 'super', 'proposed-needs-review'),
  ('critical-care-medicine', 'Critical Care Medicine', 'Critical Care Medicine', 'super', 'not-modelled'),
  ('endocrinology', 'Endocrinology', 'Endocrinology', 'super', 'not-modelled'),
  ('neurosurgery', 'Neuro Surgery', 'Neurosurgery', 'super', 'not-modelled'),
  ('surgical-gastroenterology', 'Surgical Gastroenterology', 'Surgical Gastroenterology',
    'super', 'not-modelled'),
  ('cardiovascular-thoracic-surgery', 'Cardio Vascular & Thoracic Surgery',
    'Cardiothoracic Surgery', 'super', 'not-modelled'),
  ('clinical-haematology', 'Clinical Haematology', 'Haematology', 'super', 'not-modelled'),
  ('vascular-surgery', 'Vascular Surgery', 'Vascular Surgery', 'super', 'not-modelled')
) as registry(id, canonical_name, patient_facing_name, category, evidence_status);

insert into public.specialty_supported_complaints (specialty_id, complaint_id, ordinal) values
  ('general-medicine', 'upper-abdominal-pain', 1),
  ('general-medicine', 'shortness-of-breath', 2),
  ('general-medicine', 'headache', 3),
  ('general-medicine', 'joint-musculoskeletal-pain', 4),
  ('cardiology', 'upper-abdominal-pain', 1),
  ('cardiology', 'shortness-of-breath', 2),
  ('respiratory-medicine', 'shortness-of-breath', 1),
  ('neurology', 'headache', 1),
  ('medical-gastroenterology', 'upper-abdominal-pain', 1),
  ('orthopaedics', 'joint-musculoskeletal-pain', 1);
