/**
 * The history-dimension registry used by the coverage matrix must describe
 * every intake concept, so a new question cannot silently be left out of the
 * "which parts of a history are collected" audit.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { CANONICAL_INTAKE_QUESTIONS } from '../routing-flow/intake-questions.ts';
import { CORE_DIMENSIONS, dimensionsOf, INTAKE_DIMENSIONS } from '../routing-flow/question-dimensions.ts';

test('every canonical intake question declares at least one history dimension', () => {
  const missing = CANONICAL_INTAKE_QUESTIONS.map((question) => question.id).filter((id) => dimensionsOf(id).length === 0);
  assert.deepEqual(missing, []);
});

test('the registry names no question that does not exist', () => {
  const known = new Set<string>(CANONICAL_INTAKE_QUESTIONS.map((question) => question.id));
  assert.deepEqual(Object.keys(INTAKE_DIMENSIONS).filter((id) => !known.has(id)), []);
});

test('R1 evidence dimensions map onto the same vocabulary, and the core list is stable', () => {
  assert.deepEqual(dimensionsOf('joint-musculoskeletal-pain-injury', 'mechanism'), ['injury']);
  assert.deepEqual(dimensionsOf('headache-pulsating', 'character'), ['character']);
  assert.deepEqual([...CORE_DIMENSIONS], ['onset', 'duration', 'severity', 'character', 'associated', 'aggravating', 'function']);
});
