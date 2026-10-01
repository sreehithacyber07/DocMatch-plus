/**
 * R9D persistence events.
 *
 * One logical patient action is one event with one `clientEventId`, minted when
 * the action is first observed and reused for every retry. Events describe what
 * the frozen engines and the Body Explorer already did; they never feed back
 * into routing or safety.
 */
import type { BodyRegionId, BodyView, NormalizedPoint, PainPrecision } from '../../body/index.ts';
import type { ComplaintSource } from '../body-explorer/unmapped-regions.ts';
import type { ClinicalContextInput } from '../routing-flow/clinical-replay.ts';

/** Three separate evidence streams, matching the three R9B tables. */
export type AnswerStream = 'intake' | 'routing' | 'safety';

export type AnswerOperation = 'selected' | 'cleared';

/** The minimal answer shape shared by IntakeAnswer, RecordedAnswer and SafetyAnswer. */
export interface ObservedAnswer {
  questionId: string;
  optionId: string;
  answeredAt: string;
}

/** Where the patient placed the concern, exactly as the Body Explorer held it. */
export interface BodyLocation {
  regionId: BodyRegionId;
  view: BodyView;
  precision: PainPrecision;
  point: NormalizedPoint | null;
  capturedAt: string;
}

export interface AssessmentStart {
  complaintId: string;
  complaintSource: ComplaintSource;
  /** Minimal non-identifying replay context; never name, contact or DOB. */
  clinicalContext?: ClinicalContextInput;
  /** Null when the concern was confirmed without a marked location. */
  location: BodyLocation | null;
}

export interface BodySelectionEvent extends BodyLocation {
  kind: 'body';
  clientEventId: string;
}

export interface AnswerEvent {
  kind: 'answer';
  stream: AnswerStream;
  clientEventId: string;
  questionId: string;
  optionId: string | null;
  operation: AnswerOperation;
  sequence: number;
  answeredAt: string;
  /** The earlier event in this question's chain, by client event ID. */
  supersedesClientEventId: string | null;
}

export type PersistenceEvent = BodySelectionEvent | AnswerEvent;

/** Anything able to mint UUIDs; injectable for deterministic tests. */
export type IdSource = () => string;

export const randomId: IdSource = () => globalThis.crypto.randomUUID();
