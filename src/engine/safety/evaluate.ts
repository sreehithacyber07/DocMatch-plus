import type {
  RedFlagRule,
  SafetyAnswer,
  SafetyCondition,
  SafetyCurrentState,
  SafetyEvaluationContext,
  SafetyKnowledgeBase,
  SafetyQuestion,
  SafetySeverity,
} from './types.ts';

type AnswerMap = ReadonlyMap<string, string>;

const SEVERITY_RANK: Readonly<Record<SafetySeverity, number>> = {
  emergency: 0,
  urgent: 1,
};

export function evaluateSafetyCondition(condition: SafetyCondition, answers: AnswerMap): boolean {
  switch (condition.kind) {
    case 'always':
      return true;
    case 'answer_equals':
      return answers.get(condition.questionId) === condition.optionId;
    case 'all':
      return condition.conditions.every((child) => evaluateSafetyCondition(child, answers));
    case 'any':
      return condition.conditions.some((child) => evaluateSafetyCondition(child, answers));
  }
}

export function compareSafetyQuestions(left: SafetyQuestion, right: SafetyQuestion): number {
  return (
    SEVERITY_RANK[left.priority.severity] - SEVERITY_RANK[right.priority.severity] ||
    left.priority.dependencyRank - right.priority.dependencyRank ||
    left.id.localeCompare(right.id)
  );
}

export function compareFiredRules(left: RedFlagRule, right: RedFlagRule): number {
  return (
    SEVERITY_RANK[left.severity] - SEVERITY_RANK[right.severity] ||
    left.priority - right.priority ||
    left.id.localeCompare(right.id)
  );
}

function validateTimestamp(timestamp: string, subject: string): void {
  if (timestamp.trim().length === 0 || !Number.isFinite(Date.parse(timestamp))) {
    throw new TypeError(`${subject} must contain a valid timestamp.`);
  }
}

function cloneSafetyAnswer(answer: Readonly<SafetyAnswer>): SafetyAnswer {
  return { questionId: answer.questionId, optionId: answer.optionId, answeredAt: answer.answeredAt };
}

function routingAnswerMap(context: SafetyEvaluationContext): Map<string, string> {
  const answers = new Map<string, string>();
  for (const answer of context.routingAnswers) {
    if (answers.has(answer.questionId)) throw new TypeError(`Routing answers contain duplicate question ${answer.questionId}.`);
    answers.set(answer.questionId, answer.optionId);
  }
  return answers;
}

export function reconcileSafetyAnswers(
  context: SafetyEvaluationContext,
  knowledge: Readonly<SafetyKnowledgeBase>,
): { retained: SafetyAnswer[]; removed: SafetyAnswer[]; answers: Map<string, string> } {
  const answers = routingAnswerMap(context);
  const suppliedByQuestionId = new Map<string, SafetyAnswer>();
  const ownedById = new Map(
    knowledge.questions
      .filter((question): question is Extract<SafetyQuestion, { kind: 'safety_owned' }> => question.kind === 'safety_owned')
      .map((question) => [question.id, question]),
  );

  for (const supplied of context.safetyAnswers) {
    if (suppliedByQuestionId.has(supplied.questionId)) {
      throw new TypeError(`Safety answers contain duplicate question ${supplied.questionId}.`);
    }
    const question = ownedById.get(supplied.questionId);
    if (!question) throw new TypeError(`Safety answer references unknown or routing-owned question ${supplied.questionId}.`);
    if (!question.options.some((option) => option.id === supplied.optionId)) {
      throw new TypeError(`Safety answer references unknown option ${supplied.optionId} for ${supplied.questionId}.`);
    }
    validateTimestamp(supplied.answeredAt, `Safety answer ${supplied.questionId}`);
    suppliedByQuestionId.set(supplied.questionId, cloneSafetyAnswer(supplied));
  }

  const retained: SafetyAnswer[] = [];
  const retainedIds = new Set<string>();
  const relevantQuestions = knowledge.questions
    .filter((question) => question.kind === 'safety_owned')
    .filter((question) => {
      if (context.enabledSafetyQuestionIds) return context.enabledSafetyQuestionIds.includes(question.id);
      return question.applicableComplaintIds.includes(context.complaintId) || question.applicableComplaintIds.includes('all' as string);
    })
    .toSorted(compareSafetyQuestions);

  for (const question of relevantQuestions) {
    const supplied = suppliedByQuestionId.get(question.id);
    if (!supplied || !evaluateSafetyCondition(question.liveWhen, answers)) continue;
    retained.push(cloneSafetyAnswer(supplied));
    retainedIds.add(supplied.questionId);
    answers.set(supplied.questionId, supplied.optionId);
  }

  const removed = [...suppliedByQuestionId.values()]
    .filter((answer) => !retainedIds.has(answer.questionId))
    .map(cloneSafetyAnswer)
    .toSorted((left, right) => left.questionId.localeCompare(right.questionId));

  return { retained, removed, answers };
}

export function firedSafetyRules(
  context: SafetyEvaluationContext,
  answers: AnswerMap,
  knowledge: Readonly<SafetyKnowledgeBase>,
): RedFlagRule[] {
  return knowledge.rules
    .filter((rule) => {
      if (context.enabledSafetyQuestionIds) {
        // If a rule requires any of the enabled questions, it's applicable
        return rule.requiredQuestionIds.some((id) => context.enabledSafetyQuestionIds!.includes(id));
      }
      return rule.enabled && (rule.applicableComplaintIds.includes(context.complaintId) || rule.applicableComplaintIds.includes('all' as string));
    })
    .filter((rule) => evaluateSafetyCondition(rule.predicate, answers))
    .toSorted(compareFiredRules)
    .map((rule) => ({ ...rule, applicableComplaintIds: [...rule.applicableComplaintIds], requiredQuestionIds: [...rule.requiredQuestionIds], provenanceIds: [...rule.provenanceIds] }));
}

export function evaluateSafetyState(
  context: SafetyEvaluationContext,
  knowledge: Readonly<SafetyKnowledgeBase>,
): SafetyCurrentState {
  const reconciled = reconcileSafetyAnswers(context, knowledge);
  const fired = firedSafetyRules(context, reconciled.answers, knowledge);
  const relevantQuestions = knowledge.questions
    .filter((question) => {
      if (context.enabledSafetyQuestionIds) return context.enabledSafetyQuestionIds.includes(question.id);
      return question.applicableComplaintIds.includes(context.complaintId) || question.applicableComplaintIds.includes('all' as string);
    })
    .filter((question) => evaluateSafetyCondition(question.liveWhen, reconciled.answers))
    .toSorted(compareSafetyQuestions);
  const liveQuestionIds = relevantQuestions.map((question) => question.id);
  const unscreenedQuestionIds = liveQuestionIds.filter((questionId) => !reconciled.answers.has(questionId));

  return {
    firedRuleIds: fired.map((rule) => rule.id),
    liveQuestionIds,
    unscreenedQuestionIds,
    retainedSafetyAnswers: reconciled.retained,
    removedSafetyAnswers: reconciled.removed,
  };
}
