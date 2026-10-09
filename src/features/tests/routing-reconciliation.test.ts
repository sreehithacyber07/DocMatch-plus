/**
 * The routing reconciliation contract.
 *
 * Region selects plausible concern families; the concern selects a branch; the
 * branch asks concern-specific questions whose scope is declared; narrower
 * services are reached only through published criteria (or calibrated R1);
 * General Medicine and Paediatrics are named conclusions, never a default; a
 * secondary location is evidence, never a route; only a hard stop interrupts.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { BODY_DOMAIN, type BodyRegionId } from '../../body/index.ts';
import { concernOptionsFor } from '../body-explorer/clinical-coverage.ts';
import { FACE_HIT_REGIONS, type FaceRegionId } from '../body-explorer/faceHitMap.ts';
import type { SexForAssessment } from '../intake/patient-context.ts';
import { R3_RED_FLAG_RULES, R3_SAFETY_QUESTIONS } from '../../engine/safety/index.ts';
import { canonicalOutcomeOf, evidenceOf } from '../routing-flow/clinical-replay.ts';
import {
  CANONICAL_INTAKE_QUESTIONS,
  INTAKE_QUESTION_IDS as Q,
  intakeQuestionsFor,
} from '../routing-flow/intake-questions.ts';
import { CONCEPT_SCOPE, conceptEligible, specialtiesDiscriminatedBy } from '../routing-flow/question-eligibility.ts';
import { eligibleRouteDirections } from '../routing-flow/route-eligibility.ts';
import { buildRouteVisualization } from '../routing-flow/routing-presentation.ts';
import { contextFor, walkAssessment, type ContextSpec, type Script } from './clinical-walk.ts';
import { BASE_EXPECTED, TRACES } from './parity-fixtures.ts';

const AGES = [0, 3, 8, 15, 35, 70];
const SEXES: SexForAssessment[] = ['female', 'male', 'intersex_or_variation'];

function everyContext() {
  const out: ReturnType<typeof contextFor>[] = [];
  for (const region of BODY_DOMAIN.regions) {
    const faces: (FaceRegionId | null)[] = region.id === 'face' ? FACE_HIT_REGIONS.map((face) => face.id) : [null];
    for (const face of faces) {
      for (const age of AGES) {
        for (const sex of SEXES) {
          for (const concern of concernOptionsFor(region.id as BodyRegionId, face, { age, sexForAssessment: sex })) {
            out.push(contextFor({ region: region.id as BodyRegionId, face, concern: concern.id, age, sex }));
          }
        }
      }
    }
  }
  return out;
}
const ALL = everyContext();

test('the frontend consumes all 32 shared browser/backend clinical fixtures', () => {
  assert.equal(TRACES.length, 32);
  for (const trace of TRACES) {
    const result = walkAssessment(contextFor(trace.spec), trace.script);
    const actual = canonicalOutcomeOf(result.run);
    const expected = BASE_EXPECTED[trace.id];
    assert.ok(expected, `${trace.id} has no expectation`);
    assert.equal(actual.status, expected.status, trace.id);
    if (expected.specialtyId) assert.equal(actual.specialtyId, expected.specialtyId, trace.id);
    if (expected.routeType) assert.equal(actual.routeType, expected.routeType, trace.id);
    if (expected.fallbackReason) assert.equal(actual.fallbackReason, expected.fallbackReason, trace.id);
    assert.equal(actual.urgency, expected.urgency ?? 'none', trace.id);
    if (expected.hardStopRuleId) assert.equal(actual.hardStopRuleId, expected.hardStopRuleId, trace.id);
  }
});

/* --- Eligibility and leakage ------------------------------------------------ */

test('every canonical concept declares a scope, and every question it names is discriminating or descriptive by its criteria', () => {
  for (const concept of CANONICAL_INTAKE_QUESTIONS) assert.ok(CONCEPT_SCOPE[concept.id], `${concept.id} has no declared scope`);
  // The discriminated services are derived from the published criteria, never restated.
  assert.deepEqual(specialtiesDiscriminatedBy(Q.chestPainTrigger), ['cardiology']);
  assert.deepEqual(specialtiesDiscriminatedBy(Q.neurologicCourse), ['neurology']);
  assert.deepEqual(specialtiesDiscriminatedBy(Q.associatedLocation), ['cardiology']);
});

test('irrelevant-question leakage is zero: every planned question in every context is inside its declared scope', () => {
  const leaks: string[] = [];
  for (const context of ALL) {
    for (const question of intakeQuestionsFor(context.complaintId, context)) {
      const verdict = conceptEligible(question.id, context);
      if (!verdict.ok) leaks.push(`${question.id} @ ${context.bodyRegionId}/${context.faceSubregionId ?? '-'}/${context.concernId} age ${context.age} ${context.sexForAssessment}: ${verdict.reason}`);
    }
  }
  assert.deepEqual([...new Set(leaks)].slice(0, 20), []);
  assert.ok(ALL.length > 4000, String(ALL.length));
});

test('representative region pairs never share their branch questions', () => {
  const branchIds = (spec: ContextSpec) => new Set(
    intakeQuestionsFor(contextFor(spec).complaintId, contextFor(spec))
      .map((question) => question.id)
      .filter((id) => !CONCEPT_SCOPE[id].reuse),
  );
  const pairs: [ContextSpec, ContextSpec][] = [
    [{ region: 'left-wrist', concern: 'injury', age: 35 }, { region: 'lower-abdomen', concern: 'bowel-change', age: 35 }],
    [{ region: 'face', face: 'patient-left-cheek', concern: 'pain', age: 35 }, { region: 'lower-abdomen', concern: 'urinary-change', age: 35 }],
    [{ region: 'neck', concern: 'throat', age: 35 }, { region: 'right-ankle', concern: 'pain', age: 35 }],
    [{ region: 'face', face: 'patient-right-eye', concern: 'pain', age: 35 }, { region: 'upper-abdomen', concern: 'pain', age: 35 }],
    [{ region: 'chest', concern: 'pain', age: 35 }, { region: 'left-knee', concern: 'injury', age: 35 }],
  ];
  for (const [left, right] of pairs) {
    const a = branchIds(left);
    const shared = [...branchIds(right)].filter((id) => a.has(id));
    assert.deepEqual(shared, [], `${left.region}/${left.concern} and ${right.region}/${right.concern} share ${shared.join(', ')}`);
  }
});

test('male and child runs never receive a reproductive or pregnancy question; female alone never implies it', () => {
  const reproductive = new Set<string>([Q.reproductiveDetail, Q.reproductiveTiming, Q.pregnancyContext]);
  for (const context of ALL) {
    const asked = intakeQuestionsFor(context.complaintId, context).map((question) => question.id);
    if (context.sexForAssessment === 'male' || context.patientMode === 'pediatric') {
      assert.ok(!asked.some((id) => reproductive.has(id)), `${context.sexForAssessment} ${context.age} ${context.bodyRegionId}/${context.concernId}`);
    }
  }
  // Female, lower abdomen, a bowel pattern: no reproductive question, and never OBGYN.
  const bowel = walkAssessment(contextFor({ region: 'lower-abdomen', concern: 'bowel-change', age: 35, sex: 'female' }), {
    [Q.bowelDetail]: 'constipation', [Q.bowelPersistence]: 'regularly-recurrent', [Q.bowelAlarmFeature]: 'weight-loss',
  });
  assert.ok(!bowel.steps.some((step) => reproductive.has(step.questionId)));
  assert.equal(bowel.route?.registryId, 'medical-gastroenterology');
});

/* --- Divergence ------------------------------------------------------------- */

function signature(spec: ContextSpec): string {
  const walk = walkAssessment(contextFor(spec));
  return walk.steps.filter((step) => step.owner === 'intake').map((step) => {
    const question = intakeQuestionsFor(walk.context.complaintId, walk.context).find((candidate) => candidate.id === step.questionId)!;
    return `${step.questionId}[${question.options.map((option) => option.id).join(',')}]`;
  }).join('>');
}

test('two sub-concerns at one location produce visibly different question sequences', () => {
  const locations: { region: BodyRegionId; face?: FaceRegionId }[] = [
    { region: 'left-knee' }, { region: 'lower-abdomen' }, { region: 'chest' }, { region: 'neck' },
    { region: 'face', face: 'patient-left-ear' }, { region: 'face', face: 'patient-right-eye' }, { region: 'face', face: 'nose' },
    { region: 'right-forearm' }, { region: 'face', face: 'mouth' },
  ];
  for (const location of locations) {
    const concerns = concernOptionsFor(location.region, location.face ?? null, { age: 35, sexForAssessment: 'female' })
      .map((concern) => concern.id)
      .filter((id) => id !== 'other');
    const seen = new Map<string, string>();
    for (const concern of concerns) {
      const sig = signature({ region: location.region, face: location.face ?? null, concern, age: 35, sex: 'female' });
      assert.ok(!seen.has(sig), `${location.region}/${location.face ?? '-'}: ${concern} asks exactly what ${seen.get(sig)} asks`);
      seen.set(sig, concern);
    }
  }
});

test('knee injury and knee pain are different interviews', () => {
  const injury = walkAssessment(contextFor({ region: 'left-knee', concern: 'injury', age: 34, sex: 'male' }));
  const pain = walkAssessment(contextFor({ region: 'left-knee', concern: 'pain', age: 34, sex: 'male' }));
  assert.equal(injury.steps[0].questionId, Q.injuryDetail, 'an injury is asked what happened');
  assert.equal(pain.steps[0].questionId, Q.symptomCharacter);
  assert.equal(injury.context.complaintId, 'musculoskeletal-concern');
  assert.equal(pain.context.complaintId, 'joint-musculoskeletal-pain');
});

/* --- Wording contract ---------------------------------------------------------- */

test('one reporter voice per assessment: caregiver runs say "your child", self runs never do, and neither says "the child" or "young person"', () => {
  const safetyText = (id: string, caregiver: boolean) => {
    const question = R3_SAFETY_QUESTIONS.find((candidate) => candidate.id === id) as { text: string; caregiverText?: string } | undefined;
    return question ? (caregiver && question.caregiverText ? question.caregiverText : question.text) : '';
  };
  for (const context of ALL.filter((_, index) => index % 4 === 0)) {
    const caregiver = context.questionVoice === 'caregiver';
    const walk = walkAssessment(context);
    for (const step of walk.steps) {
      const text = step.owner === 'safety' ? safetyText(step.questionId, caregiver) : step.text;
      assert.doesNotMatch(text, /\bthe child\b|\byoung person\b/i, `${step.questionId}: ${text}`);
      if (!caregiver) assert.doesNotMatch(text, /\byour child\b/i, `self voice asked about a child: ${step.questionId}`);
    }
  }
});

/* --- Reachability and fallback ------------------------------------------------ */

const reach = (spec: ContextSpec, script: Script) => walkAssessment(contextFor(spec), script);

test('children reach the shared services their sources name, not Paediatrics by default', () => {
  const cases: [string, ContextSpec, Script][] = [
    ['otorhinolaryngology', { region: 'face', face: 'patient-left-ear', concern: 'pain', age: 8 }, { [Q.pediatricEarObservation]: 'discharge', [Q.earPersistence]: 'two-weeks-plus', [Q.earAssociated]: 'hearing' }],
    ['otorhinolaryngology', { region: 'neck', concern: 'throat', age: 10 }, { [Q.throatRecurrence]: 'seven-in-year', [Q.throatImpact]: 'yes' }],
    ['ophthalmology', { region: 'face', face: 'patient-right-eye', concern: 'pain', age: 6 }, { [Q.eyeDetail]: 'squint', [Q.eyeSquintPattern]: 'all-the-time' }],
    ['orthopaedics', { region: 'left-forearm', concern: 'injury', age: 9 }, { [Q.injuryDetail]: 'fall', [Q.injuryFunction]: 'cannot', [Q.mskDuration]: 'two-to-six-weeks' }],
    ['dermatology', { region: 'right-forearm', concern: 'skin-change', age: 9 }, { [Q.skinDetail]: 'patches', [Q.skinDuration]: 'over-four-weeks', [Q.skinTreatment]: 'not-settled' }],
  ];
  for (const [target, spec, script] of cases) {
    const walk = reach(spec, script);
    assert.equal(walk.outcome, 'result', target);
    assert.equal(walk.route?.registryId, target, `${spec.region}/${spec.concern} age ${spec.age}: ${walk.steps.map((step) => `${step.questionId}=${step.answer}`).join(' ')}`);
    assert.equal(canonicalOutcomeOf(walk.run).sharedService, true, `${target} is a shared service for a child`);
  }
});

test('Paediatrics and General Medicine are named conclusions: the guard holds and a reason is always given', () => {
  const child = reach({ region: 'upper-abdomen', concern: 'other', age: 7 }, {});
  assert.equal(child.route?.registryId, 'paediatrics');
  assert.ok(child.route?.fallbackReason);
  assert.equal(child.route?.guardMessage, null);
  // "Something else, or not sure" keeps the stated concern and ends at the parent service with a reason.
  // (Phase 2: any other clarifier answer opens that family's branch.)
  const adult = reach({ region: 'chest', concern: 'other', age: 45, sex: 'male' }, { [Q.otherClarifier]: 'unsure' });
  assert.equal(adult.route?.registryId, 'general-medicine');
  assert.ok(adult.route?.fallbackReason);
  assert.equal(adult.route?.guardMessage, null);
  // Across every adult context walked on its default path, no parent service is shown while a discriminator remains.
  for (const context of ALL.filter((candidate) => candidate.patientMode === 'adult').filter((_, index) => index % 3 === 0)) {
    const walk = walkAssessment(context);
    if (walk.route?.basis === 'parent-service') assert.equal(walk.route.guardMessage, null, `${context.bodyRegionId}/${context.concernId}`);
  }
});

test('a weighted run is asked the discrimination extension only after R1 fails, and only while a criterion is open', () => {
  // Criteria already met by the timeline and the R1 weight answer: nothing more is asked.
  const met = reach({ region: 'left-knee', concern: 'pain', age: 34, sex: 'male' }, {
    [Q.mskDuration]: 'over-six-weeks',
    'joint-musculoskeletal-pain-use-weight': 'yes',
    [Q.jointPattern]: 'none',
  });
  assert.ok(!met.steps.some((step) => step.questionId === Q.mskMechanical));
  assert.equal(met.route?.registryId, 'orthopaedics');
  assert.equal(met.route?.basis, 'source-backed-criteria');
  // The R1 weight answer is read by the criterion, never asked again as an intake question.
  assert.ok(!met.steps.some((step) => step.questionId === Q.injuryFunction));

  // One criterion still open: the mechanical question comes after every R1 question.
  const open = reach({ region: 'left-knee', concern: 'pain', age: 34, sex: 'male' }, {
    [Q.mskDuration]: 'under-one-week',
    'joint-musculoskeletal-pain-use-weight': 'yes',
    [Q.mskMechanical]: 'locks',
    [Q.jointPattern]: 'none',
  });
  const ids = open.steps.map((step) => step.questionId);
  const lastRouting = Math.max(...open.steps.map((step, index) => (step.owner === 'routing' ? index : -1)));
  assert.ok(ids.indexOf(Q.mskMechanical) > lastRouting, 'the extension comes after R1');
  assert.equal(open.route?.registryId, 'orthopaedics');
});

test('adult Gastroenterology, ENT, OBGYN, Urology, Cardiology and Neurology each have a sourced winning path', () => {
  const cases: [string, ContextSpec, Script][] = [
    ['medical-gastroenterology', { region: 'lower-abdomen', concern: 'bowel-change', age: 50, sex: 'male' }, { [Q.bowelDetail]: 'constipation', [Q.bowelPersistence]: 'not-improving', [Q.bowelAlarmFeature]: 'sudden-change' }],
    ['otorhinolaryngology', { region: 'face', face: 'patient-left-ear', concern: 'ear-discharge', age: 40 }, { [Q.earDetail]: 'pus-like', [Q.earPersistence]: 'two-weeks-plus' }],
    ['otorhinolaryngology', { region: 'neck', concern: 'swelling-lump', age: 55, sex: 'male' }, { [Q.swellingDetail]: 'growing+hard-fixed', [Q.swellingDuration]: 'over-six-weeks' }],
    ['obstetrics-gynaecology', { region: 'lower-abdomen', concern: 'reproductive-pelvic-change', age: 34, sex: 'female' }, { [Q.reproductiveDetail]: 'bleeding', [Q.reproductiveTiming]: 'between-periods' }],
    ['urology', { region: 'lower-abdomen', concern: 'urinary-change', age: 60, sex: 'male' }, { [Q.urinaryDetail]: 'difficulty', [Q.urinaryPattern]: 'poor-stream' }],
    ['cardiology', { region: 'chest', concern: 'pain', age: 58, sex: 'female' }, { [Q.chestPainCharacter]: 'tight-heavy', [Q.chestPainTrigger]: 'exertion', [Q.chestPainRelief]: 'rest-minutes', [Q.associatedLocation]: 'left-upper-arm' }],
    ['neurology', { region: 'right-thigh', concern: 'weakness-drooping', age: 62, sex: 'male' }, { [Q.neurologicDetail]: 'function', [Q.neurologicCourse]: 'gradual', [Q.neurologicFeatures]: 'none' }],
  ];
  for (const [target, spec, script] of cases) {
    const walk = reach(spec, script);
    assert.equal(walk.route?.registryId, target, `${spec.region}/${spec.concern}: ${walk.steps.map((step) => `${step.questionId}=${step.answer}`).join(' ')}`);
    assert.equal(walk.route?.basis, 'source-backed-criteria', target);
  }
});

test('Cardiology from chest pain requires exertion: pain on breathing in or after eating points away', () => {
  const pleuritic = reach({ region: 'chest', concern: 'pain', age: 50, sex: 'male' }, {
    [Q.chestPainCharacter]: 'tight-heavy', [Q.chestPainTrigger]: 'breathing-movement', [Q.chestPainRelief]: 'rest-minutes',
  });
  assert.equal(pleuritic.route?.registryId, 'general-medicine');
  assert.equal(pleuritic.route?.fallbackReason, 'EXCLUDED_BY_COMPETING_PATTERN');
});

/* --- Associated location ---------------------------------------------------------- */

test('the associated location is asked only in the branches its sources name', () => {
  const askedIn = new Set<string>();
  for (const context of ALL) {
    if (intakeQuestionsFor(context.complaintId, context).some((question) => question.id === Q.associatedLocation)) {
      askedIn.add(`${context.bodyRegionId}${context.faceSubregionId === 'upper-neck' ? '/upper-neck' : ''}:${context.concernId}`);
    }
  }
  // A clarified "Something else" reaches the same pain branches, behind the clarifier (phase 2).
  assert.deepEqual([...askedIn].sort(), ['chest:other', 'chest:pain', 'face/upper-neck:other', 'face/upper-neck:pain', 'lower-abdomen:pain', 'lower-back:other', 'lower-back:pain', 'neck:other', 'neck:pain', 'pelvis:pain']);
  // Never for a knee, an eye, a skin change or an adult headache.
  for (const spec of [
    { region: 'left-knee', concern: 'pain', age: 35 }, { region: 'face', face: 'patient-left-eye', concern: 'pain', age: 35 },
    { region: 'chest', concern: 'skin-change', age: 35 }, { region: 'head', concern: 'pain', age: 35 },
  ] as ContextSpec[]) {
    assert.ok(!intakeQuestionsFor(contextFor(spec).complaintId, contextFor(spec)).some((question) => question.id === Q.associatedLocation), spec.region);
  }
});

test('an associated location is recorded as evidence and never routes on its own', () => {
  const spread = reach({ region: 'chest', concern: 'pain', age: 50, sex: 'male' }, {
    [Q.chestPainCharacter]: 'sharp', [Q.chestPainTrigger]: 'nothing', [Q.chestPainRelief]: 'on-its-own', [Q.associatedLocation]: 'left-upper-arm',
  });
  assert.ok(evidenceOf(spread.run).some((answer) => answer.questionId === Q.associatedLocation && answer.optionId === 'left-upper-arm'));
  // One distribution feature, without exertion, is not a cardiology direction.
  assert.notEqual(spread.route?.registryId, 'cardiology');
  // The arm brings the chest safety check forward rather than routing.
  const ids = spread.steps.map((step) => step.questionId);
  assert.ok(ids.includes('safety-chest-persistent-spreading-associated'));
  // Back pain into a leg opens the leg questions, and routes nowhere by location.
  const back = reach({ region: 'lower-back', concern: 'pain', age: 45, sex: 'female' }, { [Q.associatedLocation]: 'left-thigh', [Q.backLegSymptoms]: 'numb-tingling' });
  assert.ok(back.steps.some((step) => step.questionId === Q.backLegSymptoms));
  assert.equal(back.route?.registryId, 'general-medicine');
});

/* --- Safety: presentation depends on class ----------------------------------------------- */

test('the new hard stops interrupt only on their exact answer, and only where their branch evidence opens them', () => {
  const palpitations = reach({ region: 'chest', concern: 'palpitations', age: 40 }, { 'safety-palpitations-emergency': 'yes' });
  assert.equal(palpitations.outcome, 'interrupted');
  assert.equal(palpitations.interruptedRuleId, 'palpitations-emergency-features');
  const stable = reach({ region: 'right-forearm', concern: 'weakness-drooping', age: 50 }, { [Q.neurologicCourse]: 'same' });
  assert.ok(!stable.steps.some((step) => step.questionId === 'safety-neuro-rapidly-progressive'), 'not asked of a stable course');
  const quick = reach({ region: 'right-forearm', concern: 'weakness-drooping', age: 50 }, { [Q.neurologicCourse]: 'quick', 'safety-neuro-rapidly-progressive': 'yes' });
  assert.equal(quick.interruptedRuleId, 'neuro-rapidly-progressive-weakness');
  const back = reach({ region: 'lower-back', concern: 'pain', age: 45 }, { 'safety-back-cauda-equina': 'yes' });
  assert.equal(back.interruptedRuleId, 'back-cauda-equina-pattern');
  for (const id of ['palpitations-emergency-features', 'neuro-rapidly-progressive-weakness', 'back-cauda-equina-pattern']) {
    const rule = R3_RED_FLAG_RULES.find((candidate) => candidate.id === id)!;
    assert.equal(rule.continuationPolicy, 'must_stop');
    assert.equal(rule.requiredQuestionIds.length, 1, 'one exact predicate, no tally');
  }
});

test('an urgent finding on a new branch continues to a direction with urgency attached', () => {
  const nose = reach({ region: 'face', face: 'nose', concern: 'nose-change', age: 35 }, {
    [Q.noseDetail]: 'blocked', [Q.nosePersistence]: 'over-three-months', 'safety-sinus-urgent': 'yes',
  });
  assert.equal(nose.outcome, 'result');
  assert.equal(nose.route?.registryId, 'otorhinolaryngology');
  assert.equal(canonicalOutcomeOf(nose.run).urgency, 'urgent');
});

/* --- Candidate display ------------------------------------------------------------ */

test('internal candidates outside the presentation are never drawn, even in the development rail', () => {
  const context = contextFor({ region: 'upper-abdomen', concern: 'pain', age: 40 });
  const eligibility = eligibleRouteDirections(context, context.complaintId);
  const eligible = [eligibility.parentServiceId, ...eligibility.narrowerServiceIds];
  const belief = { cardiology: 0.1, pulmonology: 0.1, neurology: 0.5, gastroenterology: 0.2, orthopedics: 0.05, dermatology: 0.05 };
  const model = buildRouteVisualization({ belief, history: [], eligibleRegistryIds: eligible, maxVisible: 6 });
  const shown = [...model.visibleDirections, ...model.otherDirections].map((direction) => direction.registryId);
  assert.ok(!shown.includes('neurology'));
  assert.ok(!shown.includes('dermatology'));
  assert.ok(shown.includes('medical-gastroenterology'));
});
