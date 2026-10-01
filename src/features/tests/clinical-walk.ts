/**
 * A headless clinical assessment, for tests and trace audits.
 *
 * The interview itself is `runInterview` in routing-flow/clinical-replay.ts:
 * the one loop the trusted server replays evidence through as well. This file
 * only decides the answers (a script, a chooser, or a safe default) and turns
 * the run into a readable trace. It holds no ordering or routing logic of its
 * own, so a trace produced here is the trace a patient would see.
 */
import { BODY_DOMAIN, type BodyRegionId } from '../../body/index.ts';
import {
  concernOptionsFor,
  createRegionAssessmentContext,
  type RegionAssessmentContext,
  type RegionConcernId,
} from '../body-explorer/clinical-coverage.ts';
import type { FaceRegionId } from '../body-explorer/faceHitMap.ts';
import type { PatientContext, SexForAssessment } from '../intake/patient-context.ts';
import type { QuestionVoice, ReporterChoice } from '../intake/question-voice.ts';
import { clinicalPatient, runInterview, type AskedQuestion } from '../routing-flow/clinical-replay.ts';
import { evaluateDirectionGate } from '../routing-flow/direction-gate.ts';
import { intakeQuestionsFor, type IntakeAnswer, type QuestionPurpose } from '../routing-flow/intake-questions.ts';
import type { RouteOutcome } from '../routing-flow/route-outcome.ts';

export function patientFor(age: number, sex: SexForAssessment = 'female', reporter: ReporterChoice | null = null): PatientContext {
  return clinicalPatient(age, sex, reporter);
}

export interface ContextSpec {
  region: BodyRegionId;
  face?: FaceRegionId | null;
  concern: RegionConcernId;
  age: number;
  sex?: SexForAssessment;
  reporter?: ReporterChoice | null;
}

export function contextFor(spec: ContextSpec): RegionAssessmentContext {
  const region = BODY_DOMAIN.regions.find((candidate) => candidate.id === spec.region);
  if (!region) throw new Error(`Unknown region ${spec.region}`);
  const face = spec.face ?? null;
  const sex = spec.sex ?? 'female';
  const concern = concernOptionsFor(spec.region, face, { age: spec.age, sexForAssessment: sex })
    .find((candidate) => candidate.id === spec.concern);
  if (!concern) throw new Error(`${spec.region}/${face ?? '-'} has no concern ${spec.concern}`);
  return createRegionAssessmentContext({
    regionId: spec.region,
    regionLabel: region.label,
    faceSubregionId: face,
    concern,
    patient: patientFor(spec.age, sex, spec.reporter ?? null),
  });
}

export type TraceOwner = 'intake' | 'safety' | 'screened-routing' | 'routing';

export interface TraceStep {
  index: number;
  questionId: string;
  /** Exactly what the patient reads, in the locked voice. */
  text: string;
  type: string;
  classification: QuestionPurpose | 'SAFETY' | 'ROUTING';
  owner: TraceOwner;
  answer: string;
  answerLabel: string;
  /** Gate state after this answer. */
  gateStatus: string;
  openDiscriminators: readonly string[];
  safetyState: 'clear' | 'urgent-recorded' | 'interrupted';
}

export interface WalkResult {
  context: RegionAssessmentContext;
  voice: QuestionVoice;
  steps: readonly TraceStep[];
  outcome: 'result' | 'interrupted' | 'guard';
  interruptedRuleId: string | null;
  urgentRuleIds: readonly string[];
  route: RouteOutcome | null;
  counts: { context: number; discrimination: number; safety: number; routing: number };
  /** The underlying run, for callers that need the canonical outcome. */
  run: ReturnType<typeof runInterview>;
}

export type Script = Readonly<Record<string, string>>;

/** Answers any question the script does not, for sampling many paths. */
export type Chooser = (questionId: string, optionIds: readonly string[], kind: 'intake' | 'safety' | 'routing') => string | undefined;

function kindOf(question: AskedQuestion): 'intake' | 'safety' | 'routing' {
  if (question.owner === 'intake') return 'intake';
  return question.owner === 'safety' ? 'safety' : 'routing';
}

/**
 * Walks an assessment to its end. Answers come from `script` by question id.
 * Otherwise a safety question is answered "no" and an intake question takes
 * its first option, so a path escalates only on purpose.
 */
export function walkAssessment(context: RegionAssessmentContext, script: Script = {}, limit = 40, choose?: Chooser): WalkResult {
  const run = runInterview(context, (question) => {
    const optionIds = question.options.map((option) => option.id);
    const chosen = script[question.id] ?? choose?.(question.id, optionIds, kindOf(question));
    if (chosen !== undefined) return chosen;
    return question.owner !== 'intake' && optionIds.includes('no') ? 'no' : optionIds[0];
  }, limit);

  const voice = context.questionVoice;
  const counts = { context: 0, discrimination: 0, safety: 0, routing: 0 };
  const plan = intakeQuestionsFor(context.complaintId, context);
  let intakeAnswers: IntakeAnswer[] = plan[0] ? [{ questionId: plan[0].id, optionId: context.concernId, answeredAt: '' }] : [];
  const steps: TraceStep[] = run.records.map((record, index) => {
    const step = record.step;
    const options = step.kind === 'intake' || step.kind === 'engine' ? step.question.options : [];
    const label = record.optionId.split('+')
      .map((id) => options.find((option: { id: string }) => option.id === id)?.label ?? id)
      .join(', ');
    let text = '';
    let type = 'yes-no';
    let classification: TraceStep['classification'] = 'ROUTING';
    if (step.kind === 'intake') {
      intakeAnswers = [...intakeAnswers, { questionId: record.questionId, optionId: record.optionId, answeredAt: '' }];
      if (step.question.stage === 'extension') counts.discrimination += 1;
      else counts.context += 1;
      text = step.question.prompt;
      type = step.question.control;
      classification = step.question.purpose ?? 'CONTEXT';
    } else if (step.kind === 'engine') {
      if (step.owner === 'safety') {
        counts.safety += 1;
        classification = 'SAFETY';
      } else {
        counts.routing += 1;
      }
      text = voice === 'caregiver' && step.question.caregiverText ? step.question.caregiverText : step.question.text;
    }
    const gate = evaluateDirectionGate(context, intakeAnswers);
    return {
      index: index + 1,
      questionId: record.questionId,
      text,
      type,
      classification,
      owner: record.owner,
      answer: record.optionId,
      answerLabel: label,
      gateStatus: gate.status === 'supported' ? `supported:${gate.direction?.directionId}` : gate.status,
      openDiscriminators: gate.openDiscriminatorQuestionIds,
      safetyState: record.urgentRuleIds.length ? 'urgent-recorded' : 'clear',
    };
  });
  if (run.status === 'interrupted' && steps.length) steps[steps.length - 1] = { ...steps.at(-1)!, safetyState: 'interrupted' };

  const outcome: WalkResult['outcome'] = run.status === 'result' ? 'result' : run.status === 'interrupted' ? 'interrupted' : 'guard';
  return {
    context,
    voice,
    steps,
    outcome,
    interruptedRuleId: run.status === 'interrupted' && run.controller.status === 'interrupted' ? run.controller.selectedRuleId : null,
    urgentRuleIds: run.urgentRuleIds,
    route: run.route,
    counts,
    run,
  };
}
