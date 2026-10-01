/**
 * SOAP trust boundary (R9G-A foundation for R9E).
 *
 * No trusted operation accepts a SOAP document from the browser. R9E will
 * generate the note on the server from `trustedSoapInputs`, which is built only
 * from persisted evidence and a server-derived routing result, and will check
 * the generated note with `validateSoapSections` before writing it.
 *
 * Section rules (R9A):
 *   S  patient-reported information only
 *   O  captured Body Explorer facts and the explicit no-measurements line; no
 *      vitals, examination, labs or imaging
 *   A  routing assessment and specialty direction, never a diagnosis
 *   P  specialty direction and a prepared handoff, never treatment, a
 *      prescription or a delivery claim
 */
import { bodyRegionById, type BodyRegionId } from '../../../../src/body/index.ts';
import { NO_MEASUREMENTS_NOTE } from './soap-constants.ts';
import { TrustedError, type TrustedComplaintSource } from './contract.ts';
import type { DerivedRoutingResult, TrustedInterviewState } from './derive.ts';

export const SOAP_KEYS = ['S', 'O', 'A', 'P'] as const;
export type SoapKey = (typeof SOAP_KEYS)[number];

export interface SoapLineRecord {
  label: string;
  value: string;
}

export type SoapSectionsRecord = Record<SoapKey, SoapLineRecord[]>;

export const SOAP_LIMITS = { linesPerSection: 16, labelLength: 80, valueLength: 1200 } as const;

/** Things this product never captures or decides; their presence means fabrication. */
const FABRICATED_OBSERVATION = /\b(blood pressure|heart rate|pulse rate|temperature|oxygen saturation|spo2|respiratory rate|mmhg|bpm|examination (revealed|showed|finding)|on examination|auscultation|palpation|lab(oratory)? results?|imaging (shows|showed|revealed)|x-ray shows|ct shows|mri shows|ecg shows)\b/i;
const DIAGNOSTIC_CLAIM = /\b(diagnosed with|diagnosis is|diagnosis:|differential diagnosis|likely has|consistent with (a|an)?\s*\w+ (disease|infection|syndrome|disorder))\b/i;
const TREATMENT_CLAIM = /\b(prescribe[ds]?|prescription for|administer|take \d+|\d+\s?(mg|ml|mcg)\b|dosage|start (treatment|medication)|treat with)\b/i;
const DELIVERY_CLAIM = /\b(sent to|delivered to|transmitted|doctor notified|nurse notified|staff notified|acknowledged by|queue token|room assigned)\b/i;

function isLine(value: unknown): value is SoapLineRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  if (keys.length !== 2 || !keys.includes('label') || !keys.includes('value')) return false;
  const line = value as Record<string, unknown>;
  return (
    typeof line.label === 'string' &&
    typeof line.value === 'string' &&
    line.label.trim().length > 0 &&
    line.value.trim().length > 0 &&
    line.label.length <= SOAP_LIMITS.labelLength &&
    line.value.length <= SOAP_LIMITS.valueLength
  );
}

/**
 * Structural and semantic check for a SOAP document. Returns the typed
 * sections or throws INVALID_EVIDENCE. Used on server-generated notes; the
 * browser has no path to submit one.
 */
export function validateSoapSections(value: unknown): SoapSectionsRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new TrustedError('INVALID_EVIDENCE');
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length !== SOAP_KEYS.length || !SOAP_KEYS.every((key) => keys.includes(key))) {
    throw new TrustedError('INVALID_EVIDENCE');
  }
  for (const key of SOAP_KEYS) {
    const lines = record[key];
    if (!Array.isArray(lines) || lines.length === 0 || lines.length > SOAP_LIMITS.linesPerSection || !lines.every(isLine)) {
      throw new TrustedError('INVALID_EVIDENCE');
    }
  }
  const sections = record as SoapSectionsRecord;
  const text = (key: SoapKey) => sections[key].map((line) => `${line.label} ${line.value}`).join('\n');

  if (!sections.O.some((line) => line.value === NO_MEASUREMENTS_NOTE)) throw new TrustedError('INVALID_EVIDENCE');
  const objectiveWithoutNote = sections.O.filter((line) => line.value !== NO_MEASUREMENTS_NOTE)
    .map((line) => `${line.label} ${line.value}`)
    .join('\n');
  if (FABRICATED_OBSERVATION.test(objectiveWithoutNote)) throw new TrustedError('INVALID_EVIDENCE');
  for (const key of SOAP_KEYS) {
    const content = text(key);
    if (DIAGNOSTIC_CLAIM.test(content) || DELIVERY_CLAIM.test(content)) throw new TrustedError('INVALID_EVIDENCE');
  }
  if (TREATMENT_CLAIM.test(text('A')) || TREATMENT_CLAIM.test(text('P'))) throw new TrustedError('INVALID_EVIDENCE');
  return sections;
}

/* --- Trusted inputs ------------------------------------------------------------ */

export interface BodySelectionRow {
  id: string;
  region_id: string;
  view: string;
  precision: string;
  point_x: number | null;
  point_y: number | null;
  recorded_at: string;
  supersedes_record_id: string | null;
}

export interface TrustedSoapInputs {
  complaintId: string;
  complaintSource: TrustedComplaintSource;
  body: {
    recordId: string;
    regionId: BodyRegionId;
    view: 'front' | 'back';
    precision: 'general-area' | 'exact-point';
    point: { x: number; y: number } | null;
  } | null;
  intakeAnswers: readonly { questionId: string; optionId: string }[];
  routingAnswers: readonly { questionId: string; optionId: string }[];
  safetyAnswers: readonly { questionId: string; optionId: string }[];
  routing: Pick<DerivedRoutingResult, 'converged' | 'selectedSpecialtyRegistryId' | 'engineTopSpecialtyId' | 'stopReason'>;
  safety: 'no_warning_sign_triggered';
}

/** The current body selection: the head of the correction chain. */
export function activeBodySelection(rows: readonly BodySelectionRow[]): BodySelectionRow | null {
  if (rows.length === 0) return null;
  const superseded = new Set(rows.map((row) => row.supersedes_record_id).filter((id): id is string => id !== null));
  const heads = rows.filter((row) => !superseded.has(row.id));
  if (heads.length !== 1) throw new TrustedError('INVALID_EVIDENCE');
  return heads[0];
}

/**
 * Everything R9E may put in a note, derived from persisted evidence and the
 * server's own routing result. A priority-interrupted assessment has no
 * routing result and therefore no SOAP inputs (R9A: that artifact is not
 * produced by the current builder).
 */
export function trustedSoapInputs(args: {
  complaintSource: TrustedComplaintSource;
  state: TrustedInterviewState;
  routing: DerivedRoutingResult;
  bodyRows: readonly BodySelectionRow[];
}): TrustedSoapInputs {
  const { state, routing } = args;
  if (state.controller.status !== 'result') throw new TrustedError('ROUTING_NOT_FINAL');
  const head = activeBodySelection(args.bodyRows);
  let body: TrustedSoapInputs['body'] = null;
  if (head) {
    const region = bodyRegionById(head.region_id);
    if (!region || (head.view !== 'front' && head.view !== 'back')) throw new TrustedError('INVALID_EVIDENCE');
    if (head.precision !== 'general-area' && head.precision !== 'exact-point') throw new TrustedError('INVALID_EVIDENCE');
    const exact = head.precision === 'exact-point';
    if (exact && (head.point_x === null || head.point_y === null ||
      !Number.isFinite(head.point_x) || !Number.isFinite(head.point_y) ||
      head.point_x < 0 || head.point_x > 1 || head.point_y < 0 || head.point_y > 1)) {
      throw new TrustedError('INVALID_EVIDENCE');
    }
    if (!exact && (head.point_x !== null || head.point_y !== null)) throw new TrustedError('INVALID_EVIDENCE');
    body = {
      recordId: head.id,
      regionId: region.id,
      view: head.view,
      precision: head.precision,
      point: exact ? { x: head.point_x as number, y: head.point_y as number } : null,
    };
  }
  return {
    complaintId: state.complaintId,
    complaintSource: args.complaintSource,
    body,
    intakeAnswers: state.intakeAnswers.map(({ questionId, optionId }) => ({ questionId, optionId })),
    routingAnswers: state.session.answers.map(({ questionId, optionId }) => ({ questionId, optionId })),
    safetyAnswers: state.safetyAnswers.map(({ questionId, optionId }) => ({ questionId, optionId })),
    routing: {
      converged: routing.converged,
      selectedSpecialtyRegistryId: routing.selectedSpecialtyRegistryId,
      engineTopSpecialtyId: routing.engineTopSpecialtyId,
      stopReason: routing.stopReason,
    },
    safety: 'no_warning_sign_triggered',
  };
}
