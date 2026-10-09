import { cloneBelief } from '../belief.ts';
import type { AnswerOption, Question } from '../types.ts';
import type { AnswerSnapshot, KnowledgeBase, MaterializedComplaint, RoutingAuditEnvelope } from './types.ts';
import { assertKnowledgeReady } from './validation.ts';

function materializeComplaintInternal(
  knowledge: KnowledgeBase,
  complaintId: string,
  answerHistory: readonly AnswerSnapshot[],
): MaterializedComplaint {
  assertKnowledgeReady(knowledge);
  const complaint = knowledge.complaints.find((candidate) => candidate.id === complaintId);
  if (!complaint) throw new TypeError(`Unknown complaint ${complaintId}.`);
  if (complaint.prior.status !== 'ready') throw new TypeError(`Complaint ${complaintId} prior is not parameterized.`);

  const answerSnapshot = new Map(answerHistory.map((answer) => [answer.questionId, answer.optionId]));
  const questionsById = new Map(knowledge.questions.map((question) => [question.id, question]));
  const questions: Question[] = complaint.questionIds.map((questionId) => {
    const definition = questionsById.get(questionId);
    if (!definition) throw new TypeError(`Unknown question ${questionId}.`);
    const options: AnswerOption[] = definition.options.map((option) => {
      if (option.likelihoods.status !== 'ready') throw new TypeError(`Question ${questionId} is not parameterized.`);
      return {
        id: option.id,
        label: option.label,
        value: option.value,
        likelihoods: cloneBelief(option.likelihoods.value),
      };
    });

    return {
      id: definition.id,
      text: definition.text,
      options,
      ...(definition.evidenceDimension ? { evidenceDimension: definition.evidenceDimension } : {}),
      appliesWhen: (_belief, askedQuestionIds) => {
        if (definition.applicability.kind === 'always') return true;
        return (
          askedQuestionIds.includes(definition.applicability.questionId) &&
          answerSnapshot.get(definition.applicability.questionId) === definition.applicability.optionId
        );
      },
    };
  });

  return {
    complaintId: complaint.id,
    label: complaint.label,
    prior: cloneBelief(complaint.prior.value),
    questions,
    knowledgeVersion: knowledge.knowledgeVersion,
    compatibleEngineVersion: knowledge.compatibleEngineVersion,
    provenanceIds: [...complaint.provenanceIds],
  };
}

export function materializeComplaint(
  knowledge: KnowledgeBase,
  complaintId: string,
  answerHistory: readonly AnswerSnapshot[],
): MaterializedComplaint {
  if (knowledge.mode === 'demonstration') {
    throw new TypeError('Demonstration knowledge requires materializeDemonstrationComplaint().');
  }
  return materializeComplaintInternal(knowledge, complaintId, answerHistory);
}

export function materializeProductionComplaint(
  knowledge: KnowledgeBase,
  complaintId: string,
  answerHistory: readonly AnswerSnapshot[],
): MaterializedComplaint {
  if (knowledge.mode !== 'production') throw new TypeError('Production materialization requires mode=production.');
  return materializeComplaintInternal(knowledge, complaintId, answerHistory);
}

export function materializeDemonstrationComplaint(
  knowledge: KnowledgeBase,
  complaintId: string,
  answerHistory: readonly AnswerSnapshot[],
): MaterializedComplaint {
  if (knowledge.mode !== 'demonstration') throw new TypeError('Demonstration materialization requires mode=demonstration.');
  return materializeComplaintInternal(knowledge, complaintId, answerHistory);
}

export function createDemonstrationAuditEnvelope(
  knowledge: KnowledgeBase,
  complaintId: string,
): RoutingAuditEnvelope {
  if (knowledge.mode !== 'demonstration') throw new TypeError('A demonstration audit envelope requires mode=demonstration.');
  assertKnowledgeReady(knowledge);
  if (!knowledge.complaints.some((complaint) => complaint.id === complaintId)) {
    throw new TypeError(`Unknown complaint ${complaintId}.`);
  }
  return {
    engineVersion: knowledge.compatibleEngineVersion,
    knowledgeVersion: knowledge.knowledgeVersion,
    parameterizationStatus: 'demonstration_only',
    evidenceStatus: 'source_supported_qualitative_relationships',
    complaintId,
    provenanceIds: knowledge.sources.map((source) => source.id),
  };
}
