import { ENGINE_VERSION } from '../config.ts';
import { selectNextQuestion } from '../questions.ts';
import { shouldStop } from '../stopping.ts';
import type { Question } from '../types.ts';
import { compareFiredRules, evaluateSafetyState } from './evaluate.ts';
import type {
  RedFlagRule,
  ResolvedSafetyQuestion,
  SafetyAuditEnvelope,
  SafetyControllerInput,
  SafetyControllerResult,
  SafetyPayload,
  SafetyQuestion,
} from './types.ts';

function assertControllerCompatibility(input: SafetyControllerInput): void {
  const { complaint, safetyKnowledge, session } = input;
  if (session.engineVersion !== ENGINE_VERSION || safetyKnowledge.compatibleEngineVersion !== ENGINE_VERSION) {
    throw new TypeError('Safety controller engine version mismatch.');
  }
  if (complaint.compatibleEngineVersion !== ENGINE_VERSION) {
    throw new TypeError('Materialized complaint engine version mismatch.');
  }
  if (complaint.knowledgeVersion !== safetyKnowledge.compatibleKnowledgeVersion) {
    throw new TypeError('Safety and routing knowledge versions are incompatible.');
  }
  if (session.presentingComplaintId !== complaint.complaintId) {
    throw new TypeError('Routing session and materialized complaint refer to different complaints.');
  }
  if (!safetyKnowledge.rules.some((rule) => rule.applicableComplaintIds.includes(complaint.complaintId))) {
    throw new TypeError(`Safety knowledge does not cover complaint ${complaint.complaintId}.`);
  }
}

function cloneRoutingQuestion(question: Readonly<Question>): ResolvedSafetyQuestion {
  return {
    id: question.id,
    text: question.text,
    options: question.options.map((option) => ({ id: option.id, label: option.label })),
    answerTarget: 'routing_session',
    provenanceIds: [],
  };
}

function resolveSafetyQuestion(
  definition: SafetyQuestion,
  routingQuestions: readonly Question[],
): ResolvedSafetyQuestion {
  if (definition.kind === 'safety_owned') {
    return {
      id: definition.id,
      text: definition.text,
      ...(definition.caregiverText ? { caregiverText: definition.caregiverText } : {}),
      options: definition.options.map((option) => ({ ...option })),
      answerTarget: 'safety_state',
      provenanceIds: [...definition.provenanceIds],
    };
  }
  const routingQuestion = routingQuestions.find((question) => question.id === definition.routingQuestionId);
  if (!routingQuestion) throw new TypeError(`Missing routing safety question ${definition.routingQuestionId}.`);
  return { ...cloneRoutingQuestion(routingQuestion), provenanceIds: [...definition.provenanceIds] };
}

function auditEnvelope(
  input: SafetyControllerInput,
  firedRuleIds: readonly string[],
): SafetyAuditEnvelope {
  const relevantRules = input.safetyKnowledge.rules.filter((rule) =>
    rule.applicableComplaintIds.includes(input.complaint.complaintId),
  );
  const payloadIds = new Set(relevantRules.map((rule) => rule.payloadId));
  const provenanceIds = new Set([
    ...input.safetyKnowledge.questions
      .filter((question) => question.applicableComplaintIds.includes(input.complaint.complaintId))
      .flatMap((question) => question.provenanceIds),
    ...relevantRules.flatMap((rule) => rule.provenanceIds),
    ...input.safetyKnowledge.payloads
      .filter((payload) => payloadIds.has(payload.id))
      .flatMap((payload) => payload.provenanceIds),
  ]);
  return {
    engineVersion: input.safetyKnowledge.compatibleEngineVersion,
    knowledgeVersion: input.safetyKnowledge.compatibleKnowledgeVersion,
    safetyVersion: input.safetyKnowledge.safetyVersion,
    parameterizationStatus: 'routing_demonstration_only',
    evidenceStatus: 'source_supported_warning_sign_relationships',
    systemStatus: 'evidence_grounded_demonstration_not_clinically_validated',
    complaintId: input.complaint.complaintId,
    firedRuleIds: [...firedRuleIds],
    provenanceIds: [...provenanceIds].toSorted(),
  };
}

function selectedFiredRules(input: SafetyControllerInput, firedRuleIds: readonly string[]): RedFlagRule[] {
  const firedSet = new Set(firedRuleIds);
  return input.safetyKnowledge.rules
    .filter((rule) => firedSet.has(rule.id))
    .toSorted(compareFiredRules);
}

function scopedInput(input: SafetyControllerInput): SafetyControllerInput {
  if (!input.enabledSafetyQuestionIds) return input;
  const enabled = new Set(input.enabledSafetyQuestionIds);
  return {
    ...input,
    safetyKnowledge: {
      ...input.safetyKnowledge,
      questions: input.safetyKnowledge.questions.filter((question) => enabled.has(question.id)),
      /*
        A rule stays in scope while ANY of its questions is enabled.

        This used to require every question, which silently dropped the
        `any(...)` danger-sign rules whenever the context enabled only some of
        their signs: a school-age child with a chest concern had the breathing
        question enabled but not the seizure one, so answering "yes, struggling
        to breathe" fired nothing. An unasked question can never satisfy
        `answer_equals`, so keeping the rule in scope cannot fire it on an
        answer that was not given; an `all(...)` rule still needs every part.
      */
      rules: input.safetyKnowledge.rules.filter((rule) =>
        rule.requiredQuestionIds.some((questionId) => enabled.has(questionId))),
    },
  };
}

function clonePayload(payload: SafetyPayload): SafetyPayload {
  return {
    ...payload,
    provenanceIds: [...payload.provenanceIds],
    primaryAction: { ...payload.primaryAction },
    ...(payload.secondaryAction ? { secondaryAction: { ...payload.secondaryAction } } : {}),
  };
}

export function evaluateSafetyController(input: SafetyControllerInput): SafetyControllerResult {
  assertControllerCompatibility(input);
  const scoped = scopedInput(input);
  const safetyState = evaluateSafetyState(
    {
      complaintId: input.session.presentingComplaintId,
      routingAnswers: input.session.answers,
      safetyAnswers: input.safetyAnswers,
      enabledSafetyQuestionIds: input.enabledSafetyQuestionIds,
    },
    scoped.safetyKnowledge,
  );
  const audit = auditEnvelope(scoped, safetyState.firedRuleIds);
  const fired = selectedFiredRules(scoped, safetyState.firedRuleIds);
  const blocking = fired.filter((candidate) => candidate.continuationPolicy === 'must_stop');
  const continuable = fired.filter((candidate) => candidate.continuationPolicy === 'may_continue_after_acknowledgement');
  const urgentRule = continuable[0];
  const urgentPayload = urgentRule
    ? scoped.safetyKnowledge.payloads.find((candidate) => candidate.id === urgentRule.payloadId)
    : null;
  if (urgentRule && !urgentPayload) throw new TypeError(`Missing safety payload ${urgentRule.payloadId}.`);
  const urgentReview = urgentRule && urgentPayload
    ? {
        firedRuleIds: continuable.map((candidate) => candidate.id),
        selectedRuleId: urgentRule.id,
        payload: clonePayload(urgentPayload),
      }
    : undefined;

  if (blocking.length > 0) {
    const selectedRule = blocking[0];
    const payload = scoped.safetyKnowledge.payloads.find((candidate) => candidate.id === selectedRule.payloadId);
    if (!payload) throw new TypeError(`Missing safety payload ${selectedRule.payloadId}.`);
    return {
      status: 'interrupted',
      informationGainBypassed: true,
      reason: 'fired_safety_rule',
      audit,
      safetyState,
      firedRuleIds: [...safetyState.firedRuleIds],
      selectedRuleId: selectedRule.id,
      severity: selectedRule.severity,
      continuationPolicy: selectedRule.continuationPolicy,
      payload: clonePayload(payload),
    };
  }

  if (safetyState.unscreenedQuestionIds.length > 0) {
    const questionId = safetyState.unscreenedQuestionIds[0];
    const definition = scoped.safetyKnowledge.questions.find((question) => question.id === questionId);
    if (!definition) throw new TypeError(`Missing safety question ${questionId}.`);
    return {
      status: 'safety-screening',
      audit,
      safetyState,
      question: resolveSafetyQuestion(definition, input.complaint.questions),
      informationGainBypassed: true,
      reason: 'live_unscreened_safety_concept',
      ...(urgentReview ? { urgentReview } : {}),
    };
  }

  const stoppingDecision = shouldStop(
    input.session.belief,
    input.session.askedQuestionIds.length,
    input.engineConfig,
    // The answers are judged for sufficiency only when the config asks for it.
    { answers: input.session.answers, questions: input.complaint.questions },
  );
  if (stoppingDecision.shouldStop) {
    return {
      status: 'result',
      audit,
      safetyState,
      routingOutcome: {
        specialtyId: stoppingDecision.topSpecialtyId,
        stopReason: stoppingDecision.reason ?? 'question_pool_exhausted',
      },
      stoppingDecision,
      ...(urgentReview ? { urgentReview } : {}),
    };
  }

  const selection = selectNextQuestion(
    input.session.belief,
    input.session.askedQuestionIds,
    input.complaint.questions,
    input.engineConfig.posteriorFloor,
  );
  if (selection) {
    return {
      status: 'question',
      audit,
      safetyState,
      selection,
      informationGainBypassed: false,
      ...(urgentReview ? { urgentReview } : {}),
    };
  }

  return {
    status: 'result',
    audit,
    safetyState,
    routingOutcome: {
      specialtyId: stoppingDecision.topSpecialtyId,
      stopReason: 'question_pool_exhausted',
    },
    stoppingDecision,
    ...(urgentReview ? { urgentReview } : {}),
  };
}
