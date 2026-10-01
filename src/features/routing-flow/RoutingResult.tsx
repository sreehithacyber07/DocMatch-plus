import { motion, useReducedMotion } from 'framer-motion';
import {
  type BeliefHistoryEntry,
  type SpecialtyId,
  type StoppingDecision,
} from '../../engine/index.ts';
import { Pictogram } from '../../components/pictograms';
import { Disclose, DiscloseItem } from '../../components/layout';
import type { ComplaintSource } from '../body-explorer/unmapped-regions.ts';
import { fadeLift } from '../../styles/motion-variants.ts';
import { SessionTimeline, type TimelineEntry } from './SessionTimeline.tsx';
import { intakeOptionLabel, type IntakeAnswer, type IntakeQuestion } from './intake-questions.ts';
import type { RouteOutcome } from './route-outcome.ts';
import { buildSoapHandoff, HANDOFF_STATUS, type BodyCapture } from './soap-handoff.ts';
import { buildClinicalRoutingExplanation } from './routing-presentation.ts';
import { RouteConvergence } from './RouteConvergence.tsx';
import { SoapDocument } from './SoapDocument.tsx';
import './result-visuals.css';
import { summarizePatientContext, type PatientContext } from '../intake/patient-context.ts';
import type { UrgentReviewState } from '../../engine/safety/index.ts';

export interface RoutingResultProps {
  specialtyId: SpecialtyId;
  stoppingDecision: StoppingDecision;
  belief: Record<SpecialtyId, number>;
  history: readonly BeliefHistoryEntry[];
  timeline: TimelineEntry[];
  intakePlan: readonly IntakeQuestion[];
  intakeAnswers: readonly IntakeAnswer[];
  complaintLabel: string;
  regionSummary: string | null;
  complaintSource?: ComplaintSource;
  capture?: BodyCapture;
  reduceMotion: boolean;
  onChange?: (questionId: string) => void;
  onNewPatient: () => void;
  onChangeLocation?: () => void;
  lockedForTrustedHandoff?: boolean;
  /** R8.1 context the patient gave before the body map. Display only. */
  patientContext?: PatientContext | null;
  /**
   * What the run actually concluded, and on which of the three bases. This is
   * the single source of truth for the direction: the screen never re-derives
   * it from the belief, so what is shown, what is persisted and what the
   * audits assert cannot drift apart.
   */
  routeOutcome: RouteOutcome;
  urgentReview?: UrgentReviewState;
}

/**
 * The handoff.
 *
 * The engine reports WHY it stopped, and this screen tells the truth about it.
 * A run that ends on the question budget without either threshold met has not
 * found a direction: its top specialty can be a tie broken alphabetically. That
 * run is sent to General Medicine, the NBEMS discipline for a nonspecific
 * presentation, and is never dressed as a specialty recommendation.
 *
 * Hierarchy, top to bottom: the direction, why, and the prepared SOAP handoff.
 * The SOAP section absorbs what used to be a separate intake summary, so the
 * patient's answers appear once rather than in two long repeated blocks. It is
 * collapsed by default because the direction is what the patient acts on; the
 * handoff is what the clinician reads.
 */
export function RoutingResult({
  specialtyId,
  stoppingDecision,
  belief,
  history,
  timeline,
  intakePlan,
  intakeAnswers,
  complaintLabel,
  regionSummary,
  complaintSource = 'bridge-resolved',
  capture = { painLocation: null, view: null },
  reduceMotion,
  onChange,
  onNewPatient,
  onChangeLocation,
  lockedForTrustedHandoff = false,
  patientContext = null,
  routeOutcome,
  urgentReview,
}: RoutingResultProps) {
  const preference = Boolean(useReducedMotion());
  const reduced = reduceMotion || preference;
  const scored = routeOutcome.basis === 'bayesian-convergence';
  const gated = routeOutcome.basis === 'source-backed-criteria';
  const converged = scored || gated;
  const direction = routeOutcome.label;
  const explanation = buildClinicalRoutingExplanation({
    engineSelectedSpecialtyId: specialtyId,
    stoppingDecision,
    belief,
    history,
    timeline,
    converged: scored,
  });
  const leadingAnswer = explanation.strongestPositiveEvidence[0];
  /*
    The convergence figure draws a BELIEF. It is shown only for a route the
    belief vector actually produced. A gated route has no probability, so
    drawing that figure for it would invent one; it gets its supporting
    criteria listed instead.
  */
  const showConvergence =
    scored && explanation.topBelief !== null && explanation.strongestPositiveEvidence.length > 0;
  const whyPreview = gated
    ? routeOutcome.supportingSignals.map((signal) => signal.label).slice(0, 2).join(' / ')
    : scored
      ? leadingAnswer
        ? `${leadingAnswer.answer} / ${leadingAnswer.question}`
        : `Response pattern supports ${direction}`
      : routeOutcome.fallbackExplanation ?? 'The available information did not support a narrower direction';

  const soap = buildSoapHandoff({
    complaintLabel,
    complaintSource,
    capture,
    intakePlan,
    intakeAnswers,
    timeline,
    converged,
    directionLabel: direction,
    urgentReview: Boolean(urgentReview),
  });

  /* The collapsed handoff has to be useful closed: the concern and the first
     three intake fields the patient actually answered. */
  const intakeValues = intakePlan
    .map((question) => {
      const answer = intakeAnswers.find((candidate) => candidate.questionId === question.id);
      return answer ? intakeOptionLabel(question, answer.optionId) : null;
    })
    .filter((value): value is string => value !== null);
  const soapPreview = `${complaintLabel}${intakeValues.length > 0 ? `\n${intakeValues.slice(0, 3).join(' / ')}` : ''}`;

  return (
    <div className="handoff" data-result-kind={converged ? 'specialty' : 'fallback'}>
      <section className="handoff__main">
        <motion.p className="type-label handoff__eyebrow" {...fadeLift(reduced, 0)}>
          <Pictogram name="result" size={20} state="completed" /> Routing complete
        </motion.p>

        <motion.div className="handoff__direction" {...fadeLift(reduced, 0.06)}>
          <span className="type-caption handoff__direction-label">Clinical direction</span>
          <h1 className="type-display handoff__specialty">{direction}</h1>
          <p className="type-body handoff__next-line">
            {converged ? (
              <>
                <span className="handoff__next-line-primary">Proceed to {direction} for clinical evaluation.</span>
                <span className="handoff__next-line-secondary"> The care team can use this prepared summary to decide what happens next.</span>
              </>
            ) : (
              <>
                <span className="handoff__next-line-primary">{routeOutcome.fallbackExplanation}</span>
                <span className="handoff__next-line-secondary"> {direction} is the appropriate starting point for clinical evaluation.</span>
              </>
            )}
          </p>
          <p className="type-caption handoff__qualification">Specialty direction, not a diagnosis.</p>
        </motion.div>

        {urgentReview ? (
          <motion.aside className="handoff__urgent-review" aria-label="Urgent clinical review" {...fadeLift(reduced, 0.08)}>
            <Pictogram name="priority" size={20} />
            <div>
              <span className="type-label handoff__urgent-review-label">Urgent clinical review</span>
              <strong className="type-control handoff__urgent-review-main">One or more answers indicate that this should be assessed promptly.</strong>
              <p className="type-body-small handoff__urgent-review-details">
                <span className="handoff__urgent-review-secondary">{direction} remains the clinical direction. </span>
                <span className="handoff__urgent-review-guidance">{urgentReview.payload.guidance}</span>
              </p>
            </div>
          </motion.aside>
        ) : null}

        {showConvergence && explanation.topBelief !== null ? (
          <motion.div className="handoff__route" {...fadeLift(reduced, 0.1)}>
            <RouteConvergence
              evidence={explanation.strongestPositiveEvidence.slice(0, 3)}
              selected={explanation.selectedSpecialty}
              reduced={reduced}
            />
          </motion.div>
        ) : null}

        <motion.div className="handoff__sections" {...fadeLift(reduced, 0.14)}>
          {showConvergence ? null : (
          <Disclose title="Why this direction" mark="question" emphasis="section" preview={whyPreview}>
            {gated ? (
              <>
                <DiscloseItem>
                  <p className="type-body">
                    The {routeOutcome.supportingSignals.length === 1 ? 'feature' : 'features'} described below
                    {' '}{routeOutcome.supportingSignals.length === 1 ? 'is' : 'are'} what published clinical guidance
                    {' '}sends to {direction}. This is a clinical direction, not a diagnosis.
                  </p>
                </DiscloseItem>
                <ul className="reasons">
                  {routeOutcome.supportingSignals.map((signal) => (
                    <DiscloseItem key={signal.label}>
                      <li>
                        <span className="reasons__node" aria-hidden="true" />
                        <span className="type-caption">Reported</span>
                        <strong className="type-control">{signal.label}</strong>
                      </li>
                    </DiscloseItem>
                  ))}
                </ul>
              </>
            ) : converged ? (
              <>
                <DiscloseItem>
                  <p className="type-body">
                    These patient-reported responses contributed most to the {direction} routing direction.
                  </p>
                </DiscloseItem>
                {explanation.strongestPositiveEvidence.length > 0 ? (
                  <ul className="reasons">
                    {explanation.strongestPositiveEvidence.slice(0, 3).map((evidence) => (
                        <DiscloseItem key={`${evidence.questionId}-${evidence.optionId}`}>
                          <li>
                            <span className="reasons__node" aria-hidden="true" />
                            <span className="type-caption">{evidence.question}</span>
                            <strong className="type-control">{evidence.answer}</strong>
                          </li>
                        </DiscloseItem>
                      ))}
                  </ul>
                ) : null}
              </>
            ) : (
              <DiscloseItem>
                <p className="type-body">
                  {routeOutcome.fallbackExplanation} {direction} is the right first point of care for this
                  {' '}picture, and your handoff is complete.
                </p>
              </DiscloseItem>
            )}
          </Disclose>
          )}

          <div className="handoff__prepared">
            <p className="type-label handoff__prepared-label">
              <span className="handoff__prepared-mark" aria-hidden="true" />
              {HANDOFF_STATUS}
            </p>
            <Disclose title="SOAP Summary" mark="summary" emphasis="section" preview={soapPreview}>
              <SoapDocument sections={soap} status={HANDOFF_STATUS} reduced={reduced} />
            </Disclose>
          </div>

          {patientContext ? (
            <Disclose
              title="Context you shared"
              mark="summary"
              emphasis="section"
              preview="Held on this device for age- and context-appropriate questioning."
            >
              <DiscloseItem>
                <p className="type-body-small">
                  You gave these details before the body map. They stay in this page for this assessment and help
                  choose age- and context-appropriate questions. They do not select a specialty by themselves.
                </p>
              </DiscloseItem>
              <DiscloseItem>
                <dl className="context-summary">
                  {patientContext.assessmentName ? (
                    <div className="context-summary__line">
                      <dt className="type-caption">Name for this assessment</dt>
                      <dd className="type-body-small">{patientContext.assessmentName}</dd>
                    </div>
                  ) : null}
                  {summarizePatientContext(patientContext).map((line) => (
                    <div className="context-summary__line" key={line.label}>
                      <dt className="type-caption">{line.label}</dt>
                      <dd className="type-body-small">{line.value}</dd>
                    </div>
                  ))}
                </dl>
              </DiscloseItem>
            </Disclose>
          ) : null}
        </motion.div>
      </section>

      <aside className="handoff__aside" aria-label="Session">
        <SessionTimeline
          complaintLabel={complaintLabel}
          regionSummary={regionSummary}
          status="Routing complete"
          timeline={timeline}
          reduceMotion={reduced}
          onChange={onChange}
        />
        <div className="handoff__actions">
          {onChangeLocation ? (
            <button className="ghost-button" type="button" onClick={onChangeLocation}>
              <Pictogram name="back" size={20} />
              <span className="type-control">Change location</span>
            </button>
          ) : null}
          {lockedForTrustedHandoff ? (
            <p className="type-caption">To correct this result, begin a new assessment. This prepared summary is not a clinical diagnosis.</p>
          ) : null}
          <button className="cta" type="button" onClick={onNewPatient}>
            <span className="type-control">{lockedForTrustedHandoff ? 'Start new assessment' : 'Start new patient'}</span>
            <Pictogram name="routing" size={20} />
          </button>
        </div>
      </aside>
    </div>
  );
}
