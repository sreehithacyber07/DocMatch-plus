/**
 * The clinical worklist, read through row-level security.
 *
 * Every read here is an ordinary Data API query made with the clinician's own
 * session. The R9C policies restrict each one to assessments in the facility of
 * an enabled `clinical_staff` profile, and they re-check that profile and
 * facility on every request. This module therefore contains no authorization
 * logic of its own: filtering in a browser is presentation, not security.
 *
 * The two state changes are not reads and do not go through this path. They are
 * trusted operations, and the server resolves the acting clinician from the
 * verified token.
 */
import { bodyRegionById } from '../../body/index.ts';
import { patientRelativeSide } from '../body-explorer/laterality.ts';
import { R2B_DEMONSTRATION_COMPLAINTS, R2B_DEMONSTRATION_KNOWLEDGE } from '../../engine/data/index.ts';
import { R3_SAFETY_KNOWLEDGE } from '../../engine/safety/index.ts';
import { intakeOptionLabel, intakeQuestionsFor } from '../routing-flow/intake-questions.ts';
import { SPECIALTY_REGISTRY } from '../routing-flow/specialty-registry.ts';
import type { StaffClient } from './session.ts';

export type HandoffStatus = 'prepared' | 'available_for_review' | 'opened' | 'acknowledged' | 'closed' | 'cancelled';

export const HANDOFF_STATUS_LABEL: Readonly<Record<HandoffStatus, string>> = {
  prepared: 'Prepared',
  available_for_review: 'Ready for review',
  opened: 'Opened',
  acknowledged: 'Acknowledged',
  closed: 'Closed',
  cancelled: 'Cancelled',
};

export interface QueueItem {
  handoffId: string;
  assessmentId: string;
  soapHandoffId: string;
  status: HandoffStatus;
  preparedAt: string;
  updatedAt: string;
  complaintLabel: string;
  complaintId?: string | null;
  directionLabel: string | null;
  /** True only when R3 recorded a warning-sign event for this assessment. */
  priority: boolean;
  prioritySeverity: 'emergency' | 'urgent' | null;
  canonical?: boolean;
}

export interface AnswerLine {
  questionId: string;
  question: string;
  answer: string;
}

export interface SoapLineView {
  label: string;
  value: string;
}

export interface HandoffDetailView {
  item: QueueItem;
  bodyContext: string | null;
  intake: readonly AnswerLine[];
  routing: readonly AnswerLine[];
  safety: readonly AnswerLine[];
  soap: Readonly<Record<'S' | 'O' | 'A' | 'P', readonly SoapLineView[]>> | null;
  routeSummary: { direction: string | null; converged: boolean; stopReason: string } | null;
  history: readonly { label: string; at: string }[];
}

/**
 * unauthorized  the account may no longer use the workspace (RLS or 403);
 * expired       the session itself ended (an expired or invalid JWT, or 401);
 * unavailable   anything else, which the reviewer can retry.
 */
export type WorkspaceFailure = 'unauthorized' | 'expired' | 'unavailable';

export class WorkspaceError extends Error {
  readonly failure: WorkspaceFailure;
  constructor(failure: WorkspaceFailure) {
    super(failure);
    this.name = 'WorkspaceError';
    this.failure = failure;
  }
}

export interface AnswerRow {
  question_id: string;
  option_id: string | null;
  operation: string;
  sequence: number;
}

/**
 * Display projection of an append-only answer stream: the latest event per
 * question wins and a clear removes it. The server keeps its own authoritative
 * projection; this one only decides what a reviewer reads.
 */
export function activeAnswers(rows: readonly AnswerRow[]): { questionId: string; optionId: string }[] {
  const active: { questionId: string; optionId: string }[] = [];
  for (const row of [...rows].sort((left, right) => left.sequence - right.sequence)) {
    const index = active.findIndex((entry) => entry.questionId === row.question_id);
    if (row.operation === 'cleared') {
      if (index >= 0) active.splice(index, 1);
      continue;
    }
    if (typeof row.option_id !== 'string') continue;
    if (index >= 0) active[index] = { questionId: row.question_id, optionId: row.option_id };
    else active.push({ questionId: row.question_id, optionId: row.option_id });
  }
  return active;
}

function failIf(error: { code?: string } | null): void {
  if (!error) return;
  if (error.code === '42501') throw new WorkspaceError('unauthorized');
  if (typeof error.code === 'string' && /^PGRST30[0-3]$/.test(error.code)) throw new WorkspaceError('expired');
  throw new WorkspaceError('unavailable');
}

const complaintLabel = (id: string | null) =>
  R2B_DEMONSTRATION_COMPLAINTS.find((complaint) => complaint.id === id)?.label ?? 'Concern not recorded';

const specialtyLabel = (id: string | null | undefined) =>
  SPECIALTY_REGISTRY.find((record) => record.id === id)?.patientFacingName ?? null;

/** The facility's prepared handoffs, newest first. */
export async function loadQueue(client: StaffClient, limit = 50): Promise<QueueItem[]> {
  const [handoffs, canonical] = await Promise.all([
    client.from('clinical_handoffs')
      .select('id, assessment_id, soap_handoff_id, status, created_at, updated_at')
      .order('created_at', { ascending: false }).limit(limit),
    client.from('canonical_clinical_outcomes')
      .select('id, assessment_id, handoff_status, outcome, recorded_at, updated_at')
      .not('handoff_status', 'is', null)
      .order('recorded_at', { ascending: false }).limit(limit),
  ]);
  failIf(handoffs.error);
  failIf(canonical.error);
  const rows = handoffs.data ?? [];
  const canonicalRows = canonical.data ?? [];
  if (rows.length === 0 && canonicalRows.length === 0) return [];

  const assessmentIds = [...new Set([...rows, ...canonicalRows].map((row) => row.assessment_id))];
  const [assessments, results, safety] = await Promise.all([
    client.from('assessment_sessions').select('id, complaint_id').in('id', assessmentIds),
    client.from('routing_results').select('assessment_id, selected_specialty_registry_id').in('assessment_id', assessmentIds),
    client.from('safety_events').select('assessment_id, severity').in('assessment_id', assessmentIds),
  ]);
  failIf(assessments.error);
  failIf(results.error);
  failIf(safety.error);

  const legacyItems = rows.map((row) => {
    const assessment = assessments.data?.find((entry) => entry.id === row.assessment_id);
    const result = results.data?.find((entry) => entry.assessment_id === row.assessment_id);
    const event = safety.data?.find((entry) => entry.assessment_id === row.assessment_id);
    return {
      handoffId: row.id,
      assessmentId: row.assessment_id,
      soapHandoffId: row.soap_handoff_id,
      status: row.status as HandoffStatus,
      preparedAt: row.created_at,
      updatedAt: row.updated_at,
      complaintLabel: complaintLabel(assessment?.complaint_id ?? null),
      complaintId: assessment?.complaint_id ?? null,
      directionLabel: specialtyLabel(result?.selected_specialty_registry_id),
      priority: Boolean(event),
      prioritySeverity: (event?.severity as 'emergency' | 'urgent' | undefined) ?? null,
    };
  });
  const canonicalItems: QueueItem[] = canonicalRows.map((row) => {
    const assessment = assessments.data?.find((entry) => entry.id === row.assessment_id);
    const outcome = row.outcome as { specialtyId?: string; urgency?: string };
    return {
      handoffId: row.id, assessmentId: row.assessment_id, soapHandoffId: row.id,
      status: row.handoff_status as HandoffStatus,
      preparedAt: row.recorded_at, updatedAt: row.updated_at,
      complaintLabel: complaintLabel(assessment?.complaint_id ?? null),
      complaintId: assessment?.complaint_id ?? null,
      directionLabel: specialtyLabel(outcome.specialtyId),
      priority: outcome.urgency === 'urgent',
      prioritySeverity: outcome.urgency === 'urgent' ? 'urgent' : null,
      canonical: true,
    };
  });
  return [...legacyItems, ...canonicalItems]
    .sort((left, right) => right.preparedAt.localeCompare(left.preparedAt)).slice(0, limit);
}

export async function loadHandoffDetail(client: StaffClient, item: QueueItem): Promise<HandoffDetailView> {
  const [intakeRows, routingRows, safetyRows, bodyRows, soap, result, audit] = await Promise.all([
    client.from('intake_answers').select('question_id, option_id, operation, sequence').eq('assessment_id', item.assessmentId),
    client.from('routing_answers').select('question_id, option_id, operation, sequence').eq('assessment_id', item.assessmentId),
    client.from('safety_answers').select('question_id, option_id, operation, sequence').eq('assessment_id', item.assessmentId),
    client.from('body_selections').select('id, region_id, view, precision, supersedes_record_id').eq('assessment_id', item.assessmentId),
    item.canonical
      ? client.from('canonical_clinical_outcomes').select('soap_sections, outcome').eq('id', item.handoffId).maybeSingle()
      : client.from('soap_handoffs').select('sections').eq('id', item.soapHandoffId).maybeSingle(),
    item.canonical
      ? client.from('canonical_clinical_outcomes').select('outcome').eq('id', item.handoffId).maybeSingle()
      : client.from('routing_results').select('selected_specialty_registry_id, engine_top_specialty_id, stop_reason').eq('assessment_id', item.assessmentId).maybeSingle(),
    item.canonical
      ? client.from('canonical_handoff_events').select('to_status, occurred_at').eq('outcome_id', item.handoffId).order('occurred_at')
      : client.from('audit_events').select('kind, from_status, to_status, reason_code, occurred_at').eq('assessment_id', item.assessmentId).order('occurred_at'),
  ]);
  for (const response of [intakeRows, routingRows, safetyRows, bodyRows, soap, result, audit]) failIf(response.error);
  // A clinical handoff has both rows by FK. Missing reads here mean access
  // changed or the record is inconsistent; never present an incomplete review.
  if (!soap.data || !result.data) throw new WorkspaceError('unavailable');

  const intakePlan = intakeQuestionsFor(
    item.complaintId ?? R2B_DEMONSTRATION_COMPLAINTS.find((complaint) => complaint.label === item.complaintLabel)?.id ?? '',
  );
  const intake: AnswerLine[] = activeAnswers(intakeRows.data ?? []).flatMap((answer) => {
    const question = intakePlan.find((candidate) => candidate.id === answer.questionId);
    return question
      ? [{ questionId: answer.questionId, question: question.eyebrow, answer: intakeOptionLabel(question, answer.optionId) }]
      : [];
  });
  const routing: AnswerLine[] = activeAnswers(routingRows.data ?? []).flatMap((answer) => {
    const question = R2B_DEMONSTRATION_KNOWLEDGE.questions.find((candidate) => candidate.id === answer.questionId);
    const option = question?.options.find((candidate) => candidate.id === answer.optionId);
    return question && option ? [{ questionId: answer.questionId, question: question.text, answer: option.label }] : [];
  });
  const safetyLines: AnswerLine[] = activeAnswers(safetyRows.data ?? []).flatMap((answer) => {
    const question = R3_SAFETY_KNOWLEDGE.questions.find(
      (candidate) => candidate.kind === 'safety_owned' && candidate.id === answer.questionId,
    );
    if (!question || question.kind !== 'safety_owned') return [];
    const option = question.options.find((candidate) => candidate.id === answer.optionId);
    return option ? [{ questionId: answer.questionId, question: question.text, answer: option.label }] : [];
  });

  const superseded = new Set((bodyRows.data ?? []).map((row) => row.supersedes_record_id).filter(Boolean));
  const head = (bodyRows.data ?? []).find((row) => !superseded.has(row.id));
  const region = head ? bodyRegionById(head.region_id) : undefined;
  const side = region ? patientRelativeSide(region.laterality) : null;
  const bodyContext = region
    ? [region.label, side, head?.view === 'back' ? 'Back view' : 'Front view',
       head?.precision === 'exact-point' ? 'Exact point marked' : 'General area'].filter(Boolean).join(' / ')
    : null;

  const sections = (item.canonical ? ('soap_sections' in soap.data! ? soap.data.soap_sections : null)
    : ('sections' in soap.data! ? soap.data.sections : null)) as Record<string, { label: string; value: string }[]> | null;
  const soapView = sections && ['S', 'O', 'A', 'P'].every((key) => Array.isArray(sections[key]))
    ? { S: sections.S, O: sections.O, A: sections.A, P: sections.P }
    : null;
  if (!soapView) throw new WorkspaceError('unavailable');

  return {
    item,
    bodyContext,
    intake,
    routing,
    safety: safetyLines,
    soap: soapView,
    routeSummary: result.data
      ? {
          direction: item.canonical
            ? specialtyLabel((result.data as { outcome: { specialtyId: string } }).outcome.specialtyId)
            : specialtyLabel((result.data as { selected_specialty_registry_id: string }).selected_specialty_registry_id),
          converged: item.canonical
            ? (result.data as { outcome: { routeType: string } }).outcome.routeType !== 'parent-fallback'
            : (result.data as { selected_specialty_registry_id: string }).selected_specialty_registry_id !== 'general-medicine',
          stopReason: item.canonical
            ? (result.data as { outcome: { routeType: string } }).outcome.routeType
            : (result.data as { stop_reason: string }).stop_reason,
        }
      : null,
    history: (audit.data ?? [])
      .filter((row) => item.canonical || ('kind' in row && row.kind === 'handoff_transition'))
      .map((row) => ({
        label: ('to_status' in row && row.to_status === 'acknowledged') ? 'Acknowledged by care team' : 'Opened by care team',
        at: row.occurred_at,
      })),
  };
}

export type TransitionOutcome = 'applied' | 'replayed' | 'existing';

export interface TransitionResult {
  outcome: TransitionOutcome;
  status: HandoffStatus;
}

/**
 * Runs one trusted transition. The request carries the handoff and a stable
 * operation key and nothing else: the acting clinician, their facility and
 * their role are resolved server-side from the verified session.
 */
export async function runHandoffTransition(
  client: StaffClient,
  operation: 'handoff-open' | 'handoff-acknowledge',
  handoffId: string,
  clientEventId: string,
): Promise<TransitionResult> {
  const { data, error } = await client.functions.invoke<{ data?: { outcome: TransitionOutcome; status: HandoffStatus } }>(
    operation,
    { body: { handoffId, clientEventId } },
  );
  if (error) {
    const response = error.context instanceof Response ? error.context : null;
    throw new WorkspaceError(response?.status === 403 ? 'unauthorized' : response?.status === 401 ? 'expired' : 'unavailable');
  }
  const payload = data?.data;
  if (!payload || !['applied', 'replayed', 'existing'].includes(payload.outcome)) {
    throw new WorkspaceError('unavailable');
  }
  return { outcome: payload.outcome, status: payload.status };
}
