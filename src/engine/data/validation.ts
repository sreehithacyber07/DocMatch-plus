import { ENGINE_VERSION } from '../config.ts';
import type { AnswerOption, Question } from '../types.ts';
import { validateAnswerOption, validateBelief, validateQuestion } from '../validation.ts';
import type {
  KnowledgeBase,
  KnowledgeQuestion,
  KnowledgeValidationIssue,
  KnowledgeValidationReport,
  ParameterStatus,
  ProvenanceSource,
} from './types.ts';

function isBlank(value: string): boolean {
  return value.trim().length === 0;
}

function addIssue(
  target: KnowledgeValidationIssue[],
  severity: KnowledgeValidationIssue['severity'],
  code: string,
  path: string,
  message: string,
): void {
  target.push({ severity, code, path, message });
}

function validateProvenanceReferences(
  provenanceIds: readonly string[],
  path: string,
  sourceIds: ReadonlySet<string>,
  errors: KnowledgeValidationIssue[],
): void {
  if (provenanceIds.length === 0) {
    addIssue(errors, 'error', 'MISSING_PROVENANCE', path, 'At least one provenance reference is required.');
    return;
  }

  for (const provenanceId of provenanceIds) {
    if (!sourceIds.has(provenanceId)) {
      addIssue(errors, 'error', 'UNKNOWN_PROVENANCE', path, `Unknown provenance source ${provenanceId}.`);
    }
  }
}

function hasReviewedEvidence(
  provenanceIds: readonly string[],
  sourcesById: ReadonlyMap<string, ProvenanceSource>,
  acceptedStatuses: readonly ProvenanceSource['evidenceStatus'][],
): boolean {
  return provenanceIds.some((id) => {
    const source = sourcesById.get(id);
    return source?.reviewStatus === 'reviewed' && acceptedStatuses.includes(source.evidenceStatus);
  });
}

function validateSource(source: ProvenanceSource, path: string, errors: KnowledgeValidationIssue[]): void {
  const requiredText: ReadonlyArray<[keyof ProvenanceSource, string]> = [
    ['id', 'source id'],
    ['organization', 'source organization'],
    ['title', 'source title'],
    ['reference', 'source reference'],
    ['scope', 'source scope'],
    ['version', 'source version'],
  ];
  for (const [key, label] of requiredText) {
    if (isBlank(String(source[key]))) addIssue(errors, 'error', 'EMPTY_PROVENANCE_FIELD', `${path}.${key}`, `${label} is required.`);
  }

  for (const [key, value] of [
    ['publicationDate', source.publicationDate],
    ['sourceUpdatedAt', source.sourceUpdatedAt],
    ['accessedAt', source.accessedAt],
  ] as const) {
    if (value !== undefined && (isBlank(value) || !Number.isFinite(Date.parse(value)))) {
      addIssue(errors, 'error', 'INVALID_PROVENANCE_DATE', `${path}.${key}`, `${key} must be a valid date when present.`);
    }
  }
}

function validateClinicalEvidence(
  knowledge: KnowledgeBase,
  provenanceIds: readonly string[],
  path: string,
  sourcesById: ReadonlyMap<string, ProvenanceSource>,
  blockers: KnowledgeValidationIssue[],
): void {
  if (
    (knowledge.mode === 'production' || knowledge.mode === 'demonstration') &&
    !hasReviewedEvidence(provenanceIds, sourcesById, ['qualitative_supported', 'quantitative_supported'])
  ) {
    addIssue(
      blockers,
      'blocker',
      knowledge.mode === 'production' ? 'CLINICAL_EVIDENCE_PENDING' : 'DEMONSTRATION_QUALITATIVE_EVIDENCE_PENDING',
      path,
      `A reviewed qualitative or quantitative clinical source is required for ${knowledge.mode} use.`,
    );
  }
}

function validateReadyParameterProvenance(
  knowledge: KnowledgeBase,
  parameterStatus: ParameterStatus,
  provenanceIds: readonly string[],
  path: string,
  sourcesById: ReadonlyMap<string, ProvenanceSource>,
  errors: KnowledgeValidationIssue[],
): void {
  const expectedStatus: Record<KnowledgeBase['mode'], ParameterStatus> = {
    production: 'clinically_supported',
    demonstration: 'demonstration_only',
    synthetic: 'synthetic_only',
  };
  const expectedEvidence: Record<KnowledgeBase['mode'], ProvenanceSource['evidenceStatus']> = {
    production: 'quantitative_supported',
    demonstration: 'demonstration_only',
    synthetic: 'synthetic_only',
  };

  if (parameterStatus !== expectedStatus[knowledge.mode]) {
    addIssue(
      errors,
      'error',
      'PARAMETER_STATUS_MISMATCH',
      path,
      `${knowledge.mode} knowledge requires parameterStatus=${expectedStatus[knowledge.mode]}.`,
    );
  }
  if (!hasReviewedEvidence(provenanceIds, sourcesById, [expectedEvidence[knowledge.mode]])) {
    addIssue(
      errors,
      'error',
      'UNSUPPORTED_NUMERIC_PARAMETER',
      path,
      `${knowledge.mode} parameters require reviewed ${expectedEvidence[knowledge.mode]} provenance.`,
    );
  }
}

function validateQuestionParameterization(
  knowledge: KnowledgeBase,
  question: KnowledgeQuestion,
  path: string,
  sourceIds: ReadonlySet<string>,
  sourcesById: ReadonlyMap<string, ProvenanceSource>,
  errors: KnowledgeValidationIssue[],
  blockers: KnowledgeValidationIssue[],
): void {
  const readyOptions: AnswerOption[] = [];
  const optionIds = new Set<string>();

  if (question.options.length < 2) {
    addIssue(errors, 'error', 'INSUFFICIENT_OPTIONS', `${path}.options`, 'Every question requires at least two options.');
  }

  for (const [optionIndex, option] of question.options.entries()) {
    const optionPath = `${path}.options[${optionIndex}]`;
    if (isBlank(option.id)) addIssue(errors, 'error', 'EMPTY_OPTION_ID', `${optionPath}.id`, 'Option id is required.');
    if (isBlank(option.label)) addIssue(errors, 'error', 'EMPTY_OPTION_LABEL', `${optionPath}.label`, 'Option label is required.');
    if (optionIds.has(option.id)) {
      addIssue(errors, 'error', 'DUPLICATE_OPTION_ID', `${optionPath}.id`, `Duplicate option id ${option.id}.`);
    }
    optionIds.add(option.id);
    validateProvenanceReferences(option.provenanceIds, optionPath, sourceIds, errors);
    validateProvenanceReferences(option.likelihoods.provenanceIds, `${optionPath}.likelihoods`, sourceIds, errors);

    if (option.likelihoods.status === 'blocked') {
      if (isBlank(option.likelihoods.reason) || isBlank(option.likelihoods.requiredEvidence)) {
        addIssue(errors, 'error', 'INCOMPLETE_BLOCKER', `${optionPath}.likelihoods`, 'Blocked parameters require a reason and required evidence.');
      }
      addIssue(
        blockers,
        'blocker',
        'LIKELIHOOD_PARAMETERIZATION_REQUIRED',
        `${optionPath}.likelihoods`,
        option.likelihoods.reason,
      );
      continue;
    }

    const readyOption: AnswerOption = {
      id: option.id,
      label: option.label,
      value: option.value,
      likelihoods: option.likelihoods.value,
    };
    try {
      validateAnswerOption(readyOption);
      readyOptions.push(readyOption);
    } catch (error) {
      addIssue(errors, 'error', 'INVALID_LIKELIHOODS', `${optionPath}.likelihoods`, String(error));
    }

    validateReadyParameterProvenance(
      knowledge,
      option.likelihoods.parameterStatus,
      option.likelihoods.provenanceIds,
      `${optionPath}.likelihoods`,
      sourcesById,
      errors,
    );
  }

  if (readyOptions.length === question.options.length && readyOptions.length >= 2) {
    const materialized: Question = { id: question.id, text: question.text, options: readyOptions };
    try {
      validateQuestion(materialized);
    } catch (error) {
      addIssue(errors, 'error', 'INVALID_ANSWER_DISTRIBUTION', `${path}.options`, String(error));
    }
  }
}

export function validateKnowledgeBase(knowledge: KnowledgeBase): KnowledgeValidationReport {
  const errors: KnowledgeValidationIssue[] = [];
  const blockers: KnowledgeValidationIssue[] = [];

  if (isBlank(knowledge.knowledgeVersion)) {
    addIssue(errors, 'error', 'MISSING_KNOWLEDGE_VERSION', 'knowledgeVersion', 'Knowledge version is required.');
  }
  if (knowledge.compatibleEngineVersion !== ENGINE_VERSION) {
    addIssue(
      errors,
      'error',
      'ENGINE_VERSION_MISMATCH',
      'compatibleEngineVersion',
      `Expected ${ENGINE_VERSION}; received ${knowledge.compatibleEngineVersion}.`,
    );
  }

  const sourceIds = new Set<string>();
  const sourcesById = new Map<string, ProvenanceSource>();
  for (const [sourceIndex, source] of knowledge.sources.entries()) {
    const path = `sources[${sourceIndex}]`;
    validateSource(source, path, errors);
    if (sourceIds.has(source.id)) addIssue(errors, 'error', 'DUPLICATE_SOURCE_ID', `${path}.id`, `Duplicate source id ${source.id}.`);
    sourceIds.add(source.id);
    sourcesById.set(source.id, source);
    if (knowledge.mode === 'production' && source.evidenceStatus === 'synthetic_only') {
      addIssue(errors, 'error', 'SYNTHETIC_SOURCE_IN_PRODUCTION', path, 'Production knowledge cannot include synthetic-only provenance.');
    }
    if (knowledge.mode === 'production' && source.evidenceStatus === 'demonstration_only') {
      addIssue(errors, 'error', 'DEMONSTRATION_SOURCE_IN_PRODUCTION', path, 'Production knowledge cannot include demonstration-only provenance.');
    }
    if (knowledge.mode === 'demonstration' && source.evidenceStatus === 'synthetic_only') {
      addIssue(errors, 'error', 'SYNTHETIC_SOURCE_IN_DEMONSTRATION', path, 'Demonstration knowledge cannot include synthetic-only provenance.');
    }
    if (knowledge.mode === 'synthetic' && source.evidenceStatus !== 'synthetic_only') {
      addIssue(errors, 'error', 'NON_SYNTHETIC_SOURCE_IN_FIXTURE', path, 'Synthetic knowledge must use explicitly synthetic provenance.');
    }
  }

  const questionsById = new Map<string, KnowledgeQuestion>();
  for (const [questionIndex, question] of knowledge.questions.entries()) {
    const path = `questions[${questionIndex}]`;
    if (isBlank(question.id)) addIssue(errors, 'error', 'EMPTY_QUESTION_ID', `${path}.id`, 'Question id is required.');
    if (isBlank(question.text)) addIssue(errors, 'error', 'EMPTY_QUESTION_TEXT', `${path}.text`, 'Question text is required.');
    if (question.knowledgeVersion !== knowledge.knowledgeVersion) {
      addIssue(errors, 'error', 'QUESTION_VERSION_MISMATCH', `${path}.knowledgeVersion`, 'Question knowledge version does not match its knowledge base.');
    }
    if (questionsById.has(question.id)) {
      addIssue(errors, 'error', 'DUPLICATE_QUESTION_ID', `${path}.id`, `Duplicate question id ${question.id}.`);
    }
    questionsById.set(question.id, question);
    validateProvenanceReferences(question.provenanceIds, path, sourceIds, errors);
    validateClinicalEvidence(knowledge, question.provenanceIds, path, sourcesById, blockers);
    validateQuestionParameterization(knowledge, question, path, sourceIds, sourcesById, errors, blockers);
  }

  const complaintIds = new Set<string>();
  const referencedQuestions = new Set<string>();
  for (const [complaintIndex, complaint] of knowledge.complaints.entries()) {
    const path = `complaints[${complaintIndex}]`;
    if (isBlank(complaint.id)) addIssue(errors, 'error', 'EMPTY_COMPLAINT_ID', `${path}.id`, 'Complaint id is required.');
    if (isBlank(complaint.label)) addIssue(errors, 'error', 'EMPTY_COMPLAINT_LABEL', `${path}.label`, 'Complaint label is required.');
    if (complaintIds.has(complaint.id)) {
      addIssue(errors, 'error', 'DUPLICATE_COMPLAINT_ID', `${path}.id`, `Duplicate complaint id ${complaint.id}.`);
    }
    complaintIds.add(complaint.id);
    if (complaint.knowledgeVersion !== knowledge.knowledgeVersion) {
      addIssue(errors, 'error', 'COMPLAINT_VERSION_MISMATCH', `${path}.knowledgeVersion`, 'Complaint knowledge version does not match its knowledge base.');
    }
    validateProvenanceReferences(complaint.provenanceIds, path, sourceIds, errors);
    const fallbackOnly = complaint.routingMode === 'fallback_only';
    if (!fallbackOnly) validateClinicalEvidence(knowledge, complaint.provenanceIds, path, sourcesById, blockers);
    validateProvenanceReferences(complaint.prior.provenanceIds, `${path}.prior`, sourceIds, errors);

    if (complaint.prior.status === 'blocked') {
      if (isBlank(complaint.prior.reason) || isBlank(complaint.prior.requiredEvidence)) {
        addIssue(errors, 'error', 'INCOMPLETE_BLOCKER', `${path}.prior`, 'Blocked parameters require a reason and required evidence.');
      }
      addIssue(blockers, 'blocker', 'PRIOR_PARAMETERIZATION_REQUIRED', `${path}.prior`, complaint.prior.reason);
    } else {
      try {
        validateBelief(complaint.prior.value);
      } catch (error) {
        addIssue(errors, 'error', 'INVALID_PRIOR', `${path}.prior`, String(error));
      }
      validateReadyParameterProvenance(
        knowledge,
        complaint.prior.parameterStatus,
        complaint.prior.provenanceIds,
        `${path}.prior`,
        sourcesById,
        errors,
      );
    }

    if (fallbackOnly && complaint.prior.status === 'ready') {
      const probabilities = Object.values(complaint.prior.value);
      if (probabilities.some((value) => Math.abs(value - probabilities[0]) > 1e-12)) {
        addIssue(errors, 'error', 'DIRECTIONAL_FALLBACK_PRIOR', `${path}.prior`, 'Fallback-only complaints require a uniform non-directional prior.');
      }
    }

    if (complaint.questionIds.length === 0 && !fallbackOnly) {
      addIssue(errors, 'error', 'COMPLAINT_WITHOUT_QUESTIONS', `${path}.questionIds`, 'Complaint must reference at least one question.');
      continue;
    }
    if (fallbackOnly && complaint.questionIds.length > 0) {
      addIssue(errors, 'error', 'FALLBACK_WITH_ROUTING_QUESTIONS', `${path}.questionIds`, 'Fallback-only complaints cannot carry scored routing questions.');
    }
    if (complaint.questionIds.length === 0) continue;

    const pool = new Set<string>();
    for (const questionId of complaint.questionIds) {
      if (pool.has(questionId)) {
        addIssue(errors, 'error', 'DUPLICATE_COMPLAINT_QUESTION', `${path}.questionIds`, `Question ${questionId} is repeated.`);
      }
      pool.add(questionId);
      referencedQuestions.add(questionId);
      if (!questionsById.has(questionId)) {
        addIssue(errors, 'error', 'UNKNOWN_QUESTION_REFERENCE', `${path}.questionIds`, `Unknown question ${questionId}.`);
      }
    }

    for (const questionId of complaint.questionIds) {
      const question = questionsById.get(questionId);
      if (!question || question.applicability.kind === 'always') continue;
      const applicability = question.applicability;
      const referencedQuestion = questionsById.get(applicability.questionId);
      if (!referencedQuestion) {
        addIssue(
          errors,
          'error',
          'UNKNOWN_APPLICABILITY_QUESTION',
          `questions.${question.id}.applicability`,
          `Unknown prerequisite question ${applicability.questionId}.`,
        );
        continue;
      }
      if (!pool.has(applicability.questionId)) {
        addIssue(
          errors,
          'error',
          'APPLICABILITY_OUTSIDE_COMPLAINT',
          `questions.${question.id}.applicability`,
          `Prerequisite question ${applicability.questionId} is not in complaint ${complaint.id}.`,
        );
        continue;
      }
      if (!referencedQuestion.options.some((option) => option.id === applicability.optionId)) {
        addIssue(
          errors,
          'error',
          'UNKNOWN_APPLICABILITY_OPTION',
          `questions.${question.id}.applicability`,
          `Unknown prerequisite option ${applicability.optionId}.`,
        );
      }
    }

    const reachable = new Set<string>();
    let changed = true;
    while (changed) {
      changed = false;
      for (const questionId of complaint.questionIds) {
        const question = questionsById.get(questionId);
        if (!question || reachable.has(questionId)) continue;
        const applicability = question.applicability;
        if (applicability.kind === 'always') {
          reachable.add(questionId);
          changed = true;
          continue;
        }
        const referencedQuestion = questionsById.get(applicability.questionId);
        const optionExists = referencedQuestion?.options.some((option) => option.id === applicability.optionId) ?? false;
        if (pool.has(applicability.questionId) && optionExists && reachable.has(applicability.questionId)) {
          reachable.add(questionId);
          changed = true;
        }
      }
    }

    for (const questionId of complaint.questionIds) {
      if (questionsById.has(questionId) && !reachable.has(questionId)) {
        addIssue(
          errors,
          'error',
          'UNREACHABLE_QUESTION',
          `${path}.questionIds`,
          `Question ${questionId} cannot become applicable from this complaint's question pool.`,
        );
      }
    }
  }

  for (const question of knowledge.questions) {
    if (!referencedQuestions.has(question.id)) {
      addIssue(errors, 'error', 'UNREFERENCED_QUESTION', `questions.${question.id}`, 'Question is not referenced by any complaint.');
    }
  }

  return {
    structureValid: errors.length === 0,
    engineReady: errors.length === 0 && blockers.length === 0,
    errors,
    blockers,
  };
}

export function assertKnowledgeStructure(knowledge: KnowledgeBase): void {
  const report = validateKnowledgeBase(knowledge);
  if (report.errors.length > 0) {
    throw new TypeError(report.errors.map((issue) => `${issue.code} at ${issue.path}: ${issue.message}`).join('\n'));
  }
}

export function assertKnowledgeReady(knowledge: KnowledgeBase): void {
  const report = validateKnowledgeBase(knowledge);
  const issues = [...report.errors, ...report.blockers];
  if (issues.length > 0) {
    throw new TypeError(issues.map((issue) => `${issue.code} at ${issue.path}: ${issue.message}`).join('\n'));
  }
}

function readinessForMode(
  knowledge: KnowledgeBase,
  requiredMode: 'production' | 'demonstration',
): KnowledgeValidationReport {
  const report = validateKnowledgeBase(knowledge);
  if (knowledge.mode === requiredMode) return report;
  const modeIssue: KnowledgeValidationIssue = {
    severity: 'error',
    code: requiredMode === 'production' ? 'NOT_PRODUCTION_KNOWLEDGE' : 'NOT_DEMONSTRATION_KNOWLEDGE',
    path: 'mode',
    message: `${requiredMode} readiness requires mode=${requiredMode}; received ${knowledge.mode}.`,
  };
  return {
    structureValid: report.structureValid,
    engineReady: false,
    errors: [...report.errors, modeIssue],
    blockers: [...report.blockers],
  };
}

export function validateProductionReadiness(knowledge: KnowledgeBase): KnowledgeValidationReport {
  return readinessForMode(knowledge, 'production');
}

export function validateDemonstrationReadiness(knowledge: KnowledgeBase): KnowledgeValidationReport {
  return readinessForMode(knowledge, 'demonstration');
}
