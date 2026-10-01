import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  ASSESSMENT_STATUSES,
  SERVER_VERSIONS,
  TRUSTED_ASSESSMENT_CONTRACT_VERSION,
  TRUSTED_TRANSITIONS,
  TrustedError,
  isTrustedTransition,
  type TrustedErrorCode,
} from '../_shared/trusted/contract.ts';
import {
  deriveInterviewState,
  deriveRoutingResult,
  deriveSafetyEvent,
  isApprovedComplaint,
  type TrustedInterviewState,
} from '../_shared/trusted/derive.ts';
import { orderedSteps, type RoutingAnswerRow } from '../_shared/trusted/evidence.ts';
import {
  handleAssessmentStart,
  handleRoutingFinalize,
  handleSafetyEvaluate,
  type AssessmentRow,
  type EvidenceRows,
  type FinalizeArgs,
  type SafetyEventArgs,
  type StartArgs,
  type TrustedStore,
} from '../_shared/trusted/operations.ts';
import { MAX_BODY_BYTES, parseAssessmentOperation, parseAssessmentStart, parseJsonBody } from '../_shared/trusted/request.ts';
import { NO_MEASUREMENTS_NOTE as SERVER_NO_MEASUREMENTS_NOTE } from '../_shared/trusted/soap-constants.ts';
import { activeBodySelection, trustedSoapInputs, validateSoapSections } from '../_shared/trusted/soap-boundary.ts';
import { ASSESSMENT_CONTRACT_VERSION } from '../../../src/features/persistence/records.ts';
import { GENERAL_MEDICINE, specialtyForEngineId } from '../../../src/features/routing-flow/specialty-registry.ts';
import { hasPresentableRoute } from '../../../src/features/routing-flow/handoff-presentation.ts';
import { R2B_DEMONSTRATION_COMPLAINTS } from '../../../src/engine/data/index.ts';
import { R3_SAFETY_KNOWLEDGE } from '../../../src/engine/safety/index.ts';
import { answer, controllerFor, currentStep, startInterview, type DriverState } from '../../../src/features/tests/interview-driver.ts';
import { PersistenceRecorder, randomWalk, type RecordedStreams } from './browser-mirror.ts';

const ROOT = process.cwd();
const source = (relativePath: string) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
// soap-handoff.ts pulls in a React module, so its constant is read as text.
const NO_MEASUREMENTS_NOTE = /export const NO_MEASUREMENTS_NOTE =\s*'([^']+)'/.exec(source('src/features/routing-flow/soap-handoff.ts'))![1];
const COMPLAINTS = R2B_DEMONSTRATION_COMPLAINTS.map((complaint) => complaint.id);

function expectCode(run: () => unknown, code: TrustedErrorCode) {
  assert.throws(run, (error: unknown) => error instanceof TrustedError && error.code === code);
}

async function expectRejects(run: () => Promise<unknown>, code: TrustedErrorCode) {
  await assert.rejects(run, (error: unknown) => error instanceof TrustedError && error.code === code);
}

function serverState(complaintId: string, streams: RecordedStreams): TrustedInterviewState {
  return deriveInterviewState({
    complaintId,
    routingRows: streams.routing,
    safetyRows: streams.safety,
    intakeRows: streams.intake,
  });
}

/** Everything the browser shows or would persist, compared field by field. */
function assertParity(browser: DriverState, server: TrustedInterviewState, label: string) {
  const pairs = (answers: readonly { questionId: string; optionId: string }[]) =>
    answers.map((entry) => `${entry.questionId}=${entry.optionId}`);
  assert.deepEqual(pairs(server.session.answers), pairs(browser.session.answers), `${label}: routing answer order`);
  assert.deepEqual(server.session.belief, browser.session.belief, `${label}: belief (exact)`);
  assert.deepEqual(server.session.askedQuestionIds, browser.session.askedQuestionIds, `${label}: asked`);
  assert.deepEqual(
    [...pairs(server.safetyAnswers)].sort(),
    [...pairs(browser.safetyAnswers)].sort(),
    `${label}: safety answers`,
  );
  assert.deepEqual([...pairs(server.intakeAnswers)].sort(), [...pairs(browser.intakeAnswers)].sort(), `${label}: intake`);

  const browserController = controllerFor(browser);
  assert.equal(server.controller.status, browserController.status, `${label}: controller status`);
  assert.equal(server.step.kind, currentStep(browser).kind, `${label}: interview step`);
  if (server.controller.status === 'interrupted' && browserController.status === 'interrupted') {
    assert.deepEqual(server.controller.firedRuleIds, browserController.firedRuleIds, `${label}: fired`);
    assert.equal(server.controller.selectedRuleId, browserController.selectedRuleId, `${label}: selected rule`);
    assert.equal(server.controller.payload.id, browserController.payload.id, `${label}: payload`);
  }
  if (server.controller.status === 'result' && browserController.status === 'result') {
    assert.deepEqual(server.controller.stoppingDecision, browserController.stoppingDecision, `${label}: stop decision`);
    assert.deepEqual(server.controller.routingOutcome, browserController.routingOutcome, `${label}: routing outcome`);
  }
  if (server.controller.status === 'question' && browserController.status === 'question') {
    assert.equal(server.controller.selection.questionId, browserController.selection.questionId, `${label}: next question`);
  }
}

/* --- 1. Contract and drift guards ------------------------------------------- */

test('server contract matches the browser persistence contract and frozen versions', () => {
  assert.equal(TRUSTED_ASSESSMENT_CONTRACT_VERSION, ASSESSMENT_CONTRACT_VERSION);
  assert.equal(SERVER_NO_MEASUREMENTS_NOTE, NO_MEASUREMENTS_NOTE);
  assert.deepEqual(SERVER_VERSIONS, {
    engineVersion: '1.0.0-r1',
    knowledgeVersion: '0.2.0-r2b-demonstration',
    safetyVersion: '0.1.0-r3-safety-demonstration',
  });
});

test('the lifecycle model uses only R9A statuses and three explicit transitions', () => {
  for (const transition of TRUSTED_TRANSITIONS) {
    assert.ok((ASSESSMENT_STATUSES as readonly string[]).includes(transition.from));
    assert.ok((ASSESSMENT_STATUSES as readonly string[]).includes(transition.to));
  }
  assert.equal(isTrustedTransition('created', 'in_progress'), true);
  assert.equal(isTrustedTransition('in_progress', 'priority_escalated'), true);
  assert.equal(isTrustedTransition('in_progress', 'routing_complete'), true);
  for (const [from, to] of [
    ['created', 'routing_complete'],
    ['created', 'priority_escalated'],
    ['priority_escalated', 'in_progress'],
    ['routing_complete', 'handoff_prepared'],
    ['in_progress', 'closed'],
    ['closed', 'in_progress'],
  ]) {
    assert.equal(isTrustedTransition(from, to), false, `${from} -> ${to}`);
  }
});

test('trusted code shares the frozen engine instead of copying it', () => {
  const derive = source('supabase/functions/_shared/trusted/derive.ts');
  for (const imported of [
    'src/engine/index.ts',
    'src/engine/data/index.ts',
    'src/engine/safety/index.ts',
    'src/features/routing-flow/interview-plan.ts',
    'src/features/routing-flow/handoff-presentation.ts',
    'src/features/routing-flow/specialty-registry.ts',
  ]) {
    assert.match(derive, new RegExp(`'\\.\\./\\.\\./\\.\\./\\.\\./${imported.replace(/[./]/g, (c) => `\\${c}`)}'`), imported);
  }
  const trustedDir = path.join(ROOT, 'supabase/functions/_shared/trusted');
  const all = fs.readdirSync(trustedDir).map((name) => fs.readFileSync(path.join(trustedDir, name), 'utf8')).join('\n');
  assert.doesNotMatch(all, /likelihoods\s*:|topProbabilityThreshold\s*[:=]|marginThreshold\s*[:=]|maxQuestions\s*[:=]|predicate\s*:/);
});

/* --- 2. Request validation ---------------------------------------------------- */

const A = 'aaaaaaaa-1111-4111-8111-111111111111';
const B = 'bbbbbbbb-2222-4222-8222-222222222222';
const E = 'eeeeeeee-3333-4333-8333-333333333333';

test('request bodies are closed: forged owner, facility, device, staff, outcome and SOAP fields are refused', () => {
  const start = { assessmentId: A, clientEventId: E, complaintId: 'headache', complaintSource: 'bridge-resolved' };
  assert.deepEqual(parseAssessmentStart(start), start);
  for (const forged of [
    { ownerAuthUserId: B },
    { owner_auth_user_id: B },
    { facilityId: B },
    { kioskDeviceId: B },
    { staffProfileId: B },
    { initiatedByStaffProfileId: B },
    { status: 'routing_complete' },
    { userId: B },
    { role: 'clinical_staff' },
  ]) {
    expectCode(() => parseAssessmentStart({ ...start, ...forged }), 'INVALID_REQUEST');
  }
  const op = { assessmentId: A, clientEventId: E };
  assert.deepEqual(parseAssessmentOperation(op), op);
  for (const forged of [
    { emergency: true },
    { emergency: false },
    { firedRuleIds: ['headache-sudden-extremely-painful'] },
    { selectedSpecialtyRegistryId: 'cardiology' },
    { specialty: 'neurology' },
    { belief: {} },
    { supportingAnswerIds: [B] },
    { sections: { S: [], O: [], A: [], P: [] } },
    { soap: 'anything' },
  ]) {
    expectCode(() => parseAssessmentOperation({ ...op, ...forged }), 'INVALID_REQUEST');
  }
  for (const bad of [
    null,
    [],
    'x',
    { assessmentId: 'not-a-uuid', clientEventId: E },
    { assessmentId: A },
    { assessmentId: A, clientEventId: 7 },
    Object.assign(Object.create({ inherited: true }), op),
  ]) {
    expectCode(() => parseAssessmentOperation(bad), 'INVALID_REQUEST');
  }
  expectCode(() => parseAssessmentStart({ ...start, complaintSource: 'kiosk-asserted' }), 'INVALID_REQUEST');
  expectCode(() => parseAssessmentStart({ ...start, complaintId: 'Headache; drop table' }), 'INVALID_REQUEST');
  expectCode(() => parseJsonBody('{'), 'INVALID_REQUEST');
  expectCode(() => parseJsonBody(JSON.stringify({ pad: 'x'.repeat(MAX_BODY_BYTES) })), 'PAYLOAD_TOO_LARGE');
});

test('only approved, parameterized complaints covered by R3 are accepted', () => {
  for (const id of COMPLAINTS) assert.equal(isApprovedComplaint(id), true, id);
  for (const id of ['skin-concern', 'joint-pain', 'chest-pain', 'toothache', 'head', 'cardiology']) {
    assert.equal(isApprovedComplaint(id), false, id);
  }
});

/* --- 3. R1/R2 and R3 parity ---------------------------------------------------- */

function recordInterview(complaintId: string, answers: Readonly<Record<string, string>>, fallback: 'yes' | 'no' = 'no') {
  let state = startInterview(complaintId);
  const recorder = new PersistenceRecorder(complaintId);
  recorder.observe(state);
  for (let guard = 0; guard < 60; guard += 1) {
    const step = currentStep(state);
    if (step.kind === 'interrupted' || step.kind === 'result') break;
    state = answer(state, answers[step.question.id] ?? (step.kind === 'intake' ? step.question.options[0].id : fallback));
    recorder.observe(state);
  }
  return { state, recorder };
}

test('PARITY: known routing vectors (converged, General Medicine fallback, max-questions stop)', () => {
  const vectors: Array<{ name: string; complaintId: string; answers: Record<string, string>; fallback: 'yes' | 'no' }> = [
    { name: 'joint injury converges to Orthopaedics', complaintId: 'joint-musculoskeletal-pain', answers: { 'joint-musculoskeletal-pain-injury': 'yes', 'joint-musculoskeletal-pain-swelling-bruising': 'yes', 'joint-musculoskeletal-pain-use-weight': 'yes' }, fallback: 'no' },
    { name: 'all-no upper abdominal falls back to General Medicine', complaintId: 'upper-abdominal-pain', answers: {}, fallback: 'no' },
  ];
  for (const complaintId of COMPLAINTS) vectors.push({ name: `${complaintId} all-no`, complaintId, answers: {}, fallback: 'no' });

  const seen = new Set<string>();
  for (const vector of vectors) {
    const { state, recorder } = recordInterview(vector.complaintId, vector.answers, vector.fallback);
    const server = serverState(vector.complaintId, recorder.streams);
    assertParity(state, server, vector.name);
    const browser = controllerFor(state);
    if (browser.status !== 'result') continue;
    const derived = deriveRoutingResult(server);
    const expectedEndpoint = hasPresentableRoute(browser.stoppingDecision, browser.routingOutcome.specialtyId)
      ? specialtyForEngineId(browser.routingOutcome.specialtyId).id
      : GENERAL_MEDICINE.id;
    assert.equal(derived.selectedSpecialtyRegistryId, expectedEndpoint, vector.name);
    assert.equal(derived.engineTopSpecialtyId, browser.routingOutcome.specialtyId, vector.name);
    assert.equal(derived.stopReason, browser.routingOutcome.stopReason, vector.name);
    assert.deepEqual(derived.belief, state.session.belief, vector.name);
    seen.add(derived.stopReason);
    seen.add(derived.converged ? 'converged' : 'fallback');
    // Supporting answers are exactly the rows behind R1's retained answers.
    const expectedSupport = state.session.answers.map((entry) =>
      recorder.streams.routing.filter((row) => row.question_id === entry.questionId && row.operation === 'selected').at(-1)!.id,
    );
    assert.deepEqual(derived.supportingAnswerRecordIds, expectedSupport, vector.name);
  }
  const orthopaedics = recordInterview('joint-musculoskeletal-pain', vectors[0].answers);
  assert.equal(deriveRoutingResult(serverState('joint-musculoskeletal-pain', orthopaedics.recorder.streams)).selectedSpecialtyRegistryId, 'orthopaedics');
  const fallback = recordInterview('upper-abdominal-pain', {});
  const fallbackResult = deriveRoutingResult(serverState('upper-abdominal-pain', fallback.recorder.streams));
  assert.equal(fallbackResult.selectedSpecialtyRegistryId, 'general-medicine');
  assert.equal(fallbackResult.stopReason, 'max_questions');
  assert.ok(seen.has('converged') && seen.has('fallback') && seen.has('max_questions'), [...seen].join(','));
});

test('PARITY: 1,200 random interviews with corrections replay bit-for-bit from persisted events', () => {
  let removals = 0;
  const statuses = new Map<string, number>();
  for (const complaintId of COMPLAINTS) {
    for (let seed = 1; seed <= 300; seed += 1) {
      const walk = randomWalk(complaintId, seed * 7919 + complaintId.length);
      removals += walk.removals;
      const server = serverState(complaintId, walk.recorder.streams);
      assertParity(walk.state, server, `${complaintId}#${seed}`);
      statuses.set(server.controller.status, (statuses.get(server.controller.status) ?? 0) + 1);
      if (server.controller.status === 'interrupted') {
        const event = deriveSafetyEvent(server);
        assert.ok(event && event.firedRuleIds.includes(event.selectedRuleId));
      } else {
        assert.equal(deriveSafetyEvent(server), null);
      }
    }
  }
  assert.ok(removals > 500, `corrections exercised: ${removals}`);
  for (const status of ['interrupted', 'result']) assert.ok((statuses.get(status) ?? 0) > 20, `${status}: ${statuses.get(status)}`);
});

test('PARITY: every intermediate commit of a corrected interview matches, not just the end', () => {
  for (const complaintId of COMPLAINTS) {
    for (let seed = 1; seed <= 12; seed += 1) {
      const walk = randomWalk(complaintId, seed, { maxCommits: 1 });
      let steps = 1;
      // Re-walk with growing length so each prefix is checked against its own rows.
      for (let commits = 2; commits <= 24; commits += 1) {
        const prefix = randomWalk(complaintId, seed, { maxCommits: commits });
        assertParity(prefix.state, serverState(complaintId, prefix.recorder.streams), `${complaintId}#${seed}@${commits}`);
        steps += 1;
      }
      assert.ok(steps > 1 && walk.state.complaintId === complaintId);
    }
  }
});

test('SAFETY: every R3 rule is independently reached by the server, with the right evidence', () => {
  for (const rule of R3_SAFETY_KNOWLEDGE.rules) {
    const complaintId = rule.applicableComplaintIds[0];
    const yes = Object.fromEntries(rule.requiredQuestionIds.map((id) => [id, 'yes']));
    if (rule.id.startsWith('joint-injury')) yes['joint-musculoskeletal-pain-injury'] = 'yes';
    const { state, recorder } = recordInterview(complaintId, yes);
    const browser = controllerFor(state);
    const server = serverState(complaintId, recorder.streams);
    if (rule.continuationPolicy === 'may_continue_after_acknowledgement') {
      // An urgent rule continues: the browser keeps asking and carries the
      // urgency to the result, and the server reaches the same urgency from the
      // same evidence. The deployed safety-evaluate records only must-stop
      // events, so continuable urgency is not persisted by it; that is the
      // documented migration gap, pinned here so it stays visible.
      assert.notEqual(browser.status, 'interrupted', rule.id);
      assert.ok(browser.urgentReview?.firedRuleIds.includes(rule.id), rule.id);
      assert.deepEqual(server.controller.urgentReview?.firedRuleIds, browser.urgentReview?.firedRuleIds, rule.id);
      assert.equal(deriveSafetyEvent(server), null, rule.id);
      continue;
    }
    assert.equal(browser.status, 'interrupted', rule.id);
    const event = deriveSafetyEvent(server);
    assert.ok(event, rule.id);
    if (browser.status !== 'interrupted') continue;
    assert.deepEqual(event.firedRuleIds, browser.firedRuleIds, rule.id);
    assert.equal(event.selectedRuleId, browser.selectedRuleId, rule.id);
    assert.equal(event.payloadId, browser.payload.id, rule.id);
    assert.equal(event.severity, browser.severity, rule.id);
    assert.equal(event.ruleVersion, SERVER_VERSIONS.safetyVersion, rule.id);
    const allRows = [...recorder.streams.routing, ...recorder.streams.safety];
    for (const reference of event.evidence) {
      const row = allRows.find((candidate) => candidate.id === reference.recordId);
      assert.ok(row && row.operation === 'selected', `${rule.id} evidence ${reference.recordId}`);
      assert.equal(reference.table, recorder.streams.routing.includes(row as RoutingAnswerRow) ? 'routing_answers' : 'safety_answers');
    }
    const cited = new Set(event.evidence.map((reference) => allRows.find((row) => row.id === reference.recordId)!.question_id));
    // Every answered question a fired rule requires is cited; an unasked one (an 'any' branch never reached) cannot be.
    const answered = new Set([...state.session.answers, ...state.safetyAnswers].map((entry) => entry.questionId));
    const firedRules = R3_SAFETY_KNOWLEDGE.rules.filter((candidate) => event.firedRuleIds.includes(candidate.id));
    for (const questionId of firedRules.flatMap((candidate) => candidate.requiredQuestionIds)) {
      assert.equal(cited.has(questionId), answered.has(questionId), `${rule.id} cites ${questionId}`);
    }
    for (const questionId of cited) assert.ok(firedRules.some((candidate) => candidate.requiredQuestionIds.includes(questionId)), `${rule.id} over-cites ${questionId}`);
  }
});

test('SAFETY: a non-triggering interview derives no event, and a withdrawn trigger is not evidence', () => {
  for (const complaintId of COMPLAINTS) {
    const { recorder } = recordInterview(complaintId, {}, 'no');
    assert.equal(deriveSafetyEvent(serverState(complaintId, recorder.streams)), null, complaintId);
  }
  // The headache red flag answered yes, then withdrawn before persistence caught up with a new answer.
  let state = startInterview('headache');
  const recorder = new PersistenceRecorder('headache');
  state = answer(state, 'throbbing');
  state = answer(state, '5');
  state = answer(state, 'yes');
  recorder.observe(state);
  assert.ok(deriveSafetyEvent(serverState('headache', recorder.streams)));
  state = { ...state, safetyAnswers: state.safetyAnswers.filter((entry) => entry.questionId !== 'safety-headache-sudden-extremely-painful') };
  recorder.observe(state);
  assert.equal(deriveSafetyEvent(serverState('headache', recorder.streams)), null);
});

test('ROUTING: the result is refused until the patient screen would show it', () => {
  const partial = startInterview('headache');
  const recorder = new PersistenceRecorder('headache');
  recorder.observe(answer(partial, 'throbbing'));
  expectCode(() => deriveRoutingResult(serverState('headache', recorder.streams)), 'ROUTING_NOT_FINAL');

  const triggered = recordInterview('headache', { 'safety-headache-sudden-extremely-painful': 'yes' });
  expectCode(() => deriveRoutingResult(serverState('headache', triggered.recorder.streams)), 'ROUTING_NOT_FINAL');

  // Routing finished but one intake question withdrawn: the screen shows that question, not a result.
  const done = recordInterview('headache', {});
  assert.equal(deriveRoutingResult(serverState('headache', done.recorder.streams)).stopReason.length > 0, true);
  const withdrawn = { ...done.state, intakeAnswers: done.state.intakeAnswers.slice(1) };
  done.recorder.observe(withdrawn);
  expectCode(() => deriveRoutingResult(serverState('headache', done.recorder.streams)), 'ROUTING_NOT_FINAL');
});

/* --- 4. Forged evidence ---------------------------------------------------------- */

test('forged evidence chains, foreign questions and wrong versions are refused', () => {
  const { recorder } = recordInterview('headache', {});
  const good = recorder.streams;
  const derive = (patch: Partial<RecordedStreams>, complaintId = 'headache') =>
    deriveInterviewState({ complaintId, routingRows: patch.routing ?? good.routing, safetyRows: patch.safety ?? good.safety, intakeRows: patch.intake ?? good.intake });

  assert.ok(derive({}));
  const first = good.routing[0];
  expectCode(() => derive({ routing: [...good.routing, { ...first, id: 'x1', sequence: 999, supersedes_record_id: null }] }), 'INVALID_EVIDENCE');
  expectCode(() => derive({ routing: [...good.routing, { ...first, id: 'x2', sequence: 999, supersedes_record_id: 'someone-else' }] }), 'INVALID_EVIDENCE');
  expectCode(() => derive({ routing: [{ ...first, operation: 'cleared', option_id: null }] }), 'INVALID_EVIDENCE');
  expectCode(() => derive({ routing: [{ ...first, operation: 'deleted' }] }), 'INVALID_EVIDENCE');
  expectCode(() => derive({ routing: [{ ...first, option_id: 'maybe' }] }), 'INVALID_EVIDENCE');
  expectCode(() => derive({ routing: [{ ...first, question_id: 'upper-abdominal-pain-exertional' }] }), 'INVALID_EVIDENCE');
  expectCode(() => derive({ routing: [{ ...first, question_id: 'safety-headache-sudden-extremely-painful' }] }), 'INVALID_EVIDENCE');
  expectCode(() => derive({ routing: [{ ...first, knowledge_version: '9.9.9-forged' }] }), 'VERSION_MISMATCH');
  expectCode(() => derive({ routing: [{ ...first, answered_at: 'yesterday' }] }), 'INVALID_EVIDENCE');
  expectCode(() => derive({ routing: [first, { ...good.routing[1], sequence: first.sequence }] }), 'INVALID_EVIDENCE');
  expectCode(() => derive({ routing: Array.from({ length: 201 }, (_, index) => ({ ...first, id: `n${index}`, sequence: index + 1 })) }), 'INVALID_EVIDENCE');
  if (good.safety[0]) {
    expectCode(() => derive({ safety: [{ ...good.safety[0], question_id: first.question_id }] }), 'INVALID_EVIDENCE');
    expectCode(() => derive({ safety: [{ ...good.safety[0], safety_version: 'forged' }] }), 'VERSION_MISMATCH');
  }
  expectCode(() => derive({ intake: [{ ...good.intake[0], category: 'context' }] }), 'INVALID_EVIDENCE');
  expectCode(() => derive({}, 'skin-concern'), 'COMPLAINT_NOT_SUPPORTED');
  expectCode(() => derive({}, 'shortness-of-breath'), 'INVALID_EVIDENCE');
  assert.equal(orderedSteps([]).length, 0);
});

/* --- 5. Handlers with a fake store -------------------------------------------------- */

const OWNER = 'aaaaaaaa-0000-4000-8000-00000000000a';
const OTHER = 'bbbbbbbb-0000-4000-8000-00000000000b';

function assessmentRow(overrides: Partial<AssessmentRow> = {}): AssessmentRow {
  return {
    id: A,
    owner_auth_user_id: OWNER,
    contract_version: TRUSTED_ASSESSMENT_CONTRACT_VERSION,
    deployment_mode: 'web/self-service',
    status: 'in_progress',
    complaint_id: 'headache',
    complaint_source: 'bridge-resolved',
    facility_id: null,
    kiosk_device_id: null,
    initiated_by_staff_profile_id: null,
    engine_version: SERVER_VERSIONS.engineVersion,
    knowledge_version: SERVER_VERSIONS.knowledgeVersion,
    safety_version: SERVER_VERSIONS.safetyVersion,
    created_at: '2025-12-31T00:00:00.000Z',
    ...overrides,
  };
}

function fakeStore(assessment: AssessmentRow, evidence: EvidenceRows) {
  const calls: { start: StartArgs[]; safety: SafetyEventArgs[]; finalize: FinalizeArgs[] } = { start: [], safety: [], finalize: [] };
  const store: TrustedStore = {
    async loadOwnedAssessment(id, owner) {
      return id === assessment.id && owner === assessment.owner_auth_user_id ? assessment : null;
    },
    async loadEvidence() {
      return evidence;
    },
    async startAssessment(args) {
      calls.start.push(args);
      return { ok: true, outcome: 'applied', status: 'in_progress', recordId: null };
    },
    async recordSafetyEvent(args) {
      calls.safety.push(args);
      return { ok: true, outcome: 'applied', status: 'priority_escalated', recordId: 'event-1' };
    },
    async finalizeRouting(args) {
      calls.finalize.push(args);
      return { ok: true, outcome: 'applied', status: 'routing_complete', recordId: 'result-1' };
    },
  };
  return { store, calls };
}

const patient = { userId: OWNER, isAnonymous: true };
const op = { assessmentId: A, clientEventId: E };

test('handlers: another patient, a permanent user or an unknown assessment all get the same refusal', async () => {
  const { recorder } = recordInterview('headache', {});
  const evidence = { routing: recorder.streams.routing, safety: recorder.streams.safety, intake: recorder.streams.intake };
  const { store, calls } = fakeStore(assessmentRow(), evidence);
  await expectRejects(() => handleRoutingFinalize(store, { userId: OTHER, isAnonymous: true }, op), 'ASSESSMENT_NOT_FOUND');
  await expectRejects(() => handleSafetyEvaluate(store, { userId: OTHER, isAnonymous: true }, op), 'ASSESSMENT_NOT_FOUND');
  await expectRejects(() => handleRoutingFinalize(store, patient, { ...op, assessmentId: B }), 'ASSESSMENT_NOT_FOUND');
  await expectRejects(() => handleRoutingFinalize(store, { userId: OWNER, isAnonymous: false }, op), 'PATIENT_REQUIRED');
  await expectRejects(
    () => handleAssessmentStart(store, { userId: OTHER, isAnonymous: true }, { ...op, complaintId: 'headache', complaintSource: 'bridge-resolved' }),
    'ASSESSMENT_NOT_FOUND',
  );
  assert.deepEqual(calls, { start: [], safety: [], finalize: [] });
});

test('handlers: kiosk, facility, staff or foreign-version assessments are refused before any write', async () => {
  const empty = { routing: [], safety: [], intake: [] };
  for (const [overrides, code] of [
    [{ deployment_mode: 'hospital-kiosk' }, 'UNSUPPORTED_DEPLOYMENT'],
    [{ deployment_mode: 'staffed-tablet' }, 'UNSUPPORTED_DEPLOYMENT'],
    [{ facility_id: B }, 'UNSUPPORTED_DEPLOYMENT'],
    [{ kiosk_device_id: B }, 'UNSUPPORTED_DEPLOYMENT'],
    [{ initiated_by_staff_profile_id: B }, 'UNSUPPORTED_DEPLOYMENT'],
    [{ contract_version: 'r9d-live-test-x' }, 'VERSION_MISMATCH'],
    [{ engine_version: '0.9.0' }, 'VERSION_MISMATCH'],
    [{ knowledge_version: '0.1.0' }, 'VERSION_MISMATCH'],
    [{ safety_version: '0.0.1' }, 'VERSION_MISMATCH'],
  ] as const) {
    const { store, calls } = fakeStore(assessmentRow(overrides), empty);
    await expectRejects(() => handleRoutingFinalize(store, patient, op), code);
    await expectRejects(() => handleAssessmentStart(store, patient, { ...op, complaintId: 'headache', complaintSource: 'bridge-resolved' }), code);
    assert.equal(calls.start.length + calls.finalize.length, 0);
  }
});

test('handlers: start validates the complaint and never lets the body pick status or owner', async () => {
  const { store, calls } = fakeStore(assessmentRow({ status: 'created', complaint_id: null, complaint_source: null }), { routing: [], safety: [], intake: [] });
  await expectRejects(() => handleAssessmentStart(store, patient, { ...op, complaintId: 'skin-concern', complaintSource: 'bridge-resolved' }), 'COMPLAINT_NOT_SUPPORTED');
  await expectRejects(() => handleAssessmentStart(store, patient, { ...op, complaintId: 'toothache', complaintSource: 'patient-stated' }), 'COMPLAINT_NOT_SUPPORTED');
  const result = await handleAssessmentStart(store, patient, { ...op, complaintId: 'headache', complaintSource: 'patient-stated' });
  assert.deepEqual(result, { outcome: 'applied', status: 'in_progress' });
  assert.deepEqual(calls.start, [{ assessmentId: A, ownerAuthUserId: OWNER, clientEventId: E, complaintId: 'headache', complaintSource: 'patient-stated' }]);
  // A created assessment has nothing to evaluate or finalize yet.
  await expectRejects(() => handleSafetyEvaluate(store, patient, op), 'INVALID_STATE');
  await expectRejects(() => handleRoutingFinalize(store, patient, op), 'INVALID_STATE');
});

test('handlers: the store only ever receives server-derived safety and routing values', async () => {
  const flagged = recordInterview('headache', { 'safety-headache-sudden-extremely-painful': 'yes' });
  const flaggedStore = fakeStore(assessmentRow(), flagged.recorder.streams);
  const safety = await handleSafetyEvaluate(flaggedStore.store, patient, op, new Date('2026-06-01T00:00:00Z'));
  assert.deepEqual(safety, { outcome: 'applied', status: 'priority_escalated', safetyEventId: 'event-1' });
  const sent = flaggedStore.calls.safety[0];
  const browser = controllerFor(flagged.state);
  assert.equal(browser.status, 'interrupted');
  if (browser.status === 'interrupted') {
    assert.deepEqual(sent.firedRuleIds, browser.firedRuleIds);
    assert.equal(sent.selectedRuleId, browser.selectedRuleId);
  }
  assert.equal(sent.ownerAuthUserId, OWNER);
  assert.ok(Date.parse(sent.triggeredAt) >= Date.parse('2025-12-31T00:00:00.000Z'));
  assert.ok(Date.parse(sent.triggeredAt) <= Date.parse('2026-06-01T00:00:00Z'));
  await expectRejects(() => handleRoutingFinalize(flaggedStore.store, patient, op), 'ROUTING_NOT_FINAL');

  const quiet = recordInterview('joint-musculoskeletal-pain', { 'joint-musculoskeletal-pain-injury': 'yes', 'joint-musculoskeletal-pain-swelling-bruising': 'yes', 'joint-musculoskeletal-pain-use-weight': 'yes' });
  const quietStore = fakeStore(assessmentRow({ complaint_id: 'joint-musculoskeletal-pain' }), quiet.recorder.streams);
  assert.deepEqual(await handleSafetyEvaluate(quietStore.store, patient, op), { outcome: 'not_triggered', status: 'in_progress' });
  assert.equal(quietStore.calls.safety.length, 0, 'no event without a server-reached trigger');
  const routed = await handleRoutingFinalize(quietStore.store, patient, op);
  assert.deepEqual(routed, { outcome: 'applied', status: 'routing_complete', routingResultId: 'result-1' });
  const args = quietStore.calls.finalize[0];
  assert.equal(args.selectedSpecialtyRegistryId, 'orthopaedics');
  assert.deepEqual(args.belief, quiet.state.session.belief);
  assert.equal(args.supportingAnswerIds.length, quiet.state.session.answers.length);
  assert.ok(args.supportingAnswerIds.every((id) => quiet.recorder.streams.routing.some((row) => row.id === id)));
});

test('handlers: store refusals surface as stable codes, unknown codes as INTERNAL', async () => {
  const { recorder } = recordInterview('headache', {});
  for (const code of ['IDEMPOTENCY_CONFLICT', 'STALE_EVIDENCE', 'INVALID_STATE', 'INVALID_EVIDENCE']) {
    const { store } = fakeStore(assessmentRow(), recorder.streams);
    store.finalizeRouting = async () => ({ ok: false, code });
    await expectRejects(() => handleRoutingFinalize(store, patient, op), code as TrustedErrorCode);
  }
  const { store } = fakeStore(assessmentRow(), recorder.streams);
  store.finalizeRouting = async () => ({ ok: false, code: 'relation "x" does not exist' });
  await expectRejects(() => handleRoutingFinalize(store, patient, op), 'INTERNAL');
});

/* --- 6. SOAP boundary ------------------------------------------------------------------- */

const VALID_SOAP = {
  S: [{ label: 'Main concern', value: 'Headache' }],
  O: [
    { label: 'Body region selected', value: 'Head' },
    { label: 'Measurements', value: NO_MEASUREMENTS_NOTE },
  ],
  A: [{ label: 'Routing assessment', value: 'Response pattern most strongly supports Neurology as the next clinical direction.' }],
  P: [{ label: 'Handoff', value: 'Prepared for clinical handoff. Clinical decisions remain with the care team.' }],
};

test('SOAP: only an exact S/O/A/P document without fabrication, diagnosis, treatment or delivery claims passes', () => {
  assert.ok(validateSoapSections(VALID_SOAP));
  const bad: unknown[] = [
    null,
    [],
    'S: headache',
    { ...VALID_SOAP, X: [] },
    { S: VALID_SOAP.S, O: VALID_SOAP.O, A: VALID_SOAP.A },
    { ...VALID_SOAP, S: [] },
    { ...VALID_SOAP, S: [{ label: 'Main concern' }] },
    { ...VALID_SOAP, S: [{ label: 'Main concern', value: 'x', extra: 1 }] },
    { ...VALID_SOAP, S: [{ label: 'Main concern', value: 'x'.repeat(1201) }] },
    { ...VALID_SOAP, O: [{ label: 'Body region selected', value: 'Head' }] },
    { ...VALID_SOAP, O: [...VALID_SOAP.O, { label: 'Vitals', value: 'Blood pressure 120/80 mmHg' }] },
    { ...VALID_SOAP, O: [...VALID_SOAP.O, { label: 'Exam', value: 'On examination the neck was stiff' }] },
    { ...VALID_SOAP, O: [...VALID_SOAP.O, { label: 'Imaging', value: 'CT shows nothing' }] },
    { ...VALID_SOAP, A: [{ label: 'Assessment', value: 'Patient diagnosed with migraine' }] },
    { ...VALID_SOAP, A: [{ label: 'Assessment', value: 'Differential diagnosis: migraine' }] },
    { ...VALID_SOAP, P: [{ label: 'Plan', value: 'Prescribe sumatriptan 50 mg' }] },
    { ...VALID_SOAP, P: [{ label: 'Plan', value: 'Sent to the duty doctor' }] },
    { ...VALID_SOAP, P: [{ label: 'Plan', value: 'Doctor notified' }] },
  ];
  for (const candidate of bad) expectCode(() => validateSoapSections(candidate), 'INVALID_EVIDENCE');
});

test('SOAP: trusted inputs come only from persisted evidence and the server result', () => {
  const quiet = recordInterview('headache', {});
  const state = serverState('headache', quiet.recorder.streams);
  const routing = deriveRoutingResult(state);
  const bodyRows = [
    { id: 'b1', region_id: 'head', view: 'front', precision: 'general-area', point_x: null, point_y: null, recorded_at: 't1', supersedes_record_id: null },
    { id: 'b2', region_id: 'neck', view: 'front', precision: 'exact-point', point_x: 0.4, point_y: 0.2, recorded_at: 't2', supersedes_record_id: 'b1' },
  ];
  const inputs = trustedSoapInputs({ complaintSource: 'bridge-resolved', state, routing, bodyRows });
  assert.equal(inputs.body?.recordId, 'b2');
  assert.equal(inputs.routing.selectedSpecialtyRegistryId, routing.selectedSpecialtyRegistryId);
  assert.deepEqual(inputs.routingAnswers.map((entry) => entry.questionId), state.session.answers.map((entry) => entry.questionId));
  assert.equal(inputs.safety, 'no_warning_sign_triggered');
  assert.equal(activeBodySelection([]), null);
  expectCode(() => activeBodySelection([bodyRows[0], { ...bodyRows[1], supersedes_record_id: null }]), 'INVALID_EVIDENCE');
  expectCode(() => trustedSoapInputs({ complaintSource: 'bridge-resolved', state, routing, bodyRows: [{ ...bodyRows[0], region_id: 'spleen' }] }), 'INVALID_EVIDENCE');

  const flagged = recordInterview('headache', { 'safety-headache-sudden-extremely-painful': 'yes' });
  const flaggedState = serverState('headache', flagged.recorder.streams);
  expectCode(() => trustedSoapInputs({ complaintSource: 'bridge-resolved', state: flaggedState, routing, bodyRows }), 'ROUTING_NOT_FINAL');
});

/* --- 7. Static security properties ------------------------------------------------------- */

function filesUnder(dir: string): string[] {
  const absolute = path.join(ROOT, dir);
  if (!fs.existsSync(absolute)) return [];
  return fs.readdirSync(absolute, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? filesUnder(path.join(dir, entry.name)) : [path.join(dir, entry.name)],
  );
}

test('the migration adds no grants to browser roles, no definer functions and no policy changes', () => {
  const migration = source('supabase/migrations/20260917121000_r9g_a_trusted_operations.sql');
  const code = migration.replace(/--.*$/gm, '');
  assert.doesNotMatch(code, /security\s+definer/i);
  assert.doesNotMatch(code, /grant[^;]*\bto\s+(anon|authenticated|public)\b/i);
  assert.doesNotMatch(code, /\b(create|alter|drop)\s+(policy|table)\b/i);
  assert.doesNotMatch(code, /disable\s+row\s+level\s+security/i);
  const functions = [...code.matchAll(/create function (public\.\w+)/g)].map((match) => match[1]);
  assert.equal(functions.length, 5);
  for (const name of functions) {
    assert.match(code, new RegExp(`revoke all on function ${name.replace('.', '\\.')}\\([^;]*\\)\\s*from public, anon, authenticated;`), name);
    assert.match(code, new RegExp(`grant execute on function ${name.replace('.', '\\.')}\\([^;]*\\)\\s*to service_role;`), name);
  }
  assert.equal((code.match(/set search_path = ''/g) ?? []).length, 5);
});

test('privileged credentials stay in the Edge runtime and never reach browser code', () => {
  const browserFiles = [...filesUnder('src'), 'index.html', 'vite.config.ts', '.env.example'].filter((file) => fs.existsSync(path.join(ROOT, file)));
  for (const file of browserFiles) {
    const text = source(file);
    assert.doesNotMatch(text, /SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEYS|functions\/v1\/(assessment-start|safety-evaluate|routing-finalize)/, file);
  }
  const functionFiles = filesUnder('supabase/functions').filter((file) => file.endsWith('.ts') && !file.includes(`${path.sep}tests${path.sep}`));
  const withSecret = functionFiles.filter((file) => /SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEYS/.test(source(file)));
  assert.deepEqual(withSecret.map((file) => file.replace(/\\/g, '/')), ['supabase/functions/_shared/admin-client.ts']);
  for (const file of functionFiles) {
    assert.doesNotMatch(source(file), /console\.(log|info|debug)\([^)]*(key|token|authorization|jwt)/i, file);
  }
});

test('no notification, diagnosis or staff workflow is introduced', () => {
  const code = filesUnder('supabase/functions').filter((file) => file.endsWith('.ts') && !file.includes(`${path.sep}tests${path.sep}`)).map(source).join('\n');
  assert.doesNotMatch(code, /sendgrid|twilio|whatsapp|resend\.com|fcm|web-push|nodemailer/i);
  // R9F owns the staff workflow. The patient operations still know nothing
  // about handoff review, staff profiles or acknowledgement.
  const patientCode = filesUnder('supabase/functions')
    .filter((file) => file.endsWith('.ts')
      && !file.includes(`${path.sep}tests${path.sep}`)
      && !/staff|handoff-(open|acknowledge)/.test(file))
    .map(source).join('\n');
  assert.doesNotMatch(patientCode, /clinical_handoffs|staff_profiles|acknowledged_at|acknowledge\(/i);
  const r9gEntrypoints = ['assessment-start', 'safety-evaluate', 'routing-finalize']
    .map((name) => source(`supabase/functions/${name}/index.ts`)).join('\n');
  assert.doesNotMatch(r9gEntrypoints, /soap-prepare|trusted_.*soap/i);
});
