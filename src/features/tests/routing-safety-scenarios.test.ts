/**
 * Routing and safety QA scenarios.
 *
 * These drive the live modules end to end - the coverage intake plan, the
 * contextual safety eligibility filter, the R3 controller and the interview
 * plan - on named clinical scenarios, and assert what the patient actually
 * meets. Nothing here changes a rule, a predicate, a likelihood or a threshold.
 *
 * ENT is reachable, but only through the deterministic source-backed criteria
 * in direction-gate.ts, never as a scored Bayesian candidate. The tests at the
 * end assert that distinction rather than a manufactured likelihood, and the
 * gate's own behaviour is covered in direction-gate.test.ts.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { BODY_DOMAIN, type BodyRegionId } from '../../body/index.ts';
import { answerSessionQuestion, createRoutingSession, type RoutingSession } from '../../engine/index.ts';
import {
  DEMONSTRATION_ENGINE_CONFIG,
  materializeDemonstrationComplaint,
  R2B_DEMONSTRATION_KNOWLEDGE,
} from '../../engine/data/index.ts';
import {
  evaluateSafetyController,
  R3_RED_FLAG_RULES,
  R3_SAFETY_KNOWLEDGE,
  recordSafetyAnswer,
  type SafetyAnswer,
} from '../../engine/safety/index.ts';
import {
  concernOptionsFor,
  createRegionAssessmentContext,
  isGenericCoverageComplaint,
  type RegionAssessmentContext,
  type RegionConcernId,
} from '../body-explorer/clinical-coverage.ts';
import type { FaceRegionId } from '../body-explorer/faceHitMap.ts';
import type { PatientContext, SexForAssessment } from '../intake/patient-context.ts';
import {
  INTAKE_QUESTION_IDS,
  intakeQuestionsFor,
  type IntakeAnswer,
} from '../routing-flow/intake-questions.ts';
import { safetyQuestionIdsForClinicalContext } from '../routing-flow/contextual-safety.ts';
import { nextInterviewStep } from '../routing-flow/interview-plan.ts';
import { didConverge, hasPresentableRoute } from '../routing-flow/handoff-presentation.ts';
import { SPECIALTY_REGISTRY, specialtyForEngineId } from '../routing-flow/specialty-registry.ts';

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

type AnswerScript = Readonly<Record<string, string>>;

interface Walk {
  /** Every question id the patient met, in the order it appeared. */
  asked: readonly string[];
  /** Only the questions R3 owns. */
  safetyAsked: readonly string[];
  outcome: 'result' | 'interrupted' | 'guard';
  interruptedRuleId: string | null;
  urgentRuleIds: readonly string[];
  /** What the result screen would print, not the raw engine id. */
  converged: boolean;
  presentableRoute: boolean;
}

/**
 * Drives the same call sequence RoutingFlow drives, answering from `script`
 * and otherwise preferring "no" so a path is only escalated on purpose.
 */
function walk(context: RegionAssessmentContext, script: AnswerScript = {}, limit = 30): Walk {
  const plan = intakeQuestionsFor(context.complaintId, context);
  let intakeAnswers: readonly IntakeAnswer[] = plan[0]
    ? [{ questionId: plan[0].id, optionId: context.concernId, answeredAt: NOW }]
    : [];
  let session: RoutingSession = createRoutingSession(
    context.complaintId,
    materializeDemonstrationComplaint(R2B_DEMONSTRATION_KNOWLEDGE, context.complaintId, []).prior,
    NOW,
  );
  let safetyAnswers: readonly SafetyAnswer[] = [];
  const engineConfig = isGenericCoverageComplaint(context.complaintId)
    ? { ...DEMONSTRATION_ENGINE_CONFIG, maxQuestions: 1 }
    : DEMONSTRATION_ENGINE_CONFIG;
  const asked: string[] = [];
  const safetyAsked: string[] = [];
  let urgentRuleIds: readonly string[] = [];

  for (let guard = 0; guard < limit; guard += 1) {
    const complaint = materializeDemonstrationComplaint(
      R2B_DEMONSTRATION_KNOWLEDGE,
      context.complaintId,
      session.answers.map(({ questionId, optionId }) => ({ questionId, optionId })),
    );
    const controller = evaluateSafetyController({
      session,
      complaint,
      safetyAnswers,
      safetyKnowledge: R3_SAFETY_KNOWLEDGE,
      engineConfig,
      enabledSafetyQuestionIds: safetyQuestionIdsForClinicalContext(context, intakeAnswers),
    });
    urgentRuleIds = controller.urgentReview?.firedRuleIds ?? urgentRuleIds;
    const step = nextInterviewStep({
      complaintId: context.complaintId,
      controller,
      intakeAnswers,
      clinicalContext: context,
    });

    if (step.kind === 'interrupted') {
      return {
        asked,
        safetyAsked,
        outcome: 'interrupted',
        interruptedRuleId: controller.status === 'interrupted' ? controller.selectedRuleId : null,
        urgentRuleIds,
        converged: false,
        presentableRoute: false,
      };
    }
    if (step.kind === 'result') {
      const converged = controller.status === 'result' && didConverge(controller.stoppingDecision);
      const presentableRoute = controller.status === 'result'
        && hasPresentableRoute(controller.stoppingDecision, controller.routingOutcome.specialtyId);
      return {
        asked,
        safetyAsked,
        outcome: 'result',
        interruptedRuleId: null,
        urgentRuleIds,
        converged,
        presentableRoute,
      };
    }

    const questionId = step.question.id;
    const optionIds = step.question.options.map((option) => option.id);
    const optionId = script[questionId] ?? (optionIds.includes('no') ? 'no' : optionIds[0]);
    assert.ok(optionIds.includes(optionId), `${questionId} cannot answer ${optionId}`);
    asked.push(questionId);

    if (step.kind === 'intake') {
      intakeAnswers = [...intakeAnswers, { questionId, optionId, answeredAt: NOW }];
      continue;
    }
    if (step.question.answerTarget === 'safety_state') {
      safetyAsked.push(step.question.id);
      safetyAnswers = recordSafetyAnswer(safetyAnswers, step.question, {
        questionId: step.question.id,
        optionId,
        answeredAt: NOW,
      });
      continue;
    }
    session = answerSessionQuestion(
      session,
      { questionId: step.question.id, optionId, answeredAt: NOW },
      complaint.questions,
      engineConfig.posteriorFloor,
    );
  }
  return {
    asked,
    safetyAsked,
    outcome: 'guard',
    interruptedRuleId: null,
    urgentRuleIds,
    converged: false,
    presentableRoute: false,
  };
}

function optionIdsFor(context: RegionAssessmentContext, questionId: string): readonly string[] {
  const question = intakeQuestionsFor(context.complaintId, context).find((candidate) => candidate.id === questionId);
  assert.ok(question, `${questionId} missing from ${context.complaintId}`);
  return question.options.map((option) => option.id);
}

/* --- Ear scenarios (report section 9) ------------------------------------ */

test('ear A: a local otologic pattern collects ear-specific evidence and never routes from location', () => {
  const context = contextFor('face', 'patient-right-ear', 'pain', 34, 'male');
  const result = walk(context, {
    [INTAKE_QUESTION_IDS.earDetail]: 'inside',
    [INTAKE_QUESTION_IDS.earAssociated]: 'discharge',
  });
  assert.equal(result.outcome, 'result');
  assert.ok(result.asked.includes(INTAKE_QUESTION_IDS.earDetail));
  assert.ok(result.asked.includes(INTAKE_QUESTION_IDS.earAssociated));
  // Location plus an otologic answer pattern still produces no scored route,
  // because this complaint family carries no specialist likelihoods.
  assert.equal(result.converged, false);
  assert.equal(result.presentableRoute, false);
});

test('ear B: a dental association is answerable, so ear pain is not forced down an otologic path', () => {
  const context = contextFor('face', 'patient-right-ear', 'pain', 34, 'male');
  assert.ok(optionIdsFor(context, INTAKE_QUESTION_IDS.earAssociated).includes('jaw-tooth'));
  const result = walk(context, {
    [INTAKE_QUESTION_IDS.earDetail]: 'touch',
    [INTAKE_QUESTION_IDS.earAssociated]: 'jaw-tooth',
  });
  assert.equal(result.outcome, 'result');
  assert.equal(result.presentableRoute, false);
});

test('ear C: a reported vestibular pattern makes the neurological check eligible, ear pain alone does not', () => {
  const context = contextFor('face', 'patient-right-ear', 'hearing-balance-change', 34, 'male');
  assert.deepEqual(safetyQuestionIdsForClinicalContext(context, []), []);
  const spinning: IntakeAnswer[] = [{ questionId: INTAKE_QUESTION_IDS.earDetail, optionId: 'spinning', answeredAt: NOW }];
  assert.deepEqual(
    safetyQuestionIdsForClinicalContext(context, spinning),
    ['safety-generic-new-neurological-change'],
  );
  const painOnly = contextFor('face', 'patient-right-ear', 'pain', 34, 'male');
  assert.deepEqual(safetyQuestionIdsForClinicalContext(painOnly, []), []);

  const escalated = walk(context, {
    [INTAKE_QUESTION_IDS.earDetail]: 'spinning',
    'safety-generic-new-neurological-change': 'yes',
  });
  assert.equal(escalated.outcome, 'interrupted');
  assert.equal(escalated.interruptedRuleId, 'generic-new-neurological-change');
});

test('ear D: a young child ear complaint uses caregiver-observable questions and no adult-only branch', () => {
  const context = contextFor('face', 'patient-left-ear', 'pain', 4, 'female');
  assert.equal(context.patientMode, 'pediatric');
  assert.equal(context.reporterMode, 'caregiver');
  const questions = intakeQuestionsFor(context.complaintId, context);
  assert.ok(questions.every((question) => question.applicability !== 'adult'));
  assert.ok(questions.some((question) => question.id === INTAKE_QUESTION_IDS.pediatricEarObservation));
  assert.ok(!questions.some((question) => question.id === INTAKE_QUESTION_IDS.earDetail));
  const result = walk(context);
  assert.equal(result.outcome, 'result');
  assert.ok(result.asked.includes(INTAKE_QUESTION_IDS.pediatricEarObservation));
});

test('ear E: ear location alone produces no direction', () => {
  const context = contextFor('face', 'patient-left-ear', 'pain', 34, 'male');
  const complaint = R2B_DEMONSTRATION_KNOWLEDGE.complaints.find((candidate) => candidate.id === context.complaintId);
  assert.ok(complaint);
  assert.equal(complaint.routingMode, 'fallback_only');
  assert.deepEqual([...complaint.questionIds], []);
});

/* --- Nose scenarios (report section 10) ---------------------------------- */

test('nose A: a short problem asks about treatment; a persistent one asks the ENT discriminators', () => {
  const context = contextFor('face', 'nose', 'nose-change', 34, 'male');
  const short = walk(context, {
    [INTAKE_QUESTION_IDS.noseDetail]: 'smell',
    [INTAKE_QUESTION_IDS.nosePersistence]: 'one-to-three-weeks',
  });
  assert.equal(short.outcome, 'result');
  assert.ok(short.asked.includes(INTAKE_QUESTION_IDS.noseTreatment));
  // Under 3 weeks the ENT criteria cannot be met, so their discriminators are not asked.
  assert.ok(!short.asked.includes(INTAKE_QUESTION_IDS.noseAssociated));
  assert.deepEqual(short.safetyAsked, ['safety-sinus-urgent']);
  assert.equal(short.presentableRoute, false);

  const persistent = walk(context, {
    [INTAKE_QUESTION_IDS.noseDetail]: 'unsure',
    [INTAKE_QUESTION_IDS.nosePersistence]: 'over-three-months',
    [INTAKE_QUESTION_IDS.noseAssociated]: 'one-sided',
  });
  assert.ok(!persistent.asked.includes(INTAKE_QUESTION_IDS.noseTreatment));
  assert.ok(persistent.asked.includes(INTAKE_QUESTION_IDS.noseAssociated));
});

test('nose B: an isolated injury asks mechanism, not a second "was there an injury" question', () => {
  const context = contextFor('face', 'nose', 'injury', 34, 'male');
  const asked = intakeQuestionsFor(context.complaintId, context).map((question) => question.id);
  assert.ok(asked.includes(INTAKE_QUESTION_IDS.injuryDetail));
  assert.ok(!asked.includes(INTAKE_QUESTION_IDS.noseDetail));
  // The associated set is the bleeding-burden concept, not the sinonasal one.
  assert.ok(!asked.includes(INTAKE_QUESTION_IDS.noseAssociated));
  const associated = optionIdsFor(context, INTAKE_QUESTION_IDS.nosebleedAssociated);
  assert.ok(associated.includes('head-injury'));
  assert.ok(!associated.includes('facial-pressure'));
  assert.deepEqual(
    safetyQuestionIdsForClinicalContext(context, []),
    ['safety-nosebleed-prolonged-or-excessive'],
  );
});

test('nose C: a prolonged or excessive bleeding answer reaches the sourced hard stop', () => {
  const context = contextFor('face', 'nose', 'bleeding-discharge', 34, 'male');
  assert.deepEqual(
    safetyQuestionIdsForClinicalContext(context, []),
    ['safety-nosebleed-prolonged-or-excessive'],
  );
  const stable = walk(context, { [INTAKE_QUESTION_IDS.noseDetail]: 'under-ten' });
  assert.equal(stable.outcome, 'result');
  assert.ok(stable.safetyAsked.includes('safety-nosebleed-prolonged-or-excessive'));

  const escalated = walk(context, {
    [INTAKE_QUESTION_IDS.noseDetail]: 'over-fifteen',
    'safety-nosebleed-prolonged-or-excessive': 'yes',
  });
  assert.equal(escalated.outcome, 'interrupted');
  assert.equal(escalated.interruptedRuleId, 'nosebleed-prolonged-or-excessive');
});

test('nose D: a child nasal complaint uses caregiver-observable wording', () => {
  const context = contextFor('face', 'nose', 'nose-change', 3, 'male');
  const questions = intakeQuestionsFor(context.complaintId, context);
  assert.ok(questions.some((question) => question.id === INTAKE_QUESTION_IDS.pediatricNoseObservation));
  assert.ok(questions.every((question) => question.applicability !== 'adult'));
});

test('nose E: nose location alone produces no direction', () => {
  const context = contextFor('face', 'nose', 'nose-change', 34, 'male');
  const complaint = R2B_DEMONSTRATION_KNOWLEDGE.complaints.find((candidate) => candidate.id === context.complaintId);
  assert.ok(complaint);
  assert.equal(complaint.routingMode, 'fallback_only');
  assert.deepEqual([...complaint.questionIds], []);
});

/* --- Safety behaviour (report section 15) -------------------------------- */

test('routine: a benign adult ear path completes with no safety question and no urgency flag', () => {
  const result = walk(contextFor('face', 'patient-right-ear', 'pain', 34, 'male'));
  assert.equal(result.outcome, 'result');
  assert.deepEqual(result.safetyAsked, []);
  assert.deepEqual([...result.urgentRuleIds], []);
});

test('concern: an eligible warning-sign check follows the characterization and a No lets the interview finish', () => {
  const context = contextFor('lower-abdomen', null, 'pain', 29, 'female');
  const result = walk(context);
  assert.equal(result.outcome, 'result');
  assert.ok(result.safetyAsked.includes('safety-lower-abdominal-severe-or-faint'));
  const safetyIndex = result.asked.indexOf('safety-lower-abdominal-severe-or-faint');
  // Not pinned to the start: the concern is characterized first.
  assert.ok(safetyIndex >= 3, 'the safety check is not pinned to the first positions');
  assert.deepEqual([...result.urgentRuleIds], []);

  // An answer that makes the check immediately relevant brings it forward, and
  // a No returns the patient to the ordinary questions.
  const acute = walk(context, { [INTAKE_QUESTION_IDS.currentImpact]: '5' });
  const acuteIndex = acute.asked.indexOf('safety-lower-abdominal-severe-or-faint');
  assert.ok(acuteIndex >= 0 && acuteIndex < acute.asked.length - 1, 'ordinary questions continue after a No');
  assert.equal(acute.outcome, 'result');
});

test('urgent review: a continuable rule keeps its flag, finishes the interview and never becomes a hard stop', () => {
  const complaintId = 'joint-musculoskeletal-pain';
  let session: RoutingSession = createRoutingSession(
    complaintId,
    materializeDemonstrationComplaint(R2B_DEMONSTRATION_KNOWLEDGE, complaintId, []).prior,
    NOW,
  );
  let safetyAnswers: readonly SafetyAnswer[] = [];
  let sawUrgentWithMoreQuestions = false;

  for (let guard = 0; guard < 30; guard += 1) {
    const complaint = materializeDemonstrationComplaint(
      R2B_DEMONSTRATION_KNOWLEDGE,
      complaintId,
      session.answers.map(({ questionId, optionId }) => ({ questionId, optionId })),
    );
    const controller = evaluateSafetyController({
      session,
      complaint,
      safetyAnswers,
      safetyKnowledge: R3_SAFETY_KNOWLEDGE,
      engineConfig: DEMONSTRATION_ENGINE_CONFIG,
    });
    if (controller.status === 'interrupted') {
      assert.fail(`an urgent rule must not hard stop, but ${controller.selectedRuleId} did`);
    }
    if (controller.status === 'result') {
      assert.ok(controller.urgentReview, 'the urgency flag survives to the result');
      assert.deepEqual([...controller.urgentReview.firedRuleIds], ['joint-sudden-hot-swollen']);
      assert.ok(sawUrgentWithMoreQuestions, 'questioning continued after the urgent rule fired');
      return;
    }
    if (controller.urgentReview) sawUrgentWithMoreQuestions = true;
    const question = controller.status === 'safety-screening'
      ? controller.question
      : controller.selection.question;
    const optionId = question.id === 'safety-joint-sudden-hot-swollen' ? 'yes' : 'no';
    if (controller.status === 'safety-screening' && controller.question.answerTarget === 'safety_state') {
      safetyAnswers = recordSafetyAnswer(safetyAnswers, controller.question, {
        questionId: question.id,
        optionId,
        answeredAt: NOW,
      });
      continue;
    }
    session = answerSessionQuestion(
      session,
      { questionId: question.id, optionId, answeredAt: NOW },
      complaint.questions,
      DEMONSTRATION_ENGINE_CONFIG.posteriorFloor,
    );
  }
  assert.fail('the urgent interview did not terminate');
});

test('hard stop: a source-backed danger sign interrupts immediately rather than finishing the questionnaire', () => {
  // Chest plus breathing resolves to the weighted shortness-of-breath family,
  // so the eligible checks are that family's four, not the generic one.
  const context = contextFor('chest', null, 'breathing', 34, 'male');
  assert.equal(context.complaintId, 'shortness-of-breath');
  assert.deepEqual(safetyQuestionIdsForClinicalContext(context, []), [
    'safety-shortness-of-breath-severe',
    'safety-shortness-of-breath-pale-blue-grey',
    'safety-shortness-of-breath-sudden-confusion',
    'safety-shortness-of-breath-coughing-blood',
  ]);
  const result = walk(context, { 'safety-shortness-of-breath-severe': 'yes' });
  assert.equal(result.outcome, 'interrupted');
  assert.equal(result.interruptedRuleId, 'breathing-severe-inability-to-speak');
  // The interruption lands on the first safety question, not after the interview.
  assert.equal(result.safetyAsked.length, 1);
});

test('no yes-count: many affirmative ordinary answers never fire a rule on their own', () => {
  const context = contextFor('face', 'patient-right-ear', 'pain', 34, 'male');
  // Every ordinary question answered with its most affirmative option.
  const affirmative: AnswerScript = {
    [INTAKE_QUESTION_IDS.earDetail]: 'inside',
    [INTAKE_QUESTION_IDS.earAssociated]: 'unwell',
    [INTAKE_QUESTION_IDS.currentImpact]: '5',
    [INTAKE_QUESTION_IDS.onset]: 'sudden',
    [INTAKE_QUESTION_IDS.duration]: 'longer',
  };
  const result = walk(context, affirmative);
  assert.equal(result.outcome, 'result');
  assert.equal(result.interruptedRuleId, null);
  assert.deepEqual([...result.urgentRuleIds], []);
  // Every rule is a named predicate over named questions, never a tally.
  for (const rule of R3_RED_FLAG_RULES) {
    assert.ok(rule.requiredQuestionIds.length > 0, rule.id);
    assert.ok(rule.provenanceIds.length > 0, rule.id);
  }
});

/* --- ENT reachability (report section 13) -------------------------------- */

test('ENT is reachable only through the gate and is never a scored R1 candidate', () => {
  const ent = SPECIALTY_REGISTRY.find((record) => record.id === 'otorhinolaryngology');
  assert.ok(ent);
  assert.equal(ent.canonicalName, 'Otorhinolaryngology (ENT)');
  assert.equal(ent.routingEnabled, true);
  assert.equal(ent.directionGated, true);
  assert.equal(ent.evidenceStatus, 'rule-gated-referral-criteria');
  assert.equal(ent.engineSpecialtyId, undefined, 'ENT is not a scored R1 candidate');
  assert.deepEqual([...ent.supportedComplaints], ['headache', 'face-ear-concern', 'face-nose-concern', 'throat-concern', 'neck-concern', 'face-general-concern']);
  // No engine candidate renders under the ENT label, so no probability can ever
  // be attributed to it however the belief vector moves.
  for (const engineId of ['cardiology', 'pulmonology', 'neurology', 'gastroenterology', 'orthopedics', 'dermatology'] as const) {
    assert.notEqual(specialtyForEngineId(engineId).id, 'otorhinolaryngology');
  }
});
