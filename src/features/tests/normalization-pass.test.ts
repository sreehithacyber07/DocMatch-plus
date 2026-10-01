/**
 * The questionnaire cleanup and clinical-model normalization pass.
 *
 * Adaptivity, the new sourced safety distinctions, the discrimination
 * extension, and the normalized contracts: canonical concepts, acuity and
 * show-condition references, sources, safety rules, the specialty evidence
 * contract, physiology gating and legacy identifiers.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { BODY_DOMAIN } from '../../body/index.ts';
import { SPECIALTY_IDS } from '../../engine/specialties.ts';
import {
  R3_RED_FLAG_RULES,
  R3_SAFETY_EVIDENCE_REGISTER,
  R3_SAFETY_KNOWLEDGE,
  R3_SAFETY_QUESTIONS,
} from '../../engine/safety/index.ts';
import type { SafetyCondition } from '../../engine/safety/index.ts';
import {
  CLINICAL_COVERAGE_SOURCES,
  concernOptionsFor,
  COVERAGE_SAFETY_SAME_PUBLICATION,
  PEDIATRIC_COMPLAINT_IDS,
  type RegionAssessmentContext,
} from '../body-explorer/clinical-coverage.ts';
import { FACE_HIT_REGIONS, type FaceRegionId } from '../body-explorer/faceHitMap.ts';
import type { ReporterChoice } from '../intake/question-voice.ts';
import { DIRECTION_CRITERIA_SETS, evaluateDirectionGate, reproductiveBranchEligible } from '../routing-flow/direction-gate.ts';
import {
  CANONICAL_INTAKE_QUESTIONS,
  DIRECTION_GATE_QUESTION_IDS,
  GATE_CRITERION_QUESTION_IDS,
  R1_ANSWERS_READ_BY_GATE,
  INTAKE_QUESTION_IDS,
  intakeQuestionsFor,
  type IntakeQuestion,
  type ShowCondition,
} from '../routing-flow/intake-questions.ts';
import { isWeightedRoutable, SPECIALTY_REGISTRY } from '../routing-flow/specialty-registry.ts';
import { contextFor, walkAssessment, type ContextSpec, type Script } from './clinical-walk.ts';

const Q = INTAKE_QUESTION_IDS;

function ids(spec: ContextSpec, script: Script = {}) {
  return walkAssessment(contextFor(spec), script).steps.map((step) => step.questionId);
}

/** The question asked immediately after `after`. */
function nextAfter(spec: ContextSpec, script: Script, after: string): string | undefined {
  const asked = ids(spec, script);
  return asked[asked.indexOf(after) + 1];
}

function everyContext(): RegionAssessmentContext[] {
  const out: RegionAssessmentContext[] = [];
  const bands: { age: number; reporter: ReporterChoice | null }[] = [
    { age: 0, reporter: null }, { age: 3, reporter: null }, { age: 8, reporter: null },
    { age: 15, reporter: 'young-person' }, { age: 15, reporter: 'caregiver' }, { age: 34, reporter: null }, { age: 70, reporter: null },
  ];
  for (const region of BODY_DOMAIN.regions) {
    const faces: readonly (FaceRegionId | null)[] = region.id === 'face' ? FACE_HIT_REGIONS.map((face) => face.id) : [null];
    for (const face of faces) {
      for (const { age, reporter } of bands) {
        for (const sex of ['female', 'male', 'intersex_or_variation'] as const) {
          for (const concern of concernOptionsFor(region.id, face, { age, sexForAssessment: sex })) {
            out.push(contextFor({ region: region.id, face, concern: concern.id, age, sex, reporter }));
          }
        }
      }
    }
  }
  return out;
}

const ALL = everyContext();

/* --- 1. Adult nose adaptivity ---------------------------------------------- */

const ADULT_NOSE: ContextSpec = { region: 'face', face: 'nose', concern: 'nose-change', age: 34, sex: 'male' };

test('adult nose: a short problem goes to treatment, a persistent one to the ENT discriminators', () => {
  // Same first two answers; the persistence answer decides the third question.
  const shortPath = { [Q.noseDetail]: 'unsure', [Q.nosePersistence]: 'one-to-three-weeks' };
  const longPath = { [Q.noseDetail]: 'unsure', [Q.nosePersistence]: 'over-three-months' };
  assert.equal(nextAfter(ADULT_NOSE, shortPath, Q.nosePersistence), Q.noseTreatment);
  const long = ids(ADULT_NOSE, longPath);
  assert.ok(!long.includes(Q.noseTreatment), 'a persistent problem is not asked the short-problem treatment question');
  assert.ok(long.includes(Q.noseAssociated), 'a persistent problem is asked the one-sided and recurrent discriminators');
  assert.ok(!ids(ADULT_NOSE, shortPath).includes(Q.noseAssociated), 'a short problem cannot meet the ENT criteria, so they are not asked');
});

test('adult nose: an ENT pattern already met does not ask further discriminators', () => {
  const met = walkAssessment(contextFor(ADULT_NOSE), { [Q.noseDetail]: 'blocked', [Q.nosePersistence]: 'over-three-months' });
  assert.equal(met.route?.registryId, 'otorhinolaryngology');
  assert.ok(!met.steps.some((step) => step.questionId === Q.noseAssociated));
});

test('adult nose: one-sided persistent symptoms reach ENT through the extension; bleeding and injury take their own branch', () => {
  const oneSided = walkAssessment(contextFor(ADULT_NOSE), {
    [Q.noseDetail]: 'unsure', [Q.nosePersistence]: 'over-three-months', [Q.noseAssociated]: 'one-sided',
  });
  assert.equal(oneSided.route?.registryId, 'otorhinolaryngology');
  assert.ok(oneSided.counts.discrimination >= 1, 'the sinonasal discriminator was asked as a Stage B extension');
  // A nose pain branch that reports bleeding opens the sourced nosebleed check.
  const bleeding = ids({ region: 'face', face: 'nose', concern: 'pain', age: 34 }, { [Q.noseDetail]: 'bleeding' });
  assert.ok(bleeding.includes('safety-nosebleed-prolonged-or-excessive'));
  const pressure = ids({ region: 'face', face: 'nose', concern: 'pain', age: 34 }, { [Q.noseDetail]: 'pressure' });
  assert.ok(!pressure.includes('safety-nosebleed-prolonged-or-excessive'));
  // The injury concern asks mechanism and the bleeding-burden concept, never the sinonasal one.
  const injury = ids({ region: 'face', face: 'nose', concern: 'injury', age: 34 });
  assert.ok(injury.includes(Q.injuryDetail) && injury.includes(Q.nosebleedAssociated) && !injury.includes(Q.noseAssociated));
});

/* --- 2. Constipation and bowel adaptivity --------------------------------- */

const ADULT_BOWEL: ContextSpec = { region: 'lower-abdomen', concern: 'bowel-change', age: 50, sex: 'male' };

test('adult constipation: a recent first episode and a recurring one diverge after persistence', () => {
  const recent = { [Q.bowelDetail]: 'constipation', [Q.bowelPersistence]: 'recent-first' };
  const recurring = { [Q.bowelDetail]: 'constipation', [Q.bowelPersistence]: 'regularly-recurrent' };
  assert.equal(nextAfter(ADULT_BOWEL, recurring, Q.bowelPersistence), Q.bowelTreatment);
  assert.notEqual(nextAfter(ADULT_BOWEL, recent, Q.bowelPersistence), Q.bowelTreatment);
  // A recent first episode with nothing else reported meets none of the follow-ups.
  const recentAsked = ids(ADULT_BOWEL, { ...recent, [Q.bowelAlarmFeature]: 'neither' });
  for (const followUp of [Q.bowelTreatment, Q.bowelBleedingDuration, Q.bowelHabitDuration, Q.bowelSystemic]) {
    assert.ok(!recentAsked.includes(followUp), `${followUp} asked of a recent first episode`);
  }
});

test('adult bowel: blood, a habit change and weight loss each open their own follow-up', () => {
  const blood = ids(ADULT_BOWEL, { [Q.bowelDetail]: 'blood' });
  assert.ok(blood.includes(Q.bowelBleedingDuration));
  assert.ok(blood.includes('safety-rectal-bleeding-heavy') && blood.includes('safety-rectal-bleeding-urgent'));
  const habit = ids(ADULT_BOWEL, { [Q.bowelDetail]: 'constipation', [Q.bowelPersistence]: 'recent-first', [Q.bowelAlarmFeature]: 'sudden-change' });
  assert.equal(habit[habit.indexOf(Q.bowelAlarmFeature) + 1], Q.bowelHabitDuration);
  assert.ok(!habit.includes(Q.bowelSystemic));
  const weight = ids(ADULT_BOWEL, { [Q.bowelDetail]: 'constipation', [Q.bowelPersistence]: 'recent-first', [Q.bowelAlarmFeature]: 'weight-loss' });
  assert.equal(weight[weight.indexOf(Q.bowelAlarmFeature) + 1], Q.bowelSystemic);
  assert.ok(!weight.includes(Q.bowelHabitDuration));
});

test('adult constipation: a simple recent episode stays broad; a persistent alarm pattern reaches gastroenterology', () => {
  const simple = walkAssessment(contextFor(ADULT_BOWEL), {
    [Q.bowelDetail]: 'constipation', [Q.bowelPersistence]: 'recent-first', [Q.bowelAlarmFeature]: 'neither',
  });
  assert.equal(simple.route?.registryId, 'general-medicine');
  assert.ok(simple.route?.fallbackReason);
  const persistent = walkAssessment(contextFor(ADULT_BOWEL), {
    [Q.bowelDetail]: 'constipation', [Q.bowelPersistence]: 'regularly-recurrent', [Q.bowelAlarmFeature]: 'weight-loss',
  });
  assert.equal(persistent.route?.registryId, 'medical-gastroenterology');
  assert.equal(persistent.route?.basis, 'source-backed-criteria');
});

/* --- 3. Face numbness ------------------------------------------------------ */

const FACE_NUMBNESS: ContextSpec = { region: 'face', face: 'patient-left-cheek', concern: 'numbness-tingling', age: 45 };

test('face numbness: timing is asked once, as the course, and a facial rash brings the sourced eye-and-nose check in', () => {
  const plain = walkAssessment(contextFor(FACE_NUMBNESS), { [Q.neurologicDetail]: 'both-sides', [Q.neurologicCourse]: 'same', [Q.neurologicFeatures]: 'pain' });
  const plainIds = plain.steps.map((step) => step.questionId);
  // One timing concept: how it has changed (NICE NG127). No generic onset, duration or pattern beside it.
  assert.ok(plainIds.includes(Q.neurologicCourse) && plainIds.includes(Q.neurologicFeatures));
  for (const generic of [Q.pattern, Q.onset, Q.duration, Q.currentImpact, Q.functionImpact]) assert.ok(!plainIds.includes(generic), generic);
  assert.ok(!plainIds.includes('safety-face-rash-eye-nose'));
  const detail = intakeQuestionsFor(plain.context.complaintId, plain.context).find((question) => question.id === Q.neurologicDetail)!;
  assert.ok(!detail.options.some((option) => option.id === 'intermittent'));
  // Stable or recurring numbness is asked the NG127 on-waking exclusion; a course that is worsening is not.
  assert.ok(plainIds.includes(Q.neurologicWaking));
  const worsening = walkAssessment(contextFor(FACE_NUMBNESS), { [Q.neurologicDetail]: 'both-sides', [Q.neurologicCourse]: 'gradual' });
  assert.ok(!worsening.steps.some((step) => step.questionId === Q.neurologicWaking));

  const rash = walkAssessment(contextFor(FACE_NUMBNESS), { [Q.neurologicDetail]: 'both-sides', [Q.neurologicFeatures]: 'rash' });
  assert.ok(rash.steps.some((step) => step.questionId === 'safety-face-rash-eye-nose'));
});

test('face numbness: stroke-type signs still stop at once, and no neurology route is invented', () => {
  const stop = walkAssessment(contextFor(FACE_NUMBNESS), { 'safety-generic-new-neurological-change': 'yes' });
  assert.equal(stop.outcome, 'interrupted');
  const routine = walkAssessment(contextFor(FACE_NUMBNESS));
  assert.equal(routine.route?.registryId, 'general-medicine');
  assert.equal(routine.route?.fallbackReason, 'NO_VALIDATED_NARROW_ROUTE');
  // Neurology is now reachable, but only on NICE NG127 criteria; none of them applies to facial numbness.
  assert.equal(evaluateDirectionGate(contextFor(FACE_NUMBNESS), []).status, 'not-applicable');
});

/* --- 4. Rectal bleeding: three levels, and only one is an emergency ------ */

test('rectal bleeding: heavy bleeding stops at once, dark or bloody diarrhoea continues as urgent, other blood is routine', () => {
  const heavy = walkAssessment(contextFor(ADULT_BOWEL), { [Q.bowelDetail]: 'blood', 'safety-rectal-bleeding-heavy': 'yes' });
  assert.equal(heavy.outcome, 'interrupted');
  assert.equal(heavy.interruptedRuleId, 'rectal-bleeding-heavy');
  assert.equal(heavy.steps.at(-1)!.questionId, 'safety-rectal-bleeding-heavy');

  const urgent = walkAssessment(contextFor(ADULT_BOWEL), { [Q.bowelDetail]: 'blood', 'safety-rectal-bleeding-urgent': 'yes' });
  assert.equal(urgent.outcome, 'result');
  assert.ok(urgent.urgentRuleIds.includes('rectal-bleeding-urgent'));
  assert.ok(urgent.route);

  const routine = walkAssessment(contextFor(ADULT_BOWEL), { [Q.bowelDetail]: 'blood' });
  assert.equal(routine.outcome, 'result');
  assert.deepEqual(routine.urgentRuleIds, []);
  // Without reported blood neither check is asked at all.
  assert.ok(!ids(ADULT_BOWEL, { [Q.bowelDetail]: 'constipation' }).some((id) => id.startsWith('safety-rectal')));
  // The source's routine level stays out of R3: blood alone never escalates.
  const heavyRule = R3_RED_FLAG_RULES.find((rule) => rule.id === 'rectal-bleeding-heavy')!;
  const urgentRule = R3_RED_FLAG_RULES.find((rule) => rule.id === 'rectal-bleeding-urgent')!;
  assert.equal(heavyRule.continuationPolicy, 'must_stop');
  assert.equal(urgentRule.continuationPolicy, 'may_continue_after_acknowledgement');
});

test('sinus: an urgent answer continues to a direction with urgency recorded', () => {
  const urgent = walkAssessment(contextFor(ADULT_NOSE), { [Q.noseDetail]: 'blocked', [Q.nosePersistence]: 'over-three-months', 'safety-sinus-urgent': 'yes' });
  assert.equal(urgent.outcome, 'result');
  assert.equal(urgent.route?.registryId, 'otorhinolaryngology');
  assert.ok(urgent.urgentRuleIds.includes('sinus-urgent-review'));
});

/* --- 5. Discrimination extension ------------------------------------------ */

test('the discrimination extension activates where a criterion is still open, and only there', () => {
  const cases: [string, ContextSpec, Script, string][] = [
    ['nose, persistent, unclear pattern', ADULT_NOSE, { [Q.noseDetail]: 'unsure', [Q.nosePersistence]: 'over-three-months' }, Q.noseAssociated],
    ['constipation, recent', ADULT_BOWEL, { [Q.bowelDetail]: 'constipation', [Q.bowelPersistence]: 'recent-first' }, Q.bowelAlarmFeature],
    ['recurrent sore throats', { region: 'neck', concern: 'throat', age: 10 }, { [Q.throatRecurrence]: 'seven-in-year' }, Q.throatImpact],
    ['child squint', { region: 'face', face: 'patient-left-eye', concern: 'pain', age: 6 }, { [Q.eyeDetail]: 'squint' }, Q.eyeSquintPattern],
    ['reproductive branch', { region: 'lower-abdomen', concern: 'reproductive-pelvic-change' as never, age: 30, sex: 'female' }, { [Q.reproductiveDetail]: 'bleeding' }, Q.reproductiveTiming],
  ];
  for (const [name, spec, script, expected] of cases) {
    const result = walkAssessment(contextFor(spec), script);
    const step = result.steps.find((entry) => entry.questionId === expected);
    assert.ok(step, `${name}: ${expected} was not asked`);
    assert.ok(result.counts.discrimination >= 1, `${name}: counted as discrimination`);
  }
  // Not activated once the criteria are already met or can no longer be met.
  const met = walkAssessment(contextFor(ADULT_NOSE), { [Q.noseDetail]: 'blocked', [Q.nosePersistence]: 'over-three-months' });
  assert.equal(met.counts.discrimination, 0);
  const unreachable = walkAssessment(contextFor(ADULT_NOSE), { [Q.noseDetail]: 'blocked', [Q.nosePersistence]: 'under-one-week' });
  assert.equal(unreachable.counts.discrimination, 0);
  assert.ok(DIRECTION_GATE_QUESTION_IDS.has(Q.noseAssociated));
});

/* --- 6. Dead configuration ------------------------------------------------- */

function conditions(question: IntakeQuestion): readonly ShowCondition[] {
  if (!question.showWhen) return [];
  return Array.isArray(question.showWhen) ? question.showWhen : [question.showWhen as ShowCondition];
}

test('every acuity, exclusive and show-condition reference resolves to a real option in every context', () => {
  const problems: string[] = [];
  const used = new Set<string>();
  for (const context of ALL) {
    const plan = intakeQuestionsFor(context.complaintId, context);
    for (const question of plan) {
      used.add(question.id);
      const own = new Set(question.options.map((option) => option.id));
      for (const id of question.acuityOptionIds ?? []) if (!own.has(id)) problems.push(`${question.id} acuity ${id} @${context.concernId}`);
      for (const id of question.exclusiveOptionIds ?? []) if (!own.has(id)) problems.push(`${question.id} exclusive ${id}`);
      for (const condition of conditions(question)) {
        const target = plan.find((candidate) => candidate.id === condition.questionId);
        if (!target) problems.push(`${question.id} waits on ${condition.questionId}, which is not in the plan @${context.concernId}`);
        else for (const id of condition.optionIds) if (!target.options.some((option) => option.id === id)) problems.push(`${question.id} waits on ${condition.questionId}:${id}`);
      }
    }
  }
  assert.deepEqual([...new Set(problems)], []);
  // Every canonical concept is asked somewhere, except the generic pattern concept: the branch course
  // and frequency questions replaced it, and it stays registered only so persisted legacy evidence replays.
  const LEGACY_ONLY = new Set<string>([Q.pattern]);
  assert.deepEqual(CANONICAL_INTAKE_QUESTIONS.map((question) => question.id).filter((id) => !used.has(id) && !LEGACY_ONLY.has(id)), []);
  assert.ok(ALL.length > 7000);
});

test('every question in every plan has a purpose, a canonical meaning and sources', () => {
  const purposes = new Set(['CONTEXT', 'CHARACTERIZATION', 'DISCRIMINATION', 'GATE_CRITERION', 'SAFETY']);
  for (const context of ALL.filter((_, index) => index % 3 === 0)) {
    for (const question of intakeQuestionsFor(context.complaintId, context)) {
      assert.ok(question.purpose && purposes.has(question.purpose), `${question.id} has no purpose`);
      assert.ok(question.canonicalMeaning, `${question.id} has no canonical meaning`);
      assert.ok((question.sourceIds ?? []).length > 0, `${question.id} has no source`);
    }
  }
  // One canonical concept per id, one meaning per concept, one equivalence group per concept.
  const meanings = CANONICAL_INTAKE_QUESTIONS.map((question) => question.canonicalMeaning);
  assert.equal(new Set(meanings).size, meanings.length);
});

test('a canonical concept keeps its meaning across wording variants: voice never changes an option id', () => {
  for (const [adult, caregiver] of [
    [contextFor({ region: 'neck', concern: 'throat', age: 15, reporter: 'young-person' }), contextFor({ region: 'neck', concern: 'throat', age: 15, reporter: 'caregiver' })],
    [contextFor({ region: 'face', face: 'nose', concern: 'nose-change', age: 15, reporter: 'young-person' }), contextFor({ region: 'face', face: 'nose', concern: 'nose-change', age: 15, reporter: 'caregiver' })],
  ] as const) {
    const self = new Map(intakeQuestionsFor(adult.complaintId, adult).map((question) => [question.id, question]));
    for (const question of intakeQuestionsFor(caregiver.complaintId, caregiver)) {
      const twin = self.get(question.id);
      if (!twin) continue;
      assert.deepEqual(question.options.map((option) => option.id), twin.options.map((option) => option.id), question.id);
      assert.equal(question.canonicalMeaning, twin.canonicalMeaning);
    }
  }
});

test('a question is a gate criterion exactly when a published direction criterion reads it', () => {
  const read = new Set(DIRECTION_CRITERIA_SETS.flatMap((set) => [...set.supporting, ...set.excluding].map((criterion) => criterion.questionId)));
  assert.deepEqual([...GATE_CRITERION_QUESTION_IDS].filter((id) => !read.has(id)), [], 'classified as a gate criterion but read by no criterion');
  // An approved R1 answer a criterion also reads is declared as such, not classified as an intake question.
  assert.deepEqual([...read].filter((id) => !GATE_CRITERION_QUESTION_IDS.has(id) && !R1_ANSWERS_READ_BY_GATE.has(id)), [], 'read by a criterion but not classified as one');
});

/* --- 7. Sources ------------------------------------------------------------ */

test('sources: every cited id resolves, none is registered twice within a registry, and cross-registry copies are declared', () => {
  const coverage = new Map(CLINICAL_COVERAGE_SOURCES.map((source) => [source.id, source]));
  const safety = new Map(R3_SAFETY_KNOWLEDGE.sources.map((source) => [source.id, source]));
  for (const question of CANONICAL_INTAKE_QUESTIONS) for (const id of question.sourceIds) assert.ok(coverage.has(id), `${question.id} cites ${id}`);
  for (const set of DIRECTION_CRITERIA_SETS) {
    for (const criterion of [...set.supporting, ...set.excluding]) for (const id of criterion.sourceIds) assert.ok(coverage.has(id), `${criterion.id} cites ${id}`);
  }
  for (const rule of R3_RED_FLAG_RULES) for (const id of rule.provenanceIds) assert.ok(safety.has(id), `${rule.id} cites ${id}`);

  const url = (value: string | undefined) => (value ?? '').toLowerCase().replace(/\/$/, '');
  const coverageUrls = CLINICAL_COVERAGE_SOURCES.map((source) => url(source.url));
  assert.equal(new Set(coverageUrls).size, coverageUrls.length, 'a publication is registered twice in the coverage registry');
  const safetyUrls = R3_SAFETY_KNOWLEDGE.sources.map((source) => url(source.url)).filter(Boolean);
  assert.equal(new Set(safetyUrls).size, safetyUrls.length, 'a publication is registered twice in the safety registry');
  for (const source of CLINICAL_COVERAGE_SOURCES) {
    const twin = R3_SAFETY_KNOWLEDGE.sources.find((candidate) => url(candidate.url) === url(source.url));
    if (!twin) continue;
    assert.equal(COVERAGE_SAFETY_SAME_PUBLICATION[source.id], twin.id, `${source.id} duplicates ${twin.id} without a declaration`);
  }
  for (const [coverageId, safetyId] of Object.entries(COVERAGE_SAFETY_SAME_PUBLICATION)) {
    assert.equal(url(coverage.get(coverageId)?.url), url(safety.get(safetyId)?.url), `${coverageId} and ${safetyId} name different publications`);
  }
  for (const source of CLINICAL_COVERAGE_SOURCES) {
    assert.equal(source.clinicalReviewStatus, 'source-backed-prototype-pending-clinical-review');
    assert.ok(source.accessedAt && source.scope && source.organization);
  }
});

/* --- 8. Safety contract ---------------------------------------------------- */

function referencedQuestions(condition: SafetyCondition, out = new Set<string>()): Set<string> {
  const node = condition as { kind: string; questionId?: string; conditions?: readonly SafetyCondition[] };
  if (node.questionId) out.add(node.questionId);
  for (const child of node.conditions ?? []) referencedQuestions(child, out);
  return out;
}

test('safety contract: every rule is explicit about severity, continuation, questions, predicate and source', () => {
  const questions = new Set(R3_SAFETY_QUESTIONS.map((question) => question.id));
  const registered = new Set(R3_SAFETY_EVIDENCE_REGISTER.flatMap((entry) => entry.ruleIds));
  const kinds = new Set<string>();
  const collect = (condition: SafetyCondition) => {
    const node = condition as { kind: string; conditions?: readonly SafetyCondition[] };
    kinds.add(node.kind);
    (node.conditions ?? []).forEach(collect);
  };
  for (const rule of R3_RED_FLAG_RULES) {
    assert.ok(['emergency', 'urgent'].includes(rule.severity), rule.id);
    assert.equal(rule.continuationPolicy, rule.severity === 'urgent' ? 'may_continue_after_acknowledgement' : 'must_stop', rule.id);
    assert.ok(rule.requiredQuestionIds.length > 0 && rule.requiredQuestionIds.every((id) => questions.has(id)), rule.id);
    for (const id of referencedQuestions(rule.predicate)) assert.ok(rule.requiredQuestionIds.includes(id), `${rule.id} reads ${id} without requiring it`);
    assert.ok(rule.provenanceIds.length > 0, rule.id);
    assert.ok(registered.has(rule.id), `${rule.id} has no evidence-register entry`);
    collect(rule.predicate);
  }
  // Predicates are named answers combined with all/any: no yes-count logic exists.
  assert.deepEqual([...kinds].sort(), ['all', 'answer_equals', 'any']);
});

/* --- 9. Specialty evidence contract --------------------------------------- */

test('specialty contract: each routing-enabled service declares how it is reached, and nothing unreachable is active', () => {
  const gated = new Set(DIRECTION_CRITERIA_SETS.map((set) => set.directionId as string));
  const engineSpecialties = new Set<string>(SPECIALTY_IDS);
  for (const record of SPECIALTY_REGISTRY) {
    const states = record.registryStates;
    if (!record.routingEnabled) {
      assert.ok(!states.includes('ROUTABLE_SOURCE_BACKED') && !states.includes('ROUTABLE_WEIGHTED_DEMONSTRATION'), `${record.id} is labelled routable but disabled`);
      continue;
    }
    assert.ok(
      states.includes('PARENT_SERVICE') || states.includes('ROUTABLE_SOURCE_BACKED') || states.includes('ROUTABLE_WEIGHTED_DEMONSTRATION'),
      `${record.id} is enabled with no declared route`,
    );
    if (states.includes('ROUTABLE_SOURCE_BACKED')) assert.ok(gated.has(record.id), `${record.id} claims a gate it does not have`);
    if (states.includes('ROUTABLE_WEIGHTED_DEMONSTRATION')) {
      assert.ok(isWeightedRoutable(record), `${record.id} claims weighted routing it does not have`);
      assert.ok(engineSpecialties.has(record.engineSpecialtyId ?? ''), `${record.id} has no weighted dimension`);
    }
  }
  /*
    Calibration-blocked services stay honest. Cardiology and Neurology are
    reachable only through published criteria (NICE CG95, NHS Angina, NHS
    Heart palpitations; NICE NG127), both still flagged as needing clinical
    evidence for their weighted paths, and the uncalibrated headache belief
    can never present Neurology.
  */
  const cardiology = SPECIALTY_REGISTRY.find((record) => record.id === 'cardiology')!;
  const neurology = SPECIALTY_REGISTRY.find((record) => record.id === 'neurology')!;
  assert.ok(cardiology.registryStates.includes('NEEDS_CLINICAL_EVIDENCE'));
  assert.ok(neurology.registryStates.includes('NEEDS_CLINICAL_EVIDENCE'));
  assert.ok(gated.has('cardiology') && gated.has('neurology'));
  assert.equal(isWeightedRoutable(neurology), false);
  for (const set of DIRECTION_CRITERIA_SETS.filter((candidate) => ['cardiology', 'neurology'].includes(candidate.directionId))) {
    assert.equal(set.pediatricPolicy, 'adult-only', 'adult criteria are never applied to a child');
    assert.ok(set.minimumSupporting >= 2, 'one answer is never a referral');
  }
});

/* --- 10. Physiology and legacy identifiers --------------------------------- */

test('physiology stays positive and fail-closed: no male, child or unknown run reaches reproductive questions', () => {
  const reproductive = [Q.reproductiveDetail, Q.reproductiveTiming, Q.pregnancyContext];
  let checked = 0;
  for (const context of ALL) {
    if (context.sexForAssessment === 'female' && context.patientMode === 'adult') continue;
    if (context.sexForAssessment === 'intersex_or_variation' && context.patientMode === 'adult') continue;
    const plan = intakeQuestionsFor(context.complaintId, context).map((question) => question.id);
    for (const id of reproductive) assert.ok(!plan.includes(id), `${context.sexForAssessment} ${context.age} ${context.bodyRegionId}/${context.concernId} offered ${id}`);
    checked += 1;
  }
  assert.ok(checked > 5000);
  // An unknown or future value is not eligible, and eligibility is a positive list, not "not male".
  const base = contextFor({ region: 'lower-abdomen', concern: 'pain', age: 30, sex: 'female' });
  assert.equal(reproductiveBranchEligible({ ...base, sexForAssessment: 'unknown' as never }), false);
  assert.equal(reproductiveBranchEligible({ ...base, sexForAssessment: undefined as never }), false);
});

test('legacy age-band complaint ids are never produced, and stay registered for replay', () => {
  const produced = new Set(ALL.map((context) => context.complaintId));
  for (const id of PEDIATRIC_COMPLAINT_IDS) {
    assert.ok(!produced.has(id), `${id} is still produced by new assessments`);
    assert.ok(SPECIALTY_REGISTRY.some((record) => record.supportedComplaints.includes(id)), `${id} no longer validates for replay`);
  }
});
