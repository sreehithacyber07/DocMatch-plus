/// <reference types="node" />

import assert from 'node:assert/strict';
import test from 'node:test';
import { ENGINE_VERSION } from '../../config.ts';
import {
  GENERIC_ADULT_COMPLAINT_IDS,
  PEDIATRIC_COMPLAINT_IDS,
  WEIGHTED_DEMONSTRATION_COMPLAINT_IDS,
} from '../../coverage-complaints.ts';
import { SPECIALTY_IDS } from '../../specialties.ts';
import { R2B_DEMONSTRATION_COMPLAINTS } from '../demonstration/complaints.ts';
import { R2B_EVIDENCE_REGISTER } from '../demonstration/evidence-register.ts';
import { R2B_DEMONSTRATION_KNOWLEDGE } from '../demonstration/knowledge.ts';
import {
  DEMONSTRATION_PRIOR_WEIGHT,
  DEMONSTRATION_YES_PROBABILITY,
  demonstrationPrior,
} from '../demonstration/policy.ts';
import { R2B_DEMONSTRATION_QUESTIONS } from '../demonstration/questions.ts';
import { R3_HANDOFF_ITEMS } from '../demonstration/r3-handoff.ts';
import {
  formatDemonstrationRegression,
  R2B_REGRESSION_SCENARIOS,
  runAllDemonstrationRegressions,
} from '../demonstration/regression.ts';
import { DEMONSTRATION_POLICY_SOURCE_ID } from '../demonstration/sources.ts';
import {
  createDemonstrationAuditEnvelope,
  materializeComplaint,
  materializeDemonstrationComplaint,
  materializeProductionComplaint,
} from '../materialize.ts';
import { R2_PRODUCTION_KNOWLEDGE } from '../knowledge.ts';
import {
  validateDemonstrationReadiness,
  validateKnowledgeBase,
  validateProductionReadiness,
} from '../validation.ts';
import { KNOWLEDGE_VERSION, R2A_ARCHITECTURE_VERSION } from '../version.ts';

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

test('R2B demonstration knowledge is structurally valid and demonstration-ready', () => {
  const base = validateKnowledgeBase(R2B_DEMONSTRATION_KNOWLEDGE);
  const readiness = validateDemonstrationReadiness(R2B_DEMONSTRATION_KNOWLEDGE);
  assert.deepEqual(base, { structureValid: true, engineReady: true, errors: [], blockers: [] });
  assert.deepEqual(readiness, base);
  assert.equal(R2B_DEMONSTRATION_KNOWLEDGE.mode, 'demonstration');
});

test('the founder-approved four complaint ids are present and unique', () => {
  const ids = R2B_DEMONSTRATION_COMPLAINTS
    .filter((complaint) => complaint.routingMode !== 'fallback_only')
    .map((complaint) => complaint.id);
  assert.deepEqual(ids, WEIGHTED_DEMONSTRATION_COMPLAINT_IDS);
  assert.equal(new Set(ids).size, 4);
});

test('the four weighted complaints retain six questions and normalized demonstration-only priors', () => {
  const weighted = R2B_DEMONSTRATION_COMPLAINTS.filter((complaint) => complaint.routingMode !== 'fallback_only');
  for (const complaint of weighted) {
    assert.equal(complaint.questionIds.length, 6);
    assert.equal(complaint.prior.status, 'ready');
    assert.equal(complaint.prior.parameterStatus, 'demonstration_only');
    assert.ok(Math.abs(sum(SPECIALTY_IDS.map((id) => complaint.prior.status === 'ready' ? complaint.prior.value[id] : 0)) - 1) < 1e-12);
  }
});

test('coverage-only complaints are explicit, non-directional fallback families', () => {
  const fallback = R2B_DEMONSTRATION_COMPLAINTS.filter((complaint) => complaint.routingMode === 'fallback_only');
  assert.deepEqual(
    fallback.map((complaint) => complaint.id),
    [...GENERIC_ADULT_COMPLAINT_IDS, ...PEDIATRIC_COMPLAINT_IDS],
  );
  assert.equal(new Set(fallback.map((complaint) => complaint.id)).size, fallback.length);
  for (const complaint of fallback) {
    assert.deepEqual(complaint.questionIds, []);
    const prior = complaint.prior;
    assert.equal(prior.status, 'ready');
    if (prior.status !== 'ready') continue;
    const values = SPECIALTY_IDS.map((id) => prior.value[id]);
    assert.ok(values.every((value) => value === values[0]), complaint.id);
    assert.ok(Math.abs(sum(values) - 1) < 1e-12, complaint.id);
  }
});

test('24 question and answer ids are semantic, valid, and unique where required', () => {
  assert.equal(R2B_DEMONSTRATION_QUESTIONS.length, 24);
  assert.equal(new Set(R2B_DEMONSTRATION_QUESTIONS.map((question) => question.id)).size, 24);
  for (const question of R2B_DEMONSTRATION_QUESTIONS) {
    assert.ok(!/^q\d+$/i.test(question.id));
    assert.equal(question.options.length, 2);
    assert.deepEqual(question.options.map((option) => option.id), ['yes', 'no']);
  }
});

test('every demonstration likelihood covers six specialties and forms an answer distribution', () => {
  for (const question of R2B_DEMONSTRATION_QUESTIONS) {
    for (const option of question.options) {
      assert.equal(option.likelihoods.status, 'ready');
      assert.equal(option.likelihoods.parameterStatus, 'demonstration_only');
      assert.deepEqual(Object.keys(option.likelihoods.value).toSorted(), [...SPECIALTY_IDS].toSorted());
      for (const value of Object.values(option.likelihoods.value)) assert.ok(Number.isFinite(value) && value >= 0 && value <= 1);
    }
    for (const specialtyId of SPECIALTY_IDS) {
      assert.ok(
        Math.abs(
          sum(question.options.map((option) => option.likelihoods.status === 'ready' ? option.likelihoods.value[specialtyId] : 0)) - 1,
        ) < 1e-12,
      );
    }
  }
});

test('numerical parameters use only the documented shared policy', () => {
  assert.deepEqual(DEMONSTRATION_YES_PROBABILITY, { strong: 0.72, moderate: 0.62, mild: 0.56, neutral: 0.5 });
  assert.deepEqual(DEMONSTRATION_PRIOR_WEIGHT, { primary: 2, secondary: 1.5, baseline: 1 });
  const allowedLikelihoods = new Set([
    ...Object.values(DEMONSTRATION_YES_PROBABILITY),
    ...Object.values(DEMONSTRATION_YES_PROBABILITY).map((value) => 1 - value),
  ]);
  for (const question of R2B_DEMONSTRATION_QUESTIONS) {
    for (const option of question.options) {
      assert.equal(option.likelihoods.status, 'ready');
      for (const value of Object.values(option.likelihoods.value)) assert.ok(allowedLikelihoods.has(value));
    }
  }
  const prior = demonstrationPrior({ neurology: 'primary' });
  assert.equal(prior.status, 'ready');
  assert.equal(prior.parameterStatus, 'demonstration_only');
});

test('qualitative evidence and demonstration numerical provenance remain distinguishable', () => {
  const sources = new Map(R2B_DEMONSTRATION_KNOWLEDGE.sources.map((source) => [source.id, source]));
  for (const complaint of R2B_DEMONSTRATION_COMPLAINTS.filter((candidate) => candidate.routingMode !== 'fallback_only')) {
    assert.equal(complaint.prior.status, 'ready');
    assert.ok(complaint.prior.provenanceIds.includes(DEMONSTRATION_POLICY_SOURCE_ID));
    assert.ok(complaint.prior.provenanceIds.some((id) => sources.get(id)?.evidenceStatus === 'qualitative_supported'));
  }
  for (const complaint of R2B_DEMONSTRATION_COMPLAINTS.filter((candidate) => candidate.routingMode === 'fallback_only')) {
    assert.equal(complaint.prior.status, 'ready');
    assert.ok(complaint.prior.provenanceIds.includes(DEMONSTRATION_POLICY_SOURCE_ID));
    assert.ok(complaint.prior.provenanceIds.every((id) => sources.get(id)?.evidenceStatus !== 'qualitative_supported'));
  }
  for (const question of R2B_DEMONSTRATION_QUESTIONS) {
    assert.ok(question.provenanceIds.some((id) => sources.get(id)?.evidenceStatus === 'qualitative_supported'));
    for (const option of question.options) {
      assert.equal(option.likelihoods.status, 'ready');
      assert.ok(option.likelihoods.provenanceIds.includes(DEMONSTRATION_POLICY_SOURCE_ID));
      assert.ok(option.likelihoods.provenanceIds.some((id) => sources.get(id)?.evidenceStatus === 'qualitative_supported'));
    }
  }
});

test('evidence register covers every clinical source used by questions and states the Bayesian limitation', () => {
  const register = new Map(R2B_EVIDENCE_REGISTER.map((entry) => [entry.sourceId, entry]));
  for (const question of R2B_DEMONSTRATION_QUESTIONS) {
    for (const sourceId of question.provenanceIds) {
      assert.ok(register.has(sourceId), `Missing evidence register entry for ${sourceId}`);
      assert.match(register.get(sourceId)?.doesNotSupport ?? '', /does not validate the demonstration Bayesian magnitude/);
    }
  }
});

test('production and demonstration materializers enforce the mode boundary', () => {
  assert.equal(validateProductionReadiness(R2B_DEMONSTRATION_KNOWLEDGE).engineReady, false);
  assert.throws(
    () => materializeProductionComplaint(R2B_DEMONSTRATION_KNOWLEDGE, 'headache', []),
    /mode=production/,
  );
  assert.throws(
    () => materializeComplaint(R2B_DEMONSTRATION_KNOWLEDGE, 'headache', []),
    /materializeDemonstrationComplaint/,
  );
  assert.throws(
    () => materializeDemonstrationComplaint(R2_PRODUCTION_KNOWLEDGE, 'upper-abdominal-pain', []),
    /mode=demonstration/,
  );
  assert.equal(materializeDemonstrationComplaint(R2B_DEMONSTRATION_KNOWLEDGE, 'headache', []).questions.length, 6);
});

test('answer-dependent applicability is valid and reachable', () => {
  const conditional = R2B_DEMONSTRATION_QUESTIONS.filter((question) => question.applicability.kind === 'answer_equals');
  assert.deepEqual(
    conditional.map((question) => question.id),
    ['upper-abdominal-pain-sweating', 'upper-abdominal-pain-meal-relation'],
  );
  assert.equal(validateKnowledgeBase(R2B_DEMONSTRATION_KNOWLEDGE).errors.length, 0);
});

test('materialization, question selection, and regression runs are deterministic and non-mutating', () => {
  const before = structuredClone(R2B_DEMONSTRATION_KNOWLEDGE);
  const first = runAllDemonstrationRegressions();
  const second = runAllDemonstrationRegressions();
  assert.deepEqual(first, second);
  assert.deepEqual(R2B_DEMONSTRATION_KNOWLEDGE, before);
  assert.equal(first.length, 4);
  assert.ok(first.every((result) => result.expectationMet));
  assert.ok(first.every((result) => result.steps.length > 0));
});

test('all required scenario answers are selected by R1 information gain', () => {
  const results = runAllDemonstrationRegressions();
  for (const [index, scenario] of R2B_REGRESSION_SCENARIOS.entries()) {
    const actual = new Map(results[index].steps.map((step) => [step.questionId, step.answerId]));
    for (const required of scenario.requiredAnswers) assert.equal(actual.get(required.questionId), required.optionId);
  }
});

test('regression reports and external audit envelopes expose independent versions and status', () => {
  const results = runAllDemonstrationRegressions();
  const report = formatDemonstrationRegression(results[0]);
  const envelope = createDemonstrationAuditEnvelope(R2B_DEMONSTRATION_KNOWLEDGE, 'upper-abdominal-pain');
  assert.match(report, /FOR DEMONSTRATION ONLY — NOT CLINICALLY VALIDATED/);
  assert.equal(envelope.engineVersion, ENGINE_VERSION);
  assert.equal(envelope.knowledgeVersion, KNOWLEDGE_VERSION);
  assert.equal(envelope.parameterizationStatus, 'demonstration_only');
  assert.notEqual(KNOWLEDGE_VERSION, R2A_ARCHITECTURE_VERSION);
});

test('R3 handoff remains a provenance-aware register without emergency behavior', () => {
  const sourceIds = new Set(R2B_DEMONSTRATION_KNOWLEDGE.sources.map((source) => source.id));
  assert.ok(R3_HANDOFF_ITEMS.length > 0);
  for (const item of R3_HANDOFF_ITEMS) {
    assert.ok(item.provenanceIds.length > 0);
    assert.ok(item.provenanceIds.every((id) => sourceIds.has(id)));
    assert.ok(item.reviewReason.length > 0);
  }
});

test('patient-facing strings contain no diagnostic claims', () => {
  const patientText = [
    ...R2B_DEMONSTRATION_COMPLAINTS.map((complaint) => complaint.label),
    ...R2B_DEMONSTRATION_QUESTIONS.flatMap((question) => [question.text, ...question.options.map((option) => option.label)]),
  ].join('\n');
  assert.doesNotMatch(patientText, /you have|likely disease|probability of disease|diagnosis/i);
});
