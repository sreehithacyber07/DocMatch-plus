import assert from 'node:assert/strict';
import test from 'node:test';
import { replayBelief, type BeliefHistoryEntry, type StoppingDecision } from '../../engine/index.ts';
import {
  DEMONSTRATION_ENGINE_CONFIG,
  materializeDemonstrationComplaint,
  R2B_DEMONSTRATION_KNOWLEDGE,
} from '../../engine/data/index.ts';
import { displayedDirection, hasPresentableRoute } from '../routing-flow/handoff-presentation.ts';
import {
  buildClinicalRoutingExplanation,
  buildRouteVisualization,
  rankRoutingDirections,
  routeStrength,
  topBeliefChanges,
} from '../routing-flow/routing-presentation.ts';
import { SPECIALTY_REGISTRY, isWeightedRoutable, specialtyForEngineId } from '../routing-flow/specialty-registry.ts';
import { answer, currentStep, runInterview, startInterview } from './interview-driver.ts';

function historyEntry(
  before: ReturnType<typeof startInterview>['session']['belief'],
  after: ReturnType<typeof startInterview>['session']['belief'],
  questionId: string,
  optionId: string,
): BeliefHistoryEntry {
  return {
    questionId,
    optionId,
    answeredAt: new Date(1000).toISOString(),
    priorBelief: before,
    posteriorBelief: after,
  };
}

function timelineFor(state: ReturnType<typeof startInterview>) {
  return state.session.answers.map((entry) => ({
    kind: 'routing' as const,
    questionId: entry.questionId,
    text: entry.questionId,
    label: entry.optionId,
    answeredAt: entry.answeredAt,
    changeable: true,
  }));
}

test('beliefs map to registry labels and rank in exact engine-value order', () => {
  const belief = startInterview('upper-abdominal-pain').session.belief;
  const ranked = rankRoutingDirections(belief);
  assert.equal(ranked[0].label, 'Gastroenterology');
  assert.equal(ranked[1].label, 'Cardiology');
  assert.deepEqual(
    ranked.map((direction) => direction.rawValue),
    ranked.map((direction) => direction.rawValue).toSorted((left, right) => right - left),
  );
  assert.ok(ranked.every((direction) => specialtyForEngineId(direction.engineSpecialtyId).routingEnabled));
});

test('taxonomy-only and rule-gated specialties never enter the scored live field', () => {
  const ranked = rankRoutingDirections(startInterview('headache').session.belief);
  const ids = new Set(ranked.map((direction) => direction.registryId));
  // ENT is routable, but only through the deterministic gate. The live route
  // visualization ranks BELIEF, so a route with no likelihood must not appear
  // there: showing it beside scored candidates would imply a probability that
  // does not exist.
  assert.equal(ids.has('otorhinolaryngology'), false);
  assert.equal(ids.has('obstetrics-gynaecology'), false);
  assert.equal(ids.has('urology'), false);
  assert.equal(ids.has('ophthalmology'), false);
  assert.equal(ids.has('dermatology'), false);
  const ent = SPECIALTY_REGISTRY.find((record) => record.id === 'otorhinolaryngology');
  assert.equal(ent?.routingEnabled, true);
  assert.equal(ent?.engineSpecialtyId, undefined);
  // Dermatology is now routable through published skin criteria, but a belief can never select it.
  assert.equal(isWeightedRoutable(specialtyForEngineId('dermatology')), false);
});

test('intake-only answers preserve every route strength and report capture only', () => {
  const before = startInterview('upper-abdominal-pain');
  const step = currentStep(before);
  assert.equal(step.kind, 'intake');
  if (step.kind !== 'intake') return;
  const after = answer(before, step.question.options[0].id);
  const model = buildRouteVisualization({
    belief: after.session.belief,
    history: [],
    latestAnswerKind: 'intake',
    latestQuestionId: step.question.id,
  });
  assert.deepEqual(after.session.belief, before.session.belief);
  assert.equal(model.status, 'intake-captured');
  assert.deepEqual(model.changes, []);
  assert.match(model.announcement, /unchanged/i);
});

test('safety-owned answers do not manufacture route movement', () => {
  let state = startInterview('headache');
  for (let guard = 0; guard < 10; guard += 1) {
    const step = currentStep(state);
    if (step.kind === 'engine' && step.owner === 'safety') {
      const before = state.session.belief;
      state = answer(state, 'no');
      const model = buildRouteVisualization({
        belief: state.session.belief,
        history: [],
        latestAnswerKind: 'safety',
        latestQuestionId: step.question.id,
      });
      assert.deepEqual(state.session.belief, before);
      assert.equal(model.status, 'safety-captured');
      assert.deepEqual(model.changes, []);
      return;
    }
    assert.equal(step.kind, 'intake');
    if (step.kind !== 'intake') return;
    state = answer(state, step.question.options[0].id);
  }
  assert.fail('No safety-owned question reached.');
});

test('routing-evidence answers move the field using the actual posterior delta', () => {
  let state = startInterview('upper-abdominal-pain');
  for (let guard = 0; guard < 12; guard += 1) {
    const step = currentStep(state);
    if (step.kind === 'engine' && step.question.answerTarget === 'routing_session') {
      const before = state.session.belief;
      const optionId = 'no';
      state = answer(state, optionId);
      const entry = historyEntry(before, state.session.belief, step.question.id, optionId);
      const model = buildRouteVisualization({
        belief: state.session.belief,
        history: [entry],
        latestAnswerKind: 'routing',
        latestQuestionId: step.question.id,
      });
      assert.notDeepEqual(state.session.belief, before);
      assert.equal(model.status, 'routing-updated');
      assert.ok(model.changes.length > 0);
      for (const change of model.changes) {
        assert.equal(change.rawDelta, state.session.belief[change.engineSpecialtyId] - before[change.engineSpecialtyId]);
      }
      return;
    }
    assert.equal(step.kind, 'intake');
    if (step.kind !== 'intake') return;
    state = answer(state, step.question.options[0].id);
  }
  assert.fail('No routing-evidence question reached.');
});

test('top belief changes return the largest meaningful enabled increase and decrease', () => {
  const run = runInterview(
    'shortness-of-breath',
    { 'shortness-of-breath-ankle-swelling': 'yes' },
    'no',
  );
  const complaint = materializeDemonstrationComplaint(
    R2B_DEMONSTRATION_KNOWLEDGE,
    'shortness-of-breath',
    run.state.session.answers.map((entry) => ({ questionId: entry.questionId, optionId: entry.optionId })),
  );
  const replay = replayBelief(
    run.state.session.initialBelief,
    run.state.session.answers,
    complaint.questions,
    DEMONSTRATION_ENGINE_CONFIG.posteriorFloor,
  );
  const entry = replay.history[0];
  assert.ok(entry);
  const changes = topBeliefChanges(entry);
  const enabledIds = SPECIALTY_REGISTRY.filter((record) => record.routingEnabled && record.engineSpecialtyId).map(
    (record) => record.engineSpecialtyId!,
  );
  const deltas = enabledIds.map((id) => ({ id, value: entry.posteriorBelief[id] - entry.priorBelief[id] }));
  const expectedIncrease = deltas.toSorted((left, right) => right.value - left.value)[0];
  const expectedDecrease = deltas.toSorted((left, right) => left.value - right.value)[0];
  assert.equal(changes.find((change) => change.movement === 'increased')?.engineSpecialtyId, expectedIncrease.id);
  assert.equal(changes.find((change) => change.movement === 'decreased')?.engineSpecialtyId, expectedDecrease.id);
});

test('fallback selects General Medicine when the stop reason is question budget', () => {
  const { state, controller } = runInterview('headache', {}, 'no');
  assert.equal(controller.status, 'result');
  if (controller.status !== 'result') return;
  assert.equal(controller.stoppingDecision.reason, 'max_questions');
  const explanation = buildClinicalRoutingExplanation({
    engineSelectedSpecialtyId: controller.routingOutcome.specialtyId,
    stoppingDecision: controller.stoppingDecision,
    belief: state.session.belief,
    history: [],
    timeline: timelineFor(state),
    converged: false,
  });
  assert.equal(explanation.selectedSpecialty.label, 'General Medicine');
  assert.equal(explanation.selectedSpecialty.engineSpecialtyId, null);
  assert.equal(explanation.topBelief, null);
});

test('emergency interruption suppresses every normal routing direction', () => {
  const model = buildRouteVisualization({
    belief: startInterview('headache').session.belief,
    history: [],
    interrupted: true,
  });
  assert.equal(model.status, 'routing-paused');
  assert.deepEqual(model.visibleDirections, []);
  assert.deepEqual(model.otherDirections, []);
  assert.deepEqual(model.changes, []);
  assert.match(model.announcement, /Priority clinical review/);
});

test('converged patient directions equal the active engine-selected specialty', () => {
  // The mapping itself: a converged, enabled engine specialty is shown as that specialty.
  for (const specialtyId of ['cardiology', 'pulmonology', 'gastroenterology', 'orthopedics'] as const) {
    const decision: StoppingDecision = {
      shouldStop: true,
      reason: 'top_probability',
      triggeredConditions: ['top_probability', 'margin'],
      topSpecialtyId: specialtyId,
      topProbability: 0.8,
      secondSpecialtyId: specialtyId === 'cardiology' ? 'pulmonology' : 'cardiology',
      secondProbability: 0.1,
      margin: 0.7,
      askedCount: 4,
    };
    assert.equal(hasPresentableRoute(decision, specialtyId), true);
    assert.equal(displayedDirection(decision, specialtyId), specialtyForEngineId(specialtyId).patientFacingName);
  }
});

test('an unconverged engine lead is never shown as a direction', () => {
  // With the demonstration likelihoods these strong patterns lead but do not
  // meet both thresholds with sufficient support (PENDING CLINICAL REVIEW).
  const scenarios = [
    ['shortness-of-breath', { 'shortness-of-breath-ankle-swelling': 'yes', 'shortness-of-breath-lying-flat': 'yes', 'shortness-of-breath-palpitations': 'yes' }],
    ['joint-musculoskeletal-pain', { 'joint-musculoskeletal-pain-injury': 'yes', 'joint-musculoskeletal-pain-swelling-bruising': 'yes', 'joint-musculoskeletal-pain-use-weight': 'yes' }],
  ] as const;
  for (const [complaintId, answers] of scenarios) {
    const { controller } = runInterview(complaintId, answers, 'no');
    assert.equal(controller.status, 'result');
    if (controller.status !== 'result') continue;
    assert.equal(hasPresentableRoute(controller.stoppingDecision, controller.routingOutcome.specialtyId), false);
    assert.equal(displayedDirection(controller.stoppingDecision, controller.routingOutcome.specialtyId), 'General Medicine');
  }
});

test('a disabled engine specialty cannot become a patient-facing route', () => {
  const decision: StoppingDecision = {
    shouldStop: true,
    reason: 'margin',
    triggeredConditions: ['margin'],
    topSpecialtyId: 'dermatology',
    topProbability: 0.6,
    secondSpecialtyId: 'cardiology',
    secondProbability: 0.1,
    margin: 0.5,
    askedCount: 3,
  };
  assert.equal(hasPresentableRoute(decision, 'dermatology'), false);
  assert.equal(displayedDirection(decision, 'dermatology'), 'General Medicine');
});

test('qualitative route-strength thresholds are deterministic and presentation-only', () => {
  assert.equal(routeStrength(0.249), 'Emerging');
  assert.equal(routeStrength(0.25), 'Developing');
  assert.equal(routeStrength(0.449), 'Developing');
  assert.equal(routeStrength(0.45), 'Strong');
});
