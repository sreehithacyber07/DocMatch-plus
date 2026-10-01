/**
 * Frontend <-> trusted backend clinical parity, and the tamper suite.
 *
 * FRONTEND  the interview as the patient's screen drives it
 *           (src/features/tests/clinical-walk.ts over the shared loop), read
 *           into the canonical outcome.
 * BACKEND   the persisted evidence only: split into its three streams, shuffled,
 *           replayed by `deriveTrustedClinicalOutcome`; and the full persisted
 *           path, rows -> `trustedEvidenceFromRows` -> `handleClinicalFinalize`
 *           over a fake store that records what would be written.
 *
 * Compared: the canonical semantic outcome (specialty, route type, urgency,
 * hard stop, fallback reason, gate and criteria, sources, supporting evidence
 * identity, calibration). Never wording.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { BODY_DOMAIN } from '../../../src/body/index.ts';
import { concernOptionsFor } from '../../../src/features/body-explorer/clinical-coverage.ts';
import { FACE_HIT_REGIONS } from '../../../src/features/body-explorer/faceHitMap.ts';
import {
  canonicalOutcomeOf,
  ClinicalReplayError,
  replayClinicalEvidence,
  trustedClinicalContext,
  type CanonicalClinicalOutcome,
  type ClinicalContextInput,
  type EvidenceAnswer,
} from '../../../src/features/routing-flow/clinical-replay.ts';
import { INTAKE_QUESTION_IDS, intakeQuestionsFor } from '../../../src/features/routing-flow/intake-questions.ts';
import { SPECIALTY_REGISTRY } from '../../../src/features/routing-flow/specialty-registry.ts';
import { contextFor, walkAssessment, type ContextSpec, type Script, type WalkResult } from '../../../src/features/tests/clinical-walk.ts';
import { BASE_EXPECTED, EDGE_FIXTURES, TRACES } from '../../../src/features/tests/parity-fixtures.ts';
import {
  deriveTrustedClinicalOutcome,
  handleClinicalFinalize,
  trustedEvidenceFromRows,
  trustedHandoff,
  type ClinicalContextRow,
  type ClinicalHardStopArgs,
  type ClinicalRouteRecordArgs,
  type ClinicalStore,
  type TrustedClinicalEvidence,
} from '../_shared/trusted/clinical-outcome.ts';
import {
  SERVER_VERSIONS,
  TRUSTED_ASSESSMENT_CONTRACT_VERSION,
  TrustedError,
  type TrustedErrorCode,
} from '../_shared/trusted/contract.ts';
import type { IntakeAnswerRow, RoutingAnswerRow, SafetyAnswerRow } from '../_shared/trusted/evidence.ts';
import type { AssessmentRow, VerifiedCaller } from '../_shared/trusted/operations.ts';
import { parseAssessmentOperation } from '../_shared/trusted/request.ts';

/* --- Harness ------------------------------------------------------------- */

function contextInput(spec: ContextSpec): ClinicalContextInput {
  return {
    bodyRegionId: spec.region,
    faceSubregionId: spec.face ?? null,
    concernId: spec.concern,
    age: spec.age,
    sexForAssessment: spec.sex ?? 'female',
    reporter: spec.reporter ?? null,
  };
}

/** What the browser persists: every answered question in its stream, and the complaint entry. */
function evidenceFromWalk(walk: WalkResult, spec: ContextSpec): TrustedClinicalEvidence {
  const intake: EvidenceAnswer[] = [{ questionId: INTAKE_QUESTION_IDS.complaintEntry, optionId: spec.concern }];
  const safety: EvidenceAnswer[] = [];
  const routing: EvidenceAnswer[] = [];
  for (const record of walk.run.records) {
    const answer = { questionId: record.questionId, optionId: record.optionId };
    if (record.owner === 'intake') intake.push(answer);
    else if (record.owner === 'safety') safety.push(answer);
    else routing.push(answer);
  }
  return { context: contextInput(spec), intake, safety, routing };
}

let seed = 17;
function shuffle<T>(values: readonly T[]): T[] {
  const copy = [...values];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const swap = seed % (index + 1);
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}

function shuffled(evidence: TrustedClinicalEvidence): TrustedClinicalEvidence {
  return { ...evidence, intake: shuffle(evidence.intake), safety: shuffle(evidence.safety), routing: shuffle(evidence.routing) };
}

let nextId = 0;
const uuid = () => {
  nextId += 1;
  return `00000000-0000-4000-8000-${String(nextId).padStart(12, '0')}`;
};

function rowsFor(answers: readonly EvidenceAnswer[]) {
  return answers.map((answer, index) => ({
    id: uuid(),
    question_id: answer.questionId,
    option_id: answer.optionId,
    operation: 'selected',
    sequence: index + 1,
    answered_at: '2026-09-25T00:00:00.000Z',
    supersedes_record_id: null,
  }));
}

function contextRow(input: ClinicalContextInput): ClinicalContextRow {
  return {
    body_region_id: input.bodyRegionId,
    face_subregion_id: input.faceSubregionId,
    concern_id: input.concernId,
    age_years: input.age,
    sex_for_assessment: input.sexForAssessment,
    reporter: input.reporter,
  };
}

const OWNER = '11111111-1111-4111-8111-111111111111';
const PATIENT: VerifiedCaller = { userId: OWNER, isAnonymous: true };

function assessmentRow(overrides: Partial<AssessmentRow> = {}): AssessmentRow {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    owner_auth_user_id: OWNER,
    contract_version: TRUSTED_ASSESSMENT_CONTRACT_VERSION,
    deployment_mode: 'web/self-service',
    status: 'in_progress',
    complaint_id: 'face-ear-concern',
    complaint_source: 'patient-stated',
    facility_id: null,
    kiosk_device_id: null,
    initiated_by_staff_profile_id: null,
    engine_version: SERVER_VERSIONS.engineVersion,
    knowledge_version: SERVER_VERSIONS.knowledgeVersion,
    safety_version: SERVER_VERSIONS.safetyVersion,
    created_at: '2026-09-25T00:00:00.000Z',
    ...overrides,
  };
}

class FakeClinicalStore implements ClinicalStore {
  routes: ClinicalRouteRecordArgs[] = [];
  hardStops: ClinicalHardStopArgs[] = [];
  private readonly assessment: AssessmentRow;
  private readonly context: ClinicalContextRow | null;
  private readonly evidence: TrustedClinicalEvidence;
  constructor(assessment: AssessmentRow, context: ClinicalContextRow | null, evidence: TrustedClinicalEvidence) {
    this.assessment = assessment;
    this.context = context;
    this.evidence = evidence;
  }
  async loadOwnedAssessment(assessmentId: string, owner: string) {
    return assessmentId === this.assessment.id && owner === this.assessment.owner_auth_user_id ? this.assessment : null;
  }
  async loadClinicalContext() {
    return this.context;
  }
  async loadEvidence() {
    const context = trustedClinicalContext(this.evidence.context);
    const questions = intakeQuestionsFor(context.complaintId, context);
    return {
      intake: rowsFor(this.evidence.intake).map((row) => ({ ...row,
        category: questions.find((question) => question.id === row.question_id)?.category ?? 'context',
      })) as IntakeAnswerRow[],
      safety: rowsFor(this.evidence.safety).map((row) => ({ ...row, safety_version: SERVER_VERSIONS.safetyVersion })) as SafetyAnswerRow[],
      routing: rowsFor(this.evidence.routing).map((row) => ({ ...row, knowledge_version: SERVER_VERSIONS.knowledgeVersion })) as RoutingAnswerRow[],
    };
  }
  async finalizeClinicalRoute(args: ClinicalRouteRecordArgs) {
    this.routes.push(args);
    return { ok: true as const, outcome: 'applied' as const, status: 'routing_complete', recordId: uuid() };
  }
  async recordClinicalHardStop(args: ClinicalHardStopArgs) {
    this.hardStops.push(args);
    return { ok: true as const, outcome: 'applied' as const, status: 'priority_escalated', recordId: uuid() };
  }
}

const REQUEST = { assessmentId: '22222222-2222-4222-8222-222222222222', clientEventId: '33333333-3333-4333-8333-333333333333' };

function trustedCode(action: () => unknown): TrustedErrorCode | 'none' {
  try {
    action();
    return 'none';
  } catch (error) {
    if (error instanceof TrustedError) return error.code;
    throw error;
  }
}

async function asyncCode(action: () => Promise<unknown>): Promise<TrustedErrorCode | 'none'> {
  try {
    await action();
    return 'none';
  } catch (error) {
    if (error instanceof TrustedError) return error.code;
    throw error;
  }
}

interface ParityCase {
  id: string;
  spec: ContextSpec;
  script: Script;
}

/** Runs one case through every parity path and returns both canonical outcomes. */
async function parity(entry: ParityCase) {
  const walk = walkAssessment(contextFor(entry.spec), entry.script);
  const frontend = canonicalOutcomeOf(walk.run);
  const evidence = evidenceFromWalk(walk, entry.spec);

  // Backend 1: the evidence in any order.
  const orders = [evidence, shuffled(evidence), shuffled(evidence)];
  const backend = orders.map((order) => deriveTrustedClinicalOutcome(order).outcome);
  for (const outcome of backend) assert.deepEqual(outcome, frontend, `${entry.id}: backend differs from the frontend`);

  // R1 demonstration values are replayed exactly, not recomputed differently.
  const replay = deriveTrustedClinicalOutcome(shuffled(evidence)).replay;
  assert.deepEqual(replay.run.session.belief, walk.run.session.belief, `${entry.id}: belief differs`);

  // Backend 2: the persisted path, end to end, through the one finalize handler.
  const store = new FakeClinicalStore(assessmentRow({ complaint_id: walk.context.complaintId }), contextRow(evidence.context), evidence);
  const finalized = await handleClinicalFinalize(store, PATIENT, REQUEST);
  assert.deepEqual(finalized.trusted, frontend, `${entry.id}: finalize differs`);
  return { walk, frontend, evidence, finalized, store };
}

/* --- 1. Base fixtures ------------------------------------------------------ */

test('parity: the 32 shared fixtures resolve identically in the browser and on the trusted server', async () => {
  assert.equal(TRACES.length, 32);
  for (const trace of TRACES) {
    let result: Awaited<ReturnType<typeof parity>>;
    try {
      result = await parity(trace);
    } catch (error) {
      throw new Error(`${trace.id}: shared-fixture parity failed`, { cause: error });
    }
    const { walk, frontend, finalized, store } = result;
    const expected = BASE_EXPECTED[trace.id];
    assert.ok(expected, `${trace.id} has no expectation`);
    assert.equal(frontend.status, expected.status, trace.id);
    if (expected.specialtyId) assert.equal(frontend.specialtyId, expected.specialtyId, trace.id);
    if (expected.routeType) assert.equal(frontend.routeType, expected.routeType, trace.id);
    if (expected.fallbackReason) assert.equal(frontend.fallbackReason, expected.fallbackReason, trace.id);
    assert.equal(frontend.urgency, expected.urgency ?? 'none', trace.id);
    if (expected.hardStopRuleId) assert.equal(frontend.hardStopRuleId, expected.hardStopRuleId, trace.id);

    if (frontend.status === 'route') {
      // What the patient sees = what is persisted = what the SOAP names = what the handoff carries.
      const shown = walk.route!;
      assert.equal(store.routes.length, 1, trace.id);
      assert.equal(store.hardStops.length, 0, trace.id);
      const persisted = store.routes[0];
      assert.equal(persisted.specialtyId, shown.registryId, trace.id);
      assert.equal(persisted.routeType, frontend.routeType, trace.id);
      assert.deepEqual([...persisted.urgentRuleIds], [...frontend.urgentRuleIds], trace.id);
      const handoff = trustedHandoff(deriveTrustedClinicalOutcome(evidenceFromWalk(walk, trace.spec)), null);
      assert.equal(handoff.specialtyId, shown.registryId, trace.id);
      assert.equal(handoff.specialtyLabel, shown.label, trace.id);
      const plan = handoff.sections.find((section) => section.key === 'P')!;
      assert.ok(plan.lines.some((line) => line.value.includes(shown.label)), `${trace.id}: SOAP P names another direction`);
      const assessment = handoff.sections.find((section) => section.key === 'A')!;
      assert.ok(!assessment.lines.some((line) => /diagnos(is|ed) (is|of)|probability|\d\s*%/i.test(line.value)), `${trace.id}: SOAP claims a diagnosis or probability`);
      assert.equal(finalized.outcome, 'route', trace.id);
    } else {
      // A hard stop is persisted as a safety event, never as a route, and has no ordinary handoff.
      assert.equal(store.routes.length, 0, trace.id);
      assert.equal(store.hardStops.length, 1, trace.id);
      assert.equal(finalized.outcome, 'hard-stop', trace.id);
      assert.equal(trustedCode(() => trustedHandoff(deriveTrustedClinicalOutcome(evidenceFromWalk(walk, trace.spec)), null)), 'INVALID_STATE');
    }
  }
});

/* --- 2. Edge fixtures ------------------------------------------------------ */

test('parity: the edge fixtures resolve identically and to their expected outcomes', async () => {
  assert.equal(EDGE_FIXTURES.length, 13);
  for (const fixture of EDGE_FIXTURES) {
    const { frontend } = await parity(fixture);
    const expected = fixture.expect;
    assert.equal(frontend.status, expected.status, fixture.id);
    if (expected.specialtyId) assert.equal(frontend.specialtyId, expected.specialtyId, fixture.id);
    if (expected.routeType) assert.equal(frontend.routeType, expected.routeType, fixture.id);
    if (expected.fallbackReason) assert.equal(frontend.fallbackReason, expected.fallbackReason, fixture.id);
    assert.equal(frontend.urgency, expected.urgency ?? 'none', fixture.id);
    if (expected.hardStopRuleId) assert.equal(frontend.hardStopRuleId, expected.hardStopRuleId, fixture.id);
    if (expected.calibration) assert.equal(frontend.calibration, expected.calibration, fixture.id);
  }
});

test('parity: sampled answer paths across every region, face area and population agree', async () => {
  let compared = 0;
  let sample = 3;
  const random = () => {
    sample = (sample * 1103515245 + 12345) & 0x7fffffff;
    return sample / 0x7fffffff;
  };
  for (const region of BODY_DOMAIN.regions) {
    const faces = region.id === 'face' ? FACE_HIT_REGIONS.map((face) => face.id) : [null];
    for (const face of faces) {
      for (const [age, reporter] of [[3, null], [8, null], [15, 'young-person'], [15, 'caregiver'], [40, null]] as const) {
        for (const sex of ['female', 'male'] as const) {
          for (const concern of concernOptionsFor(region.id, face, { age, sexForAssessment: sex })) {
            const spec: ContextSpec = { region: region.id, face, concern: concern.id, age, sex, reporter };
            const walk = walkAssessment(contextFor(spec), {}, 40, (_id, options, kind) =>
              kind === 'safety' ? (random() < 0.03 ? 'yes' : 'no') : options[Math.floor(random() * options.length)]);
            if (walk.outcome === 'guard') continue;
            const frontend = canonicalOutcomeOf(walk.run);
            const backend = deriveTrustedClinicalOutcome(shuffled(evidenceFromWalk(walk, spec))).outcome;
            assert.deepEqual(backend, frontend, `${region.id}/${face ?? '-'}/${concern.id} age ${age} ${sex}`);
            compared += 1;
          }
        }
      }
    }
  }
  assert.ok(compared > 3000, `only ${compared} compared`);
});

/* --- 3. Calibration and evidence metadata --------------------------------- */

test('calibration: weighted routes and calibration gaps say so; gate routes say source-backed prototype', async () => {
  const stomach = await parity(TRACES.find((trace) => trace.id === '13-adult-stomach')!);
  assert.equal(stomach.frontend.calibration, 'SPECIALTY_EVIDENCE_CALIBRATION_REQUIRED');
  assert.equal(stomach.frontend.evidenceBasis, 'demonstration-only');
  assert.equal(stomach.store.routes[0].evidenceBasis, 'demonstration-only');
  const ear = await parity(TRACES.find((trace) => trace.id === '10-adult-ear')!);
  assert.equal(ear.frontend.evidenceBasis, 'source-backed-prototype-pending-clinical-review');
  assert.equal(ear.frontend.calibration, 'not-applicable');
  assert.ok(ear.frontend.gate && ear.frontend.gate.sourceIds.length > 0, 'gate routes carry their sources');
  // Neurology is routable only through the NICE NG127 gate, never from a belief; Cardiology's weighted path stays flagged.
  const neurology = SPECIALTY_REGISTRY.find((record) => record.id === 'neurology')!;
  assert.equal(neurology.routingEnabled, true);
  assert.equal(neurology.weightedRoutingEnabled, false);
  assert.ok(SPECIALTY_REGISTRY.find((record) => record.id === 'cardiology')?.registryStates.includes('NEEDS_CLINICAL_EVIDENCE'));
});

test('parity: Neurology is reached from valid source-backed evidence, identically on both sides, and never from location alone', async () => {
  const spec: ContextSpec = { region: 'left-upper-arm', concern: 'weakness-drooping', age: 55, sex: 'male' };
  // NICE NG127 1.7.5: weakness gradually worsening over weeks or months, described.
  const valid = await parity({
    id: 'neuro-progressive',
    spec,
    script: { 'intake-neurologic-associated-detail': 'function', 'intake-neurologic-course': 'gradual', 'safety-neuro-rapidly-progressive': 'no', 'intake-neurologic-associated-features': 'none' },
  });
  assert.equal(valid.frontend.specialtyId, 'neurology');
  assert.equal(valid.frontend.routeType, 'direction-gate');
  assert.ok(valid.frontend.gate?.criterionIds.includes('neuro-progressive-course'));
  assert.ok(valid.frontend.gate?.sourceIds.includes('coverage-nice-ng127-neurological-referral'));
  // The same location and concern without the progressive course: no Neurology, on either side.
  const stable = await parity({
    id: 'neuro-stable',
    spec,
    script: { 'intake-neurologic-associated-detail': 'function', 'intake-neurologic-course': 'same', 'intake-neurologic-associated-features': 'none' },
  });
  assert.notEqual(stable.frontend.specialtyId, 'neurology');
  assert.equal(stable.frontend.routeType, 'parent-fallback');
  assert.ok(stable.frontend.fallbackReason);
  // Rewriting the course answer to "gradual" without the safety check that answer opens is not a route:
  // the trusted server refuses to finalize rather than accept the claimed Neurology evidence.
  const tampered = { ...stable.evidence, intake: [...stable.evidence.intake.filter((row) => row.questionId !== 'intake-neurologic-course'), { questionId: 'intake-neurologic-course', optionId: 'gradual' }] };
  assert.throws(() => deriveTrustedClinicalOutcome(tampered), /ROUTING_NOT_FINAL/);
});

/* --- 4. Tamper suite ------------------------------------------------------- */

function evidenceFor(spec: ContextSpec, script: Script): TrustedClinicalEvidence {
  return evidenceFromWalk(walkAssessment(contextFor(spec), script), spec);
}

const EAR_GM: ParityCase = { id: 'ear-gm', spec: { region: 'face', face: 'patient-left-ear', concern: 'pain', age: 34 }, script: {} };
const EAR_ENT: ParityCase = {
  id: 'ear-ent',
  spec: { region: 'face', face: 'patient-left-ear', concern: 'pain', age: 34 },
  script: { 'intake-face-ear-persistence': 'recurrent', 'intake-face-ear-associated': 'discharge' },
};

test('tamper A/B: the route comes from evidence; a client-proposed route is not even accepted in the request', () => {
  // The operation takes ids only: a proposed specialty, route, urgency, hard stop or gate is refused outright.
  for (const forged of [
    { specialtyId: 'otorhinolaryngology' },
    { specialtyId: 'general-medicine' },
    { routeType: 'direction-gate' },
    { urgency: 'none' },
    { hardStop: false },
    { gateId: 'ent-ear-otologic' },
    { specialtyId: 'made-up-specialty' },
  ]) {
    assert.equal(trustedCode(() => parseAssessmentOperation({ ...REQUEST, ...forged })), 'INVALID_REQUEST', JSON.stringify(forged));
  }
  // A: evidence supports General Medicine -> General Medicine, whatever the browser showed.
  assert.equal(deriveTrustedClinicalOutcome(evidenceFor(EAR_GM.spec, EAR_GM.script)).outcome.specialtyId, 'general-medicine');
  // B: evidence meets the ENT criteria -> ENT, whatever the browser showed.
  assert.equal(deriveTrustedClinicalOutcome(evidenceFor(EAR_ENT.spec, EAR_ENT.script)).outcome.specialtyId, 'otorhinolaryngology');
});

test('tamper C/D: urgency and hard stops are derived from the safety evidence, never from a flag', async () => {
  const throat: ContextSpec = { region: 'neck', concern: 'throat', age: 10 };
  const urgent = deriveTrustedClinicalOutcome(evidenceFor(throat, { 'safety-throat-urgent': 'yes' })).outcome;
  assert.equal(urgent.urgency, 'urgent');
  assert.equal(urgent.status, 'route', 'urgent continues with a specialty');
  assert.ok(urgent.specialtyId);

  const stopEvidence = evidenceFor(throat, { 'safety-throat-airway': 'yes' });
  const stop = deriveTrustedClinicalOutcome(stopEvidence).outcome;
  assert.equal(stop.status, 'hard-stop');
  assert.equal(stop.specialtyId, null);
  // Extra evidence cannot hide a hard stop: safety wins and the rest is reported, not used.
  const padded = deriveTrustedClinicalOutcome({
    ...stopEvidence,
    // The recurrent-impact question is never reached on this path: the hard stop came first.
    intake: [...stopEvidence.intake, { questionId: INTAKE_QUESTION_IDS.throatImpact, optionId: 'yes' }],
  });
  assert.equal(padded.outcome.status, 'hard-stop');
  assert.deepEqual([...padded.replay.ignoredAfterHardStop], [INTAKE_QUESTION_IDS.throatImpact]);
  // A hard stop is never persisted as a route.
  const store = new FakeClinicalStore(assessmentRow({ complaint_id: 'throat-concern' }), contextRow(stopEvidence.context), stopEvidence);
  const finalized = await handleClinicalFinalize(store, PATIENT, REQUEST);
  assert.equal(finalized.outcome, 'hard-stop');
  assert.equal(store.routes.length, 0);
  assert.equal(store.hardStops[0].selectedRuleId, 'throat-airway-danger');
  assert.ok(store.hardStops[0].evidence.length > 0, 'the safety event keeps its evidence');
  // Omitting a safety answer cannot produce a routine route.
  assert.equal(trustedCode(() => deriveTrustedClinicalOutcome({ ...stopEvidence, safety: [] })), 'ROUTING_NOT_FINAL');
});

test('tamper E/F: physiology and population evidence the interview never asks is refused', () => {
  // E: a male run with pregnancy or reproductive evidence.
  const male: ContextSpec = { region: 'lower-abdomen', concern: 'pain', age: 34, sex: 'male' };
  const maleEvidence = evidenceFor(male, {});
  for (const extra of [
    { questionId: INTAKE_QUESTION_IDS.pregnancyContext, optionId: 'yes' },
    { questionId: INTAKE_QUESTION_IDS.reproductiveDetail, optionId: 'bleeding' },
    { questionId: INTAKE_QUESTION_IDS.reproductiveTiming, optionId: 'between-periods' },
  ]) {
    assert.equal(trustedCode(() => deriveTrustedClinicalOutcome({ ...maleEvidence, intake: [...maleEvidence.intake, extra] })), 'INVALID_EVIDENCE', extra.questionId);
  }
  // A male context cannot claim the reproductive concern at all.
  assert.equal(trustedCode(() => deriveTrustedClinicalOutcome({ ...maleEvidence, context: { ...maleEvidence.context, concernId: 'reproductive-pelvic-change' } })), 'INVALID_EVIDENCE');
  // F: a child submitting the adult-only OBGYN evidence cannot route OBGYN.
  const child: ContextSpec = { region: 'lower-abdomen', concern: 'pain', age: 15, sex: 'female', reporter: 'young-person' };
  const childEvidence = evidenceFor(child, {});
  const obgyn = [
    { questionId: INTAKE_QUESTION_IDS.lowerAssociatedSystem, optionId: 'reproductive' },
    { questionId: INTAKE_QUESTION_IDS.reproductiveDetail, optionId: 'bleeding' },
    { questionId: INTAKE_QUESTION_IDS.reproductiveTiming, optionId: 'between-periods' },
  ];
  assert.equal(trustedCode(() => deriveTrustedClinicalOutcome({
    ...childEvidence,
    intake: [...childEvidence.intake.filter((answer) => answer.questionId !== INTAKE_QUESTION_IDS.lowerAssociatedSystem), ...obgyn],
  })), 'INVALID_EVIDENCE');
  // Unknown or future physiology values are refused, not treated as eligible.
  for (const sex of ['unknown', 'other', '', 'FEMALE']) {
    assert.equal(trustedCode(() => deriveTrustedClinicalOutcome({ ...maleEvidence, context: { ...maleEvidence.context, sexForAssessment: sex } })), 'INVALID_EVIDENCE', sex);
  }
});

test('tamper G/H: unknown questions and unknown options are refused', () => {
  const evidence = evidenceFor(EAR_ENT.spec, EAR_ENT.script);
  assert.equal(trustedCode(() => deriveTrustedClinicalOutcome({ ...evidence, intake: [...evidence.intake, { questionId: 'intake-made-up', optionId: 'yes' }] })), 'INVALID_EVIDENCE');
  const badOption = evidence.intake.map((answer) =>
    answer.questionId === INTAKE_QUESTION_IDS.earPersistence ? { ...answer, optionId: 'forever' } : answer);
  assert.equal(trustedCode(() => deriveTrustedClinicalOutcome({ ...evidence, intake: badOption })), 'INVALID_EVIDENCE');
  // A multi-select that combines "None of these" with a finding.
  const exclusive = evidence.intake.map((answer) =>
    answer.questionId === INTAKE_QUESTION_IDS.earAssociated ? { ...answer, optionId: 'discharge+none' } : answer);
  assert.equal(trustedCode(() => deriveTrustedClinicalOutcome({ ...evidence, intake: exclusive })), 'INVALID_EVIDENCE');
  // An answer filed in another family's stream.
  const misfiled = { ...evidence, intake: [...evidence.intake, { questionId: 'safety-ear-swelling-behind-ear', optionId: 'no' }] };
  assert.equal(trustedCode(() => deriveTrustedClinicalOutcome(misfiled)), 'INVALID_EVIDENCE');
});

test('tamper I/J: fabricated specialty and gate identifiers are refused, and the outcome only names registry services', () => {
  assert.equal(trustedCode(() => parseAssessmentOperation({ ...REQUEST, specialtyId: 'neurosurgery-plus' })), 'INVALID_REQUEST');
  assert.equal(trustedCode(() => parseAssessmentOperation({ ...REQUEST, gateId: 'ent-invented' })), 'INVALID_REQUEST');
  const outcome = deriveTrustedClinicalOutcome(evidenceFor(EAR_ENT.spec, EAR_ENT.script)).outcome;
  assert.ok(SPECIALTY_REGISTRY.some((record) => record.id === outcome.specialtyId && record.routingEnabled));
  assert.ok(outcome.gate!.criterionIds.every((id) => id.startsWith('ent-ear-')), 'criteria are recomputed, not supplied');
});

test('evidence integrity: duplicates, order, context and completeness', () => {
  const evidence = evidenceFor(EAR_ENT.spec, EAR_ENT.script);
  const baseline = deriveTrustedClinicalOutcome(evidence).outcome;
  // The same answer sent twice is one fact.
  const repeated = { ...evidence, intake: [...evidence.intake, evidence.intake[1]] };
  assert.deepEqual(deriveTrustedClinicalOutcome(repeated).outcome, baseline);
  // A multi-select sent in another order is the same answer.
  const reordered = evidence.intake.map((answer) =>
    answer.questionId === INTAKE_QUESTION_IDS.earAssociated && answer.optionId.includes('+')
      ? { ...answer, optionId: answer.optionId.split('+').reverse().join('+') }
      : answer);
  assert.deepEqual(deriveTrustedClinicalOutcome({ ...evidence, intake: reordered }).outcome, baseline);
  // A malformed evidence shape is refused, not a crash.
  assert.equal(trustedCode(() => deriveTrustedClinicalOutcome(reordered as never)), 'INVALID_EVIDENCE');
  // Two different answers to one question are a conflict, never resolved by position.
  const conflicting = { ...evidence, intake: [...evidence.intake, { questionId: INTAKE_QUESTION_IDS.earPersistence, optionId: 'under-three-days' }] };
  assert.equal(trustedCode(() => deriveTrustedClinicalOutcome(conflicting)), 'INVALID_EVIDENCE');
  // The complaint-entry answer must be the stated concern.
  const entry = evidence.intake.map((answer) =>
    answer.questionId === INTAKE_QUESTION_IDS.complaintEntry ? { ...answer, optionId: 'swelling-lump' } : answer);
  assert.equal(trustedCode(() => deriveTrustedClinicalOutcome({ ...evidence, intake: entry })), 'INVALID_EVIDENCE');
  // Order never matters: forty shuffles, one outcome.
  for (let run = 0; run < 40; run += 1) assert.deepEqual(deriveTrustedClinicalOutcome(shuffled(evidence)).outcome, baseline);
  // Missing an answer the interview needs is not final.
  assert.equal(trustedCode(() => deriveTrustedClinicalOutcome({ ...evidence, intake: evidence.intake.slice(0, 2) })), 'ROUTING_NOT_FINAL');
  // Impossible contexts are refused, never coerced.
  const bad: Partial<ClinicalContextInput>[] = [
    { bodyRegionId: 'tail' },
    { faceSubregionId: 'nose', bodyRegionId: 'neck', concernId: 'throat' },
    { faceSubregionId: 'made-up-face' },
    { concernId: 'palpitations' },
    { age: -1 },
    { age: 4.5 },
    { age: 400 },
    { reporter: 'young-person' },
    { reporter: 'robot' },
  ];
  for (const change of bad) {
    assert.equal(trustedCode(() => deriveTrustedClinicalOutcome({ ...evidence, context: { ...evidence.context, ...change } })), 'INVALID_EVIDENCE', JSON.stringify(change));
  }
  // An answer to a question this branch never asks (the short-nose treatment question on a persistent problem).
  const nose: ContextSpec = { region: 'face', face: 'nose', concern: 'nose-change', age: 34 };
  const persistent = evidenceFor(nose, { [INTAKE_QUESTION_IDS.noseDetail]: 'blocked', [INTAKE_QUESTION_IDS.nosePersistence]: 'over-three-months' });
  assert.equal(trustedCode(() => deriveTrustedClinicalOutcome({
    ...persistent,
    intake: [...persistent.intake, { questionId: INTAKE_QUESTION_IDS.noseTreatment, optionId: 'helped' }],
  })), 'INVALID_EVIDENCE');
});

test('replay errors keep their precise cause for audit', () => {
  const evidence = evidenceFor(EAR_ENT.spec, EAR_ENT.script);
  const cause = (answers: EvidenceAnswer[], context = evidence.context) => {
    try {
      replayClinicalEvidence(context, answers);
      return 'none';
    } catch (error) {
      return error instanceof ClinicalReplayError ? error.code : 'other';
    }
  };
  const all = [...evidence.intake, ...evidence.safety, ...evidence.routing];
  assert.equal(cause([...all, { questionId: 'nope', optionId: 'x' }]), 'UNKNOWN_QUESTION');
  assert.equal(cause([...all, { questionId: INTAKE_QUESTION_IDS.pregnancyContext, optionId: 'no' }]), 'NOT_APPLICABLE');
  assert.equal(cause([...all, { questionId: INTAKE_QUESTION_IDS.earPersistence, optionId: 'under-three-days' }]), 'DUPLICATE_CONFLICT');
  assert.equal(cause(all.slice(0, 1)), 'INCOMPLETE');
  assert.equal(cause(all, { ...evidence.context, sexForAssessment: 'unknown' }), 'INVALID_CONTEXT');
});

/* --- 5. Ownership, admission and versions --------------------------------- */

test('finalization keeps the R9 boundaries: patient-only, owner-only, admitted shapes, pinned versions', async () => {
  const evidence = evidenceFor(EAR_ENT.spec, EAR_ENT.script);
  const context = contextRow(evidence.context);
  const store = (overrides: Partial<AssessmentRow> = {}, row: ClinicalContextRow | null = context) =>
    new FakeClinicalStore(assessmentRow(overrides), row, evidence);
  // Staff are not the owner of patient evidence.
  assert.equal(await asyncCode(() => handleClinicalFinalize(store(), { userId: OWNER, isAnonymous: false }, REQUEST)), 'PATIENT_REQUIRED');
  // Another patient's assessment is indistinguishable from a missing one.
  assert.equal(await asyncCode(() => handleClinicalFinalize(store(), { userId: '44444444-4444-4444-8444-444444444444', isAnonymous: true }, REQUEST)), 'ASSESSMENT_NOT_FOUND');
  // Unattended kiosk persistence stays refused.
  assert.equal(await asyncCode(() => handleClinicalFinalize(store({ deployment_mode: 'hospital-kiosk' }), PATIENT, REQUEST)), 'UNSUPPORTED_DEPLOYMENT');
  // Pinned engine, knowledge and safety versions.
  assert.equal(await asyncCode(() => handleClinicalFinalize(store({ safety_version: 'r3-old' }), PATIENT, REQUEST)), 'VERSION_MISMATCH');
  // No refinalization after a result.
  assert.equal(await asyncCode(() => handleClinicalFinalize(store({ status: 'routing_complete' }), PATIENT, REQUEST)), 'INVALID_STATE');
  // No context captured, no clinical outcome.
  assert.equal(await asyncCode(() => handleClinicalFinalize(store({}, null), PATIENT, REQUEST)), 'INVALID_STATE');
  // A staffed-tablet admission is accepted with its facility binding.
  const staffed = store({ deployment_mode: 'staffed-tablet', facility_id: '55555555-5555-4555-8555-555555555555', initiated_by_staff_profile_id: '66666666-6666-4666-8666-666666666666' });
  assert.equal((await handleClinicalFinalize(staffed, PATIENT, REQUEST)).outcome, 'route');
});

test('persisted evidence chains are still verified before anything is derived', () => {
  const evidence = evidenceFor(EAR_ENT.spec, EAR_ENT.script);
  const context = trustedClinicalContext(evidence.context);
  const questions = intakeQuestionsFor(context.complaintId, context);
  const intake = rowsFor(evidence.intake).map((row) => ({ ...row,
    category: questions.find((question) => question.id === row.question_id)?.category ?? 'context',
  })) as IntakeAnswerRow[];
  const base = { context: contextRow(evidence.context), intake, safety: [] as SafetyAnswerRow[], routing: [] as RoutingAnswerRow[] };
  assert.deepEqual(deriveTrustedClinicalOutcome(trustedEvidenceFromRows(base).evidence).outcome, deriveTrustedClinicalOutcome(evidence).outcome);
  const broken = intake.map((row, index) => (index === 1 ? { ...row, supersedes_record_id: intake[0].id } : row));
  assert.equal(trustedCode(() => trustedEvidenceFromRows({ ...base, intake: broken })), 'INVALID_EVIDENCE');
  const staleSafety = [{ ...rowsFor([{ questionId: 'safety-ear-swelling-behind-ear', optionId: 'no' }])[0], safety_version: 'r3-old' }] as SafetyAnswerRow[];
  assert.equal(trustedCode(() => trustedEvidenceFromRows({ ...base, safety: staleSafety })), 'VERSION_MISMATCH');
});

/* --- 6. What the persisted outcome can never carry -------------------------- */

test('the trusted outcome carries identifiers only: no belief values, no wording, no personal data', async () => {
  const { finalized, store } = await parity(TRACES.find((trace) => trace.id === '13-adult-stomach')!);
  const serialized = JSON.stringify([finalized.trusted, store.routes[0]]);
  assert.doesNotMatch(serialized, /0\.\d{3,}/, 'no probability or belief value');
  assert.doesNotMatch(serialized, /name|phone|email|address|dob|aadhaar|birth/i, 'no personal data');
  const keys = Object.keys(store.routes[0]).sort();
  assert.deepEqual(keys, [
    'assessmentId', 'bodyRecordId', 'calibration', 'canonical', 'clientEventId', 'evidenceBasis', 'fallbackReason',
    'gateCriterionIds', 'gateDirectionId', 'highWater', 'ownerAuthUserId', 'routeType', 'sections', 'sourceIds',
    'specialtyId', 'supportingRecords', 'urgentRuleIds',
  ]);
  const outcome: CanonicalClinicalOutcome = finalized.trusted;
  assert.equal(outcome.evidenceBasis, 'demonstration-only');
});

/* --- 7. Known gaps, pinned so they stay visible ------------------------------ */

test('sensitive answer IDs/options are required for exact reproductive replay', () => {
  // The patient approved persisting necessary stable IDs/options. If they are
  // missing, the backend must fail closed rather than choose another route.
  const trace = TRACES.find((entry) => entry.id === '08-adult-reproductive')!;
  const walk = walkAssessment(contextFor(trace.spec), trace.script);
  const evidence = evidenceFromWalk(walk, trace.spec);
  const sensitive = new Set(walk.run.records.filter((record) => record.intake?.sensitive).map((record) => record.questionId));
  assert.ok(sensitive.size > 0);
  assert.deepEqual(deriveTrustedClinicalOutcome(evidence).outcome, canonicalOutcomeOf(walk.run));
  const persisted = { ...evidence, intake: evidence.intake.filter((answer) => !sensitive.has(answer.questionId)) };
  assert.equal(trustedCode(() => deriveTrustedClinicalOutcome(persisted)), 'ROUTING_NOT_FINAL');
});

test('legacy R9G-A derivation cannot read current evidence; deployed entrypoint uses the shared resolver', async () => {
  const fs = await import('node:fs');
  const entry = fs.readFileSync('supabase/functions/routing-finalize/index.ts', 'utf8');
  assert.match(entry, /handleClinicalFinalize/);
  assert.doesNotMatch(entry, /handleRoutingFinalize/);
  // The legacy helper is retained for existing rows, not called by the deployed endpoint.
  const { intakeQuestionById } = await import('../../../src/features/routing-flow/intake-questions.ts');
  const { deriveInterviewState } = await import('../_shared/trusted/derive.ts');
  assert.equal(intakeQuestionById('shortness-of-breath', INTAKE_QUESTION_IDS.complaintEntry) ?? null, null);
  const trace = TRACES.find((entry) => entry.id === '13-adult-stomach')!;
  const walk = walkAssessment(contextFor(trace.spec), trace.script);
  const evidence = evidenceFromWalk(walk, trace.spec);
  const intake = rowsFor(evidence.intake).map((row) => ({
    ...row,
    category: walk.run.records.find((record) => record.questionId === row.question_id)?.intake?.category ?? 'context',
  })) as IntakeAnswerRow[];
  assert.equal(trustedCode(() => deriveInterviewState({
    complaintId: walk.context.complaintId,
    intakeRows: intake,
    safetyRows: rowsFor(evidence.safety).map((row) => ({ ...row, safety_version: SERVER_VERSIONS.safetyVersion })) as SafetyAnswerRow[],
    routingRows: rowsFor(evidence.routing).map((row) => ({ ...row, knowledge_version: SERVER_VERSIONS.knowledgeVersion })) as RoutingAnswerRow[],
  })), 'INVALID_EVIDENCE');
  assert.equal(deriveTrustedClinicalOutcome(evidence).outcome.specialtyId, 'medical-gastroenterology');
});
