import { NORMALIZATION_TOLERANCE } from './config.ts';
import { SPECIALTY_IDS } from './specialties.ts';
import type { AnswerOption, Question, ReadonlyBelief } from './types.ts';

function assertIdentifier(value: string, subject: string): void {
  if (value.trim().length === 0) throw new TypeError(`${subject} must be a non-empty string.`);
}

export function validateProbability(value: number, subject: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError(`${subject} must be a finite probability from 0 to 1.`);
  }
}

export function validateBelief(belief: ReadonlyBelief): void {
  const keys = Object.keys(belief);
  const unexpected = keys.filter((key) => !SPECIALTY_IDS.includes(key as (typeof SPECIALTY_IDS)[number]));
  if (unexpected.length > 0) throw new TypeError(`Belief contains unknown specialty ids: ${unexpected.join(', ')}.`);

  let total = 0;
  for (const specialtyId of SPECIALTY_IDS) {
    if (!Object.hasOwn(belief, specialtyId)) throw new TypeError(`Belief is missing specialty likelihood: ${specialtyId}.`);
    const probability = belief[specialtyId];
    validateProbability(probability, `Belief probability for ${specialtyId}`);
    total += probability;
  }

  if (!Number.isFinite(total) || Math.abs(total - 1) > NORMALIZATION_TOLERANCE) {
    throw new RangeError(`Belief must normalize to 1; received ${total}.`);
  }
}

export function validateAnswerOption(option: Readonly<AnswerOption>): void {
  assertIdentifier(option.id, 'Answer option id');
  assertIdentifier(option.label, `Answer option label for ${option.id}`);

  const keys = Object.keys(option.likelihoods);
  const unexpected = keys.filter((key) => !SPECIALTY_IDS.includes(key as (typeof SPECIALTY_IDS)[number]));
  if (unexpected.length > 0) throw new TypeError(`Answer option ${option.id} contains unknown specialty ids: ${unexpected.join(', ')}.`);

  for (const specialtyId of SPECIALTY_IDS) {
    if (!Object.hasOwn(option.likelihoods, specialtyId)) {
      throw new TypeError(`Answer option ${option.id} is missing likelihood for ${specialtyId}.`);
    }
    validateProbability(option.likelihoods[specialtyId], `Likelihood for ${option.id}/${specialtyId}`);
  }
}

export function validateQuestion(question: Readonly<Question>): void {
  assertIdentifier(question.id, 'Question id');
  assertIdentifier(question.text, `Question text for ${question.id}`);
  if (question.options.length < 2) throw new RangeError(`Question ${question.id} must have at least two answer options.`);

  const optionIds = new Set<string>();
  for (const option of question.options) {
    validateAnswerOption(option);
    if (optionIds.has(option.id)) throw new TypeError(`Question ${question.id} contains duplicate option id ${option.id}.`);
    optionIds.add(option.id);
  }

  for (const specialtyId of SPECIALTY_IDS) {
    const total = question.options.reduce((sum, option) => sum + option.likelihoods[specialtyId], 0);
    if (!Number.isFinite(total) || Math.abs(total - 1) > NORMALIZATION_TOLERANCE) {
      throw new RangeError(`Question ${question.id} option likelihoods for ${specialtyId} must sum to 1; received ${total}.`);
    }
  }
}

export function validateQuestionBank(questionBank: readonly Question[]): void {
  const questionIds = new Set<string>();
  for (const question of questionBank) {
    validateQuestion(question);
    if (questionIds.has(question.id)) throw new TypeError(`Question bank contains duplicate question id ${question.id}.`);
    questionIds.add(question.id);
  }
}
