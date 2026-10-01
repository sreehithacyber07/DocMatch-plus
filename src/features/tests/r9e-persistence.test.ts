import assert from 'node:assert/strict';
import test from 'node:test';
import { createAssessmentPersistence, type LocalRoutingResult } from '../persistence/assessment-persistence.ts';
import type { PersistenceGateway, TrustedOperation } from '../persistence/gateway.ts';
import type { EvidenceInsert } from '../persistence/records.ts';
import { answer, controllerFor, currentStep, startInterview, type DriverState } from './interview-driver.ts';
import { hasPresentableRoute } from '../routing-flow/handoff-presentation.ts';
import { GENERAL_MEDICINE, specialtyForEngineId } from '../routing-flow/specialty-registry.ts';

const OWNER = 'aaaaaaaa-1111-4111-8111-111111111111';
const ASSESSMENT = 'bbbbbbbb-2222-4222-8222-222222222222';
const RESULT = 'cccccccc-3333-4333-8333-333333333333';

function ids() {
  let next = 0;
  return () => `dddddddd-4444-4444-8444-${String(++next).padStart(12, '0')}`;
}

function localResult(state: DriverState): LocalRoutingResult {
  const controller = controllerFor(state);
  if (controller.status !== 'result') throw new Error('not a result');
  const top = controller.routingOutcome.specialtyId;
  return {
    engineTopSpecialtyId: top,
    selectedSpecialtyRegistryId: hasPresentableRoute(controller.stoppingDecision, top)
      ? specialtyForEngineId(top).id : GENERAL_MEDICINE.id,
    stopReason: controller.routingOutcome.stopReason,
    belief: { ...state.session.belief },
    answers: state.session.answers.map(({ questionId, optionId }) => ({ questionId, optionId })),
  };
}

function harness(options: { mismatch?: boolean; staleOnce?: boolean; safetyError?: boolean } = {}) {
  const nextId = ids();
  const rows: Array<{ id: string; event: EvidenceInsert }> = [];
  const calls: Array<{ operation: TrustedOperation | 'assessment' | 'evidence'; key?: string }> = [];
  let route: LocalRoutingResult | null = null;
  let routeCalls = 0;
  const gateway: PersistenceGateway = {
    signInAnonymously: async () => ({ ok: true, value: { userId: OWNER } }),
    findOwnAssessment: async () => ({ ok: true, value: null }),
    insertAssessment: async () => { calls.push({ operation: 'assessment' }); return { ok: true, value: ASSESSMENT }; },
    insertEvidence: async (event) => {
      const id = nextId();
      rows.push({ id, event });
      calls.push({ operation: 'evidence' });
      return { ok: true, value: id };
    },
    findEvidenceByClientEvent: async () => ({ ok: true, value: null }),
    invokeTrusted: async (operation, body) => {
      calls.push({ operation, key: body.clientEventId });
      if (operation === 'routing-finalize') {
        routeCalls += 1;
        if (options.staleOnce && routeCalls === 1) {
          return { ok: false, error: { kind: 'rejected', code: 'STALE_EVIDENCE', status: 409 } };
        }
        return { ok: true, value: { outcome: 'applied', status: 'routing_complete', routingResultId: RESULT } };
      }
      if (operation === 'safety-evaluate') {
        if (options.safetyError) return { ok: false, error: { kind: 'transient', code: 'network', status: 0 } };
        return { ok: true, value: { outcome: 'applied', status: 'priority_escalated', safetyEventId: RESULT } };
      }
      if (operation === 'soap-prepare') return { ok: true, value: { outcome: 'applied', status: 'handoff_prepared', soapHandoffId: RESULT } };
      return { ok: true, value: { outcome: 'applied', status: 'in_progress' } };
    },
    readEvidenceIds: async () => ({ ok: true, value: {
      intake: rows.filter((entry) => entry.event.table === 'intake_answers').map((entry) => entry.id),
      routing: rows.filter((entry) => entry.event.table === 'routing_answers').map((entry) => entry.id),
      safety: rows.filter((entry) => entry.event.table === 'safety_answers').map((entry) => entry.id),
    } }),
    readRoutingResult: async () => {
      if (!route) throw new Error('route missing');
      const support = route.answers.map((answer) => rows.findLast((entry) =>
        entry.event.table === 'routing_answers' && entry.event.row.question_id === answer.questionId)?.id ?? 'missing');
      return { ok: true, value: {
        id: RESULT,
        selected_specialty_registry_id: options.mismatch ? 'cardiology' : route.selectedSpecialtyRegistryId,
        engine_top_specialty_id: route.engineTopSpecialtyId,
        stop_reason: route.stopReason,
        belief: route.belief,
        supportingAnswerIds: support,
      } };
    },
    close: async () => undefined,
  };
  const persistence = createAssessmentPersistence({ createGateway: () => gateway,
    trustedOperations: true, newId: nextId, retryDelaysMs: [], sleep: async () => undefined });
  function observe(state: DriverState) {
    persistence.observeAnswers('intake', state.intakeAnswers);
    persistence.observeAnswers('routing', state.session.answers);
    persistence.observeAnswers('safety', state.safetyAnswers);
  }
  function begin(complaintId: string) {
    persistence.begin({ complaintId, complaintSource: 'bridge-resolved', location: null });
  }
  function finish(complaintId: string, selected: Record<string, string> = {}) {
    begin(complaintId);
    let state = startInterview(complaintId);
    observe(state);
    for (let count = 0; count < 60; count += 1) {
      const step = currentStep(state);
      if (step.kind === 'result' || step.kind === 'interrupted') break;
      state = answer(state, selected[step.question.id] ?? (step.kind === 'intake' ? step.question.options[0].id : 'no'));
      observe(state);
    }
    if (currentStep(state).kind === 'result') {
      route = localResult(state);
      persistence.requestRoutingFinalization(route);
    } else persistence.requestSafetyEvaluation();
    return state;
  }
  return { persistence, calls, rows, finish };
}

test('trusted start precedes evidence and normal route produces a prepared SOAP operation', async () => {
  const h = harness();
  const state = h.finish('upper-abdominal-pain');
  assert.equal(currentStep(state).kind, 'result');
  await h.persistence.whenIdle();
  const operations = h.calls.map((call) => call.operation);
  assert.deepEqual(operations.slice(0, 2), ['assessment', 'assessment-start']);
  assert.ok(operations.lastIndexOf('evidence') < operations.indexOf('routing-finalize'));
  assert.deepEqual(operations.slice(-2), ['routing-finalize', 'soap-prepare']);
  assert.equal(h.persistence.getSnapshot().state, 'saved');
});

test('priority evaluation follows persisted answers and failure never changes local R3', async () => {
  const h = harness({ safetyError: true });
  const state = h.finish('headache', { 'safety-headache-sudden-extremely-painful': 'yes' });
  assert.equal(currentStep(state).kind, 'interrupted');
  await h.persistence.whenIdle();
  const operations = h.calls.map((call) => call.operation);
  assert.ok(operations.lastIndexOf('evidence') < operations.indexOf('safety-evaluate'));
  assert.equal(operations.includes('routing-finalize'), false);
  assert.equal(operations.includes('soap-prepare'), false);
  assert.equal(h.persistence.getSnapshot().state, 'failed');
  assert.equal(currentStep(state).kind, 'interrupted');
});

test('STALE_EVIDENCE reconciles accepted IDs and retries the same logical key once', async () => {
  const h = harness({ staleOnce: true });
  h.finish('upper-abdominal-pain');
  await h.persistence.whenIdle();
  const routeCalls = h.calls.filter((call) => call.operation === 'routing-finalize');
  assert.equal(routeCalls.length, 2);
  assert.equal(routeCalls[0].key, routeCalls[1].key);
  assert.equal(h.persistence.getSnapshot().state, 'saved');
});

test('trusted/local mismatch blocks SOAP instead of silently replacing the result', async () => {
  const h = harness({ mismatch: true });
  h.finish('upper-abdominal-pain');
  await h.persistence.whenIdle();
  assert.equal(h.calls.some((call) => call.operation === 'soap-prepare'), false);
  assert.equal(h.persistence.getSnapshot().state, 'failed');
});
