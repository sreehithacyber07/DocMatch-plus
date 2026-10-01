/**
 * The SOAP-style clinical handoff.
 *
 * SOAP is the note structure clinicians already read: Subjective, Objective,
 * Assessment, Plan. DocMatch+ prepares one from the session so the care team
 * receives the intake in a familiar shape. It is built here, as data, rather
 * than inside the result component, so the rules below are testable.
 *
 * WHAT EACH SECTION IS ALLOWED TO CONTAIN
 *
 *   Subjective  only what the patient reported: concern, the intake fields they
 *               answered, and their answers to interview questions.
 *
 *   Objective   only what the kiosk itself captured: the body region touched,
 *               the view, the side, and whether an exact point or a general
 *               area was marked, plus how the concern was established. Nothing
 *               measured. No vital signs, no temperature, no oxygen saturation,
 *               no examination finding, because none is captured, and the
 *               section says so explicitly rather than leaving a gap a reader
 *               could fill with an assumption.
 *
 *   Assessment  a ROUTING assessment. It names the direction the response
 *               pattern supports and never a condition. An unconverged run
 *               says that no direction separated.
 *
 *   Plan        the point of care. "Prepared for clinical handoff", never "sent":
 *               this build has no clinical-system integration and must not
 *               claim a transmission it does not perform.
 */
import { bodyRegionById, type PainLocation } from '../../body/index.ts';
import type { ComplaintSource } from '../body-explorer/unmapped-regions.ts';
import { patientRelativeSide } from '../body-explorer/laterality.ts';
import { intakeOptionLabel, type IntakeAnswer, type IntakeQuestion } from './intake-questions.ts';
import type { TimelineEntry } from './timeline-types.ts';
import { CLINICAL_BOUNDARY } from '../trust/copy.ts';

export interface SoapLine {
  label: string;
  value: string;
}

export interface SoapSection {
  key: 'S' | 'O' | 'A' | 'P';
  title: string;
  lines: readonly SoapLine[];
}

export interface BodyCapture {
  painLocation: PainLocation | null;
  view: 'front' | 'back' | null;
}

export interface SoapInput {
  complaintLabel: string;
  complaintSource: ComplaintSource;
  capture: BodyCapture;
  intakePlan: readonly IntakeQuestion[];
  intakeAnswers: readonly IntakeAnswer[];
  timeline: readonly TimelineEntry[];
  converged: boolean;
  directionLabel: string;
  /**
   * An urgent but continuable R3 rule fired. The direction stands and the
   * handoff says the concern should be assessed promptly; it never claims no
   * warning sign was found.
   */
  urgentReview?: boolean;
}

export const NO_MEASUREMENTS_NOTE =
  'No vital signs, measurements or examination findings were captured by DocMatch+.';

export const HANDOFF_STATUS = 'Prepared for clinical handoff';

export function buildSoapHandoff(input: SoapInput): readonly SoapSection[] {
  /* --- S ------------------------------------------------------------------ */
  const subjective: SoapLine[] = [{ label: 'Main concern', value: input.complaintLabel }];

  for (const question of input.intakePlan) {
    const answer = input.intakeAnswers.find((candidate) => candidate.questionId === question.id);
    if (answer) subjective.push({ label: question.eyebrow, value: intakeOptionLabel(question, answer.optionId) });
  }

  const interview = input.timeline.filter((entry) => entry.kind !== 'intake');
  const reported = interview.filter((entry) => entry.label.toLowerCase() === 'yes').map((entry) => entry.text);
  const denied = interview.filter((entry) => entry.label.toLowerCase() === 'no').map((entry) => entry.text);
  if (reported.length > 0) subjective.push({ label: 'Answered yes', value: reported.join(' ') });
  if (denied.length > 0) subjective.push({ label: 'Answered no', value: denied.join(' ') });

  /* --- O ------------------------------------------------------------------ */
  const objective: SoapLine[] = [];
  const location = input.capture.painLocation;
  const region = location ? bodyRegionById(location.regionId) : undefined;
  if (region && location) {
    objective.push({ label: 'Body region selected', value: region.label });
    const side = patientRelativeSide(region.laterality);
    objective.push({ label: 'Side', value: side ?? 'Midline' });
    if (input.capture.view) {
      objective.push({ label: 'Body view', value: input.capture.view === 'front' ? 'Front' : 'Back' });
    }
    objective.push({
      label: 'Location precision',
      value: location.precision === 'exact-point' ? 'Exact point marked' : 'General area',
    });
  } else {
    objective.push({ label: 'Body region selected', value: 'Not recorded' });
  }
  objective.push({
    label: 'Concern established',
    value:
      input.complaintSource === 'patient-stated'
        ? 'Stated by the patient at a body region without its own question set'
        : 'From the body region the patient selected',
  });
  objective.push({ label: 'Measurements', value: NO_MEASUREMENTS_NOTE });

  /* --- A ------------------------------------------------------------------ */
  const assessment: SoapLine[] = [
    {
      label: 'Routing assessment',
      value: input.converged
        ? `Response pattern most strongly supports ${input.directionLabel} as the next clinical direction.`
        : 'No single specialty direction separated from the others. The response pattern is nonspecific.',
    },
    {
      label: 'Safety screening',
      value: input.urgentReview
        ? 'Warning-sign screening completed. An answer indicates this should be assessed promptly (urgent clinical review); the direction above still applies.'
        : 'Warning-sign screening completed. No warning sign was triggered.',
    },
    { label: 'Scope', value: CLINICAL_BOUNDARY },
  ];

  /* --- P ------------------------------------------------------------------ */
  const plan: SoapLine[] = [
    { label: 'Next step', value: `Proceed to ${input.directionLabel} for clinical evaluation.` },
    { label: 'Handoff', value: `${HANDOFF_STATUS}. Clinical decisions remain with the care team.` },
  ];

  return [
    { key: 'S', title: 'Subjective', lines: subjective },
    { key: 'O', title: 'Objective', lines: objective },
    { key: 'A', title: 'Assessment', lines: assessment },
    { key: 'P', title: 'Plan', lines: plan },
  ];
}
