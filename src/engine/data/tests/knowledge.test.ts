/// <reference types="node" />

import assert from 'node:assert/strict';
import test from 'node:test';
import { ENGINE_VERSION } from '../../config.ts';
import { selectNextQuestion } from '../../questions.ts';
import type { Belief } from '../../types.ts';
import { R2_EVIDENCE_CLASSIFICATION } from '../evidence.ts';
import { SYNTHETIC_R2_KNOWLEDGE } from '../fixtures/synthetic.ts';
import { R2_PRODUCTION_KNOWLEDGE } from '../knowledge.ts';
import { materializeComplaint } from '../materialize.ts';
import { formatRegressionScenarios, R2_REGRESSION_SCENARIOS } from '../regressions.ts';
import type { KnowledgeBase, KnowledgeValidationReport } from '../types.ts';
import { assertKnowledgeReady, assertKnowledgeStructure, validateKnowledgeBase } from '../validation.ts';
import { KNOWLEDGE_VERSION, R2A_ARCHITECTURE_VERSION } from '../version.ts';

function codes(report: KnowledgeValidationReport): string[] {
  return [...report.errors, ...report.blockers].map((issue) => issue.code);
}

function withComplaint(complaint: KnowledgeBase['complaints'][number]): KnowledgeBase {
  return { ...SYNTHETIC_R2_KNOWLEDGE, complaints: [complaint] };
}

test('production architecture is structurally valid and explicitly blocked', () => {
  const report = validateKnowledgeBase(R2_PRODUCTION_KNOWLEDGE);
  assert.equal(report.structureValid, true);
  assert.equal(report.engineReady, false);
  assert.equal(report.errors.length, 0);
  assert.ok(codes(report).includes('PRIOR_PARAMETERIZATION_REQUIRED'));
  assert.ok(codes(report).includes('LIKELIHOOD_PARAMETERIZATION_REQUIRED'));
  assert.ok(codes(report).includes('CLINICAL_EVIDENCE_PENDING'));
  assertKnowledgeStructure(R2_PRODUCTION_KNOWLEDGE);
});

test('production definitions contain no disguised ready numeric parameters', () => {
  const complaint = R2_PRODUCTION_KNOWLEDGE.complaints[0];
  assert.equal(complaint.prior.status, 'blocked');
  for (const question of R2_PRODUCTION_KNOWLEDGE.questions) {
    for (const option of question.options) assert.equal(option.likelihoods.status, 'blocked');
  }
});

test('synthetic fixture is valid, engine-ready, and explicitly synthetic', () => {
  const report = validateKnowledgeBase(SYNTHETIC_R2_KNOWLEDGE);
  assert.deepEqual(report, { structureValid: true, engineReady: true, errors: [], blockers: [] });
  assert.equal(SYNTHETIC_R2_KNOWLEDGE.mode, 'synthetic');
  assert.ok(SYNTHETIC_R2_KNOWLEDGE.sources.every((source) => source.evidenceStatus === 'synthetic_only'));
  assertKnowledgeReady(SYNTHETIC_R2_KNOWLEDGE);
});

test('validation is deterministic and does not mutate knowledge', () => {
  const before = structuredClone(SYNTHETIC_R2_KNOWLEDGE);
  const first = validateKnowledgeBase(SYNTHETIC_R2_KNOWLEDGE);
  const second = validateKnowledgeBase(SYNTHETIC_R2_KNOWLEDGE);
  assert.deepEqual(first, second);
  assert.deepEqual(SYNTHETIC_R2_KNOWLEDGE, before);
});

test('materialization is deterministic, copies probabilities, and does not mutate knowledge', () => {
  const before = structuredClone(SYNTHETIC_R2_KNOWLEDGE);
  const history = [{ questionId: 'synthetic-r2-entry-signal', optionId: 'pattern-alpha' }];
  const first = materializeComplaint(SYNTHETIC_R2_KNOWLEDGE, 'synthetic-r2-complaint', history);
  const second = materializeComplaint(SYNTHETIC_R2_KNOWLEDGE, 'synthetic-r2-complaint', history);
  assert.deepEqual(first.prior, second.prior);
  const firstSerializable = first.questions.map((question) => ({ id: question.id, text: question.text, options: question.options }));
  const secondSerializable = second.questions.map((question) => ({ id: question.id, text: question.text, options: question.options }));
  assert.deepEqual(firstSerializable, secondSerializable);
  const sourcePrior = SYNTHETIC_R2_KNOWLEDGE.complaints[0].prior;
  assert.equal(sourcePrior.status, 'ready');
  assert.notEqual(first.prior, sourcePrior.value);
  assert.deepEqual(SYNTHETIC_R2_KNOWLEDGE, before);
});

test('answer-aware applicability controls eligibility while R1 selects by information gain', () => {
  const alpha = materializeComplaint(SYNTHETIC_R2_KNOWLEDGE, 'synthetic-r2-complaint', [
    { questionId: 'synthetic-r2-entry-signal', optionId: 'pattern-alpha' },
  ]);
  const beta = materializeComplaint(SYNTHETIC_R2_KNOWLEDGE, 'synthetic-r2-complaint', [
    { questionId: 'synthetic-r2-entry-signal', optionId: 'pattern-beta' },
  ]);
  const asked = ['synthetic-r2-entry-signal'];
  assert.equal(selectNextQuestion(alpha.prior, asked, alpha.questions)?.questionId, 'synthetic-r2-follow-up-signal');
  assert.equal(selectNextQuestion(beta.prior, asked, beta.questions), null);
});

test('blocked production knowledge cannot be materialized', () => {
  assert.throws(
    () => materializeComplaint(R2_PRODUCTION_KNOWLEDGE, 'upper-abdominal-pain', []),
    /CLINICAL_EVIDENCE_PENDING|PRIOR_PARAMETERIZATION_REQUIRED/,
  );
});

test('duplicate complaint and question ids are rejected', () => {
  const duplicateComplaint: KnowledgeBase = {
    ...SYNTHETIC_R2_KNOWLEDGE,
    complaints: [SYNTHETIC_R2_KNOWLEDGE.complaints[0], SYNTHETIC_R2_KNOWLEDGE.complaints[0]],
  };
  const duplicateQuestion: KnowledgeBase = {
    ...SYNTHETIC_R2_KNOWLEDGE,
    questions: [SYNTHETIC_R2_KNOWLEDGE.questions[0], SYNTHETIC_R2_KNOWLEDGE.questions[0]],
  };
  const question = SYNTHETIC_R2_KNOWLEDGE.questions[0];
  const duplicateOption: KnowledgeBase = {
    ...SYNTHETIC_R2_KNOWLEDGE,
    questions: [{ ...question, options: [question.options[0], question.options[0]] }, SYNTHETIC_R2_KNOWLEDGE.questions[1]],
  };
  assert.ok(codes(validateKnowledgeBase(duplicateComplaint)).includes('DUPLICATE_COMPLAINT_ID'));
  assert.ok(codes(validateKnowledgeBase(duplicateQuestion)).includes('DUPLICATE_QUESTION_ID'));
  assert.ok(codes(validateKnowledgeBase(duplicateOption)).includes('DUPLICATE_OPTION_ID'));
});

test('invalid complaint question references are rejected', () => {
  const complaint = { ...SYNTHETIC_R2_KNOWLEDGE.complaints[0], questionIds: ['missing-question'] };
  assert.ok(codes(validateKnowledgeBase(withComplaint(complaint))).includes('UNKNOWN_QUESTION_REFERENCE'));
});

test('invalid applicability question and answer references are rejected', () => {
  const followUp = SYNTHETIC_R2_KNOWLEDGE.questions[1];
  const missingQuestion: KnowledgeBase = {
    ...SYNTHETIC_R2_KNOWLEDGE,
    questions: [
      SYNTHETIC_R2_KNOWLEDGE.questions[0],
      { ...followUp, applicability: { kind: 'answer_equals', questionId: 'missing-question', optionId: 'pattern-alpha' } },
    ],
  };
  const missingOption: KnowledgeBase = {
    ...SYNTHETIC_R2_KNOWLEDGE,
    questions: [
      SYNTHETIC_R2_KNOWLEDGE.questions[0],
      { ...followUp, applicability: { kind: 'answer_equals', questionId: 'synthetic-r2-entry-signal', optionId: 'missing-option' } },
    ],
  };
  assert.ok(codes(validateKnowledgeBase(missingQuestion)).includes('UNKNOWN_APPLICABILITY_QUESTION'));
  assert.ok(codes(validateKnowledgeBase(missingOption)).includes('UNKNOWN_APPLICABILITY_OPTION'));
});

test('complaints without questions and unreachable cycles are rejected', () => {
  const noQuestions = { ...SYNTHETIC_R2_KNOWLEDGE.complaints[0], questionIds: [] };
  assert.ok(codes(validateKnowledgeBase(withComplaint(noQuestions))).includes('COMPLAINT_WITHOUT_QUESTIONS'));

  const entry = SYNTHETIC_R2_KNOWLEDGE.questions[0];
  const cyclic: KnowledgeBase = {
    ...SYNTHETIC_R2_KNOWLEDGE,
    questions: [
      {
        ...entry,
        applicability: {
          kind: 'answer_equals',
          questionId: 'synthetic-r2-follow-up-signal',
          optionId: 'follow-up-alpha',
        },
      },
      SYNTHETIC_R2_KNOWLEDGE.questions[1],
    ],
  };
  assert.ok(codes(validateKnowledgeBase(cyclic)).includes('UNREACHABLE_QUESTION'));
});

test('malformed priors and incomplete specialty mappings are rejected', () => {
  const complaint = SYNTHETIC_R2_KNOWLEDGE.complaints[0];
  assert.equal(complaint.prior.status, 'ready');
  const badPrior = {
    ...complaint,
    prior: { ...complaint.prior, value: { ...complaint.prior.value, cardiology: 0.5 } },
  };
  assert.ok(codes(validateKnowledgeBase(withComplaint(badPrior))).includes('INVALID_PRIOR'));
  const incompletePrior = { ...complaint.prior.value } as Partial<Belief>;
  delete incompletePrior.dermatology;
  const missingPriorSpecialty = {
    ...complaint,
    prior: { ...complaint.prior, value: incompletePrior as Belief },
  };
  assert.ok(codes(validateKnowledgeBase(withComplaint(missingPriorSpecialty))).includes('INVALID_PRIOR'));

  const question = SYNTHETIC_R2_KNOWLEDGE.questions[0];
  const firstOption = question.options[0];
  assert.equal(firstOption.likelihoods.status, 'ready');
  const incomplete = { ...firstOption.likelihoods.value } as Partial<Belief>;
  delete incomplete.dermatology;
  const badQuestion = {
    ...question,
    options: [
      { ...firstOption, likelihoods: { ...firstOption.likelihoods, value: incomplete as Belief } },
      question.options[1],
    ],
  };
  const knowledge = { ...SYNTHETIC_R2_KNOWLEDGE, questions: [badQuestion, SYNTHETIC_R2_KNOWLEDGE.questions[1]] };
  assert.ok(codes(validateKnowledgeBase(knowledge)).includes('INVALID_LIKELIHOODS'));
});

test('invalid likelihood ranges and option distributions are rejected', () => {
  const question = SYNTHETIC_R2_KNOWLEDGE.questions[0];
  const firstOption = question.options[0];
  assert.equal(firstOption.likelihoods.status, 'ready');
  const invalidRange = {
    ...question,
    options: [
      {
        ...firstOption,
        likelihoods: { ...firstOption.likelihoods, value: { ...firstOption.likelihoods.value, cardiology: 1.2 } },
      },
      question.options[1],
    ],
  };
  assert.ok(
    codes(validateKnowledgeBase({ ...SYNTHETIC_R2_KNOWLEDGE, questions: [invalidRange, SYNTHETIC_R2_KNOWLEDGE.questions[1]] })).includes(
      'INVALID_LIKELIHOODS',
    ),
  );

  const invalidDistribution = {
    ...question,
    options: [
      {
        ...firstOption,
        likelihoods: { ...firstOption.likelihoods, value: { ...firstOption.likelihoods.value, cardiology: 0.6 } },
      },
      question.options[1],
    ],
  };
  assert.ok(
    codes(
      validateKnowledgeBase({
        ...SYNTHETIC_R2_KNOWLEDGE,
        questions: [invalidDistribution, SYNTHETIC_R2_KNOWLEDGE.questions[1]],
      }),
    ).includes('INVALID_ANSWER_DISTRIBUTION'),
  );
});

test('missing provenance and unsupported production numeric sources are rejected', () => {
  const question = { ...SYNTHETIC_R2_KNOWLEDGE.questions[0], provenanceIds: [] };
  assert.ok(
    codes(
      validateKnowledgeBase({ ...SYNTHETIC_R2_KNOWLEDGE, questions: [question, SYNTHETIC_R2_KNOWLEDGE.questions[1]] }),
    ).includes('MISSING_PROVENANCE'),
  );
  const disguisedProduction: KnowledgeBase = { ...SYNTHETIC_R2_KNOWLEDGE, mode: 'production' };
  const disguisedCodes = codes(validateKnowledgeBase(disguisedProduction));
  assert.ok(disguisedCodes.includes('SYNTHETIC_SOURCE_IN_PRODUCTION'));
  assert.ok(disguisedCodes.includes('UNSUPPORTED_NUMERIC_PARAMETER'));
});

test('empty labels and missing knowledge versions are rejected', () => {
  const emptyLabel = { ...SYNTHETIC_R2_KNOWLEDGE.complaints[0], label: ' ' };
  assert.ok(codes(validateKnowledgeBase(withComplaint(emptyLabel))).includes('EMPTY_COMPLAINT_LABEL'));
  const missingVersion: KnowledgeBase = { ...SYNTHETIC_R2_KNOWLEDGE, knowledgeVersion: '' };
  assert.ok(codes(validateKnowledgeBase(missingVersion)).includes('MISSING_KNOWLEDGE_VERSION'));
});

test('engine and knowledge versions are explicit and independent', () => {
  assert.equal(R2_PRODUCTION_KNOWLEDGE.compatibleEngineVersion, ENGINE_VERSION);
  assert.equal(R2_PRODUCTION_KNOWLEDGE.knowledgeVersion, R2A_ARCHITECTURE_VERSION);
  assert.notEqual(ENGINE_VERSION, R2A_ARCHITECTURE_VERSION);
  assert.notEqual(KNOWLEDGE_VERSION, R2A_ARCHITECTURE_VERSION);
});

test('evidence requirements are explicitly classified across categories A through E', () => {
  assert.deepEqual(
    [...new Set(R2_EVIDENCE_CLASSIFICATION.map((item) => item.category))].toSorted(),
    ['A', 'B', 'C', 'D', 'E'],
  );
  assert.ok(R2_EVIDENCE_CLASSIFICATION.every((item) => item.id.length > 0 && item.disposition.length > 0));
});

test('four regression scaffolds are deterministic and disclose every block', () => {
  assert.equal(R2_REGRESSION_SCENARIOS.length, 4);
  const first = formatRegressionScenarios();
  const second = formatRegressionScenarios();
  assert.equal(first, second);
  assert.match(first, /upper-abdominal-pain-cardiology-direction/);
  assert.match(first, /upper-abdominal-pain-gastroenterology-direction/);
  assert.match(first, /informationGain=BLOCKED/);
  assert.match(first, /no engine result was fabricated/);
});
