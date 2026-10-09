/**
 * The questionnaire intelligence pass: Dentistry, Rheumatology, injury depth
 * and the dental emergency check (all PENDING CLINICAL REVIEW, see
 * docs/clinical-expansion).
 *
 * Each scenario walks the real interview. Safety stays first: an emergency
 * answer interrupts before any direction is shown.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { R3_RED_FLAG_RULES } from '../../engine/safety/index.ts';
import { DIRECTION_CRITERIA_SETS } from '../routing-flow/direction-gate.ts';
import { eligibleRouteDirections } from '../routing-flow/route-eligibility.ts';
import { SPECIALTY_REGISTRY } from '../routing-flow/specialty-registry.ts';
import { contextFor, walkAssessment, type Script } from './clinical-walk.ts';

const TOOTH = { region: 'face', face: 'mouth', concern: 'pain', age: 35, sex: 'female' } as const;
const JAW = { region: 'face', face: 'patient-left-jaw', concern: 'pain', age: 35, sex: 'female' } as const;
const HAND = { region: 'right-hand', concern: 'pain', age: 45, sex: 'female' } as const;
const KNEE = { region: 'left-knee', concern: 'pain', age: 65, sex: 'female' } as const;

const walk = (spec: Parameters<typeof contextFor>[0], script: Script) => walkAssessment(contextFor(spec), script);
const asked = (result: ReturnType<typeof walk>) => result.steps.map((step) => step.questionId);

/* --- A. Dentistry ---------------------------------------------------------- */

test('A1. tooth pain lasting more than 2 days, worse on biting, reaches Dental care on NHS criteria', () => {
  const result = walk(TOOTH, { 'intake-face-jaw-detail': 'tooth-gum', 'intake-history-duration': 'several-days', 'intake-face-tooth-features': 'bite' });
  assert.equal(result.route?.registryId, 'dentistry');
  assert.equal(result.route?.basis, 'source-backed-criteria');
  assert.deepEqual([...result.route!.gate!.direction!.satisfied.map((item) => item.criterionId)].toSorted(), ['dental-bite', 'dental-lasting']);
});

test('A2. one dental feature alone stays with the parent service', () => {
  const result = walk(TOOTH, { 'intake-face-jaw-detail': 'tooth-gum', 'intake-history-duration': 'today', 'intake-face-tooth-features': 'bite' });
  assert.equal(result.route?.registryId, 'general-medicine');
  assert.ok(result.route?.fallbackReason);
});

test('A3. jaw joint pain is not asked the tooth questions and never reaches Dental care', () => {
  const result = walk(JAW, { 'intake-face-jaw-detail': 'joint', 'intake-face-jaw-associated': 'ear' });
  assert.ok(!asked(result).includes('intake-face-tooth-features'));
  assert.notEqual(result.route?.registryId, 'dentistry');
});

test('A4. a mouth sore lasting weeks reads the mouth duration instead of asking again', () => {
  const result = walk({ region: 'face', face: 'mouth', concern: 'mouth-change', age: 35, sex: 'male' }, {
    'intake-face-mouth-detail': 'tooth-gum',
    'intake-face-mouth-duration': 'one-to-three-weeks',
    'intake-face-tooth-features': 'hot-cold',
  });
  assert.equal(result.route?.registryId, 'dentistry');
  const lasting = result.route!.gate!.direction!.satisfied.find((item) => item.criterionId === 'dental-lasting');
  assert.equal(lasting?.evidenceQuestionId, 'intake-face-mouth-duration');
  // The jaw branch's own duration answer is read the same way.
  const jaw = walk(TOOTH, { 'intake-face-jaw-detail': 'tooth-gum', 'intake-history-duration': 'longer', 'intake-face-tooth-features': 'gums' });
  assert.equal(jaw.route?.registryId, 'dentistry');
  assert.equal(jaw.route!.gate!.direction!.satisfied.find((item) => item.criterionId === 'dental-lasting')?.evidenceQuestionId, 'intake-history-duration');
});

test('A5. a child\'s sore, bleeding gums reach Dental care as a shared service', () => {
  const result = walk({ region: 'face', face: 'mouth', concern: 'mouth-change', age: 8, sex: 'male' }, {
    'intake-face-mouth-detail': 'tooth-gum',
    'intake-face-mouth-duration': 'one-to-three-weeks',
    'intake-face-tooth-features': 'gums+bite',
  });
  assert.equal(result.route?.registryId, 'dentistry');
});

/* --- B. The dental emergency check ---------------------------------------- */

test('B1. dental swelling spreading to the eye or neck interrupts before any direction', () => {
  const result = walk(JAW, {
    'intake-face-jaw-detail': 'tooth-gum',
    'intake-face-tooth-features': 'swelling',
    'safety-dental-spreading-swelling': 'yes',
  });
  assert.equal(result.outcome, 'interrupted');
  assert.equal(result.interruptedRuleId, 'dental-spreading-swelling');
  assert.equal(result.route, null);
  // A reported swelling brings the check forward: it is asked straight after.
  const ids = asked(result);
  assert.equal(ids[ids.indexOf('intake-face-tooth-features') + 1], 'safety-dental-spreading-swelling');
});

test('B2. the dental check is an emergency rule on the 112 payload, scoped to the mouth and jaw', () => {
  const rule = R3_RED_FLAG_RULES.find((candidate) => candidate.id === 'dental-spreading-swelling');
  assert.ok(rule);
  assert.equal(rule.severity, 'emergency');
  // The same Call 112 emergency payload as the airway check.
  const airway = R3_RED_FLAG_RULES.find((candidate) => candidate.id === 'throat-airway-danger');
  assert.equal(rule.payloadId, airway?.payloadId);
  // Phase 3: cheek pain from a tooth (face-general) is also a dental presentation.
  assert.deepEqual([...rule.applicableComplaintIds], ['face-oral-jaw-concern', 'face-general-concern']);
});

test('B3. the dental check is not asked of an unrelated complaint', () => {
  const result = walk(KNEE, { 'intake-msk-duration': 'under-one-week' });
  assert.ok(!asked(result).includes('safety-dental-spreading-swelling'));
});

/* --- C. Rheumatology ------------------------------------------------------- */

const RA: Script = {
  'intake-msk-duration': 'over-six-weeks',
  'joint-musculoskeletal-pain-injury': 'no',
  'joint-musculoskeletal-pain-swelling-bruising': 'yes',
  'intake-msk-mechanical': 'none',
};

test('C1. swollen small joints on both sides, without an injury, reach Rheumatology on NICE NG100', () => {
  const result = walk(HAND, { ...RA, 'intake-joint-pattern': 'small-joints+both-sides' });
  assert.equal(result.route?.registryId, 'clinical-immunology-rheumatology');
  assert.equal(result.route?.basis, 'source-backed-criteria');
});

test('C2. persistence and swelling alone do not reach Rheumatology', () => {
  const result = walk(KNEE, { ...RA, 'intake-joint-pattern': 'none', 'intake-msk-mechanical': 'locks' });
  assert.notEqual(result.route?.registryId, 'clinical-immunology-rheumatology');
  assert.equal(result.route?.registryId, 'orthopaedics');
});

test('C3. swelling after an injury is excluded from Rheumatology', () => {
  const result = walk(HAND, { ...RA, 'joint-musculoskeletal-pain-injury': 'yes', 'intake-joint-pattern': 'several+small-joints' });
  assert.notEqual(result.route?.registryId, 'clinical-immunology-rheumatology');
});

test('C4. without a swollen joint the distribution question is not asked for Rheumatology', () => {
  const result = walk(HAND, { ...RA, 'joint-musculoskeletal-pain-swelling-bruising': 'no', 'joint-musculoskeletal-pain-use-weight': 'no' });
  assert.notEqual(result.route?.registryId, 'clinical-immunology-rheumatology');
});

test('C5. more than one joint excludes Orthopaedics, so a polyarticular pattern is never sent there', () => {
  const result = walk(HAND, { ...RA, 'joint-musculoskeletal-pain-use-weight': 'yes', 'intake-joint-pattern': 'several' });
  assert.notEqual(result.route?.registryId, 'orthopaedics');
});

test('C6. Rheumatology is adult-only, gate-only and never a Bayesian candidate', () => {
  const set = DIRECTION_CRITERIA_SETS.find((candidate) => candidate.directionId === 'clinical-immunology-rheumatology');
  assert.equal(set?.pediatricPolicy, 'adult-only');
  const record = SPECIALTY_REGISTRY.find((candidate) => candidate.id === 'clinical-immunology-rheumatology');
  assert.equal(record?.weightedRoutingEnabled, undefined);
  assert.equal(record?.engineSpecialtyId, undefined);
  assert.ok(record?.registryStates.includes('NEEDS_CLINICAL_EVIDENCE'));
  const child = eligibleRouteDirections(contextFor({ region: 'right-hand', concern: 'pain', age: 10 }));
  assert.ok(!child.narrowerServiceIds.includes('clinical-immunology-rheumatology'));
});

/* --- D. Injury depth ------------------------------------------------------- */

test('D1. a limb injury is asked what was noticed, without changing the route', () => {
  const base = { 'intake-injury-function': 'cannot', 'intake-msk-mechanical': 'gives-way' };
  const withPop = walk({ region: 'left-knee', concern: 'injury', age: 40, sex: 'male' }, { ...base, 'intake-injury-features': 'pop+swelled-fast' });
  const without = walk({ region: 'left-knee', concern: 'injury', age: 40, sex: 'male' }, { ...base, 'intake-injury-features': 'none' });
  assert.ok(asked(withPop).includes('intake-injury-features'));
  assert.equal(withPop.route?.registryId, without.route?.registryId, 'context, not a referral criterion');
});

/* --- E. Registry honesty --------------------------------------------------- */

test('E1. every new direction is pending clinical review and cites its sources', () => {
  for (const directionId of ['dentistry', 'clinical-immunology-rheumatology'] as const) {
    const record = SPECIALTY_REGISTRY.find((candidate) => candidate.id === directionId);
    assert.ok(record?.registryStates.includes('NEEDS_CLINICAL_EVIDENCE'), directionId);
    const set = DIRECTION_CRITERIA_SETS.find((candidate) => candidate.directionId === directionId);
    assert.match(set!.rationale, /PENDING CLINICAL REVIEW|NHS/);
    for (const criterion of set!.supporting) assert.ok(criterion.sourceIds.length > 0, criterion.id);
  }
});
