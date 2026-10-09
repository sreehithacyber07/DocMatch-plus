/**
 * Evidence sufficiency: a numerical lead or a met criteria set is concluded
 * only when it is supported and differentiated (PENDING CLINICAL REVIEW,
 * docs/clinical-expansion).
 *
 * Two layers, both separate from the numerical score:
 *   - R1: a lead must meet both thresholds and rest on enough positively
 *     supporting findings across independent clinical dimensions.
 *   - Gate: a met narrower direction is not concluded while one of its own
 *     exclusions, or a competing narrower service's criteria, can still be
 *     asked within the discrimination allowance.
 * Safety is unaffected: a hard stop still overrides everything.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  evidenceSupport,
  shouldStop,
  type Belief,
  type EngineConfig,
  type Question,
  type RecordedAnswer,
} from '../../engine/index.ts';
import { DEMONSTRATION_ENGINE_CONFIG } from '../../engine/data/index.ts';
import { evaluateDirectionGate } from '../routing-flow/direction-gate.ts';
import { MAX_DISCRIMINATION_EXTENSION, shouldContinueDiscrimination, EMPTY_BUDGET } from '../routing-flow/discrimination.ts';
import { intakePlanFor } from '../routing-flow/intake-questions.ts';
import { contextFor, walkAssessment } from './clinical-walk.ts';
import { runInterview } from './interview-driver.ts';

/* --- R1: support, not just numbers ----------------------------------------- */

function belief(top: number): Belief {
  const rest = (1 - top) / 5;
  return { cardiology: top, pulmonology: rest, neurology: rest, gastroenterology: rest, orthopedics: rest, dermatology: rest };
}
function likelihoods(cardiology: number, other = 0.4): Belief {
  return { cardiology, pulmonology: other, neurology: other, gastroenterology: other, orthopedics: other, dermatology: other };
}
function question(id: string, evidenceDimension: string, yes = 0.72): Question {
  return {
    id,
    text: id,
    evidenceDimension,
    options: [
      { id: 'yes', label: 'Yes', likelihoods: likelihoods(yes) },
      { id: 'no', label: 'No', likelihoods: likelihoods(1 - yes, 0.6) },
    ],
  };
}
const said = (...pairs: [string, string][]): RecordedAnswer[] =>
  pairs.map(([questionId, optionId]) => ({ questionId, optionId, answeredAt: '' }));

const RULES: EngineConfig = {
  posteriorFloor: 0.02,
  topProbabilityThreshold: 0.72,
  marginThreshold: 0.35,
  maxQuestions: 6,
  sufficiency: { requireAllConditions: true, minimumSupportingFindings: 3, minimumIndependentDimensions: 2 },
};

test('correlated answers in one dimension count once towards independent support', () => {
  const questions = [question('a', 'trigger'), question('b', 'trigger'), question('c', 'trigger'), question('d', 'sign')];
  const sameDimension = evidenceSupport(said(['a', 'yes'], ['b', 'yes'], ['c', 'yes']), questions, 'cardiology', 'pulmonology');
  assert.deepEqual(sameDimension, { supportingFindings: 3, independentDimensions: 1 });
  const twoDimensions = evidenceSupport(said(['a', 'yes'], ['b', 'yes'], ['d', 'yes']), questions, 'cardiology', 'pulmonology');
  assert.deepEqual(twoDimensions, { supportingFindings: 3, independentDimensions: 2 });
  // A "no" lowers a competitor but is not a feature of the leader.
  const negatives = evidenceSupport(said(['a', 'no'], ['d', 'no']), questions, 'cardiology', 'pulmonology');
  assert.equal(negatives.supportingFindings, 0);
});

test('a strong number without sufficient support does not end the interview as a convergence', () => {
  const questions = [question('a', 'trigger'), question('b', 'trigger'), question('c', 'trigger'), question('d', 'sign')];
  const strong = belief(0.8);
  const thin = shouldStop(strong, 3, RULES, { answers: said(['a', 'yes'], ['b', 'yes'], ['c', 'yes']), questions });
  assert.equal(thin.shouldStop, false, 'one dimension is not enough');
  assert.equal(thin.convergedWithoutSufficientEvidence, true);
  assert.deepEqual(thin.triggeredConditions, []);
  const supported = shouldStop(strong, 3, RULES, { answers: said(['a', 'yes'], ['b', 'yes'], ['d', 'yes']), questions });
  assert.equal(supported.shouldStop, true);
  assert.deepEqual(supported.triggeredConditions, ['top_probability', 'margin']);
  // The question limit still ends a run, without a convergence.
  const limit = shouldStop(strong, 6, RULES, { answers: said(['a', 'yes']), questions });
  assert.deepEqual(limit.triggeredConditions, ['max_questions']);
});

test('a margin alone no longer converges when both conditions are required', () => {
  // Leader 0.6, runner-up 0.08: margin met, top probability not.
  const marginOnly: Belief = { cardiology: 0.6, pulmonology: 0.08, neurology: 0.08, gastroenterology: 0.08, orthopedics: 0.08, dermatology: 0.08 };
  const questions = [question('a', 'trigger'), question('b', 'character'), question('c', 'sign')];
  const answers = said(['a', 'yes'], ['b', 'yes'], ['c', 'yes']);
  assert.equal(shouldStop(marginOnly, 3, RULES, { answers, questions }).shouldStop, false);
  // The original rule, without sufficiency, still stops on the margin: callers that opt out are unchanged.
  const original: EngineConfig = { ...RULES, sufficiency: undefined };
  assert.equal(shouldStop(marginOnly, 3, original).shouldStop, true);
});

test('the demonstration config asks the whole approved set before a count can end the interview', () => {
  assert.equal(DEMONSTRATION_ENGINE_CONFIG.maxQuestions, 6);
  // Two correlated dyspeptic answers used to end the interview after two questions.
  const { controller, state } = runInterview('upper-abdominal-pain', {
    'upper-abdominal-pain-meal-relation': 'yes',
    'upper-abdominal-pain-burning': 'yes',
  }, 'no');
  assert.equal(controller.status, 'result');
  assert.ok(state.session.answers.length >= 4, `asked ${state.session.answers.length} routing questions`);
});

/* --- Gate: differentiate before concluding --------------------------------- */

const CHEST_BREATHING = { region: 'chest', concern: 'breathing', age: 45, sex: 'male' } as const;
const CARDIAC = {
  'intake-history-symptom-character': 'tight',
  'intake-history-duration': 'under-hour',
  'shortness-of-breath-ankle-swelling': 'yes',
  'shortness-of-breath-lying-flat': 'yes',
  'shortness-of-breath-wheeze': 'no',
  'shortness-of-breath-palpitations': 'yes',
} as const;

test('a met Cardiology pattern asks the competing respiratory criteria before it is concluded', () => {
  const walk = walkAssessment(contextFor(CHEST_BREATHING), {
    ...CARDIAC,
    'intake-breathing-infections': 'no',
    'intake-breathing-phlegm': 'no',
  });
  assert.equal(walk.route?.registryId, 'cardiology');
  assert.equal(walk.route?.basis, 'source-backed-criteria');
  const asked = walk.steps.map((step) => step.questionId);
  assert.ok(asked.includes('intake-breathing-infections'), 'the respiratory competitor was asked');
  assert.ok(walk.counts.discrimination <= MAX_DISCRIMINATION_EXTENSION);
});

test('when the competing service is met too, the result is genuine ambiguity, not a winner', () => {
  const walk = walkAssessment(contextFor(CHEST_BREATHING), {
    ...CARDIAC,
    'intake-breathing-infections': 'yes',
    'intake-breathing-phlegm': 'yes',
  });
  assert.equal(walk.route?.registryId, 'general-medicine');
  assert.equal(walk.route?.fallbackReason, 'TRUE_MULTISYSTEM_AMBIGUITY');
});

test('a supported direction names its unanswered exclusions and competitors, and nothing once they are answered', () => {
  const context = contextFor(CHEST_BREATHING);
  const intake = [
    { questionId: 'intake-history-symptom-character', optionId: 'tight', answeredAt: '' },
  ];
  const routing = [
    { questionId: 'shortness-of-breath-ankle-swelling', optionId: 'yes' },
    { questionId: 'shortness-of-breath-lying-flat', optionId: 'yes' },
  ];
  const open = evaluateDirectionGate(context, intake, routing);
  assert.equal(open.status, 'supported');
  assert.equal(open.direction?.directionId, 'cardiology');
  assert.ok(open.differentiationQuestionIds.includes('intake-breathing-infections'), open.differentiationQuestionIds.join(','));
  const closed = evaluateDirectionGate(context, [
    ...intake,
    { questionId: 'intake-breathing-infections', optionId: 'no', answeredAt: '' },
    { questionId: 'intake-breathing-phlegm', optionId: 'no', answeredAt: '' },
  ], routing);
  assert.equal(closed.status, 'supported');
  assert.deepEqual([...closed.differentiationQuestionIds].filter((id) => id.startsWith('intake-breathing-')), []);
});

test('differentiation is bounded by the allowance and never outranks a hard stop', () => {
  const context = contextFor(CHEST_BREATHING);
  const plan = intakePlanFor(context.complaintId, context);
  const eligibleQuestions = [...plan.preScreen, ...plan.postScreen];
  const intakeAnswers = [{ questionId: 'intake-history-symptom-character', optionId: 'tight', answeredAt: '' }];
  const routingAnswers = [
    { questionId: 'shortness-of-breath-ankle-swelling', optionId: 'yes' },
    { questionId: 'shortness-of-breath-lying-flat', optionId: 'yes' },
  ];
  const fresh = shouldContinueDiscrimination({ context, intakeAnswers, routingAnswers, eligibleQuestions, budget: EMPTY_BUDGET, hardStop: false });
  assert.equal(fresh.shouldContinue, true);
  assert.ok(fresh.remainingDiscriminatorIds.length > 0);
  const spent = shouldContinueDiscrimination({
    context, intakeAnswers, routingAnswers, eligibleQuestions,
    budget: { ...EMPTY_BUDGET, discriminationQuestionCount: MAX_DISCRIMINATION_EXTENSION },
    hardStop: false,
  });
  assert.equal(spent.shouldContinue, false);
  assert.equal(spent.stopCondition, 'SPECIALTY_SUFFICIENT', 'the met direction stands once the allowance is spent');
  const hardStop = shouldContinueDiscrimination({ context, intakeAnswers, routingAnswers, eligibleQuestions, budget: EMPTY_BUDGET, hardStop: true });
  assert.equal(hardStop.stopCondition, 'HARD_STOP');
});
