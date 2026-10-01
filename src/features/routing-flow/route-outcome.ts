/**
 * The single definition of what the result screen shows.
 *
 * There is exactly one function here that decides the direction, and the live
 * interview, the QA harness and the tests all call it. When the rule lived
 * inside the component, an audit could only check its own guess at the rule.
 *
 * THREE WAYS A RUN CAN END, AND THEY ARE NOT INTERCHANGEABLE
 *
 *   bayesian-convergence      The R1 belief vector separated a calibrated
 *                             candidate, on approved likelihoods, and the
 *                             registry route for it is enabled.
 *
 *   source-backed-criteria    No probability was computed. The answers
 *                             satisfied a published referral criterion, and
 *                             the criterion and its source are carried through
 *                             to the explanation.
 *
 *   parent-service            Neither happened, and the run says which of the
 *                             named reasons applied. General Medicine and
 *                             Paediatrics are only ever reached this way.
 *
 * A parent service is never selected while the interview could still ask a
 * question that would change the answer: `assertNoUsefulDiscriminatorsRemain`
 * is called on the way past, and the interview continues instead.
 */
import type { SpecialtyId, StoppingDecision } from '../../engine/index.ts';
import { isGenericCoverageComplaint, type RegionAssessmentContext } from '../body-explorer/clinical-coverage.ts';
import {
  evaluateDirectionGate,
  FALLBACK_REASON_TEXT,
  type DirectionGateResult,
  type FallbackReason,
  type GateEvidence,
} from './direction-gate.ts';
import {
  assertNoUsefulDiscriminatorsRemain,
  budgetFromAnswers,
  type StopCondition,
} from './discrimination.ts';
import { didConverge } from './handoff-presentation.ts';
import { intakePlanFor, questionIsEligible, type IntakeAnswer } from './intake-questions.ts';
import {
  GENERAL_MEDICINE,
  isWeightedRoutable,
  PAEDIATRICS,
  specialtyForDirectionId,
  specialtyForEngineId,
} from './specialty-registry.ts';
import { eligibleRouteDirections, isPresentable } from './route-eligibility.ts';

export type RouteBasis = 'bayesian-convergence' | 'source-backed-criteria' | 'parent-service';

export interface SupportingSignal {
  /** Patient-facing wording. Never a disease name, never a number. */
  label: string;
  sourceIds: readonly string[];
  /** The published wording the criterion encodes, for the clinician view. */
  sourceCriterion: string;
}

export interface RouteOutcome {
  registryId: string;
  label: string;
  basis: RouteBasis;
  /** The answers that carried the direction. Empty for a parent service. */
  supportingSignals: readonly SupportingSignal[];
  /** Named, never `DEFAULT`. Null when a direction was established. */
  fallbackReason: FallbackReason | null;
  fallbackExplanation: string | null;
  stopCondition: StopCondition;
  gate: DirectionGateResult | null;
  /** Fails loudly in development when a parent service was reached too early. */
  guardMessage: string | null;
  /**
   * An approved weighted complaint ran its calibrated question set and still
   * did not separate a candidate. This is a limitation of the frozen
   * likelihood tables, not of the patient's answers, and it is counted so it
   * can be reported rather than absorbed by the parent service.
   */
  calibrationGap?: boolean;
}

export interface RouteOutcomeInput {
  clinicalContext: RegionAssessmentContext | null;
  complaintId: string;
  intakeAnswers: readonly IntakeAnswer[];
  stoppingDecision: Readonly<Pick<StoppingDecision, 'reason'>>;
  engineSpecialtyId: SpecialtyId;
  /** True only for a `must_stop` R3 rule. An urgent rule is not a hard stop. */
  hardStop?: boolean;
  safetyAnswerCount?: number;
  routingAnswerCount?: number;
  /**
   * The answers given to a weighted complaint's approved R1 questions. The
   * direction gate reads them as answers only (never as likelihoods), so a
   * published criterion the patient already answered is not asked again.
   */
  routingAnswers?: readonly GateEvidence[];
}

/**
 * Whether R1 itself selected a route: an adult run that converged on an
 * enabled, weighted, presentable service. The interview plan asks this before
 * opening a weighted complaint's discrimination extension, so the extension is
 * asked only when R1 did not separate a candidate.
 */
export function weightedRouteSelected(input: {
  clinicalContext: RegionAssessmentContext | null;
  complaintId: string;
  stoppingDecision: Readonly<Pick<StoppingDecision, 'reason'>>;
  engineSpecialtyId: SpecialtyId;
}): boolean {
  const engineRecord = specialtyForEngineId(input.engineSpecialtyId);
  // A weighted run with no clinical context predates age capture and is adult.
  const isAdult = input.clinicalContext ? input.clinicalContext.patientMode === 'adult' : true;
  return isAdult
    && didConverge(input.stoppingDecision)
    && isWeightedRoutable(engineRecord)
    // Engine state is not a route: only a direction plausible for this presentation is shown.
    && isPresentable(eligibleRouteDirections(input.clinicalContext, input.complaintId), engineRecord.id);
}

function gateRoute(gate: DirectionGateResult): RouteOutcome {
  const record = specialtyForDirectionId(gate.direction!.directionId);
  return {
    registryId: record.id,
    label: record.patientFacingName,
    basis: 'source-backed-criteria',
    supportingSignals: gate.direction!.satisfied.map((criterion) => ({
      label: criterion.label,
      sourceIds: criterion.sourceIds,
      sourceCriterion: criterion.sourceCriterion,
    })),
    fallbackReason: null,
    fallbackExplanation: null,
    stopCondition: 'SPECIALTY_SUFFICIENT',
    gate,
    guardMessage: null,
  };
}

export function resolveRouteOutcome(input: RouteOutcomeInput): RouteOutcome {
  const hardStop = input.hardStop ?? false;

  /* 1. The calibrated path, when it converged on an enabled, presentable route. */
  const engineRecord = specialtyForEngineId(input.engineSpecialtyId);
  const eligibility = eligibleRouteDirections(input.clinicalContext, input.complaintId);

  if (weightedRouteSelected(input)) {
    return {
      registryId: engineRecord.id,
      label: engineRecord.patientFacingName,
      basis: 'bayesian-convergence',
      supportingSignals: [],
      fallbackReason: null,
      fallbackExplanation: null,
      stopCondition: 'SPECIALTY_SUFFICIENT',
      gate: null,
      guardMessage: null,
    };
  }

  const parentService = input.clinicalContext?.patientMode === 'pediatric' ? PAEDIATRICS : GENERAL_MEDICINE;

  /*
    An approved weighted complaint that did not converge.

    R1 owns this outcome and the direction gate has nothing to add: these four
    complaints already have calibrated likelihoods and an approved question
    set. When a run still ends here, the answers did not separate a candidate
    under the frozen thresholds. `calibrationGap` records exactly that, so the
    limitation is counted and reported rather than hidden behind the parent
    service. Nothing here lowers a threshold to make the number come out.
  */
  if (!input.clinicalContext || !isGenericCoverageComplaint(input.complaintId)) {
    const isPediatric = input.clinicalContext?.patientMode === 'pediatric';
    let reason: FallbackReason = isPediatric ? 'NO_VALIDATED_NARROW_ROUTE' : 'SPECIALTY_EVIDENCE_CALIBRATION_REQUIRED';
    let gate: DirectionGateResult | null = null;
    /*
      R1 did not separate a candidate. Before the parent service, the
      source-backed criteria for this presentation are consulted, reading the
      intake answers and the answers already given to R1. This is a second,
      independent evidence basis, not a lowered threshold: no probability is
      read or produced, and the calibration gap is still recorded.
    */
    if (input.clinicalContext) {
      gate = evaluateDirectionGate(input.clinicalContext, input.intakeAnswers, input.routingAnswers ?? []);
      if (gate.status === 'supported' && gate.direction && isPresentable(eligibility, gate.direction.directionId)) {
        return gateRoute(gate);
      }
      // A presentation with sourced criteria that were not met says so, rather than blaming calibration alone.
      if (gate.status !== 'not-applicable' && gate.fallbackReason) reason = gate.fallbackReason;
    }

    return {
      registryId: parentService.id,
      label: parentService.patientFacingName,
      basis: 'parent-service',
      supportingSignals: [],
      fallbackReason: reason,
      fallbackExplanation: FALLBACK_REASON_TEXT[reason],
      stopCondition: hardStop ? 'HARD_STOP' : 'NO_HIGH_VALUE_DISCRIMINATORS',
      gate,
      guardMessage: null,
      calibrationGap: !hardStop && !isPediatric,
    };
  }

  /* 2. The deterministic, source-cited path. */
  const gate = evaluateDirectionGate(input.clinicalContext, input.intakeAnswers);
  if (gate.status === 'supported' && gate.direction && isPresentable(eligibility, gate.direction.directionId)) {
    return gateRoute(gate);
  }

  /* 3. The parent service, with the guard in front of it. */
  const plan = intakePlanFor(input.complaintId, input.clinicalContext);
  const guard = assertNoUsefulDiscriminatorsRemain({
    context: input.clinicalContext,
    intakeAnswers: input.intakeAnswers,
    eligibleQuestions: [...plan.preScreen, ...plan.postScreen].filter((question) => questionIsEligible(question, input.intakeAnswers)),
    budget: budgetFromAnswers(
      input.intakeAnswers,
      input.safetyAnswerCount ?? 0,
      input.routingAnswerCount ?? 0,
    ),
    hardStop,
  });
  const reason = guard.reason ?? gate.fallbackReason ?? 'INSUFFICIENT_SUPPORTED_EVIDENCE';
  return {
    registryId: parentService.id,
    label: parentService.patientFacingName,
    basis: 'parent-service',
    supportingSignals: [],
    fallbackReason: reason,
    fallbackExplanation: FALLBACK_REASON_TEXT[reason],
    stopCondition: hardStop
      ? 'HARD_STOP'
      : reason === 'QUESTION_BURDEN_LIMIT_REACHED'
        ? 'QUESTION_BURDEN_WITH_LOW_ADDITIONAL_VALUE'
        : 'NO_HIGH_VALUE_DISCRIMINATORS',
    gate,
    guardMessage: guard.ok ? null : guard.message,
  };
}
