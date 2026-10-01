import type { SpecialtyId } from '../../engine/index.ts';

export const BELIEF_READ_TOLERANCE = 1e-15;
const BELIEF_KEYS: readonly SpecialtyId[] = [
  'cardiology', 'pulmonology', 'neurology', 'gastroenterology', 'orthopedics', 'dermatology',
];

export interface ResultExpectation {
  selectedSpecialtyRegistryId: string;
  engineTopSpecialtyId: SpecialtyId;
  stopReason: string;
  belief: Readonly<Record<SpecialtyId, number>>;
  supportingAnswerRecordIds: readonly string[];
}

export interface StoredRoutingResult {
  id: string;
  selected_specialty_registry_id: string;
  engine_top_specialty_id: string;
  stop_reason: string;
  belief: Readonly<Record<SpecialtyId, number>>;
  supportingAnswerIds: readonly string[];
}

/** Identifiers and evidence are exact; Data API float rendering is not. */
export function routingResultAgrees(stored: StoredRoutingResult, expected: ResultExpectation): boolean {
  return stored.selected_specialty_registry_id === expected.selectedSpecialtyRegistryId
    && stored.engine_top_specialty_id === expected.engineTopSpecialtyId
    && stored.stop_reason === expected.stopReason
    && stored.supportingAnswerIds.length === expected.supportingAnswerRecordIds.length
    && stored.supportingAnswerIds.every((id, index) => id === expected.supportingAnswerRecordIds[index])
    && BELIEF_KEYS.every((key) => Number.isFinite(stored.belief[key])
      && Math.abs(stored.belief[key] - expected.belief[key]) <= BELIEF_READ_TOLERANCE);
}
