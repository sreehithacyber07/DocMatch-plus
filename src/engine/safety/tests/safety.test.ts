/// <reference types="node" />

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { ENGINE_VERSION } from '../../config.ts';
import { R2B_DEMONSTRATION_KNOWLEDGE } from '../../data/demonstration/knowledge.ts';
import { DEMONSTRATION_ENGINE_CONFIG } from '../../data/demonstration/policy.ts';
import { materializeDemonstrationComplaint } from '../../data/materialize.ts';
import { KNOWLEDGE_VERSION } from '../../data/version.ts';
import { answerSessionQuestion, createRoutingSession } from '../../session.ts';
import type { Belief, RoutingSession } from '../../types.ts';
import {
  appendSafetyAuditEvent,
  createSafetyInterruptionAuditEvent,
  createSafetyScreeningAuditEvent,
  createStaffOverrideAuditEvent,
} from '../audit.ts';
import { recordSafetyAnswer } from '../answers.ts';
import { evaluateSafetyController } from '../controller.ts';
import { compareSafetyQuestions, evaluateSafetyCondition, evaluateSafetyState } from '../evaluate.ts';
import { R3_SAFETY_KNOWLEDGE } from '../knowledge.ts';
import { INDIA_EMERGENCY_PAYLOAD_ID } from '../payloads.ts';
import { R3_SAFETY_QUESTIONS } from '../questions.ts';
import { runAllSafetyRegressions, runReplaySafetyRegression } from '../regressions.ts';
import { R3_RED_FLAG_RULES } from '../rules.ts';
import { R3_SAFETY_EVIDENCE_REGISTER } from '../sources.ts';
import type { SafetyAnswer, SafetyControllerResult, SafetyKnowledgeBase } from '../types.ts';
import { assertSafetyKnowledgeValid, safetyQuestionDefinition, validateSafetyKnowledge } from '../validation.ts';
import { SAFETY_VERSION } from '../version.ts';

const BASE_TIME = '2026-09-10T00:00:00.000Z';

function setup(complaintId: string): { session: RoutingSession; safetyAnswers: SafetyAnswer[] } {
  const complaint = materializeDemonstrationComplaint(R2B_DEMONSTRATION_KNOWLEDGE, complaintId, []);
  return { session: createRoutingSession(complaintId, complaint.prior, BASE_TIME), safetyAnswers: [] };
}

function materialize(session: Readonly<RoutingSession>) {
  return materializeDemonstrationComplaint(
    R2B_DEMONSTRATION_KNOWLEDGE,
    session.presentingComplaintId,
    session.answers.map((answer) => ({ questionId: answer.questionId, optionId: answer.optionId })),
  );
}

function decide(session: Readonly<RoutingSession>, safetyAnswers: readonly SafetyAnswer[]): SafetyControllerResult {
  return evaluateSafetyController({
    session,
    complaint: materialize(session),
    safetyAnswers,
    safetyKnowledge: R3_SAFETY_KNOWLEDGE,
    engineConfig: DEMONSTRATION_ENGINE_CONFIG,
  });
}

function answerRouting(session: Readonly<RoutingSession>, questionId: string, optionId: string, second: number): RoutingSession {
  return answerSessionQuestion(
    session,
    { questionId, optionId, answeredAt: `2026-09-10T00:00:${String(second).padStart(2, '0')}.000Z` },
    materialize(session).questions,
    DEMONSTRATION_ENGINE_CONFIG.posteriorFloor,
  );
}

function safetyAnswer(questionId: string, optionId: string, second = 1): SafetyAnswer {
  return { questionId, optionId, answeredAt: `2026-09-10T00:00:${String(second).padStart(2, '0')}.000Z` };
}

test('R3 knowledge is structurally valid and evidence-grounded but not production-ready', () => {
  const report = validateSafetyKnowledge(R3_SAFETY_KNOWLEDGE, R2B_DEMONSTRATION_KNOWLEDGE);
  assert.equal(report.structureValid, true);
  assert.equal(report.evidenceGrounded, true);
  assert.equal(report.clinicallyReviewed, false);
  assert.equal(report.productionReady, false);
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.productionBlockers.map((blocker) => blocker.code), [
    'CLINICAL_REVIEW_REQUIRED',
    'SYSTEM_VALIDATION_REQUIRED',
  ]);
  assert.doesNotThrow(() => assertSafetyKnowledgeValid(R3_SAFETY_KNOWLEDGE, R2B_DEMONSTRATION_KNOWLEDGE));
});

test('rule, safety-question, payload, and source ids are unique', () => {
  const sets = [
    R3_RED_FLAG_RULES.map((rule) => rule.id),
    R3_SAFETY_QUESTIONS.map((question) => question.id),
    R3_SAFETY_KNOWLEDGE.payloads.map((payload) => payload.id),
    R3_SAFETY_KNOWLEDGE.sources.map((source) => source.id),
  ];
  for (const ids of sets) assert.equal(new Set(ids).size, ids.length);
  // 25 original rules, the 15 source-backed paediatric, throat and injury
  // checks added in the questionnaire rebuild (NHM IMNCI, NHS, NICE), and the
  // 4 branch checks added by normalization (NHS rectal bleeding, sinusitis,
  // shingles). The two combined paediatric danger-sign rules became three
  // single-sign rules, one per question, so an interruption names its sign.
  // The routing reconciliation added one exact-predicate emergency rule per
  // new branch: palpitations (NHS), rapidly progressive weakness (NICE NG127)
  // and the back 999 features (NHS Back pain, Sciatica; NICE NG127). The final
  // upper-abdomen injury branch adds one exact broken-rib/serious-accident stop.
  // 50: the dental spreading-swelling check (questionnaire intelligence pass, PENDING CLINICAL REVIEW).
  // 58: phase 2 added the DVT (urgent and emergency), hernia, giant cell
  // arteritis, back, cellulitis (urgent and emergency) and bleeding varicose
  // vein checks (questionnaire expansion phase 2, PENDING CLINICAL REVIEW).
  // Phase 3 (PENDING CLINICAL REVIEW): +3 joint-specific clot and back checks,
  // +5 head, face, nose and neck injury checks.
  assert.equal(R3_RED_FLAG_RULES.length, 58 + 3 + 5);
  assert.equal(R3_SAFETY_QUESTIONS.length, 61 + 3 + 5);
});

test('all enabled rules, questions, and payloads resolve authoritative provenance', () => {
  const sourceIds = new Set(R3_SAFETY_KNOWLEDGE.sources.map((source) => source.id));
  for (const item of [...R3_RED_FLAG_RULES, ...R3_SAFETY_QUESTIONS, ...R3_SAFETY_KNOWLEDGE.payloads]) {
    assert.ok(item.provenanceIds.length > 0);
    assert.ok(item.provenanceIds.every((sourceId) => sourceIds.has(sourceId)));
  }
  assert.ok(R3_SAFETY_KNOWLEDGE.sources.every((source) => source.reviewStatus === 'reviewed'));
});

test('the evidence register covers every enabled rule and states system limits', () => {
  const registeredRules = new Set(R3_SAFETY_EVIDENCE_REGISTER.flatMap((entry) => entry.ruleIds));
  for (const rule of R3_RED_FLAG_RULES) assert.ok(registeredRules.has(rule.id));
  for (const entry of R3_SAFETY_EVIDENCE_REGISTER) assert.match(entry.doesNotSupport, /does not/i);
});

test('routing safety references resolve without duplicating R2 question content', () => {
  const references = R3_SAFETY_QUESTIONS.filter((question) => question.kind === 'routing_reference');
  assert.equal(references.length, 4);
  for (const question of references) {
    const resolved = safetyQuestionDefinition(question, R2B_DEMONSTRATION_KNOWLEDGE.questions);
    assert.ok(resolved);
    assert.ok(resolved.text.length > 0);
    assert.deepEqual(resolved.optionIds, ['yes', 'no']);
  }
});

test('all safety-owned questions use explicit deterministic Yes and No options', () => {
  const owned = R3_SAFETY_QUESTIONS.filter((question) => question.kind === 'safety_owned');
  assert.equal(owned.length, 65);
  for (const question of owned) assert.deepEqual(question.options.map((option) => option.id), ['yes', 'no']);
});

test('condition evaluation supports always, answer, AND, and OR without mutation', () => {
  const answers = new Map([['a', 'yes'], ['b', 'no']]);
  const before = structuredClone([...answers]);
  assert.equal(evaluateSafetyCondition({ kind: 'always' }, answers), true);
  assert.equal(evaluateSafetyCondition({ kind: 'answer_equals', questionId: 'a', optionId: 'yes' }, answers), true);
  assert.equal(evaluateSafetyCondition({ kind: 'all', conditions: [
    { kind: 'answer_equals', questionId: 'a', optionId: 'yes' },
    { kind: 'answer_equals', questionId: 'b', optionId: 'no' },
  ] }, answers), true);
  assert.equal(evaluateSafetyCondition({ kind: 'any', conditions: [
    { kind: 'answer_equals', questionId: 'a', optionId: 'no' },
    { kind: 'answer_equals', questionId: 'b', optionId: 'no' },
  ] }, answers), true);
  assert.deepEqual([...answers], before);
});

test('safety priority is severity, dependency rank, then stable id', () => {
  const sorted = [...R3_SAFETY_QUESTIONS].reverse().toSorted(compareSafetyQuestions);
  const joint = sorted.filter((question) => question.applicableComplaintIds.includes('joint-musculoskeletal-pain'));
  assert.deepEqual(joint.map((question) => question.id), [
    'joint-musculoskeletal-pain-injury',
    'safety-joint-injury-severe-or-displaced',
    'safety-joint-injury-sensation-circulation',
    // Phase 3 joint-specific screens (PENDING CLINICAL REVIEW); each depends on an earlier answer.
    'safety-joint-dvt-one-leg',
    'safety-joint-dvt-breathless',
    'safety-joint-sudden-hot-swollen',
    'safety-joint-back-urgent',
  ]);
});

test('a live unscreened safety question pre-empts R1 information gain', () => {
  const { session, safetyAnswers } = setup('upper-abdominal-pain');
  const result = decide(session, safetyAnswers);
  assert.equal(result.status, 'safety-screening');
  if (result.status !== 'safety-screening') return;
  assert.equal(result.question.id, 'upper-abdominal-pain-exertional');
  assert.equal(result.informationGainBypassed, true);
  assert.equal(result.question.answerTarget, 'routing_session');
  assert.equal(result.audit.parameterizationStatus, 'routing_demonstration_only');
  assert.equal(result.audit.evidenceStatus, 'source_supported_warning_sign_relationships');
});

test('a fired rule pre-empts both remaining safety screens and R1 selection', () => {
  const { session } = setup('shortness-of-breath');
  const result = decide(session, [safetyAnswer('safety-shortness-of-breath-severe', 'yes')]);
  assert.equal(result.status, 'interrupted');
  if (result.status !== 'interrupted') return;
  assert.equal(result.informationGainBypassed, true);
  assert.deepEqual(result.firedRuleIds, ['breathing-severe-inability-to-speak']);
  assert.equal(result.payload.id, INDIA_EMERGENCY_PAYLOAD_ID);
  assert.equal(result.continuationPolicy, 'must_stop');
});

test('R1 stopping cannot bypass a live safety screen', () => {
  const base = setup('headache').session;
  const highNeurology: Belief = {
    cardiology: 0.01,
    pulmonology: 0.01,
    neurology: 0.95,
    gastroenterology: 0.01,
    orthopedics: 0.01,
    dermatology: 0.01,
  };
  const session = { ...base, belief: highNeurology, askedQuestionIds: ['a', 'b', 'c', 'd', 'e'] };
  const result = decide(session, []);
  assert.equal(result.status, 'safety-screening');
});

test('negative safety answers return control to ordinary R1 selection', () => {
  const { session } = setup('headache');
  const answers = [
    safetyAnswer('safety-headache-sudden-extremely-painful', 'no', 1),
    safetyAnswer('safety-headache-new-one-sided-weakness', 'no', 2),
    safetyAnswer('safety-headache-speech-memory-vision', 'no', 3),
    safetyAnswer('safety-headache-drowsy-confused', 'no', 4),
  ];
  const result = decide(session, answers);
  assert.equal(result.status, 'question');
  assert.deepEqual(result.safetyState.firedRuleIds, []);
  assert.deepEqual(result.safetyState.unscreenedQuestionIds, []);
});

test('urgent rules retain an urgent-review flag without becoming a hard-stop interruption', () => {
  const { session } = setup('shortness-of-breath');
  const result = decide(session, [
    safetyAnswer('safety-shortness-of-breath-severe', 'no', 1),
    safetyAnswer('safety-shortness-of-breath-pale-blue-grey', 'no', 2),
    safetyAnswer('safety-shortness-of-breath-sudden-confusion', 'no', 3),
    safetyAnswer('safety-shortness-of-breath-coughing-blood', 'yes', 4),
  ]);
  assert.notEqual(result.status, 'interrupted');
  assert.equal(result.urgentReview?.payload.id, 'urgent-medical-assessment');
  assert.equal(result.urgentReview?.payload.continuationPolicy, 'may_continue_after_acknowledgement');
  assert.deepEqual(result.urgentReview?.firedRuleIds, ['breathing-coughing-blood']);
});

test('the emergency payload uses the sourced Pan-India 112 contact without claiming dispatch', () => {
  const payload = R3_SAFETY_KNOWLEDGE.payloads.find((candidate) => candidate.id === INDIA_EMERGENCY_PAYLOAD_ID);
  assert.ok(payload);
  assert.equal(payload.primaryAction.kind, 'call_emergency_number');
  if (payload.primaryAction.kind !== 'call_emergency_number') return;
  assert.equal(payload.primaryAction.number, '112');
  assert.equal(payload.primaryAction.countryCode, 'IN');
  assert.doesNotMatch(payload.guidance, /notified|alerted|on the way|dispatched/i);
});

test('a cleared trigger makes dependent screens non-live', () => {
  let { session } = setup('upper-abdominal-pain');
  session = answerRouting(session, 'upper-abdominal-pain-exertional', 'no', 1);
  const result = decide(session, []);
  assert.equal(result.status, 'question');
  assert.deepEqual(result.safetyState.liveQuestionIds, ['upper-abdominal-pain-exertional']);
});

test('non-live owned answers are removed from current safety evaluation', () => {
  let { session } = setup('joint-musculoskeletal-pain');
  session = answerRouting(session, 'joint-musculoskeletal-pain-injury', 'no', 1);
  const stale = safetyAnswer('safety-joint-injury-severe-or-displaced', 'yes', 2);
  const state = evaluateSafetyState(
    { complaintId: session.presentingComplaintId, routingAnswers: session.answers, safetyAnswers: [stale] },
    R3_SAFETY_KNOWLEDGE,
  );
  assert.deepEqual(state.firedRuleIds, []);
  assert.deepEqual(state.retainedSafetyAnswers, []);
  assert.deepEqual(state.removedSafetyAnswers, [stale]);
});

test('multiple real breathing rules retain every id and select emergency precedence once', () => {
  const { session } = setup('shortness-of-breath');
  const result = decide(session, [
    safetyAnswer('safety-shortness-of-breath-severe', 'yes', 1),
    safetyAnswer('safety-shortness-of-breath-pale-blue-grey', 'yes', 2),
    safetyAnswer('safety-shortness-of-breath-coughing-blood', 'yes', 3),
  ]);
  assert.equal(result.status, 'interrupted');
  if (result.status !== 'interrupted') return;
  assert.deepEqual(result.firedRuleIds, [
    'breathing-severe-inability-to-speak',
    'breathing-pale-blue-grey-skin',
    'breathing-coughing-blood',
  ]);
  assert.equal(result.selectedRuleId, 'breathing-severe-inability-to-speak');
  assert.equal(result.severity, 'emergency');
  assert.equal(result.payload.id, INDIA_EMERGENCY_PAYLOAD_ID);
});

test('safety behavior does not depend on Bayesian belief thresholds', () => {
  const base = setup('shortness-of-breath').session;
  const highCardiology: Belief = {
    cardiology: 0.95,
    pulmonology: 0.01,
    neurology: 0.01,
    gastroenterology: 0.01,
    orthopedics: 0.01,
    dermatology: 0.01,
  };
  const highDermatology: Belief = {
    cardiology: 0.01,
    pulmonology: 0.01,
    neurology: 0.01,
    gastroenterology: 0.01,
    orthopedics: 0.01,
    dermatology: 0.95,
  };
  const answers = [safetyAnswer('safety-shortness-of-breath-severe', 'yes')];
  const first = decide({ ...base, belief: highCardiology }, answers);
  const second = decide({ ...base, belief: highDermatology }, answers);
  assert.equal(first.status, 'interrupted');
  assert.equal(second.status, 'interrupted');
  assert.deepEqual(first.safetyState.firedRuleIds, second.safetyState.firedRuleIds);
});

test('recordSafetyAnswer is immutable and updates an existing answer by question id', () => {
  const { session } = setup('shortness-of-breath');
  const result = decide(session, []);
  assert.equal(result.status, 'safety-screening');
  if (result.status !== 'safety-screening') return;
  const original: SafetyAnswer[] = [];
  const yes = recordSafetyAnswer(original, result.question, safetyAnswer(result.question.id, 'yes'));
  const no = recordSafetyAnswer(yes, result.question, safetyAnswer(result.question.id, 'no', 2));
  assert.deepEqual(original, []);
  assert.equal(yes[0].optionId, 'yes');
  assert.equal(no[0].optionId, 'no');
});

test('routing-owned safety questions cannot be recorded in the separate safety history', () => {
  const { session } = setup('upper-abdominal-pain');
  const result = decide(session, []);
  assert.equal(result.status, 'safety-screening');
  if (result.status !== 'safety-screening') return;
  assert.throws(() => recordSafetyAnswer([], result.question, safetyAnswer(result.question.id, 'yes')), /routing session/);
});

test('interruption audit events preserve fired rules, payload, versions, and provenance', () => {
  const { session } = setup('shortness-of-breath');
  const result = decide(session, [safetyAnswer('safety-shortness-of-breath-severe', 'yes')]);
  assert.equal(result.status, 'interrupted');
  if (result.status !== 'interrupted') return;
  const event = createSafetyInterruptionAuditEvent(result, {
    eventId: 'interrupt-1',
    timestamp: BASE_TIME,
    sessionReference: 'session-1',
  });
  assert.deepEqual(event.firedRuleIds, result.firedRuleIds);
  assert.equal(event.payloadId, result.payload.id);
  assert.equal(event.safetyVersion, SAFETY_VERSION);
  assert.ok(event.provenanceIds.length > 0);
});

test('screening audit history is additive and rejects duplicate event ids', () => {
  const { session } = setup('headache');
  const result = decide(session, []);
  assert.equal(result.status, 'safety-screening');
  if (result.status !== 'safety-screening') return;
  const event = createSafetyScreeningAuditEvent(result, {
    eventId: 'screen-1',
    timestamp: BASE_TIME,
    sessionReference: 'session-1',
  });
  const history = appendSafetyAuditEvent([], event);
  assert.equal(history.length, 1);
  assert.throws(() => appendSafetyAuditEvent(history, event), /Duplicate/);
});

test('staff override is an additive audit record and never enables automatic continuation', () => {
  const { session } = setup('shortness-of-breath');
  const result = decide(session, [safetyAnswer('safety-shortness-of-breath-severe', 'yes')]);
  assert.equal(result.status, 'interrupted');
  if (result.status !== 'interrupted') return;
  const override = createStaffOverrideAuditEvent(result, {
    eventId: 'override-1',
    timestamp: BASE_TIME,
    sessionReference: 'session-1',
    staffActorId: 'actor-from-future-auth-layer',
    overrideAction: 'request_continuation',
    reason: 'Documented staff decision for later governance review',
  });
  assert.deepEqual(override.firedRuleIds, result.firedRuleIds);
  assert.equal(override.originalContinuationPolicy, 'must_stop');
  assert.equal(override.automaticContinuationEnabled, false);
});

test('staff override validation rejects missing future actor identity or reason', () => {
  const { session } = setup('shortness-of-breath');
  const result = decide(session, [safetyAnswer('safety-shortness-of-breath-severe', 'yes')]);
  assert.equal(result.status, 'interrupted');
  if (result.status !== 'interrupted') return;
  assert.throws(() => createStaffOverrideAuditEvent(result, {
    eventId: 'override-1', timestamp: BASE_TIME, sessionReference: 'session-1',
    staffActorId: '', overrideAction: 'document_only', reason: 'Reason',
  }), /staffActorId/);
  assert.throws(() => createStaffOverrideAuditEvent(result, {
    eventId: 'override-2', timestamp: BASE_TIME, sessionReference: 'session-1',
    staffActorId: 'actor', overrideAction: 'document_only', reason: '',
  }), /reason/);
});

test('controller evaluation is deterministic and does not mutate inputs', () => {
  const { session } = setup('headache');
  const answers = [safetyAnswer('safety-headache-sudden-extremely-painful', 'no')];
  const input = {
    session,
    complaint: materialize(session),
    safetyAnswers: answers,
    safetyKnowledge: R3_SAFETY_KNOWLEDGE,
    engineConfig: DEMONSTRATION_ENGINE_CONFIG,
  };
  const before = {
    session: structuredClone(session),
    safetyAnswers: structuredClone(answers),
    safetyKnowledge: structuredClone(R3_SAFETY_KNOWLEDGE),
    engineConfig: structuredClone(DEMONSTRATION_ENGINE_CONFIG),
    complaintQuestions: input.complaint.questions.map((question) => ({
      id: question.id,
      text: question.text,
      options: structuredClone(question.options),
      ...(question.evidenceDimension ? { evidenceDimension: question.evidenceDimension } : {}),
      appliesWhen: question.appliesWhen,
    })),
  };
  assert.deepEqual(evaluateSafetyController(input), evaluateSafetyController(input));
  assert.deepEqual(input.session, before.session);
  assert.deepEqual(input.safetyAnswers, before.safetyAnswers);
  assert.deepEqual(input.safetyKnowledge, before.safetyKnowledge);
  assert.deepEqual(input.engineConfig, before.engineConfig);
  assert.deepEqual(input.complaint.questions, before.complaintQuestions);
});

test('changing an earlier answer clears current dependent safety state while audit history remains', () => {
  const result = runReplaySafetyRegression();
  const final = result.decisions.at(-1);
  assert.equal(result.finalStatus, 'question');
  assert.deepEqual(final?.firedRuleIds, []);
  assert.deepEqual(final?.liveQuestionIds, ['upper-abdominal-pain-exertional']);
  assert.equal(result.auditHistory.length, 3);
  assert.ok(result.auditHistory.every((event) => event.kind === 'safety_screening_presented'));
});

test('all required safety regressions are deterministic and reach expected outcomes', () => {
  const first = runAllSafetyRegressions();
  const second = runAllSafetyRegressions();
  assert.deepEqual(first, second);
  assert.deepEqual(first.map((result) => result.finalStatus), ['interrupted', 'interrupted', 'interrupted', 'result', 'question']);
  assert.equal(first[3].finalRoutingSpecialty, 'orthopedics');
});

test('versions remain independent and frozen R1/R2 values are unchanged', () => {
  assert.equal(ENGINE_VERSION, '1.0.0-r1');
  assert.equal(KNOWLEDGE_VERSION, '0.3.0-r2b-demonstration');
  // Bumped with the dental spreading-swelling check (questionnaire intelligence pass, PENDING CLINICAL REVIEW).
  assert.equal(SAFETY_VERSION, '0.4.0-r3-safety-demonstration');
  assert.notEqual(SAFETY_VERSION, ENGINE_VERSION);
  assert.notEqual(SAFETY_VERSION, KNOWLEDGE_VERSION);
});

test('validation reports duplicate ids, invalid references, cycles, and payload mismatches explicitly', () => {
  const duplicate: SafetyKnowledgeBase = {
    ...structuredClone(R3_SAFETY_KNOWLEDGE),
    rules: R3_RED_FLAG_RULES.map((rule, index) => index === 1 ? { ...rule, id: R3_RED_FLAG_RULES[0].id } : rule),
  };
  const badReference: SafetyKnowledgeBase = {
    ...structuredClone(R3_SAFETY_KNOWLEDGE),
    rules: R3_RED_FLAG_RULES.map((rule, index) => index === 0 ? {
      ...rule,
      requiredQuestionIds: ['missing-question'],
      predicate: { kind: 'answer_equals' as const, questionId: 'missing-question', optionId: 'yes' },
    } : rule),
  };
  const firstOwnedId = R3_SAFETY_QUESTIONS.find((question) => question.kind === 'safety_owned')?.id;
  assert.ok(firstOwnedId);
  const cycle: SafetyKnowledgeBase = {
    ...structuredClone(R3_SAFETY_KNOWLEDGE),
    questions: R3_SAFETY_QUESTIONS.map((question) => question.id === firstOwnedId ? {
      ...question,
      liveWhen: { kind: 'answer_equals' as const, questionId: firstOwnedId, optionId: 'yes' },
      priority: { ...question.priority, dependencyRank: 1 },
    } : question),
  };
  const mismatch: SafetyKnowledgeBase = {
    ...structuredClone(R3_SAFETY_KNOWLEDGE),
    rules: R3_RED_FLAG_RULES.map((rule, index) => index === 0 ? { ...rule, severity: 'urgent' as const } : rule),
  };
  assert.ok(validateSafetyKnowledge(duplicate, R2B_DEMONSTRATION_KNOWLEDGE).errors.some((error) => error.code === 'DUPLICATE_RULE_ID'));
  assert.ok(validateSafetyKnowledge(badReference, R2B_DEMONSTRATION_KNOWLEDGE).errors.some((error) => error.code === 'UNKNOWN_CONDITION_QUESTION'));
  assert.ok(validateSafetyKnowledge(cycle, R2B_DEMONSTRATION_KNOWLEDGE).errors.some((error) => error.code === 'QUESTION_DEPENDENCY_CYCLE'));
  assert.ok(validateSafetyKnowledge(mismatch, R2B_DEMONSTRATION_KNOWLEDGE).errors.some((error) => error.code === 'RULE_PAYLOAD_MISMATCH'));
});

test('patient-facing safety text is calm, actionable, and non-diagnostic', () => {
  const text = [
    ...R3_SAFETY_QUESTIONS.flatMap((question) => question.kind === 'safety_owned'
      ? [question.text, ...question.options.map((option) => option.label)]
      : []),
    ...R3_SAFETY_KNOWLEDGE.payloads.flatMap((payload) => [
      payload.headline,
      payload.guidance,
      payload.primaryAction.label,
      payload.secondaryAction?.label ?? '',
    ]),
  ].join('\n');
  assert.doesNotMatch(text, /you have|this means you have|likely heart attack|likely stroke|diagnosis|probability of emergency disease/i);
  assert.doesNotMatch(text, /doctor has been notified|hospital has been alerted|ambulance is on the way|emergency team is ready/i);
});

test('R3 runtime source has no UI, storage, backend, network, timer, or random dependency', () => {
  const directory = new URL('../', import.meta.url);
  const runtimeFiles = readdirSync(directory)
    .filter((name) => name.endsWith('.ts'))
    .filter((name) => !name.endsWith('.test.ts'));
  const source = runtimeFiles.map((name) => readFileSync(new URL(name, directory), 'utf8')).join('\n');
  assert.doesNotMatch(source, /from\s+['"](?:react|react-dom|zustand|@supabase\/|axios)/i);
  assert.doesNotMatch(source, /\b(?:window|document|localStorage|sessionStorage|fetch|XMLHttpRequest|WebSocket|EventSource|setTimeout|setInterval|Math\.random|Date\.now|eval)\b/);
});
