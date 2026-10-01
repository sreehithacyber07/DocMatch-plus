import type { SpecialtyId } from './specialties.ts';

export type Belief = Record<SpecialtyId, number>;
export type ReadonlyBelief = Readonly<Belief>;

export interface AnswerOption {
  id: string;
  label: string;
  value?: string;
  likelihoods: Belief;
}

export interface Question {
  id: string;
  text: string;
  options: AnswerOption[];
  appliesWhen?: (belief: ReadonlyBelief, askedQuestionIds: readonly string[]) => boolean;
}

export interface EngineConfig {
  posteriorFloor: number;
  topProbabilityThreshold: number;
  marginThreshold: number;
  maxQuestions: number;
}

export interface QuestionSelection {
  question: Question;
  questionId: string;
  informationGain: number;
  currentEntropy: number;
  expectedEntropy: number;
}

export type StopReason = 'top_probability' | 'margin' | 'max_questions';

export interface StoppingDecision {
  shouldStop: boolean;
  reason: StopReason | null;
  triggeredConditions: StopReason[];
  topSpecialtyId: SpecialtyId;
  topProbability: number;
  secondSpecialtyId: SpecialtyId;
  secondProbability: number;
  margin: number;
  askedCount: number;
}

export interface RecordedAnswer {
  questionId: string;
  optionId: string;
  answeredAt: string;
}

export interface BeliefHistoryEntry extends RecordedAnswer {
  priorBelief: Belief;
  posteriorBelief: Belief;
}

export interface SpecialtyEffect {
  specialtyId: SpecialtyId;
  priorProbability: number;
  posteriorProbability: number;
  delta: number;
  absoluteImpact: number;
}

export interface AnswerExplanation extends RecordedAnswer {
  answerIndex: number;
  deltas: Belief;
  rankedEffects: SpecialtyEffect[];
}

export interface InfluentialAnswerEffect extends SpecialtyEffect, RecordedAnswer {
  answerIndex: number;
}

export interface ExplanationTrace {
  engineVersion: string;
  answers: AnswerExplanation[];
  influentialEffects: InfluentialAnswerEffect[];
}

export type RedFlagState =
  | { status: 'not_evaluated'; triggeredRuleIds: [] }
  | { status: 'clear'; triggeredRuleIds: [] }
  | { status: 'requires_screening'; triggeredRuleIds: string[] }
  | { status: 'triggered'; triggeredRuleIds: string[] };

export type RoutingOutcome =
  | { status: 'in_progress' }
  | { status: 'routed'; specialtyId: SpecialtyId; stopReason: StopReason }
  | { status: 'interrupted'; redFlagRuleIds: string[] };

export interface RoutingSession {
  engineVersion: string;
  presentingComplaintId: string;
  createdAt: string;
  updatedAt: string;
  initialBelief: Belief;
  answers: RecordedAnswer[];
  belief: Belief;
  askedQuestionIds: string[];
  redFlagState: RedFlagState;
  outcome: RoutingOutcome;
}

export interface ReplayResult {
  belief: Belief;
  history: BeliefHistoryEntry[];
  retainedAnswers: RecordedAnswer[];
  removedAnswers: RecordedAnswer[];
  askedQuestionIds: string[];
}
