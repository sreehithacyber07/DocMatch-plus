/**
 * The patient's own medical background for the BROWSER handoff (phase 4).
 *
 * Kept out of soap-handoff.ts on purpose: that module is shared with the
 * trusted server, which must never receive medical background (privacy
 * model). Only the result screen builds these lines and passes them in.
 */
import { summarizePatientContext, type PatientContext } from '../intake/patient-context.ts';
import type { SoapLine } from './soap-handoff.ts';

const BACKGROUND_LABELS: ReadonlySet<string> = new Set([
  'Existing conditions',
  'Previous similar episode',
  'Earlier explanation given',
  'Allergies',
  'Medications',
  'Previous surgery or procedure',
]);

/** What the patient shared before the body map, as they wrote it. Unanswered items are left out, never written as negatives. */
export function soapBackground(context: PatientContext): SoapLine[] {
  return summarizePatientContext(context).filter((line) => BACKGROUND_LABELS.has(line.label) && line.value !== 'Not answered');
}
