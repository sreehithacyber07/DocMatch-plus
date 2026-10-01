import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useCallback, useRef, useState } from 'react';
import { Button } from '../../components/primitives/Button.tsx';
import { Brandmark } from '../hero/Brandmark.tsx';
import { PremiumTerms } from './PremiumTerms.tsx';
import { PatientContextStep } from './PatientContextStep.tsx';
import {
  INTAKE_STEPS,
  emptyPatientContext,
  finalizePatientContext,
  validateStep,
  visibleErrors,
  type IntakeStep,
  type PatientContext,
  type PatientContextDraft,

  ageOn,
  localToday,
} from './patient-context.ts';
import { byVoice, isUnder18, questionVoiceFor, type QuestionVoice } from './question-voice.ts';
import { UnderEighteenAcknowledgement } from './UnderEighteenAcknowledgement.tsx';
import '../../components/primitives/primitives.css';
import './intake.css';

export interface PatientIntakeProps {
  deploymentLabel: string;
  sessionNotice: { label: string; notice: string };
  onComplete: (context: PatientContext) => void;
  onExit: () => void;
}

type Phase = 'terms' | IntakeStep;

/** Where focus goes for each unanswered field. */
const FIELD_TARGET: Record<string, string> = {
  dateOfBirth: 'context-dob-day',
  sexForAssessment: 'context-sex',
  accessibilityNeeds: 'context-access',
  existingConditions: 'context-conditions-input',
  previousSimilarEpisode: 'context-episode',
  previousExplanationKnown: 'context-explanation',
  allergyStatus: 'context-allergy',
  allergies: 'context-allergy-types',
  medicationStatus: 'context-medication',
  medications: 'context-medication-0',
  surgeryStatus: 'context-surgery',
};

/**
 * About you is written before the age is known, so it addresses the person
 * holding the device. Once the age (and, for 12 to 17, who is answering) is
 * settled, the later steps take the locked questionnaire voice.
 */
function stepIntro(step: IntakeStep, voice: QuestionVoice): string {
  switch (step) {
    case 'basics':
      return 'These details help the care team read the answers in context. Age decides how the questions are worded and which safety checks apply.';
    case 'history':
      return byVoice(
        voice,
        'What would make this easier for you, and a little about your health history.',
        'What would make this easier for your child, and a little about their health history.',
      );
    case 'background':
      return byVoice(
        voice,
        'Allergies, medications and past procedures, as far as you know them.',
        'Your child’s allergies, medications and past procedures, as far as you know them.',
      );
  }
}

function focusField(key: string) {
  const target = document.getElementById(FIELD_TARGET[key] ?? '');
  if (!target) return;
  const first =
    target instanceof HTMLFieldSetElement
      ? target.querySelector<HTMLElement>('input:checked, input, button')
      : target;
  (first ?? target).focus();
}

/**
 * The patient intake: terms first, then three short context steps.
 *
 * All of it is React state in this component. RouteScreen mounts it keyed to
 * the patient-session epoch, so a new patient, kiosk inactivity or a restored
 * page discards the terms acceptance and every answer with the component.
 * Nothing here is written to browser storage. A persisting deployment sends
 * only the minimal non-identifying clinical replay context after confirmation;
 * name, phone and DOB stay in the patient-session memory.
 *
 * Every screen is a contained application screen: the window never scrolls.
 * The step body scrolls inside itself when it must, and Back and Continue stay
 * in one place, inside the same content frame as the fields.
 *
 * An answer is judged only after the patient tries to continue or leaves it
 * unfinished, so no step opens with its fields marked wrong.
 */
export function PatientIntake({ deploymentLabel, sessionNotice, onComplete, onExit }: PatientIntakeProps) {
  const reduced = Boolean(useReducedMotion());
  const [phase, setPhase] = useState<Phase>('terms');
  const [direction, setDirection] = useState(1);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [draft, setDraft] = useState<PatientContextDraft>(emptyPatientContext);
  const [attempted, setAttempted] = useState<Partial<Record<IntakeStep, boolean>>>({});
  const [touched, setTouched] = useState<ReadonlySet<string>>(() => new Set());
  const [announcement, setAnnouncement] = useState('');
  const [acknowledgementOpen, setAcknowledgementOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const canonicalDob = draft.dateOfBirth
    ? { year: Number(draft.dateOfBirth.slice(0, 4)), month: Number(draft.dateOfBirth.slice(5, 7)), day: Number(draft.dateOfBirth.slice(8, 10)) }
    : null;
  const derivedAge = canonicalDob ? ageOn(canonicalDob, localToday()) : null;
  const voice = derivedAge === null ? 'self' : questionVoiceFor(derivedAge, draft.reporter);

  const stepIndex = INTAKE_STEPS.findIndex((step) => step.id === phase);
  const errors =
    phase === 'terms' ? {} : visibleErrors(validateStep(phase, draft), Boolean(attempted[phase]), touched);
  const basicsReady = Object.keys(validateStep('basics', draft)).length === 0;

  // Each step's body mounts once the previous one has left, so the new heading
  // takes focus, and the body returns to its top, as it arrives.
  const headingArrived = useCallback((heading: HTMLHeadingElement | null) => {
    if (!heading) return;
    scrollRef.current?.scrollTo({ top: 0 });
    heading.focus();
  }, []);

  const go = (next: Phase, forward: boolean) => {
    setDirection(forward ? 1 : -1);
    setAnnouncement('');
    setPhase(next);
  };

  const markLeft = (field: string) =>
    setTouched((current) => (current.has(field) ? current : new Set(current).add(field)));

  const advance = () => {
    if (phase === 'terms') return;
    const missing = Object.keys(validateStep(phase, draft));
    if (missing.length > 0) {
      setAttempted((current) => ({ ...current, [phase]: true }));
      setAnnouncement(
        missing.length === 1 ? 'One answer needs your attention.' : `${missing.length} answers need your attention.`,
      );
      window.requestAnimationFrame(() => focusField(missing[0]));
      return;
    }
    const next = INTAKE_STEPS[stepIndex + 1];
    if (next) {
      const age = derivedAge;
      // Under 18, the adult-presence acknowledgement stands between About you
      // and the rest of the assessment. It is asked once: going back and
      // forward again does not repeat it unless the age itself is corrected.
      if (phase === 'basics' && age !== null && isUnder18(age) && !draft.underEighteenAcknowledged) {
        setAcknowledgementOpen(true);
        return;
      }
      go(next.id, true);
      return;
    }
    const context = finalizePatientContext(draft);
    if (context) onComplete(context);
  };

  const back = () => {
    if (phase === 'terms') return onExit();
    const previous = INTAKE_STEPS[stepIndex - 1];
    go(previous ? previous.id : 'terms', false);
  };

  const shift = reduced ? 0 : 20 * direction;

  return (
    <div className="intake" data-phase={phase} data-terms-accepted={termsAccepted}>
      <header className="intake__bar">
        <div className="intake__frame intake__bar-inner">
          <Brandmark size="compact" />
          <ol className="intake__progress" aria-label="Before the assessment">
            {[{ id: 'terms', title: 'Terms' }, ...INTAKE_STEPS].map((item, index) => {
              const current = item.id === phase;
              const done = index < stepIndex + 1;
              return (
                <li
                  key={item.id}
                  className="intake__progress-step"
                  data-state={current ? 'current' : done ? 'done' : 'upcoming'}
                  aria-current={current ? 'step' : undefined}
                >
                  <span className="intake__progress-node" aria-hidden="true" />
                  <span className="intake__progress-label">{item.title}</span>
                </li>
              );
            })}
          </ol>
        </div>
      </header>

      {/* MECHANICAL REASON for the motion: moving between the terms and the
          context steps replaces the whole screen, so it fades with a short
          shift in the direction of travel. Between context steps the form, its
          header and its action bar stay mounted and only the step body changes
          (below). With reduced motion content is replaced in place. */}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={phase === 'terms' ? 'terms' : 'context'}
          className="intake__stage"
          initial={{ opacity: 0, x: shift }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -shift }}
          transition={{ duration: reduced ? 0 : 0.2, ease: [0.2, 0, 0, 1] }}
        >
          {phase === 'terms' ? (
            <PremiumTerms
              deploymentLabel={deploymentLabel}
              sessionNotice={sessionNotice}
              onAgree={() => {
                setTermsAccepted(true);
                go('basics', true);
              }}
              onBack={onExit}
            />
          ) : (
            <form
              className="context"
              aria-labelledby="context-title"
              autoComplete="off"
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                advance();
              }}
            >
              <div className="context__scroll" ref={scrollRef}>
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div
                    key={phase}
                    className="intake__frame context__body"
                    initial={{ opacity: 0, x: shift / 2 }}
                    animate={{ opacity: 1, x: 0, transition: { duration: reduced ? 0 : 0.2, ease: [0, 0, 0, 1] } }}
                    exit={{ opacity: 0, x: -shift / 2, transition: { duration: reduced ? 0 : 0.14, ease: [0.3, 0, 1, 1] } }}
                  >
                    <div className="context__head">
                      <p className="type-caption context__eyebrow">
                        Step {stepIndex + 1} of {INTAKE_STEPS.length} · For the care team&apos;s context
                      </p>
                      <h1 className="context__title" id="context-title" tabIndex={-1} ref={headingArrived}>
                        {INTAKE_STEPS[stepIndex].title}
                      </h1>
                      <p className="type-body-small context__intro">{stepIntro(phase, voice)}</p>
                    </div>

                    <PatientContextStep
                      step={phase}
                      draft={draft}
                      voice={voice}
                      errors={errors}
                      onChange={(update) =>
                        setDraft((current) => {
                          // A corrected age is a different assessment for the
                          // acknowledgement and the question voice.
                          const ageChanged = 'dateOfBirth' in update;
                          return ageChanged
                            ? { ...current, ...update, underEighteenAcknowledged: false, reporter: null }
                            : { ...current, ...update };
                        })}
                      onLeave={markLeft}
                    />
                  </motion.div>
                </AnimatePresence>
              </div>

              <p className="sr-only" role="status" aria-live="polite">
                {announcement}
              </p>

              <div className="context__actions">
                <div className="intake__frame context__actions-inner">
                  <Button variant="back" className="context__back" onClick={back}>
                    Back
                  </Button>
                  <Button variant="primary" type="submit" className="cta context__continue dm-button--forward" disabled={phase === 'basics' && !basicsReady}>
                    {stepIndex === INTAKE_STEPS.length - 1 ? 'Continue to body map' : 'Continue'}
                  </Button>
                </div>
              </div>
            </form>
          )}
        </motion.div>
      </AnimatePresence>

      {derivedAge !== null && isUnder18(derivedAge) ? (
        <UnderEighteenAcknowledgement
          key={derivedAge}
          open={acknowledgementOpen}
          age={derivedAge}
          onBack={() => setAcknowledgementOpen(false)}
          onContinue={(reporter) => {
            setDraft((current) => ({ ...current, underEighteenAcknowledged: true, reporter }));
            setAcknowledgementOpen(false);
            go('history', true);
          }}
        />
      ) : null}
    </div>
  );
}
