export { PROPOSED_COMPLAINT_SCOPE, UPPER_ABDOMINAL_PAIN_COMPLAINT } from './complaints.ts';
export { R2B_DEMONSTRATION_COMPLAINTS } from './demonstration/complaints.ts';
export { R2B_EVIDENCE_REGISTER } from './demonstration/evidence-register.ts';
export { R2B_DEMONSTRATION_KNOWLEDGE } from './demonstration/knowledge.ts';
export {
  DEMONSTRATION_ENGINE_CONFIG,
  DEMONSTRATION_PRIOR_WEIGHT,
  DEMONSTRATION_YES_PROBABILITY,
  demonstrationBinaryQuestion,
  demonstrationPrior,
  directionalStrengths,
  type PriorTier,
  type RelationshipStrength,
} from './demonstration/policy.ts';
export {
  HEADACHE_DEMONSTRATION_QUESTIONS,
  JOINT_MUSCULOSKELETAL_PAIN_DEMONSTRATION_QUESTIONS,
  R2B_DEMONSTRATION_QUESTIONS,
  SHORTNESS_OF_BREATH_DEMONSTRATION_QUESTIONS,
  UPPER_ABDOMINAL_PAIN_DEMONSTRATION_QUESTIONS,
} from './demonstration/questions.ts';
export { R3_HANDOFF_ITEMS } from './demonstration/r3-handoff.ts';
export {
  formatDemonstrationRegression,
  R2B_REGRESSION_SCENARIOS,
  runAllDemonstrationRegressions,
  runDemonstrationRegression,
} from './demonstration/regression.ts';
export { DEMONSTRATION_SOURCES } from './demonstration/sources.ts';
export { R2_EVIDENCE_CLASSIFICATION, type EvidenceCategory, type EvidenceRequirementClassification } from './evidence.ts';
export { SYNTHETIC_R2_KNOWLEDGE } from './fixtures/synthetic.ts';
export { R2_PRODUCTION_KNOWLEDGE } from './knowledge.ts';
export {
  createDemonstrationAuditEnvelope,
  materializeComplaint,
  materializeDemonstrationComplaint,
  materializeProductionComplaint,
} from './materialize.ts';
export { R2_REQUIREMENT_SOURCE, R2_REQUIREMENT_SOURCE_ID } from './provenance.ts';
export { UPPER_ABDOMINAL_PAIN_QUESTIONS } from './questions.ts';
export { formatRegressionScenarios, R2_REGRESSION_SCENARIOS } from './regressions.ts';
export type {
  AnswerSnapshot,
  ApplicabilityRule,
  BlockedParameter,
  BlockedRegressionScenario,
  EvidenceStatus,
  KnowledgeAnswerOption,
  KnowledgeBase,
  KnowledgeMode,
  KnowledgeQuestion,
  KnowledgeValidationIssue,
  KnowledgeValidationReport,
  LikelihoodParameter,
  MaterializedComplaint,
  ParameterStatus,
  PresentingComplaint,
  PriorParameter,
  ProposedComplaint,
  ProvenanceSource,
  ReadyParameter,
  RoutingAuditEnvelope,
  EvidenceRegisterEntry,
  DemonstrationRegressionResult,
  DemonstrationRegressionScenario,
  DemonstrationRegressionStep,
  R3HandoffItem,
  ReviewStatus,
  SourceType,
} from './types.ts';
export {
  assertKnowledgeReady,
  assertKnowledgeStructure,
  validateDemonstrationReadiness,
  validateKnowledgeBase,
  validateProductionReadiness,
} from './validation.ts';
export { KNOWLEDGE_VERSION, R2A_ARCHITECTURE_VERSION } from './version.ts';
