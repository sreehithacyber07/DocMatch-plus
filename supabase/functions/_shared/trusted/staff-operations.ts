/**
 * R9F trusted staff operations.
 *
 * Staff READS are not here: the R9C facility policies already scope every
 * clinical table to an enabled `clinical_staff` profile in an enabled facility,
 * and they re-check that on every request. Only the two privileged transitions
 * and the workspace context need a trusted path.
 *
 * Identity rule, the same one the patient operations follow: the caller is the
 * verified Auth user from the token, and nothing else. A staff profile,
 * facility, role, reviewer or acknowledger is never read from a request body,
 * so there is nothing there to forge.
 *
 * Reviewing a handoff records who looked at it and who acknowledged it. It
 * changes no answer, no routing result and no SOAP note, and it asserts no
 * diagnosis, assignment, appointment, notification or delivery.
 */
import { TrustedError, isTrustedErrorCode } from './contract.ts';
import type { HandoffOperationRequest } from './request.ts';
import type { StoreOutcome, VerifiedCaller } from './operations.ts';

/** The R9A handoff vocabulary. R9F performs only the two transitions below. */
export const HANDOFF_STATUSES = [
  'prepared',
  'available_for_review',
  'opened',
  'acknowledged',
  'closed',
  'cancelled',
] as const;
export type HandoffStatus = (typeof HANDOFF_STATUSES)[number];

export interface HandoffTransition {
  operation: 'handoff-open' | 'handoff-acknowledge';
  from: readonly HandoffStatus[];
  to: HandoffStatus;
  reasonCode: 'handoff_opened' | 'handoff_acknowledged';
}

/**
 * Opening and acknowledging stay distinct: reading a queue is not opening, and
 * opening a handoff is never an acknowledgement. Acknowledgement requires a
 * separate, explicit action by an authorized clinician.
 */
export const HANDOFF_TRANSITIONS: readonly HandoffTransition[] = [
  { operation: 'handoff-open', from: ['prepared', 'available_for_review'], to: 'opened', reasonCode: 'handoff_opened' },
  { operation: 'handoff-acknowledge', from: ['opened'], to: 'acknowledged', reasonCode: 'handoff_acknowledged' },
];

export function handoffTransitionFor(operation: HandoffTransition['operation']): HandoffTransition {
  const transition = HANDOFF_TRANSITIONS.find((candidate) => candidate.operation === operation);
  if (!transition) throw new TrustedError('INTERNAL');
  return transition;
}

export function isLegalHandoffTransition(operation: HandoffTransition['operation'], from: string): boolean {
  return handoffTransitionFor(operation).from.includes(from as HandoffStatus);
}

/** What a signed-in clinician may learn about their own authorization. */
export interface StaffWorkspace {
  authorized: true;
  facilityName: string;
  role: 'clinical_staff';
}

export interface StaffStore {
  /** Resolves the caller's own staff context, or null when unauthorized. */
  staffWorkspace(authUserId: string): Promise<{ facilityName: string; role: string } | null>;
  openHandoff(args: { handoffId: string; actorAuthUserId: string; clientEventId: string }): Promise<StoreOutcome>;
  acknowledgeHandoff(args: { handoffId: string; actorAuthUserId: string; clientEventId: string }): Promise<StoreOutcome>;
}

export interface HandoffOperationResult {
  outcome: 'applied' | 'replayed' | 'existing';
  status: string;
  handoffId: string;
}

/**
 * A permanent, non-anonymous account is the floor, not the authorization. The
 * database still requires an enabled clinical_staff profile in an enabled
 * facility, on this call and every later one.
 */
function requirePermanentUser(caller: VerifiedCaller): void {
  if (caller.isAnonymous) throw new TrustedError('STAFF_REQUIRED');
}

function unwrap(result: StoreOutcome): Extract<StoreOutcome, { ok: true }> {
  if ('code' in result) throw new TrustedError(isTrustedErrorCode(result.code) ? result.code : 'INTERNAL');
  return result;
}

export async function handleStaffWorkspace(store: StaffStore, caller: VerifiedCaller): Promise<StaffWorkspace> {
  requirePermanentUser(caller);
  const context = await store.staffWorkspace(caller.userId);
  // One refusal for every unauthorized case: no profile, disabled profile,
  // disabled facility, or a role without clinical access.
  if (!context || context.role !== 'clinical_staff') throw new TrustedError('STAFF_REQUIRED');
  return { authorized: true, facilityName: context.facilityName, role: 'clinical_staff' };
}

export async function handleHandoffOpen(
  store: StaffStore,
  caller: VerifiedCaller,
  request: HandoffOperationRequest,
): Promise<HandoffOperationResult> {
  requirePermanentUser(caller);
  const result = unwrap(await store.openHandoff({
    handoffId: request.handoffId,
    actorAuthUserId: caller.userId,
    clientEventId: request.clientEventId,
  }));
  if (!result.recordId) throw new TrustedError('INTERNAL');
  return { outcome: result.outcome, status: result.status, handoffId: result.recordId };
}

export async function handleHandoffAcknowledge(
  store: StaffStore,
  caller: VerifiedCaller,
  request: HandoffOperationRequest,
): Promise<HandoffOperationResult> {
  requirePermanentUser(caller);
  const result = unwrap(await store.acknowledgeHandoff({
    handoffId: request.handoffId,
    actorAuthUserId: caller.userId,
    clientEventId: request.clientEventId,
  }));
  if (!result.recordId) throw new TrustedError('INTERNAL');
  return { outcome: result.outcome, status: result.status, handoffId: result.recordId };
}
