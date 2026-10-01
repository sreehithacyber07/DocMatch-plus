/**
 * The service-role implementation of the trusted store.
 *
 * Reads are always scoped by assessment (and by owner for the root row). Every
 * write goes through one of the atomic database functions from migration
 * 20260917121000; no table is written directly from here.
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.116.0';
import { verifyAccessToken } from './auth.ts';
import { TrustedError } from './trusted/contract.ts';
import { MAX_EVENTS_PER_STREAM } from './trusted/evidence.ts';
import type { AdmissionStore } from './trusted/admission-operations.ts';
import type { AssessmentRow, EvidenceRows, StoreOutcome, TrustedStore } from './trusted/operations.ts';
import type { StaffStore } from './trusted/staff-operations.ts';
import type { ClinicalStore, CanonicalClinicalOutcome } from './trusted/clinical-outcome.ts';
import type { RateLimitStore } from './trusted/rate-limit.ts';

const ASSESSMENT_COLUMNS =
  'id, owner_auth_user_id, contract_version, deployment_mode, status, complaint_id, complaint_source, facility_id, kiosk_device_id, initiated_by_staff_profile_id, engine_version, knowledge_version, safety_version, created_at';
const EVENT_COLUMNS = 'id, question_id, option_id, operation, sequence, answered_at, supersedes_record_id';

function unavailable(): never {
  throw new TrustedError('SERVICE_UNAVAILABLE');
}

function outcome(
  value: unknown,
  idKey: 'safetyEventId' | 'routingResultId' | 'soapHandoffId' | 'handoffId' | 'assessmentId' | 'resultId' | null,
): StoreOutcome {
  if (typeof value !== 'object' || value === null) throw new TrustedError('INTERNAL');
  const record = value as Record<string, unknown>;
  if (record.ok === false) return { ok: false, code: typeof record.code === 'string' ? record.code : 'INTERNAL' };
  const kind = record.outcome;
  if (record.ok !== true || (kind !== 'applied' && kind !== 'replayed' && kind !== 'existing') || typeof record.status !== 'string') {
    throw new TrustedError('INTERNAL');
  }
  const recordId = idKey && typeof record[idKey] === 'string' ? (record[idKey] as string) : null;
  return { ok: true, outcome: kind, status: record.status, recordId };
}

function rpcFailure(error: { code?: string }): never {
  // A unique violation that slipped past the explicit checks is still a retry
  // with conflicting data; anything else is not the caller's to see.
  if (error.code === '23505') throw new TrustedError('IDEMPOTENCY_CONFLICT');
  if (error.code === '40001' || error.code === '40P01' || error.code === '57014') unavailable();
  throw new TrustedError('INTERNAL');
}

export function supabaseStore(admin: SupabaseClient): TrustedStore {
  return {
    async loadOwnedAssessment(assessmentId, ownerAuthUserId) {
      const { data, error } = await admin
        .from('assessment_sessions')
        .select(ASSESSMENT_COLUMNS)
        .eq('id', assessmentId)
        .eq('owner_auth_user_id', ownerAuthUserId)
        .maybeSingle();
      if (error) unavailable();
      return (data as AssessmentRow | null) ?? null;
    },

    async loadEvidence(assessmentId) {
      const limit = MAX_EVENTS_PER_STREAM + 1;
      const [routing, safety, intake] = await Promise.all([
        admin.from('routing_answers').select(`${EVENT_COLUMNS}, knowledge_version`).eq('assessment_id', assessmentId).order('sequence').limit(limit),
        admin.from('safety_answers').select(`${EVENT_COLUMNS}, safety_version`).eq('assessment_id', assessmentId).order('sequence').limit(limit),
        admin.from('intake_answers').select(`${EVENT_COLUMNS}, category`).eq('assessment_id', assessmentId).order('sequence').limit(limit),
      ]);
      if (routing.error || safety.error || intake.error) unavailable();
      return {
        routing: routing.data ?? [],
        safety: safety.data ?? [],
        intake: intake.data ?? [],
      } as EvidenceRows;
    },

    async startAssessment(args) {
      const { data, error } = await admin.rpc('trusted_start_assessment', {
        p_assessment_id: args.assessmentId,
        p_owner_auth_user_id: args.ownerAuthUserId,
        p_client_event_id: args.clientEventId,
        p_complaint_id: args.complaintId,
        p_complaint_source: args.complaintSource,
      });
      if (error) rpcFailure(error);
      return outcome(data, null);
    },

    async recordSafetyEvent(args) {
      const { data, error } = await admin.rpc('trusted_record_safety_event', {
        p_assessment_id: args.assessmentId,
        p_owner_auth_user_id: args.ownerAuthUserId,
        p_client_event_id: args.clientEventId,
        p_routing_high_water: args.highWater.routing,
        p_safety_high_water: args.highWater.safety,
        p_intake_high_water: args.highWater.intake,
        p_fired_rule_ids: args.firedRuleIds,
        p_selected_rule_id: args.selectedRuleId,
        p_rule_version: args.ruleVersion,
        p_payload_id: args.payloadId,
        p_severity: args.severity,
        p_continuation_policy: args.continuationPolicy,
        p_triggered_at: args.triggeredAt,
        p_evidence: args.evidence,
      });
      if (error) rpcFailure(error);
      return outcome(data, 'safetyEventId');
    },

    async finalizeRouting(args) {
      const { data, error } = await admin.rpc('trusted_finalize_routing', {
        p_assessment_id: args.assessmentId,
        p_owner_auth_user_id: args.ownerAuthUserId,
        p_client_event_id: args.clientEventId,
        p_routing_high_water: args.highWater.routing,
        p_safety_high_water: args.highWater.safety,
        p_intake_high_water: args.highWater.intake,
        p_selected_specialty_registry_id: args.selectedSpecialtyRegistryId,
        p_engine_top_specialty_id: args.engineTopSpecialtyId,
        p_stop_reason: args.stopReason,
        p_belief_cardiology: args.belief.cardiology,
        p_belief_pulmonology: args.belief.pulmonology,
        p_belief_neurology: args.belief.neurology,
        p_belief_gastroenterology: args.belief.gastroenterology,
        p_belief_orthopedics: args.belief.orthopedics,
        p_belief_dermatology: args.belief.dermatology,
        p_supporting_answer_ids: args.supportingAnswerIds,
      });
      if (error) rpcFailure(error);
      return outcome(data, 'routingResultId');
    },

    async loadBodySelections(assessmentId) {
      const { data, error } = await admin.from('body_selections')
        .select('id, region_id, view, precision, point_x, point_y, recorded_at, supersedes_record_id')
        .eq('assessment_id', assessmentId).order('recorded_at').limit(201);
      if (error || !data || data.length > 200) unavailable();
      return data;
    },

    async loadRoutingResult(assessmentId) {
      const result = await admin.from('routing_results')
        .select('id, selected_specialty_registry_id, engine_top_specialty_id, stop_reason, belief_cardiology, belief_pulmonology, belief_neurology, belief_gastroenterology, belief_orthopedics, belief_dermatology')
        .eq('assessment_id', assessmentId).order('recorded_at').limit(2);
      if (result.error) unavailable();
      if (!result.data?.length) return null;
      if (result.data.length !== 1) throw new TrustedError('INVALID_EVIDENCE');
      const row = result.data[0];
      const support = await admin.from('routing_result_supporting_answers')
        .select('routing_answer_id').eq('assessment_id', assessmentId)
        .eq('routing_result_id', row.id).order('ordinal').limit(65);
      if (support.error || !support.data || support.data.length > 64) unavailable();
      return {
        id: row.id,
        selected_specialty_registry_id: row.selected_specialty_registry_id,
        engine_top_specialty_id: row.engine_top_specialty_id,
        stop_reason: row.stop_reason,
        belief: {
          cardiology: row.belief_cardiology,
          pulmonology: row.belief_pulmonology,
          neurology: row.belief_neurology,
          gastroenterology: row.belief_gastroenterology,
          orthopedics: row.belief_orthopedics,
          dermatology: row.belief_dermatology,
        },
        supportingAnswerIds: support.data.map((item) => item.routing_answer_id),
      };
    },

    async prepareSoap(args) {
      const { data, error } = await admin.rpc('trusted_prepare_soap_handoff', {
        p_assessment_id: args.assessmentId,
        p_owner_auth_user_id: args.ownerAuthUserId,
        p_client_event_id: args.clientEventId,
        p_routing_result_id: args.routingResultId,
        p_routing_high_water: args.highWater.routing,
        p_safety_high_water: args.highWater.safety,
        p_intake_high_water: args.highWater.intake,
        p_body_record_id: args.bodyRecordId,
        p_soap_schema_version: args.soapSchemaVersion,
        p_sections: args.sections,
      });
      if (error) rpcFailure(error);
      return outcome(data, 'soapHandoffId');
    },

    async endAssessment(args) {
      const { data, error } = await admin.rpc('trusted_end_assessment', {
        p_assessment_id: args.assessmentId,
        p_owner_auth_user_id: args.ownerAuthUserId,
        p_client_event_id: args.clientEventId,
      });
      if (error) rpcFailure(error);
      return outcome(data, null);
    },
  };
}

/** Shared-resolver clinical path. Legacy R1 tables and functions are untouched. */
export function clinicalStore(admin: SupabaseClient): ClinicalStore {
  const base = supabaseStore(admin);
  const finalize = async (args: {
    assessmentId: string; ownerAuthUserId: string; clientEventId: string;
    highWater: { routing: number; safety: number; intake: number };
    canonical: CanonicalClinicalOutcome;
    sections: unknown;
    evidence: readonly { table: string; recordId: string }[];
    bodyRecordId: string | null;
  }) => {
    const { data, error } = await admin.rpc('trusted_finalize_canonical_clinical', {
      p_assessment_id: args.assessmentId,
      p_owner_auth_user_id: args.ownerAuthUserId,
      p_client_event_id: args.clientEventId,
      p_routing_high_water: args.highWater.routing,
      p_safety_high_water: args.highWater.safety,
      p_intake_high_water: args.highWater.intake,
      p_outcome: args.canonical,
      p_sections: args.sections,
      p_evidence_refs: args.evidence,
      p_body_record_id: args.bodyRecordId,
    });
    if (error) rpcFailure(error);
    return outcome(data, 'resultId');
  };
  return {
    loadOwnedAssessment: base.loadOwnedAssessment,
    loadEvidence: base.loadEvidence,
    loadBodySelections: base.loadBodySelections,
    async loadClinicalContext(assessmentId) {
      const { data, error } = await admin.from('assessment_clinical_context')
        .select('body_region_id, face_subregion_id, concern_id, age_years, sex_for_assessment, reporter')
        .eq('assessment_id', assessmentId).maybeSingle();
      if (error) unavailable();
      return data;
    },
    async loadCanonicalOutcome(assessmentId) {
      const { data, error } = await admin.from('canonical_clinical_outcomes')
        .select('id, client_event_id, outcome').eq('assessment_id', assessmentId).maybeSingle();
      if (error) unavailable();
      return data ? { id: data.id, clientEventId: data.client_event_id,
        trusted: data.outcome as CanonicalClinicalOutcome } : null;
    },
    finalizeClinicalRoute: (args) => finalize({
      assessmentId: args.assessmentId, ownerAuthUserId: args.ownerAuthUserId,
      clientEventId: args.clientEventId, highWater: args.highWater,
      canonical: args.canonical, sections: args.sections,
      evidence: args.supportingRecords, bodyRecordId: args.bodyRecordId,
    }),
    recordClinicalHardStop: (args) => finalize({
      assessmentId: args.assessmentId, ownerAuthUserId: args.ownerAuthUserId,
      clientEventId: args.clientEventId, highWater: args.highWater,
      canonical: args.canonical, sections: null, evidence: args.evidence,
      bodyRecordId: null,
    }),
  };
}

/**
 * R9G-B staffed-tablet admission. Two Auth identities are verified: the staff
 * bearer (before this store is used) and the patient principal here. The
 * database resolves the staff profile and facility from the staff user id and
 * re-checks the patient principal's anonymity.
 */
export function admissionStore(admin: SupabaseClient): AdmissionStore {
  return {
    async isClinicalStaff(authUserId) {
      const { data, error } = await admin.rpc('trusted_staff_workspace', { p_auth_user_id: authUserId });
      if (error) rpcFailure(error);
      const record = data as Record<string, unknown> | null;
      return Boolean(record && record.ok === true && record.role === 'clinical_staff');
    },

    async verifyPrincipal(accessToken) {
      try {
        return await verifyAccessToken(admin, accessToken);
      } catch (error) {
        // An invalid patient token is a refusal about the patient, never a
        // signal that the staff session itself expired.
        if (error instanceof TrustedError && error.code === 'AUTH_INVALID') return null;
        throw error;
      }
    },

    async admitStaffed(args) {
      const { data, error } = await admin.rpc('trusted_admit_staffed_assessment', {
        p_staff_auth_user_id: args.staffAuthUserId,
        p_patient_auth_user_id: args.patientAuthUserId,
        p_client_event_id: args.clientEventId,
        p_contract_version: args.contractVersion,
        p_engine_version: args.engineVersion,
        p_knowledge_version: args.knowledgeVersion,
        p_safety_version: args.safetyVersion,
        p_complaint_id: args.complaintId,
        p_complaint_source: args.complaintSource,
      });
      if (error) rpcFailure(error);
      return outcome(data, 'assessmentId');
    },
  };
}

/**
 * R9F staff operations. The only argument derived from the caller is the Auth
 * user id the Edge Function verified; the database resolves the staff profile,
 * facility and role from it.
 */
export function staffStore(admin: SupabaseClient): StaffStore {
  const transition = async (args: { handoffId: string; actorAuthUserId: string; clientEventId: string }, to: 'opened' | 'acknowledged') => {
    const canonical = await admin.rpc('trusted_transition_canonical_handoff', {
      p_handoff_id: args.handoffId,
      p_actor_auth_user_id: args.actorAuthUserId,
      p_client_event_id: args.clientEventId,
      p_to_status: to,
    });
    if (canonical.error) rpcFailure(canonical.error);
    const canonicalOutcome = outcome(canonical.data, 'handoffId');
    if (!('code' in canonicalOutcome) || canonicalOutcome.code !== 'HANDOFF_NOT_FOUND') return canonicalOutcome;
    const legacy = await admin.rpc(to === 'opened' ? 'trusted_open_handoff' : 'trusted_acknowledge_handoff', {
      p_handoff_id: args.handoffId,
      p_actor_auth_user_id: args.actorAuthUserId,
      p_client_event_id: args.clientEventId,
    });
    if (legacy.error) rpcFailure(legacy.error);
    return outcome(legacy.data, 'handoffId');
  };
  return {
    async staffWorkspace(authUserId) {
      const { data, error } = await admin.rpc('trusted_staff_workspace', { p_auth_user_id: authUserId });
      if (error) rpcFailure(error);
      const record = data as Record<string, unknown> | null;
      if (!record || record.ok !== true) return null;
      const facilityName = record.facilityName;
      const role = record.role;
      if (typeof facilityName !== 'string' || typeof role !== 'string') throw new TrustedError('INTERNAL');
      return { facilityName, role };
    },

    openHandoff: (args) => transition(args, 'opened'),

    acknowledgeHandoff: (args) => transition(args, 'acknowledged'),
  };
}

/**
 * R9H durable counters: one atomic database call per stage, shared by every
 * Edge isolate. Only digests and limits are sent. Any failure throws so the
 * limiter can fall back to its per-isolate counter.
 */
export function rateLimitStore(admin: SupabaseClient): RateLimitStore {
  return {
    async hit(buckets) {
      const { data, error } = await admin.rpc('trusted_rate_limit_hit', {
        p_digests: buckets.map((bucket) => bucket.digest),
        p_window_seconds: buckets.map((bucket) => bucket.windowSeconds),
        p_limits: buckets.map((bucket) => bucket.limit),
      });
      if (error || typeof data !== 'object' || data === null) unavailable();
      const record = data as Record<string, unknown>;
      if (typeof record.allowed !== 'boolean' || typeof record.retry_after_seconds !== 'number') unavailable();
      return { allowed: record.allowed, retryAfterSeconds: record.retry_after_seconds };
    },
  };
}
