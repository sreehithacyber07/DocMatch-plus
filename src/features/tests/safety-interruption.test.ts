/**
 * The safety interruption contract.
 *
 *   ROUTINE        a safety question answered no: the questionnaire goes on.
 *   URGENT_REVIEW  a continuable rule fired (one or several): the questionnaire
 *                  goes on to a clinical direction, and the result carries the
 *                  urgency. Routing is never paused for it.
 *   HARD_STOP      only a source-backed must-stop rule, satisfied by the exact
 *                  evidence it names, leaves the questionnaire.
 *
 * There is no count: several urgent findings stay urgent, and one hard-stop
 * sign is a hard stop because its source says so, not because of a tally.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { BODY_DOMAIN } from '../../body/index.ts';
import { R3_RED_FLAG_RULES, R3_SAFETY_QUESTIONS } from '../../engine/safety/index.ts';
import type { SafetyCondition } from '../../engine/safety/index.ts';
import { concernOptionsFor } from '../body-explorer/clinical-coverage.ts';
import { FACE_HIT_REGIONS } from '../body-explorer/faceHitMap.ts';
import { canonicalOutcomeOf } from '../routing-flow/clinical-replay.ts';
import { contextFor, walkAssessment, type ContextSpec } from './clinical-walk.ts';
import { SAFETY_TRACES } from './parity-fixtures.ts';

const MUST_STOP = new Set(R3_RED_FLAG_RULES.filter((rule) => rule.continuationPolicy === 'must_stop').map((rule) => rule.id));
const URGENT_QUESTIONS = new Set(
  R3_RED_FLAG_RULES.filter((rule) => rule.continuationPolicy !== 'must_stop').flatMap((rule) => rule.requiredQuestionIds),
);
const STOP_QUESTIONS = new Set(R3_RED_FLAG_RULES.filter((rule) => MUST_STOP.has(rule.id)).flatMap((rule) => rule.requiredQuestionIds));

test('the nine safety scenarios: urgent findings continue to a direction; only validated hard stops interrupt', () => {
  assert.equal(SAFETY_TRACES.length, 9);
  for (const trace of SAFETY_TRACES) {
    const walk = walkAssessment(contextFor(trace.spec), trace.script);
    const outcome = canonicalOutcomeOf(walk.run);
    if (trace.expect.surface === 'result') {
      assert.equal(walk.outcome, 'result', `${trace.id} left the questionnaire`);
      assert.equal(outcome.status, 'route', trace.id);
      assert.equal(outcome.specialtyId, trace.expect.specialtyId, trace.id);
      assert.deepEqual([...outcome.urgentRuleIds], [...(trace.expect.urgentRuleIds ?? [])].sort(), trace.id);
      assert.equal(outcome.urgency, 'urgent', `${trace.id}: urgency lost`);
      // The questionnaire carried on after the urgent answer rather than stopping on it.
      const urgentIndex = walk.steps.findIndex((step) => URGENT_QUESTIONS.has(step.questionId) && step.answer === 'yes');
      assert.ok(urgentIndex >= 0, trace.id);
    } else {
      assert.equal(walk.outcome, 'interrupted', trace.id);
      assert.equal(walk.interruptedRuleId, trace.expect.hardStopRuleId, trace.id);
      assert.ok(MUST_STOP.has(walk.interruptedRuleId!), `${trace.id}: interrupted by a rule that is not must-stop`);
      // Nothing is asked after the answer that satisfied the hard stop.
      assert.equal(walk.steps.at(-1)!.answer, 'yes', trace.id);
      assert.ok(STOP_QUESTIONS.has(walk.steps.at(-1)!.questionId), trace.id);
    }
  }
});

test('no urgent answer ever leaves the questionnaire, however many are positive', () => {
  let contexts = 0;
  for (const region of BODY_DOMAIN.regions) {
    const faces = region.id === 'face' ? FACE_HIT_REGIONS.map((face) => face.id) : [null];
    for (const face of faces) {
      for (const age of [0, 3, 8, 15, 34, 70]) {
        for (const sex of ['female', 'male'] as const) {
          for (const concern of concernOptionsFor(region.id, face, { age, sexForAssessment: sex })) {
            const spec: ContextSpec = { region: region.id, face, concern: concern.id, age, sex };
            // Every urgent-but-continuable safety question answered yes; every hard-stop question answered no.
            const walk = walkAssessment(contextFor(spec), {}, 60, (questionId, _options, kind) => {
              if (kind !== 'safety') return undefined;
              return URGENT_QUESTIONS.has(questionId) ? 'yes' : 'no';
            });
            const where = `${region.id}/${face ?? '-'}/${concern.id} age ${age} ${sex}`;
            assert.notEqual(walk.outcome, 'interrupted', `${where}: an urgent finding interrupted (${walk.interruptedRuleId})`);
            assert.equal(walk.outcome, 'result', where);
            const outcome = canonicalOutcomeOf(walk.run);
            assert.ok(outcome.specialtyId, `${where}: urgency erased the direction`);
            contexts += 1;
          }
        }
      }
    }
  }
  assert.ok(contexts > 1500);
  // Several urgent findings at once are exercised explicitly by S2 above.
});

test('a hard-stop question answered no never interrupts, and urgency is never lost to a later no', () => {
  const walk = walkAssessment(contextFor({ region: 'lower-abdomen', concern: 'bowel-change', age: 8, sex: 'male' }), {
    'intake-lower-bowel-detail': 'blood',
    'safety-rectal-bleeding-urgent': 'yes',
    'safety-rectal-bleeding-heavy': 'no',
    'safety-pediatric-abdominal-emergency': 'no',
  });
  assert.equal(walk.outcome, 'result');
  assert.ok(walk.urgentRuleIds.includes('rectal-bleeding-urgent'));
  const outcome = canonicalOutcomeOf(walk.run);
  assert.equal(outcome.urgency, 'urgent');
});

function kinds(condition: SafetyCondition, out = new Set<string>()): Set<string> {
  const node = condition as { kind: string; conditions?: readonly SafetyCondition[] };
  out.add(node.kind);
  for (const child of node.conditions ?? []) kinds(child, out);
  return out;
}

test('hard stops are specific: no count logic, no catch-all, and every stop names its exact sign', () => {
  const flow = readFileSync(new URL('../routing-flow/RoutingFlow.tsx', import.meta.url), 'utf8');
  for (const rule of R3_RED_FLAG_RULES) {
    // Named answers combined with all/any: nothing counts yes answers.
    for (const kind of kinds(rule.predicate)) assert.ok(['all', 'any', 'answer_equals'].includes(kind), `${rule.id} uses ${kind}`);
    // Every rule has its own exact indicator, so the screen never falls back to a generic label.
    assert.ok(flow.includes(`'${rule.id}':`), `${rule.id} has no exact indicator label`);
  }
  // The combined "general danger sign" catch-all is gone: each paediatric danger sign is its own rule and question.
  assert.ok(!R3_RED_FLAG_RULES.some((rule) => rule.id === 'pediatric-under-five-danger-sign' || rule.id === 'pediatric-older-danger-sign'));
  assert.doesNotMatch(flow, /general danger sign/i);
  for (const id of ['pediatric-struggling-to-breathe', 'pediatric-seizure-or-unresponsive', 'pediatric-unable-to-drink-or-vomits-everything']) {
    const rule = R3_RED_FLAG_RULES.find((candidate) => candidate.id === id);
    assert.ok(rule, id);
    assert.equal(rule.requiredQuestionIds.length, 1, `${id} reads more than one question`);
    assert.equal(rule.continuationPolicy, 'must_stop');
  }
  // The broad wordings that made a single ordinary yes a hard stop are gone.
  const text = (id: string) => {
    const question = R3_SAFETY_QUESTIONS.find((candidate) => candidate.id === id) as { text: string; caregiverText?: string };
    return `${question.text} ${question.caregiverText ?? ''}`;
  };
  assert.doesNotMatch(text('safety-pediatric-unresponsive-or-seizure'), /unusually drowsy|confused/i);
  assert.doesNotMatch(text('safety-infant-serious-illness'), /much less active|felt very hot|high temperature\?/i);
  assert.match(text('safety-infant-serious-illness'), /38°C/);
});
