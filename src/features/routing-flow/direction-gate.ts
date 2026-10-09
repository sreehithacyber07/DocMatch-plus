/**
 * The clinical direction gate.
 *
 * WHAT THIS IS, AND WHAT IT DELIBERATELY IS NOT
 *
 * The R1 engine carries six calibrated belief keys (cardiology, pulmonology,
 * neurology, gastroenterology, orthopedics, dermatology) and approved
 * P(answer | specialty) tables for exactly four complaints. ENT, Obstetrics and
 * Gynaecology, Urology and Ophthalmology are not keys in that vector and have
 * no calibrated likelihoods, so no arrangement of the Bayesian layer can ever
 * produce them. That is the whole reason a locally otologic ear pattern used to
 * finish at General Medicine: not a missing weight, a missing destination.
 *
 * Inventing likelihoods for them would manufacture medical accuracy. So this
 * module takes the other route that is honestly available: a DETERMINISTIC,
 * SOURCE-BACKED ELIGIBILITY GATE.
 *
 *   It emits "the collected answers satisfy a published referral criterion for
 *   this service", never "this specialty is N% likely".
 *
 * Every criterion below names the patient-reported answer that satisfies it and
 * the public clinical page that states the criterion. Nothing here produces a
 * probability, touches the belief vector, changes a threshold or alters a
 * safety rule. A satisfied gate is reported beside R3 urgency, never instead of
 * it, and a hard stop always wins.
 *
 * WHY A SET CAN FAIL
 *
 * A set that applies anatomically but whose criteria are not met does NOT fall
 * through to the named specialty. It reports its unanswered discriminators so
 * the interview can keep asking, and if nothing is left to ask, the run ends at
 * the parent service with a named reason. Location alone never routes.
 */
import { COVERAGE_SOURCE_IDS, type RegionAssessmentContext } from '../body-explorer/clinical-coverage.ts';
import {
  answerIncludes,
  clarifiedContext,
  INTAKE_QUESTION_IDS,
  intakeQuestionsFor,
  selectedOptionIds,
  type IntakeAnswer,
  type ShowCondition,
} from './intake-questions.ts';

/** Registry ids this gate can support. Each must exist in the specialty registry. */
export type DirectionId =
  | 'otorhinolaryngology'
  | 'obstetrics-gynaecology'
  | 'urology'
  | 'medical-gastroenterology'
  | 'ophthalmology'
  | 'dermatology'
  | 'orthopaedics'
  | 'cardiology'
  | 'respiratory-medicine'
  | 'neurology'
  | 'dentistry'
  | 'clinical-immunology-rheumatology'
  | 'general-surgery'
  | 'vascular-surgery'
  | 'paediatrics';

/**
 * Why a run ended at a parent service.
 *
 * `DEFAULT`, `UNKNOWN` and `NO_MATCH` are deliberately absent: a fallback must
 * always be able to say which of these applied.
 */
export type FallbackReason =
  | 'TRUE_MULTISYSTEM_AMBIGUITY'
  | 'INSUFFICIENT_SUPPORTED_EVIDENCE'
  | 'NO_VALIDATED_NARROW_ROUTE'
  | 'QUESTION_BURDEN_LIMIT_REACHED'
  | 'FACILITY_ROUTE_UNAVAILABLE'
  | 'EXCLUDED_BY_COMPETING_PATTERN'
  | 'SPECIALTY_EVIDENCE_CALIBRATION_REQUIRED';

/**
 * Patient-facing wording for each reason. Plain language, no engineering
 * terms: the internal reason stays on the outcome for the audit trail and the
 * clinician view, and the patient reads what it means for them.
 */
export const FALLBACK_REASON_TEXT: Readonly<Record<FallbackReason, string>> = {
  TRUE_MULTISYSTEM_AMBIGUITY:
    'The answers describe more than one body system, so one broad assessment is the clearest first step.',
  INSUFFICIENT_SUPPORTED_EVIDENCE:
    'The answers did not match the published criteria for a narrower service.',
  NO_VALIDATED_NARROW_ROUTE:
    'There are no published criteria that send this kind of concern to a narrower service from symptoms alone.',
  QUESTION_BURDEN_LIMIT_REACHED:
    'Enough has been asked for a first assessment; the care team can take it from here.',
  FACILITY_ROUTE_UNAVAILABLE:
    'The pattern matches a service that sees adults, so a children\'s service is the right starting point.',
  EXCLUDED_BY_COMPETING_PATTERN:
    'The answers point away from the narrower service usually linked with this area.',
  SPECIALTY_EVIDENCE_CALIBRATION_REQUIRED:
    'The answers did not separate one narrower service clearly enough to recommend it.',
};

/** One published referral criterion, tied to the answer that satisfies it. */
export interface DirectionCriterion {
  id: string;
  /** Patient-facing wording for the result screen. No disease names. */
  label: string;
  questionId: string;
  optionIds: readonly string[];
  sourceIds: readonly string[];
  /** The published wording this criterion encodes. */
  sourceCriterion: string;
  /**
   * The same fact recorded under another question: an approved R1 answer that
   * asks exactly what this criterion reads. When any of them is answered, the
   * criterion is answered, so the intake question is never asked on top of it.
   */
  alternates?: readonly { questionId: string; optionIds: readonly string[] }[];
}

export interface DirectionCriteriaSet {
  directionId: DirectionId;
  /** The anatomical branch this set can be considered in at all. */
  appliesWhen: (context: RegionAssessmentContext, answers: readonly IntakeAnswer[]) => boolean;
  /**
   * Whether an under-18 run may be sent to this direction.
   *
   *   shared-service  the same clinical service sees children, and the
   *                   source criteria are written for adults and children
   *                   alike. NHS Earache and NHS Sinusitis both address a
   *                   child directly, and NHS Eye pain does not restrict by
   *                   age, so a child meeting them reaches the same service.
   *   adult-only      NBEMS lists separate paediatric disciplines for this
   *                   area and none is enabled here. A child who meets the
   *                   criteria therefore goes to Paediatrics with
   *                   FACILITY_ROUTE_UNAVAILABLE, never to an adult service.
   *   pediatric-only  a paediatric criterion: the source sends a child with
   *                   this pattern to paediatric expertise. Never evaluated
   *                   for an adult.
   */
  pediatricPolicy: 'shared-service' | 'adult-only' | 'pediatric-only';
  /**
   * A parent-service set. Its direction is the population parent service
   * (Paediatrics) and it is supported only when no narrower set is supported
   * or still reachable, so it can never pre-empt a specialist route that more
   * questions could establish.
   */
  parentService?: boolean;
  supporting: readonly DirectionCriterion[];
  /** Satisfying any of these points away from the direction. */
  excluding: readonly DirectionCriterion[];
  /**
   * How many distinct supporting criteria must be satisfied. Never fewer
   * than two for a narrower service: one answer is never a referral. A
   * parent-service set may use one, because the source names paediatric
   * expertise for that single feature and Paediatrics is not a narrower
   * service.
   */
  minimumSupporting: number;
  /**
   * Questions that MUST each contribute a satisfied criterion, whatever the
   * count says. This is how a set names the answer its published criterion
   * actually turns on, so a patient cannot reach a service by restating the
   * same thing twice.
   */
  requiredQuestionIds?: readonly string[];
  rationale: string;
}

const EAR_SUBREGIONS = ['patient-right-ear', 'patient-left-ear'];
const EYE_SUBREGIONS = ['patient-right-eye', 'patient-left-eye'];

const isEar = (context: RegionAssessmentContext) =>
  context.bodyRegionId === 'face' && EAR_SUBREGIONS.includes(context.faceSubregionId ?? '');
const isEye = (context: RegionAssessmentContext) =>
  context.bodyRegionId === 'face' && EYE_SUBREGIONS.includes(context.faceSubregionId ?? '');
const isNose = (context: RegionAssessmentContext) =>
  context.bodyRegionId === 'face' && context.faceSubregionId === 'nose';
const isLowerAbdominal = (context: RegionAssessmentContext) =>
  context.bodyRegionId === 'lower-abdomen' || context.bodyRegionId === 'pelvis';

/** Whether the lower-abdominal associated-system answer names one of these. */
function associatedSystemIs(answers: readonly IntakeAnswer[], ...optionIds: readonly string[]): boolean {
  return answerIncludes(answers, INTAKE_QUESTION_IDS.lowerAssociatedSystem, optionIds);
}

const isPediatric = (context: RegionAssessmentContext) => context.patientMode === 'pediatric';
const isUnderFive = (context: RegionAssessmentContext) =>
  context.pediatricAgeBand === 'infant-under-one' || context.pediatricAgeBand === 'young-child';
const isThroat = (context: RegionAssessmentContext) => context.complaintId === 'throat-concern';
const MUSCULOSKELETAL_REGION = /(shoulder|arm|elbow|forearm|wrist|hand|hip|thigh|knee|leg|ankle|foot|back)/;
const isMusculoskeletal = (context: RegionAssessmentContext) => MUSCULOSKELETAL_REGION.test(context.bodyRegionId);
const ORAL_FACE_REGIONS = new Set<string>(['mouth', 'patient-right-jaw', 'patient-left-jaw', 'chin']);
const isOral = (context: RegionAssessmentContext) =>
  context.bodyRegionId === 'face' && ORAL_FACE_REGIONS.has(context.faceSubregionId ?? '');
const isLowerLimbVascular = (context: RegionAssessmentContext) =>
  /(thigh|knee|lower-leg|ankle|foot)/.test(context.bodyRegionId) && ['swelling-lump', 'skin-change', 'pain'].includes(context.concernId);
const isAbdominal = (context: RegionAssessmentContext) =>
  isLowerAbdominal(context) || context.bodyRegionId === 'upper-abdomen';

/**
 * Whether reproductive physiology questions are eligible at all.
 *
 * Adult, and female sex for assessment or an explicitly stated neutral
 * context. Never inferred from a label, from artwork or from the body region
 * alone. A male run can never reach this, and neither can a child.
 */
export function reproductiveBranchEligible(context: RegionAssessmentContext): boolean {
  if (!isLowerAbdominal(context)) return false;
  if (context.patientMode !== 'adult') return false;
  if (context.sexForAssessment !== 'female' && context.sexForAssessment !== 'intersex_or_variation') return false;
  return true;
}

/* -------------------------------------------------------------------------
   The criteria sets.
   ------------------------------------------------------------------------- */

export const DIRECTION_CRITERIA_SETS: readonly DirectionCriteriaSet[] = [
  /* --- ENT, otologic ear pattern ---------------------------------------- */
  {
    directionId: 'otorhinolaryngology',
    appliesWhen: isEar,
    pediatricPolicy: 'shared-service',
    minimumSupporting: 2,
    rationale:
      'The NHS earache page names discharge, hearing change, persistence beyond two to three days and repeated episodes as the features that take earache to a clinician, and separately names toothache and pain on swallowing as pain referred from outside the ear. Two local features with no referred pattern is what distinguishes an otologic presentation from ear pain caused elsewhere.',
    supporting: [
      {
        id: 'ent-ear-discharge',
        label: 'Fluid or bleeding from the ear',
        questionId: INTAKE_QUESTION_IDS.earAssociated,
        optionIds: ['discharge'],
        sourceIds: [COVERAGE_SOURCE_IDS.nhsEarache, COVERAGE_SOURCE_IDS.nhsEarInfections],
        sourceCriterion: 'NHS Earache lists fluid coming from the ear among the features needing prompt advice.',
      },
      {
        id: 'ent-ear-hearing-change',
        label: 'A change in hearing',
        questionId: INTAKE_QUESTION_IDS.earAssociated,
        optionIds: ['hearing', 'ringing'],
        sourceIds: [COVERAGE_SOURCE_IDS.nhsEarache, COVERAGE_SOURCE_IDS.nhsHearingLoss, COVERAGE_SOURCE_IDS.nhsTinnitus],
        sourceCriterion: 'NHS Earache lists hearing loss or a change in hearing among the features needing prompt advice.',
      },
      {
        id: 'ent-ear-local-detail',
        label: 'The change is inside the ear itself',
        questionId: INTAKE_QUESTION_IDS.earDetail,
        optionIds: ['inside', 'reduced-hearing', 'ringing', 'pressure', 'clear-fluid', 'pus-like', 'blood', 'mixed'],
        sourceIds: [COVERAGE_SOURCE_IDS.nhsEarInfections, COVERAGE_SOURCE_IDS.nhsHearingLoss],
        sourceCriterion: 'NHS Ear infections and Hearing loss describe these as changes arising in the ear rather than around it.',
      },
      {
        id: 'ent-ear-persistence',
        label: 'It has lasted or keeps coming back',
        questionId: INTAKE_QUESTION_IDS.earPersistence,
        optionIds: ['over-three-days', 'two-weeks-plus', 'recurrent'],
        sourceIds: [COVERAGE_SOURCE_IDS.nhsEarache, COVERAGE_SOURCE_IDS.nhmImnci],
        sourceCriterion: 'NHS Earache advises seeking advice after more than two to three days, and seeing a GP for repeated earache; IMNCI treats ear discharge for 14 days or more as a separate, longer-standing problem.',
      },
      {
        id: 'ent-ear-observed-discharge',
        label: 'Fluid seen coming from the ear',
        questionId: INTAKE_QUESTION_IDS.pediatricEarObservation,
        optionIds: ['discharge'],
        sourceIds: [COVERAGE_SOURCE_IDS.nhsEarInfections, COVERAGE_SOURCE_IDS.nhmImnci],
        sourceCriterion: 'NHS Ear infections and IMNCI both treat discharge from a child\'s ear as a sign to be assessed.',
      },
      {
        id: 'ent-ear-observed-hearing',
        label: 'Not reacting to some sounds',
        questionId: INTAKE_QUESTION_IDS.pediatricEarObservation,
        optionIds: ['sound-response'],
        sourceIds: [COVERAGE_SOURCE_IDS.nhsEarache, COVERAGE_SOURCE_IDS.nhsHearingLoss],
        sourceCriterion: 'NHS Earache lists a change in hearing among the features needing prompt advice.',
      },
    ],
    excluding: [
      {
        id: 'ent-ear-referred-dental',
        label: 'The pain is linked with the teeth or jaw',
        questionId: INTAKE_QUESTION_IDS.earAssociated,
        optionIds: ['jaw-tooth'],
        sourceIds: [COVERAGE_SOURCE_IDS.nhsEarache, COVERAGE_SOURCE_IDS.nhsTmd],
        sourceCriterion: 'NHS Earache attributes ear pain with toothache to a dental rather than an otologic cause.',
      },
      {
        id: 'ent-ear-referred-vestibular',
        label: 'The main change is balance rather than the ear',
        questionId: INTAKE_QUESTION_IDS.earDetail,
        optionIds: ['spinning', 'unsteady'],
        sourceIds: [COVERAGE_SOURCE_IDS.nhsVertigo],
        sourceCriterion: 'NHS Vertigo treats a spinning or unsteady presentation as a balance assessment, which R3 screens separately.',
      },
    ],
  },

  /* --- ENT, sinonasal pattern -------------------------------------------- */
  {
    directionId: 'otorhinolaryngology',
    // Also adult facial pain described as pressure with a blocked or runny nose: NHS Sinusitis
    // names pain around the cheeks, eyes or forehead as a sinus symptom, wherever it was tapped.
    appliesWhen: (context, answers) => (isNose(context) && context.concernId !== 'injury')
      || (context.complaintId === 'face-general-concern' && context.concernId === 'pain' && context.faceSubregionId !== 'upper-neck'
        && answerIncludes(answers, INTAKE_QUESTION_IDS.facePainPattern, ['pressure-nasal'])),
    pediatricPolicy: 'shared-service',
    minimumSupporting: 2,
    requiredQuestionIds: [INTAKE_QUESTION_IDS.nosePersistence],
    rationale:
      'The NHS sinusitis page states the ENT referral criteria in its own words: still having sinusitis after three months of treatment, repeated episodes, or symptoms on only one side of the face. Those three answers are collected directly, so this set encodes a published referral rule rather than an estimate.',
    supporting: [
      {
        id: 'ent-nose-one-sided',
        label: 'Symptoms on only one side of the face',
        questionId: INTAKE_QUESTION_IDS.noseAssociated,
        optionIds: ['one-sided'],
        sourceIds: [COVERAGE_SOURCE_IDS.nhsSinusitis],
        sourceCriterion: 'NHS Sinusitis names "only have symptoms on 1 side of your face" as an ENT referral criterion.',
      },
      {
        id: 'ent-nose-recurrent',
        label: 'It keeps coming back',
        questionId: INTAKE_QUESTION_IDS.noseAssociated,
        optionIds: ['recurrent'],
        sourceIds: [COVERAGE_SOURCE_IDS.nhsSinusitis],
        sourceCriterion: 'NHS Sinusitis names "keep getting sinusitis" as an ENT referral criterion.',
      },
      {
        id: 'ent-nose-persistence',
        label: 'It has continued for many weeks',
        questionId: INTAKE_QUESTION_IDS.nosePersistence,
        optionIds: ['three-weeks-to-three-months', 'over-three-months'],
        sourceIds: [COVERAGE_SOURCE_IDS.nhsSinusitis],
        sourceCriterion: 'NHS Sinusitis names three weeks of self-treatment and three months of treatment as the escalation and ENT referral points.',
      },
      {
        id: 'ent-nose-sinonasal-pattern',
        label: 'Blockage, discharge or a change in smell',
        questionId: INTAKE_QUESTION_IDS.noseDetail,
        optionIds: ['blocked', 'runny', 'smell', 'mixed'],
        sourceIds: [COVERAGE_SOURCE_IDS.nhsSinusitis],
        sourceCriterion: 'NHS Sinusitis lists a blocked or runny nose and a reduced sense of smell as the main sinonasal symptoms.',
      },
      {
        id: 'ent-face-sinonasal-pressure',
        label: 'Facial pressure with a blocked or runny nose',
        questionId: INTAKE_QUESTION_IDS.facePainPattern,
        optionIds: ['pressure-nasal'],
        sourceIds: [COVERAGE_SOURCE_IDS.nhsSinusitis],
        sourceCriterion: 'NHS Sinusitis lists pain and pressure around the cheeks, eyes or forehead with a blocked or runny nose as sinus symptoms.',
      },
      {
        id: 'ent-nose-observed-sinonasal',
        label: 'A blocked or runny nose',
        questionId: INTAKE_QUESTION_IDS.pediatricNoseObservation,
        optionIds: ['blocked', 'runny'],
        sourceIds: [COVERAGE_SOURCE_IDS.nhsSinusitis],
        sourceCriterion: 'NHS Sinusitis lists a blocked or runny nose as the main sinonasal symptoms, in children as in adults.',
      },
    ],
    excluding: [
      {
        id: 'ent-nose-bleeding-burden',
        label: 'The main concern is bleeding',
        questionId: INTAKE_QUESTION_IDS.nosebleedAssociated,
        optionIds: ['weak-dizzy', 'breathing', 'head-injury', 'blood-thinner', 'swallowed'],
        sourceIds: [COVERAGE_SOURCE_IDS.nhsNosebleed],
        sourceCriterion: 'NHS Nosebleed treats bleeding burden and anticoagulation as an acute assessment, which R3 screens separately.',
      },
    ],
  },

  /* --- Obstetrics and Gynaecology ---------------------------------------- */
  {
    directionId: 'obstetrics-gynaecology',
    appliesWhen: (context, answers) =>
      reproductiveBranchEligible(context) &&
      (context.concernId === 'reproductive-pelvic-change' || associatedSystemIs(answers, 'reproductive', 'explicit-pelvic')),
    pediatricPolicy: 'adult-only',
    minimumSupporting: 2,
    requiredQuestionIds: [INTAKE_QUESTION_IDS.reproductiveTiming],
    rationale:
      'The NHS page on bleeding between periods or after sex states that unusual vaginal bleeding is always checked, and the heavy periods page describes the investigation and onward referral a general practitioner arranges. A stated reproductive branch plus a specific bleeding, cycle or discharge pattern is a gynaecologic presentation; a stated reproductive branch on its own is not.',
    supporting: [
      {
        id: 'obgyn-branch-selected',
        label: 'A pelvic or reproductive change was described',
        questionId: INTAKE_QUESTION_IDS.reproductiveDetail,
        optionIds: ['bleeding', 'discharge', 'cycle', 'sexual-pain', 'pregnancy', 'genital-change', 'pelvic-function'],
        sourceIds: [COVERAGE_SOURCE_IDS.nhsPelvicPain],
        sourceCriterion: 'NHS Pelvic pain groups these as the reproductive and pelvic presentations assessed together.',
      },
      {
        id: 'obgyn-bleeding-pattern',
        label: 'Bleeding outside the usual pattern',
        questionId: INTAKE_QUESTION_IDS.reproductiveTiming,
        optionIds: ['between-periods', 'after-sex', 'after-menopause', 'heavier-than-usual'],
        sourceIds: [COVERAGE_SOURCE_IDS.nhsAbnormalVaginalBleeding, COVERAGE_SOURCE_IDS.nhsHeavyPeriods],
        sourceCriterion: 'NHS advises that bleeding between periods or after sex is always checked, and that heavy bleeding is investigated and may be referred on.',
      },
      {
        id: 'obgyn-cycle-relation',
        label: 'The symptom follows the cycle',
        questionId: INTAKE_QUESTION_IDS.reproductiveTiming,
        optionIds: ['with-periods'],
        sourceIds: [COVERAGE_SOURCE_IDS.nhsPelvicPain, COVERAGE_SOURCE_IDS.nhsHeavyPeriods],
        sourceCriterion: 'NHS Pelvic pain separates cycle-related pelvic pain from pain unrelated to the cycle.',
      },
      {
        id: 'obgyn-associated-system',
        label: 'The associated change is reproductive rather than bowel or urinary',
        questionId: INTAKE_QUESTION_IDS.lowerAssociatedSystem,
        optionIds: ['reproductive', 'explicit-pelvic'],
        sourceIds: [COVERAGE_SOURCE_IDS.nhsPelvicPain],
        sourceCriterion: 'NHS Pelvic pain distinguishes the reproductive presentation from the bowel and urinary ones at the same site.',
      },
    ],
    excluding: [
      {
        id: 'obgyn-bowel-dominant',
        label: 'The dominant change is bowel or urinary',
        questionId: INTAKE_QUESTION_IDS.lowerAssociatedSystem,
        optionIds: ['bowel', 'urinary'],
        sourceIds: [COVERAGE_SOURCE_IDS.nhsPelvicPain],
        sourceCriterion: 'NHS Pelvic pain routes a predominantly bowel or urinary presentation down those pathways instead.',
      },
    ],
  },

  /* --- Urology ------------------------------------------------------------ */
  {
    directionId: 'urology',
    // The urinary branch is asked at the upper abdomen too; the criteria are about the urine, not the tap.
    appliesWhen: (context, answers) =>
      isAbdominal(context) &&
      (context.concernId === 'urinary-change' || associatedSystemIs(answers, 'urinary')),
    pediatricPolicy: 'adult-only',
    minimumSupporting: 2,
    rationale:
      'The NHS blood in urine page states that visible blood is checked urgently and may be referred to a specialist for tests, and the UTI page separates ordinary lower urinary symptoms from repeated infection and from difficulty passing urine. A single episode of burning is not a urological referral; visible blood, obstruction or repeated infection is what the sources escalate.',
    supporting: [
      {
        id: 'urology-visible-blood',
        label: 'Blood when passing urine',
        questionId: INTAKE_QUESTION_IDS.urinaryDetail,
        optionIds: ['blood'],
        sourceIds: [COVERAGE_SOURCE_IDS.nhsUrinaryTractInfection],
        sourceCriterion: 'NHS Blood in urine states it must be checked and may lead to specialist referral for tests.',
      },
      {
        id: 'urology-obstruction',
        label: 'Difficulty passing urine',
        questionId: INTAKE_QUESTION_IDS.urinaryDetail,
        optionIds: ['difficulty'],
        sourceIds: [COVERAGE_SOURCE_IDS.nhsUrinaryTractInfection],
        sourceCriterion: 'NHS UTI separates difficulty passing urine from ordinary frequency and urgency.',
      },
      {
        id: 'urology-recurrent',
        label: 'It keeps coming back',
        questionId: INTAKE_QUESTION_IDS.urinaryPattern,
        optionIds: ['recurrent'],
        sourceIds: [COVERAGE_SOURCE_IDS.nhsUrinaryTractInfection],
        sourceCriterion: 'NHS UTI treats repeated infection differently from a single episode.',
      },
      {
        id: 'urology-stream-change',
        label: 'A change in the urinary stream or emptying',
        questionId: INTAKE_QUESTION_IDS.urinaryPattern,
        optionIds: ['poor-stream', 'incomplete-emptying'],
        sourceIds: [COVERAGE_SOURCE_IDS.nhsUrinaryTractInfection],
        sourceCriterion: 'NHS UTI describes obstructive emptying symptoms as a distinct pattern from infection symptoms.',
      },
    ],
    excluding: [
      {
        id: 'urology-upper-tract',
        label: 'Flank pain with feeling feverish',
        questionId: INTAKE_QUESTION_IDS.urinaryPattern,
        optionIds: ['flank-fever'],
        sourceIds: [COVERAGE_SOURCE_IDS.nhsUrinaryTractInfection],
        sourceCriterion: 'NHS UTI treats pain under the ribs with a high temperature as a possible kidney infection needing prompt general assessment, not an elective urology referral.',
      },
    ],
  },

  /* --- Medical Gastroenterology ------------------------------------------ */
  {
    directionId: 'medical-gastroenterology',
    appliesWhen: (context, answers) =>
      (isLowerAbdominal(context) || context.bodyRegionId === 'upper-abdomen') &&
      (context.concernId === 'bowel-change' || associatedSystemIs(answers, 'bowel')),
    pediatricPolicy: 'adult-only',
    minimumSupporting: 2,
    rationale:
      'The NHS constipation page separates an ordinary recent episode from the features it sends to a GP: not getting better with treatment, regular recurrence, blood, unintended weight loss and a sudden change in bowel habit. A recent first episode with none of those stays with the parent service, which is why this set needs two of them and not a bowel branch alone.',
    supporting: [
      {
        id: 'gastro-persistence',
        label: 'It has persisted or keeps coming back',
        questionId: INTAKE_QUESTION_IDS.bowelPersistence,
        optionIds: ['not-improving', 'regularly-recurrent'],
        sourceIds: [COVERAGE_SOURCE_IDS.nhsConstipation],
        sourceCriterion: 'NHS Constipation says to see a GP if it is not getting better with treatment, or if you are regularly constipated.',
      },
      {
        id: 'gastro-habit-change',
        label: 'A sudden change from the usual pattern',
        questionId: INTAKE_QUESTION_IDS.bowelAlarmFeature,
        // "Both of these" reports this feature too; it used to match neither criterion.
        optionIds: ['sudden-change', 'both'],
        sourceIds: [COVERAGE_SOURCE_IDS.nhsConstipation],
        sourceCriterion: 'NHS Constipation says to see a GP if you notice sudden changes in your bowel habits.',
      },
      {
        id: 'gastro-weight-loss',
        label: 'Weight loss without trying',
        questionId: INTAKE_QUESTION_IDS.bowelAlarmFeature,
        optionIds: ['weight-loss', 'both'],
        sourceIds: [COVERAGE_SOURCE_IDS.nhsConstipation],
        sourceCriterion: 'NHS Constipation says to see a GP if you have lost weight without trying.',
      },
      {
        id: 'gastro-bleeding',
        label: 'Blood reported with the bowel change',
        questionId: INTAKE_QUESTION_IDS.bowelDetail,
        optionIds: ['blood'],
        sourceIds: [COVERAGE_SOURCE_IDS.nhsConstipation],
        sourceCriterion: 'NHS Constipation says to see a GP if you have blood in your poo.',
      },
    ],
    excluding: [],
  },

  /* --- Ophthalmology ------------------------------------------------------ */
  {
    directionId: 'ophthalmology',
    appliesWhen: isEye,
    pediatricPolicy: 'shared-service',
    minimumSupporting: 2,
    rationale:
      'The NHS eye pain page names vision change, a very red eye, light sensitivity, contact lens use, eye surgery or treatment in the last four weeks and injury or a foreign body as the features that go to an eye service rather than a general one. Two eye-specific features is what separates an ocular presentation from a headache or neurological one felt around the eye.',
    supporting: [
      {
        id: 'ophtha-vision-change',
        label: 'A change in vision',
        questionId: INTAKE_QUESTION_IDS.eyeAssociated,
        optionIds: ['vision'],
        sourceIds: [COVERAGE_SOURCE_IDS.nhsEyePain],
        sourceCriterion: 'NHS Eye pain names blurring, changed colour vision or loss of vision as needing eye assessment.',
      },
      {
        id: 'ophtha-surface-signs',
        label: 'A very red eye or light sensitivity',
        questionId: INTAKE_QUESTION_IDS.eyeAssociated,
        optionIds: ['red', 'light'],
        sourceIds: [COVERAGE_SOURCE_IDS.nhsEyePain],
        sourceCriterion: 'NHS Eye pain names a very red eye and sensitivity to light as features needing eye assessment.',
      },
      {
        id: 'ophtha-ocular-context',
        label: 'Contact lens use, recent eye treatment, or something in the eye',
        questionId: INTAKE_QUESTION_IDS.eyeAssociated,
        optionIds: ['contact-lens', 'recent-treatment', 'injury'],
        sourceIds: [COVERAGE_SOURCE_IDS.nhsEyePain],
        sourceCriterion: 'NHS Eye pain names contact lens use, eye surgery or treatment in the last four weeks, injury and a foreign body as eye-service contexts.',
      },
      {
        id: 'ophtha-eye-injury',
        label: 'An injury to the eye itself',
        questionId: INTAKE_QUESTION_IDS.eyeInjuryDetail,
        optionIds: ['chemical', 'something-in', 'scratch', 'blow'],
        sourceIds: [COVERAGE_SOURCE_IDS.nhsEyePain],
        sourceCriterion: 'NHS Eye pain names injury, a chemical and a foreign body in the eye as eye-service contexts.',
      },
      {
        id: 'ophtha-ocular-detail',
        label: 'The change is in the eye itself',
        questionId: INTAKE_QUESTION_IDS.eyeDetail,
        optionIds: ['blurred', 'reduced', 'colour', 'flashes', 'red', 'light', 'gritty', 'watery', 'pain'],
        sourceIds: [COVERAGE_SOURCE_IDS.nhsEyePain],
        sourceCriterion: 'NHS Eye pain describes these as changes in the eye rather than in the surrounding area.',
      },
    ],
    excluding: [
      {
        id: 'ophtha-neurologic-pattern',
        label: 'Double vision, which is assessed neurologically',
        questionId: INTAKE_QUESTION_IDS.eyeDetail,
        optionIds: ['double'],
        sourceIds: [COVERAGE_SOURCE_IDS.nhsStroke],
        sourceCriterion: 'NHS Stroke symptoms include new double vision, which R3 screens on the neurological pathway.',
      },
    ],
  },

  /* --- Ophthalmology, a child's eye turn --------------------------------- */
  {
    directionId: 'ophthalmology',
    appliesWhen: (context) => isEye(context) && isPediatric(context),
    pediatricPolicy: 'pediatric-only',
    minimumSupporting: 2,
    requiredQuestionIds: [INTAKE_QUESTION_IDS.eyeSquintPattern],
    rationale:
      'NHS Squint refers a child whose eye turns all the time, or whose squint comes and goes after 3 months of age, to an eye specialist. The eye turn and its pattern are the two answers that criterion turns on.',
    supporting: [
      {
        id: 'ophtha-child-squint',
        label: 'An eye that turns in or out',
        questionId: INTAKE_QUESTION_IDS.eyeDetail,
        optionIds: ['squint'],
        sourceIds: [COVERAGE_SOURCE_IDS.nhsSquint],
        sourceCriterion: 'NHS Squint describes an eye that turns inwards, outwards, upwards or downwards.',
      },
      {
        id: 'ophtha-child-squint-pattern',
        label: 'The eye turn is there all the time or keeps returning',
        questionId: INTAKE_QUESTION_IDS.eyeSquintPattern,
        optionIds: ['all-the-time', 'comes-and-goes'],
        sourceIds: [COVERAGE_SOURCE_IDS.nhsSquint],
        sourceCriterion: 'NHS Squint: get advice if your child has a squint all the time, or is older than 3 months and has a squint that comes and goes; they can be referred to an eye specialist.',
      },
    ],
    excluding: [],
  },

  /* --- ENT, repeated disabling sore throats ------------------------------ */
  {
    directionId: 'otorhinolaryngology',
    appliesWhen: isThroat,
    pediatricPolicy: 'shared-service',
    minimumSupporting: 2,
    requiredQuestionIds: [INTAKE_QUESTION_IDS.throatRecurrence, INTAKE_QUESTION_IDS.throatImpact],
    rationale:
      'The Academy of Medical Royal Colleges referral criteria for repeated sore throats apply to children and adults alike: episodes that are disabling and prevent normal functioning, at 7 or more in a year, 5 or more a year for 2 years, or 3 or more a year for 3 years. NHS Tonsillitis says removal is only for severe tonsillitis that keeps coming back. A short, first sore throat meets neither and stays with the parent service.',
    supporting: [
      {
        id: 'ent-throat-recurrence-frequency',
        label: 'Sore throats that keep coming back as often as the referral criteria describe',
        questionId: INTAKE_QUESTION_IDS.throatRecurrence,
        optionIds: ['seven-in-year', 'five-a-year-two-years', 'three-a-year-three-years'],
        sourceIds: [COVERAGE_SOURCE_IDS.aomrcTonsillectomy, COVERAGE_SOURCE_IDS.nhsTonsillitis],
        sourceCriterion: 'AOMRC: seven or more significant sore throats in the preceding year, five or more in each of the preceding two years, or three or more in each of the preceding three years.',
      },
      {
        id: 'ent-throat-disabling',
        label: 'The sore throats stop normal activities',
        questionId: INTAKE_QUESTION_IDS.throatImpact,
        optionIds: ['yes'],
        sourceIds: [COVERAGE_SOURCE_IDS.aomrcTonsillectomy],
        sourceCriterion: 'AOMRC: the episodes are disabling and prevent normal functioning.',
      },
    ],
    excluding: [],
  },

  /* --- ENT, a persistent voice, swallowing or lump presentation ---------- */
  {
    directionId: 'otorhinolaryngology',
    appliesWhen: isThroat,
    pediatricPolicy: 'shared-service',
    minimumSupporting: 2,
    requiredQuestionIds: [INTAKE_QUESTION_IDS.throatDuration],
    rationale:
      'NHS Laryngitis sends voice problems lasting more than 2 weeks to a GP, NHS Sore throat and Lumps send a lump lasting more than 3 weeks, and NHS Swallowing problems treats persistent difficulty swallowing as needing assessment; NICE NG12 names persistent hoarseness and a neck lump as referral features. The persistence and the specific symptom are both required, so an ordinary sore throat of any length does not reach ENT on duration alone.',
    supporting: [
      {
        id: 'ent-throat-persistent',
        label: 'It has lasted more than 2 weeks',
        questionId: INTAKE_QUESTION_IDS.throatDuration,
        optionIds: ['two-to-three-weeks', 'over-three-weeks'],
        sourceIds: [COVERAGE_SOURCE_IDS.nhsLaryngitis, COVERAGE_SOURCE_IDS.nhsSoreThroat, COVERAGE_SOURCE_IDS.nhsLumps],
        sourceCriterion: 'NHS Laryngitis: see a GP if symptoms do not improve after 2 weeks; NHS Sore throat: a lump lasting more than 3 weeks.',
      },
      {
        id: 'ent-throat-voice',
        label: 'A hoarse or changed voice',
        questionId: INTAKE_QUESTION_IDS.throatDetail,
        optionIds: ['hoarse'],
        sourceIds: [COVERAGE_SOURCE_IDS.nhsLaryngitis, COVERAGE_SOURCE_IDS.niceSuspectedCancer],
        sourceCriterion: 'NHS Laryngitis names voice problems that do not improve; NICE NG12 names persistent hoarseness as a referral feature.',
      },
      {
        id: 'ent-throat-swallowing',
        label: 'Difficulty swallowing or a lump-in-the-throat feeling',
        questionId: INTAKE_QUESTION_IDS.throatDetail,
        optionIds: ['swallowing', 'lump-feeling'],
        sourceIds: [COVERAGE_SOURCE_IDS.nhsDysphagia],
        sourceCriterion: 'NHS Swallowing problems: difficulty swallowing or a feeling of something stuck in the throat needs assessment.',
      },
      {
        id: 'ent-throat-neck-lump',
        label: 'A lump in the neck that has not gone down',
        questionId: INTAKE_QUESTION_IDS.throatAssociated,
        optionIds: ['neck-lump'],
        sourceIds: [COVERAGE_SOURCE_IDS.nhsLumps, COVERAGE_SOURCE_IDS.nhsSoreThroat, COVERAGE_SOURCE_IDS.niceSuspectedCancer],
        sourceCriterion: 'NHS Lumps and Sore throat send a neck lump lasting more than 2 to 3 weeks to a GP; NICE NG12 names an unexplained neck lump.',
      },
    ],
    excluding: [],
  },

  /* --- Dermatology ------------------------------------------------------- */
  {
    directionId: 'dermatology',
    appliesWhen: (context) => context.concernId === 'skin-change',
    pediatricPolicy: 'shared-service',
    minimumSupporting: 2,
    rationale:
      'NICE CG153 (adults) and CG57 (children under 12) refer a skin condition for specialist dermatological advice when treatment has not controlled it, it is extensive, it keeps flaring or it has a major impact on daily life; NHS Moles and NICE NG12 send a mole or spot that changes in size, shape or colour, or bleeds, to a hospital specialist. Two of these features are required. An acute, hot, rapidly worsening or allergic-looking change points away, because it needs prompt general or urgent assessment instead.',
    supporting: [
      {
        id: 'derm-not-controlled',
        label: 'Treatment tried has not settled it',
        questionId: INTAKE_QUESTION_IDS.skinTreatment,
        optionIds: ['not-settled'],
        sourceIds: [COVERAGE_SOURCE_IDS.nicePsoriasis, COVERAGE_SOURCE_IDS.niceChildEczema],
        sourceCriterion: 'NICE CG153: refer if it cannot be controlled with topical treatment. NICE CG57: refer if management has not controlled it satisfactorily.',
      },
      {
        id: 'derm-persistent',
        label: 'It has lasted more than 4 weeks or keeps coming back',
        questionId: INTAKE_QUESTION_IDS.skinDuration,
        optionIds: ['over-four-weeks', 'keeps-returning'],
        sourceIds: [COVERAGE_SOURCE_IDS.niceChildEczema, COVERAGE_SOURCE_IDS.nhsMoles],
        sourceCriterion: 'NICE CG57 names repeated flares; NHS Moles names a new mark that has not gone away after a few weeks.',
      },
      {
        id: 'derm-changing-lesion',
        label: 'A mole or spot that is changing, bleeding or crusting',
        questionId: INTAKE_QUESTION_IDS.skinFeatures,
        optionIds: ['changed', 'bleeding'],
        sourceIds: [COVERAGE_SOURCE_IDS.nhsMoles, COVERAGE_SOURCE_IDS.niceSuspectedCancer],
        sourceCriterion: 'NHS Moles: see a GP about a mole that has changed size, shape or colour, or is bleeding or crusty; NICE NG12 lists change in size, shape and colour as major features.',
      },
      {
        id: 'derm-extensive',
        label: 'It covers a large area',
        questionId: INTAKE_QUESTION_IDS.skinFeatures,
        optionIds: ['widespread'],
        sourceIds: [COVERAGE_SOURCE_IDS.nicePsoriasis],
        sourceCriterion: 'NICE CG153: refer if it is severe or extensive.',
      },
      {
        id: 'derm-impact',
        label: 'It affects sleep, school, work or daily life',
        questionId: INTAKE_QUESTION_IDS.skinFeatures,
        optionIds: ['sleep-life'],
        sourceIds: [COVERAGE_SOURCE_IDS.nicePsoriasis, COVERAGE_SOURCE_IDS.niceChildEczema],
        sourceCriterion: 'NICE CG153: a major impact on physical, psychological or social wellbeing; NICE CG57: significant social or psychological problems such as sleep disturbance or poor school attendance.',
      },
      {
        id: 'derm-face-hands',
        label: 'It is on the face or hands and not settling',
        questionId: INTAKE_QUESTION_IDS.skinFeatures,
        optionIds: ['face-hands'],
        sourceIds: [COVERAGE_SOURCE_IDS.niceChildEczema],
        sourceCriterion: 'NICE CG57: refer if eczema on the face has not responded to treatment, and where facial, eyelid or hand involvement suggests contact allergy.',
      },
    ],
    excluding: [
      {
        id: 'derm-acute-pattern',
        label: 'A hot, rapidly worsening or reaction-type change',
        questionId: INTAKE_QUESTION_IDS.skinDetail,
        optionIds: ['painful-hot', 'new-exposure', 'mouth-face'],
        sourceIds: [COVERAGE_SOURCE_IDS.nhsAllergy],
        sourceCriterion: 'A painful, hot, rapidly worsening or new-exposure reaction needs prompt general or urgent assessment rather than an elective skin referral; airway swelling is screened by R3.',
      },
    ],
  },

  /* --- Orthopaedics ------------------------------------------------------ */
  {
    directionId: 'orthopaedics',
    appliesWhen: (context, answers) =>
      isMusculoskeletal(context)
      && ['pain', 'injury', 'movement-function', 'swelling-lump'].includes(context.concernId)
      // NHS Back pain names the GP and community musculoskeletal services, not an orthopaedic
      // referral, so back pain or stiffness is not routed here; a back injury still is.
      && (!/back/.test(context.bodyRegionId) || context.concernId === 'injury')
      // A child's joint problem without an injury is a paediatric one (NHS Joint pain).
      && (!isPediatric(context) || context.concernId === 'injury' || answers.some((answer) => answer.questionId === INTAKE_QUESTION_IDS.injuryDetail)),
    pediatricPolicy: 'shared-service',
    minimumSupporting: 2,
    rationale:
      'NHS Knee pain names a joint that locks or gives way, cannot bear weight or is badly swollen for urgent assessment, and says pain not improving within a few weeks may be referred for specialist treatment; NHS Joint pain and Sprains and strains give two weeks of home treatment and increasing swelling as their thresholds; NICE NG38 describes orthopaedic follow-up for injuries in children and adults. Two of these features are required, and a child\'s non-injury joint problem goes to Paediatrics instead.',
    supporting: [
      {
        id: 'ortho-function',
        label: 'Limping, putting less weight on it or unable to use it',
        questionId: INTAKE_QUESTION_IDS.injuryFunction,
        optionIds: ['limping', 'cannot'],
        sourceIds: [COVERAGE_SOURCE_IDS.nhsKneePain, COVERAGE_SOURCE_IDS.nhsJointPain],
        sourceCriterion: 'NHS Knee pain and Joint pain: being unable to move a joint or put weight on it needs assessment.',
      },
      {
        // The same fact asked by the approved R1 joint question; a weighted run is not asked it twice.
        id: 'ortho-function-reported',
        label: 'Hard to use or put weight on',
        questionId: 'joint-musculoskeletal-pain-use-weight',
        optionIds: ['yes'],
        sourceIds: [COVERAGE_SOURCE_IDS.nhsKneePain, COVERAGE_SOURCE_IDS.nhsJointPain],
        sourceCriterion: 'NHS Knee pain and Joint pain: being unable to move a joint or put weight on it needs assessment.',
      },
      {
        id: 'ortho-mechanical',
        label: 'The joint locks or gives way',
        questionId: INTAKE_QUESTION_IDS.mskMechanical,
        optionIds: ['locks', 'gives-way'],
        sourceIds: [COVERAGE_SOURCE_IDS.nhsKneePain],
        sourceCriterion: 'NHS Knee pain: get urgent advice if your knee locks, gives way or painfully clicks.',
      },
      {
        id: 'ortho-persistent',
        label: 'It has lasted more than 2 weeks or keeps coming back',
        questionId: INTAKE_QUESTION_IDS.mskDuration,
        optionIds: ['two-to-six-weeks', 'over-six-weeks', 'recurring'],
        sourceIds: [COVERAGE_SOURCE_IDS.nhsJointPain, COVERAGE_SOURCE_IDS.nhsKneePain, COVERAGE_SOURCE_IDS.nhsSprains],
        sourceCriterion: 'NHS Joint pain: see a GP if it lasts beyond two weeks of home treatment or keeps coming back; NHS Knee pain: pain not improving within a few weeks.',
      },
      {
        id: 'ortho-persistent-swelling',
        label: 'Swelling that has not gone down or keeps returning',
        questionId: INTAKE_QUESTION_IDS.mskMechanical,
        optionIds: ['swelling'],
        sourceIds: [COVERAGE_SOURCE_IDS.nhsSprains, COVERAGE_SOURCE_IDS.nhsJointPain],
        sourceCriterion: 'NHS Sprains and strains: increasing swelling or bruising needs urgent advice; NHS Joint pain: swelling that worsens or recurs.',
      },
      {
        id: 'ortho-swelling-duration',
        label: 'A swelling at a joint or limb lasting more than 2 weeks',
        questionId: INTAKE_QUESTION_IDS.swellingDuration,
        optionIds: ['two-to-six-weeks', 'over-six-weeks', 'comes-and-goes'],
        sourceIds: [COVERAGE_SOURCE_IDS.nhsLumps, COVERAGE_SOURCE_IDS.nhsJointPain],
        sourceCriterion: 'NHS Lumps: a lump lasting more than 2 weeks should be seen; NHS Joint pain: swelling that recurs.',
      },
      {
        id: 'ortho-swelling-growing',
        label: 'The swelling is getting larger',
        questionId: INTAKE_QUESTION_IDS.swellingDetail,
        optionIds: ['growing'],
        sourceIds: [COVERAGE_SOURCE_IDS.nhsLumps],
        sourceCriterion: 'NHS Lumps: see a GP if your lump gets bigger.',
      },
    ],
    excluding: [
      {
        id: 'ortho-not-one-calf-clot',
        label: 'Throbbing pain and swelling in one calf',
        questionId: INTAKE_QUESTION_IDS.mskSiteFeatures,
        optionIds: ['one-calf'],
        sourceIds: [COVERAGE_SOURCE_IDS.nhsDvt],
        sourceCriterion: 'NHS DVT: throbbing pain and swelling in 1 leg needs an urgent GP appointment or 111, not an elective referral; the R3 clot check owns it (phase 3, PENDING CLINICAL REVIEW).',
      },
      {
        /*
          PENDING CLINICAL REVIEW. Joint pain and swelling in more than one
          joint without an injury is the pattern NICE NG100 sends to a
          rheumatology opinion, not a mechanical, orthopaedic one. The
          distribution question is asked only in the adult weighted joint run.
        */
        id: 'ortho-not-polyarticular',
        label: 'More than one joint affected',
        questionId: INTAKE_QUESTION_IDS.jointPattern,
        optionIds: ['several'],
        sourceIds: [COVERAGE_SOURCE_IDS.niceRheumatoidArthritis],
        sourceCriterion: 'NICE NG100 1.1.1: refer suspected persistent synovitis for a specialist opinion, urgently if more than one joint is affected.',
      },
    ],
  },

  /* --- Clinical Immunology and Rheumatology (PENDING CLINICAL REVIEW) ----- */
  {
    directionId: 'clinical-immunology-rheumatology',
    appliesWhen: (context) => context.complaintId === 'joint-musculoskeletal-pain',
    pediatricPolicy: 'adult-only',
    minimumSupporting: 2,
    // A swollen joint AND a distribution or stiffness feature: swelling that
    // persists is not on its own separable from a mechanical joint problem.
    requiredQuestionIds: ['joint-musculoskeletal-pain-swelling-bruising', INTAKE_QUESTION_IDS.jointPattern],
    rationale:
      'NICE NG100 1.1.1 refers any adult with suspected persistent synovitis of undetermined cause for a specialist opinion, urgently when the small joints of the hands or feet or more than one joint are affected, or after 3 months or longer. A kiosk cannot examine for synovitis, so this needs a reported swollen joint that did not follow an injury AND a distribution or stiffness feature that NICE NG100 or NHS Rheumatoid arthritis names; persistence alone does not separate it from a mechanical joint problem. PENDING CLINICAL REVIEW: the registry previously recorded these patterns as not separable at a kiosk.',
    supporting: [
      {
        id: 'rheum-swelling',
        label: 'A swollen joint',
        questionId: 'joint-musculoskeletal-pain-swelling-bruising',
        optionIds: ['yes'],
        sourceIds: [COVERAGE_SOURCE_IDS.niceRheumatoidArthritis, COVERAGE_SOURCE_IDS.nhsRheumatoidArthritis],
        sourceCriterion: 'NICE NG100 1.1.1: suspected persistent synovitis; NHS Rheumatoid arthritis: affected joints swell and become hot and tender.',
      },
      {
        id: 'rheum-several-joints',
        label: 'More than one joint affected',
        questionId: INTAKE_QUESTION_IDS.jointPattern,
        optionIds: ['several'],
        sourceIds: [COVERAGE_SOURCE_IDS.niceRheumatoidArthritis],
        sourceCriterion: 'NICE NG100 1.1.1: refer urgently if more than one joint is affected.',
      },
      {
        id: 'rheum-small-joints',
        label: 'The small joints of the hands or feet',
        questionId: INTAKE_QUESTION_IDS.jointPattern,
        optionIds: ['small-joints'],
        sourceIds: [COVERAGE_SOURCE_IDS.niceRheumatoidArthritis, COVERAGE_SOURCE_IDS.nhsRheumatoidArthritis],
        sourceCriterion: 'NICE NG100 1.1.1: refer urgently if the small joints of the hands or feet are affected.',
      },
      {
        id: 'rheum-both-sides',
        label: 'The same joints on both sides',
        questionId: INTAKE_QUESTION_IDS.jointPattern,
        optionIds: ['both-sides'],
        sourceIds: [COVERAGE_SOURCE_IDS.nhsRheumatoidArthritis],
        sourceCriterion: 'NHS Rheumatoid arthritis: it usually affects joints on both sides of the body.',
      },
      {
        id: 'rheum-morning-stiffness',
        label: 'Morning stiffness longer than 30 minutes',
        questionId: INTAKE_QUESTION_IDS.jointPattern,
        optionIds: ['morning-stiffness'],
        sourceIds: [COVERAGE_SOURCE_IDS.nhsRheumatoidArthritis],
        sourceCriterion: 'NHS Rheumatoid arthritis: morning stiffness usually lasts longer than 30 minutes.',
      },
      {
        id: 'rheum-persistent',
        label: 'Lasting more than 6 weeks or recurring',
        questionId: INTAKE_QUESTION_IDS.mskDuration,
        optionIds: ['over-six-weeks', 'recurring'],
        sourceIds: [COVERAGE_SOURCE_IDS.niceRheumatoidArthritis],
        sourceCriterion: 'NICE NG100 1.1.1: persistent synovitis; a delay of 3 months or longer makes the referral urgent. The six-week band is the nearest the kiosk asks (PENDING CLINICAL REVIEW).',
      },
    ],
    excluding: [
      {
        id: 'rheum-not-one-calf-clot',
        label: 'Throbbing pain and swelling in one calf',
        questionId: INTAKE_QUESTION_IDS.mskSiteFeatures,
        optionIds: ['one-calf'],
        sourceIds: [COVERAGE_SOURCE_IDS.nhsDvt],
        sourceCriterion: 'NHS DVT: throbbing pain and swelling in 1 leg needs an urgent GP appointment or 111, not an elective referral; the R3 clot check owns it (phase 3, PENDING CLINICAL REVIEW).',
      },
      {
        id: 'rheum-after-injury',
        label: 'It began after an injury',
        questionId: 'joint-musculoskeletal-pain-injury',
        optionIds: ['yes'],
        sourceIds: [COVERAGE_SOURCE_IDS.niceRheumatoidArthritis],
        sourceCriterion: 'NICE NG100 1.1.1 is about synovitis of undetermined cause; swelling after an injury has a determined cause.',
      },
    ],
  },

/* --- Vascular Surgery (NICE CG168, PENDING CLINICAL REVIEW) --------------- */
  {
    directionId: 'vascular-surgery',
    appliesWhen: (context) => isLowerLimbVascular(context),
    pediatricPolicy: 'adult-only',
    minimumSupporting: 2,
    rationale: 'NICE CG168 1.2.2 refers symptomatic varicose veins (with troublesome symptoms, typically pain, aching, discomfort, swelling, heaviness and itching) to a vascular service. Both the veins and a symptom are needed. PENDING CLINICAL REVIEW.',
    supporting: [
      {
        id: 'vasc-veins',
        label: 'Swollen, twisted or bulging veins',
        questionId: INTAKE_QUESTION_IDS.legVeinFeatures,
        optionIds: ['bulging'],
        alternates: [{ questionId: INTAKE_QUESTION_IDS.mskSiteFeatures, optionIds: ['veins'] }],
        sourceIds: [COVERAGE_SOURCE_IDS.niceVaricoseVeins, COVERAGE_SOURCE_IDS.nhsVaricoseVeins],
        sourceCriterion: 'NICE CG168 1.2.2: symptomatic primary or recurrent varicose veins.',
      },
      {
        id: 'vasc-symptoms',
        label: 'Aching, heaviness or itching in the leg',
        questionId: INTAKE_QUESTION_IDS.legVeinFeatures,
        optionIds: ['aching-heavy', 'skin-change'],
        alternates: [{ questionId: INTAKE_QUESTION_IDS.mskSiteFeatures, optionIds: ['heavy-aching'] }],
        sourceIds: [COVERAGE_SOURCE_IDS.niceVaricoseVeins],
        sourceCriterion: 'NICE CG168 1.2.2: symptomatic veins come with troublesome lower limb symptoms, typically pain, aching, discomfort, swelling, heaviness and itching.',
      },
    ],
    excluding: [
      {
        id: 'vasc-not-one-leg-clot',
        label: 'Throbbing pain and swelling in one leg',
        questionId: INTAKE_QUESTION_IDS.legVeinFeatures,
        optionIds: ['one-leg'],
        alternates: [{ questionId: INTAKE_QUESTION_IDS.mskSiteFeatures, optionIds: ['one-calf'] }],
        sourceIds: [COVERAGE_SOURCE_IDS.nhsDvt],
        sourceCriterion: 'NHS DVT: pain and swelling in 1 leg is an urgent GP or 111 matter, not an elective vascular referral; the R3 clot check owns it.',
      },
    ],
  },
  {
    directionId: 'vascular-surgery',
    appliesWhen: (context) => isLowerLimbVascular(context),
    pediatricPolicy: 'adult-only',
    minimumSupporting: 2,
    rationale: 'NICE CG168 1.2.1 refers bleeding varicose veins to a vascular service immediately, and 1.2.2 refers a venous leg ulcer (a break in the skin below the knee not healed within 2 weeks). One answer is never a referral here, so each needs a venous feature beside it (the veins themselves, or aching, heaviness or skin change); a bleeding vein is screened by the urgent R3 check on its own. PENDING CLINICAL REVIEW.',
    supporting: [
      {
        id: 'vasc-bleeding',
        label: 'A bleeding vein on the leg',
        questionId: INTAKE_QUESTION_IDS.legVeinFeatures,
        optionIds: ['bleeding-vein'],
        sourceIds: [COVERAGE_SOURCE_IDS.niceVaricoseVeins, COVERAGE_SOURCE_IDS.nhsVaricoseVeins],
        sourceCriterion: 'NICE CG168 1.2.1: refer people with bleeding varicose veins to a vascular service immediately.',
      },
      {
        id: 'vasc-ulcer',
        label: 'A sore on the leg not healed after 2 weeks',
        questionId: INTAKE_QUESTION_IDS.legVeinFeatures,
        optionIds: ['sore'],
        sourceIds: [COVERAGE_SOURCE_IDS.niceVaricoseVeins, COVERAGE_SOURCE_IDS.nhsVaricoseVeins],
        sourceCriterion: 'NICE CG168 1.2.2: a venous leg ulcer, a break in the skin below the knee that has not healed within 2 weeks.',
      },
      {
        id: 'vasc-venous-feature',
        label: 'Visible varicose veins, or aching, heaviness or skin change',
        questionId: INTAKE_QUESTION_IDS.legVeinFeatures,
        optionIds: ['bulging', 'aching-heavy', 'skin-change'],
        alternates: [{ questionId: INTAKE_QUESTION_IDS.mskSiteFeatures, optionIds: ['veins', 'heavy-aching'] }],
        sourceIds: [COVERAGE_SOURCE_IDS.niceVaricoseVeins, COVERAGE_SOURCE_IDS.nhsVaricoseVeins],
        sourceCriterion: 'NICE CG168 1.2.2: varicose veins and the lower limb symptoms and skin changes of chronic venous insufficiency.',
      },
    ],
    excluding: [
      {
        id: 'vasc-not-one-leg-clot',
        label: 'Throbbing pain and swelling in one leg',
        questionId: INTAKE_QUESTION_IDS.legVeinFeatures,
        optionIds: ['one-leg'],
        alternates: [{ questionId: INTAKE_QUESTION_IDS.mskSiteFeatures, optionIds: ['one-calf'] }],
        sourceIds: [COVERAGE_SOURCE_IDS.nhsDvt],
        sourceCriterion: 'NHS DVT: pain and swelling in 1 leg is an urgent GP or 111 matter, not an elective vascular referral; the R3 clot check owns it.',
      },
    ],
  },
  {
    directionId: 'vascular-surgery',
    appliesWhen: (context) => isLowerLimbVascular(context),
    pediatricPolicy: 'adult-only',
    minimumSupporting: 2,
    rationale: 'NICE CG168 1.2.2 refers superficial vein thrombosis (hard, painful veins) with suspected venous incompetence. The hard vein and visible varicose veins are both needed. PENDING CLINICAL REVIEW.',
    supporting: [
      {
        id: 'vasc-hard-vein',
        label: 'A hard, painful vein',
        questionId: INTAKE_QUESTION_IDS.legVeinFeatures,
        optionIds: ['hard-vein'],
        sourceIds: [COVERAGE_SOURCE_IDS.niceVaricoseVeins],
        sourceCriterion: 'NICE CG168 1.2.2: superficial vein thrombosis (characterised by the appearance of hard, painful veins) and suspected venous incompetence.',
      },
      {
        id: 'vasc-hard-vein-veins',
        label: 'Swollen, twisted or bulging veins',
        questionId: INTAKE_QUESTION_IDS.legVeinFeatures,
        optionIds: ['bulging'],
        alternates: [{ questionId: INTAKE_QUESTION_IDS.mskSiteFeatures, optionIds: ['veins'] }],
        sourceIds: [COVERAGE_SOURCE_IDS.niceVaricoseVeins],
        sourceCriterion: 'NICE CG168 1.2.2: suspected venous incompetence alongside the hard vein.',
      },
    ],
    excluding: [
      {
        id: 'vasc-not-one-leg-clot',
        label: 'Throbbing pain and swelling in one leg',
        questionId: INTAKE_QUESTION_IDS.legVeinFeatures,
        optionIds: ['one-leg'],
        alternates: [{ questionId: INTAKE_QUESTION_IDS.mskSiteFeatures, optionIds: ['one-calf'] }],
        sourceIds: [COVERAGE_SOURCE_IDS.nhsDvt],
        sourceCriterion: 'NHS DVT: pain and swelling in 1 leg is an urgent GP or 111 matter, not an elective vascular referral; the R3 clot check owns it.',
      },
    ],
  },

  /* --- General Surgery: hernia (NHS Hernia, PENDING CLINICAL REVIEW) --------- */
  {
    directionId: 'general-surgery',
    appliesWhen: (context) => isAbdominal(context) && context.concernId === 'swelling-lump',
    // A child's hernia is assessed by Paediatrics first.
    pediatricPolicy: 'adult-only',
    minimumSupporting: 2,
    rationale: 'NHS Hernia describes a lump that gets bigger on coughing or straining and smaller lying down, with tight skin over it or a dragging feeling; a GP refers for treatment, which for a hernia is surgical repair (NHS Inguinal hernia repair). Two of these features are needed. Pain, sickness or a bloated tummy with the lump is the urgent R3 hernia check. PENDING CLINICAL REVIEW.',
    supporting: [
      {
        id: 'gs-hernia-cough',
        label: 'Bigger on coughing or straining',
        questionId: INTAKE_QUESTION_IDS.herniaFeatures,
        optionIds: ['bigger-cough'],
        sourceIds: [COVERAGE_SOURCE_IDS.nhsHernia],
        sourceCriterion: 'NHS Hernia: a lump that may get bigger when you cough, sneeze or cry.',
      },
      {
        id: 'gs-hernia-lying',
        label: 'Smaller or gone when lying down',
        questionId: INTAKE_QUESTION_IDS.herniaFeatures,
        optionIds: ['smaller-lying'],
        sourceIds: [COVERAGE_SOURCE_IDS.nhsHernia],
        sourceCriterion: 'NHS Hernia: a lump that may get smaller when you lie down.',
      },
      {
        id: 'gs-hernia-skin',
        label: 'Tight, stretched skin over the lump',
        questionId: INTAKE_QUESTION_IDS.herniaFeatures,
        optionIds: ['tight-skin'],
        sourceIds: [COVERAGE_SOURCE_IDS.nhsHernia],
        sourceCriterion: 'NHS Hernia: the skin over the lump seeming tight and stretched.',
      },
      {
        id: 'gs-hernia-dragging',
        label: 'A heavy, dragging feeling',
        questionId: INTAKE_QUESTION_IDS.herniaFeatures,
        optionIds: ['dragging'],
        sourceIds: [COVERAGE_SOURCE_IDS.nhsHernia],
        sourceCriterion: 'NHS Hernia: a heavy, dragging feeling.',
      },
    ],
    excluding: [],
  },

  /* --- General Surgery: breast (NHS Breast lumps, NICE NG12 1.4) ------------- */
  {
    directionId: 'general-surgery',
    appliesWhen: (context) => context.bodyRegionId === 'chest' && context.concernId === 'swelling-lump',
    pediatricPolicy: 'adult-only',
    minimumSupporting: 2,
    rationale: 'NHS Breast lumps sends a lump in the breast or armpit, a nipple turning in, dimpled skin or bloodstained nipple discharge to a GP, who refers to a breast clinic if the cause is unclear; NICE NG12 1.4.1 to 1.4.3 refers these. One answer is never a referral to a narrower service here, so two changes route to General Surgery; a single change goes to General Medicine, as NHS describes, and the NG12 referral priority is added to the handoff either way. PENDING CLINICAL REVIEW.',
    supporting: [
      {
        id: 'gs-breast-lump',
        label: 'A lump in the breast',
        questionId: INTAKE_QUESTION_IDS.breastFeatures,
        optionIds: ['breast-lump'],
        sourceIds: [COVERAGE_SOURCE_IDS.nhsBreastLump, COVERAGE_SOURCE_IDS.niceSuspectedCancer],
        sourceCriterion: 'NHS Breast lumps: see a GP if you notice a lump in your breast; NICE NG12 1.4.1 and 1.4.3.',
      },
      {
        id: 'gs-breast-armpit',
        label: 'A lump in the armpit',
        questionId: INTAKE_QUESTION_IDS.breastFeatures,
        optionIds: ['armpit-lump'],
        sourceIds: [COVERAGE_SOURCE_IDS.nhsBreastLump, COVERAGE_SOURCE_IDS.niceSuspectedCancer],
        sourceCriterion: 'NHS Breast lumps: a lump in your armpit; NICE NG12 1.4.2.',
      },
      {
        id: 'gs-breast-nipple',
        label: 'A nipple that has turned inwards',
        questionId: INTAKE_QUESTION_IDS.breastFeatures,
        optionIds: ['nipple-inward'],
        sourceIds: [COVERAGE_SOURCE_IDS.nhsBreastLump, COVERAGE_SOURCE_IDS.niceSuspectedCancer],
        sourceCriterion: 'NHS Breast lumps: the nipple turning inwards; NICE NG12 1.4.1 (retraction).',
      },
      {
        id: 'gs-breast-skin',
        label: 'Dimpled skin on the breast',
        questionId: INTAKE_QUESTION_IDS.breastFeatures,
        optionIds: ['dimpled'],
        sourceIds: [COVERAGE_SOURCE_IDS.nhsBreastLump, COVERAGE_SOURCE_IDS.niceSuspectedCancer],
        sourceCriterion: 'NHS Breast lumps: dimpled skin; NICE NG12 1.4.2 (skin changes).',
      },
      {
        id: 'gs-breast-discharge',
        label: 'Discharge from one nipple',
        questionId: INTAKE_QUESTION_IDS.breastFeatures,
        optionIds: ['nipple-discharge'],
        sourceIds: [COVERAGE_SOURCE_IDS.nhsBreastLump, COVERAGE_SOURCE_IDS.niceSuspectedCancer],
        sourceCriterion: 'NHS Breast lumps: bloodstained nipple discharge; NICE NG12 1.4.1 (discharge in 1 nipple only).',
      },
    ],
    excluding: [],
  },

  /* --- Dentistry: an oral lump or patch (NICE NG12 1.8.3) -------------------- */
  {
    directionId: 'dentistry',
    appliesWhen: (context) => isOral(context) && context.concernId === 'mouth-change',
    pediatricPolicy: 'shared-service',
    minimumSupporting: 2,
    requiredQuestionIds: [INTAKE_QUESTION_IDS.mouthDetail],
    rationale: 'NICE NG12 1.8.3: consider an urgent referral for assessment by a dentist for a lump on the lip or in the oral cavity, or a red or red and white patch. NHS Mouth cancer sends these to a GP or dentist. One answer is never a referral here, so the lesion and how long it has been there (more than a week, or coming back) are both needed; the NG12 priority is added to the handoff either way. PENDING CLINICAL REVIEW.',
    supporting: [
      {
        id: 'dental-oral-patch',
        label: 'A red or white patch in the mouth',
        questionId: INTAKE_QUESTION_IDS.mouthDetail,
        optionIds: ['patch'],
        sourceIds: [COVERAGE_SOURCE_IDS.niceSuspectedCancer, COVERAGE_SOURCE_IDS.nhsMouthCancer],
        sourceCriterion: 'NICE NG12 1.8.3: a red or red and white patch in the oral cavity; urgent assessment by a dentist.',
      },
      {
        id: 'dental-oral-lump',
        label: 'A lump in the mouth or on the lip',
        questionId: INTAKE_QUESTION_IDS.mouthDetail,
        optionIds: ['lump'],
        sourceIds: [COVERAGE_SOURCE_IDS.niceSuspectedCancer, COVERAGE_SOURCE_IDS.nhsMouthCancer],
        sourceCriterion: 'NICE NG12 1.8.3: a lump on the lip or in the oral cavity; urgent assessment by a dentist.',
      },
      {
        id: 'dental-oral-lesion-lasting',
        label: 'Present for more than a week, or coming back',
        questionId: INTAKE_QUESTION_IDS.mouthDuration,
        optionIds: ['one-to-three-weeks', 'over-three-weeks', 'keeps-returning'],
        sourceIds: [COVERAGE_SOURCE_IDS.nhsMouthCancer, COVERAGE_SOURCE_IDS.nhsMouthUlcers],
        sourceCriterion: 'NHS Mouth cancer and Mouth ulcers: a mouth change that is not going away is seen by a GP or dentist; a lesion present for more than a week is not a passing one.',
      },
    ],
    excluding: [],
  },

  /* --- Dentistry (PENDING CLINICAL REVIEW) --------------------------------- */
  {
    directionId: 'dentistry',
    appliesWhen: (context, answers) =>
      (isOral(context) && ['mouth-change', 'bleeding-discharge', 'pain'].includes(context.concernId))
      // Phase 3 (PENDING CLINICAL REVIEW): a mouth or jaw lump near a tooth, or a facial pain that comes from a tooth.
      || (isOral(context) && context.concernId === 'swelling-lump' && answerIncludes(answers, INTAKE_QUESTION_IDS.oralSwellingSite, ['tooth-gum']))
      || (context.complaintId === 'face-general-concern' && context.concernId === 'pain' && answerIncludes(answers, INTAKE_QUESTION_IDS.facePainPattern, ['tooth'])),
    // NHS Gum disease names children's sore, bleeding gums for the dentist too.
    pediatricPolicy: 'shared-service',
    minimumSupporting: 2,
    requiredQuestionIds: [INTAKE_QUESTION_IDS.toothFeatures],
    rationale:
      'NHS Toothache, Dental abscess and Gum disease send tooth and gum problems to a dentist, not a GP surgery, when the pain lasts more than 2 days or does not settle with painkillers, or with pain on biting, hot or cold sensitivity, gum change, a swollen cheek or jaw, a bad taste, a loose tooth or a high temperature. Two of these are required, after the problem has been placed in a tooth or the gum. Swelling around the eye or neck, or a mouth that will not open, is screened first by the R3 dental emergency check.',
    supporting: [
      {
        id: 'dental-lasting',
        label: 'Tooth or gum pain lasting more than 2 days',
        // Read from the duration the branch already asked, in its own bands, so it is never asked twice.
        questionId: INTAKE_QUESTION_IDS.mouthDuration,
        optionIds: ['one-to-three-weeks', 'over-three-weeks', 'keeps-returning'],
        alternates: [{ questionId: INTAKE_QUESTION_IDS.duration, optionIds: ['several-days', 'longer'] }],
        sourceIds: [COVERAGE_SOURCE_IDS.nhsToothache],
        sourceCriterion: 'NHS Toothache: see a dentist if you have toothache that lasts more than 2 days.',
      },
      {
        id: 'dental-painkillers',
        label: 'Painkillers are not helping',
        questionId: INTAKE_QUESTION_IDS.toothFeatures,
        optionIds: ['painkillers'],
        sourceIds: [COVERAGE_SOURCE_IDS.nhsToothache],
        sourceCriterion: 'NHS Toothache: see a dentist if it does not go away when you take painkillers.',
      },
      {
        id: 'dental-bite',
        label: 'Pain on biting or chewing',
        questionId: INTAKE_QUESTION_IDS.toothFeatures,
        optionIds: ['bite'],
        sourceIds: [COVERAGE_SOURCE_IDS.nhsToothache],
        sourceCriterion: 'NHS Toothache: see a dentist if you have pain when you bite.',
      },
      {
        id: 'dental-hot-cold',
        label: 'Sensitive to hot or cold',
        questionId: INTAKE_QUESTION_IDS.toothFeatures,
        optionIds: ['hot-cold'],
        sourceIds: [COVERAGE_SOURCE_IDS.nhsDentalAbscess],
        sourceCriterion: 'NHS Dental abscess lists sensitivity to hot or cold food and drink; ask for an urgent dentist appointment.',
      },
      {
        id: 'dental-gums',
        label: 'Red, swollen, sore or bleeding gums',
        questionId: INTAKE_QUESTION_IDS.toothFeatures,
        optionIds: ['gums'],
        sourceIds: [COVERAGE_SOURCE_IDS.nhsToothache, COVERAGE_SOURCE_IDS.nhsGumDisease],
        sourceCriterion: 'NHS Toothache: red gums; NHS Gum disease: see a dentist if your gums bleed or are painful and swollen.',
      },
      {
        id: 'dental-swelling',
        label: 'A swollen cheek or jaw',
        questionId: INTAKE_QUESTION_IDS.toothFeatures,
        optionIds: ['swelling'],
        sourceIds: [COVERAGE_SOURCE_IDS.nhsToothache, COVERAGE_SOURCE_IDS.nhsDentalAbscess],
        sourceCriterion: 'NHS Toothache: see a dentist if your cheek or jaw is swollen.',
      },
      {
        id: 'dental-taste',
        label: 'A bad taste in the mouth',
        questionId: INTAKE_QUESTION_IDS.toothFeatures,
        optionIds: ['taste'],
        sourceIds: [COVERAGE_SOURCE_IDS.nhsToothache, COVERAGE_SOURCE_IDS.nhsDentalAbscess],
        sourceCriterion: 'NHS Toothache: see a dentist if you have a bad taste in your mouth.',
      },
      {
        id: 'dental-loose',
        label: 'A loose tooth',
        questionId: INTAKE_QUESTION_IDS.toothFeatures,
        optionIds: ['loose'],
        sourceIds: [COVERAGE_SOURCE_IDS.nhsGumDisease],
        sourceCriterion: 'NHS Gum disease: get an urgent dental appointment if teeth become loose.',
      },
      {
        id: 'dental-temperature',
        label: 'A high temperature with the tooth or gum problem',
        questionId: INTAKE_QUESTION_IDS.toothFeatures,
        optionIds: ['temperature'],
        sourceIds: [COVERAGE_SOURCE_IDS.nhsToothache, COVERAGE_SOURCE_IDS.nhsDentalAbscess],
        sourceCriterion: 'NHS Toothache: see a dentist if you have a high temperature with the toothache.',
      },
    ],
    excluding: [],
  },

  /* --- Cardiology, anginal-type chest pain ------------------------------- */
  {
    directionId: 'cardiology',
    appliesWhen: (context) => context.bodyRegionId === 'chest' && context.concernId === 'pain',
    pediatricPolicy: 'adult-only',
    minimumSupporting: 2,
    requiredQuestionIds: [INTAKE_QUESTION_IDS.chestPainTrigger],
    rationale:
      'NICE CG95 defines anginal chest pain by three features: a constricting discomfort in the chest, neck, shoulders, jaw or arms; brought on by physical exertion; relieved by rest within about 5 minutes. Two are atypical angina and three typical, and both are investigated rather than excluded. NHS Angina says that if a GP thinks it may be angina, the person is referred to a cardiologist. Exertion (or the stress and cold NHS Angina also names) is required, so a pain unrelated to activity never reaches Cardiology; pain brought on by breathing in, movement or eating, or pain that does not settle, points away as CG95 1.3.3.5 says.',
    supporting: [
      {
        id: 'cardio-constricting',
        label: 'A tight, heavy or squeezing discomfort',
        questionId: INTAKE_QUESTION_IDS.chestPainCharacter,
        optionIds: ['tight-heavy'],
        sourceIds: [COVERAGE_SOURCE_IDS.niceStableChestPain, COVERAGE_SOURCE_IDS.nhsAngina],
        sourceCriterion: 'NICE CG95 1.3.3.1: constricting discomfort in the front of the chest. NHS Angina: tightness, squeezing or pressure.',
      },
      {
        id: 'cardio-exertion',
        label: 'Brought on by activity, stress or cold',
        questionId: INTAKE_QUESTION_IDS.chestPainTrigger,
        optionIds: ['exertion', 'stress-cold'],
        sourceIds: [COVERAGE_SOURCE_IDS.niceStableChestPain, COVERAGE_SOURCE_IDS.nhsAngina],
        sourceCriterion: 'NICE CG95 1.3.3.1: precipitated by physical exertion. NHS Angina: often triggered by physical activity, emotional stress or cold weather.',
      },
      {
        id: 'cardio-rest-relief',
        label: 'Settles within a few minutes of resting',
        questionId: INTAKE_QUESTION_IDS.chestPainRelief,
        optionIds: ['rest-minutes'],
        sourceIds: [COVERAGE_SOURCE_IDS.niceStableChestPain, COVERAGE_SOURCE_IDS.nhsAngina],
        sourceCriterion: 'NICE CG95 1.3.3.1: relieved by rest or GTN within about 5 minutes.',
      },
      {
        id: 'cardio-anginal-site',
        label: 'Also felt in the neck, jaw, shoulder or arm',
        questionId: INTAKE_QUESTION_IDS.associatedLocation,
        optionIds: [
          'neck', 'face',
          'left-shoulder', 'right-shoulder', 'left-upper-arm', 'right-upper-arm', 'left-elbow', 'right-elbow',
          'left-forearm', 'right-forearm', 'left-wrist', 'right-wrist', 'left-hand', 'right-hand',
        ],
        sourceIds: [COVERAGE_SOURCE_IDS.niceStableChestPain, COVERAGE_SOURCE_IDS.nhsAngina],
        sourceCriterion: 'NICE CG95 1.3.3.1: discomfort in the front of the chest, or in the neck, shoulders, jaw or arms. NHS Angina: pain in the chest, neck, shoulders, jaw or arms.',
      },
    ],
    excluding: [
      {
        id: 'cardio-non-anginal-trigger',
        label: 'Brought on by breathing in, moving, pressing or eating',
        questionId: INTAKE_QUESTION_IDS.chestPainTrigger,
        optionIds: ['breathing-movement', 'eating-lying'],
        sourceIds: [COVERAGE_SOURCE_IDS.niceStableChestPain, COVERAGE_SOURCE_IDS.nhsChestPain],
        sourceCriterion: 'NICE CG95 1.3.3.5: pain unrelated to activity or brought on by breathing in makes stable angina unlikely; consider gastrointestinal or musculoskeletal causes. NHS Chest pain: pain after eating points to reflux, pain worse on breathing in or movement to a muscle strain.',
      },
      {
        id: 'cardio-continuous',
        label: 'The pain does not settle',
        questionId: INTAKE_QUESTION_IDS.chestPainRelief,
        optionIds: ['does-not-settle'],
        sourceIds: [COVERAGE_SOURCE_IDS.niceStableChestPain, COVERAGE_SOURCE_IDS.nhsChestPain],
        sourceCriterion: 'NICE CG95 1.3.3.5: continuous or very prolonged pain makes stable angina unlikely; NHS Chest pain treats chest pain that does not go away as an emergency, which R3 screens.',
      },
    ],
  },

  /* --- Cardiology, a heartbeat change ------------------------------------ */
  {
    directionId: 'cardiology',
    appliesWhen: (context) => context.bodyRegionId === 'chest' && context.concernId === 'palpitations',
    pediatricPolicy: 'adult-only',
    minimumSupporting: 2,
    rationale:
      'NHS Heart palpitations sends palpitations that keep coming back or happen more often, last more than a few minutes, or come with an existing heart condition or a family history of heart problems to a GP, and says a cardiologist may be needed for tests and treatment. Two of those features is a pattern for the heart service; one alone stays with General Medicine. Palpitations with chest pain, breathlessness or fainting are an R3 emergency.',
    supporting: [
      {
        id: 'cardio-palpitations-recurrent',
        label: 'Palpitations that keep coming back or are happening more often',
        questionId: INTAKE_QUESTION_IDS.palpitationFrequency,
        optionIds: ['more-often'],
        sourceIds: [COVERAGE_SOURCE_IDS.nhsPalpitations],
        sourceCriterion: 'NHS Heart palpitations: see a GP if they keep coming back or are happening more often.',
      },
      {
        id: 'cardio-palpitations-long',
        label: 'Episodes lasting more than a few minutes',
        questionId: INTAKE_QUESTION_IDS.palpitationLength,
        optionIds: ['longer'],
        sourceIds: [COVERAGE_SOURCE_IDS.nhsPalpitations],
        sourceCriterion: 'NHS Heart palpitations: see a GP if they last more than a few minutes.',
      },
      {
        id: 'cardio-palpitations-heart-condition',
        label: 'A heart condition already known',
        questionId: INTAKE_QUESTION_IDS.palpitationHistory,
        optionIds: ['heart-condition'],
        sourceIds: [COVERAGE_SOURCE_IDS.nhsPalpitations],
        sourceCriterion: 'NHS Heart palpitations: see a GP if you have an existing heart condition.',
      },
      {
        id: 'cardio-palpitations-family',
        label: 'Heart problems in the family',
        questionId: INTAKE_QUESTION_IDS.palpitationHistory,
        optionIds: ['family-history'],
        sourceIds: [COVERAGE_SOURCE_IDS.nhsPalpitations],
        sourceCriterion: 'NHS Heart palpitations: see a GP if there is a family history of heart problems.',
      },
    ],
    excluding: [],
  },

  /* --- Medical Gastroenterology, heartburn and indigestion ---------------- */
  {
    directionId: 'medical-gastroenterology',
    appliesWhen: (context) =>
      (context.bodyRegionId === 'chest' && context.concernId === 'voice-swallow')
      || context.complaintId === 'upper-abdominal-pain',
    pediatricPolicy: 'adult-only',
    minimumSupporting: 2,
    requiredQuestionIds: [INTAKE_QUESTION_IDS.upperGiFrequency],
    rationale:
      'NHS Heartburn and acid reflux sends heartburn that is present most days, or that lifestyle changes and pharmacy medicines are not helping, or that comes with food sticking, frequent vomiting or weight loss, to a GP, who may refer to a specialist for a gastroscopy; NHS Indigestion names indigestion that keeps coming back with the same accompanying features. Frequency is required, so a first or occasional episode never reaches Gastroenterology. Discomfort brought on by physical activity points away, as NICE CG95 names exertion as an anginal feature.',
    supporting: [
      {
        id: 'gastro-upper-frequent',
        label: 'It happens most days, or often for 3 weeks or more',
        questionId: INTAKE_QUESTION_IDS.upperGiFrequency,
        optionIds: ['most-days', 'often-weeks'],
        sourceIds: [COVERAGE_SOURCE_IDS.nhsHeartburn, COVERAGE_SOURCE_IDS.nhsIndigestion],
        sourceCriterion: 'NHS Heartburn: see a GP if you have heartburn most days. NHS Indigestion: see a GP if you keep getting indigestion.',
      },
      {
        id: 'gastro-upper-not-helped',
        label: 'Pharmacy medicines and changes are not helping',
        questionId: INTAKE_QUESTION_IDS.upperGiTreatment,
        optionIds: ['not-helping'],
        sourceIds: [COVERAGE_SOURCE_IDS.nhsHeartburn],
        sourceCriterion: 'NHS Heartburn: see a GP if lifestyle changes and pharmacy medicines are not helping.',
      },
      {
        id: 'gastro-upper-accompanying',
        label: 'Food sticking, being sick, weight loss or blood',
        questionId: INTAKE_QUESTION_IDS.upperGiAlarm,
        optionIds: ['food-sticking', 'sick', 'weight-loss', 'blood'],
        sourceIds: [COVERAGE_SOURCE_IDS.nhsHeartburn, COVERAGE_SOURCE_IDS.nhsIndigestion],
        sourceCriterion: 'NHS Heartburn: food getting stuck, frequently being sick or losing weight for no reason. NHS Indigestion: difficulty swallowing, keep being sick, weight loss, bloody vomit or poo.',
      },
      {
        id: 'gastro-upper-reflux-pattern',
        label: 'Burning or food coming back up',
        questionId: INTAKE_QUESTION_IDS.upperGiSymptom,
        optionIds: ['burning', 'coming-up', 'sticking'],
        sourceIds: [COVERAGE_SOURCE_IDS.nhsHeartburn, COVERAGE_SOURCE_IDS.nhsDysphagia],
        sourceCriterion: 'NHS Heartburn and acid reflux: a burning feeling in the chest and food or sour fluid coming back up are its main symptoms; NHS Swallowing problems: food sticking needs assessment.',
      },
      {
        // The same fact asked by the approved R1 upper abdominal question.
        id: 'gastro-upper-burning-reported',
        label: 'A burning feeling behind the breastbone',
        questionId: 'upper-abdominal-pain-burning',
        optionIds: ['yes'],
        sourceIds: [COVERAGE_SOURCE_IDS.nhsHeartburn],
        sourceCriterion: 'NHS Heartburn and acid reflux: a burning feeling in the middle of the chest is the main symptom.',
      },
    ],
    excluding: [
      {
        id: 'gastro-upper-exertional',
        label: 'Brought on by physical activity',
        questionId: 'upper-abdominal-pain-exertional',
        optionIds: ['yes'],
        sourceIds: [COVERAGE_SOURCE_IDS.niceStableChestPain],
        sourceCriterion: 'NICE CG95 1.3.3.1 names discomfort precipitated by physical exertion as an anginal feature, so an exertional pattern is not sent down the digestive pathway.',
      },
    ],
  },

  /* --- Neurology, slowly progressive weakness ------------------------------ */
  {
    directionId: 'neurology',
    appliesWhen: (context) =>
      context.concernId === 'weakness-drooping'
      && (isMusculoskeletal(context) || context.bodyRegionId === 'neck'),
    pediatricPolicy: 'adult-only',
    minimumSupporting: 2,
    requiredQuestionIds: [INTAKE_QUESTION_IDS.neurologicCourse],
    rationale:
      'NICE NG127 1.7.5 refers adults with slowly (weeks to months) progressive limb or neck weakness for neuromuscular assessment. The course is required and the weakness must have been described; weakness that followed an injury points away, and a sudden or quickly worsening course is screened by R3 instead of routed.',
    supporting: [
      {
        id: 'neuro-progressive-course',
        label: 'Weakness gradually getting worse over weeks or months',
        questionId: INTAKE_QUESTION_IDS.neurologicCourse,
        optionIds: ['gradual'],
        sourceIds: [COVERAGE_SOURCE_IDS.niceNeurologicalReferral],
        sourceCriterion: 'NICE NG127 1.7.5: for adults with slowly (within weeks to months) progressive limb or neck weakness, refer for an assessment for neuromuscular disorders.',
      },
      {
        id: 'neuro-weakness-described',
        label: 'Where the weakness is, and what it affects',
        questionId: INTAKE_QUESTION_IDS.neurologicDetail,
        optionIds: ['one-sided', 'both-sides', 'spreading', 'function'],
        sourceIds: [COVERAGE_SOURCE_IDS.niceNeurologicalReferral],
        sourceCriterion: 'NICE NG127 1.7.5 applies to weakness of a limb or the neck; the distribution and effect on function describe it.',
      },
    ],
    excluding: [
      {
        id: 'neuro-after-injury',
        label: 'It started after an injury',
        questionId: INTAKE_QUESTION_IDS.neurologicFeatures,
        optionIds: ['injury'],
        sourceIds: [COVERAGE_SOURCE_IDS.niceNeurologicalReferral],
        sourceCriterion: 'NICE NG127 covers atraumatic presentations; weakness after an injury is assessed as an injury first.',
      },
    ],
  },

  /* --- Neurology, one-sided facial pain set off by touch ------------------- */
  {
    directionId: 'neurology',
    appliesWhen: (context) => context.complaintId === 'face-general-concern' && context.concernId === 'pain' && context.faceSubregionId !== 'upper-neck',
    pediatricPolicy: 'adult-only',
    minimumSupporting: 3,
    requiredQuestionIds: [INTAKE_QUESTION_IDS.facePainPattern, INTAKE_QUESTION_IDS.facePainSide, INTAKE_QUESTION_IDS.facePainTreatment],
    rationale:
      'NICE NG127 1.3.2 refers adults with unilateral facial pain that is triggered by touching the affected part of the face and is refractory to treatment. All three parts are required.',
    supporting: [
      {
        id: 'neuro-face-triggered',
        label: 'Sudden stabbing pain set off by touch, eating, talking or brushing teeth',
        questionId: INTAKE_QUESTION_IDS.facePainPattern,
        optionIds: ['shock-triggered'],
        sourceIds: [COVERAGE_SOURCE_IDS.niceNeurologicalReferral, COVERAGE_SOURCE_IDS.nhsTrigeminalNeuralgia],
        sourceCriterion: 'NICE NG127 1.3.2: facial pain triggered by touching the affected part of the face.',
      },
      {
        id: 'neuro-face-one-side',
        label: 'On one side of the face',
        questionId: INTAKE_QUESTION_IDS.facePainSide,
        optionIds: ['one-side'],
        sourceIds: [COVERAGE_SOURCE_IDS.niceNeurologicalReferral],
        sourceCriterion: 'NICE NG127 1.3.2: unilateral facial pain.',
      },
      {
        id: 'neuro-face-refractory',
        label: 'Not helped by treatment',
        questionId: INTAKE_QUESTION_IDS.facePainTreatment,
        optionIds: ['not-helped'],
        sourceIds: [COVERAGE_SOURCE_IDS.niceNeurologicalReferral, COVERAGE_SOURCE_IDS.nhsTrigeminalNeuralgia],
        sourceCriterion: 'NICE NG127 1.3.2: refractory to treatment. NHS Trigeminal neuralgia: pain not helped by ordinary painkillers.',
      },
    ],
    excluding: [],
  },

  /* --- ENT, a neck lump that has not gone down ----------------------------- */
  {
    directionId: 'otorhinolaryngology',
    appliesWhen: (context) =>
      (context.bodyRegionId === 'neck' || context.faceSubregionId === 'upper-neck') && context.concernId === 'swelling-lump',
    pediatricPolicy: 'adult-only',
    minimumSupporting: 2,
    requiredQuestionIds: [INTAKE_QUESTION_IDS.swellingDuration],
    rationale:
      'NHS Lumps sends a neck swelling that does not go down within 2 weeks, a lump that gets bigger, or one that is hard and does not move, to a GP, and NICE NG12 names a persistent unexplained neck lump as a head and neck referral feature; the same neck-lump criterion already routes a throat concern to ENT. Persistence past 2 weeks is required and one other feature must be present. A child\'s persisting neck lump goes to Paediatrics.',
    supporting: [
      {
        id: 'ent-neck-lump-persistent',
        label: 'A neck swelling that has not gone down in 2 weeks',
        questionId: INTAKE_QUESTION_IDS.swellingDuration,
        optionIds: ['two-to-six-weeks', 'over-six-weeks'],
        sourceIds: [COVERAGE_SOURCE_IDS.nhsLumps, COVERAGE_SOURCE_IDS.niceSuspectedCancer],
        sourceCriterion: 'NHS Lumps: see a GP if you have a swelling in your neck that does not go down within 2 weeks.',
      },
      {
        id: 'ent-neck-lump-growing',
        label: 'Getting larger',
        questionId: INTAKE_QUESTION_IDS.swellingDetail,
        optionIds: ['growing'],
        sourceIds: [COVERAGE_SOURCE_IDS.nhsLumps],
        sourceCriterion: 'NHS Lumps: see a GP if your lump gets bigger.',
      },
      {
        id: 'ent-neck-lump-hard',
        label: 'Hard, or fixed in place',
        questionId: INTAKE_QUESTION_IDS.swellingDetail,
        optionIds: ['hard-fixed'],
        sourceIds: [COVERAGE_SOURCE_IDS.nhsLumps, COVERAGE_SOURCE_IDS.niceSuspectedCancer],
        sourceCriterion: 'NHS Lumps: see a GP if your lump is hard and does not move.',
      },
    ],
    excluding: [],
  },

  /* --- Neurology, a headache with secondary features ---------------------- */
  {
    directionId: 'neurology',
    appliesWhen: (context) => context.complaintId === 'headache',
    pediatricPolicy: 'adult-only',
    minimumSupporting: 2,
    requiredQuestionIds: [INTAKE_QUESTION_IDS.headacheFeatures],
    rationale:
      'NICE CG150 1.1.1 names features that make a headache need evaluation and consideration of further investigations or referral, and the NHS England RightCare headache toolkit refers a suspected secondary headache to secondary care neurology services. Two distinct features are required, so one answer is never a referral; a single feature stays with General Medicine, whose GP evaluation is what CG150 asks for. The emergency features in the same recommendation (sudden severe onset, new weakness, speech, memory or vision change, impaired consciousness) are R3 hard stops and never routed. NHS Headaches lists a headache triggered or made worse by coughing, sneezing, bending or exercise as a reason for an urgent appointment; that urgency is not modelled here and is listed for clinician review.',
    supporting: [
      {
        id: 'neuro-headache-cough-strain',
        label: 'Brought on by coughing, sneezing or straining',
        questionId: INTAKE_QUESTION_IDS.headacheFeatures,
        optionIds: ['cough-strain'],
        sourceIds: [COVERAGE_SOURCE_IDS.niceHeadache, COVERAGE_SOURCE_IDS.nhsHeadaches],
        sourceCriterion: 'NICE CG150 1.1.1: headache triggered by cough, valsalva or sneeze.',
      },
      {
        id: 'neuro-headache-exercise',
        label: 'Brought on by exercise',
        questionId: INTAKE_QUESTION_IDS.headacheFeatures,
        optionIds: ['exercise'],
        sourceIds: [COVERAGE_SOURCE_IDS.niceHeadache, COVERAGE_SOURCE_IDS.nhsHeadaches],
        sourceCriterion: 'NICE CG150 1.1.1: headache triggered by exercise.',
      },
      {
        id: 'neuro-headache-posture',
        label: 'Changes with sitting up, standing or lying down',
        questionId: INTAKE_QUESTION_IDS.headacheFeatures,
        optionIds: ['posture'],
        sourceIds: [COVERAGE_SOURCE_IDS.niceHeadache],
        sourceCriterion: 'NICE CG150 1.1.1: orthostatic headache (headache that changes with posture).',
      },
      {
        id: 'neuro-headache-changed',
        label: 'Very different from usual headaches',
        questionId: INTAKE_QUESTION_IDS.headacheFeatures,
        optionIds: ['changed'],
        sourceIds: [COVERAGE_SOURCE_IDS.niceHeadache, COVERAGE_SOURCE_IDS.nhsEnglandHeadacheToolkit],
        sourceCriterion: 'NICE CG150 1.1.1: a substantial change in the characteristics of their headache.',
      },
    ],
    excluding: [],
  },

  /* --- ENT, a headache with a persistent/recurrent sinonasal pattern ------- */
  {
    directionId: 'otorhinolaryngology',
    appliesWhen: (context) => context.complaintId === 'headache',
    pediatricPolicy: 'adult-only',
    minimumSupporting: 2,
    requiredQuestionIds: [INTAKE_QUESTION_IDS.headacheSinusSymptoms],
    rationale:
      'NHS Sinusitis describes facial pain, pressure or tenderness with a blocked or runny nose and includes headache as an accompanying symptom. It says a GP may refer to ENT when symptoms remain after 3 months of treatment, keep returning, or are present only on one side of the face. The nasal and facial-pressure pattern is required together with one of those referral features, so headache or nasal symptoms alone never produce an ENT route.',
    supporting: [
      {
        id: 'ent-headache-sinus-symptoms',
        label: 'Blocked or runny nose with facial pressure or tenderness',
        questionId: INTAKE_QUESTION_IDS.headacheSinusSymptoms,
        optionIds: ['yes'],
        sourceIds: [COVERAGE_SOURCE_IDS.nhsSinusitis],
        sourceCriterion: 'NHS Sinusitis: pain, swelling or tenderness around the cheeks, eyes or forehead together with a blocked or runny nose; headache can accompany the pattern.',
      },
      {
        id: 'ent-headache-sinus-one-sided',
        label: 'Nose and facial-pressure symptoms only on one side',
        questionId: INTAKE_QUESTION_IDS.headacheSinusPattern,
        optionIds: ['one-sided'],
        sourceIds: [COVERAGE_SOURCE_IDS.nhsSinusitis],
        sourceCriterion: 'NHS Sinusitis: a GP may refer to ENT when symptoms are only on one side of the face.',
      },
      {
        id: 'ent-headache-sinus-recurrent',
        label: 'Nose and facial-pressure symptoms that keep returning',
        questionId: INTAKE_QUESTION_IDS.headacheSinusPattern,
        optionIds: ['recurrent'],
        sourceIds: [COVERAGE_SOURCE_IDS.nhsSinusitis],
        sourceCriterion: 'NHS Sinusitis: a GP may refer to ENT when sinus symptoms keep returning.',
      },
      {
        id: 'ent-headache-sinus-persistent',
        label: 'Nose and facial-pressure symptoms after 3 months of treatment',
        questionId: INTAKE_QUESTION_IDS.headacheSinusPattern,
        optionIds: ['three-months-treatment'],
        sourceIds: [COVERAGE_SOURCE_IDS.nhsSinusitis],
        sourceCriterion: 'NHS Sinusitis: a GP may refer to ENT when symptoms remain after 3 months of treatment.',
      },
    ],
    excluding: [],
  },

  /* --- Cardiology, breathlessness with a heart failure pattern ------------- */
  {
    directionId: 'cardiology',
    appliesWhen: (context) => context.complaintId === 'shortness-of-breath',
    pediatricPolicy: 'adult-only',
    minimumSupporting: 2,
    requiredQuestionIds: [INTAKE_QUESTION_IDS.breathingAnkles],
    rationale:
      'NHS Heart failure names breathlessness on everyday activity or lying down, with swelling of the feet, ankles or legs, and says a doctor who thinks it may be heart failure refers to a heart specialist (cardiologist). Swelling is required and one breathing feature must go with it, so breathlessness alone never reaches Cardiology. The ankle and lying-flat facts are read from the approved R1 answers when R1 has already asked them. NHS lists breathlessness lying down or on everyday activity as a reason for an urgent appointment; that urgency is not modelled here and is listed for clinician review.',
    supporting: [
      {
        id: 'cardio-breathing-ankles',
        label: 'Swollen feet, ankles or legs',
        questionId: INTAKE_QUESTION_IDS.breathingAnkles,
        optionIds: ['yes'],
        alternates: [{ questionId: 'shortness-of-breath-ankle-swelling', optionIds: ['yes'] }],
        sourceIds: [COVERAGE_SOURCE_IDS.nhsHeartFailure],
        sourceCriterion: 'NHS Heart failure: swelling in your feet, ankles, legs or tummy.',
      },
      {
        id: 'cardio-breathing-lying-flat',
        label: 'Breathing worse when lying down',
        questionId: INTAKE_QUESTION_IDS.breathingLyingFlat,
        optionIds: ['yes'],
        alternates: [{ questionId: 'shortness-of-breath-lying-flat', optionIds: ['yes'] }],
        sourceIds: [COVERAGE_SOURCE_IDS.nhsHeartFailure],
        sourceCriterion: 'NHS Heart failure: feeling out of breath when lying down.',
      },
      {
        id: 'cardio-breathing-effort',
        label: 'Breathless with effort',
        questionId: INTAKE_QUESTION_IDS.breathingActivity,
        optionIds: ['yes'],
        alternates: [{ questionId: INTAKE_QUESTION_IDS.symptomCharacter, optionIds: ['effort'] }],
        sourceIds: [COVERAGE_SOURCE_IDS.nhsHeartFailure],
        sourceCriterion: 'NHS Heart failure: feeling out of breath when doing everyday activities.',
      },
    ],
    excluding: [],
  },

  /* --- Respiratory Medicine, frequent chest infections --------------------- */
  {
    directionId: 'respiratory-medicine',
    appliesWhen: (context) => context.complaintId === 'shortness-of-breath',
    pediatricPolicy: 'adult-only',
    minimumSupporting: 2,
    requiredQuestionIds: [INTAKE_QUESTION_IDS.breathingInfections],
    rationale:
      'NICE NG115 Table 5 lists frequent infections as a reason for specialist advice and 1.1.31 names the respiratory physician as the usual specialist; NHS Bronchiectasis names a cough that does not go away, a lot of phlegm and frequent chest infections, and refers to a specialist for tests. Frequent infections are required and one of the other two features must go with them, so a cough or breathlessness alone never reaches Respiratory Medicine. NG115 is written for people with COPD; applying it to undiagnosed breathlessness is listed for clinician review, as is the NHS urgent level for a lot of phlegm every day.',
    supporting: [
      {
        id: 'resp-frequent-infections',
        label: 'Repeated chest illness episodes',
        questionId: INTAKE_QUESTION_IDS.breathingInfections,
        optionIds: ['yes'],
        sourceIds: [COVERAGE_SOURCE_IDS.niceCopd, COVERAGE_SOURCE_IDS.nhsBronchiectasis],
        sourceCriterion: 'NICE NG115 Table 5: frequent infections is a reason for referral for specialist advice. NHS Bronchiectasis: getting frequent chest infections.',
      },
      {
        id: 'resp-phlegm',
        label: 'Coughing up a lot of phlegm',
        questionId: INTAKE_QUESTION_IDS.breathingPhlegm,
        optionIds: ['yes'],
        sourceIds: [COVERAGE_SOURCE_IDS.nhsBronchiectasis],
        sourceCriterion: 'NHS Bronchiectasis: coughing up a lot of phlegm (mucus).',
      },
      {
        // The same fact asked by the approved R1 breathing question.
        id: 'resp-persistent-cough',
        label: 'A cough that does not go away',
        questionId: 'shortness-of-breath-cough',
        optionIds: ['yes'],
        sourceIds: [COVERAGE_SOURCE_IDS.nhsBronchiectasis, COVERAGE_SOURCE_IDS.nhsCough],
        sourceCriterion: 'NHS Bronchiectasis: a cough that does not go away. NHS Cough: see a GP for a cough lasting more than 3 weeks.',
      },
    ],
    excluding: [],
  },

  /* --- Paediatrics, where the source names paediatric expertise ----------
     These are parent-service sets. They are supported only when no narrower
     service is supported or still reachable, and they say WHY a child goes
     to Paediatrics instead of printing it as a fallback.
     -------------------------------------------------------------------- */
  {
    directionId: 'paediatrics',
    parentService: true,
    appliesWhen: (context, answers) =>
      isPediatric(context) && isAbdominal(context)
      && (context.concernId === 'urinary-change' || associatedSystemIs(answers, 'urinary')
        || answerIncludes(answers, INTAKE_QUESTION_IDS.abdominalAssociated, ['urine-pain'])),
    pediatricPolicy: 'pediatric-only',
    minimumSupporting: 1,
    rationale:
      'NHS says a child aged 15 or younger with urinary symptoms needs an urgent appointment, and NICE NG224 sends a child with recurrent urinary infection, or an upper urinary infection, to a paediatric specialist rather than an adult urology service.',
    supporting: [
      {
        id: 'paeds-urinary-symptom',
        label: 'A urinary symptom in a child',
        questionId: INTAKE_QUESTION_IDS.urinaryDetail,
        optionIds: ['pain', 'frequency', 'wetting', 'difficulty', 'blood'],
        sourceIds: [COVERAGE_SOURCE_IDS.nhsUrinaryTractInfection],
        sourceCriterion: 'NHS UTIs: ask for an urgent GP appointment if your child is aged 15 or younger with symptoms of a UTI.',
      },
      {
        id: 'paeds-urinary-recurrent',
        label: 'It keeps coming back, or comes with side or back pain and fever',
        questionId: INTAKE_QUESTION_IDS.urinaryPattern,
        optionIds: ['recurrent', 'flank-fever'],
        sourceIds: [COVERAGE_SOURCE_IDS.niceChildUti],
        sourceCriterion: 'NICE NG224: refer babies and children who have recurrent UTI for assessment by a paediatric specialist; consider referral with upper UTI.',
      },
    ],
    excluding: [],
  },
  {
    directionId: 'paediatrics',
    parentService: true,
    appliesWhen: (context, answers) =>
      isPediatric(context) && isAbdominal(context)
      && (context.concernId === 'bowel-change' || associatedSystemIs(answers, 'bowel')
        || answerIncludes(answers, INTAKE_QUESTION_IDS.abdominalAssociated, ['diarrhoea', 'constipation'])),
    pediatricPolicy: 'pediatric-only',
    minimumSupporting: 1,
    rationale:
      'NICE CG99 sends a child whose constipation has red flags, or has not responded to treatment within 3 months, to a practitioner with paediatric expertise, and names no adult service; IMNCI treats diarrhoea for 14 days or more and blood in the stool as classifications for the child health service.',
    supporting: [
      {
        id: 'paeds-bowel-persistent',
        label: 'It is not getting better, keeps happening or has lasted 2 weeks or more',
        questionId: INTAKE_QUESTION_IDS.bowelPersistence,
        optionIds: ['not-improving', 'regularly-recurrent', 'two-weeks-plus'],
        sourceIds: [COVERAGE_SOURCE_IDS.niceChildConstipation, COVERAGE_SOURCE_IDS.nhmImnci],
        sourceCriterion: 'NICE CG99: refer children who do not respond to initial treatment within 3 months; IMNCI: diarrhoea for 14 days or more is persistent diarrhoea.',
      },
      {
        id: 'paeds-bowel-red-flag',
        label: 'A sign that needs a child specialist to look at',
        questionId: INTAKE_QUESTION_IDS.pediatricBowelRedFlag,
        optionIds: ['since-birth', 'legs', 'swollen-vomiting', 'growth'],
        sourceIds: [COVERAGE_SOURCE_IDS.niceChildConstipation],
        sourceCriterion: 'NICE CG99: with any red flag, do not treat for constipation; refer urgently to a professional with experience in that aspect of child health.',
      },
      {
        id: 'paeds-bowel-blood',
        label: 'Blood in the poo',
        questionId: INTAKE_QUESTION_IDS.bowelDetail,
        optionIds: ['blood'],
        sourceIds: [COVERAGE_SOURCE_IDS.nhmImnci, COVERAGE_SOURCE_IDS.nhsDiarrhoeaVomiting],
        sourceCriterion: 'IMNCI classifies blood in the stool in a child separately; NHS Diarrhoea and vomiting sends bloody diarrhoea for urgent advice.',
      },
    ],
    excluding: [],
  },
  {
    directionId: 'paediatrics',
    parentService: true,
    appliesWhen: (context) => isPediatric(context) && context.complaintId === 'chest-breathing-concern',
    pediatricPolicy: 'pediatric-only',
    minimumSupporting: 1,
    rationale:
      'IMNCI assesses cough and difficult breathing in children through the child health service, and NBEMS lists no symptom-routable paediatric respiratory discipline; a child\'s wheeze, noisy or fast breathing, or repeated episodes are assessed by Paediatrics.',
    supporting: [
      {
        id: 'paeds-breathing-sign',
        label: 'Wheeze, noisy or fast breathing',
        questionId: INTAKE_QUESTION_IDS.breathingDetail,
        optionIds: ['wheeze', 'noisy-in', 'fast'],
        sourceIds: [COVERAGE_SOURCE_IDS.nhmImnci],
        sourceCriterion: 'IMNCI: a child with cough or difficult breathing is assessed for fast breathing, chest indrawing, stridor and wheeze.',
      },
      {
        id: 'paeds-breathing-recurrent',
        label: 'Breathing problems that have happened before',
        questionId: INTAKE_QUESTION_IDS.breathingRecurrence,
        optionIds: ['once-before', 'keeps-happening'],
        sourceIds: [COVERAGE_SOURCE_IDS.nhmImnci],
        sourceCriterion: 'IMNCI separates recurring wheeze and repeated episodes for follow-up by the child health service.',
      },
    ],
    excluding: [],
  },
  {
    directionId: 'paediatrics',
    parentService: true,
    appliesWhen: (context) => isPediatric(context) && context.complaintId === 'head-concern',
    pediatricPolicy: 'pediatric-only',
    minimumSupporting: 1,
    rationale: 'NHS Headaches in children says to see a doctor if a child regularly gets headaches; it names no specialist referral, so repeated headaches in a child go to Paediatrics.',
    supporting: [
      {
        id: 'paeds-headache-regular',
        label: 'Headaches that happen several times a week or every day',
        questionId: INTAKE_QUESTION_IDS.headFrequency,
        optionIds: ['several-a-week', 'daily'],
        sourceIds: [COVERAGE_SOURCE_IDS.nhsChildHeadache],
        sourceCriterion: 'NHS Headaches in children: see a GP if you or your child regularly get headaches.',
      },
    ],
    excluding: [],
  },
  {
    directionId: 'paediatrics',
    parentService: true,
    appliesWhen: (context, answers) =>
      isPediatric(context) && isMusculoskeletal(context)
      && context.concernId !== 'injury' && !answers.some((answer) => answer.questionId === INTAKE_QUESTION_IDS.injuryDetail),
    pediatricPolicy: 'pediatric-only',
    minimumSupporting: 1,
    rationale: 'NHS Joint pain says to see a GP if a child has joint problems. Without an injury, a child\'s persisting or swollen joint, or a limp, is assessed by Paediatrics.',
    supporting: [
      {
        id: 'paeds-joint-persistent',
        label: 'It has lasted more than 2 weeks or keeps coming back',
        questionId: INTAKE_QUESTION_IDS.mskDuration,
        optionIds: ['two-to-six-weeks', 'over-six-weeks', 'recurring'],
        sourceIds: [COVERAGE_SOURCE_IDS.nhsJointPain],
        sourceCriterion: 'NHS Joint pain: see a GP if a child has joint problems, or pain lasts beyond two weeks.',
      },
      {
        id: 'paeds-joint-swelling-limp',
        label: 'Swelling, locking or giving way',
        questionId: INTAKE_QUESTION_IDS.mskMechanical,
        optionIds: ['swelling', 'locks', 'gives-way'],
        sourceIds: [COVERAGE_SOURCE_IDS.nhsJointPain, COVERAGE_SOURCE_IDS.nhsKneePain],
        sourceCriterion: 'NHS Joint pain: swelling that worsens or recurs; a child with joint problems should be seen.',
      },
      {
        id: 'paeds-joint-limp',
        label: 'Limping or using it less',
        questionId: INTAKE_QUESTION_IDS.injuryFunction,
        optionIds: ['limping', 'cannot'],
        sourceIds: [COVERAGE_SOURCE_IDS.nhsJointPain],
        sourceCriterion: 'NHS Joint pain: see a GP if a child has joint problems.',
      },
    ],
    excluding: [],
  },
  {
    directionId: 'paediatrics',
    parentService: true,
    appliesWhen: (context) => isThroat(context) && isUnderFive(context),
    pediatricPolicy: 'pediatric-only',
    minimumSupporting: 1,
    rationale: 'NHS Sore throat says a child under 5 who needs help for a sore throat should see a GP; with no ENT criterion met, that is Paediatrics.',
    supporting: [
      {
        id: 'paeds-throat-under-five',
        label: 'A throat problem in a child under 5',
        questionId: INTAKE_QUESTION_IDS.throatDetail,
        optionIds: ['sore', 'painful-swallow', 'hoarse', 'swallowing', 'lump-feeling', 'snoring'],
        sourceIds: [COVERAGE_SOURCE_IDS.nhsSoreThroat],
        sourceCriterion: 'NHS Sore throat: see a GP if your child aged under 5 years needs help for a sore throat.',
      },
    ],
    excluding: [],
  },
];

/* -------------------------------------------------------------------------
   Evaluation.
   ------------------------------------------------------------------------- */

export interface SatisfiedCriterion {
  criterionId: string;
  label: string;
  /** The criterion's canonical question, used for required-question logic. */
  questionId: string;
  /** The question that actually recorded this fact (an alternate may have done so). */
  evidenceQuestionId: string;
  optionId: string;
  sourceIds: readonly string[];
  sourceCriterion: string;
}

export interface DirectionAssessment {
  directionId: DirectionId;
  satisfied: readonly SatisfiedCriterion[];
  excluded: readonly SatisfiedCriterion[];
  minimumSupporting: number;
  /** Supporting criteria whose question is unanswered and can still be asked in this run. */
  unansweredCriteria: readonly DirectionCriterion[];
  /**
   * Excluding criteria whose question is unanswered and can still be asked.
   * A direction is not concluded while one of these could still point away
   * from it (evidence sufficiency, PENDING CLINICAL REVIEW).
   */
  unansweredExclusions: readonly DirectionCriterion[];
  rationale: string;
  /** The published criteria are satisfied, before any facility question. */
  criteriaMet: boolean;
  /** Criteria met AND this run may be sent here. */
  supported: boolean;
  /** Criteria met, but the direction is an adult-only service and this is a child. */
  pediatricBlocked: boolean;
  /** A Paediatrics parent-service set rather than a narrower service. */
  parentService: boolean;
  /** Could still become supported if the remaining questions are answered. */
  reachable: boolean;
}

export type DirectionGateStatus = 'supported' | 'competing' | 'open' | 'insufficient' | 'not-applicable';

export interface DirectionGateResult {
  status: DirectionGateStatus;
  /** The single supported direction, when exactly one set is satisfied. */
  direction: DirectionAssessment | null;
  /** Every set that applies to this anatomy, supported or not. */
  assessments: readonly DirectionAssessment[];
  /** Unanswered question ids that could still change the outcome. */
  openDiscriminatorQuestionIds: readonly string[];
  /**
   * For a supported direction: questions still worth asking before it is
   * concluded. Its own unanswered exclusions, then the unanswered criteria of
   * any DIFFERENT narrower service that is still reachable. Answering them
   * either confirms the direction or reveals genuine ambiguity. Empty when
   * nothing is supported.
   */
  differentiationQuestionIds: readonly string[];
  /** Why a parent service would be used right now. Null when a direction is supported. */
  fallbackReason: FallbackReason | null;
}

/**
 * A patient answer the gate may read. Intake answers always; for the weighted
 * complaints, also the answers already given to their approved R1 questions,
 * so a published criterion the patient has already answered is never asked
 * again under another wording. Only the answer is read, never a likelihood.
 */
export interface GateEvidence {
  questionId: string;
  optionId: string;
}

function answerFor(answers: readonly GateEvidence[], questionId: string): string | undefined {
  return answers.find((answer) => answer.questionId === questionId)?.optionId;
}

/** The question a criterion reads, then any question recording the same fact. */
function readings(criterion: DirectionCriterion): readonly { questionId: string; optionIds: readonly string[] }[] {
  return [{ questionId: criterion.questionId, optionIds: criterion.optionIds }, ...(criterion.alternates ?? [])];
}

/** Whether no question recording this criterion's fact has been answered. */
function criterionUnanswered(criterion: DirectionCriterion, answers: readonly GateEvidence[]): boolean {
  return readings(criterion).every((reading) => answerFor(answers, reading.questionId) === undefined);
}

function match(
  criterion: DirectionCriterion,
  answers: readonly GateEvidence[],
): SatisfiedCriterion | null {
  for (const reading of readings(criterion)) {
    // A multi-select answer satisfies the criterion when any chosen option is one it names.
    const chosen = selectedOptionIds(answerFor(answers, reading.questionId));
    const optionId = chosen.find((candidate) => reading.optionIds.includes(candidate));
    if (optionId === undefined) continue;
    return {
      criterionId: criterion.id,
      label: criterion.label,
      // The criterion's own question, so a required question is met whichever wording recorded the fact.
      questionId: criterion.questionId,
      evidenceQuestionId: reading.questionId,
      optionId,
      sourceIds: criterion.sourceIds,
      sourceCriterion: criterion.sourceCriterion,
    };
  }
  return null;
}

/**
 * The question ids this run can still ask: in the context's own question plan,
 * not yet answered, and not ruled out by an answer already given. A question
 * whose show condition waits on an unanswered question is still askable.
 *
 * A criterion whose question cannot be asked here is not an open
 * discriminator. Without this, a forearm skin concern reported the
 * musculoskeletal questions of the orthopaedic set as "still open" although
 * the skin plan never asks them, and a fallback looked premature when it was
 * not.
 */
function askableQuestionIds(context: RegionAssessmentContext, answers: readonly IntakeAnswer[]): ReadonlySet<string> {
  const answered = new Set(answers.map((answer) => answer.questionId));
  const ruledOut = (condition: ShowCondition) =>
    answered.has(condition.questionId) && !answerIncludes(answers, condition.questionId, condition.optionIds);
  return new Set(
    intakeQuestionsFor(context.complaintId, context)
      .filter((question) => !answered.has(question.id))
      .filter((question) => {
        if (!question.showWhen) return true;
        const conditions = Array.isArray(question.showWhen) ? question.showWhen : [question.showWhen as ShowCondition];
        return !conditions.some(ruledOut);
      })
      .map((question) => question.id),
  );
}

function assess(
  set: DirectionCriteriaSet,
  answers: readonly GateEvidence[],
  pediatric: boolean,
  askable: ReadonlySet<string>,
): DirectionAssessment {
  const satisfied = set.supporting
    .map((criterion) => match(criterion, answers))
    .filter((item): item is SatisfiedCriterion => item !== null);
  const excluded = set.excluding
    .map((criterion) => match(criterion, answers))
    .filter((item): item is SatisfiedCriterion => item !== null);
  /*
    Evidence is counted by distinct criterion. Each criterion is a separately
    published feature, so two of them reported in one multi-select answer
    ("fluid from the ear" and "a change in hearing") are two findings. What
    one criterion cannot do is count twice: restating the same feature adds
    nothing, and a single option that names two features ("Both of these")
    is exactly two features.
  */
  const satisfiedQuestions = new Set(satisfied.map((item) => item.questionId));
  const unansweredCriteria = set.supporting.filter(
    (criterion) => criterionUnanswered(criterion, answers) && askable.has(criterion.questionId),
  );
  const unansweredExclusions = set.excluding.filter(
    (criterion) => criterionUnanswered(criterion, answers) && askable.has(criterion.questionId),
  );
  const unansweredQuestions = new Set(unansweredCriteria.map((criterion) => criterion.questionId));
  const required = set.requiredQuestionIds ?? [];
  const requiredMet = required.every((questionId) => satisfiedQuestions.has(questionId));
  // A required question answered with a non-qualifying option can never be met later.
  const requiredStillPossible = required.every(
    (questionId) => satisfiedQuestions.has(questionId) || unansweredQuestions.has(questionId),
  );
  const criteriaMet = excluded.length === 0 && requiredMet && satisfied.length >= set.minimumSupporting;
  /*
    An under-18 run whose criteria are met but whose direction is an adult-only
    service is NOT sent there. It is a paediatric patient who satisfied an
    adult referral criterion, which is a facility question, not an evidence
    question, so the assessment records exactly that.
  */
  const pediatricBlocked = pediatric && set.pediatricPolicy === 'adult-only';
  return {
    directionId: set.directionId,
    satisfied,
    excluded,
    minimumSupporting: set.minimumSupporting,
    unansweredCriteria,
    unansweredExclusions,
    rationale: set.rationale,
    criteriaMet,
    supported: criteriaMet && !pediatricBlocked,
    pediatricBlocked: criteriaMet && pediatricBlocked,
    parentService: set.parentService === true,
    reachable:
      !pediatricBlocked &&
      excluded.length === 0 &&
      requiredStillPossible &&
      satisfied.length + unansweredCriteria.length >= set.minimumSupporting,
  };
}

/** The criteria sets that can apply to this run at all, before any answer is weighed. */
export function applicableCriteriaSets(
  context: RegionAssessmentContext,
  intakeAnswers: readonly IntakeAnswer[],
): readonly DirectionCriteriaSet[] {
  const pediatric = context.patientMode === 'pediatric';
  // An upper tummy "something else" is read as the family its clarifier named.
  const refined = clarifiedContext(context, intakeAnswers);
  return DIRECTION_CRITERIA_SETS.filter((set) =>
    (pediatric || set.pediatricPolicy !== 'pediatric-only') && set.appliesWhen(refined, intakeAnswers));
}

/**
 * Evaluate every criteria set that applies to this anatomy.
 *
 * The result reports what is supported, what is still open, and, when nothing
 * is supported, a named reason. It never reports a probability and never
 * reports a direction that the answers did not satisfy.
 *
 * PRECEDENCE
 *
 *   1. A narrower service whose criteria are met.
 *   2. A narrower service that is still reachable: keep asking.
 *   3. The Paediatrics parent-service set, when its source-backed criterion is
 *      met, so a child's route says why Paediatrics is right.
 *   4. A named fallback reason.
 */
export function evaluateDirectionGate(
  context: RegionAssessmentContext,
  intakeAnswers: readonly IntakeAnswer[],
  routingAnswers: readonly GateEvidence[] = [],
): DirectionGateResult {
  const evidence: readonly GateEvidence[] = [...intakeAnswers, ...routingAnswers];
  const applicable = applicableCriteriaSets(context, intakeAnswers);
  if (applicable.length === 0) {
    return {
      status: 'not-applicable',
      direction: null,
      assessments: [],
      openDiscriminatorQuestionIds: [],
      fallbackReason: 'NO_VALIDATED_NARROW_ROUTE',
      differentiationQuestionIds: [],
    };
  }

  const pediatric = context.patientMode === 'pediatric';
  /*
    A child whose every applicable set is an adult-only service. The model has
    no paediatric criteria for this area, so there is nothing to ask and
    nothing to be satisfied.
  */
  if (pediatric && applicable.every((set) => set.pediatricPolicy === 'adult-only')) {
    return {
      status: 'not-applicable',
      direction: null,
      assessments: [],
      openDiscriminatorQuestionIds: [],
      fallbackReason: 'NO_VALIDATED_NARROW_ROUTE',
      differentiationQuestionIds: [],
    };
  }

  const askable = askableQuestionIds(context, intakeAnswers);
  const assessments = applicable.map((set) => assess(set, evidence, pediatric, askable));
  const narrower = assessments.filter((assessment) => !assessment.parentService);
  const parent = assessments.filter((assessment) => assessment.parentService);
  const openFor = (list: readonly DirectionAssessment[]) => [
    ...new Set(
      list
        .filter((assessment) => assessment.reachable && !assessment.supported)
        .flatMap((assessment) => assessment.unansweredCriteria.map((criterion) => criterion.questionId)),
    ),
  ];
  const openQuestionIds = openFor(assessments);
  const narrowerOpen = openFor(narrower);

  const supportedNarrower = narrower.filter((assessment) => assessment.supported);
  // Two different services both satisfied is genuine ambiguity, not a winner.
  const distinctSupported = [...new Set(supportedNarrower.map((assessment) => assessment.directionId))];
  if (distinctSupported.length === 1) {
    // Prefer the assessment with the most satisfied criteria among sets sharing a direction.
    const best = supportedNarrower.toSorted((left, right) => right.satisfied.length - left.satisfied.length)[0];
    /*
      Evidence sufficiency (PENDING CLINICAL REVIEW). The criteria are met,
      but the direction is not yet differentiated while (a) one of its own
      exclusions can still be asked, or (b) a DIFFERENT narrower service is
      still reachable. Those questions are offered first; the interview asks
      them within its discrimination allowance, then concludes. If the
      competitor is met too, the result is genuine ambiguity, not a winner.
    */
    const exclusions = supportedNarrower
      .filter((assessment) => assessment.directionId === best.directionId)
      .flatMap((assessment) => assessment.unansweredExclusions.map((criterion) => criterion.questionId));
    const competitors = narrower
      .filter((assessment) => assessment.directionId !== best.directionId && assessment.reachable && !assessment.supported)
      .flatMap((assessment) => assessment.unansweredCriteria.map((criterion) => criterion.questionId));
    return {
      status: 'supported',
      direction: best,
      assessments,
      openDiscriminatorQuestionIds: openQuestionIds,
      fallbackReason: null,
      differentiationQuestionIds: [...new Set([...exclusions, ...competitors])],
    };
  }
  if (distinctSupported.length > 1) {
    return {
      status: 'competing',
      direction: null,
      assessments,
      openDiscriminatorQuestionIds: openQuestionIds,
      fallbackReason: 'TRUE_MULTISYSTEM_AMBIGUITY',
      differentiationQuestionIds: [],
    };
  }
  if (narrowerOpen.length > 0) {
    return {
      status: 'open',
      direction: null,
      assessments,
      openDiscriminatorQuestionIds: openQuestionIds,
      fallbackReason: null,
      differentiationQuestionIds: [],
    };
  }

  const supportedParent = parent
    .filter((assessment) => assessment.supported)
    .toSorted((left, right) => right.satisfied.length - left.satisfied.length)[0];
  if (supportedParent) {
    return {
      status: 'supported',
      direction: supportedParent,
      assessments,
      openDiscriminatorQuestionIds: [],
      fallbackReason: null,
      differentiationQuestionIds: [],
    };
  }
  const parentOpen = openFor(parent);
  if (parentOpen.length > 0) {
    return {
      status: 'open',
      direction: null,
      assessments,
      openDiscriminatorQuestionIds: parentOpen,
      fallbackReason: null,
      differentiationQuestionIds: [],
    };
  }

  /*
    A child who satisfied an adult-only service's criteria. The evidence was
    sufficient; the destination is not available for this patient, and saying
    so is different from saying the answers were not good enough.
  */
  if (assessments.some((assessment) => assessment.pediatricBlocked)) {
    return {
      status: 'insufficient',
      direction: null,
      assessments,
      openDiscriminatorQuestionIds: [],
      fallbackReason: 'FACILITY_ROUTE_UNAVAILABLE',
      differentiationQuestionIds: [],
    };
  }

  const anyExcluded = assessments.some((assessment) => assessment.excluded.length > 0);
  return {
    status: 'insufficient',
    direction: null,
    assessments,
    openDiscriminatorQuestionIds: [],
    fallbackReason: anyExcluded ? 'EXCLUDED_BY_COMPETING_PATTERN' : 'INSUFFICIENT_SUPPORTED_EVIDENCE',
    differentiationQuestionIds: [],
  };
}

/** Every source id any applicable set can cite, for the traceability appendix. */
export function directionGateSourceIds(context: RegionAssessmentContext): readonly string[] {
  return [
    ...new Set(
      DIRECTION_CRITERIA_SETS.filter((set) => set.appliesWhen(context, [])).flatMap((set) =>
        [...set.supporting, ...set.excluding].flatMap((criterion) => criterion.sourceIds),
      ),
    ),
  ].toSorted();
}
