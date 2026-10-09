/**
 * Referral priority notes (PENDING CLINICAL REVIEW).
 *
 * WHY THIS IS NOT AN R3 RULE
 *
 * R3 has three outcomes: routine, urgent ("contact a local urgent medical
 * service now") and emergency (Call 112). NICE NG12 asks for something
 * between routine and urgent: a prompt specialist referral, which the GP or
 * dentist arranges, not same-day care. NHS Breast lumps labels the same
 * finding "non-urgent advice" for the patient. Sending these through R3 would
 * either overstate them as urgent or hide them as routine, so they are a
 * separate, explicitly labelled note: the clinician-facing handoff cites the
 * recommendation, and the patient is told only that guidance advises prompt
 * assessment. Nothing here names or suggests a diagnosis.
 *
 * Every note reads only answers the patient gave and cites the recommendation
 * it encodes, read directly from the NICE page on 2026-10-08. A note never
 * changes a route, a safety outcome or the question order.
 */
import { COVERAGE_SOURCE_IDS, type RegionAssessmentContext } from '../body-explorer/clinical-coverage.ts';
import { answerIncludes, INTAKE_QUESTION_IDS, type IntakeAnswer } from './intake-questions.ts';

export interface ReferralPriorityNote {
  id: string;
  /** Clinician-facing: the recommendation that applies. Cites, never diagnoses. */
  clinicianText: string;
  sourceIds: readonly string[];
  reviewStatus: 'PENDING CLINICAL REVIEW';
}

/** What the patient reads. One sentence, the same for every note. */
export const PATIENT_PRIORITY_TEXT =
  'Published guidance advises that this is assessed promptly by the team you are referred to. Please do not delay the appointment.';

const Q = INTAKE_QUESTION_IDS;
const NG12 = [COVERAGE_SOURCE_IDS.niceSuspectedCancer];

function note(id: string, clinicianText: string, sourceIds: readonly string[] = NG12): ReferralPriorityNote {
  return { id, clinicianText, sourceIds, reviewStatus: 'PENDING CLINICAL REVIEW' };
}

export function referralPriorityNotes(
  context: RegionAssessmentContext | null | undefined,
  answers: readonly IntakeAnswer[],
): readonly ReferralPriorityNote[] {
  if (!context) return [];
  const has = (questionId: string, ...optionIds: string[]) => answerIncludes(answers, questionId, optionIds);
  const adult = context.patientMode === 'adult';
  const age = context.age;
  const notes: ReferralPriorityNote[] = [];

  /* Breast (NG12 1.4.1 to 1.4.3). */
  if (adult && context.bodyRegionId === 'chest') {
    if (has(Q.breastFeatures, 'breast-lump')) {
      notes.push(age >= 30
        ? note('ng12-1.4.1-breast-lump', 'NICE NG12 1.4.1 applies: an unexplained breast lump at age 30 or over (suspected cancer pathway referral).')
        : note('ng12-1.4.3-breast-lump-under-30', 'NICE NG12 1.4.3 applies: an unexplained breast lump under age 30 (consider non-urgent referral).'));
    }
    if (age >= 50 && has(Q.breastFeatures, 'nipple-discharge', 'nipple-inward')) {
      notes.push(note('ng12-1.4.1-nipple', 'NICE NG12 1.4.1 applies: discharge or retraction in one nipple at age 50 or over (suspected cancer pathway referral).'));
    }
    if (has(Q.breastFeatures, 'dimpled') || (age >= 30 && has(Q.breastFeatures, 'armpit-lump'))) {
      notes.push(note('ng12-1.4.2-skin-axilla', 'NICE NG12 1.4.2 applies: breast skin changes, or an unexplained armpit lump at age 30 or over (consider a suspected cancer pathway referral).'));
    }
  }

  /* Mouth (NG12 1.8.2, 1.8.3). */
  if (has(Q.mouthDetail, 'ulcer') && has(Q.mouthDuration, 'over-three-weeks')) {
    notes.push(note('ng12-1.8.2-oral-ulcer', 'NICE NG12 1.8.2 applies: unexplained ulceration in the mouth lasting more than 3 weeks (consider a suspected cancer pathway referral).', [...NG12, COVERAGE_SOURCE_IDS.nhsMouthCancer]));
  }
  if (has(Q.mouthDetail, 'patch', 'lump') || (context.faceSubregionId === 'mouth' && context.concernId === 'swelling-lump')) {
    notes.push(note('ng12-1.8.3-oral-lesion', 'NICE NG12 1.8.3 applies: a lump on the lip or in the mouth, or a red or white patch (consider an urgent referral for assessment by a dentist).', [...NG12, COVERAGE_SOURCE_IDS.nhsMouthCancer]));
  }

  /* Neck lump (NG12 1.8.1, 1.8.2) and hoarseness (1.8.1). */
  const neck = context.bodyRegionId === 'neck' || context.faceSubregionId === 'upper-neck';
  if (neck && context.concernId === 'swelling-lump' && has(Q.swellingDuration, 'two-to-six-weeks', 'over-six-weeks')) {
    notes.push(age >= 45
      ? note('ng12-1.8.1-neck-lump', 'NICE NG12 1.8.1 and 1.8.2 apply: an unexplained neck lump that has persisted, at age 45 or over (consider a suspected cancer pathway referral).')
      : note('ng12-1.8.2-neck-lump', 'NICE NG12 1.8.2 applies: a persistent unexplained neck lump (consider a suspected cancer pathway referral).'));
  }
  if (age >= 45 && has(Q.throatDetail, 'hoarse') && has(Q.throatDuration, 'over-three-weeks')) {
    notes.push(note('ng12-1.8.1-hoarseness', 'NICE NG12 1.8.1 applies: persistent unexplained hoarseness at age 45 or over (consider a suspected cancer pathway referral).'));
  }

  /* A growing lump elsewhere in an adult (NG12 1.11.4). */
  if (adult && !neck && context.bodyRegionId !== 'chest' && context.concernId === 'swelling-lump' && has(Q.swellingDetail, 'growing')) {
    notes.push(note('ng12-1.11.4-growing-lump', 'NICE NG12 1.11.4 applies: an unexplained lump that is increasing in size in an adult (consider an urgent direct-access ultrasound).'));
  }

  return notes;
}
