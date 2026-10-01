import { ENGINE_VERSION } from '../config.ts';
import type { KnowledgeBase, KnowledgeQuestion, ProvenanceSource } from '../data/types.ts';
import type {
  RedFlagRule,
  SafetyCondition,
  SafetyKnowledgeBase,
  SafetyQuestion,
  SafetyValidationIssue,
  SafetyValidationReport,
} from './types.ts';
import { SAFETY_VERSION } from './version.ts';

const DIAGNOSTIC_LANGUAGE = /\byou have\b|\bthis means you have\b|\blikely (?:heart attack|stroke|disease)\b|\bdiagnosis\b|\bprobability of (?:an )?emergency disease\b/i;

function addIssue(errors: SafetyValidationIssue[], code: string, path: string, message: string): void {
  errors.push({ code, path, message });
}

function isBlank(value: string): boolean {
  return value.trim().length === 0;
}

function validateProvenanceIds(
  provenanceIds: readonly string[],
  path: string,
  sourceIds: ReadonlySet<string>,
  errors: SafetyValidationIssue[],
): void {
  if (provenanceIds.length === 0) addIssue(errors, 'MISSING_PROVENANCE', path, 'At least one provenance source is required.');
  for (const sourceId of provenanceIds) {
    if (!sourceIds.has(sourceId)) addIssue(errors, 'UNKNOWN_PROVENANCE', path, `Unknown provenance source ${sourceId}.`);
  }
}

function conditionQuestionIds(condition: SafetyCondition): string[] {
  switch (condition.kind) {
    case 'always':
      return [];
    case 'answer_equals':
      return [condition.questionId];
    case 'all':
    case 'any':
      return condition.conditions.flatMap(conditionQuestionIds);
  }
}

function validateCondition(
  condition: SafetyCondition,
  path: string,
  questionOptions: ReadonlyMap<string, ReadonlySet<string>>,
  errors: SafetyValidationIssue[],
): void {
  if (condition.kind === 'answer_equals') {
    const options = questionOptions.get(condition.questionId);
    if (!options) {
      addIssue(errors, 'UNKNOWN_CONDITION_QUESTION', path, `Unknown condition question ${condition.questionId}.`);
    } else if (!options.has(condition.optionId)) {
      addIssue(errors, 'UNKNOWN_CONDITION_OPTION', path, `Unknown option ${condition.optionId} for ${condition.questionId}.`);
    }
    return;
  }
  if (condition.kind === 'all' || condition.kind === 'any') {
    if (condition.conditions.length === 0) {
      addIssue(errors, 'EMPTY_CONDITION_GROUP', path, `${condition.kind} conditions require at least one child.`);
    }
    condition.conditions.forEach((child, index) => validateCondition(child, `${path}.conditions[${index}]`, questionOptions, errors));
  }
}

function validateSource(source: ProvenanceSource, path: string, errors: SafetyValidationIssue[]): void {
  const fields = [source.id, source.organization, source.title, source.reference, source.scope, source.version];
  if (fields.some(isBlank)) addIssue(errors, 'INCOMPLETE_SOURCE', path, 'Source identity, reference, scope, and version are required.');
  if (source.reviewStatus !== 'reviewed' || !['qualitative_supported', 'quantitative_supported'].includes(source.evidenceStatus)) {
    addIssue(errors, 'UNREVIEWED_SAFETY_SOURCE', path, 'R3 sources must be reviewed and qualitatively or quantitatively supported.');
  }
  for (const [field, value] of [
    ['publicationDate', source.publicationDate],
    ['sourceUpdatedAt', source.sourceUpdatedAt],
    ['accessedAt', source.accessedAt],
  ] as const) {
    if (value !== undefined && (isBlank(value) || !Number.isFinite(Date.parse(value)))) {
      addIssue(errors, 'INVALID_SOURCE_DATE', `${path}.${field}`, `${field} must be a valid date.`);
    }
  }
}

function questionOptionsFromRouting(knowledge: Readonly<KnowledgeBase>): Map<string, ReadonlySet<string>> {
  return new Map(knowledge.questions.map((question) => [question.id, new Set(question.options.map((option) => option.id))]));
}

function questionForComplaint(knowledge: Readonly<KnowledgeBase>, complaintId: string, questionId: string): boolean {
  return knowledge.complaints.some(
    (complaint) => complaint.id === complaintId && complaint.questionIds.includes(questionId),
  );
}

function validateQuestion(
  question: SafetyQuestion,
  path: string,
  routingKnowledge: Readonly<KnowledgeBase>,
  approvedComplaintIds: ReadonlySet<string>,
  questionOptions: Map<string, ReadonlySet<string>>,
  sourceIds: ReadonlySet<string>,
  errors: SafetyValidationIssue[],
): void {
  if (isBlank(question.id)) addIssue(errors, 'EMPTY_QUESTION_ID', `${path}.id`, 'Safety question id is required.');
  if (question.applicableComplaintIds.length === 0) {
    addIssue(errors, 'QUESTION_WITHOUT_COMPLAINT', `${path}.applicableComplaintIds`, 'Safety question needs complaint applicability.');
  }
  for (const complaintId of question.applicableComplaintIds) {
    if (!approvedComplaintIds.has(complaintId)) {
      addIssue(errors, 'UNKNOWN_COMPLAINT', `${path}.applicableComplaintIds`, `Unknown complaint ${complaintId}.`);
    }
  }
  if (!Number.isInteger(question.priority.dependencyRank) || question.priority.dependencyRank < 0) {
    addIssue(errors, 'INVALID_QUESTION_PRIORITY', `${path}.priority`, 'dependencyRank must be a non-negative integer.');
  }
  validateProvenanceIds(question.provenanceIds, path, sourceIds, errors);

  if (question.kind === 'routing_reference') {
    const routingQuestion = routingKnowledge.questions.find((candidate) => candidate.id === question.routingQuestionId);
    if (!routingQuestion) {
      addIssue(errors, 'UNKNOWN_ROUTING_QUESTION', path, `Unknown routing question ${question.routingQuestionId}.`);
    }
    if (question.id !== question.routingQuestionId) {
      addIssue(errors, 'ROUTING_QUESTION_ID_MISMATCH', path, 'Routing safety question id must equal routingQuestionId.');
    }
    for (const complaintId of question.applicableComplaintIds) {
      if (!questionForComplaint(routingKnowledge, complaintId, question.routingQuestionId)) {
        addIssue(errors, 'ROUTING_QUESTION_OUTSIDE_COMPLAINT', path, `${question.routingQuestionId} is not in ${complaintId}.`);
      }
    }
    if (routingQuestion) questionOptions.set(question.id, new Set(routingQuestion.options.map((option) => option.id)));
  } else {
    if (routingKnowledge.questions.some((candidate) => candidate.id === question.id)) {
      addIssue(errors, 'OWNED_QUESTION_COLLIDES_WITH_ROUTING', path, `Safety-owned question ${question.id} collides with routing knowledge.`);
    }
    if (isBlank(question.text)) addIssue(errors, 'EMPTY_QUESTION_TEXT', `${path}.text`, 'Question text is required.');
    if (DIAGNOSTIC_LANGUAGE.test(question.text)) {
      addIssue(errors, 'DIAGNOSTIC_LANGUAGE', `${path}.text`, 'Safety question contains diagnostic language.');
    }
    if (question.caregiverText !== undefined) {
      if (isBlank(question.caregiverText)) addIssue(errors, 'EMPTY_QUESTION_TEXT', `${path}.caregiverText`, 'Caregiver wording cannot be blank.');
      if (DIAGNOSTIC_LANGUAGE.test(question.caregiverText)) {
        addIssue(errors, 'DIAGNOSTIC_LANGUAGE', `${path}.caregiverText`, 'Safety question contains diagnostic language.');
      }
      if (!/\byour (child|baby)\b/i.test(question.caregiverText)) {
        addIssue(errors, 'CAREGIVER_VOICE', `${path}.caregiverText`, 'Caregiver wording must refer to "your child" or "your baby".');
      }
    }
    if (question.options.length < 2) addIssue(errors, 'INSUFFICIENT_OPTIONS', `${path}.options`, 'At least two options are required.');
    const optionIds = new Set<string>();
    question.options.forEach((option, index) => {
      if (isBlank(option.id) || isBlank(option.label)) {
        addIssue(errors, 'INVALID_OPTION', `${path}.options[${index}]`, 'Option id and label are required.');
      }
      if (optionIds.has(option.id)) addIssue(errors, 'DUPLICATE_OPTION_ID', `${path}.options[${index}]`, `Duplicate option ${option.id}.`);
      if (DIAGNOSTIC_LANGUAGE.test(option.label)) {
        addIssue(errors, 'DIAGNOSTIC_LANGUAGE', `${path}.options[${index}].label`, 'Safety option contains diagnostic language.');
      }
      optionIds.add(option.id);
    });
    questionOptions.set(question.id, optionIds);
  }
}

function validateQuestionDependencies(
  questions: readonly SafetyQuestion[],
  questionOptions: ReadonlyMap<string, ReadonlySet<string>>,
  routingKnowledge: Readonly<KnowledgeBase>,
  errors: SafetyValidationIssue[],
): void {
  const questionsById = new Map(questions.map((question) => [question.id, question]));
  for (const [index, question] of questions.entries()) {
    validateCondition(question.liveWhen, `questions[${index}].liveWhen`, questionOptions, errors);
    for (const dependencyId of conditionQuestionIds(question.liveWhen)) {
      const dependency = questionsById.get(dependencyId);
      for (const complaintId of question.applicableComplaintIds) {
        const dependencyAvailable = dependency
          ? dependency.applicableComplaintIds.includes(complaintId)
          : questionForComplaint(routingKnowledge, complaintId, dependencyId);
        if (!dependencyAvailable) {
          addIssue(
            errors,
            'DEPENDENCY_OUTSIDE_COMPLAINT',
            `questions[${index}].liveWhen`,
            `Dependency ${dependencyId} is not available for complaint ${complaintId}.`,
          );
        }
      }
      if (
        dependency &&
        dependency.applicableComplaintIds.some((complaintId) => question.applicableComplaintIds.includes(complaintId)) &&
        dependency.priority.dependencyRank >= question.priority.dependencyRank
      ) {
        addIssue(
          errors,
          'INVALID_DEPENDENCY_PRIORITY',
          `questions[${index}].priority`,
          `Dependency ${dependencyId} must have a lower dependencyRank than ${question.id}.`,
        );
      }
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (questionId: string): void => {
    if (visiting.has(questionId)) {
      addIssue(errors, 'QUESTION_DEPENDENCY_CYCLE', `questions.${questionId}`, `Safety question dependency cycle includes ${questionId}.`);
      return;
    }
    if (visited.has(questionId)) return;
    visiting.add(questionId);
    const question = questionsById.get(questionId);
    if (question) {
      for (const dependencyId of conditionQuestionIds(question.liveWhen)) {
        if (questionsById.has(dependencyId)) visit(dependencyId);
      }
    }
    visiting.delete(questionId);
    visited.add(questionId);
  };
  for (const question of questions) visit(question.id);
}

function validateRule(
  rule: RedFlagRule,
  path: string,
  routingKnowledge: Readonly<KnowledgeBase>,
  approvedComplaintIds: ReadonlySet<string>,
  questions: readonly SafetyQuestion[],
  questionOptions: ReadonlyMap<string, ReadonlySet<string>>,
  payloadIds: ReadonlySet<string>,
  sourceIds: ReadonlySet<string>,
  errors: SafetyValidationIssue[],
): void {
  if (isBlank(rule.id)) addIssue(errors, 'EMPTY_RULE_ID', `${path}.id`, 'Rule id is required.');
  if (rule.version !== SAFETY_VERSION) addIssue(errors, 'RULE_VERSION_MISMATCH', `${path}.version`, 'Rule version must match SAFETY_VERSION.');
  if (!Number.isInteger(rule.priority) || rule.priority < 0) {
    addIssue(errors, 'INVALID_RULE_PRIORITY', `${path}.priority`, 'Rule priority must be a non-negative integer.');
  }
  if (rule.applicableComplaintIds.length === 0) {
    addIssue(errors, 'RULE_WITHOUT_COMPLAINT', `${path}.applicableComplaintIds`, 'Rule needs complaint applicability.');
  }
  for (const complaintId of rule.applicableComplaintIds) {
    if (!approvedComplaintIds.has(complaintId)) addIssue(errors, 'UNKNOWN_COMPLAINT', path, `Unknown complaint ${complaintId}.`);
  }
  if (!payloadIds.has(rule.payloadId)) addIssue(errors, 'UNKNOWN_PAYLOAD', `${path}.payloadId`, `Unknown payload ${rule.payloadId}.`);
  validateProvenanceIds(rule.provenanceIds, path, sourceIds, errors);
  validateCondition(rule.predicate, `${path}.predicate`, questionOptions, errors);
  if (rule.requiredQuestionIds.length === 0) {
    addIssue(errors, 'RULE_WITHOUT_QUESTIONS', `${path}.requiredQuestionIds`, 'Rule requires at least one explicit answer.');
  }
  const required = new Set(rule.requiredQuestionIds);
  if (required.size !== rule.requiredQuestionIds.length) {
    addIssue(errors, 'DUPLICATE_REQUIRED_QUESTION', `${path}.requiredQuestionIds`, 'Required question ids must be unique.');
  }
  const predicateIds = new Set(conditionQuestionIds(rule.predicate));
  if (required.size !== predicateIds.size || [...required].some((id) => !predicateIds.has(id))) {
    addIssue(errors, 'RULE_QUESTION_MISMATCH', path, 'requiredQuestionIds must exactly match predicate question references.');
  }
  for (const questionId of required) {
    if (!questionOptions.has(questionId)) addIssue(errors, 'UNKNOWN_REQUIRED_QUESTION', path, `Unknown question ${questionId}.`);
    const safetyQuestion = questions.find((question) => question.id === questionId);
    if (
      safetyQuestion &&
      !rule.applicableComplaintIds.every((complaintId) => safetyQuestion.applicableComplaintIds.includes(complaintId))
    ) {
      addIssue(errors, 'QUESTION_COMPLAINT_MISMATCH', path, `${questionId} does not cover every rule complaint.`);
    }
    if (
      !safetyQuestion &&
      !rule.applicableComplaintIds.every((complaintId) => questionForComplaint(routingKnowledge, complaintId, questionId))
    ) {
      addIssue(errors, 'QUESTION_COMPLAINT_MISMATCH', path, `${questionId} does not belong to every rule complaint.`);
    }
  }
}

export function validateSafetyKnowledge(
  knowledge: Readonly<SafetyKnowledgeBase>,
  routingKnowledge: Readonly<KnowledgeBase>,
): SafetyValidationReport {
  const errors: SafetyValidationIssue[] = [];
  if (knowledge.safetyVersion !== SAFETY_VERSION) {
    addIssue(errors, 'SAFETY_VERSION_MISMATCH', 'safetyVersion', `Expected ${SAFETY_VERSION}.`);
  }
  if (knowledge.compatibleEngineVersion !== ENGINE_VERSION || routingKnowledge.compatibleEngineVersion !== ENGINE_VERSION) {
    addIssue(errors, 'ENGINE_VERSION_MISMATCH', 'compatibleEngineVersion', `Expected ${ENGINE_VERSION}.`);
  }
  if (knowledge.compatibleKnowledgeVersion !== routingKnowledge.knowledgeVersion) {
    addIssue(errors, 'KNOWLEDGE_VERSION_MISMATCH', 'compatibleKnowledgeVersion', 'Safety and routing knowledge versions differ.');
  }
  if (knowledge.readiness !== 'evidence_grounded_demonstration') {
    addIssue(errors, 'INVALID_READINESS', 'readiness', 'R3 must remain evidence-grounded demonstration knowledge.');
  }

  const sourceIds = new Set<string>();
  knowledge.sources.forEach((source, index) => {
    if (sourceIds.has(source.id)) addIssue(errors, 'DUPLICATE_SOURCE_ID', `sources[${index}].id`, `Duplicate source ${source.id}.`);
    sourceIds.add(source.id);
    validateSource(source, `sources[${index}]`, errors);
  });

  const approvedComplaintIds = new Set(routingKnowledge.complaints.map((complaint) => complaint.id));
  const questionOptions = questionOptionsFromRouting(routingKnowledge);
  const questionIds = new Set<string>();
  knowledge.questions.forEach((question, index) => {
    if (questionIds.has(question.id)) addIssue(errors, 'DUPLICATE_QUESTION_ID', `questions[${index}].id`, `Duplicate question ${question.id}.`);
    questionIds.add(question.id);
    validateQuestion(
      question,
      `questions[${index}]`,
      routingKnowledge,
      approvedComplaintIds,
      questionOptions,
      sourceIds,
      errors,
    );
  });
  validateQuestionDependencies(knowledge.questions, questionOptions, routingKnowledge, errors);

  const payloadIds = new Set<string>();
  knowledge.payloads.forEach((payload, index) => {
    const path = `payloads[${index}]`;
    if (payloadIds.has(payload.id)) addIssue(errors, 'DUPLICATE_PAYLOAD_ID', `${path}.id`, `Duplicate payload ${payload.id}.`);
    payloadIds.add(payload.id);
    if ([payload.id, payload.headline, payload.guidance, payload.primaryAction.label].some(isBlank)) {
      addIssue(errors, 'INCOMPLETE_PAYLOAD', path, 'Payload id, copy, and primary action are required.');
    }
    if (payload.continuationPolicy !== 'must_stop' && payload.continuationPolicy !== 'may_continue_after_acknowledgement') {
      addIssue(errors, 'UNSUPPORTED_CONTINUATION_POLICY', path, 'R3 prototype safety payloads must use supported policies.');
    }
    if (DIAGNOSTIC_LANGUAGE.test(`${payload.headline}\n${payload.guidance}`)) {
      addIssue(errors, 'DIAGNOSTIC_LANGUAGE', path, 'Payload contains diagnostic language.');
    }
    validateProvenanceIds(payload.provenanceIds, path, sourceIds, errors);
    if (payload.primaryAction.kind === 'call_emergency_number' && payload.primaryAction.number !== '112') {
      addIssue(errors, 'INVALID_EMERGENCY_NUMBER', `${path}.primaryAction`, 'India emergency action must use the sourced 112 number.');
    }
  });

  const ruleIds = new Set<string>();
  knowledge.rules.forEach((rule, index) => {
    if (ruleIds.has(rule.id)) addIssue(errors, 'DUPLICATE_RULE_ID', `rules[${index}].id`, `Duplicate rule ${rule.id}.`);
    ruleIds.add(rule.id);
    validateRule(
      rule,
      `rules[${index}]`,
      routingKnowledge,
      approvedComplaintIds,
      knowledge.questions,
      questionOptions,
      payloadIds,
      sourceIds,
      errors,
    );
    const payload = knowledge.payloads.find((candidate) => candidate.id === rule.payloadId);
    if (payload && (payload.severity !== rule.severity || payload.continuationPolicy !== rule.continuationPolicy)) {
      addIssue(errors, 'RULE_PAYLOAD_MISMATCH', `rules[${index}]`, 'Rule severity and continuation policy must match its payload.');
    }
  });

  const productionBlockers: SafetyValidationIssue[] = [
    {
      code: 'CLINICAL_REVIEW_REQUIRED',
      path: 'readiness',
      message: 'The implemented rules have authoritative provenance but have not received formal clinical governance approval.',
    },
    {
      code: 'SYSTEM_VALIDATION_REQUIRED',
      path: 'readiness',
      message: 'The complete DocMatch+ safety behavior has not undergone production medical-device or hospital validation.',
    },
  ];

  return {
    structureValid: errors.length === 0,
    evidenceGrounded: errors.length === 0,
    clinicallyReviewed: false,
    productionReady: false,
    errors,
    productionBlockers,
  };
}

export function assertSafetyKnowledgeValid(
  knowledge: Readonly<SafetyKnowledgeBase>,
  routingKnowledge: Readonly<KnowledgeBase>,
): void {
  const report = validateSafetyKnowledge(knowledge, routingKnowledge);
  if (report.errors.length > 0) {
    throw new TypeError(report.errors.map((issue) => `${issue.code} at ${issue.path}: ${issue.message}`).join('\n'));
  }
}

export function safetyQuestionDefinition(
  question: SafetyQuestion,
  routingQuestions: readonly KnowledgeQuestion[],
): { text: string; optionIds: readonly string[] } | null {
  if (question.kind === 'safety_owned') {
    return { text: question.text, optionIds: question.options.map((option) => option.id) };
  }
  const routing = routingQuestions.find((candidate) => candidate.id === question.routingQuestionId);
  return routing ? { text: routing.text, optionIds: routing.options.map((option) => option.id) } : null;
}
