/**
 * Patient-facing routing intelligence derived from the frozen R1 engine.
 *
 * This module changes no probabilities. It filters the engine belief through
 * the clinical registry, ranks enabled directions, and translates exact values
 * into accessible route-strength language. Raw values remain on the returned
 * objects for deterministic tests and future clinician/debug views; the patient
 * interface does not print them.
 */
import type {
  BeliefHistoryEntry,
  ReadonlyBelief,
  SpecialtyId,
  StopReason,
  StoppingDecision,
} from '../../engine/index.ts';
import type { TimelineEntry } from './SessionTimeline.tsx';
import {
  GENERAL_MEDICINE,
  isWeightedRoutable,
  SPECIALTY_REGISTRY,
  specialtyForEngineId,
  type SpecialtyRecord,
} from './specialty-registry.ts';

export const ROUTE_STRENGTH_THRESHOLDS = {
  developing: 0.25,
  strong: 0.45,
} as const;

export type RouteStrength = 'Emerging' | 'Developing' | 'Strong';
export type RouteMovement = 'increased' | 'decreased';
export type RouteAnswerKind = 'initial' | TimelineEntry['kind'];
export type RouteVisualizationStatus =
  | 'initial'
  | 'intake-captured'
  | 'safety-captured'
  | 'routing-updated'
  | 'routing-paused';

export interface RouteDirectionView {
  engineSpecialtyId: SpecialtyId;
  registryId: string;
  label: string;
  rank: number;
  /** Exact R1 value. Kept for tests/debug output, not printed to patients. */
  rawValue: number;
  /** Relative visual length, from 0 to 1. This is not a probability. */
  traceStrength: number;
  strength: RouteStrength;
  ariaLabel: string;
}

export interface RouteBeliefChange {
  engineSpecialtyId: SpecialtyId;
  registryId: string;
  label: string;
  movement: RouteMovement;
  /** Exact posterior delta. Kept for tests/debug output, not printed to patients. */
  rawDelta: number;
  questionId: string;
  optionId: string;
}

export interface RouteVisualizationModel {
  status: RouteVisualizationStatus;
  visibleDirections: readonly RouteDirectionView[];
  otherDirections: readonly RouteDirectionView[];
  changes: readonly RouteBeliefChange[];
  announcement: string;
}

export interface EvidenceTraceItem {
  questionId: string;
  optionId: string;
  question: string;
  answer: string;
  direction: string;
  movement: RouteMovement;
  rawDelta: number;
}

export interface ClinicalRoutingExplanation {
  selectedSpecialty: {
    registryId: string;
    label: string;
    engineSpecialtyId: SpecialtyId | null;
  };
  engineSelectedSpecialtyId: SpecialtyId;
  stopReason: StopReason | null;
  /** Exact R1 value, retained for machine-readable clinical/debug use. */
  topBelief: number | null;
  strongestPositiveEvidence: readonly EvidenceTraceItem[];
  strongestNegativeEvidence: readonly EvidenceTraceItem[];
  alternatives: readonly RouteDirectionView[];
  questionHistory: readonly {
    kind: TimelineEntry['kind'];
    questionId: string;
    question: string;
    answer: string;
    answeredAt: string;
  }[];
}

/** Avoid narrating tiny normalization drift as a meaningful route update. */
export const MEANINGFUL_ROUTE_DELTA = 0.01;

function enabledEngineRecords(): (SpecialtyRecord & { engineSpecialtyId: SpecialtyId })[] {
  return SPECIALTY_REGISTRY.filter(
    (record): record is SpecialtyRecord & { engineSpecialtyId: SpecialtyId } => isWeightedRoutable(record),
  );
}

export function routeStrength(value: number): RouteStrength {
  if (value >= ROUTE_STRENGTH_THRESHOLDS.strong) return 'Strong';
  if (value >= ROUTE_STRENGTH_THRESHOLDS.developing) return 'Developing';
  return 'Emerging';
}

export function rankRoutingDirections(belief: ReadonlyBelief): RouteDirectionView[] {
  const ranked = enabledEngineRecords()
    .map((record) => ({ record, rawValue: belief[record.engineSpecialtyId] }))
    .toSorted(
      (left, right) =>
        right.rawValue - left.rawValue || left.record.patientFacingName.localeCompare(right.record.patientFacingName),
    );
  const topValue = ranked[0]?.rawValue ?? 0;

  return ranked.map(({ record, rawValue }, index) => {
    const rank = index + 1;
    const strength = routeStrength(rawValue);
    const rankDescription = rank === 1 ? 'strongest current routing direction' : `current routing rank ${rank}`;
    return {
      engineSpecialtyId: record.engineSpecialtyId,
      registryId: record.id,
      label: record.patientFacingName,
      rank,
      rawValue,
      traceStrength: topValue > 0 ? Math.max(0.12, rawValue / topValue) : 0.12,
      strength,
      ariaLabel: `${record.patientFacingName}, ${rankDescription}, ${strength.toLowerCase()} route strength.`,
    };
  });
}

/** Largest grounded increase and decrease among routing-enabled specialties. */
export function topBeliefChanges(entry: BeliefHistoryEntry | undefined): RouteBeliefChange[] {
  if (!entry) return [];
  const changes = enabledEngineRecords().map((record): RouteBeliefChange => {
    const rawDelta = entry.posteriorBelief[record.engineSpecialtyId] - entry.priorBelief[record.engineSpecialtyId];
    return {
      engineSpecialtyId: record.engineSpecialtyId,
      registryId: record.id,
      label: record.patientFacingName,
      movement: rawDelta >= 0 ? 'increased' : 'decreased',
      rawDelta,
      questionId: entry.questionId,
      optionId: entry.optionId,
    };
  });
  const increase = changes
    .filter((change) => change.rawDelta > MEANINGFUL_ROUTE_DELTA)
    .toSorted((left, right) => right.rawDelta - left.rawDelta || left.label.localeCompare(right.label))[0];
  const decrease = changes
    .filter((change) => change.rawDelta < -MEANINGFUL_ROUTE_DELTA)
    .toSorted((left, right) => left.rawDelta - right.rawDelta || left.label.localeCompare(right.label))[0];
  return [increase, decrease].filter((change): change is RouteBeliefChange => change !== undefined);
}

export function buildRouteVisualization(input: {
  belief: ReadonlyBelief;
  history: readonly BeliefHistoryEntry[];
  latestAnswerKind?: RouteAnswerKind;
  latestQuestionId?: string;
  maxVisible?: number;
  interrupted?: boolean;
  /** Services plausible for this presentation (route-eligibility.ts). Others are engine state only. */
  eligibleRegistryIds?: readonly string[];
}): RouteVisualizationModel {
  if (input.interrupted) {
    return {
      status: 'routing-paused',
      visibleDirections: [],
      otherDirections: [],
      changes: [],
      announcement: 'Routing paused. Priority clinical review.',
    };
  }

  const eligible = input.eligibleRegistryIds ? new Set(input.eligibleRegistryIds) : null;
  const ranked = rankRoutingDirections(input.belief).filter((direction) => !eligible || eligible.has(direction.registryId));
  const maxVisible = Math.max(1, input.maxVisible ?? 4);
  const kind = input.latestAnswerKind ?? 'initial';
  const latestHistory = input.history.at(-1);
  const routingAnswerMatches =
    kind === 'routing' && latestHistory !== undefined && latestHistory.questionId === input.latestQuestionId;
  const status: RouteVisualizationStatus = routingAnswerMatches
    ? 'routing-updated'
    : kind === 'intake'
      ? 'intake-captured'
      : kind === 'safety'
        ? 'safety-captured'
        : 'initial';
  const changes = routingAnswerMatches ? topBeliefChanges(latestHistory) : [];
  const announcement =
    status === 'routing-updated'
      ? changes.length > 0
        ? `Route updated. ${changes.map((change) => `${change.label} ${change.movement}`).join('. ')}.`
        : 'Route updated.'
      : status === 'intake-captured'
        ? 'Intake detail captured. Specialty directions are unchanged.'
        : status === 'safety-captured'
          ? 'Safety response captured. Specialty directions are unchanged.'
          : 'Possible specialty directions based on the concern selected.';

  return {
    status,
    visibleDirections: ranked.slice(0, maxVisible),
    otherDirections: ranked.slice(maxVisible),
    changes,
    announcement,
  };
}

function evidenceFor(
  specialtyId: SpecialtyId,
  history: readonly BeliefHistoryEntry[],
  timeline: readonly TimelineEntry[],
  movement: RouteMovement,
): EvidenceTraceItem[] {
  return history
    .map((entry): EvidenceTraceItem | null => {
      const rawDelta = entry.posteriorBelief[specialtyId] - entry.priorBelief[specialtyId];
      const matches =
        movement === 'increased' ? rawDelta > MEANINGFUL_ROUTE_DELTA : rawDelta < -MEANINGFUL_ROUTE_DELTA;
      if (!matches) return null;
      const answer = timeline.find((candidate) => candidate.questionId === entry.questionId);
      return {
        questionId: entry.questionId,
        optionId: entry.optionId,
        question: answer?.text ?? entry.questionId,
        answer: answer?.label ?? entry.optionId,
        direction: specialtyForEngineId(specialtyId).patientFacingName,
        movement,
        rawDelta,
      };
    })
    .filter((item): item is EvidenceTraceItem => item !== null)
    .toSorted((left, right) => Math.abs(right.rawDelta) - Math.abs(left.rawDelta));
}

export function buildClinicalRoutingExplanation(input: {
  engineSelectedSpecialtyId: SpecialtyId;
  stoppingDecision: Readonly<StoppingDecision>;
  belief: ReadonlyBelief;
  history: readonly BeliefHistoryEntry[];
  timeline: readonly TimelineEntry[];
  converged: boolean;
}): ClinicalRoutingExplanation {
  const selectedRecord = input.converged
    ? specialtyForEngineId(input.engineSelectedSpecialtyId)
    : GENERAL_MEDICINE;
  const selectedEngineId = input.converged ? input.engineSelectedSpecialtyId : null;
  const ranked = rankRoutingDirections(input.belief);

  return {
    selectedSpecialty: {
      registryId: selectedRecord.id,
      label: selectedRecord.patientFacingName,
      engineSpecialtyId: selectedEngineId,
    },
    engineSelectedSpecialtyId: input.engineSelectedSpecialtyId,
    stopReason: input.stoppingDecision.reason,
    topBelief: selectedEngineId ? input.belief[selectedEngineId] : null,
    strongestPositiveEvidence: selectedEngineId
      ? evidenceFor(selectedEngineId, input.history, input.timeline, 'increased')
      : [],
    strongestNegativeEvidence: selectedEngineId
      ? evidenceFor(selectedEngineId, input.history, input.timeline, 'decreased')
      : [],
    alternatives: ranked.filter((direction) => direction.engineSpecialtyId !== selectedEngineId).slice(0, 3),
    questionHistory: input.timeline.map((entry) => ({
      kind: entry.kind,
      questionId: entry.questionId,
      question: entry.text,
      answer: entry.label,
      answeredAt: entry.answeredAt,
    })),
  };
}
