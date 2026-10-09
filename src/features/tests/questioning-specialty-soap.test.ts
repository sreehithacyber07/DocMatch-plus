import assert from 'node:assert/strict';
import test from 'node:test';
import { answerSessionQuestion, type SpecialtyId } from '../../engine/index.ts';
import {
  DEMONSTRATION_ENGINE_CONFIG,
  materializeDemonstrationComplaint,
  R2B_DEMONSTRATION_COMPLAINTS,
  R2B_DEMONSTRATION_KNOWLEDGE,
} from '../../engine/data/index.ts';
import { R3_SAFETY_KNOWLEDGE, reconcileSafetyAnswers } from '../../engine/safety/index.ts';
import {
  didConverge,
  displayedDirection,
  SPECIALTY_LABEL,
  UNCONVERGED_LABEL,
} from '../routing-flow/handoff-presentation.ts';
import { INTAKE_QUESTION_IDS, intakePlanFor, intakeQuestionsFor } from '../routing-flow/intake-questions.ts';
import {
  acceptsSubmission,
  MAX_INTAKE_BEFORE_SCREENING,
  signalsAcuity,
} from '../routing-flow/interview-plan.ts';
import { buildSoapHandoff, HANDOFF_STATUS, NO_MEASUREMENTS_NOTE } from '../routing-flow/soap-handoff.ts';
import {
  GENERAL_MEDICINE,
  routableSpecialties,
  SPECIALTY_REGISTRY,
  isWeightedRoutable, specialtyForEngineId,
} from '../routing-flow/specialty-registry.ts';
import { answer, controllerFor, currentStep, runInterview, startInterview } from './interview-driver.ts';
import { contextFor, walkAssessment } from './clinical-walk.ts';

const PAIN_COMPLAINTS = ['upper-abdominal-pain', 'headache', 'joint-musculoskeletal-pain'] as const;
const ALL_COMPLAINTS = R2B_DEMONSTRATION_COMPLAINTS
  .filter((complaint) => complaint.routingMode !== 'fallback_only')
  .map((complaint) => complaint.id);

/* --- Simple to advanced ---------------------------------------------------- */

test('every pain complaint opens on character, then intensity, then duration', () => {
  for (const complaintId of PAIN_COMPLAINTS) {
    let state = startInterview(complaintId);
    const order: string[] = [];
    for (let index = 0; index < 3; index += 1) {
      const step = currentStep(state);
      assert.equal(step.kind, 'intake', `${complaintId} step ${index + 1} should be intake`);
      if (step.kind !== 'intake') return;
      order.push(step.question.category);
      state = answer(state, step.question.id === INTAKE_QUESTION_IDS.currentImpact ? '3' : step.question.options[0].id);
    }
    assert.deepEqual(order, ['character', 'intensity', 'duration'], complaintId);
  }
});

test('the first question is never a safety check for any supported complaint', () => {
  for (const complaintId of ALL_COMPLAINTS) {
    const step = currentStep(startInterview(complaintId));
    assert.equal(step.kind, 'intake', complaintId);
  }
});

test('character options are specific to the complaint', () => {
  const labels = (complaintId: string) =>
    intakePlanFor(complaintId).preScreen[0].options.map((option) => option.id);
  assert.ok(!labels('headache').includes('cramping'));
  assert.ok(labels('headache').includes('throbbing'));
  assert.ok(!labels('shortness-of-breath').includes('aching'));
  assert.ok(labels('joint-musculoskeletal-pain').includes('stiff'));
});

test('headache keeps the validated R3 onset question instead of a second onset field', () => {
  assert.ok(!intakeQuestionsFor('headache').some((question) => question.category === 'onset'));
  const { steps } = runInterview('headache', { [INTAKE_QUESTION_IDS.currentImpact]: '3' });
  const firstEngine = steps.find((entry) => entry.step.kind === 'engine');
  assert.equal(firstEngine?.step.kind === 'engine' && firstEngine.step.question.id, 'safety-headache-sudden-extremely-painful');
});

test('normal non-emergency paths reach at least six meaningful interactions', () => {
  for (const complaintId of ALL_COMPLAINTS) {
    const { steps, terminal } = runInterview(complaintId, {}, 'no');
    assert.equal(terminal.kind, 'result', complaintId);
    assert.ok(steps.length >= 6, `${complaintId} asked ${steps.length}`);
  }
});

/* --- Safety sequencing ------------------------------------------------------ */

test('the R3 screen is never preceded by more than the bounded intake block', () => {
  for (const complaintId of ALL_COMPLAINTS) {
    const { steps } = runInterview(complaintId, {}, 'no');
    const firstScreen = steps.findIndex(
      (entry) => entry.step.kind === 'engine' && entry.step.owner !== 'routing',
    );
    assert.ok(firstScreen >= 0, `${complaintId} has a screen`);
    assert.ok(firstScreen <= MAX_INTAKE_BEFORE_SCREENING, `${complaintId} screened at ${firstScreen + 1}`);
  }
});

test('a severe intensity pulls the safety screen forward immediately', () => {
  for (const complaintId of ALL_COMPLAINTS) {
    let state = startInterview(complaintId);
    state = answer(state, currentStep(state).kind === 'intake' ? 'unsure' : 'no');
    const intensity = currentStep(state);
    assert.equal(intensity.kind === 'intake' && intensity.question.category, 'intensity', complaintId);
    state = answer(state, '5');
    const next = currentStep(state);
    assert.equal(next.kind, 'engine', `${complaintId} should screen next`);
    assert.notEqual(next.kind === 'engine' && next.owner, 'routing', complaintId);
  }
});

test('a sudden onset pulls the safety screen forward immediately', () => {
  assert.equal(signalsAcuity([{
    questionId: INTAKE_QUESTION_IDS.onset,
    optionId: 'sudden',
    answeredAt: new Date(0).toISOString(),
  }]), true);
});

test('only R3-owned questions carry the Safety check label', () => {
  for (const complaintId of ALL_COMPLAINTS) {
    for (const fallback of ['yes', 'no'] as const) {
      const { steps } = runInterview(complaintId, {}, fallback);
      for (const { step } of steps) {
        if (step.kind !== 'engine') continue;
        const ownedBySafety = step.question.answerTarget === 'safety_state';
        assert.equal(step.label === 'Safety check', ownedBySafety, `${step.question.id} label ${step.label}`);
        assert.equal(step.phase === 'safety', ownedBySafety, `${step.question.id} phase ${step.phase}`);
      }
    }
  }
});

test('an interrupted controller wins even while intake is still unanswered', () => {
  let state = startInterview('headache');
  state = answer(state, 'throbbing');
  state = answer(state, '5');
  const screen = currentStep(state);
  assert.equal(screen.kind === 'engine' && screen.question.id, 'safety-headache-sudden-extremely-painful');
  state = answer(state, 'yes');
  assert.equal(currentStep(state).kind, 'interrupted');
  assert.ok(state.intakeAnswers.length < intakeQuestionsFor('headache').length, 'duration still unanswered');
});

/* --- R3 early-trigger audit ------------------------------------------------- */

test('no R3 rule fires on an empty session or on an all-negative interview', () => {
  for (const complaintId of ALL_COMPLAINTS) {
    assert.notEqual(controllerFor(startInterview(complaintId)).status, 'interrupted', complaintId);
    assert.equal(runInterview(complaintId, {}, 'no').terminal.kind, 'result', complaintId);
  }
});

test('every R3 rule fires exactly when its full predicate is satisfied, through the real sequence', () => {
  for (const rule of R3_SAFETY_KNOWLEDGE.rules) {
    const complaintId = rule.applicableComplaintIds[0];
    const yes = Object.fromEntries(rule.requiredQuestionIds.map((id) => [id, 'yes']));
    // Screened-routing prerequisites for joint injury rules.
    if (rule.id.startsWith('joint-injury')) yes['joint-musculoskeletal-pain-injury'] = 'yes';
    // The joint clot checks are live only when the painful area is swollen.
    if (rule.id.startsWith('joint-dvt')) yes['joint-musculoskeletal-pain-swelling-bruising'] = 'yes';
    const { controller } = runInterview(complaintId, yes, 'no');
    if (rule.continuationPolicy === 'must_stop') {
      assert.equal(controller.status, 'interrupted', `${rule.id} should hard stop`);
      if (controller.status === 'interrupted') assert.ok(controller.firedRuleIds.includes(rule.id), rule.id);
    } else {
      assert.notEqual(controller.status, 'interrupted', `${rule.id} should remain an urgent-review flag`);
      assert.ok(controller.urgentReview?.firedRuleIds.includes(rule.id), rule.id);
    }
  }
});

test('one insufficient predicate does not escalate the upper abdominal rule', () => {
  const { terminal } = runInterview(
    'upper-abdominal-pain',
    {
      'upper-abdominal-pain-exertional': 'yes',
      'upper-abdominal-pain-sweating': 'no',
      'upper-abdominal-pain-breathlessness': 'no',
    },
    'no',
  );
  assert.equal(terminal.kind, 'result');
});

test('a stale dependent answer cannot keep a rule fired after its prerequisite changes', () => {
  const { state } = runInterview(
    'upper-abdominal-pain',
    { 'upper-abdominal-pain-exertional': 'yes', 'upper-abdominal-pain-sweating': 'yes' },
    'no',
  );
  assert.equal(controllerFor(state).status, 'interrupted');

  const complaint = materializeDemonstrationComplaint(
    R2B_DEMONSTRATION_KNOWLEDGE,
    'upper-abdominal-pain',
    state.session.answers.map((entry) => ({ questionId: entry.questionId, optionId: entry.optionId })),
  );
  const session = answerSessionQuestion(
    state.session,
    { questionId: 'upper-abdominal-pain-exertional', optionId: 'no', answeredAt: new Date(99_000).toISOString() },
    complaint.questions,
    DEMONSTRATION_ENGINE_CONFIG.posteriorFloor,
  );
  const safetyAnswers = reconcileSafetyAnswers(
    { complaintId: 'upper-abdominal-pain', routingAnswers: session.answers, safetyAnswers: state.safetyAnswers },
    R3_SAFETY_KNOWLEDGE,
  ).retained;
  assert.notEqual(controllerFor({ ...state, session, safetyAnswers }).status, 'interrupted');
});

test('answers from another assessment cannot fire a rule in a new complaint', () => {
  const headache = runInterview('headache', { 'safety-headache-sudden-extremely-painful': 'yes' }, 'no');
  assert.equal(headache.terminal.kind, 'interrupted');
  const fresh = { ...startInterview('upper-abdominal-pain'), safetyAnswers: headache.state.safetyAnswers };
  assert.notEqual(controllerFor(fresh).status, 'interrupted');
});

test('a tap on an exiting or already-submitted question is rejected', () => {
  assert.equal(acceptsSubmission('safety-headache-drowsy-confused', 'safety-headache-drowsy-confused'), true);
  assert.equal(acceptsSubmission('safety-headache-drowsy-confused', 'safety-headache-speech-memory-vision'), false);
  assert.equal(acceptsSubmission(null, 'safety-headache-drowsy-confused'), false);
});

test('no answer control preselects an option', () => {
  for (const complaintId of ALL_COMPLAINTS) {
    const step = currentStep(startInterview(complaintId));
    assert.equal(step.kind, 'intake');
  }
  // Engine binary options arrive in knowledge order and are never reordered.
  for (const rule of R3_SAFETY_KNOWLEDGE.questions) {
    if (rule.kind === 'safety_owned') assert.deepEqual(rule.options.map((option) => option.id), ['yes', 'no']);
  }
});

/* --- Specialty registry ----------------------------------------------------- */

test('the registry carries NBEMS canonical names for the required specialties', () => {
  const names = new Set(SPECIALTY_REGISTRY.map((record) => record.canonicalName));
  for (const name of [
    'General Medicine',
    'Family Medicine',
    'Emergency Medicine',
    'General Surgery',
    'Dermatology, Venereology and Leprosy',
    'Orthopaedics',
    'Otorhinolaryngology (ENT)',
    'Ophthalmology',
    'Obstetrics and Gynaecology',
    'Paediatrics',
    'Psychiatry',
    'Respiratory Medicine',
    'Physical Medicine and Rehabilitation',
    'Cardiology',
    'Medical Gastroenterology',
    'Neurology',
    'Nephrology',
    'Urology',
    'Clinical Immunology and Rheumatology',
    'Critical Care Medicine',
    'Endocrinology',
    'Neuro Surgery',
    'Surgical Gastroenterology',
    'Cardio Vascular & Thoracic Surgery',
  ]) {
    assert.ok(names.has(name), `missing ${name}`);
  }
  assert.equal(new Set(SPECIALTY_REGISTRY.map((record) => record.id)).size, SPECIALTY_REGISTRY.length);
});

test('ENT keeps its canonical name, displays as ENT, and is routable only through the gate', () => {
  const ent = SPECIALTY_REGISTRY.find((record) => record.id === 'otorhinolaryngology');
  assert.ok(ent);
  assert.equal(ent.canonicalName, 'Otorhinolaryngology (ENT)');
  assert.equal(ent.patientFacingName, 'ENT');
  assert.equal(ent.routingEnabled, true);
  assert.equal(ent.directionGated, true);
  assert.equal(ent.evidenceStatus, 'rule-gated-referral-criteria');
  // No likelihood was invented for it: it is not, and cannot become, a scored
  // Bayesian candidate.
  assert.equal(ent.engineSpecialtyId, undefined);
  // Headache with the required sinonasal pattern, a neck lump and facial sinus
  // pressure are all deterministic source gates; none creates a likelihood.
  assert.deepEqual([...ent.supportedComplaints], ['headache', 'face-ear-concern', 'face-nose-concern', 'throat-concern', 'neck-concern', 'face-general-concern']);
});

test('only modelled specialties are routable, and every R1 candidate renders through the registry', () => {
  const routable = routableSpecialties().map((record) => record.id).toSorted();
  assert.deepEqual(routable, [
    'cardiology',
    // Gate-only, never Bayesian candidates (questionnaire intelligence pass, PENDING CLINICAL REVIEW).
    'clinical-immunology-rheumatology',
    'dentistry',
    'dermatology',
    'general-medicine',
    'general-surgery',
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
  for (const id of ['cardiology', 'pulmonology', 'neurology', 'gastroenterology', 'orthopedics', 'dermatology'] as SpecialtyId[]) {
    assert.equal(SPECIALTY_LABEL[id], specialtyForEngineId(id).patientFacingName);
  }
  assert.equal(SPECIALTY_LABEL.pulmonology, 'Respiratory Medicine');
  assert.equal(UNCONVERGED_LABEL, GENERAL_MEDICINE.patientFacingName);
  // Routable through published skin criteria, never selectable by a belief.
  assert.equal(isWeightedRoutable(specialtyForEngineId('dermatology')), false);
});

/* --- Routing differentiation ------------------------------------------------ */

const DIFFERENTIATION: readonly {
  expect: string;
  complaintId: string;
  answers: Record<string, string>;
}[] = [
  {
    expect: 'Cardiology',
    complaintId: 'shortness-of-breath',
    answers: {
      'shortness-of-breath-ankle-swelling': 'yes',
      'shortness-of-breath-lying-flat': 'yes',
      'shortness-of-breath-palpitations': 'yes',
    },
  },
  {
    expect: 'Respiratory Medicine',
    complaintId: 'shortness-of-breath',
    answers: {
      'shortness-of-breath-wheeze': 'yes',
      'shortness-of-breath-night-variation': 'yes',
      'shortness-of-breath-cough': 'yes',
    },
  },

  {
    expect: 'Orthopaedics',
    complaintId: 'joint-musculoskeletal-pain',
    answers: {
      'joint-musculoskeletal-pain-injury': 'yes',
      'joint-musculoskeletal-pain-swelling-bruising': 'yes',
      'joint-musculoskeletal-pain-use-weight': 'yes',
    },
  },
  { expect: 'General Medicine', complaintId: 'headache', answers: {} },
];

test('controlled answer paths lead to distinct engine specialties, which never route on their own', () => {
  /*
    Different answers still move the engine to different leaders. What changed
    (PENDING CLINICAL REVIEW) is that a lead is not a route: with the
    demonstration likelihoods, which are not clinically calibrated, no lead
    reaches both thresholds with sufficient independent support, so the engine
    alone never prints a specialist. The direction comes from the published
    criteria in direction-gate.ts (scripted paths in questionnaire-rebuild.test).
  */
  const LEADER: Readonly<Record<string, SpecialtyId>> = {
    Cardiology: 'cardiology',
    'Respiratory Medicine': 'pulmonology',
    Orthopaedics: 'orthopedics',
  };
  const leaders = new Set<string>();
  for (const scenario of DIFFERENTIATION) {
    const { controller } = runInterview(scenario.complaintId, scenario.answers, 'no');
    assert.equal(controller.status, 'result', scenario.expect);
    if (controller.status !== 'result') continue;
    const shown = displayedDirection(controller.stoppingDecision, controller.routingOutcome.specialtyId);
    if (didConverge(controller.stoppingDecision)) {
      assert.equal(shown, SPECIALTY_LABEL[controller.routingOutcome.specialtyId], 'engine/UI mismatch');
    } else {
      assert.equal(shown, 'General Medicine', `${scenario.complaintId}: an unconverged lead is never shown`);
    }
    const expectedLeader = LEADER[scenario.expect];
    if (expectedLeader) {
      assert.equal(controller.stoppingDecision.topSpecialtyId, expectedLeader, `${scenario.complaintId} lead`);
      leaders.add(expectedLeader);
    }
  }
  assert.equal(leaders.size, 3, 'three different answer patterns lead to three different specialties');
});

test('correlated digestive answers alone no longer converge the engine on Gastroenterology', () => {
  /*
    A meal-related, burning pain with nausea used to end the engine on
    Gastroenterology by the margin rule alone, with the leader still under
    half the probability. Under the sufficiency rule both thresholds must hold,
    so the lead does not converge; Gastroenterology is reached only through its
    published criteria, which require a frequent or persistent pattern
    (direction-gate.test and the scripted paths cover that route).
  */
  const { controller } = runInterview('upper-abdominal-pain', {
    'upper-abdominal-pain-meal-relation': 'yes',
    'upper-abdominal-pain-burning': 'yes',
    'upper-abdominal-pain-nausea-vomiting': 'yes',
  }, 'no');
  assert.equal(controller.status, 'result');
  if (controller.status !== 'result') return;
  assert.equal(didConverge(controller.stoppingDecision), false);
  assert.equal(controller.stoppingDecision.topSpecialtyId, 'gastroenterology', 'the lead is still recorded');
  assert.equal(displayedDirection(controller.stoppingDecision, controller.routingOutcome.specialtyId), 'General Medicine');
});

/* --- SOAP handoff ----------------------------------------------------------- */

/** A cardiac breathing pattern that meets the published Cardiology criteria, for the Assessment wording. */
function convergedSoap() {
  const walk = walkAssessment(contextFor({ region: 'chest', concern: 'breathing', age: 45, sex: 'male' }), {
    'intake-history-symptom-character': 'tight',
    'intake-history-duration': 'under-hour',
    'shortness-of-breath-ankle-swelling': 'yes',
    'shortness-of-breath-lying-flat': 'yes',
    'shortness-of-breath-wheeze': 'no',
    'shortness-of-breath-palpitations': 'yes',
    // Respiratory Medicine is asked before Cardiology is concluded (differentiation).
    'intake-breathing-infections': 'no',
    'intake-breathing-phlegm': 'no',
  });
  assert.equal(walk.route?.registryId, 'cardiology');
  // The result screen and the trusted server both treat a supported direction as converged for the handoff.
  const converged = walk.route?.basis !== 'parent-service';
  assert.equal(converged, true);
  return buildSoapHandoff({
    complaintLabel: 'Shortness of breath',
    complaintSource: 'bridge-resolved',
    capture: { painLocation: { regionId: 'chest', precision: 'general-area' }, view: 'front' },
    intakePlan: intakeQuestionsFor(walk.context.complaintId, walk.context),
    intakeAnswers: [],
    timeline: walk.steps.map((step) => ({
      kind: 'routing' as const,
      questionId: step.questionId,
      text: step.text,
      label: step.answerLabel,
      answeredAt: '',
      changeable: true,
    })),
    converged,
    directionLabel: walk.route!.label,
  });
}

function soapFor(complaintSource: 'bridge-resolved' | 'patient-stated') {
  const { state, controller } = runInterview(
    'upper-abdominal-pain',
    {
      [INTAKE_QUESTION_IDS.symptomCharacter]: 'burning',
      'upper-abdominal-pain-meal-relation': 'yes',
      'upper-abdominal-pain-burning': 'yes',
      'upper-abdominal-pain-nausea-vomiting': 'yes',
    },
    'no',
  );
  assert.equal(controller.status, 'result');
  const converged = controller.status === 'result' && didConverge(controller.stoppingDecision);
  const timeline = state.session.answers.map((entry) => ({
    kind: 'routing' as const,
    questionId: entry.questionId,
    text: entry.questionId,
    label: entry.optionId === 'yes' ? 'Yes' : 'No',
    answeredAt: entry.answeredAt,
    changeable: true,
  }));
  return buildSoapHandoff({
    complaintLabel: 'Upper abdominal pain',
    complaintSource,
    capture: { painLocation: { regionId: 'upper-abdomen', precision: 'general-area' }, view: 'front' },
    intakePlan: intakeQuestionsFor('upper-abdominal-pain'),
    intakeAnswers: state.intakeAnswers,
    timeline,
    converged,
    directionLabel: 'Gastroenterology',
  });
}

test('SOAP has the four sections in order', () => {
  assert.deepEqual(soapFor('bridge-resolved').map((section) => section.key), ['S', 'O', 'A', 'P']);
});

test('SOAP Objective contains only kiosk-captured facts and no fabricated measurements', () => {
  const objective = soapFor('bridge-resolved').find((section) => section.key === 'O');
  assert.ok(objective);
  const text = objective.lines
    .filter((line) => line.value !== NO_MEASUREMENTS_NOTE)
    .map((line) => `${line.label} ${line.value}`)
    .join(' ')
    .toLowerCase();
  for (const forbidden of ['blood pressure', 'temperature', 'oxygen', 'saturation', 'spo2', 'pulse', 'heart rate', 'bpm', 'mmhg', 'tender', 'exam']) {
    assert.ok(!text.includes(forbidden), `objective mentions ${forbidden}`);
  }
  assert.ok(objective.lines.some((line) => line.value === NO_MEASUREMENTS_NOTE));
  assert.ok(objective.lines.some((line) => line.value === 'Upper abdomen'));
  assert.ok(objective.lines.some((line) => line.value === 'Front'));
});

test('SOAP Assessment is a routing assessment and never a diagnosis', () => {
  const assessment = convergedSoap().find((section) => section.key === 'A');
  assert.ok(assessment);
  const text = assessment.lines.map((line) => line.value).join(' ');
  assert.match(text, /most strongly supports Cardiology as the next clinical direction/);
  assert.equal(text.toLowerCase().match(/diagnos/g)?.length, 1, 'only the "not a diagnosis" disclaimer');
  assert.match(text, /not a diagnosis/);
});

test('SOAP Plan claims preparation, never transmission', () => {
  const plan = soapFor('bridge-resolved').find((section) => section.key === 'P');
  assert.ok(plan);
  const text = plan.lines.map((line) => line.value).join(' ');
  assert.ok(text.includes(HANDOFF_STATUS));
  assert.ok(!/\bsent\b|transmitted|delivered/i.test(text));
});

test('SOAP Subjective records only answered intake fields and notes a patient-stated concern', () => {
  const sections = soapFor('patient-stated');
  const subjective = sections.find((section) => section.key === 'S');
  assert.ok(subjective);
  assert.ok(subjective.lines.some((line) => line.label === 'Character' && line.value === 'Burning'));
  const objective = sections.find((section) => section.key === 'O');
  assert.ok(objective?.lines.some((line) => /Stated by the patient/.test(line.value)));
});
