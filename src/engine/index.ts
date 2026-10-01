export { cloneBelief, normalizeWeights, probabilityOfAnswer, updateBelief } from './belief.ts';
export {
  DEFAULT_POSTERIOR_FLOOR,
  ENGINE_VERSION,
  NORMALIZATION_TOLERANCE,
  validateEngineConfig,
  validatePosteriorFloor,
} from './config.ts';
export { entropy } from './entropy.ts';
export { explain } from './explanation.ts';
export { expectedEntropyAfter, informationGain, selectNextQuestion } from './questions.ts';
export { changeRecordedAnswer, removeRecordedAnswer, replayBelief } from './replay.ts';
export { answerSessionQuestion, createRoutingSession, removeSessionAnswer, replaySession } from './session.ts';
export { SPECIALTY_COUNT, SPECIALTY_IDS, type SpecialtyId } from './specialties.ts';
export { shouldStop } from './stopping.ts';
export type {
  AnswerExplanation,
  AnswerOption,
  Belief,
  BeliefHistoryEntry,
  EngineConfig,
  ExplanationTrace,
  InfluentialAnswerEffect,
  Question,
  QuestionSelection,
  ReadonlyBelief,
  RecordedAnswer,
  RedFlagState,
  ReplayResult,
  RoutingOutcome,
  RoutingSession,
  SpecialtyEffect,
  StopReason,
  StoppingDecision,
} from './types.ts';
