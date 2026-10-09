/**
 * The direction gate, the discrimination stop condition and the fallback guard.
 *
 * These drive the real modules the live interview drives. Nothing here changes
 * a rule, a predicate, a likelihood or a threshold, and nothing here asserts a
 * probability for a rule-gated route, because none exists.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { BODY_DOMAIN, type BodyRegionId } from '../../body/index.ts';
import { DEMONSTRATION_ENGINE_CONFIG } from '../../engine/data/index.ts';
import {
  CLINICAL_COVERAGE_SOURCES,
  concernOptionsFor,
  createRegionAssessmentContext,
  type RegionAssessmentContext,
  type RegionConcernId,
} from '../body-explorer/clinical-coverage.ts';
import { FACE_HIT_REGIONS, type FaceRegionId } from '../body-explorer/faceHitMap.ts';
import type { PatientContext, SexForAssessment } from '../intake/patient-context.ts';
import {
  DIRECTION_CRITERIA_SETS,
  evaluateDirectionGate,
  FALLBACK_REASON_TEXT,
  reproductiveBranchEligible,
} from '../routing-flow/direction-gate.ts';
import {
  assertNoUsefulDiscriminatorsRemain,
  budgetFromAnswers,
  countQuestion,
  EMPTY_BUDGET,
  MAX_DISCRIMINATION_EXTENSION,
  shouldContinueDiscrimination,
} from '../routing-flow/discrimination.ts';
import {
  DIRECTION_GATE_QUESTION_IDS,
  INTAKE_QUESTION_IDS,
  intakePlanFor,
  intakeQuestionsFor,
  type IntakeAnswer,
} from '../routing-flow/intake-questions.ts';
import { resolveRouteOutcome } from '../routing-flow/route-outcome.ts';
import { isWeightedRoutable, SPECIALTY_REGISTRY } from '../routing-flow/specialty-registry.ts';

const NOW = '2026-09-22T00:00:00.000Z';

function patient(age: number, sexForAssessment: SexForAssessment): PatientContext {
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
  regionId: BodyRegionId,
  faceSubregionId: FaceRegionId | null,
  concernId: RegionConcernId,
  age: number,
  sex: SexForAssessment = 'female',
): RegionAssessmentContext {
  const region = BODY_DOMAIN.regions.find((candidate) => candidate.id === regionId);
  assert.ok(region, regionId);
  const concern = concernOptionsFor(regionId, faceSubregionId, { age, sexForAssessment: sex })
    .find((candidate) => candidate.id === concernId);
  assert.ok(concern, `${regionId}/${faceSubregionId ?? '-'}/${concernId}`);
  return createRegionAssessmentContext({
    regionId,
    regionLabel: region.label,
    faceSubregionId,
    concern,
    patient: patient(age, sex),
  });
}

function answers(context: RegionAssessmentContext, pairs: Readonly<Record<string, string>>): IntakeAnswer[] {
  const plan = intakeQuestionsFor(context.complaintId, context);
  const entry = plan[0];
  const built: IntakeAnswer[] = entry
    ? [{ questionId: entry.id, optionId: context.concernId, answeredAt: NOW }]
    : [];
  for (const [questionId, optionId] of Object.entries(pairs)) {
    const question = plan.find((candidate) => candidate.id === questionId);
    assert.ok(question, `${questionId} is not offered for ${context.complaintId}`);
    assert.ok(
      question.options.some((option) => option.id === optionId),
      `${questionId} cannot answer ${optionId}`,
    );
    built.push({ questionId, optionId, answeredAt: NOW });
  }
  return built;
}

function route(context: RegionAssessmentContext, pairs: Readonly<Record<string, string>>) {
  return resolveRouteOutcome({
    clinicalContext: context,
    complaintId: context.complaintId,
    intakeAnswers: answers(context, pairs),
    // A coverage complaint never converges: it has no routing questions at all.
    stoppingDecision: { reason: 'max_questions' },
    engineSpecialtyId: 'dermatology',
  });
}

/* --- The gate itself ------------------------------------------------------ */

test('every criterion cites a registered source and names the published wording it encodes', () => {
  const registered = new Set(CLINICAL_COVERAGE_SOURCES.map((source) => source.id));
  const registryIds = new Set(SPECIALTY_REGISTRY.map((record) => record.id));
  for (const set of DIRECTION_CRITERIA_SETS) {
    assert.ok(registryIds.has(set.directionId), `${set.directionId} is not in the registry`);
    const record = SPECIALTY_REGISTRY.find((candidate) => candidate.id === set.directionId)!;
    assert.equal(record.routingEnabled, true, `${set.directionId} has criteria but is not routable`);
    assert.equal(record.directionGated, true, `${set.directionId} must be marked direction-gated`);
    // One answer is never a referral to a narrower service. A Paediatrics
    // parent-service set may use one, because its source names paediatric
    // expertise for that single feature and Paediatrics is not narrower.
    if (set.parentService) {
      assert.equal(set.directionId, 'paediatrics', 'only Paediatrics may be a parent-service set');
      assert.equal(set.pediatricPolicy, 'pediatric-only');
      assert.ok(set.minimumSupporting >= 1);
    } else {
      assert.ok(set.minimumSupporting >= 2, `${set.directionId}: one answer is never a referral`);
    }
    assert.ok(set.rationale.length > 80, `${set.directionId} needs a written rationale`);
    for (const criterion of [...set.supporting, ...set.excluding]) {
      assert.ok(criterion.sourceIds.length > 0, criterion.id);
      assert.ok(criterion.sourceIds.every((id) => registered.has(id)), `${criterion.id} cites an unregistered source`);
      assert.ok(criterion.sourceCriterion.length > 20, `${criterion.id} needs the published wording`);
      assert.ok(criterion.optionIds.length > 0, criterion.id);
      // Patient-facing labels never name a disease.
      assert.ok(!/sinusitis|otitis|cancer|endometriosis|cyst|infection/i.test(criterion.label), criterion.label);
    }
  }
});

test('no gate output is a probability, and no rule-gated route is a scored candidate', () => {
  const context = contextFor('face', 'patient-left-ear', 'pain', 30);
  const gate = evaluateDirectionGate(context, answers(context, {
    'intake-face-ear-detail': 'inside',
    'intake-face-ear-associated': 'discharge',
  }));
  assert.equal(gate.status, 'supported');
  assert.ok(gate.direction);
  const serialized = JSON.stringify(gate.direction);
  assert.ok(!/0\.\d/.test(serialized), 'a gate result must not carry a probability');
  // A rule-gated route may keep a frozen R1 key for rendering (Dermatology),
  // but the belief vector can never select it.
  for (const record of SPECIALTY_REGISTRY.filter((candidate) => candidate.evidenceStatus === 'rule-gated-referral-criteria')) {
    assert.equal(isWeightedRoutable(record), false, record.id);
  }
});

/* --- Location alone never routes (report section 48) ---------------------- */

test('location alone never produces a direction', () => {
  const cases: readonly [RegionAssessmentContext, string][] = [
    [contextFor('face', 'patient-left-ear', 'pain', 30), 'ENT'],
    [contextFor('face', 'nose', 'nose-change', 30), 'ENT'],
    [contextFor('face', 'patient-right-eye', 'pain', 30), 'Eye care'],
    [contextFor('lower-abdomen', null, 'reproductive-pelvic-change', 30), 'Obstetrics and Gynaecology'],
    [contextFor('lower-abdomen', null, 'urinary-change', 30), 'Urology'],
    [contextFor('lower-abdomen', null, 'bowel-change', 30), 'Gastroenterology'],
    [contextFor('chest', null, 'pain', 30), 'Cardiology'],
  ];
  for (const [context, forbidden] of cases) {
    // Entry concern only: no descriptive answer has been given yet.
    const outcome = route(context, {});
    assert.notEqual(outcome.label, forbidden, `${context.complaintId} routed on location alone`);
    assert.equal(outcome.basis, 'parent-service');
  }
});

/* --- ENT (report sections 8 and 44) --------------------------------------- */

test('a local otologic pattern reaches ENT, and a referred one does not', () => {
  const context = contextFor('face', 'patient-left-ear', 'pain', 29);

  const otologic = route(context, {
    'intake-face-ear-detail': 'inside',
    'intake-face-ear-associated': 'discharge',
  });
  assert.equal(otologic.label, 'ENT');
  assert.equal(otologic.basis, 'source-backed-criteria');
  assert.ok(otologic.supportingSignals.length >= 2);
  assert.equal(otologic.fallbackReason, null);

  const dental = route(context, {
    'intake-face-ear-detail': 'inside',
    'intake-face-ear-associated': 'jaw-tooth',
  });
  assert.notEqual(dental.label, 'ENT');
  assert.equal(dental.fallbackReason, 'EXCLUDED_BY_COMPETING_PATTERN');

  const vestibular = route(contextFor('face', 'patient-left-ear', 'hearing-balance-change', 29), {
    'intake-face-ear-detail': 'spinning',
    'intake-face-ear-associated': 'dizzy',
  });
  assert.notEqual(vestibular.label, 'ENT');
  assert.equal(vestibular.fallbackReason, 'EXCLUDED_BY_COMPETING_PATTERN');
});

test('a persistent one-sided sinonasal pattern reaches ENT, and a short one does not', () => {
  const context = contextFor('face', 'nose', 'nose-change', 38, 'male');

  const referral = route(context, {
    'intake-face-nose-detail': 'blocked',
    'intake-face-nose-associated': 'one-sided',
    'intake-face-nose-persistence': 'over-three-months',
  });
  assert.equal(referral.label, 'ENT');
  assert.equal(referral.basis, 'source-backed-criteria');

  const coryza = route(context, {
    'intake-face-nose-detail': 'blocked',
    'intake-face-nose-associated': 'none',
    'intake-face-nose-persistence': 'under-one-week',
  });
  assert.equal(coryza.basis, 'parent-service');
  assert.equal(coryza.fallbackReason, 'INSUFFICIENT_SUPPORTED_EVIDENCE');
});

/* --- Constipation (report section 43) ------------------------------------- */

test('the four constipation cases do not route identically', () => {
  const adult = contextFor('lower-abdomen', null, 'bowel-change', 32);

  const simple = route(adult, {
    'intake-lower-bowel-detail': 'constipation',
    'intake-lower-bowel-persistence': 'recent-first',
    'intake-lower-bowel-alarm-feature': 'neither',
  });
  assert.equal(simple.basis, 'parent-service', 'a first recent episode is not a GI referral');

  const persistent = route(adult, {
    'intake-lower-bowel-detail': 'constipation',
    'intake-lower-bowel-persistence': 'not-improving',
    'intake-lower-bowel-alarm-feature': 'sudden-change',
  });
  assert.equal(persistent.label, 'Gastroenterology');
  assert.equal(persistent.basis, 'source-backed-criteria');

  const alarm = route(adult, {
    'intake-lower-bowel-detail': 'blood',
    'intake-lower-bowel-persistence': 'regularly-recurrent',
    'intake-lower-bowel-alarm-feature': 'weight-loss',
  });
  assert.equal(alarm.label, 'Gastroenterology');
  assert.ok(alarm.supportingSignals.length >= 2);

  // A child meeting the same pattern is NOT sent to an adult service. NICE CG99
  // sends a child whose constipation is not responding to paediatric
  // expertise, so Paediatrics is the source-backed direction, with a reason.
  const child = contextFor('lower-abdomen', null, 'bowel-change', 8);
  const pediatric = route(child, {
    'intake-lower-bowel-detail': 'constipation',
    'intake-lower-bowel-persistence': 'not-improving',
  });
  assert.equal(pediatric.label, 'Paediatrics');
  assert.equal(pediatric.basis, 'source-backed-criteria');
  assert.equal(pediatric.fallbackReason, null);
  assert.ok(pediatric.supportingSignals.some((signal) => /getting better|keeps happening/.test(signal.label)));

  assert.notEqual(simple.label, persistent.label);
});

/* --- OBGYN (report sections 7 and 42) ------------------------------------- */

test('a gynaecologic bleeding pattern reaches OBGYN, and the branch alone does not', () => {
  const context = contextFor('lower-abdomen', null, 'reproductive-pelvic-change', 32);

  const gynae = route(context, {
    'intake-lower-reproductive-detail': 'bleeding',
    'intake-lower-reproductive-timing': 'between-periods',
  });
  assert.equal(gynae.label, 'Obstetrics and Gynaecology');
  assert.equal(gynae.basis, 'source-backed-criteria');

  // The branch alone is not a referral: the cycle-timing answer is required.
  const branchOnly = route(context, { 'intake-lower-reproductive-detail': 'bleeding' });
  assert.notEqual(branchOnly.label, 'Obstetrics and Gynaecology');

  // Entered as pain, the associated change decides: reproductive with an
  // out-of-pattern bleed reaches OBGYN, bowel-dominant points away from it.
  const pain = contextFor('lower-abdomen', null, 'pain', 32);
  const painReproductive = route(pain, {
    'intake-lower-associated-system': 'reproductive',
    'intake-lower-reproductive-timing': 'between-periods',
  });
  assert.equal(painReproductive.label, 'Obstetrics and Gynaecology');
  const bowelDominant = route(pain, {
    'intake-lower-associated-system': 'bowel',
  });
  assert.notEqual(bowelDominant.label, 'Obstetrics and Gynaecology');
});

/* --- Physiology gating (report sections 18, 19, 20) ----------------------- */

test('no male or pediatric run is ever offered a reproductive physiology question', () => {
  const reproductiveIds = new Set<string>([
    INTAKE_QUESTION_IDS.reproductiveDetail,
    INTAKE_QUESTION_IDS.reproductiveTiming,
    INTAKE_QUESTION_IDS.pregnancyContext,
  ]);
  const faceIds: (FaceRegionId | null)[] = [null, ...FACE_HIT_REGIONS.map((region) => region.id)];
  let checked = 0;

  for (const region of BODY_DOMAIN.regions) {
    for (const faceSubregionId of region.id === 'face' ? faceIds.slice(1) : [null]) {
      for (const age of [1, 4, 9, 15, 17, 18, 34, 71]) {
        for (const sex of ['male', 'female', 'intersex_or_variation'] as SexForAssessment[]) {
          for (const concern of concernOptionsFor(region.id, faceSubregionId, { age, sexForAssessment: sex })) {
            const context = createRegionAssessmentContext({
              regionId: region.id,
              regionLabel: region.label,
              faceSubregionId,
              concern,
              patient: patient(age, sex),
            });
            const offered = intakeQuestionsFor(context.complaintId, context)
              .filter((question) => reproductiveIds.has(question.id))
              .map((question) => question.id);
            checked += 1;
            if (sex === 'male' || age < 18) {
              assert.deepEqual(
                offered,
                [],
                `${region.id}/${faceSubregionId ?? '-'}/${concern.id} age=${age} sex=${sex} leaked ${offered.join(', ')}`,
              );
            }
          }
        }
      }
    }
  }
  assert.ok(checked > 3000, `expected an exhaustive sweep, checked ${checked}`);
});

test('the reproductive gate needs adult physiology and an explicitly chosen branch', () => {
  assert.equal(reproductiveBranchEligible(contextFor('lower-abdomen', null, 'pain', 30, 'male')), false);
  assert.equal(reproductiveBranchEligible(contextFor('lower-abdomen', null, 'pain', 10, 'female')), false);
  assert.equal(reproductiveBranchEligible(contextFor('face', 'patient-left-ear', 'pain', 30, 'female')), false);
  assert.equal(reproductiveBranchEligible(contextFor('left-knee', null, 'pain', 30, 'female')), false);
  assert.equal(reproductiveBranchEligible(contextFor('lower-abdomen', null, 'pain', 30, 'female')), true);

  // Eligible physiology is still not a route: the gate needs a chosen branch.
  const painOnly = evaluateDirectionGate(
    contextFor('lower-abdomen', null, 'pain', 30, 'female'),
    answers(contextFor('lower-abdomen', null, 'pain', 30, 'female'), { 'intake-lower-associated-system': 'bowel' }),
  );
  assert.ok(!painOnly.assessments.some((assessment) => assessment.directionId === 'obstetrics-gynaecology'));
});

/* --- Stop conditions and the fallback guard (sections 14, 17, 47) --------- */

test('the interview continues while a reachable criteria set has an unanswered question', () => {
  const context = contextFor('face', 'nose', 'nose-change', 38, 'male');
  const plan = intakePlanFor(context.complaintId, context);
  const eligibleQuestions = [...plan.preScreen, ...plan.postScreen];

  const partial = shouldContinueDiscrimination({
    context,
    intakeAnswers: answers(context, {
      'intake-face-nose-detail': 'blocked',
      'intake-face-nose-associated': 'one-sided',
    }),
    eligibleQuestions,
    budget: EMPTY_BUDGET,
    hardStop: false,
  });
  assert.equal(partial.shouldContinue, true);
  assert.deepEqual([...partial.remainingDiscriminatorIds], [INTAKE_QUESTION_IDS.nosePersistence]);
  assert.equal(partial.stopCondition, null);

  const complete = shouldContinueDiscrimination({
    context,
    intakeAnswers: answers(context, {
      'intake-face-nose-detail': 'blocked',
      'intake-face-nose-associated': 'one-sided',
      'intake-face-nose-persistence': 'over-three-months',
    }),
    eligibleQuestions,
    budget: EMPTY_BUDGET,
    hardStop: false,
  });
  assert.equal(complete.shouldContinue, false);
  assert.equal(complete.stopCondition, 'SPECIALTY_SUFFICIENT');
});

test('the fallback guard refuses a parent service while a discriminator remains', () => {
  const context = contextFor('face', 'nose', 'nose-change', 38, 'male');
  const plan = intakePlanFor(context.complaintId, context);
  const state = {
    context,
    intakeAnswers: answers(context, {
      'intake-face-nose-detail': 'blocked',
      'intake-face-nose-associated': 'one-sided',
    }),
    eligibleQuestions: [...plan.preScreen, ...plan.postScreen],
    budget: EMPTY_BUDGET,
    hardStop: false,
  };
  const early = assertNoUsefulDiscriminatorsRemain(state);
  assert.equal(early.ok, false);
  assert.ok(early.message.includes('otorhinolaryngology'));

  const settled = assertNoUsefulDiscriminatorsRemain({
    ...state,
    intakeAnswers: answers(context, {
      'intake-face-nose-detail': 'blocked',
      'intake-face-nose-associated': 'none',
      'intake-face-nose-persistence': 'under-one-week',
    }),
  });
  assert.equal(settled.ok, true);
  assert.ok(settled.reason);
  assert.ok(FALLBACK_REASON_TEXT[settled.reason]);
});

test('a hard stop overrides discrimination, and an urgent rule does not', () => {
  const context = contextFor('face', 'nose', 'nose-change', 38, 'male');
  const plan = intakePlanFor(context.complaintId, context);
  const state = {
    context,
    intakeAnswers: answers(context, {
      'intake-face-nose-detail': 'blocked',
      'intake-face-nose-associated': 'one-sided',
    }),
    eligibleQuestions: [...plan.preScreen, ...plan.postScreen],
    budget: EMPTY_BUDGET,
  };
  assert.equal(shouldContinueDiscrimination({ ...state, hardStop: true }).stopCondition, 'HARD_STOP');
  // The same state without a hard stop keeps going, which is what keeps an
  // urgent-but-continuable rule from truncating the interview.
  assert.equal(shouldContinueDiscrimination({ ...state, hardStop: false }).shouldContinue, true);
});

test('the question burden ceiling ends the extension with a named reason', () => {
  const context = contextFor('face', 'nose', 'nose-change', 38, 'male');
  const plan = intakePlanFor(context.complaintId, context);
  const decision = shouldContinueDiscrimination({
    context,
    intakeAnswers: answers(context, {
      'intake-face-nose-detail': 'blocked',
      'intake-face-nose-associated': 'one-sided',
    }),
    eligibleQuestions: [...plan.preScreen, ...plan.postScreen],
    budget: { ...EMPTY_BUDGET, discriminationQuestionCount: MAX_DISCRIMINATION_EXTENSION },
    hardStop: false,
  });
  assert.equal(decision.shouldContinue, false);
  assert.equal(decision.stopCondition, 'QUESTION_BURDEN_WITH_LOW_ADDITIONAL_VALUE');
  assert.equal(decision.fallbackReason, 'QUESTION_BURDEN_LIMIT_REACHED');
});

/* --- Budgets (report section 4) ------------------------------------------- */

test('safety answers never consume the routing or discrimination budget', () => {
  let budget = EMPTY_BUDGET;
  for (let index = 0; index < 6; index += 1) {
    budget = countQuestion(budget, 'safety', `safety-question-${index}`);
  }
  assert.equal(budget.safetyQuestionCount, 6);
  assert.equal(budget.routingQuestionCount, 0);
  assert.equal(budget.discriminationQuestionCount, 0);
  assert.equal(budget.contextQuestionCount, 0);

  // Only the extension discriminators count against the extension budget.
  budget = countQuestion(budget, 'intake', INTAKE_QUESTION_IDS.bowelAlarmFeature);
  budget = countQuestion(budget, 'intake', INTAKE_QUESTION_IDS.duration);
  budget = countQuestion(budget, 'routing', 'headache-one-sided');
  assert.equal(budget.discriminationQuestionCount, 1);
  assert.equal(budget.contextQuestionCount, 1);
  assert.equal(budget.routingQuestionCount, 1);

  const context = contextFor('lower-abdomen', null, 'bowel-change', 38, 'male');
  const rebuilt = budgetFromAnswers(
    answers(context, {
      'intake-lower-bowel-detail': 'constipation',
      'intake-lower-bowel-alarm-feature': 'neither',
    }),
    4,
    2,
  );
  assert.equal(rebuilt.safetyQuestionCount, 4);
  assert.equal(rebuilt.routingQuestionCount, 2);
  assert.equal(rebuilt.discriminationQuestionCount, 1);
});

/* --- Numeric parameters are untouched (report sections 37 and 49) --------- */

test('no evidence threshold, routing budget or posterior floor was changed', () => {
  assert.equal(DEMONSTRATION_ENGINE_CONFIG.topProbabilityThreshold, 0.72);
  assert.equal(DEMONSTRATION_ENGINE_CONFIG.marginThreshold, 0.35);
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
  assert.equal(DEMONSTRATION_ENGINE_CONFIG.posteriorFloor, 0.02);
  // The discrimination extension is a question-count allowance on a separate
  // counter. It is not, and must not become, an evidence threshold.
  assert.equal(MAX_DISCRIMINATION_EXTENSION, 4);
  // Branch persistence questions are core questions, asked in every run of
  // their branch; only these five exist purely to complete a criterion. The
  // sinonasal features joined them in normalization: they matter only while
  // the ENT criteria can still be met.
  assert.equal(DIRECTION_GATE_QUESTION_IDS.size, 5);
});

test('an approved weighted complaint that does not converge is recorded as a calibration gap', () => {
  const outcome = resolveRouteOutcome({
    clinicalContext: contextFor('head', null, 'pain', 41),
    complaintId: 'headache',
    intakeAnswers: [],
    stoppingDecision: { reason: 'max_questions' },
    engineSpecialtyId: 'neurology',
  });
  assert.equal(outcome.basis, 'parent-service');
  assert.equal(outcome.label, 'General Medicine');
  assert.equal(outcome.fallbackReason, 'SPECIALTY_EVIDENCE_CALIBRATION_REQUIRED');
  assert.equal(outcome.calibrationGap, true);

  // And a converged one is still presented on the calibrated basis.
  const converged = resolveRouteOutcome({
    clinicalContext: contextFor('chest', null, 'pain', 41),
    complaintId: 'chest-concern',
    intakeAnswers: [],
    stoppingDecision: { reason: 'margin' },
    engineSpecialtyId: 'cardiology',
  });
  assert.equal(converged.basis, 'bayesian-convergence');
  assert.equal(converged.label, 'Cardiology');
  assert.equal(converged.calibrationGap, undefined);
});
