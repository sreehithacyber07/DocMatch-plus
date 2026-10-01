/// <reference types="node" />

import { entropy } from './entropy.ts';
import {
  SYNTHETIC_COMPLAINT_ID,
  SYNTHETIC_ENGINE_CONFIG,
  SYNTHETIC_INITIAL_BELIEF,
  SYNTHETIC_QUESTION_BANK,
} from './fixtures/synthetic.ts';
import { selectNextQuestion } from './questions.ts';
import { SPECIALTY_IDS } from './specialties.ts';
import { shouldStop } from './stopping.ts';
import type { Belief } from './types.ts';
import { updateBelief } from './belief.ts';

const DEFAULT_SYNTHETIC_ANSWERS = ['signal-north', 'texture-a', 'tempo-steady'];

function formattedBelief(belief: Belief): Record<string, number> {
  return Object.fromEntries(SPECIALTY_IDS.map((specialtyId) => [specialtyId, Number(belief[specialtyId].toFixed(6))]));
}

function formatNumber(value: number): number {
  return Number(value.toFixed(6));
}

export function runSyntheticSimulation(complaintId: string, answerIds: readonly string[]): void {
  let belief = { ...SYNTHETIC_INITIAL_BELIEF };
  const askedQuestionIds: string[] = [];

  console.log('SYNTHETIC ROUTING ENGINE DEMONSTRATION');
  console.log(`complaint=${complaintId}`);
  console.log(`start belief=${JSON.stringify(formattedBelief(belief))}`);
  console.log(`start entropy=${formatNumber(entropy(belief))}`);

  for (const [index, answerId] of answerIds.entries()) {
    const selection = selectNextQuestion(
      belief,
      askedQuestionIds,
      SYNTHETIC_QUESTION_BANK,
      SYNTHETIC_ENGINE_CONFIG.posteriorFloor,
    );
    if (!selection) throw new Error(`No eligible synthetic question exists at answer position ${index + 1}.`);
    const option = selection.question.options.find((candidate) => candidate.id === answerId);
    if (!option) throw new Error(`Synthetic answer ${answerId} does not belong to selected question ${selection.questionId}.`);

    console.log(`step=${index + 1}`);
    console.log(`selected question=${selection.questionId}`);
    console.log(`information gain=${formatNumber(selection.informationGain)}`);
    console.log(`chosen answer=${option.id}`);
    belief = updateBelief(belief, option, SYNTHETIC_ENGINE_CONFIG.posteriorFloor);
    askedQuestionIds.push(selection.questionId);
    console.log(`updated belief=${JSON.stringify(formattedBelief(belief))}`);
    console.log(`entropy=${formatNumber(entropy(belief))}`);
    const stopping = shouldStop(belief, askedQuestionIds.length, SYNTHETIC_ENGINE_CONFIG);
    console.log(`stop=${stopping.shouldStop} reason=${stopping.reason ?? 'none'}`);
  }
}

const [, , complaintId = SYNTHETIC_COMPLAINT_ID, ...answerIds] = process.argv;
runSyntheticSimulation(complaintId, answerIds.length > 0 ? answerIds : DEFAULT_SYNTHETIC_ANSWERS);
