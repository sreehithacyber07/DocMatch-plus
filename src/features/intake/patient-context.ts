/**
 * Patient context gathered before the Body Explorer.
 *
 * Full intake context lives in React state and is discarded at the patient
 * reset boundary. It is never written to browser storage. In a persisting
 * deployment, only minimal age-in-years, assessment sex and reporter choice
 * reach the trusted replay context; name, contact and DOB do not.
 *
 * Everything here is pure so the rules can be tested without a browser.
 */

import { questionVoiceFor, type QuestionVoice, type ReporterChoice } from './question-voice.ts';

/* --- Options ------------------------------------------------------------------ */

export interface Option<Value extends string = string> {
  value: Value;
  label: string;
}

export type SexForAssessment = 'female' | 'male' | 'intersex_or_variation';

export const SEX_OPTIONS: readonly Option<SexForAssessment>[] = [
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
  { value: 'intersex_or_variation', label: 'Other' },
];

export type AccessibilityNeed =
  | 'none'
  | 'mobility'
  | 'vision'
  | 'hearing'
  | 'communication'
  | 'reading'
  | 'cognitive'
  | 'sensory'
  | 'support_person'
  | 'other';

export const ACCESSIBILITY_OPTIONS: readonly Option<AccessibilityNeed>[] = [
  { value: 'none', label: 'None' },
  { value: 'mobility', label: 'Mobility assistance' },
  { value: 'vision', label: 'Vision support' },
  { value: 'hearing', label: 'Hearing support' },
  { value: 'communication', label: 'Communication support' },
  { value: 'reading', label: 'Reading / comprehension support' },
  { value: 'cognitive', label: 'Cognitive or learning support' },
  { value: 'sensory', label: 'Sensory accommodations' },
  { value: 'support_person', label: 'Assistance from a caregiver or support person' },
  { value: 'other', label: 'Other accessibility need' },
];

export const CONDITION_NONE_KNOWN = 'none_known';
export const CONDITION_OTHER = 'other';

export const CONDITION_OPTIONS: readonly Option[] = [
  { value: 'hypertension', label: 'Hypertension' },
  { value: 'diabetes', label: 'Diabetes' },
  { value: 'asthma', label: 'Asthma' },
  { value: 'heart_disease', label: 'Coronary artery / heart disease' },
  { value: 'heart_attack', label: 'Previous heart attack' },
  { value: 'stroke_tia', label: 'Stroke / TIA' },
  { value: 'epilepsy', label: 'Epilepsy / seizure disorder' },
  { value: 'kidney_disease', label: 'Chronic kidney disease' },
  { value: 'liver_disease', label: 'Chronic liver disease' },
  { value: 'thyroid', label: 'Thyroid disorder' },
  { value: 'cancer', label: 'Cancer' },
  { value: 'blood_clotting', label: 'Blood or clotting disorder' },
  { value: 'migraine', label: 'Migraine' },
  { value: 'arthritis', label: 'Arthritis / chronic joint disease' },
  { value: 'respiratory', label: 'Chronic respiratory disease' },
  { value: 'autoimmune', label: 'Autoimmune condition' },
  { value: 'mental_health', label: 'Mental health condition' },
  { value: CONDITION_OTHER, label: 'Other' },
  { value: CONDITION_NONE_KNOWN, label: 'None known' },
];

export type PreviousEpisode = 'no' | 'yes_once' | 'yes_multiple' | 'not_sure';

export const EPISODE_OPTIONS: readonly Option<PreviousEpisode>[] = [
  { value: 'no', label: 'No' },
  { value: 'yes_once', label: 'Yes, once' },
  { value: 'yes_multiple', label: 'Yes, more than once' },
  { value: 'not_sure', label: 'Not sure' },
];

export type YesNoUnsure = 'yes' | 'no' | 'not_sure';

export const EXPLANATION_OPTIONS: readonly Option<YesNoUnsure>[] = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
  { value: 'not_sure', label: 'Not sure' },
];

export type AllergyStatus = 'none_known' | 'known' | 'not_sure';

export const ALLERGY_STATUS_OPTIONS: readonly Option<AllergyStatus>[] = [
  { value: 'none_known', label: 'No known allergies' },
  { value: 'known', label: 'Known allergy' },
  { value: 'not_sure', label: 'Not sure' },
];

export const ALLERGY_OTHER = 'other';

export const ALLERGY_OPTIONS: readonly Option[] = [
  { value: 'antibiotics', label: 'Penicillin / antibiotics' },
  { value: 'nsaids', label: 'NSAIDs' },
  { value: 'other_medication', label: 'Other medication' },
  { value: 'latex', label: 'Latex' },
  { value: 'food', label: 'Food' },
  { value: 'contrast', label: 'Contrast agent' },
  { value: ALLERGY_OTHER, label: 'Other' },
];

export type MedicationStatus = 'none' | 'known' | 'not_sure';

export const MEDICATION_STATUS_OPTIONS: readonly Option<MedicationStatus>[] = [
  { value: 'none', label: 'None' },
  { value: 'known', label: 'Add medication' },
  { value: 'not_sure', label: 'Not sure' },
];

export type SurgeryStatus = 'no' | 'yes' | 'not_sure';

export const SURGERY_OPTIONS: readonly Option<SurgeryStatus>[] = [
  { value: 'no', label: 'No' },
  { value: 'yes', label: 'Yes' },
  { value: 'not_sure', label: 'Not sure' },
];

export const TEXT_LIMITS = { name: 60, short: 120 } as const;
export const MEDICATION_ENTRY_LIMIT = 10;

/* --- Draft and final shapes ---------------------------------------------------- */

export interface DateParts {
  day: string;
  month: string;
  year: string;
}

/** What the form holds while it is being filled. Unanswered is null. */
export interface PatientContextDraft {
  assessmentName: string;
  /** Canonical valid date of birth in ISO format (YYYY-MM-DD), if one has been entered. */
  dateOfBirth: string | null;
  /** The text currently in the date fields. */
  dateOfBirthParts: DateParts;
  sexForAssessment: SexForAssessment | null;
  /**
   * Set by the under-18 acknowledgement. Null until then, and never set for an
   * adult. Only who is answering is recorded: no name, relationship detail or
   * contact for the adult is ever collected.
   */
  underEighteenAcknowledged: boolean;
  reporter: ReporterChoice | null;

  accessibilityNeeds: AccessibilityNeed[];
  accessibilityOther: string;

  existingConditions: string[];
  conditionOther: string;

  previousSimilarEpisode: PreviousEpisode | null;
  previousExplanationKnown: YesNoUnsure | null;
  previousExplanation: string;

  allergyStatus: AllergyStatus | null;
  allergies: string[];
  allergyOther: string;

  medicationStatus: MedicationStatus | null;
  medications: string[];

  surgeryStatus: SurgeryStatus | null;
  surgeries: string;
}

/** The completed context. Dependent answers exist only when their parent allows them. */
export interface PatientContext {
  assessmentName?: string;
  derivedAge: number;
  sexForAssessment: SexForAssessment;
  /**
   * The questionnaire voice, locked for the whole assessment. Optional only so
   * contexts built before this field existed still resolve; readers go
   * through voiceOf(), which falls back to the age rule.
   */
  questionVoice?: QuestionVoice;

  accessibilityNeeds: AccessibilityNeed[];
  accessibilityOther?: string;

  existingConditions: string[];
  conditionOther?: string;

  previousSimilarEpisode: PreviousEpisode;
  previousExplanationKnown?: YesNoUnsure;
  previousExplanation?: string;

  allergyStatus: AllergyStatus;
  allergies: string[];
  allergyOther?: string;

  medicationStatus: MedicationStatus;
  medications: string[];

  surgeryStatus: SurgeryStatus;
  surgeries?: string;
}

export function emptyPatientContext(): PatientContextDraft {
  return {
    assessmentName: '',
    dateOfBirth: null,
    dateOfBirthParts: { day: '', month: '', year: '' },
    sexForAssessment: null,
    underEighteenAcknowledged: false,
    reporter: null,
    accessibilityNeeds: [],
    accessibilityOther: '',
    existingConditions: [],
    conditionOther: '',
    previousSimilarEpisode: null,
    previousExplanationKnown: null,
    previousExplanation: '',
    allergyStatus: null,
    allergies: [],
    allergyOther: '',
    medicationStatus: null,
    medications: [''],
    surgeryStatus: null,
    surgeries: '',
  };
}

/* --- Date of birth and age ----------------------------------------------------- */

export const EARLIEST_BIRTH_YEAR = 1900;

export type DateOfBirthResult =
  | { ok: true; iso: string; age: number }
  | { ok: false; error: string; field: keyof DateParts | 'date' };

export interface CalendarDay {
  year: number;
  month: number;
  day: number;
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/** Today as a local calendar day, so age never shifts with the UTC offset. */
export function localToday(now: Date = new Date()): CalendarDay {
  return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
}

/**
 * Completed years between a birth date and today.
 *
 * The birthday counts as reached only on or after its month and day. A 29
 * February birthday is therefore reached on 1 March in a common year, because
 * 29 February does not occur and 28 February still precedes it.
 */
export function ageOn(birth: CalendarDay, today: CalendarDay): number {
  let age = today.year - birth.year;
  const reached = today.month > birth.month || (today.month === birth.month && today.day >= birth.day);
  if (!reached) age -= 1;
  return age;
}

const DIGITS = /^\d+$/;

export function validateDateOfBirth(parts: DateParts, today: CalendarDay = localToday()): DateOfBirthResult {
  const day = parts.day.trim();
  const month = parts.month.trim();
  const year = parts.year.trim();

  if (!day && !month && !year) return { ok: false, field: 'day', error: 'Enter your date of birth.' };
  if (!day || !DIGITS.test(day)) return { ok: false, field: 'day', error: 'Enter the day as a number.' };
  if (!month || !DIGITS.test(month)) return { ok: false, field: 'month', error: 'Enter the month as a number.' };
  if (!year || !DIGITS.test(year) || year.length !== 4) {
    return { ok: false, field: 'year', error: 'Enter the year as four digits.' };
  }

  const d = Number(day);
  const m = Number(month);
  const y = Number(year);

  if (y < EARLIEST_BIRTH_YEAR) return { ok: false, field: 'year', error: `Enter a year from ${EARLIEST_BIRTH_YEAR}.` };
  if (m < 1 || m > 12) return { ok: false, field: 'month', error: 'Enter a month from 1 to 12.' };
  if (d < 1 || d > daysInMonth(y, m)) return { ok: false, field: 'day', error: 'That date does not exist.' };

  const birth = { year: y, month: m, day: d };
  const future =
    y > today.year || (y === today.year && (m > today.month || (m === today.month && d > today.day)));
  if (future) return { ok: false, field: 'date', error: 'Date of birth cannot be in the future.' };

  const iso = `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  return { ok: true, iso, age: ageOn(birth, today) };
}

/* --- Exclusive selections ------------------------------------------------------ */

/**
 * Toggles one value in a multi-select that has a mutually exclusive answer
 * ("None", "None known"). Choosing the exclusive answer clears every other
 * choice; choosing any other answer clears the exclusive one.
 */
export function toggleExclusive<Value extends string>(selected: readonly Value[], value: Value, exclusive: Value): Value[] {
  if (value === exclusive) return selected.includes(exclusive) ? [] : [exclusive];
  const withoutExclusive = selected.filter((item) => item !== exclusive);
  return withoutExclusive.includes(value)
    ? withoutExclusive.filter((item) => item !== value)
    : [...withoutExclusive, value];
}

export function toggleValue<Value extends string>(selected: readonly Value[], value: Value): Value[] {
  return selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value];
}

export function episodeWasReported(episode: PreviousEpisode | null): boolean {
  return episode === 'yes_once' || episode === 'yes_multiple';
}

/* --- Steps --------------------------------------------------------------------- */

export type IntakeStep = 'basics' | 'history' | 'background';

export const INTAKE_STEPS: readonly { id: IntakeStep; title: string }[] = [
  { id: 'basics', title: 'About you' },
  { id: 'history', title: 'Access and history' },
  { id: 'background', title: 'Medical background' },
];

export type StepErrors = Partial<Record<string, string>>;

export function validateStep(step: IntakeStep, draft: PatientContextDraft, today: CalendarDay = localToday()): StepErrors {
  const errors: StepErrors = {};
  if (step === 'basics') {
    const dob = validateDateOfBirth(draft.dateOfBirthParts, today);
    if (dob.ok === false) errors.dateOfBirth = dob.error;
    if (!draft.sexForAssessment) errors.sexForAssessment = 'Choose the sex to use for this assessment.';
  }
  if (step === 'history') {
    if (draft.accessibilityNeeds.length === 0) {
      errors.accessibilityNeeds = 'Choose None, or the needs that apply.';
    }
    if (draft.existingConditions.length === 0) {
      errors.existingConditions = 'Choose None known, or the conditions that apply.';
    }
    if (!draft.previousSimilarEpisode) errors.previousSimilarEpisode = 'Choose an answer.';
    if (episodeWasReported(draft.previousSimilarEpisode) && !draft.previousExplanationKnown) {
      errors.previousExplanationKnown = 'Choose an answer.';
    }
  }
  if (step === 'background') {
    if (!draft.allergyStatus) errors.allergyStatus = 'Choose an answer.';
    if (draft.allergyStatus === 'known' && draft.allergies.length === 0) {
      errors.allergies = 'Choose at least one allergy type.';
    }
    if (!draft.medicationStatus) errors.medicationStatus = 'Choose an answer.';
    if (draft.medicationStatus === 'known' && !draft.medications.some((entry) => entry.trim())) {
      errors.medications = 'Enter at least one medication, or choose Not sure.';
    }
    if (!draft.surgeryStatus) errors.surgeryStatus = 'Choose an answer.';
  }
  return errors;
}

/**
 * The errors a patient should see. An answer is judged only after the patient
 * has tried to continue, or has been to that answer and left it unfinished, so
 * no step opens with its fields already marked wrong.
 */
export function visibleErrors(errors: StepErrors, attempted: boolean, touched: ReadonlySet<string>): StepErrors {
  if (attempted) return errors;
  return Object.fromEntries(Object.entries(errors).filter(([key]) => touched.has(key)));
}

/** Drops an Other answer's text once Other is no longer chosen. */
export function keepOtherText(selected: readonly string[], text: string, other = 'other'): string {
  return selected.includes(other) ? text : '';
}

const trimmed = (value: string): string | undefined => {
  const text = value.trim();
  return text ? text : undefined;
};

/**
 * The completed context, with every dependent answer dropped when its parent
 * answer no longer allows it. Returns null while any step is incomplete.
 */
export function finalizePatientContext(draft: PatientContextDraft, today: CalendarDay = localToday()): PatientContext | null {
  for (const step of INTAKE_STEPS) {
    if (Object.keys(validateStep(step.id, draft, today)).length > 0) return null;
  }
  const dob = validateDateOfBirth(draft.dateOfBirthParts, today);
  const age = dob.ok ? dob.age : null;
  if (age === null || !draft.sexForAssessment || !draft.previousSimilarEpisode) return null;
  // An under-18 assessment never reaches the questionnaire without the adult-presence acknowledgement.
  if (age < 18 && !draft.underEighteenAcknowledged) return null;
  if (!draft.allergyStatus || !draft.medicationStatus || !draft.surgeryStatus) return null;

  const episode = episodeWasReported(draft.previousSimilarEpisode);
  const explanationGiven = episode && draft.previousExplanationKnown === 'yes';

  return {
    assessmentName: trimmed(draft.assessmentName),
    derivedAge: age,
    sexForAssessment: draft.sexForAssessment,
    questionVoice: questionVoiceFor(age, draft.reporter),
    accessibilityNeeds: [...draft.accessibilityNeeds],
    accessibilityOther: draft.accessibilityNeeds.includes('other') ? trimmed(draft.accessibilityOther) : undefined,
    existingConditions: [...draft.existingConditions],
    conditionOther: draft.existingConditions.includes(CONDITION_OTHER) ? trimmed(draft.conditionOther) : undefined,
    previousSimilarEpisode: draft.previousSimilarEpisode,
    previousExplanationKnown: episode ? draft.previousExplanationKnown ?? undefined : undefined,
    previousExplanation: explanationGiven ? trimmed(draft.previousExplanation) : undefined,
    allergyStatus: draft.allergyStatus,
    allergies: draft.allergyStatus === 'known' ? [...draft.allergies] : [],
    allergyOther:
      draft.allergyStatus === 'known' && draft.allergies.includes(ALLERGY_OTHER) ? trimmed(draft.allergyOther) : undefined,
    medicationStatus: draft.medicationStatus,
    medications:
      draft.medicationStatus === 'known' ? draft.medications.map((entry) => entry.trim()).filter(Boolean) : [],
    surgeryStatus: draft.surgeryStatus,
    surgeries: draft.surgeryStatus === 'yes' ? trimmed(draft.surgeries) : undefined,
  };
}

/** The locked voice for a finished context, falling back to the age rule. */
export function voiceOf(context: Pick<PatientContext, 'derivedAge' | 'questionVoice'>): QuestionVoice {
  return context.questionVoice ?? questionVoiceFor(context.derivedAge);
}

/* --- Presentation -------------------------------------------------------------- */

export function optionLabel(options: readonly Option[], value: string | null | undefined): string {
  return options.find((option) => option.value === value)?.label ?? '';
}

/** Readable lines for the local context summary. The name is not included. */
export function summarizePatientContext(context: PatientContext): { label: string; value: string }[] {
  const list = (options: readonly Option[], values: readonly string[], other?: string) =>
    values
      .map((value) => (value === 'other' && other ? `${optionLabel(options, value)}: ${other}` : optionLabel(options, value)))
      .join(', ');

  const lines = [
    { label: 'Age', value: String(context.derivedAge) },
    { label: 'Sex for this assessment', value: optionLabel(SEX_OPTIONS, context.sexForAssessment) },
    { label: 'Accessibility needs', value: list(ACCESSIBILITY_OPTIONS, context.accessibilityNeeds, context.accessibilityOther) },
    {
      label: 'Existing conditions',
      value: context.existingConditions.length ? list(CONDITION_OPTIONS, context.existingConditions, context.conditionOther) : 'Not answered',
    },
    { label: 'Previous similar episode', value: optionLabel(EPISODE_OPTIONS, context.previousSimilarEpisode) },
  ];
  if (context.previousExplanationKnown) {
    lines.push({
      label: 'Earlier explanation given',
      value: context.previousExplanation
        ? `${optionLabel(EXPLANATION_OPTIONS, context.previousExplanationKnown)}: ${context.previousExplanation}`
        : optionLabel(EXPLANATION_OPTIONS, context.previousExplanationKnown),
    });
  }
  lines.push({
    label: 'Allergies',
    value:
      context.allergyStatus === 'known'
        ? list(ALLERGY_OPTIONS, context.allergies, context.allergyOther)
        : optionLabel(ALLERGY_STATUS_OPTIONS, context.allergyStatus),
  });
  lines.push({
    label: 'Medications',
    value: context.medicationStatus === 'known' ? context.medications.join(', ') : optionLabel(MEDICATION_STATUS_OPTIONS, context.medicationStatus),
  });
  lines.push({
    label: 'Previous surgery or procedure',
    value: context.surgeries ? `Yes: ${context.surgeries}` : optionLabel(SURGERY_OPTIONS, context.surgeryStatus),
  });
  return lines;
}
