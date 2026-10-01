/**
 * Request body validation for the trusted operations.
 *
 * Each operation accepts a closed set of keys. Anything else (an owner ID, a
 * facility, a staff profile, a "final specialty", an "emergency" flag, a SOAP
 * document, a list of supporting answers) is refused rather than ignored, so a
 * forged field can never be mistaken for an accepted one.
 */
import { COMPLAINT_SOURCES, TrustedError, type TrustedComplaintSource } from './contract.ts';

export const MAX_BODY_BYTES = 2048;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CATALOG_ID = /^[a-z0-9][a-z0-9-]{0,79}$/;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}

export interface AssessmentStartRequest {
  assessmentId: string;
  clientEventId: string;
  complaintId: string;
  complaintSource: TrustedComplaintSource;
}

export interface AssessmentOperationRequest {
  assessmentId: string;
  clientEventId: string;
}

function plainObject(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new TrustedError('INVALID_REQUEST');
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new TrustedError('INVALID_REQUEST');
  return value as Record<string, unknown>;
}

function exactKeys(body: Record<string, unknown>, keys: readonly string[]): void {
  const present = Object.keys(body);
  if (present.length !== keys.length || !present.every((key) => keys.includes(key))) {
    throw new TrustedError('INVALID_REQUEST');
  }
}

function uuidField(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  if (!isUuid(value)) throw new TrustedError('INVALID_REQUEST');
  return value.toLowerCase();
}

/** Parses JSON text already bounded in size. */
export function parseJsonBody(text: string): unknown {
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) throw new TrustedError('PAYLOAD_TOO_LARGE');
  try {
    return JSON.parse(text);
  } catch {
    throw new TrustedError('INVALID_REQUEST');
  }
}

function complaintFields(body: Record<string, unknown>): { complaintId: string; complaintSource: TrustedComplaintSource } {
  const complaintId = body.complaintId;
  const complaintSource = body.complaintSource;
  if (typeof complaintId !== 'string' || !CATALOG_ID.test(complaintId)) throw new TrustedError('INVALID_REQUEST');
  if (typeof complaintSource !== 'string' || !(COMPLAINT_SOURCES as readonly string[]).includes(complaintSource)) {
    throw new TrustedError('INVALID_REQUEST');
  }
  return { complaintId, complaintSource: complaintSource as TrustedComplaintSource };
}

export function parseAssessmentStart(value: unknown): AssessmentStartRequest {
  const body = plainObject(value);
  exactKeys(body, ['assessmentId', 'clientEventId', 'complaintId', 'complaintSource']);
  const complaint = complaintFields(body);
  return {
    assessmentId: uuidField(body, 'assessmentId'),
    clientEventId: uuidField(body, 'clientEventId'),
    ...complaint,
  };
}

/** safety-evaluate and routing-finalize take only the assessment and an idempotency key. */
export function parseAssessmentOperation(value: unknown): AssessmentOperationRequest {
  const body = plainObject(value);
  exactKeys(body, ['assessmentId', 'clientEventId']);
  return { assessmentId: uuidField(body, 'assessmentId'), clientEventId: uuidField(body, 'clientEventId') };
}

export interface StaffedAdmissionRequest {
  /** The fresh anonymous patient's access token, verified by Supabase Auth. */
  patientAccessToken: string;
  clientEventId: string;
  complaintId: string;
  complaintSource: TrustedComplaintSource;
}

/** A compact JWT: three base64url segments. Its claims are never read here. */
const ACCESS_TOKEN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
export const MAX_PATIENT_TOKEN_LENGTH = 1600;

/**
 * R9G-B staffed-tablet admission. The staff member is the bearer; the body
 * carries only the patient principal's token, a stable operation key and the
 * confirmed complaint. A facility, staff profile, owner, mode or status in the
 * body is refused like any other unknown key.
 */
export function parseStaffedAdmission(value: unknown): StaffedAdmissionRequest {
  const body = plainObject(value);
  exactKeys(body, ['patientAccessToken', 'clientEventId', 'complaintId', 'complaintSource']);
  const token = body.patientAccessToken;
  if (typeof token !== 'string' || token.length > MAX_PATIENT_TOKEN_LENGTH || !ACCESS_TOKEN.test(token)) {
    throw new TrustedError('INVALID_REQUEST');
  }
  return {
    patientAccessToken: token,
    clientEventId: uuidField(body, 'clientEventId'),
    ...complaintFields(body),
  };
}

export interface HandoffOperationRequest {
  handoffId: string;
  clientEventId: string;
}

/** A staff transition takes only the handoff and a stable operation key. */
export function parseHandoffOperation(value: unknown): HandoffOperationRequest {
  const body = plainObject(value);
  exactKeys(body, ['handoffId', 'clientEventId']);
  return { handoffId: uuidField(body, 'handoffId'), clientEventId: uuidField(body, 'clientEventId') };
}

/** The workspace context request carries nothing; identity comes from the token. */
export function parseNoFields(value: unknown): Record<string, never> {
  const body = plainObject(value);
  exactKeys(body, []);
  return body as Record<string, never>;
}
