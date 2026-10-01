/// <reference types="node" />

import assert from 'node:assert/strict';
import test from 'node:test';
import { updateBelief } from '../belief.ts';
import { ENGINE_VERSION, validateEngineConfig } from '../config.ts';
import { entropy } from '../entropy.ts';
import { explain } from '../explanation.ts';
import {
  SYNTHETIC_BRANCH_QUESTION,
  SYNTHETIC_ENGINE_CONFIG,
  SYNTHETIC_INITIAL_BELIEF,
  SYNTHETIC_QUESTION_BANK,
  syntheticBelief,
} from '../fixtures/synthetic.ts';
import { expectedEntropyAfter, informationGain, selectNextQuestion } from '../questions.ts';
import { changeRecordedAnswer, replayBelief } from '../replay.ts';
import { answerSessionQuestion, createRoutingSession } from '../session.ts';
import { SPECIALTY_IDS } from '../specialties.ts';
import { shouldStop } from '../stopping.ts';
import type { AnswerOption, Belief, EngineConfig, Question, RecordedAnswer } from '../types.ts';
import { validateBelief, validateQuestionBank } from '../validation.ts';

const TEST_TIME = '2026-01-01T00:00:00.000Z';
const NEXT_TEST_TIME = '2026-01-01T00:01:00.000Z';

function total(belief: Belief): number {
  return SPECIALTY_IDS.reduce((sum, specialtyId) => sum + belief[specialtyId], 0);
}

function assertNormalizedFinite(belief: Belief): void {
  assert.ok(Math.abs(total(belief) - 1) < 1e-12);
  for (const specialtyId of SPECIALTY_IDS) assert.ok(Number.isFinite(belief[specialtyId]));
}

function binaryQuestion(id: string, first: Belief, appliesWhen?: Question['appliesWhen']): Question {
  const second = syntheticBelief([
    1 - first[SPECIALTY_IDS[0]],
    1 - first[SPECIALTY_IDS[1]],
    1 - first[SPECIALTY_IDS[2]],
    1 - first[SPECIALTY_IDS[3]],
    1 - first[SPECIALTY_IDS[4]],
    1 - first[SPECIALTY_IDS[5]],
  ]);
  return {
    id,
    text: `Synthetic ${id}`,
    appliesWhen,
    options: [
      { id: `${id}-first`, label: 'Synthetic first', likelihoods: first },
      { id: `${id}-second`, label: 'Synthetic second', likelihoods: second },
    ],
  };
}

test('updateBelief matches a hand-computed two-mass posterior', () => {
  const prior = syntheticBelief([0.5, 0.5, 0, 0, 0, 0]);
  const option: AnswerOption = {
    id: 'synthetic-hand-option',
    label: 'Synthetic hand option',
    likelihoods: syntheticBelief([0.75, 0.25, 0.5, 0.5, 0.5, 0.5]),
  };
  const posterior = updateBelief(prior, option, 0);
  assert.equal(posterior[SPECIALTY_IDS[0]], 0.75);
  assert.equal(posterior[SPECIALTY_IDS[1]], 0.25);
  for (const specialtyId of SPECIALTY_IDS.slice(2)) assert.equal(posterior[specialtyId], 0);
});

test('updateBelief applies a true normalized posterior floor', () => {
  const option: AnswerOption = {
    id: 'synthetic-floor-option',
    label: 'Synthetic floor option',
    likelihoods: syntheticBelief([1, 0, 0, 0, 0, 0]),
  };
  const posterior = updateBelief(SYNTHETIC_INITIAL_BELIEF, option, 0.02);
  assert.equal(posterior[SPECIALTY_IDS[0]], 0.9);
  for (const specialtyId of SPECIALTY_IDS.slice(1)) assert.equal(posterior[specialtyId], 0.02);
  assertNormalizedFinite(posterior);
});

test('updateBelief is deterministic and does not mutate inputs', () => {
  const prior = { ...SYNTHETIC_INITIAL_BELIEF };
  const option = structuredClone(SYNTHETIC_QUESTION_BANK[0].options[0]);
  const priorBefore = structuredClone(prior);
  const optionBefore = structuredClone(option);
  assert.deepEqual(updateBelief(prior, option), updateBelief(prior, option));
  assert.deepEqual(prior, priorBefore);
  assert.deepEqual(option, optionBefore);
});

test('updateBelief rejects an impossible all-zero update', () => {
  const option: AnswerOption = {
    id: 'synthetic-zero-option',
    label: 'Synthetic zero option',
    likelihoods: syntheticBelief([0, 0, 0, 0, 0, 0]),
  };
  assert.throws(() => updateBelief(SYNTHETIC_INITIAL_BELIEF, option), /Cannot normalize/);
});

test('belief validation rejects distributions that do not sum to one', () => {
  assert.throws(() => validateBelief(syntheticBelief([0.2, 0.2, 0.2, 0.2, 0.2, 0.2])), /normalize to 1/);
});

test('answer validation rejects a missing specialty likelihood', () => {
  const malformed = {
    id: 'synthetic-missing',
    label: 'Synthetic missing',
    likelihoods: Object.fromEntries(SPECIALTY_IDS.slice(0, 5).map((id) => [id, 0.5])),
  } as unknown as AnswerOption;
  assert.throws(() => updateBelief(SYNTHETIC_INITIAL_BELIEF, malformed), /missing likelihood/);
});

test('entropy of a uniform six-way belief equals log2(6)', () => {
  assert.ok(Math.abs(entropy(SYNTHETIC_INITIAL_BELIEF) - Math.log2(6)) < 1e-12);
});

test('entropy of a degenerate normalized belief is zero', () => {
  assert.equal(entropy(syntheticBelief([1, 0, 0, 0, 0, 0])), 0);
});

test('entropy is non-negative and finite for a valid belief', () => {
  const value = entropy(syntheticBelief([0.4, 0.2, 0.15, 0.1, 0.1, 0.05]));
  assert.ok(value >= 0);
  assert.ok(Number.isFinite(value));
});

test('expected entropy matches a hand-computed binary result', () => {
  const prior = syntheticBelief([0.5, 0.5, 0, 0, 0, 0]);
  const question = binaryQuestion('synthetic-hand-entropy', syntheticBelief([0.75, 0.25, 0.5, 0.5, 0.5, 0.5]));
  const expected = -(0.75 * Math.log2(0.75) + 0.25 * Math.log2(0.25));
  assert.ok(Math.abs(expectedEntropyAfter(prior, question, 0) - expected) < 1e-12);
});

test('information gain equals current entropy minus expected entropy', () => {
  const question = SYNTHETIC_QUESTION_BANK[0];
  const expected = expectedEntropyAfter(SYNTHETIC_INITIAL_BELIEF, question);
  const gain = informationGain(SYNTHETIC_INITIAL_BELIEF, question);
  assert.ok(Number.isFinite(expected));
  assert.ok(Number.isFinite(gain));
  assert.ok(Math.abs(gain - (entropy(SYNTHETIC_INITIAL_BELIEF) - expected)) < 1e-12);
});

test('selectNextQuestion resolves ties by ascending id regardless of source order', () => {
  const likelihoods = syntheticBelief([0.7, 0.6, 0.5, 0.4, 0.3, 0.2]);
  const questionA = binaryQuestion('synthetic-tie-a', likelihoods);
  const questionB = binaryQuestion('synthetic-tie-b', likelihoods);
  assert.equal(selectNextQuestion(SYNTHETIC_INITIAL_BELIEF, [], [questionB, questionA])?.questionId, questionA.id);
  assert.equal(selectNextQuestion(SYNTHETIC_INITIAL_BELIEF, [], [questionA, questionB])?.questionId, questionA.id);
});

test('selectNextQuestion excludes asked and inapplicable questions', () => {
  const first = binaryQuestion('synthetic-asked', syntheticBelief([0.7, 0.6, 0.5, 0.4, 0.3, 0.2]));
  const blocked = binaryQuestion('synthetic-blocked', syntheticBelief([0.8, 0.6, 0.5, 0.4, 0.3, 0.1]), () => false);
  const eligible = binaryQuestion('synthetic-eligible', syntheticBelief([0.9, 0.6, 0.5, 0.4, 0.3, 0.1]), () => true);
  assert.equal(selectNextQuestion(SYNTHETIC_INITIAL_BELIEF, [first.id], [first, blocked, eligible])?.questionId, eligible.id);
});

test('question-bank validation rejects duplicate question and option ids', () => {
  const question = binaryQuestion('synthetic-duplicate', syntheticBelief([0.7, 0.6, 0.5, 0.4, 0.3, 0.2]));
  assert.throws(() => validateQuestionBank([question, question]), /duplicate question id/);
  const duplicateOption = { ...question, options: [question.options[0], question.options[0]] };
  assert.throws(() => validateQuestionBank([duplicateOption]), /duplicate option id/);
});

test('question-bank validation rejects conditional likelihoods that do not sum to one', () => {
  const question = binaryQuestion('synthetic-invalid-sum', syntheticBelief([0.7, 0.6, 0.5, 0.4, 0.3, 0.2]));
  question.options[1] = { ...question.options[1], likelihoods: syntheticBelief([0.4, 0.4, 0.5, 0.6, 0.7, 0.8]) };
  assert.throws(() => validateQuestionBank([question]), /must sum to 1/);
});

test('shouldStop reports the top-probability condition', () => {
  const config: EngineConfig = { posteriorFloor: 0.02, topProbabilityThreshold: 0.75, marginThreshold: 0.9, maxQuestions: 99 };
  const decision = shouldStop(syntheticBelief([0.8, 0.04, 0.04, 0.04, 0.04, 0.04]), 1, config);
  assert.equal(decision.reason, 'top_probability');
  assert.equal(decision.shouldStop, true);
});

test('shouldStop reports the margin condition', () => {
  const config: EngineConfig = { posteriorFloor: 0.02, topProbabilityThreshold: 0.9, marginThreshold: 0.35, maxQuestions: 99 };
  const decision = shouldStop(syntheticBelief([0.55, 0.15, 0.1, 0.08, 0.07, 0.05]), 1, config);
  assert.equal(decision.reason, 'margin');
});

test('shouldStop reports the maximum-question condition', () => {
  const config: EngineConfig = { posteriorFloor: 0.02, topProbabilityThreshold: 1, marginThreshold: 1, maxQuestions: 3 };
  const decision = shouldStop(SYNTHETIC_INITIAL_BELIEF, 3, config);
  assert.equal(decision.reason, 'max_questions');
});

test('stopping configuration validation rejects malformed values', () => {
  assert.throws(
    () => validateEngineConfig({ ...SYNTHETIC_ENGINE_CONFIG, posteriorFloor: 0.2 }),
    /posteriorFloor/,
  );
  assert.throws(
    () => validateEngineConfig({ ...SYNTHETIC_ENGINE_CONFIG, maxQuestions: 0 }),
    /maxQuestions/,
  );
});

test('explain returns per-answer deltas and globally sorted absolute effects', () => {
  const answers: RecordedAnswer[] = [
    { questionId: SYNTHETIC_QUESTION_BANK[0].id, optionId: 'signal-north', answeredAt: TEST_TIME },
    { questionId: SYNTHETIC_QUESTION_BANK[1].id, optionId: 'texture-a', answeredAt: NEXT_TEST_TIME },
  ];
  const replay = replayBelief(SYNTHETIC_INITIAL_BELIEF, answers, SYNTHETIC_QUESTION_BANK);
  const trace = explain(replay.history);
  assert.equal(trace.engineVersion, ENGINE_VERSION);
  assert.equal(trace.answers.length, 2);
  assert.equal(trace.answers[0].rankedEffects.length, SPECIALTY_IDS.length);
  for (let index = 1; index < trace.influentialEffects.length; index += 1) {
    assert.ok(trace.influentialEffects[index - 1].absoluteImpact >= trace.influentialEffects[index].absoluteImpact);
  }
});

test('routing session is JSON-serializable without information loss', () => {
  const session = createRoutingSession('synthetic-complaint', SYNTHETIC_INITIAL_BELIEF, TEST_TIME);
  assert.deepEqual(JSON.parse(JSON.stringify(session)), session);
  assert.equal(session.engineVersion, ENGINE_VERSION);
});

test('replay matches a clean sequential run and does not mutate history', () => {
  const answers: RecordedAnswer[] = [
    { questionId: SYNTHETIC_QUESTION_BANK[0].id, optionId: 'signal-north', answeredAt: TEST_TIME },
    { questionId: SYNTHETIC_QUESTION_BANK[1].id, optionId: 'texture-a', answeredAt: NEXT_TEST_TIME },
  ];
  const before = structuredClone(answers);
  const replay = replayBelief(SYNTHETIC_INITIAL_BELIEF, answers, SYNTHETIC_QUESTION_BANK);
  const first = updateBelief(SYNTHETIC_INITIAL_BELIEF, SYNTHETIC_QUESTION_BANK[0].options[0]);
  const second = updateBelief(first, SYNTHETIC_QUESTION_BANK[1].options[0]);
  assert.deepEqual(replay.belief, second);
  assert.deepEqual(answers, before);
  assertNormalizedFinite(replay.belief);
});

test('changing an earlier answer removes abandoned-branch effects during replay', () => {
  const bank = [SYNTHETIC_QUESTION_BANK[0], SYNTHETIC_BRANCH_QUESTION];
  const original: RecordedAnswer[] = [
    { questionId: bank[0].id, optionId: 'signal-north', answeredAt: TEST_TIME },
    { questionId: bank[1].id, optionId: 'branch-open', answeredAt: NEXT_TEST_TIME },
  ];
  const changed = changeRecordedAnswer(original, {
    questionId: bank[0].id,
    optionId: 'signal-south',
    answeredAt: NEXT_TEST_TIME,
  });
  const replay = replayBelief(SYNTHETIC_INITIAL_BELIEF, changed, bank);
  assert.deepEqual(replay.askedQuestionIds, [bank[0].id]);
  assert.deepEqual(replay.removedAnswers.map((answer) => answer.questionId), [bank[1].id]);
  assertNormalizedFinite(replay.belief);
});

test('answerSessionQuestion replays from the original prior when an answer changes', () => {
  let session = createRoutingSession('synthetic-complaint', SYNTHETIC_INITIAL_BELIEF, TEST_TIME);
  session = answerSessionQuestion(
    session,
    { questionId: SYNTHETIC_QUESTION_BANK[0].id, optionId: 'signal-north', answeredAt: TEST_TIME },
    SYNTHETIC_QUESTION_BANK,
  );
  session = answerSessionQuestion(
    session,
    { questionId: SYNTHETIC_QUESTION_BANK[0].id, optionId: 'signal-south', answeredAt: NEXT_TEST_TIME },
    SYNTHETIC_QUESTION_BANK,
  );
  const clean = updateBelief(SYNTHETIC_INITIAL_BELIEF, SYNTHETIC_QUESTION_BANK[0].options[1]);
  assert.deepEqual(session.belief, clean);
  assert.equal(session.answers.length, 1);
});
