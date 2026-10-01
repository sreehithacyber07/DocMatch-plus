import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveInterviewState, deriveRoutingResult } from '../_shared/trusted/derive.ts';
import { generateTrustedSoap } from '../_shared/trusted/soap-generate.ts';
import { trustedSoapInputs, type BodySelectionRow } from '../_shared/trusted/soap-boundary.ts';
import { handleSoapPrepare, type AssessmentRow, type PrepareSoapArgs, type TrustedStore } from '../_shared/trusted/operations.ts';
import { routingResultAgrees } from '../../../src/features/persistence/trusted-result.ts';
import { SERVER_VERSIONS, TRUSTED_ASSESSMENT_CONTRACT_VERSION, TrustedError } from '../_shared/trusted/contract.ts';
import { answer, currentStep, startInterview } from '../../../src/features/tests/interview-driver.ts';
import { PersistenceRecorder } from './browser-mirror.ts';

const ID = 'aaaaaaaa-1111-4111-8111-111111111111';
const OWNER = 'bbbbbbbb-2222-4222-8222-222222222222';
const KEY = 'cccccccc-3333-4333-8333-333333333333';

function interview(complaintId: string, selected: Record<string, string> = {}) {
  let state = startInterview(complaintId);
  const recorder = new PersistenceRecorder(complaintId);
  recorder.observe(state);
  for (let count = 0; count < 60; count += 1) {
    const step = currentStep(state);
    if (step.kind === 'result' || step.kind === 'interrupted') break;
    state = answer(state, selected[step.question.id] ?? (step.kind === 'intake' ? step.question.options[0].id : 'no'));
    recorder.observe(state);
  }
  return deriveInterviewState({ complaintId, routingRows: recorder.streams.routing,
    safetyRows: recorder.streams.safety, intakeRows: recorder.streams.intake });
}

function root(complaintId: string): AssessmentRow {
  return { id: ID, owner_auth_user_id: OWNER, contract_version: TRUSTED_ASSESSMENT_CONTRACT_VERSION,
    deployment_mode: 'web/self-service', status: 'routing_complete', complaint_id: complaintId,
    complaint_source: 'bridge-resolved', facility_id: null, kiosk_device_id: null,
    initiated_by_staff_profile_id: null, engine_version: SERVER_VERSIONS.engineVersion,
    knowledge_version: SERVER_VERSIONS.knowledgeVersion, safety_version: SERVER_VERSIONS.safetyVersion,
    created_at: '2026-01-01T00:00:00Z' };
}

function body(region_id: string, precision: 'general-area' | 'exact-point' = 'general-area'): BodySelectionRow {
  return { id: KEY, region_id, view: 'front', precision,
    point_x: precision === 'exact-point' ? 0.42 : null,
    point_y: precision === 'exact-point' ? 0.58 : null,
    recorded_at: '2026-01-01T00:00:00Z', supersedes_record_id: null };
}

test('trusted SOAP uses accepted evidence, honest objective context and General Medicine fallback', () => {
  const state = interview('upper-abdominal-pain');
  const routing = deriveRoutingResult(state);
  assert.equal(routing.selectedSpecialtyRegistryId, 'general-medicine');
  const sections = generateTrustedSoap(trustedSoapInputs({ complaintSource: 'bridge-resolved', state, routing,
    bodyRows: [body('upper-abdomen')] }));
  assert.deepEqual(Object.keys(sections), ['S', 'O', 'A', 'P']);
  assert.equal(sections.O.some((line) => line.label === 'Measurements' && line.value.includes('No vital signs')), true);
  assert.equal(sections.O.some((line) => /blood pressure|oxygen saturation/i.test(line.label)), false);
  assert.match(JSON.stringify(sections.A), /routing assessment/i);
  assert.doesNotMatch(JSON.stringify(sections), /diagnosed with|prescribe|sent to doctor|doctor notified/i);
  assert.match(JSON.stringify(sections.P), /General Medicine/);
});

test('trusted SOAP keeps patient-relative laterality and actual exact-point precision', () => {
  const state = interview('joint-musculoskeletal-pain');
  const routing = deriveRoutingResult(state);
  const exact = generateTrustedSoap(trustedSoapInputs({ complaintSource: 'patient-stated', state, routing,
    bodyRows: [body('left-knee', 'exact-point')] }));
  assert.equal(exact.O.find((line) => line.label === 'Side')?.value, 'Your left side');
  assert.equal(exact.O.find((line) => line.label === 'Location precision')?.value, 'Exact point marked');
  const general = generateTrustedSoap(trustedSoapInputs({ complaintSource: 'patient-stated', state, routing,
    bodyRows: [body('right-knee')] }));
  assert.equal(general.O.find((line) => line.label === 'Side')?.value, 'Your right side');
  assert.equal(general.O.find((line) => line.label === 'Location precision')?.value, 'General area');
});

test('server rejects interrupted assessment before generating a normal SOAP note', () => {
  const state = interview('headache', { 'safety-headache-sudden-extremely-painful': 'yes' });
  const result = interview('headache');
  assert.throws(() => trustedSoapInputs({ complaintSource: 'bridge-resolved', state,
    routing: deriveRoutingResult(result), bodyRows: [] }),
  (error: unknown) => error instanceof TrustedError && error.code === 'ROUTING_NOT_FINAL');
});

test('prepared handoff handler checks owner and persisted routing identity before the atomic store call', async () => {
  const state = interview('upper-abdominal-pain');
  const routing = deriveRoutingResult(state);
  const calls: PrepareSoapArgs[] = [];
  const evidence = makeEvidence('upper-abdominal-pain');
  const store: TrustedStore = {
    loadOwnedAssessment: async (id, owner) => id === ID && owner === OWNER ? root(state.complaintId) : null,
    loadEvidence: async () => evidence,
    startAssessment: async () => { throw new Error('not used'); },
    recordSafetyEvent: async () => { throw new Error('not used'); },
    finalizeRouting: async () => { throw new Error('not used'); },
    loadBodySelections: async () => [body('upper-abdomen')],
    loadRoutingResult: async () => ({ id: KEY, selected_specialty_registry_id: routing.selectedSpecialtyRegistryId,
      engine_top_specialty_id: routing.engineTopSpecialtyId, stop_reason: routing.stopReason,
      belief: routing.belief, supportingAnswerIds: routing.supportingAnswerRecordIds }),
    prepareSoap: async (args) => {
      calls.push(args);
      return { ok: true, outcome: 'applied', status: 'handoff_prepared', recordId: KEY };
    },
  };
  const result = await handleSoapPrepare(store, { userId: OWNER, isAnonymous: true }, { assessmentId: ID, clientEventId: KEY });
  assert.equal(result.status, 'handoff_prepared');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].routingResultId, KEY);
  assert.equal(calls[0].sections.O.some((line) => line.label === 'Measurements'), true);
  await assert.rejects(handleSoapPrepare(store, { userId: 'eeeeeeee-1111-4111-8111-111111111111', isAnonymous: true },
    { assessmentId: ID, clientEventId: KEY }), (error: unknown) => error instanceof TrustedError && error.code === 'ASSESSMENT_NOT_FOUND');
  store.loadRoutingResult = async () => ({ id: KEY, selected_specialty_registry_id: 'cardiology',
    engine_top_specialty_id: routing.engineTopSpecialtyId, stop_reason: routing.stopReason,
    belief: routing.belief, supportingAnswerIds: routing.supportingAnswerRecordIds });
  await assert.rejects(handleSoapPrepare(store, { userId: OWNER, isAnonymous: true },
    { assessmentId: ID, clientEventId: KEY }), (error: unknown) => error instanceof TrustedError && error.code === 'INVALID_EVIDENCE');
});

function makeEvidence(complaintId: string) {
  let state = startInterview(complaintId);
  const recorder = new PersistenceRecorder(complaintId);
  recorder.observe(state);
  for (let count = 0; count < 60; count += 1) {
    const step = currentStep(state);
    if (step.kind === 'result' || step.kind === 'interrupted') break;
    state = answer(state, step.kind === 'intake' ? step.question.options[0].id : 'no');
    recorder.observe(state);
  }
  return recorder.streams;
}

test('belief read-back tolerance is narrow and a real mismatch still fails', () => {
  const state = interview('upper-abdominal-pain');
  const expected = deriveRoutingResult(state);
  const stored = { id: KEY, selected_specialty_registry_id: expected.selectedSpecialtyRegistryId,
    engine_top_specialty_id: expected.engineTopSpecialtyId, stop_reason: expected.stopReason,
    belief: { ...expected.belief }, supportingAnswerIds: expected.supportingAnswerRecordIds };
  assert.equal(routingResultAgrees(stored, expected), true);
  stored.belief.cardiology += 5e-16;
  assert.equal(routingResultAgrees(stored, expected), true);
  stored.belief.cardiology += 1e-6;
  assert.equal(routingResultAgrees(stored, expected), false);
});
