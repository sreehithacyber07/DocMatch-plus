import assert from 'node:assert/strict';
import test from 'node:test';
import { BODY_DOMAIN, type BodyRegionDefinition } from '../../body/index.ts';
import {
  answerSessionQuestion,
  createRoutingSession,
  type RoutingSession,
} from '../../engine/index.ts';
import {
  DEMONSTRATION_ENGINE_CONFIG,
  materializeDemonstrationComplaint,
  R2B_DEMONSTRATION_KNOWLEDGE,
} from '../../engine/data/index.ts';
import {
  evaluateSafetyController,
  R3_SAFETY_KNOWLEDGE,
  recordSafetyAnswer,
  type SafetyAnswer,
} from '../../engine/safety/index.ts';
import type { PatientContext, SexForAssessment } from '../intake/patient-context.ts';
import {
  BODY_REGION_COVERAGE_MATRIX,
  CLINICAL_COVERAGE_SOURCES,
  concernOptionsFor,
  createRegionAssessmentContext,
  GENERIC_ADULT_COMPLAINT_IDS,
  PEDIATRIC_COMPLAINT_IDS,
  pediatricAgeBand,
  reporterModeFor,
  type RegionAssessmentContext,
  type RegionConcernId,
} from '../body-explorer/clinical-coverage.ts';
import { FACE_HIT_REGIONS, type FaceRegionId } from '../body-explorer/faceHitMap.ts';
import {
  CANONICAL_INTAKE_QUESTIONS,
  INTAKE_QUESTION_IDS,
  intakeOptionLabel,
  intakePlanFor,
  intakeQuestionsFor,
  nextIntakeQuestion,
  type IntakeAnswer,
} from '../routing-flow/intake-questions.ts';
import { GENERAL_MEDICINE, PAEDIATRICS } from '../routing-flow/specialty-registry.ts';

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
  faceSubregionId: FaceRegionId | null = null,
  concernId?: RegionConcernId,
  sex: SexForAssessment = 'female',
): RegionAssessmentContext {
  const choices = concernOptionsFor(region.id, faceSubregionId);
  const concern = concernId ? choices.find((candidate) => candidate.id === concernId) : choices[0];
  assert.ok(concern, `${region.id}/${faceSubregionId ?? 'body'} missing concern ${concernId ?? 'first'}`);
  return createRegionAssessmentContext({
    regionId: region.id,
    regionLabel: region.label,
    faceSubregionId,
    concern,
    patient: patient(age, sex),
  });
}

function walkIntake(context: RegionAssessmentContext): readonly IntakeAnswer[] {
  const plan = intakePlanFor(context.complaintId, context);
  const questions = [...plan.preScreen, ...plan.postScreen];
  assert.ok(questions.length >= 4, `${context.bodyRegionId} has too few adaptive questions`);
  for (const question of questions) {
    assert.equal(question.complaintFamily, context.complaintId);
    if (context.complaintId.startsWith('pediatric-')) {
      assert.equal(question.applicability, context.patientMode);
    }
    assert.ok(question.sourceIds?.length, `${question.id} has no source`);
    const registeredSources = new Set(CLINICAL_COVERAGE_SOURCES.map((source) => source.id));
    assert.ok(question.sourceIds?.every((sourceId) => registeredSources.has(sourceId)), `${question.id} has an unregistered source`);
    assert.ok(question.rationale?.length, `${question.id} has no rationale`);
    assert.ok(question.routingEvidencePurpose?.includes('no numeric specialty likelihood'));
  }

  const answers: IntakeAnswer[] = [{
    questionId: questions[0].id,
    optionId: context.concernId,
    answeredAt: '2026-09-21T00:00:00.000Z',
  }];
  for (let sequence = 1; sequence <= 20; sequence += 1) {
    const next = nextIntakeQuestion(questions, answers);
    if (!next) return answers;
    answers.push({
      questionId: next.id,
      optionId: next.options[0].id,
      answeredAt: `2026-09-21T00:00:${String(sequence).padStart(2, '0')}.000Z`,
    });
  }
  assert.fail(`${context.bodyRegionId} intake did not terminate`);
}

function walkRouting(context: RegionAssessmentContext): 'result' | 'interrupted' {
  let complaint = materializeDemonstrationComplaint(R2B_DEMONSTRATION_KNOWLEDGE, context.complaintId, []);
  let session: RoutingSession = createRoutingSession(context.complaintId, complaint.prior, '2026-09-21T00:00:00.000Z');
  let safetyAnswers: readonly SafetyAnswer[] = [];
  const fallbackOnly = [...GENERIC_ADULT_COMPLAINT_IDS, ...PEDIATRIC_COMPLAINT_IDS].includes(context.complaintId as never);
  const config = fallbackOnly ? { ...DEMONSTRATION_ENGINE_CONFIG, maxQuestions: 1 } : DEMONSTRATION_ENGINE_CONFIG;

  for (let sequence = 1; sequence <= 30; sequence += 1) {
    complaint = materializeDemonstrationComplaint(
      R2B_DEMONSTRATION_KNOWLEDGE,
      context.complaintId,
      session.answers.map(({ questionId, optionId }) => ({ questionId, optionId })),
    );
    const controller = evaluateSafetyController({
      session,
      complaint,
      safetyAnswers,
      safetyKnowledge: R3_SAFETY_KNOWLEDGE,
      engineConfig: config,
    });
    if (controller.status === 'result' || controller.status === 'interrupted') return controller.status;
    if (controller.status === 'safety-screening') {
      if (controller.question.answerTarget === 'safety_state') {
        safetyAnswers = recordSafetyAnswer(safetyAnswers, controller.question, {
          questionId: controller.question.id,
          optionId: 'no',
          answeredAt: `2026-09-21T00:01:${String(sequence).padStart(2, '0')}.000Z`,
        });
      } else {
        session = answerSessionQuestion(session, {
          questionId: controller.question.id,
          optionId: 'no',
          answeredAt: `2026-09-21T00:01:${String(sequence).padStart(2, '0')}.000Z`,
        }, complaint.questions, config.posteriorFloor);
      }
      continue;
    }
    const optionId = controller.selection.question.options.some((option) => option.id === 'no')
      ? 'no'
      : controller.selection.question.options[0].id;
    session = answerSessionQuestion(session, {
      questionId: controller.selection.question.id,
      optionId,
      answeredAt: `2026-09-21T00:01:${String(sequence).padStart(2, '0')}.000Z`,
    }, complaint.questions, config.posteriorFloor);
  }
  assert.fail(`${context.complaintId} routing did not terminate`);
}

test('BODY_REGION_COVERAGE_MATRIX contains every canonical body region as supported', () => {
  assert.equal(BODY_REGION_COVERAGE_MATRIX.length, 33);
  assert.deepEqual(
    BODY_REGION_COVERAGE_MATRIX.map((row) => row.regionId).toSorted(),
    BODY_DOMAIN.regions.map((region) => region.id).toSorted(),
  );
  for (const row of BODY_REGION_COVERAGE_MATRIX) {
    assert.equal(row.coverageStatus, 'SUPPORTED');
    assert.ok(row.adultComplaintFamilies.length > 0);
    // A child keeps the anatomical family; the legacy age-band ids are never produced.
    assert.ok(row.pediatricComplaintFamilies.length > 0);
    assert.ok(row.pediatricComplaintFamilies.every((family) => !(PEDIATRIC_COMPLAINT_IDS as readonly string[]).includes(family)));
    assert.ok(row.questionSetIds.length >= 2);
    assert.ok(row.safetyRules.length > 0);
    assert.ok(row.possibleDestinationFamilies.length > 0);
    assert.ok(row.sourceIds.length > 0);
  }
});

test('canonical intake ids describe one clinical concept across context and wording variants', () => {
  const canonicalIds = CANONICAL_INTAKE_QUESTIONS.map((question) => question.id);
  assert.equal(new Set(canonicalIds).size, canonicalIds.length);
  // 29 core intake concepts, 6 original discriminators, 26 rebuild branch
  // concepts, and 7 from normalization: the nosebleed concept split from the
  // sinonasal one, plus the nose, bowel and neurological follow-ups; and 21
  // from the routing reconciliation (chest pain, palpitations, upper digestive,
  // neurological course, facial pain, movement, eye injury, back-into-leg and
  // the associated location), plus the 12 final-blocker concepts for headache,
  // breathing and upper tummy.
  assert.equal(canonicalIds.length, 117);

  const left = BODY_DOMAIN.regions.find((region) => region.id === 'left-forearm')!;
  const right = BODY_DOMAIN.regions.find((region) => region.id === 'right-forearm')!;
  const adultLeft = intakePlanFor('general-region-concern', contextFor(left, 34, null, 'other'));
  const adultRight = intakePlanFor('general-region-concern', contextFor(right, 34, null, 'other'));
  const child = intakePlanFor('pediatric-under-five-region-concern', contextFor(left, 4, null, 'other'));
  const adolescent = intakePlanFor('pediatric-adolescent-region-concern', contextFor(right, 15, null, 'other'));

  const ids = (plan: ReturnType<typeof intakePlanFor>) => [...plan.preScreen, ...plan.postScreen].map((question) => question.id);
  assert.deepEqual(ids(adultLeft), ids(adultRight));
  assert.deepEqual(ids(child).filter((id) => id !== INTAKE_QUESTION_IDS.pediatricWellbeing), ids(adultLeft));
  assert.deepEqual(ids(adolescent), ids(child));

  const adultImpact = [...adultLeft.preScreen, ...adultLeft.postScreen].find((question) => question.id === INTAKE_QUESTION_IDS.currentImpact)!;
  const childImpact = [...child.preScreen, ...child.postScreen].find((question) => question.id === INTAKE_QUESTION_IDS.currentImpact)!;
  assert.notEqual(adultImpact.prompt, childImpact.prompt);
  assert.equal(adultImpact.canonicalMeaning, childImpact.canonicalMeaning);
  assert.equal(adultImpact.duplicateEquivalenceGroup, childImpact.duplicateEquivalenceGroup);
});

test('every body region has a complete adult and pediatric question-to-result path', () => {
  for (const region of BODY_DOMAIN.regions) {
    const face = region.id === 'face' ? 'face-general' : null;
    const adult = contextFor(region, 34, face);
    const child = contextFor(region, 8, face);
    assert.ok(walkIntake(adult).length >= 4, `${region.id} adult intake`);
    assert.ok(walkIntake(child).length >= 4, `${region.id} pediatric intake`);
    assert.equal(walkRouting(adult), 'result', `${region.id} adult route`);
    assert.equal(walkRouting(child), 'result', `${region.id} pediatric route`);
    assert.equal(child.patientMode, 'pediatric');
  }
  assert.equal(GENERAL_MEDICINE.routingEnabled, true);
  assert.equal(PAEDIATRICS.routingEnabled, true);
  assert.equal(PAEDIATRICS.evidenceStatus, 'fallback-endpoint');
});

test('all 16 face subregions stay in the Face domain for both artwork sexes and pediatric mode', () => {
  const face = BODY_DOMAIN.regions.find((region) => region.id === 'face')!;
  for (const hit of FACE_HIT_REGIONS) {
    for (const sex of ['male', 'female'] as const) {
      const adult = contextFor(face, 30, hit.id, undefined, sex);
      assert.equal(adult.bodyRegionId, 'face');
      assert.equal(adult.faceSubregionId, hit.id);
      assert.notEqual(adult.complaintId, 'headache');
      assert.notEqual(adult.complaintId, 'neck-concern');
      assert.ok(walkIntake(adult).length >= 4);
      assert.equal(walkRouting(adult), 'result');
    }
    const child = contextFor(face, 9, hit.id);
    const expectedAdultComplaint = contextFor(face, 30, hit.id, undefined, 'male').complaintId;
    assert.equal(child.complaintId, expectedAdultComplaint);
    assert.equal(walkRouting(child), 'result');
  }
});

test('face eye, ear, oral and neurological evidence branches only after complaint entry', () => {
  const face = BODY_DOMAIN.regions.find((region) => region.id === 'face')!;
  assert.equal(contextFor(face, 30, 'patient-right-eye', 'vision-change').complaintId, 'face-eye-concern');
  assert.equal(contextFor(face, 30, 'patient-left-ear', 'hearing-balance-change').complaintId, 'face-ear-concern');
  assert.equal(contextFor(face, 30, 'patient-right-jaw', 'movement-function').complaintId, 'face-oral-jaw-concern');
  assert.equal(contextFor(face, 30, 'patient-left-cheek', 'weakness-drooping').complaintId, 'face-neurologic-concern');
  assert.equal(contextFor(face, 30, 'forehead', 'skin-change').complaintId, 'face-general-concern');
});

test('lower abdomen adaptively covers bowel, urinary, reproductive, movement and systemic evidence', () => {
  const lower = BODY_DOMAIN.regions.find((region) => region.id === 'lower-abdomen')!;
  const expected = ['pain', 'bowel-change', 'urinary-change', 'reproductive-pelvic-change', 'injury', 'other'] as const;
  for (const concernId of expected) {
    const context = contextFor(lower, 28, null, concernId);
    assert.equal(
      context.complaintId,
      concernId === 'reproductive-pelvic-change'
        ? 'lower-abdominal-reproductive-concern'
        : 'lower-abdominal-pelvic-concern',
    );
    const questions = intakeQuestionsFor(context.complaintId, context);
    // A branch named at entry is explored directly; any other entry asks which
    // system is involved and opens that branch.
    const branchQuestion = concernId === 'bowel-change'
      ? INTAKE_QUESTION_IDS.bowelDetail
      : concernId === 'urinary-change'
        ? INTAKE_QUESTION_IDS.urinaryDetail
        : concernId === 'reproductive-pelvic-change'
          ? INTAKE_QUESTION_IDS.reproductiveDetail
          : INTAKE_QUESTION_IDS.lowerAssociatedSystem;
    assert.ok(questions.some((question) => question.id === branchQuestion), concernId);
    assert.ok(walkIntake(context).length >= 3);
    assert.equal(walkRouting(context), 'result');
  }

  const reproductive = contextFor(lower, 28, null, 'reproductive-pelvic-change');
  const plan = { postScreen: intakeQuestionsFor(reproductive.complaintId, reproductive) };
  const painPlan = intakeQuestionsFor('lower-abdominal-pelvic-concern', contextFor(lower, 28, null, 'pain'));
  const system = painPlan.find((question) => question.id === INTAKE_QUESTION_IDS.lowerAssociatedSystem)!;

  // Two sensitive questions live on this branch and both stay private in the
  // session trail: the pregnancy context, which is gated on the patient having
  // chosen the reproductive branch at the entry question, and the cycle-timing
  // discriminator the OBGYN criteria turn on.
  const pregnancy = plan.postScreen.find((question) => question.id === INTAKE_QUESTION_IDS.pregnancyContext)!;
  const timing = plan.postScreen.find((question) => question.id === INTAKE_QUESTION_IDS.reproductiveTiming)!;
  assert.equal(pregnancy.sensitive, true);
  assert.equal(timing.sensitive, true);
  assert.deepEqual(pregnancy.showWhen, {
    questionId: INTAKE_QUESTION_IDS.complaintEntry,
    optionIds: ['reproductive-pelvic-change'],
  });
  assert.equal(timing.physiologyEligibility, 'female-reproductive-branch');
  assert.equal(intakeOptionLabel(system, 'reproductive'), 'Response recorded privately');
  assert.equal(intakeOptionLabel(pregnancy, 'yes'), 'Response recorded privately');
  assert.equal(intakeOptionLabel(timing, 'between-periods'), 'Response recorded privately');

  const adolescent = contextFor(lower, 16, null, 'reproductive-pelvic-change');
  assert.equal(intakeQuestionsFor(adolescent.complaintId, adolescent).some((question) => question.sensitive), false);
});

test('lower-abdominal hard-stop warning answers interrupt before routing', () => {
  const lower = BODY_DOMAIN.regions.find((region) => region.id === 'lower-abdomen')!;
  const context = contextFor(lower, 31, null, 'pain');
  const complaint = materializeDemonstrationComplaint(R2B_DEMONSTRATION_KNOWLEDGE, context.complaintId, []);
  const session = createRoutingSession(context.complaintId, complaint.prior, '2026-09-21T00:00:00.000Z');
  const controller = evaluateSafetyController({
    session,
    complaint,
    safetyAnswers: [{
      questionId: 'safety-lower-abdominal-severe-or-faint',
      optionId: 'yes',
      answeredAt: '2026-09-21T00:00:01.000Z',
    }],
    safetyKnowledge: R3_SAFETY_KNOWLEDGE,
    engineConfig: { ...DEMONSTRATION_ENGINE_CONFIG, maxQuestions: 1 },
  });
  assert.equal(controller.status, 'interrupted');
  if (controller.status === 'interrupted') assert.equal(controller.selectedRuleId, 'lower-abdominal-severe-or-faint');
});

test('neck concerns retain distinct symptom-led branches without a diagnosis or direct specialty route', () => {
  const neck = BODY_DOMAIN.regions.find((region) => region.id === 'neck')!;
  const concernIds = ['pain', 'swelling-lump', 'numbness-tingling', 'weakness-drooping', 'injury', 'skin-change', 'other'] as const;
  const complaintIds = new Set<string>();
  for (const concernId of concernIds) {
    const context = contextFor(neck, 36, null, concernId);
    complaintIds.add(context.complaintId);
    const questions = intakeQuestionsFor(context.complaintId, context);
    assert.ok(questions.some((question) => question.id === INTAKE_QUESTION_IDS.neckDetail), concernId);
    assert.ok(walkIntake(context).length >= 4);
    assert.equal(walkRouting(context), 'result');
    assert.doesNotMatch(context.complaintLabel, /cancer|thyroid disease|diagnosis/i);
  }
  assert.ok(complaintIds.has('neck-concern'));
  assert.ok(complaintIds.has('regional-skin-concern'));

  // A sore throat and a voice or swallowing change are their own throat branch.
  for (const concernId of ['throat', 'voice-swallow'] as const) {
    const context = contextFor(neck, 36, null, concernId);
    assert.equal(context.complaintId, 'throat-concern');
    assert.ok(intakeQuestionsFor(context.complaintId, context).some((question) => question.id === INTAKE_QUESTION_IDS.throatDetail));
    assert.equal(walkRouting(context), 'result');
  }
});

test('chest concerns branch from stated symptoms instead of location alone', () => {
  const chest = BODY_DOMAIN.regions.find((region) => region.id === 'chest')!;
  const concernIds = ['pain', 'breathing', 'palpitations', 'voice-swallow', 'injury', 'skin-change', 'other'] as const;
  const complaintIds = new Set<string>();
  for (const concernId of concernIds) {
    const context = contextFor(chest, 42, null, concernId);
    complaintIds.add(context.complaintId);
    assert.ok(walkIntake(context).length >= 4);
    assert.equal(walkRouting(context), 'result');
  }
  assert.ok(complaintIds.has('shortness-of-breath'));
  assert.ok(complaintIds.has('chest-concern'));
  assert.ok(complaintIds.has('regional-skin-concern'));
});

test('pediatric mode uses age-aware bands, caregiver wording and Paediatrics fallback', () => {
  assert.equal(pediatricAgeBand(0), 'infant-under-one');
  assert.equal(pediatricAgeBand(4), 'young-child');
  assert.equal(pediatricAgeBand(5), 'school-age');
  assert.equal(pediatricAgeBand(12), 'adolescent');
  assert.equal(pediatricAgeBand(17), 'adolescent');
  assert.equal(pediatricAgeBand(18), null);
  // The voice is locked once: 0 to 11 caregiver, 12 to 17 whoever the
  // acknowledgement recorded (caregiver when not recorded), 18+ self.
  assert.equal(reporterModeFor(4), 'caregiver');
  assert.equal(reporterModeFor(15), 'caregiver');
  assert.equal(reporterModeFor(15, 'self'), 'patient');
  assert.equal(reporterModeFor(34), 'patient');

  const lower = BODY_DOMAIN.regions.find((region) => region.id === 'lower-abdomen')!;
  for (const age of [0, 4, 8, 15]) {
    const context = contextFor(lower, age);
    assert.equal(context.complaintId, 'lower-abdominal-pelvic-concern');
    assert.equal(walkRouting(context), 'result');
  }
});
