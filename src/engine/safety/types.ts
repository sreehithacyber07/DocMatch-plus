import type { MaterializedComplaint } from '../data/types.ts';
import type { Belief, EngineConfig, QuestionSelection, RecordedAnswer, RoutingSession, StoppingDecision } from '../types.ts';
import type { ProvenanceSource } from '../data/types.ts';

export type SafetySeverity = 'emergency' | 'urgent';
export type ContinuationPolicy = 'must_stop' | 'may_continue_after_acknowledgement';
export type SafetyReadiness = 'evidence_grounded_demonstration';

export type SafetyCondition =
  | { kind: 'always' }
  | { kind: 'answer_equals'; questionId: string; optionId: string }
  | { kind: 'all'; conditions: readonly SafetyCondition[] }
  | { kind: 'any'; conditions: readonly SafetyCondition[] };

export interface SafetyQuestionOption {
  id: string;
  label: string;
}

export interface SafetyQuestionPriority {
  severity: SafetySeverity;
  dependencyRank: number;
}

interface BaseSafetyQuestion {
  id: string;
  applicableComplaintIds: readonly string[];
  liveWhen: SafetyCondition;
  priority: SafetyQuestionPriority;
  provenanceIds: readonly string[];
}

export interface RoutingSafetyQuestion extends BaseSafetyQuestion {
  kind: 'routing_reference';
  routingQuestionId: string;
}

export interface OwnedSafetyQuestion extends BaseSafetyQuestion {
  kind: 'safety_owned';
  /** Second person, for a patient answering for themselves. */
  text: string;
  /**
   * The same question addressed to a parent or caregiver about "your child".
   * Wording only: the option ids and what an answer means are identical, so
   * the reporter can never change a predicate.
   */
  caregiverText?: string;
  options: readonly SafetyQuestionOption[];
}

export type SafetyQuestion = RoutingSafetyQuestion | OwnedSafetyQuestion;

export interface RedFlagRule {
  id: string;
  version: string;
  applicableComplaintIds: readonly string[];
  requiredQuestionIds: readonly string[];
  predicate: SafetyCondition;
  severity: SafetySeverity;
  continuationPolicy: ContinuationPolicy;
  payloadId: string;
  priority: number;
  provenanceIds: readonly string[];
  enabled: boolean;
}

export type SafetyAction =
  | { kind: 'call_emergency_number'; label: string; number: string; countryCode: 'IN' }
  | { kind: 'seek_urgent_assessment'; label: string };

export interface SafetyPayload {
  id: string;
  severity: SafetySeverity;
  headline: string;
  guidance: string;
  primaryAction: SafetyAction;
  secondaryAction?: SafetyAction;
  continuationPolicy: ContinuationPolicy;
  provenanceIds: readonly string[];
}

export interface SafetyKnowledgeBase {
  safetyVersion: string;
  compatibleEngineVersion: string;
  compatibleKnowledgeVersion: string;
  readiness: SafetyReadiness;
  sources: readonly ProvenanceSource[];
  questions: readonly SafetyQuestion[];
  rules: readonly RedFlagRule[];
  payloads: readonly SafetyPayload[];
}

export interface SafetyAnswer {
  questionId: string;
  optionId: string;
  answeredAt: string;
}

export interface ResolvedSafetyQuestion {
  id: string;
  text: string;
  caregiverText?: string;
  options: readonly SafetyQuestionOption[];
  answerTarget: 'routing_session' | 'safety_state';
  provenanceIds: readonly string[];
}

export interface SafetyCurrentState {
  firedRuleIds: readonly string[];
  liveQuestionIds: readonly string[];
  unscreenedQuestionIds: readonly string[];
  retainedSafetyAnswers: readonly SafetyAnswer[];
  removedSafetyAnswers: readonly SafetyAnswer[];
}

export interface SafetyAuditEnvelope {
  engineVersion: string;
  knowledgeVersion: string;
  safetyVersion: string;
  parameterizationStatus: 'routing_demonstration_only';
  evidenceStatus: 'source_supported_warning_sign_relationships';
  systemStatus: 'evidence_grounded_demonstration_not_clinically_validated';
  complaintId: string;
  firedRuleIds: readonly string[];
  provenanceIds: readonly string[];
}

export interface UrgentReviewState {
  firedRuleIds: readonly string[];
  selectedRuleId: string;
  payload: SafetyPayload;
}

interface BaseControllerResult {
  audit: SafetyAuditEnvelope;
  safetyState: SafetyCurrentState;
  urgentReview?: UrgentReviewState;
}

export interface SafetyScreeningResult extends BaseControllerResult {
  status: 'safety-screening';
  question: ResolvedSafetyQuestion;
  informationGainBypassed: true;
  reason: 'live_unscreened_safety_concept';
}

export interface RoutingQuestionResult extends BaseControllerResult {
  status: 'question';
  selection: QuestionSelection;
  informationGainBypassed: false;
}

export interface InterruptedResult extends BaseControllerResult {
  status: 'interrupted';
  informationGainBypassed: true;
  reason: 'fired_safety_rule';
  firedRuleIds: readonly string[];
  selectedRuleId: string;
  severity: SafetySeverity;
  continuationPolicy: ContinuationPolicy;
  payload: SafetyPayload;
}

export interface RoutingResult extends BaseControllerResult {
  status: 'result';
  routingOutcome: {
    specialtyId: StoppingDecision['topSpecialtyId'];
    stopReason: NonNullable<StoppingDecision['reason']> | 'question_pool_exhausted';
  };
  stoppingDecision: StoppingDecision;
}

export type SafetyControllerResult =
  | SafetyScreeningResult
  | RoutingQuestionResult
  | InterruptedResult
  | RoutingResult;

export interface SafetyControllerInput {
  session: Readonly<RoutingSession>;
  complaint: Readonly<MaterializedComplaint>;
  safetyAnswers: readonly SafetyAnswer[];
  safetyKnowledge: Readonly<SafetyKnowledgeBase>;
  engineConfig: Readonly<EngineConfig>;
  /** Presentation/context eligibility only. Omit to evaluate the complete R3 set. */
  enabledSafetyQuestionIds?: readonly string[];
}

interface BaseSafetyAuditEvent {
  eventId: string;
  timestamp: string;
  sessionReference: string;
  engineVersion: string;
  knowledgeVersion: string;
  safetyVersion: string;
  provenanceIds: readonly string[];
}

export interface SafetyScreeningAuditEvent extends BaseSafetyAuditEvent {
  kind: 'safety_screening_presented';
  questionId: string;
}

export interface SafetyInterruptionAuditEvent extends BaseSafetyAuditEvent {
  kind: 'safety_interruption';
  firedRuleIds: readonly string[];
  selectedRuleId: string;
  payloadId: string;
  severity: SafetySeverity;
  continuationPolicy: ContinuationPolicy;
}

export type StaffOverrideAction = 'request_continuation' | 'transfer_to_clinician' | 'document_only';

export interface StaffOverrideAuditEvent extends BaseSafetyAuditEvent {
  kind: 'staff_override_recorded';
  staffActorId: string;
  firedRuleIds: readonly string[];
  originalPayloadId: string;
  originalContinuationPolicy: ContinuationPolicy;
  overrideAction: StaffOverrideAction;
  reason: string;
  automaticContinuationEnabled: false;
}

export type SafetyAuditEvent = SafetyScreeningAuditEvent | SafetyInterruptionAuditEvent | StaffOverrideAuditEvent;

export interface SafetyEvaluationContext {
  complaintId: string;
  routingAnswers: readonly RecordedAnswer[];
  safetyAnswers: readonly SafetyAnswer[];
  enabledSafetyQuestionIds?: readonly string[];
}

export interface SafetyValidationIssue {
  code: string;
  path: string;
  message: string;
}

export interface SafetyValidationReport {
  structureValid: boolean;
  evidenceGrounded: boolean;
  clinicallyReviewed: false;
  productionReady: false;
  errors: readonly SafetyValidationIssue[];
  productionBlockers: readonly SafetyValidationIssue[];
}

export interface SafetyEvidenceRegisterEntry {
  sourceId: string;
  ruleIds: readonly string[];
  supports: string;
  doesNotSupport: string;
}

export interface SafetyRegressionDecision {
  status: SafetyControllerResult['status'];
  currentAnswers: readonly { questionId: string; optionId: string }[];
  liveQuestionIds: readonly string[];
  firedRuleIds: readonly string[];
  selectedQuestionId: string | null;
  informationGain: number | null;
  informationGainBypassed: boolean;
  payloadId: string | null;
  continuationPolicy: ContinuationPolicy | null;
  routingBelief: Belief;
  routingAskedQuestionIds: readonly string[];
  provenanceIds: readonly string[];
}

export interface SafetyRegressionResult {
  scenarioId: string;
  title: string;
  complaintId: string;
  decisions: readonly SafetyRegressionDecision[];
  finalStatus: SafetyControllerResult['status'];
  finalRoutingSpecialty: StoppingDecision['topSpecialtyId'] | null;
  firedRuleIds: readonly string[];
  auditHistory: readonly SafetyAuditEvent[];
  engineVersion: string;
  knowledgeVersion: string;
  safetyVersion: string;
}
