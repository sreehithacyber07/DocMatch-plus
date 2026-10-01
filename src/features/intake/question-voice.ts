/**
 * Who the questionnaire is talking to, fixed once per assessment.
 *
 * The questionnaire used to pick its wording question by question, so one
 * assessment could say "your child", then "the young person", then "you".
 * The voice is now decided exactly once, before the first question, and every
 * patient-facing question reads it rather than guessing:
 *
 *   age 0 to 11    caregiver   "your child"; the adult answering is "you"
 *   age 12 to 17   chosen at the under-18 acknowledgement:
 *                    the young person answering   -> self
 *                    a parent, guardian or carer   -> caregiver
 *   age 18+        self        "you"
 *
 * Clinician-facing text (the SOAP handoff) says "patient" instead, because it
 * is written for the care team, not the person at the kiosk.
 *
 * This is wording only. The voice never changes an option id, a predicate, a
 * criterion or a route.
 */

export type QuestionVoice = 'self' | 'caregiver';

/** Who said they are answering, asked only for age 12 to 17. */
export type ReporterChoice = 'young-person' | 'caregiver';

export const ADULT_AGE = 18;
export const REPORTER_CHOICE_MIN_AGE = 12;

export function isUnder18(age: number): boolean {
  return age < ADULT_AGE;
}

/** Whether the under-18 acknowledgement must also ask who is answering. */
export function needsReporterChoice(age: number): boolean {
  return age >= REPORTER_CHOICE_MIN_AGE && age < ADULT_AGE;
}

/**
 * The locked voice for an assessment.
 *
 * A 12 to 17 year old with no choice recorded defaults to the caregiver
 * voice: the acknowledgement requires a responsible adult to be present, so
 * addressing that adult is the safer reading of an unanswered choice.
 */
export function questionVoiceFor(age: number, reporter?: ReporterChoice | null): QuestionVoice {
  if (!isUnder18(age)) return 'self';
  if (!needsReporterChoice(age)) return 'caregiver';
  return reporter === 'young-person' ? 'self' : 'caregiver';
}

/** Picks the wording for the locked voice. Both strings must say the same thing. */
export function byVoice(voice: QuestionVoice, self: string, caregiver: string): string {
  return voice === 'caregiver' ? caregiver : self;
}

/*
  Mixed-voice detection, shared by the tests and the development guard.

  In caregiver voice the patient is always "your child" (or "your baby"), and
  the person answering may still be addressed as "you" ("Have you noticed..."),
  so the leak patterns are the ones that talk to the patient directly or use
  the retired third-person forms. In self voice any reference to a child, a
  young person or a third-party patient is a leak.
*/
const CAREGIVER_LEAKS: readonly RegExp[] = [
  /\bthe child\b/i,
  /\byoung person\b/i,
  /\bare you (struggling|breathing|coughing|vomiting|in pain|feeling|unable|peeing|having)\b/i,
  /\bdo you (feel|have)\b/i,
  /\bhave you (had|developed|felt|become|been sick)\b/i,
  /\byour (breathing|headache|lips|skin|vision|eye|ear|nose|throat|tummy|stomach|pain|urine|poo|joint|knee|leg|arm)\b/i,
  /\bhow long have you\b/i,
];

const SELF_LEAKS: readonly RegExp[] = [
  /\byour (child|baby)\b/i,
  /\bthe child\b/i,
  /\byoung person\b/i,
  /\bthe patient\b/i,
];

export function voiceLeaks(voice: QuestionVoice, text: string): string[] {
  const patterns = voice === 'caregiver' ? CAREGIVER_LEAKS : SELF_LEAKS;
  return patterns.filter((pattern) => pattern.test(text)).map((pattern) => pattern.source);
}
