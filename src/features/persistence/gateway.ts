/**
 * The persistence gateway.
 *
 * The only code that talks to Supabase. Everything above it works with typed
 * results, which keeps raw `supabase.from(...)` calls out of components and
 * lets tests substitute failing, slow or conflicting backends.
 */
import { classifyAuthError, classifyBackendError, type PersistenceError } from './errors.ts';
import type { AssessmentInsert, ClinicalContextInsert, EvidenceInsert, EvidenceTable } from './records.ts';
import { disposePatientClient, type PatientSupabaseClient } from './supabase-client.ts';
import type { StoredRoutingResult } from './trusted-result.ts';
import type { CanonicalClinicalOutcome } from '../routing-flow/clinical-replay.ts';
import type { AdmissionRequest, AdmissionResponse, StaffAdmission } from './staffed-admission.ts';

export type TrustedOperation =
  | 'assessment-start'
  | 'safety-evaluate'
  | 'routing-finalize'
  | 'soap-prepare'
  | 'assessment-end';

export interface InvokeOptions {
  /** Replaces the session signal, for a call that must outlive disposal. */
  signal?: AbortSignal;
  timeoutMs?: number;
}
export interface TrustedResponse {
  outcome: 'applied' | 'replayed' | 'existing' | 'not_triggered';
  status: string;
  routingResultId?: string;
  safetyEventId?: string;
  soapHandoffId?: string;
  trusted?: CanonicalClinicalOutcome;
}

export interface StoredCanonicalOutcome {
  id: string;
  outcome: CanonicalClinicalOutcome;
  soapSections: Readonly<Record<'S' | 'O' | 'A' | 'P', readonly { label: string; value: string }[]>> | null;
}

export type GatewayResult<T> = { ok: true; value: T } | { ok: false; error: PersistenceError };

export interface StoredEvidenceRow {
  id: string;
  row: Readonly<Record<string, unknown>>;
}

export interface PersistenceGateway {
  signInAnonymously(): Promise<GatewayResult<{ userId: string }>>;
  /** Reads the caller's own assessments; a fresh identity owns at most the one it created. */
  findOwnAssessment(ownerAuthUserId: string, contractVersion: string): Promise<GatewayResult<string | null>>;
  insertAssessment(row: AssessmentInsert): Promise<GatewayResult<string>>;
  insertClinicalContext?(row: ClinicalContextInsert): Promise<GatewayResult<string>>;
  insertEvidence(insert: EvidenceInsert): Promise<GatewayResult<string>>;
  findEvidenceByClientEvent(
    table: EvidenceTable,
    assessmentId: string,
    clientEventId: string,
  ): Promise<GatewayResult<StoredEvidenceRow | null>>;
  invokeTrusted?(operation: TrustedOperation, body: { assessmentId: string; clientEventId: string;
    complaintId?: string; complaintSource?: string }, options?: InvokeOptions): Promise<GatewayResult<TrustedResponse>>;
  /**
   * R9G-B trusted admission: present only when this build admits patients
   * through a verified care-team session. The browser supplies no facility.
   */
  admitPatient?(request: AdmissionRequest): Promise<GatewayResult<AdmissionResponse>>;
  readRoutingResult?(assessmentId: string, resultId: string): Promise<GatewayResult<StoredRoutingResult | null>>;
  readCanonicalOutcome?(assessmentId: string, resultId: string): Promise<GatewayResult<StoredCanonicalOutcome | null>>;
  readEvidenceIds?(assessmentId: string): Promise<GatewayResult<Record<'intake' | 'routing' | 'safety', string[]>>>;
  close(): Promise<void>;
}

function ok<T>(value: T): GatewayResult<T> {
  return { ok: true, value };
}

function failed<T>(error: PersistenceError): GatewayResult<T> {
  return { ok: false, error };
}

/** A thrown error becomes a typed result; it never escapes as an unhandled rejection. */
async function guarded<T>(operation: () => Promise<GatewayResult<T>>): Promise<GatewayResult<T>> {
  try {
    return await operation();
  } catch (error) {
    const raw = error instanceof Error ? { name: error.name, message: error.message } : {};
    const aborted = raw.name === 'AbortError';
    return failed({ kind: aborted ? 'aborted' : 'transient', code: aborted ? 'ABORT_ERR' : 'thrown', status: null });
  }
}

const EVIDENCE_COLUMNS: Readonly<Record<EvidenceTable, string>> = {
  body_selections:
    'id, assessment_id, region_id, view, precision, point_x, point_y, body_domain_version, captured_at, client_event_id, supersedes_record_id',
  intake_answers:
    'id, assessment_id, question_id, option_id, operation, sequence, answered_at, client_event_id, supersedes_record_id, category',
  routing_answers:
    'id, assessment_id, question_id, option_id, operation, sequence, answered_at, client_event_id, supersedes_record_id, knowledge_version',
  safety_answers:
    'id, assessment_id, question_id, option_id, operation, sequence, answered_at, client_event_id, supersedes_record_id, safety_version',
};

export interface GatewayOptions {
  /** Injected only by staffed-tablet builds; never loaded elsewhere. */
  admission?: StaffAdmission;
}

export function createSupabaseGateway(
  client: PatientSupabaseClient,
  signal: AbortSignal,
  options: GatewayOptions = {},
): PersistenceGateway {
  const admission = options.admission;
  return {
    async signInAnonymously() {
      try {
        const { data, error } = await client.auth.signInAnonymously();
        if (error) return failed(classifyAuthError({ status: error.status, code: error.code, name: error.name, message: error.message }));
        const userId = data.user?.id;
        if (!userId || data.user?.is_anonymous !== true) {
          return failed({ kind: 'auth', code: 'not-anonymous', status: null });
        }
        return ok({ userId });
      } catch (error) {
        const thrown = error instanceof Error ? error : new Error('unknown');
        return failed(classifyAuthError({ name: thrown.name, message: thrown.message, status: 0 }));
      }
    },

    findOwnAssessment(ownerAuthUserId, contractVersion) {
      return guarded(async () => {
        const { data, error, status } = await client
          .from('assessment_sessions')
          .select('id')
          .eq('owner_auth_user_id', ownerAuthUserId)
          .eq('contract_version', contractVersion)
          .order('created_at', { ascending: true })
          .limit(1)
          .abortSignal(signal);
        if (error) return failed(classifyBackendError({ ...error, status }));
        return ok(data[0]?.id ?? null);
      });
    },

    insertAssessment(row) {
      return guarded(async () => {
        const { data, error, status } = await client
          .from('assessment_sessions')
          .insert(row)
          .select('id')
          .abortSignal(signal)
          .single();
        if (error) return failed(classifyBackendError({ ...error, status }));
        return ok(data.id);
      });
    },

    insertClinicalContext(row) {
      return guarded(async () => {
        const request = await client.from('assessment_clinical_context')
          .insert(row).select('assessment_id').abortSignal(signal).single();
        if (!request.error) return ok(request.data.assessment_id);
        if (request.error.code !== '23505') {
          return failed(classifyBackendError({ ...request.error, status: request.status }));
        }
        const existing = await client.from('assessment_clinical_context')
          .select('assessment_id, body_region_id, face_subregion_id, concern_id, age_years, sex_for_assessment, reporter, client_event_id')
          .eq('assessment_id', row.assessment_id).abortSignal(signal).maybeSingle();
        if (existing.error) return failed(classifyBackendError({ ...existing.error, status: existing.status }));
        if (existing.data && Object.entries(row).every(([key, value]) =>
          existing.data?.[key as keyof typeof existing.data] === value)) return ok(row.assessment_id);
        return failed({ kind: 'idempotency-conflict', code: '23505', status: request.status });
      });
    },

    insertEvidence(insert) {
      return guarded(async () => {
        // Each branch keeps the table and row types paired for the typed client.
        const request =
          insert.table === 'body_selections'
            ? client.from('body_selections').insert(insert.row)
            : insert.table === 'intake_answers'
              ? client.from('intake_answers').insert(insert.row)
              : insert.table === 'routing_answers'
                ? client.from('routing_answers').insert(insert.row)
                : client.from('safety_answers').insert(insert.row);
        const { data, error, status } = await request.select('id').abortSignal(signal).single();
        if (error) return failed(classifyBackendError({ ...error, status }));
        return ok(data.id);
      });
    },

    findEvidenceByClientEvent(table, assessmentId, clientEventId) {
      return guarded(async () => {
        const { data, error, status } = await client
          .from(table)
          .select(EVIDENCE_COLUMNS[table])
          .eq('assessment_id', assessmentId)
          .eq('client_event_id', clientEventId)
          .abortSignal(signal)
          .maybeSingle();
        if (error) return failed(classifyBackendError({ ...error, status }));
        if (!data) return ok(null);
        const row = data as unknown as Readonly<Record<string, unknown>>;
        return ok({ id: String(row.id), row });
      });
    },

    invokeTrusted(operation, body, invoke = {}) {
      return guarded(async () => {
        const { data, error } = await client.functions.invoke<{ data?: TrustedResponse; error?: { code?: string } }>(
          operation, { body, signal: invoke.signal ?? signal, timeout: invoke.timeoutMs ?? 12000 },
        );
        if (error) {
          const response = error.context instanceof Response ? error.context : null;
          let code = 'function-error';
          if (response) {
            try {
              const envelope = await response.clone().json() as { error?: { code?: unknown } };
              if (typeof envelope.error?.code === 'string') code = envelope.error.code;
            } catch { /* The stable HTTP status is still available. */ }
          }
          const status = response?.status ?? 0;
          return failed(classifyBackendError({ code, status }));
        }
        const payload = data?.data;
        if (!payload || !['applied', 'replayed', 'existing', 'not_triggered'].includes(payload.outcome)
          || typeof payload.status !== 'string') {
          return failed({ kind: 'rejected', code: 'invalid-function-response', status: null });
        }
        return ok(payload);
      });
    },

    readRoutingResult(assessmentId, resultId) {
      return guarded(async () => {
        const result = await client.from('routing_results')
          .select('id, selected_specialty_registry_id, engine_top_specialty_id, stop_reason, belief_cardiology, belief_pulmonology, belief_neurology, belief_gastroenterology, belief_orthopedics, belief_dermatology')
          .eq('assessment_id', assessmentId).eq('id', resultId).abortSignal(signal).maybeSingle();
        if (result.error) return failed(classifyBackendError({ ...result.error, status: result.status }));
        if (!result.data) return ok(null);
        const support = await client.from('routing_result_supporting_answers')
          .select('routing_answer_id').eq('assessment_id', assessmentId)
          .eq('routing_result_id', resultId).order('ordinal').abortSignal(signal);
        if (support.error) return failed(classifyBackendError({ ...support.error, status: support.status }));
        const row = result.data;
        return ok({
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
          supportingAnswerIds: (support.data ?? []).map((item) => item.routing_answer_id),
        });
      });
    },

    readCanonicalOutcome(assessmentId, resultId) {
      return guarded(async () => {
        const { data, error, status } = await client.from('canonical_clinical_outcomes')
          .select('id, outcome, soap_sections')
          .eq('assessment_id', assessmentId).eq('id', resultId)
          .abortSignal(signal).maybeSingle();
        if (error) return failed(classifyBackendError({ ...error, status }));
        return ok(data ? {
          id: data.id,
          outcome: data.outcome as unknown as CanonicalClinicalOutcome,
          soapSections: data.soap_sections as unknown as StoredCanonicalOutcome['soapSections'],
        } : null);
      });
    },

    readEvidenceIds(assessmentId) {
      return guarded(async () => {
        const [intake, routing, safety] = await Promise.all([
          client.from('intake_answers').select('id').eq('assessment_id', assessmentId).order('sequence').limit(201).abortSignal(signal),
          client.from('routing_answers').select('id').eq('assessment_id', assessmentId).order('sequence').limit(201).abortSignal(signal),
          client.from('safety_answers').select('id').eq('assessment_id', assessmentId).order('sequence').limit(201).abortSignal(signal),
        ]);
        for (const stream of [intake, routing, safety]) {
          if (stream.error) return failed(classifyBackendError({ ...stream.error, status: stream.status }));
          if ((stream.data?.length ?? 0) > 200) return failed({ kind: 'rejected', code: 'too-many-evidence-rows', status: null });
        }
        return ok({
          intake: (intake.data ?? []).map((row) => row.id),
          routing: (routing.data ?? []).map((row) => row.id),
          safety: (safety.data ?? []).map((row) => row.id),
        });
      });
    },

    ...(admission ? {
      admitPatient(request: AdmissionRequest) {
        return guarded(async () => {
          // The patient's own access token, held in memory by this client only.
          const { data } = await client.auth.getSession();
          const token = data.session?.access_token;
          if (!token || data.session?.user?.is_anonymous !== true) {
            return failed<AdmissionResponse>({ kind: 'auth', code: 'no-patient-session', status: null });
          }
          return admission(token, request, signal);
        });
      },
    } : {}),

    async close() {
      await disposePatientClient(client);
    },
  };
}
