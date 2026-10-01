/**
 * What the handoff screen displays, as a function rather than as markup.
 *
 * This exists so the presentation rule has exactly one definition. The result
 * screen imports it to render, and the routing QA harness and tests import it
 * to assert that what the interface shows matches what the engine returned. If
 * the rule lived only inside the component, the harness could only ever check
 * its own guess about the rule, which is how an engine/UI mismatch goes
 * unnoticed.
 *
 * Labels come from the NBEMS-based specialty registry, so the engine's internal
 * ids (`pulmonology`, `orthopedics`) are presented under Indian canonical
 * discipline names (Respiratory Medicine, Orthopaedics).
 */
import type { SpecialtyId, StopReason, StoppingDecision } from '../../engine/index.ts';
import { GENERAL_MEDICINE, isWeightedRoutable, specialtyForEngineId } from './specialty-registry.ts';

/** Patient-facing label for each R1 candidate. */
export const SPECIALTY_LABEL: Record<SpecialtyId, string> = {
  cardiology: specialtyForEngineId('cardiology').patientFacingName,
  pulmonology: specialtyForEngineId('pulmonology').patientFacingName,
  neurology: specialtyForEngineId('neurology').patientFacingName,
  gastroenterology: specialtyForEngineId('gastroenterology').patientFacingName,
  orthopedics: specialtyForEngineId('orthopedics').patientFacingName,
  dermatology: specialtyForEngineId('dermatology').patientFacingName,
};

/**
 * The endpoint shown when no specialty separated from the others.
 *
 * General Medicine is a real NBEMS discipline and the correct first point of
 * care for a genuinely nonspecific presentation. It is NOT a seventh Bayesian
 * candidate: the engine never scores it. It is where a run that did not
 * converge is honestly sent.
 */
export const UNCONVERGED_LABEL = GENERAL_MEDICINE.patientFacingName;

/**
 * Whether the run actually found a direction.
 *
 * Only the two evidential stop conditions count. `max_questions` means the
 * question budget ran out with neither threshold met, and in that state the
 * engine's `topSpecialtyId` is whatever sorted first among equals: an upper
 * abdominal interview answered entirely "no" leaves four specialties tied at
 * 0.192 and reports dermatology, purely because the tie breaks alphabetically.
 * Presenting that as a recommendation is the failure mode this guard prevents.
 */
export function didConverge(decision: Readonly<Pick<StoppingDecision, 'reason'>>): boolean {
  return decision.reason === 'top_probability' || decision.reason === 'margin';
}

/**
 * A converged engine id is patient-presentable only while the registry lets
 * the belief vector select it. A record routable only through published
 * criteria (Dermatology) is never presented from a belief.
 */
export function hasPresentableRoute(
  decision: Readonly<Pick<StoppingDecision, 'reason'>>,
  specialtyId: SpecialtyId,
): boolean {
  return didConverge(decision) && isWeightedRoutable(specialtyForEngineId(specialtyId));
}

/** Exactly what the result screen prints as the direction. */
export function displayedDirection(
  decision: Readonly<Pick<StoppingDecision, 'reason'>>,
  specialtyId: SpecialtyId,
): string {
  return hasPresentableRoute(decision, specialtyId) ? SPECIALTY_LABEL[specialtyId] : UNCONVERGED_LABEL;
}

/** Human wording for a stop reason, for audit output. */
export function stopReasonLabel(reason: StopReason | null): string {
  switch (reason) {
    case 'top_probability':
      return 'top probability threshold met';
    case 'margin':
      return 'margin threshold met';
    case 'max_questions':
      return 'question budget exhausted, neither threshold met';
    default:
      return 'still running';
  }
}
