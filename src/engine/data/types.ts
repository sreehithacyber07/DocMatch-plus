import type { SpecialtyId } from '../specialties.ts';
import type { Belief, Question, StoppingDecision } from '../types.ts';

export type KnowledgeMode = 'production' | 'demonstration' | 'synthetic';

export type SourceType =
  | 'product_requirement'
  | 'clinical_guideline'
  | 'professional_society_guidance'
  | 'government_guidance'
  | 'peer_reviewed_research'
  | 'clinical_dataset'
  | 'demonstration_policy'
  | 'synthetic_fixture';

export type EvidenceStatus =
  | 'product_requirement_only'
  | 'pending_clinical_review'
  | 'qualitative_supported'
  | 'quantitative_supported'
  | 'demonstration_only'
  | 'synthetic_only';

export type ReviewStatus = 'pending' | 'reviewed' | 'rejected';
export type ParameterStatus = 'clinically_supported' | 'demonstration_only' | 'synthetic_only';

export interface ProvenanceSource {
  id: string;
  organization: string;
  title: string;
  sourceType: SourceType;
  reference: string;
  url?: string;
  publicationDate?: string;
  sourceUpdatedAt?: string;
  accessedAt?: string;
  locator?: string;
  scope: string;
  notes?: string;
  reviewStatus: ReviewStatus;
  evidenceStatus: EvidenceStatus;
  version: string;
}

export interface ReadyParameter<T> {
  status: 'ready';
  value: T;
  provenanceIds: readonly string[];
  parameterStatus: ParameterStatus;
}

export interface BlockedParameter {
  status: 'blocked';
  reason: string;
  requiredEvidence: string;
  provenanceIds: readonly string[];
}

export type PriorParameter = ReadyParameter<Belief> | BlockedParameter;
export type LikelihoodParameter = ReadyParameter<Belief> | BlockedParameter;

export type ApplicabilityRule =
  | { kind: 'always' }
  | { kind: 'answer_equals'; questionId: string; optionId: string };

export interface KnowledgeAnswerOption {
  id: string;
  label: string;
  value?: string;
  likelihoods: LikelihoodParameter;
  provenanceIds: readonly string[];
}

export interface KnowledgeQuestion {
  id: string;
  text: string;
  options: readonly KnowledgeAnswerOption[];
  applicability: ApplicabilityRule;
  provenanceIds: readonly string[];
  knowledgeVersion: string;
}

export interface PresentingComplaint {
  id: string;
  label: string;
  /** `fallback_only` carries sourced history to a parent service and may not produce a scored specialty direction. */
  routingMode?: 'weighted' | 'fallback_only';
  prior: PriorParameter;
  questionIds: readonly string[];
  provenanceIds: readonly string[];
  knowledgeVersion: string;
}

export interface KnowledgeBase {
  mode: KnowledgeMode;
  knowledgeVersion: string;
  compatibleEngineVersion: string;
  sources: readonly ProvenanceSource[];
  complaints: readonly PresentingComplaint[];
  questions: readonly KnowledgeQuestion[];
}

export interface KnowledgeValidationIssue {
  severity: 'error' | 'blocker';
  code: string;
  path: string;
  message: string;
}

export interface KnowledgeValidationReport {
  structureValid: boolean;
  engineReady: boolean;
  errors: KnowledgeValidationIssue[];
  blockers: KnowledgeValidationIssue[];
}

export interface AnswerSnapshot {
  questionId: string;
  optionId: string;
}

export interface MaterializedComplaint {
  complaintId: string;
  label: string;
  prior: Belief;
  questions: Question[];
  knowledgeVersion: string;
  compatibleEngineVersion: string;
  provenanceIds: readonly string[];
}

export interface RoutingAuditEnvelope {
  engineVersion: string;
  knowledgeVersion: string;
  parameterizationStatus: 'demonstration_only';
  evidenceStatus: 'source_supported_qualitative_relationships';
  complaintId: string;
  provenanceIds: readonly string[];
}

export interface EvidenceRegisterEntry {
  sourceId: string;
  concepts: readonly string[];
  supports: string;
  doesNotSupport: string;
}

export interface R3HandoffItem {
  id: string;
  complaintId: string;
  concept: string;
  provenanceIds: readonly string[];
  reviewReason: string;
}

export interface DemonstrationRegressionScenario {
  id: string;
  title: string;
  complaintId: string;
  answerPlan: Readonly<Record<string, string>>;
  requiredAnswers: readonly AnswerSnapshot[];
  expectedRoutingDirection: SpecialtyId;
}

export interface DemonstrationRegressionStep {
  questionId: string;
  questionText: string;
  answerId: string;
  answerLabel: string;
  informationGain: number;
  priorBelief: Belief;
  posteriorBelief: Belief;
  entropy: number;
  leadingSpecialty: SpecialtyId;
  stoppingDecision: StoppingDecision;
}

export interface DemonstrationRegressionResult {
  scenarioId: string;
  title: string;
  complaintId: string;
  audit: RoutingAuditEnvelope;
  initialBelief: Belief;
  steps: DemonstrationRegressionStep[];
  finalRoutingDirection: SpecialtyId;
  expectedRoutingDirection: SpecialtyId;
  expectationMet: boolean;
}

export interface ProposedComplaint {
  id: string;
  label: string;
  status: 'founder_clinical_selection_required';
  intendedCoverage: readonly SpecialtyId[];
}

export interface BlockedRegressionScenario {
  id: string;
  title: string;
  complaintId: string;
  answerPath: readonly AnswerSnapshot[];
  expectedRoutingDirection: SpecialtyId | null;
  expectedBehaviorSource: string;
  status: 'blocked_clinical_parameterization_required';
  blockers: readonly string[];
}
