import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  answerSessionQuestion,
  createRoutingSession,
  replayBelief,
  type BeliefHistoryEntry,
  type ReadonlyBelief,
  type RoutingSession,
} from '../../engine/index.ts';
import {
  DEMONSTRATION_ENGINE_CONFIG,
  materializeDemonstrationComplaint,
  R2B_DEMONSTRATION_KNOWLEDGE,
} from '../../engine/data/index.ts';
import {
  evaluateSafetyController,
  R3_SAFETY_KNOWLEDGE,
  recordSafetyAnswer,
  reconcileSafetyAnswers,
  type ResolvedSafetyQuestion,
  type SafetyAnswer,
} from '../../engine/safety/index.ts';
import { Pictogram } from '../../components/pictograms';
import { JourneyRail } from '../../components/layout';
import type { ComplaintSource } from '../body-explorer/unmapped-regions.ts';
import { isGenericCoverageComplaint, type RegionAssessmentContext } from '../body-explorer/clinical-coverage.ts';
import { QuestionMotif } from './QuestionMotif.tsx';
import { motifForQuestion, type MotifKind } from './question-motif-kind.ts';
import { AnswerControl, IntakeAnswerControl } from './AnswerControls.tsx';
import type { BodyVariantId } from '../body-explorer/artwork/hitmap-geometry.ts';
import {
  INTAKE_QUESTION_IDS,
  intakeOptionLabel,
  intakeQuestionsFor,
  type IntakeAnswer,
  type IntakeQuestion,
} from './intake-questions.ts';
import {
  acceptsSubmission,
  nextInterviewStep,
  PHASE_GROUPS,
  PHASE_LABEL,
  type InterviewPhase,
  type InterviewStep,
} from './interview-plan.ts';
import type { BodyCapture } from './soap-handoff.ts';
import type { TimelineEntry } from './SessionTimeline.tsx';
import { PriorityEscalation } from './PriorityEscalation.tsx';
import { RoutingResult } from './RoutingResult.tsx';
import { safetyQuestionIdsForClinicalContext } from './contextual-safety.ts';
import type { PatientContext } from '../intake/patient-context.ts';
import { byVoice, type QuestionVoice } from '../intake/question-voice.ts';
import { InterviewIntelligenceRail } from './RouteIntelligence.tsx';
import { resolveRouteOutcome } from './route-outcome.ts';
import { eligibleRouteDirections } from './route-eligibility.ts';
import { DEPLOYMENT_MODE, DEPLOYMENT_PROFILE } from '../trust/runtime-config.ts';
import type { AssessmentPersistence } from '../persistence/assessment-persistence.ts';
import { usePersistenceSnapshot } from '../persistence/usePatientPersistence.ts';
import { referralPriorityNotes } from './referral-priority.ts';
import './routing-flow.css';

/**
 * What each red-flag rule found, in the patient's terms.
 *
 * These are restatements of the rule that fired, not new clinical claims: the
 * rule, its predicate and its sources all live in R3.
 */
const SAFETY_INDICATOR_LABEL: Readonly<Record<string, string>> = {
  'upper-abdominal-exertional-associated-warning': 'Activity-related discomfort with an associated warning sign',
  'breathing-severe-inability-to-speak': 'Severe breathing difficulty',
  'breathing-pale-blue-grey-skin': 'Very pale, blue, or grey skin or lips',
  'breathing-sudden-confusion': 'Sudden confusion with breathing difficulty',
  'breathing-coughing-blood': 'Coughing up blood',
  'headache-sudden-extremely-painful': 'Sudden, extremely painful headache',
  'headache-new-one-sided-weakness': 'New one-sided weakness or numbness',
  'headache-speech-memory-vision-change': 'New speech, memory, or vision change',
  'headache-drowsy-confused': 'Unusual drowsiness or confusion',
  'joint-injury-severe-or-displaced': 'Severe injury symptoms or altered joint position',
  'joint-injury-sensation-or-circulation-change': 'Sensation or circulation change after injury',
  'joint-sudden-hot-swollen': 'Sudden hot, swollen, severely painful joint',
  'generic-severe-breathing': 'Severe breathing difficulty',
  'generic-new-neurological-change': 'Sudden weakness, speech or vision change',
  'generic-unresponsive-or-seizure': 'Not responding normally or a seizure',
  'lower-abdominal-severe-or-faint': 'Severe lower abdominal or pelvic pain with collapse symptoms',
  'lower-abdominal-heavy-bleeding': 'Heavy bleeding with lower abdominal or pelvic symptoms',
  'eye-sudden-vision-loss-or-injury': 'Sudden loss of vision or a serious eye injury',
  'chest-persistent-spreading-associated': 'Persistent chest discomfort with an associated warning sign',
  'skin-airway-swelling': 'Sudden mouth or throat swelling affecting breathing or swallowing',
  'neck-meningitis-warning-pattern': 'Fever, neck stiffness and altered awareness',
  'pediatric-struggling-to-breathe': 'Struggling to breathe',
  'pediatric-seizure-or-unresponsive': 'A fit, or very hard to wake or not responding',
  'pediatric-unable-to-drink-or-vomits-everything': 'Not able to drink or feed, or vomiting everything',
  'pediatric-sudden-neurological-change': 'Sudden weakness, speech or vision change',
  'infant-serious-illness-sign': 'A baby who is feeding poorly, floppy, or very hot or cold',
  'pediatric-chest-indrawing-or-stridor': 'Chest pulling in or a harsh noise when breathing in',
  'throat-airway-danger': 'Difficulty breathing or swallowing, drooling or noisy breathing',
  'dental-spreading-swelling': 'Swelling around the eye or in the neck, a lot of swelling in the mouth, or a mouth that will not open',
  'dvt-breathless-or-chest-pain': 'Pain and swelling in one leg, with shortness of breath or chest pain',
  'skin-infection-emergency-features': 'Hot, swollen skin with a high temperature, fast heartbeat or breathing, purple patches, faintness or confusion',
  'pediatric-headache-sudden-or-recent-injury': 'A sudden, extremely painful headache or a recent head injury',
  'pediatric-fever-stiff-neck-or-rash': 'A high temperature with a stiff neck, light sensitivity or a rash that does not fade',
  'pediatric-injury-emergency': 'Very bad pain, a change in shape, or loss of feeling or use after an injury',
  'pediatric-abdominal-emergency': 'Green vomit, vomiting blood or sudden severe tummy pain',
  'pediatric-under-five-swelling-behind-ear': 'A tender swelling behind a young child\'s ear',
  'nosebleed-prolonged-or-excessive': 'A nosebleed that is prolonged, heavy, or followed an injury',
  'rectal-bleeding-heavy': 'Non-stop or heavy bleeding from the bottom',
  // Urgent, continuable findings: shown in the session trail and handoff, never as an interruption.
  'ear-swelling-around-ear-urgent': 'Swelling around the ear',
  'pediatric-fast-breathing': 'Breathing faster than usual',
  'throat-urgent-review': 'A very painful throat, a high temperature or much less urine',
  'pediatric-headache-urgent-features': 'A headache that is worsening, wakes at night or comes with vomiting',
  'injury-worsening-urgent': 'Swelling or bruising that is getting worse',
  'pediatric-dehydration-urgent': 'Signs of dehydration',
  'urinary-unwell-urgent': 'A high temperature, feeling unwell or back pain with a urinary change',
  'rectal-bleeding-urgent': 'Black or dark red poo, or bloody diarrhoea',
  'sinus-urgent-review': 'Very unwell, or symptoms getting worse despite painkillers',
  'palpitations-emergency-features': 'A racing heartbeat that is not settling, or with chest pain, breathlessness or fainting',
  'neuro-rapidly-progressive-weakness': 'Weakness or numbness getting quickly worse, or affecting breathing or swallowing',
  'back-cauda-equina-pattern': 'Back pain with both legs affected, numbness around the genitals or bottom, or bladder or bowel change',
  'upper-abdomen-injury-emergency': 'Worsening breathing or chest pain, coughing blood, shoulder pain, or a serious accident after the injury',
  'face-rash-eye-nose-urgent': 'A facial rash near the eye or nose, or a change in vision',
  // Phase 2 urgent findings (PENDING CLINICAL REVIEW).
  'dvt-suspected-urgent': 'Throbbing pain and swelling in one leg',
  'joint-dvt-suspected-urgent': 'Throbbing pain and swelling in one leg',
  'head-injury-emergency-signs': 'After a head injury: knocked out, a fit, very sleepy, new vision, hearing, walking, speech, numbness or behaviour change',
  'head-injury-emergency-mechanism': 'A head injury from a high fall or high speed, or with fluid or blood from the ears or nose, a dent, or bruising behind the ears',
  'head-injury-urgent': 'Being sick, dizzy, on a blood thinner, or alcohol or drugs at the time of a head injury',
  'nose-injury-emergency': 'A purple swelling inside the nose, or a severe headache with blurred or double vision, after a nose injury',
  'neck-injury-urgent': 'Severe pain, tingling, weakness, an electric-shock feeling or problems walking after a neck injury',
  'joint-dvt-breathless-or-chest-pain': 'Pain and swelling in one leg, with shortness of breath or chest pain',
  'joint-back-urgent-features': 'Back pain with feeling hot, shivery or unwell, or severe pain that is sudden or worsening quickly',
  'hernia-complication-urgent': 'A lump with pain, a bloated tummy, sickness, constipation or a high temperature',
  'temporal-arteritis-urgent': 'Tender temples or scalp, or jaw pain on eating, with headaches or a vision change',
  'back-urgent-features': 'Back pain with feeling hot, shivery or unwell, or severe pain that is sudden or worsening quickly',
  'skin-painful-hot-swollen-urgent': 'Painful, hot and swollen skin',
  'varicose-vein-bleeding-urgent': 'A bleeding vein on the leg',
};

/** What is shown when a question belongs to R3. Wording only. */
function voicedSafetyText(question: ResolvedSafetyQuestion, voice: QuestionVoice): string {
  return voice === 'caregiver' && question.caregiverText ? question.caregiverText : question.text;
}

export interface RoutingFlowProps {
  complaintId: string;
  complaintLabel: string;
  regionSummary: string | null;
  /**
   * Whether the body map resolved this complaint through the frozen bridge or
   * the patient stated it themselves at a region the bridge does not map. The
   * handoff summary says which, because a complaint the product inferred and a
   * complaint the patient declared are different evidence.
   */
  complaintSource?: ComplaintSource;
  /** What the body map captured, for the Objective section of the handoff. */
  capture?: BodyCapture;
  onChangeLocation: () => void;
  onNewPatient: () => void;
  /**
   * R9D persistence for this patient, when the build has it. It only observes
   * committed answers; nothing in the interview waits on it.
   */
  persistence?: AssessmentPersistence | null;
  /**
   * R8.1 patient context, for display on the result only. It is not read by
   * the interview, the safety screen, the routing engine or persistence.
   */
  patientContext?: PatientContext | null;
  /** Patient-stated location and complaint-entry context. Never a specialty shortcut. */
  clinicalContext?: RegionAssessmentContext | null;
  /**
   * The body artwork the patient used on the body map, for the associated
   * location step. Presentation only: never persisted, never read clinically.
   */
  bodyVariant?: BodyVariantId | null;
  /**
   * Presentation only: which surface is showing, so the page environment can
   * set its intensity. It reads the flow's state and never changes it.
   */
  onSurfaceChange?: (surface: RoutingSurface) => void;
  /**
   * The same patient's answers for this complaint, when the flow is remounted
   * (the route screen keeps them in page memory, never browser storage). The
   * flow is rebuilt from the answers alone, so R3 re-evaluates them exactly as
   * before: a priority interruption that was reached is reached again and can
   * never be skipped by leaving and returning.
   */
  snapshot?: RoutingSnapshot;
  /** Receives the answers whenever they change. */
  onSnapshot?: (snapshot: RoutingSnapshot) => void;
}

export type RoutingSurface = 'interview' | 'priority' | 'result';

export interface RoutingSnapshot {
  complaintId: string;
  session: RoutingSession;
  safetyAnswers: readonly SafetyAnswer[];
  intakeAnswers: readonly IntakeAnswer[];
}

export function RoutingFlow({
  complaintId,
  complaintLabel,
  regionSummary,
  complaintSource = 'bridge-resolved',
  capture = { painLocation: null, view: null },
  onChangeLocation,
  onNewPatient,
  persistence = null,
  patientContext = null,
  clinicalContext = null,
  bodyVariant = null,
  onSurfaceChange,
  snapshot,
  onSnapshot,
}: RoutingFlowProps) {
  const restored = snapshot?.complaintId === complaintId ? snapshot : undefined;
  const reduceMotion = Boolean(useReducedMotion());
  // Locked once, before the first question; see intake/question-voice.ts.
  const voice: QuestionVoice = clinicalContext?.questionVoice ?? 'self';
  const engineConfig = useMemo(
    () => isGenericCoverageComplaint(complaintId)
      ? { ...DEMONSTRATION_ENGINE_CONFIG, maxQuestions: 1 }
      : DEMONSTRATION_ENGINE_CONFIG,
    [complaintId],
  );
  const [session, setSession] = useState<RoutingSession>(() =>
    restored?.session ?? createRoutingSession(complaintId, complaintPrior(complaintId), new Date().toISOString()),
  );
  const [safetyAnswers, setSafetyAnswers] = useState<readonly SafetyAnswer[]>(() => restored?.safetyAnswers ?? []);
  const [intakeAnswers, setIntakeAnswers] = useState<readonly IntakeAnswer[]>(() => {
    if (restored) return restored.intakeAnswers;
    if (!clinicalContext) return [];
    const entry = intakeQuestionsFor(complaintId, clinicalContext)[0];
    return entry
      ? [{ questionId: entry.id, optionId: clinicalContext.concernId, answeredAt: new Date().toISOString() }]
      : [];
  });

  // The complaint is re-materialized from current answers so applicability
  // rules resolve against real history rather than a cached snapshot.
  const complaint = useMemo(
    () =>
      materializeDemonstrationComplaint(
        R2B_DEMONSTRATION_KNOWLEDGE,
        complaintId,
        session.answers.map((answer) => ({ questionId: answer.questionId, optionId: answer.optionId })),
      ),
    [complaintId, session.answers],
  );

  const enabledSafetyQuestionIds = useMemo(
    () => safetyQuestionIdsForClinicalContext(clinicalContext, intakeAnswers),
    [clinicalContext, intakeAnswers],
  );

  // R3 owns precedence. Every continuation step goes through this call.
  const controller = useMemo(
    () =>
      evaluateSafetyController({
        session,
        complaint,
        safetyAnswers,
        safetyKnowledge: R3_SAFETY_KNOWLEDGE,
        engineConfig,
        enabledSafetyQuestionIds,
      }),
    [session, complaint, safetyAnswers, engineConfig, enabledSafetyQuestionIds],
  );

  const intakePlan = useMemo(
    () => intakeQuestionsFor(complaintId, clinicalContext),
    [complaintId, clinicalContext],
  );
  // Persist only stable answer IDs/options, including sensitive branches that
  // are necessary for deterministic trusted replay; never persist visible copy.
  const persistableIntakeAnswers = intakeAnswers;

  const replay = useMemo(
    () =>
      replayBelief(
        session.initialBelief,
        session.answers,
        complaint.questions,
        engineConfig.posteriorFloor,
      ),
    [session.initialBelief, session.answers, complaint.questions, engineConfig.posteriorFloor],
  );

  const answerEngineQuestion = useCallback(
    (question: ResolvedSafetyQuestion, optionId: string) => {
      const answeredAt = new Date().toISOString();
      if (question.answerTarget === 'safety_state') {
        setSafetyAnswers((current) =>
          recordSafetyAnswer(current, question, { questionId: question.id, optionId, answeredAt }),
        );
        return;
      }
      setSession((current) => {
        const next = answerSessionQuestion(
          current,
          { questionId: question.id, optionId, answeredAt },
          complaint.questions,
          engineConfig.posteriorFloor,
        );
        // A routing answer can invalidate a safety answer that depended on it.
        // Reconciliation drops those rather than leaving them live.
        setSafetyAnswers((currentSafety) =>
          reconcileSafetyAnswers(
            { complaintId, routingAnswers: next.answers, safetyAnswers: currentSafety },
            R3_SAFETY_KNOWLEDGE,
          ).retained,
        );
        return next;
      });
    },
    [complaint.questions, complaintId, engineConfig.posteriorFloor],
  );

  const answerIntakeQuestion = useCallback((question: IntakeQuestion, optionId: string) => {
    setIntakeAnswers((current) => [
      ...current.filter((answer) => answer.questionId !== question.id),
      { questionId: question.id, optionId, answeredAt: new Date().toISOString() },
    ]);
  }, []);

  const removeAnswer = useCallback(
    (questionId: string) => {
      if (questionId.startsWith('intake-')) {
        setIntakeAnswers((current) => current.filter((answer) => answer.questionId !== questionId));
        return;
      }
      setSession((current) => {
        const answers = current.answers.filter((answer) => answer.questionId !== questionId);
        const rebuilt = createRoutingSession(complaintId, current.initialBelief, current.createdAt);
        const next = answers.reduce(
          (accumulated, answer) =>
            answerSessionQuestion(accumulated, answer, complaint.questions, engineConfig.posteriorFloor),
          rebuilt,
        );
        setSafetyAnswers((currentSafety) =>
          reconcileSafetyAnswers(
            { complaintId, routingAnswers: next.answers, safetyAnswers: currentSafety },
            R3_SAFETY_KNOWLEDGE,
          ).retained,
        );
        return next;
      });
    },
    [complaint.questions, complaintId, engineConfig.posteriorFloor],
  );

  /* --- Timeline ----------------------------------------------------------- */

  const timeline: TimelineEntry[] = useMemo(() => {
    const routing: TimelineEntry[] = session.answers.map((answer) => {
      const question = complaint.questions.find((candidate) => candidate.id === answer.questionId);
      const option = question?.options.find((candidate) => candidate.id === answer.optionId);
      return {
        kind: 'routing',
        questionId: answer.questionId,
        text: question?.text ?? answer.questionId,
        label: option?.label ?? answer.optionId,
        answeredAt: answer.answeredAt,
        changeable: true,
      };
    });

    const safety: TimelineEntry[] = safetyAnswers.map((answer) => {
      const question = R3_SAFETY_KNOWLEDGE.questions.find(
        (candidate) => candidate.kind === 'safety_owned' && candidate.id === answer.questionId,
      );
      const option =
        question?.kind === 'safety_owned'
          ? question.options.find((candidate) => candidate.id === answer.optionId)
          : null;
      return {
        kind: 'safety',
        questionId: answer.questionId,
        text: question?.kind === 'safety_owned'
          ? (voice === 'caregiver' && question.caregiverText ? question.caregiverText : question.text)
          : answer.questionId,
        label: option?.label ?? answer.optionId,
        answeredAt: answer.answeredAt,
        changeable: false,
      };
    });

    const intake: TimelineEntry[] = intakeAnswers.map((answer) => {
      const question = intakePlan.find((candidate) => candidate.id === answer.questionId);
      return {
        kind: 'intake',
        questionId: answer.questionId,
        text: question?.eyebrow ?? answer.questionId,
        label: question ? intakeOptionLabel(question, answer.optionId) : answer.optionId,
        answeredAt: answer.answeredAt,
        changeable: true,
      };
    });

    return [...routing, ...safety, ...intake].toSorted((left, right) =>
      left.answeredAt.localeCompare(right.answeredAt),
    );
  }, [session.answers, safetyAnswers, intakeAnswers, complaint.questions, intakePlan, voice]);

  /* --- What to ask next ---------------------------------------------------- */

  /*
    The order lives in interview-plan.ts, shared with the QA harness and the
    tests: description first, bounded; the R3 screen next, pulled forward by any
    acuity answer; then associated features and differentiating questions. A
    satisfied red-flag rule interrupts at every point.
  */
  // R1 answers, read by the direction gate as answers only, so a sourced criterion is never asked twice.
  const routingAnswers = session.answers.map(({ questionId, optionId }) => ({ questionId, optionId }));
  // Engine state is not a route: the debug rail shows only services plausible for this presentation.
  const presentableRegistryIds = useMemo(() => {
    const eligibility = eligibleRouteDirections(clinicalContext, complaintId);
    return [eligibility.parentServiceId, ...eligibility.narrowerServiceIds];
  }, [clinicalContext, complaintId]);
  const step: InterviewStep = nextInterviewStep({ complaintId, controller, intakeAnswers, clinicalContext, routingAnswers });
  const activeQuestionId = step.kind === 'intake' || step.kind === 'engine' ? step.question.id : null;

  // Terminal states replace the interview. Reset both possible scroll owners so
  // phones and fixed-height kiosks always enter on the result or priority title.
  useEffect(() => {
    if (step.kind !== 'result' && step.kind !== 'interrupted') return;
    window.scrollTo({ top: 0, behavior: 'auto' });
    document.querySelector<HTMLElement>('.assessment-shell__main')?.scrollTo({ top: 0, behavior: 'auto' });
  }, [step.kind]);

  /*
    R9D persistence, strictly after the fact.

    These effects run after React has committed the answer, so R3 has already
    evaluated it above and any priority interruption is already rendered.
    observeAnswers only enqueues; it never blocks, throws or feeds back into
    routing or safety state. Each stream is written to its own table.
  */
  useEffect(() => {
    onSnapshot?.({ complaintId, session, safetyAnswers, intakeAnswers });
  }, [onSnapshot, complaintId, session, safetyAnswers, intakeAnswers]);

  useEffect(() => {
    persistence?.observeAnswers('intake', persistableIntakeAnswers);
  }, [persistence, persistableIntakeAnswers]);
  useEffect(() => {
    persistence?.observeAnswers('routing', session.answers);
  }, [persistence, session.answers]);
  useEffect(() => {
    persistence?.observeAnswers('safety', safetyAnswers);
  }, [persistence, safetyAnswers]);
  // Read-only: once any record of this assessment has failed to save (after
  // the bounded retries), the stored assessment is incomplete for good, even
  // if later writes succeed, so the notice stays. It never affects what the
  // interview, safety screen or result show.
  const saveFailed = usePersistenceSnapshot(persistence).failed > 0;

  // This runs after the three observers above and after the local result or
  // priority surface has committed. Trusted calls never decide what is shown.
  useEffect(() => {
    if (!persistence) return;
    if (step.kind === 'interrupted' && controller.status === 'interrupted') {
      persistence.requestSafetyEvaluation();
      return;
    }
    if (step.kind !== 'result' || controller.status !== 'result') return;
    const top = controller.routingOutcome.specialtyId;
    /*
      The persisted direction must be the one the screen prints, including a
      direction the source-backed gate established. Recomputing it here from
      the belief alone would file a different answer than the patient was
      shown, which is exactly the engine/UI divergence resolveRouteOutcome
      exists to prevent.
    */
    const outcome = resolveRouteOutcome({
      clinicalContext,
      complaintId,
      intakeAnswers,
      stoppingDecision: controller.stoppingDecision,
      engineSpecialtyId: top,
      safetyAnswerCount: safetyAnswers.length,
      routingAnswerCount: session.answers.length,
      routingAnswers: session.answers,
    });
    persistence.requestRoutingFinalization({
      engineTopSpecialtyId: top,
      selectedSpecialtyRegistryId: outcome.registryId,
      stopReason: controller.routingOutcome.stopReason,
      belief: { ...session.belief },
      answers: session.answers.map(({ questionId, optionId }) => ({ questionId, optionId })),
    });
  }, [persistence, step.kind, controller, session.answers, session.belief, clinicalContext, complaintId, intakeAnswers, safetyAnswers.length]);

  /*
    Submission guard.

    The outgoing question stays mounted while it animates out, and its buttons
    keep their original handlers. Answers overwrite in place, so a second tap
    landing on the exiting block used to CHANGE the answer just given, including
    turning a safety "No" into "Yes". Every submission is now checked against the
    question actually on screen, and anything else is dropped.
  */
  const activeQuestionRef = useRef<string | null>(activeQuestionId);
  useEffect(() => {
    activeQuestionRef.current = activeQuestionId;
  }, [activeQuestionId]);

  const submitEngine = useCallback(
    (question: ResolvedSafetyQuestion, optionId: string) => {
      if (!acceptsSubmission(activeQuestionRef.current, question.id)) return;
      activeQuestionRef.current = null;
      answerEngineQuestion(question, optionId);
    },
    [answerEngineQuestion],
  );

  const submitIntake = useCallback(
    (question: IntakeQuestion, optionId: string) => {
      if (!acceptsSubmission(activeQuestionRef.current, question.id)) return;
      activeQuestionRef.current = null;
      answerIntakeQuestion(question, optionId);
    },
    [answerIntakeQuestion],
  );

  const answeredPhases = useMemo(() => {
    const phases = new Set<InterviewPhase>();
    for (const answer of intakeAnswers) {
      const question = intakePlan.find((candidate) => candidate.id === answer.questionId);
      if (!question) continue;
      if (question.category === 'character') phases.add('describe');
      else if (question.category === 'intensity') phases.add('measure');
      else if (question.category === 'duration') phases.add('timeline');
      else phases.add('pattern');
    }
    if (session.answers.length > 0) phases.add('refine');
    return phases;
  }, [intakeAnswers, intakePlan, session.answers.length]);

  const surface: RoutingSurface =
    step.kind === 'interrupted' && controller.status === 'interrupted'
      ? 'priority'
      : step.kind === 'result' && controller.status === 'result'
        ? 'result'
        : 'interview';
  useEffect(() => {
    onSurfaceChange?.(surface);
  }, [surface, onSurfaceChange]);

  if (step.kind === 'interrupted' && controller.status === 'interrupted') {
    return (
      <AssessmentShell activeIndex={2} stageLabel="Priority response" critical saveFailed={saveFailed} onNewPatient={onNewPatient}>
        <PriorityEscalation
          severity={controller.severity}
          mustStop={controller.continuationPolicy === 'must_stop'}
          actionLabel={controller.payload.primaryAction.label}
          secondaryLabel={controller.payload.secondaryAction?.label}
          headline={controller.payload.headline}
          guidance={controller.payload.guidance}
          deploymentMode={DEPLOYMENT_MODE}
          indicator={SAFETY_INDICATOR_LABEL[controller.selectedRuleId] ?? 'Warning sign detected'}
          complaintLabel={complaintLabel}
          regionSummary={regionSummary}
          timeline={timeline}
          reduceMotion={reduceMotion}
          onNewPatient={onNewPatient}
        />
      </AssessmentShell>
    );
  }

  if (step.kind === 'result' && controller.status === 'result') {
    const trustedResultIsImmutable = persistence !== null && persistence.getSnapshot().state !== 'disabled';
    return (
      <AssessmentShell activeIndex={3} stageLabel="Care direction" saveFailed={saveFailed} onNewPatient={onNewPatient}>
        <RoutingResult
          specialtyId={controller.routingOutcome.specialtyId}
          stoppingDecision={controller.stoppingDecision}
          belief={session.belief}
          history={replay.history}
          timeline={timeline}
          intakePlan={intakePlan}
          intakeAnswers={intakeAnswers}
          complaintLabel={complaintLabel}
          regionSummary={regionSummary}
          complaintSource={complaintSource}
          capture={capture}
          reduceMotion={reduceMotion}
          onChange={trustedResultIsImmutable ? undefined : removeAnswer}
          onNewPatient={onNewPatient}
          onChangeLocation={trustedResultIsImmutable ? undefined : onChangeLocation}
          lockedForTrustedHandoff={trustedResultIsImmutable}
          patientContext={patientContext}
          referralNotes={referralPriorityNotes(clinicalContext, intakeAnswers)}
          routeOutcome={resolveRouteOutcome({
            clinicalContext,
            complaintId,
            intakeAnswers,
            stoppingDecision: controller.stoppingDecision,
            engineSpecialtyId: controller.routingOutcome.specialtyId,
            safetyAnswerCount: safetyAnswers.length,
            routingAnswerCount: session.answers.length,
            routingAnswers: session.answers,
          })}
          urgentReview={controller.urgentReview}
        />
      </AssessmentShell>
    );
  }

  if (step.kind !== 'intake' && step.kind !== 'engine') return null;

  /*
    Only a question R3 owns carries the safety register. R3-screened routing
    questions (exertion, injury) are ordinary clinical questions whose answers
    R3 also reads, so they keep their clinical label and the cyan register.
  */
  const safetyRegister = step.kind === 'engine' && step.owner === 'safety';
  const motif = motifForQuestion(
    safetyRegister ? 'safety' : step.kind === 'intake' ? 'intake' : 'routing',
    step.kind === 'intake' ? step.question.category : undefined,
    step.kind === 'intake' ? step.question.control : undefined,
  );

  /*
    A safety question carries a small, restrained label and nothing else: the
    shell, the journey rail and the page do not switch into the critical
    register for it. The critical register belongs to an actual escalation,
    which replaces the interview entirely.
  */
  return (
    <AssessmentShell
      activeIndex={1}
      stageLabel="Symptom interview"
      saveFailed={saveFailed}
      onNewPatient={onNewPatient}
    >
      <Interview
        contextTitle={
          safetyRegister
            ? 'Safety check'
            : `${PHASE_GROUPS.find((group) => group.phases.includes(step.phase))?.label ?? 'Understanding'} / ${PHASE_LABEL[step.phase]}`
        }
        phase={step.phase}
        answeredPhases={answeredPhases}
        motif={motif}
        safetyRegister={safetyRegister}
        complaintLabel={complaintLabel}
        regionSummary={regionSummary}
        timeline={timeline}
        belief={session.belief}
        beliefHistory={replay.history}
        eligibleRegistryIds={presentableRegistryIds}
        // The concern chosen on the body map is not counted as an interview question.
        answeredCount={timeline.filter((entry) => entry.questionId !== INTAKE_QUESTION_IDS.complaintEntry).length}
        reduceMotion={reduceMotion}
        onChangeLocation={onChangeLocation}
        onChange={removeAnswer}
      >
        {step.kind === 'intake' ? (
          <QuestionBlock
            key={step.question.id}
            eyebrow={step.label}
            prompt={step.question.prompt}
            reduceMotion={reduceMotion}
            note={byVoice(voice, 'Added to the handoff for your care team.', 'Added to the handoff for your child’s care team.')}
          >
            <IntakeAnswerControl
              question={step.question}
              onSelect={(optionId) => submitIntake(step.question, optionId)}
              bodyLocation={clinicalContext ? { variantId: bodyVariant, primaryRegionId: clinicalContext.bodyRegionId } : null}
            />
          </QuestionBlock>
        ) : (
          <QuestionBlock
            key={step.question.id}
            eyebrow={safetyRegister ? undefined : step.label}
            prompt={voicedSafetyText(step.question, voice)}
            reduceMotion={reduceMotion}
            tone={safetyRegister ? 'safety' : 'routing'}
            note={
              safetyRegister
                ? 'An important safety question. Please answer as accurately as you can.'
                : 'Your answer decides which question comes next.'
            }
          >
            <AnswerControl
              options={step.question.options}
              tone={safetyRegister ? 'safety' : 'routing'}
              onSelect={(optionId) => submitEngine(step.question, optionId)}
            />
          </QuestionBlock>
        )}
      </Interview>
    </AssessmentShell>
  );
}

function complaintPrior(complaintId: string) {
  return materializeDemonstrationComplaint(R2B_DEMONSTRATION_KNOWLEDGE, complaintId, []).prior;
}

/**
 * The assessment chrome.
 *
 * The header carries the identity and the stage the patient is actually in.
 * What it no longer carries: a "Clinical guidance" eyebrow that restated the
 * product category on every screen, and an "AI-assisted +" chip that told a
 * patient nothing they could act on. The stage name is the only status worth
 * the space, so it is the only status here.
 */
const SAVE_FAILURE_NOTICE =
  'Your assessment could not be saved. You can still continue, but this session may not be available to staff.';

/**
 * A calm, non-blocking line shown only after saving has failed. The live
 * region is always mounted (empty when there is nothing to say) so screen
 * readers announce the text once when it appears. On the priority screen it
 * follows the emergency guidance instead of preceding it.
 */
function SaveFailureNotice({ failed }: { failed: boolean }) {
  return (
    <div className="assessment-save-notice" role="status" aria-live="polite">
      {failed ? <p className="assessment-save-notice__text type-body-small">{SAVE_FAILURE_NOTICE}</p> : null}
    </div>
  );
}

function AssessmentShell({
  children,
  activeIndex,
  stageLabel,
  critical = false,
  saveFailed = false,
  onNewPatient,
}: {
  children: ReactNode;
  activeIndex: number;
  stageLabel: string;
  critical?: boolean;
  saveFailed?: boolean;
  onNewPatient: () => void;
}) {
  return (
    <div className="assessment-shell" data-register={critical ? 'critical' : 'standard'}>
      <header className="assessment-header">
        {/* The header mark renders at most 112 px wide; the 512 px file covers 3x displays (the full file is 2048 px). */}
        <img className="assessment-header__logo" src="/logo.png" srcSet="/logo-512.png 512w, /logo.png 2048w" sizes="112px" alt="DocMatch" />
        <span className="assessment-header__rule" aria-hidden="true" />
        <strong className="assessment-header__stage type-control">{stageLabel}</strong>
        <div className="assessment-header__actions">
          <span className="assessment-header__mode type-caption">{DEPLOYMENT_PROFILE.label}</span>
          <button className="assessment-header__new-patient type-caption" type="button" aria-label="Start new patient" onClick={onNewPatient}>
            <Pictogram name="history" size={20} />
            <span>Start new patient</span>
          </button>
        </div>
      </header>

      <JourneyRail activeIndex={activeIndex} critical={critical} />
      <div className="assessment-shell__main">
        {critical ? null : <SaveFailureNotice failed={saveFailed} />}
        {children}
        {critical ? <SaveFailureNotice failed={saveFailed} /> : null}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Interview shell
   --------------------------------------------------------------------------- */

function Interview({
  children,
  contextTitle,
  phase,
  answeredPhases,
  motif,
  safetyRegister,
  complaintLabel,
  regionSummary,
  timeline,
  belief,
  beliefHistory,
  eligibleRegistryIds,
  answeredCount,
  reduceMotion,
  onChangeLocation,
  onChange,
}: {
  children: ReactNode;
  contextTitle: string;
  phase: InterviewPhase;
  answeredPhases: ReadonlySet<InterviewPhase>;
  motif: MotifKind;
  safetyRegister: boolean;
  complaintLabel: string;
  regionSummary: string | null;
  timeline: TimelineEntry[];
  belief: ReadonlyBelief;
  beliefHistory: readonly BeliefHistoryEntry[];
  /** Services plausible for this presentation; the debug rail never shows any other. */
  eligibleRegistryIds: readonly string[];
  answeredCount: number;
  reduceMotion: boolean;
  onChangeLocation: () => void;
  onChange: (questionId: string) => void;
}) {
  return (
    <div className="interview" data-tone={safetyRegister ? 'safety' : 'routing'}>
      <section className="interview__main">
        <div className="interview__locus">
          <span className="interview__locus-mark" aria-hidden="true">
            <Pictogram name="location" size={20} />
          </span>
          <span className="interview__locus-text">
            <small className="type-caption">{complaintLabel}</small>
            <strong className="type-control">{regionSummary ?? 'Location confirmed'}</strong>
          </span>
          <button className="link-action" type="button" onClick={onChangeLocation}>
            Change location
          </button>
        </div>

        <div className="interview__progress-row">
          <PhaseProgress phase={phase} answered={answeredPhases} reduceMotion={reduceMotion} />
          {/* The question carries its own Safety check label; the monitor stays
              neutral so red appears once on screen, not twice. */}
          <SafetyMonitor />
        </div>

        <p className="interview__phase type-label" aria-live="polite">
          {contextTitle}
        </p>

        <AnimatePresence mode="wait" initial={false}>
          {children}
        </AnimatePresence>

        <div className="interview__floor">
          <Progression answered={answeredCount} safety={safetyRegister} />
          <AnimatePresence mode="wait" initial={false}>
            <QuestionMotif key={motif} kind={motif} />
          </AnimatePresence>
        </div>
      </section>

      <aside className="interview__aside" aria-label="Session snapshot">
        <InterviewIntelligenceRail
          complaintLabel={complaintLabel}
          regionSummary={regionSummary}
          status={safetyRegister ? 'Safety check' : PHASE_GROUPS[1].phases.includes(phase) ? 'Refining' : 'Understanding'}
          timeline={timeline}
          belief={belief}
          history={beliefHistory}
          eligibleRegistryIds={eligibleRegistryIds}
          reduceMotion={reduceMotion}
          onChange={onChange}
        />
      </aside>
    </div>
  );
}

/**
 * One question.
 *
 * No container is drawn around it. The question is the largest thing on the
 * screen and the answers sit directly beneath it, so the composition is carried
 * by type and spacing rather than by a bordered panel.
 */
function QuestionBlock({
  children,
  eyebrow,
  prompt,
  note,
  tone = 'routing',
  reduceMotion,
}: {
  children: ReactNode;
  eyebrow?: string;
  prompt: string;
  note: string;
  tone?: 'routing' | 'safety';
  reduceMotion: boolean;
}) {
  return (
    <motion.div
      className="question"
      data-tone={tone}
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -12 }}
      transition={{ duration: reduceMotion ? 0.12 : 0.38, ease: [0.2, 0, 0, 1] }}
    >
      {tone === 'safety' ? (
        <p className="safety-label type-label">
          <span className="safety-label__mark" aria-hidden="true" />
          <span>Safety check</span>
          <span className="sr-only">. This is an important safety question.</span>
        </p>
      ) : eyebrow ? (
        <p className="question__eyebrow type-label">{eyebrow}</p>
      ) : null}
      <h1 className="question__prompt type-question">{prompt}</h1>
      {children}
      <p className="question__note type-caption">{note}</p>
    </motion.div>
  );
}

/**
 * How far through the conversation the patient is.
 *
 * An open rail of lit nodes rather than a filled bar, because the total is not
 * fixed: the interview ends when the engine has enough to route, which can come
 * sooner or later than the nodes drawn.
 */
function Progression({ answered, safety }: { answered: number; safety: boolean }) {
  const nodes = Math.max(8, answered + 1);
  // No total is promised: the questions adapt, so the count only moves forward.
  return (
    <div className="progression" data-tone={safety ? 'safety' : 'routing'}>
      <span className="type-caption progression__label">
        Question {answered + 1} / Refining your clinical direction
      </span>
      <span className="progression__nodes" aria-hidden="true">
        {Array.from({ length: nodes }, (_, index) => (
          <span key={index} data-state={index < answered ? 'done' : index === answered ? 'current' : 'ahead'} />
        ))}
      </span>
    </div>
  );
}

/**
 * Where the interview is, from simple to specific.
 *
 * Two groups of small named nodes: Understanding (describe, measure, timeline,
 * pattern) then Refining (associated features, differentiating questions).
 * The current node carries the lit state; answered nodes stay lit. It names
 * what the patient is doing in plain words and never exposes the model.
 *
 * MECHANICAL REASON for the motion: the lit marker moves between nodes with a
 * shared layout id, so advancing reads as one marker travelling forward rather
 * than one node switching off and another switching on somewhere else. The
 * phase name is announced once through the polite live region above the
 * question, not here, so a screen reader hears one update per step.
 */
function PhaseProgress({
  phase,
  answered,
  reduceMotion,
}: {
  phase: InterviewPhase;
  answered: ReadonlySet<InterviewPhase>;
  reduceMotion: boolean;
}) {
  return (
    <ol className="phase-progress" aria-label="Interview progress">
      {PHASE_GROUPS.map((group) => {
        const groupActive = group.phases.includes(phase);
        return (
          <li className="phase-progress__group" key={group.id} data-active={groupActive}>
            <span className="type-caption phase-progress__group-label">{group.label}</span>
            <span className="phase-progress__nodes">
              {group.phases.map((item) => {
                const state = item === phase ? 'current' : answered.has(item) ? 'done' : 'ahead';
                return (
                  <span
                    className="phase-progress__node"
                    key={item}
                    data-state={state}
                    aria-current={state === 'current' ? 'step' : undefined}
                    title={PHASE_LABEL[item]}
                  >
                    {state === 'current' ? (
                      <motion.span
                        className="phase-progress__lit"
                        layoutId={reduceMotion ? undefined : 'phase-lit'}
                        transition={{ duration: 0.32, ease: [0.2, 0, 0, 1] }}
                      />
                    ) : null}
                    <span className="phase-progress__name type-caption">{PHASE_LABEL[item]}</span>
                  </span>
                );
              })}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Safety monitoring, quietly.
 *
 * A small steady mark and two words while nothing needs attention. It turns to
 * the safety register only while a question R3 owns is on screen, and it says
 * so in text as well as colour, so the state never depends on colour alone.
 * An actual trigger does not appear here at all: it replaces the interview with
 * the priority escalation.
 */
function SafetyMonitor() {
  return (
    <span className="safety-monitor type-caption" data-active={false}>
      <span className="safety-monitor__mark" aria-hidden="true" />
      Safety monitoring active
    </span>
  );
}
