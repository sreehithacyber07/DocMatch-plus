import assert from 'node:assert/strict';
import test from 'node:test';
import { BODY_DOMAIN, type BodyRegionDefinition } from '../../body/index.ts';
import {
  DEMONSTRATION_ENGINE_CONFIG,
  R2B_DEMONSTRATION_KNOWLEDGE,
} from '../../engine/data/index.ts';
import {
  R3_RED_FLAG_RULES,
  R3_SAFETY_KNOWLEDGE,
} from '../../engine/safety/index.ts';
import type { PatientContext, SexForAssessment } from '../intake/patient-context.ts';
import {
  concernOptionsFor,
  createRegionAssessmentContext,
  GENERIC_ADULT_COMPLAINT_IDS,
  PEDIATRIC_COMPLAINT_IDS,
  type RegionAssessmentContext,
  type RegionConcernId,
} from '../body-explorer/clinical-coverage.ts';
import { FACE_HIT_REGIONS, type FaceRegionId } from '../body-explorer/faceHitMap.ts';
import {
  CANONICAL_INTAKE_QUESTIONS,
  INTAKE_QUESTION_IDS,
  intakeQuestionsFor,
  nextIntakeQuestion,
  type IntakeAnswer,
} from '../routing-flow/intake-questions.ts';
import { isWeightedRoutable, routableSpecialties } from '../routing-flow/specialty-registry.ts';
import { walkAssessment } from './clinical-walk.ts';
import { safetyQuestionIdsForClinicalContext } from '../routing-flow/contextual-safety.ts';

const NOW = '2026-09-21T00:00:00.000Z';
const NEW_R3_RULE_IDS = [
  'generic-severe-breathing',
  'generic-new-neurological-change',
  'generic-unresponsive-or-seizure',
  'lower-abdominal-severe-or-faint',
  'lower-abdominal-heavy-bleeding',
  'eye-sudden-vision-loss-or-injury',
  'nosebleed-prolonged-or-excessive',
  'chest-persistent-spreading-associated',
  'skin-airway-swelling',
  'neck-meningitis-warning-pattern',
  'pediatric-struggling-to-breathe',
  'pediatric-seizure-or-unresponsive',
  'pediatric-unable-to-drink-or-vomits-everything',
  'pediatric-sudden-neurological-change',
] as const;

function patient(age: number, sexForAssessment: SexForAssessment = 'female'): PatientContext {
  return {
    derivedAge: age,
    sexForAssessment,
    accessibilityNeeds: ['none'],
    existingConditions: ['none_known'],
    previousSimilarEpisode: 'no',
    allergyStatus: 'none_known',
    allergies: [],
    medicationStatus: 'none',
    medications: [],
    surgeryStatus: 'no',
  };
}

function contextFor(
  region: BodyRegionDefinition,
  age: number,
  faceSubregionId: FaceRegionId | null,
  concernId: RegionConcernId,
  sex: SexForAssessment = 'female',
): RegionAssessmentContext {
  const concern = concernOptionsFor(region.id, faceSubregionId).find((candidate) => candidate.id === concernId);
  assert.ok(concern);
  return createRegionAssessmentContext({
    regionId: region.id,
    regionLabel: region.label,
    faceSubregionId,
    concern,
    patient: patient(age, sex),
  });
}

function allContexts(ages: readonly number[]): RegionAssessmentContext[] {
  const contexts: RegionAssessmentContext[] = [];
  for (const region of BODY_DOMAIN.regions) {
    const faceIds = region.id === 'face' ? FACE_HIT_REGIONS.map((face) => face.id) : [null];
    for (const faceId of faceIds) {
      for (const concern of concernOptionsFor(region.id, faceId)) {
        for (const age of ages) contexts.push(contextFor(region, age, faceId, concern.id));
      }
    }
  }
  return contexts;
}

test('the intake registry has unique canonical meanings and complete source metadata', () => {
  // 29 core intake concepts, the 6 original Stage B discriminators, the 26
  // branch concepts added by the questionnaire rebuild (throat, head,
  // breathing, abdominal, skin, musculoskeletal, laterality and mouth), and the
  // 7 added by normalization (the nosebleed split and nose, bowel and
  // neurological follow-ups), and the 21 added by the routing reconciliation
  // (chest pain, palpitations, upper digestive, neurological course, facial
  // pain, movement, eye injury, back-into-leg, and the associated location),
  // plus the 12 final-blocker concepts for headache, breathing and upper tummy.
  // 104: tooth features, joint pattern and injury features (questionnaire intelligence pass, PENDING CLINICAL REVIEW).
  // 112: site features, worse-when, home treatment, numbness distribution, leg veins, hernia, breast and temple features (questionnaire expansion phase 2, PENDING CLINICAL REVIEW).
  // 114: urinary features and palpitation triggers (phase 2).
  // 117: nose injury, neck injury and mouth or jaw swelling site (phase 3).
  // 124: neurological duration, face injury features, falls count, getting up, nosebleed frequency, nasal polyp and TMD features (phase 4).
  assert.equal(CANONICAL_INTAKE_QUESTIONS.length, 124);
  assert.equal(new Set(CANONICAL_INTAKE_QUESTIONS.map((question) => question.id)).size, CANONICAL_INTAKE_QUESTIONS.length);
  assert.equal(new Set(CANONICAL_INTAKE_QUESTIONS.map((question) => question.canonicalMeaning)).size, CANONICAL_INTAKE_QUESTIONS.length);
  assert.equal(new Set(CANONICAL_INTAKE_QUESTIONS.map((question) => question.duplicateEquivalenceGroup)).size, CANONICAL_INTAKE_QUESTIONS.length);
  assert.ok(CANONICAL_INTAKE_QUESTIONS.some((question) => question.sourceMetadataLevel === 'direct'));
  assert.ok(CANONICAL_INTAKE_QUESTIONS.some((question) => question.sourceMetadataLevel === 'inherited-family'));
  assert.ok(CANONICAL_INTAKE_QUESTIONS.every((question) => question.sourceIds.length > 0));
});

test('all generated context applications resolve to canonical intake ids', () => {
  const adult = allContexts([34]);
  const pediatric = allContexts([4, 8, 15]);
  // The neck, upper neck and mouth gained a separate sore-throat concern.
  // The chest gained a lump, swelling or breast change concern (questionnaire expansion phase 2, PENDING CLINICAL REVIEW).
  assert.equal(adult.length, 370);
  // +3: the chest lump concern for each child age (questionnaire expansion phase 2).
  assert.equal(pediatric.length, 1110);

  const adultInstances = adult.flatMap((context) => intakeQuestionsFor(context.complaintId, context));
  const pediatricInstances = pediatric.flatMap((context) => intakeQuestionsFor(context.complaintId, context));
  assert.ok(adultInstances.length > 1800);
  assert.ok(pediatricInstances.length > 6000);
  const definitionById = new Map(CANONICAL_INTAKE_QUESTIONS.map((question) => [question.id, question]));
  for (const question of [...adultInstances, ...pediatricInstances]) {
    assert.ok(definitionById.get(question.id as never)?.wordingVariantIds.includes(question.wordingVariantId ?? ''));
  }
});

test('wording, laterality, reporter and artwork sex never create new clinical evidence ids', () => {
  const left = BODY_DOMAIN.regions.find((region) => region.id === 'left-hand')!;
  const right = BODY_DOMAIN.regions.find((region) => region.id === 'right-hand')!;
  const ids = (context: RegionAssessmentContext) => intakeQuestionsFor(context.complaintId, context).map((question) => question.id);
  assert.deepEqual(ids(contextFor(left, 34, null, 'pain', 'male')), ids(contextFor(right, 34, null, 'pain', 'female')));

  const child = contextFor(left, 4, null, 'pain');
  const adolescent = contextFor(left, 15, null, 'pain');
  const childIds = ids(child).filter((id) => id !== INTAKE_QUESTION_IDS.pediatricWellbeing);
  const adolescentIds = ids(adolescent).filter((id) => id !== INTAKE_QUESTION_IDS.pediatricWellbeing);
  assert.deepEqual(childIds, adolescentIds);

});

test('the private pregnancy context has an explicit adult kiosk boundary, not a guessed adolescent threshold', () => {
  const definition = CANONICAL_INTAKE_QUESTIONS.find((question) => question.id === INTAKE_QUESTION_IDS.pregnancyContext)!;
  assert.equal(definition.pediatricApplicable, false);
  assert.deepEqual(definition.pediatricAgeBands, []);
  assert.equal(definition.ageApplicability[0].minimumAgeYears, 18);
  assert.match(definition.ageApplicability[0].sourcePopulation, /no adolescent threshold/i);

  const lower = BODY_DOMAIN.regions.find((region) => region.id === 'lower-abdomen')!;
  const adult = contextFor(lower, 28, null, 'reproductive-pelvic-change');
  const adolescent = contextFor(lower, 15, null, 'reproductive-pelvic-change');
  assert.ok(intakeQuestionsFor(adult.complaintId, adult).some((question) => question.id === definition.id));
  assert.ok(!intakeQuestionsFor(adolescent.complaintId, adolescent).some((question) => question.id === definition.id));
});

test('adult reproductive and neutral pelvic entries are characterized before generic context', () => {
  const lower = BODY_DOMAIN.regions.find((region) => region.id === 'lower-abdomen')!;
  const female = contextFor(lower, 28, null, 'reproductive-pelvic-change', 'female');
  const neutral = contextFor(lower, 28, null, 'reproductive-pelvic-change', 'intersex_or_variation');
  const adolescent = contextFor(lower, 15, null, 'reproductive-pelvic-change', 'female');

  const femaleDetail = intakeQuestionsFor(female.complaintId, female)
    .find((question) => question.id === INTAKE_QUESTION_IDS.reproductiveDetail);
  const neutralDetail = intakeQuestionsFor(neutral.complaintId, neutral)
    .find((question) => question.id === INTAKE_QUESTION_IDS.reproductiveDetail);
  assert.equal(femaleDetail?.physiologyEligibility, 'female-reproductive-branch');
  assert.equal(neutralDetail?.physiologyEligibility, 'explicit-neutral-context');
  assert.doesNotMatch(neutralDetail?.options.map((option) => option.label).join(' ') ?? '', /pregnan|cycle/i);
  assert.ok(!intakeQuestionsFor(adolescent.complaintId, adolescent)
    .some((question) => question.id === INTAKE_QUESTION_IDS.reproductiveDetail));
});

test('male and unrelated female branches never expose reproductive or pregnancy questions', () => {
  const lower = BODY_DOMAIN.regions.find((region) => region.id === 'lower-abdomen')!;
  const face = BODY_DOMAIN.regions.find((region) => region.id === 'face')!;
  const maleLowerOptions = concernOptionsFor(lower.id, null, { age: 31, sexForAssessment: 'male' });
  assert.ok(!maleLowerOptions.some((option) => option.id === 'reproductive-pelvic-change'));

  const maleLower = contextFor(lower, 31, null, 'pain', 'male');
  const femaleEar = contextFor(face, 31, 'patient-left-ear', 'pain', 'female');
  for (const context of [maleLower, femaleEar]) {
    const questions = intakeQuestionsFor(context.complaintId, context);
    assert.ok(!questions.some((question) => /pregnan|menstrual|vaginal|obstetric|gynaec/i.test(`${question.prompt} ${question.options.map((option) => option.label).join(' ')}`)));
  }
});

test('intersex or variation remains a neutral explicit-context path', () => {
  const lower = BODY_DOMAIN.regions.find((region) => region.id === 'lower-abdomen')!;
  const option = concernOptionsFor(lower.id, null, { age: 31, sexForAssessment: 'intersex_or_variation' })
    .find((candidate) => candidate.id === 'reproductive-pelvic-change');
  assert.equal(option?.label, 'Pelvic or genital change');
  const context = contextFor(lower, 31, null, 'reproductive-pelvic-change', 'intersex_or_variation');
  assert.ok(intakeQuestionsFor(context.complaintId, context).some((question) => question.id === INTAKE_QUESTION_IDS.reproductiveDetail));
  assert.ok(!intakeQuestionsFor(context.complaintId, context).some((question) => question.id === INTAKE_QUESTION_IDS.pregnancyContext));
});

test('enabled endpoints are four scored routes, eleven rule-gated routes and two population fallbacks', () => {
  const endpoints = routableSpecialties();
  assert.deepEqual(endpoints.map((endpoint) => endpoint.id).toSorted(), [
    'cardiology',
    // Rheumatology (NICE NG100) and Dentistry (NHS) joined (questionnaire intelligence pass, PENDING CLINICAL REVIEW).
    'clinical-immunology-rheumatology',
    'dentistry',
    'dermatology',
    'general-medicine',
    // General Surgery (NHS Hernia, NHS Breast lumps) and Vascular Surgery (NICE CG168) joined (questionnaire expansion phase 2, PENDING CLINICAL REVIEW).
    'general-surgery',
    // Geriatric Medicine (NICE NG249 falls criteria, 65 and over) joined in phase 4, PENDING CLINICAL REVIEW.
    'geriatric-medicine',
    'medical-gastroenterology',
    'neurology',
    'obstetrics-gynaecology',
    'ophthalmology',
    'orthopaedics',
    'otorhinolaryngology',
    'paediatrics',
    'respiratory-medicine',
    'urology',
    'vascular-surgery',
  ]);
  assert.equal(endpoints.filter((endpoint) => endpoint.evidenceStatus === 'active-demonstration').length, 4);
  assert.equal(endpoints.filter((endpoint) => endpoint.evidenceStatus === 'fallback-endpoint').length, 2);
  // Neurology joined through NICE NG127 criteria in the routing reconciliation.
  assert.equal(endpoints.filter((endpoint) => endpoint.evidenceStatus === 'rule-gated-referral-criteria').length, 11);

  // The two bases stay distinguishable: a rule-gated route can never be
  // selected by the belief vector. Dermatology keeps its frozen R1 key only so
  // the vector still renders; it is not weighted-routable.
  for (const endpoint of endpoints.filter((candidate) => candidate.evidenceStatus === 'rule-gated-referral-criteria')) {
    assert.equal(endpoint.directionGated, true, endpoint.id);
    assert.equal(isWeightedRoutable(endpoint), false, endpoint.id);
    assert.ok(endpoint.supportedComplaints.length > 0, endpoint.id);
  }
  assert.deepEqual(
    endpoints.filter(isWeightedRoutable).map((endpoint) => endpoint.id).toSorted(),
    ['cardiology', 'medical-gastroenterology', 'orthopaedics', 'respiratory-medicine'],
  );
});

test('fallback-only complaint families have no directional questions or specialist weights', () => {
  const fallbackIds = [...GENERIC_ADULT_COMPLAINT_IDS, ...PEDIATRIC_COMPLAINT_IDS];
  // 13 original families, the new throat family and the four paediatric
  // coverage twins of the weighted complaints.
  assert.equal(GENERIC_ADULT_COMPLAINT_IDS.length, 18);
  assert.equal(PEDIATRIC_COMPLAINT_IDS.length, 3);
  for (const complaintId of fallbackIds) {
    const complaint = R2B_DEMONSTRATION_KNOWLEDGE.complaints.find((candidate) => candidate.id === complaintId)!;
    assert.equal(complaint.routingMode, 'fallback_only');
    assert.deepEqual(complaint.questionIds, []);
    assert.equal(complaint.prior.status, 'ready');
    if (complaint.prior.status !== 'ready') continue;
    const values = Object.values(complaint.prior.value);
    assert.equal(new Set(values).size, 1);
  }
});

test('expanded emergency R3 rules are deterministic hard stops with direct source and reachable questions', () => {
  const questionIds = new Set(R3_SAFETY_KNOWLEDGE.questions.map((question) => question.id));
  const sourceIds = new Set(R3_SAFETY_KNOWLEDGE.sources.map((source) => source.id));
  for (const ruleId of NEW_R3_RULE_IDS) {
    const rule = R3_RED_FLAG_RULES.find((candidate) => candidate.id === ruleId);
    assert.ok(rule, ruleId);
    assert.equal(rule.continuationPolicy, 'must_stop');
    assert.ok(rule.requiredQuestionIds.every((questionId) => questionIds.has(questionId)), ruleId);
    assert.ok(rule.provenanceIds.length > 0, ruleId);
    assert.ok(rule.provenanceIds.every((sourceId) => sourceIds.has(sourceId)), ruleId);
  }
});

test('every R2 and R3 question is reachable from a complaint or safety rule', () => {
  const routingReferences = new Set(R2B_DEMONSTRATION_KNOWLEDGE.complaints.flatMap((complaint) => complaint.questionIds));
  assert.ok(R2B_DEMONSTRATION_KNOWLEDGE.questions.every((question) => routingReferences.has(question.id)));

  const safetyReferences = new Set(R3_RED_FLAG_RULES.flatMap((rule) => rule.requiredQuestionIds));
  assert.ok(R3_SAFETY_KNOWLEDGE.questions.every((question) => safetyReferences.has(question.id)));
});

test('question selection stays inside the active anatomy and complaint branch', () => {
  const face = BODY_DOMAIN.regions.find((region) => region.id === 'face')!;
  const lower = BODY_DOMAIN.regions.find((region) => region.id === 'lower-abdomen')!;
  const cases = [
    { context: contextFor(face, 34, 'patient-right-ear', 'hearing-balance-change'), first: INTAKE_QUESTION_IDS.earDetail },
    { context: contextFor(face, 34, 'nose', 'nose-change'), first: INTAKE_QUESTION_IDS.noseDetail },
    { context: contextFor(face, 34, 'patient-left-eye', 'vision-change'), first: INTAKE_QUESTION_IDS.eyeDetail },
    { context: contextFor(face, 34, 'patient-left-jaw', 'movement-function'), first: INTAKE_QUESTION_IDS.jawDetail },
    { context: contextFor(lower, 34, null, 'urinary-change'), first: INTAKE_QUESTION_IDS.urinaryDetail },
    { context: contextFor(face, 4, 'patient-left-ear', 'pain'), first: INTAKE_QUESTION_IDS.pediatricEarObservation },
  ];
  for (const { context, first } of cases) {
    const questions = intakeQuestionsFor(context.complaintId, context);
    const answers: IntakeAnswer[] = [{ questionId: INTAKE_QUESTION_IDS.complaintEntry, optionId: context.concernId, answeredAt: NOW }];
    assert.equal(nextIntakeQuestion(questions, answers)?.id, first, context.complaintLabel);
    assert.ok(questions.every((question) => question.branchIds?.includes(context.concernId)), context.complaintLabel);
  }
});

test('contextual safety eligibility avoids unrelated emergency checklists', () => {
  const face = BODY_DOMAIN.regions.find((region) => region.id === 'face')!;
  const adultEar = contextFor(face, 34, 'patient-right-ear', 'pain');
  const adultNosebleed = contextFor(face, 34, 'nose', 'bleeding-discharge');
  const adultVision = contextFor(face, 34, 'patient-left-eye', 'vision-change');
  const childEar = contextFor(face, 4, 'patient-left-ear', 'pain');
  const schoolAgeHearing = contextFor(face, 8, 'patient-left-ear', 'hearing-balance-change');
  assert.deepEqual(safetyQuestionIdsForClinicalContext(adultEar, []), []);
  assert.deepEqual(safetyQuestionIdsForClinicalContext(adultNosebleed, []), ['safety-nosebleed-prolonged-or-excessive']);
  assert.deepEqual(safetyQuestionIdsForClinicalContext(adultVision, []), [
    'safety-eye-sudden-vision-loss-or-injury',
  ]);
  // IMNCI: every sick child under five is checked for the general danger
  // signs, and every under-five ear problem for tender swelling behind the ear.
  assert.deepEqual(safetyQuestionIdsForClinicalContext(childEar, []), [
    'safety-pediatric-severe-breathing',
    'safety-pediatric-unresponsive-or-seizure',
    'safety-pediatric-under-five-feeding-vomiting',
    'safety-pediatric-under-five-ear-swelling',
  ]);
  assert.deepEqual(safetyQuestionIdsForClinicalContext(schoolAgeHearing, []), []);
  assert.deepEqual(safetyQuestionIdsForClinicalContext(schoolAgeHearing, [{
    questionId: INTAKE_QUESTION_IDS.pediatricEarObservation,
    optionId: 'balance',
    answeredAt: NOW,
  }]), [
    'safety-pediatric-sudden-neurological-change',
  ]);
});

test('pregnancy follow-up depends on an adult female reproductive branch', () => {
  const lower = BODY_DOMAIN.regions.find((region) => region.id === 'lower-abdomen')!;
  const femalePain = contextFor(lower, 29, null, 'pain', 'female');
  const plan = intakeQuestionsFor(femalePain.complaintId, femalePain);
  const answers: IntakeAnswer[] = [
    { questionId: INTAKE_QUESTION_IDS.complaintEntry, optionId: 'pain', answeredAt: NOW },
    { questionId: INTAKE_QUESTION_IDS.lowerAssociatedSystem, optionId: 'none', answeredAt: NOW },
  ];
  const unanswered = plan.filter((question) => !answers.some((answer) => answer.questionId === question.id));
  assert.ok(!unanswered.some((question) => question.id === INTAKE_QUESTION_IDS.pregnancyContext && !question.showWhen));
  const pregnancy = plan.find((question) => question.id === INTAKE_QUESTION_IDS.pregnancyContext)!;
  assert.deepEqual(pregnancy.showWhen, {
    questionId: INTAKE_QUESTION_IDS.lowerAssociatedSystem,
    optionIds: ['reproductive'],
  });
  assert.notEqual(nextIntakeQuestion([pregnancy], answers)?.id, INTAKE_QUESTION_IDS.pregnancyContext);
});

test('normal synthetic question budgets remain bounded without increasing routing limits', () => {
  /*
    Measured through the live flow (contextual safety filter, interview plan
    and route resolver), with safety counted apart from routing depth as the
    budget rule requires. Branch depth grows only where a branch has more to
    ask; safety never consumes it.
  */
  const walks = (ages: readonly number[]) => allContexts(ages).map((context) => walkAssessment(context));
  const median = (values: readonly number[]) => values.toSorted((a, b) => a - b)[Math.floor(values.length / 2)];
  for (const [label, run] of [['adult', walks([34])], ['pediatric', walks([4, 8, 15])]] as const) {
    assert.ok(run.every((walk) => walk.outcome !== 'guard'), `${label}: an interview did not terminate`);
    const depth = run.map((walk) => walk.counts.context + walk.counts.discrimination + walk.counts.routing);
    const safety = run.map((walk) => walk.counts.safety);
    assert.ok(median(depth) <= 10, `${label}: median depth ${median(depth)}`);
    assert.ok(Math.max(...depth) <= 12, `${label}: deepest branch ${Math.max(...depth)}`);
    assert.ok(Math.max(...safety) <= 8, `${label}: ${Math.max(...safety)} safety checks`);
    assert.ok(run.every((walk) => walk.steps.length <= 16), `${label}: an interview exceeded 16 interactions`);
  }
  // The thresholds are unchanged. The question limit is now the whole approved
  // six-question set, and a numerical lead must also be sufficiently supported
  // before it ends the interview (docs/clinical-expansion, PENDING CLINICAL
  // REVIEW). Any further change here needs the same review.
  assert.equal(DEMONSTRATION_ENGINE_CONFIG.maxQuestions, 6);
  assert.deepEqual(DEMONSTRATION_ENGINE_CONFIG.sufficiency, {
    requireAllConditions: true,
    minimumSupportingFindings: 3,
    minimumIndependentDimensions: 2,
  });
  assert.equal(DEMONSTRATION_ENGINE_CONFIG.topProbabilityThreshold, 0.72);
  assert.equal(DEMONSTRATION_ENGINE_CONFIG.marginThreshold, 0.35);
});
