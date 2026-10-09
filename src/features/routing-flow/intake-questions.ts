import { BODY_DOMAIN } from '../../body/index.ts';
import {
  COVERAGE_SOURCE_IDS,
  concernOptionsFor,
  type PediatricAgeBand,
  type RegionAssessmentContext,
  type RegionConcernId,
  type ReporterMode,
} from '../body-explorer/clinical-coverage.ts';
import { byVoice, type QuestionVoice } from '../intake/question-voice.ts';

/**
 * Layer A: structured intake questions.
 *
 * These capture how the patient describes their symptom: its character, how
 * strong it is, how long it has been happening, how it began, how it behaves.
 * They are the ordinary history-taking fields a clinician asks first, and they
 * become the Subjective section of the SOAP handoff.
 *
 * THEY ARE NOT ROUTING EVIDENCE.
 *
 * Nothing in this file touches the belief. No answer here has a
 * P(answer | specialty) mapping, because none has been approved. They are
 * recorded as intake metadata, shown back in the session trail, carried into
 * the handoff, and used for exactly one ordering decision documented in
 * interview-plan.ts: an answer that signals acuity pulls the R3 safety screen
 * forward. They never delay, fire or suppress a safety rule.
 *
 * The option sets are descriptive vocabulary, not clinical claims. Each
 * complaint gets only the descriptors that make sense for it: a headache is not
 * offered "cramping", a breathing complaint is not offered "aching".
 */

export type IntakeCategory =
  | 'character'
  | 'intensity'
  | 'duration'
  | 'onset'
  | 'pattern'
  | 'change'
  | 'context';

/**
 * Which instrument draws the answer set.
 *
 *   choice-grid       one answer from a descriptive set
 *   multi-select      several findings that can genuinely coexist; `none`
 *                     style answers are exclusive
 *   yes-no            a single observable fact
 *   segmented         an ordered run: duration, frequency
 *   five-point-scale  the approved impact instrument
 *   body-location     one additional area on the body hologram, or none
 */
export type IntakeControl = 'choice-grid' | 'multi-select' | 'yes-no' | 'five-point-scale' | 'segmented' | 'trend' | 'body-location';

/**
 * Why a question exists. Every question must be one of these, so a question
 * with no purpose cannot be added silently.
 *
 *   CONTEXT            history the clinician needs; routes nothing
 *   CHARACTERIZATION   describes the complaint the patient named
 *   DISCRIMINATION     separates branches or services still in play
 *   GATE_CRITERION     is read directly by a published referral criterion
 *   SAFETY             owned by R3; never an intake question (listed for the
 *                      trace vocabulary only)
 */
export type QuestionPurpose = 'CONTEXT' | 'CHARACTERIZATION' | 'DISCRIMINATION' | 'GATE_CRITERION' | 'SAFETY';

export interface IntakeOption {
  id: string;
  label: string;
}

/** Shown only when the named earlier answer includes one of these options. */
export interface ShowCondition {
  questionId: string;
  optionIds: readonly string[];
}

/** Multi-select answers are stored as their option ids joined with this, in option order. */
export const MULTI_SELECT_SEPARATOR = '+';

export function selectedOptionIds(optionId: string | undefined): readonly string[] {
  return optionId ? optionId.split(MULTI_SELECT_SEPARATOR) : [];
}

export function answerIncludes(answers: readonly IntakeAnswer[], questionId: string, optionIds: readonly string[]): boolean {
  const answer = answers.find((candidate) => candidate.questionId === questionId);
  return selectedOptionIds(answer?.optionId).some((optionId) => optionIds.includes(optionId));
}

export interface IntakeQuestion {
  id: string;
  category: IntakeCategory;
  /** The small context row above the question. */
  eyebrow: string;
  prompt: string;
  control: IntakeControl;
  options: readonly IntakeOption[];
  /**
   * Presentation branching only; these answers never update specialty belief.
   * An array means every condition must hold.
   */
  showWhen?: ShowCondition | readonly ShowCondition[];
  /** Multi-select answers that clear every other choice ("None of these"). */
  exclusiveOptionIds?: readonly string[];
  /**
   * Answers that make a branch-relevant safety check immediately relevant, so
   * the interview asks it next instead of at the end.
   */
  acuityOptionIds?: readonly string[];
  /**
   * `core` is asked in every run of its branch. `extension` exists only to
   * complete a published referral criterion and is asked only while that
   * criterion can still be met.
   */
  stage?: 'core' | 'extension';
  purpose?: QuestionPurpose;
  complaintFamily?: string;
  applicability?: 'adult' | 'pediatric' | 'all';
  ageConstraint?: string;
  routingEvidencePurpose?: string;
  safetyPurpose?: string;
  sourceIds?: readonly string[];
  rationale?: string;
  sensitive?: boolean;
  sensitiveOptionIds?: readonly string[];
  canonicalMeaning?: string;
  wordingVariantId?: string;
  sourceMetadataLevel?: 'direct' | 'inherited-family';
  duplicateEquivalenceGroup?: string;
  progressionStage?: 'entry' | 'characterize' | 'system' | 'discriminate' | 'context';
  branchIds?: readonly string[];
  informationGainRank?: number;
  physiologyEligibility?: 'all' | 'female-reproductive-branch' | 'explicit-neutral-context';
}

export interface IntakeAnswer {
  questionId: string;
  optionId: string;
  answeredAt: string;
}

export const INTAKE_QUESTION_IDS = {
  complaintEntry: 'intake-history-complaint-entry',
  symptomCharacter: 'intake-history-symptom-character',
  currentImpact: 'intake-history-current-impact',
  duration: 'intake-history-duration',
  onset: 'intake-history-onset',
  pattern: 'intake-history-pattern',
  lowerAssociatedSystem: 'intake-lower-associated-system',
  bowelDetail: 'intake-lower-bowel-detail',
  urinaryDetail: 'intake-lower-urinary-detail',
  reproductiveDetail: 'intake-lower-reproductive-detail',
  pregnancyContext: 'intake-lower-pregnancy-context',
  eyeDetail: 'intake-face-eye-detail',
  eyeAssociated: 'intake-face-eye-associated',
  earDetail: 'intake-face-ear-detail',
  earAssociated: 'intake-face-ear-associated',
  pediatricEarObservation: 'intake-pediatric-ear-observation',
  noseDetail: 'intake-face-nose-detail',
  noseAssociated: 'intake-face-nose-associated',
  pediatricNoseObservation: 'intake-pediatric-nose-observation',
  jawDetail: 'intake-face-jaw-detail',
  jawAssociated: 'intake-face-jaw-associated',
  neckDetail: 'intake-neck-associated-detail',
  chestDetail: 'intake-chest-associated-detail',
  skinDetail: 'intake-skin-associated-detail',
  swellingDetail: 'intake-swelling-associated-detail',
  neurologicDetail: 'intake-neurologic-associated-detail',
  injuryDetail: 'intake-injury-associated-detail',
  functionImpact: 'intake-history-function-impact',
  pediatricWellbeing: 'intake-pediatric-overall-wellbeing',
  /* Stage B discriminators. Asked only when Stage A left a direction open. */
  earPersistence: 'intake-face-ear-persistence',
  nosePersistence: 'intake-face-nose-persistence',
  reproductiveTiming: 'intake-lower-reproductive-timing',
  urinaryPattern: 'intake-lower-urinary-pattern',
  bowelPersistence: 'intake-lower-bowel-persistence',
  bowelAlarmFeature: 'intake-lower-bowel-alarm-feature',
  /* Questionnaire rebuild: branch questions. */
  faceLaterality: 'intake-face-laterality',
  eyeSquintPattern: 'intake-face-eye-squint-pattern',
  mouthDetail: 'intake-face-mouth-detail',
  mouthDuration: 'intake-face-mouth-duration',
  throatDetail: 'intake-throat-detail',
  throatAssociated: 'intake-throat-associated',
  throatDuration: 'intake-throat-duration',
  throatRecurrence: 'intake-throat-recurrence',
  throatImpact: 'intake-throat-impact',
  headDetail: 'intake-head-detail',
  headFrequency: 'intake-head-frequency',
  headTriggers: 'intake-head-triggers',
  breathingDetail: 'intake-breathing-detail',
  breathingPattern: 'intake-breathing-pattern',
  breathingRecurrence: 'intake-breathing-recurrence',
  abdominalDetail: 'intake-abdominal-detail',
  abdominalFoodRelation: 'intake-abdominal-food-relation',
  abdominalAssociated: 'intake-abdominal-associated',
  pediatricBowelRedFlag: 'intake-pediatric-bowel-red-flag',
  skinDuration: 'intake-skin-duration',
  skinTreatment: 'intake-skin-treatment',
  skinFeatures: 'intake-skin-features',
  swellingDuration: 'intake-swelling-duration',
  injuryFunction: 'intake-injury-function',
  mskMechanical: 'intake-msk-mechanical',
  mskDuration: 'intake-msk-duration',
  /* Questionnaire intelligence pass (PENDING CLINICAL REVIEW). */
  toothFeatures: 'intake-face-tooth-features',
  jointPattern: 'intake-joint-pattern',
  injuryFeatures: 'intake-injury-features',
  /* Questionnaire expansion phase 2 (PENDING CLINICAL REVIEW). */
  mskSiteFeatures: 'intake-msk-site-features',
  mskWorseWhen: 'intake-msk-worse-when',
  mskHomeTreatment: 'intake-msk-home-treatment',
  neuroDistribution: 'intake-neuro-distribution',
  legVeinFeatures: 'intake-leg-vein-features',
  herniaFeatures: 'intake-hernia-features',
  breastFeatures: 'intake-breast-features',
  templeFeatures: 'intake-temple-features',
  urinaryFeatures: 'intake-urinary-features',
  noseInjuryFeatures: 'intake-nose-injury-features',
  neckInjuryFeatures: 'intake-neck-injury-features',
  oralSwellingSite: 'intake-oral-swelling-site',
  palpitationTriggers: 'intake-palpitation-triggers',
  /* Normalization pass: branch follow-ups and one split concept. */
  nosebleedAssociated: 'intake-face-nosebleed-associated',
  noseTreatment: 'intake-face-nose-treatment',
  bowelBleedingDuration: 'intake-lower-bowel-bleeding-duration',
  bowelTreatment: 'intake-lower-bowel-treatment',
  bowelHabitDuration: 'intake-lower-bowel-habit-duration',
  bowelSystemic: 'intake-lower-bowel-systemic',
  neurologicFeatures: 'intake-neurologic-associated-features',
  /* Routing reconciliation: branch concepts that give a narrower service a sourced entry. */
  chestPainCharacter: 'intake-chest-pain-character',
  chestPainTrigger: 'intake-chest-pain-trigger',
  chestPainRelief: 'intake-chest-pain-relief',
  palpitationFrequency: 'intake-palpitation-frequency',
  palpitationLength: 'intake-palpitation-episode-length',
  palpitationHistory: 'intake-palpitation-history',
  upperGiSymptom: 'intake-upper-gi-symptom',
  upperGiFrequency: 'intake-upper-gi-frequency',
  upperGiTreatment: 'intake-upper-gi-treatment',
  upperGiAlarm: 'intake-upper-gi-alarm',
  neurologicCourse: 'intake-neurologic-course',
  neurologicWaking: 'intake-neurologic-waking',
  facePainPattern: 'intake-face-pain-pattern',
  facePainSide: 'intake-face-pain-side',
  facePainTreatment: 'intake-face-pain-treatment',
  movementDetail: 'intake-movement-detail',
  eyeInjuryDetail: 'intake-face-eye-injury',
  backLegSymptoms: 'intake-back-leg-symptoms',
  dizzinessDetail: 'intake-dizziness-detail',
  dizzinessAssociated: 'intake-dizziness-associated',
  /** The reusable associated-location concept: one additional body area, or none. */
  associatedLocation: 'intake-associated-location',
  /* Clinical blocker pass: headache, breathing and upper tummy discriminators. */
  headacheFeatures: 'intake-headache-features',
  headacheSinusSymptoms: 'intake-headache-sinus-symptoms',
  headacheSinusPattern: 'intake-headache-sinus-pattern',
  breathingInfections: 'intake-breathing-infections',
  breathingPhlegm: 'intake-breathing-phlegm',
  breathingAnkles: 'intake-breathing-ankles',
  breathingLyingFlat: 'intake-breathing-lying-flat',
  breathingActivity: 'intake-breathing-activity',
  abdomenInjuryTiming: 'intake-abdomen-injury-timing',
  abdomenInjuryMovement: 'intake-abdomen-injury-movement',
  abdomenInjuryFeatures: 'intake-abdomen-injury-features',
  otherClarifier: 'intake-other-clarifier',
} as const;

export type CanonicalIntakeQuestionId = typeof INTAKE_QUESTION_IDS[keyof typeof INTAKE_QUESTION_IDS];

export interface CanonicalAgeApplicability {
  minimumAgeYears: number | null;
  maximumAgeYears: number | null;
  sourcePopulation: string;
  interpretationDifference: string | null;
}

export interface CanonicalIntakeQuestionDefinition {
  id: CanonicalIntakeQuestionId;
  canonicalMeaning: string;
  complaintFamilies: readonly string[] | 'context-resolved';
  bodyRegionApplicability: readonly string[] | 'all-supported-regions';
  adultApplicable: boolean;
  pediatricApplicable: boolean;
  pediatricAgeBands: readonly PediatricAgeBand[];
  ageApplicability: readonly CanonicalAgeApplicability[];
  physiologyApplicability: 'all' | 'pregnancy-possible-direct-report-only';
  reporterApplicability: readonly ReporterMode[];
  routingEvidenceUse: string;
  safetyUse: string;
  sourceIds: readonly string[];
  sourceMetadataLevel: 'direct' | 'inherited-family';
  duplicateEquivalenceGroup: string;
  wordingVariantIds: readonly string[];
}

const ALL_PEDIATRIC_BANDS: readonly PediatricAgeBand[] = [
  'infant-under-one',
  'young-child',
  'school-age',
  'adolescent',
];
const ALL_REPORTERS: readonly ReporterMode[] = ['caregiver', 'patient-or-caregiver', 'patient'];
const ALL_AGES: readonly CanonicalAgeApplicability[] = [{
  minimumAgeYears: null,
  maximumAgeYears: null,
  sourcePopulation: 'All ages; wording is resolved for the current reporter.',
  interpretationDifference: null,
}];

function commonDefinition(
  id: CanonicalIntakeQuestionId,
  canonicalMeaning: string,
  duplicateEquivalenceGroup: string,
  wordingVariantIds: readonly string[] = ['patient', 'caregiver', 'young-person'],
): CanonicalIntakeQuestionDefinition {
  return {
    id,
    canonicalMeaning,
    complaintFamilies: 'context-resolved',
    bodyRegionApplicability: 'all-supported-regions',
    adultApplicable: true,
    pediatricApplicable: true,
    pediatricAgeBands: ALL_PEDIATRIC_BANDS,
    ageApplicability: ALL_AGES,
    physiologyApplicability: 'all',
    reporterApplicability: ALL_REPORTERS,
    routingEvidenceUse: 'Descriptive context only; no numeric specialty likelihood is assigned and it never updates specialty belief.',
    safetyUse: 'May advance the R3 screen but cannot satisfy or suppress a safety predicate.',
    sourceIds: [COVERAGE_SOURCE_IDS.cmsHpi],
    sourceMetadataLevel: 'inherited-family',
    duplicateEquivalenceGroup,
    wordingVariantIds,
  };
}

/**
 * A Stage B discriminator definition.
 *
 * The routing-evidence wording is deliberately explicit: the answer assigns no
 * numeric specialty likelihood, and it is read by the deterministic
 * source-cited criteria in direction-gate.ts. Those are two different claims
 * and the distinction is the whole point of that module.
 */
function discriminatorDefinition(
  id: CanonicalIntakeQuestionId,
  canonicalMeaning: string,
  duplicateEquivalenceGroup: string,
  sourceIds: readonly string[],
  routingEvidenceUse: string,
): CanonicalIntakeQuestionDefinition {
  return {
    ...commonDefinition(id, canonicalMeaning, duplicateEquivalenceGroup, ['patient', 'caregiver', 'young-person']),
    sourceIds,
    sourceMetadataLevel: 'direct',
    routingEvidenceUse: `${routingEvidenceUse} No numeric specialty likelihood is assigned; the answer is read only by the deterministic source-cited direction gate.`,
  };
}


/** A branch concept added by the questionnaire rebuild, with its direct sources. */
function branchDefinition(
  id: CanonicalIntakeQuestionId,
  canonicalMeaning: string,
  duplicateEquivalenceGroup: string,
  bodyRegionApplicability: readonly string[] | 'all-supported-regions',
  sourceIds: readonly string[],
): CanonicalIntakeQuestionDefinition {
  return {
    ...commonDefinition(id, canonicalMeaning, duplicateEquivalenceGroup, ['patient', 'caregiver']),
    bodyRegionApplicability,
    sourceIds,
    sourceMetadataLevel: 'direct',
  };
}

export const CANONICAL_INTAKE_QUESTIONS: readonly CanonicalIntakeQuestionDefinition[] = [
  commonDefinition(INTAKE_QUESTION_IDS.complaintEntry, 'Patient-stated type of concern at the selected location.', 'complaint-entry'),
  commonDefinition(
    INTAKE_QUESTION_IDS.symptomCharacter,
    'Patient-described quality or character of the symptom.',
    'symptom-character',
    ['patient', 'caregiver', 'young-person', 'adult-upper-abdominal', 'adult-breathing', 'adult-headache', 'adult-joint'],
  ),
  commonDefinition(
    INTAKE_QUESTION_IDS.currentImpact,
    'Current patient-reported symptom impact on a five-point verbal scale.',
    'current-impact',
    ['patient', 'caregiver', 'young-person', 'adult-standard', 'adult-breathing'],
  ),
  commonDefinition(INTAKE_QUESTION_IDS.duration, 'Elapsed duration of the current concern.', 'duration', ['shared']),
  commonDefinition(INTAKE_QUESTION_IDS.onset, 'Whether onset was gradual, sudden, event-related or uncertain.', 'onset', ['shared']),
  commonDefinition(INTAKE_QUESTION_IDS.pattern, 'Whether the concern is constant, intermittent, triggered or uncertain.', 'pattern', ['shared']),
  {
    ...commonDefinition(INTAKE_QUESTION_IDS.lowerAssociatedSystem, 'Associated bowel, urinary, reproductive, movement-related or systemic change.', 'lower-associated-system', ['shared']),
    bodyRegionApplicability: ['lower-abdomen', 'pelvis'],
    sourceIds: [COVERAGE_SOURCE_IDS.nhsPelvicPain],
    sourceMetadataLevel: 'direct',
  },
  {
    ...commonDefinition(INTAKE_QUESTION_IDS.bowelDetail, 'Patient-reported bowel change accompanying a lower abdominal or pelvic concern.', 'lower-bowel-detail', ['shared']),
    bodyRegionApplicability: ['lower-abdomen', 'pelvis'],
    sourceIds: [COVERAGE_SOURCE_IDS.nhsPelvicPain],
    sourceMetadataLevel: 'direct',
  },
  {
    ...commonDefinition(INTAKE_QUESTION_IDS.urinaryDetail, 'Patient-reported urinary change accompanying a lower abdominal or pelvic concern.', 'lower-urinary-detail', ['shared']),
    bodyRegionApplicability: ['lower-abdomen', 'pelvis'],
    sourceIds: [COVERAGE_SOURCE_IDS.nhsPelvicPain],
    sourceMetadataLevel: 'direct',
  },
  {
    ...commonDefinition(INTAKE_QUESTION_IDS.reproductiveDetail, 'Patient-reported reproductive, pelvic or genital change accompanying a lower abdominal or pelvic concern.', 'lower-reproductive-detail', ['adult-private']),
    bodyRegionApplicability: ['lower-abdomen', 'pelvis'],
    pediatricApplicable: false,
    pediatricAgeBands: [],
    ageApplicability: [{
      minimumAgeYears: 18,
      maximumAgeYears: null,
      sourcePopulation: 'Adult patient who explicitly selected a reproductive, pelvic or genital concern.',
      interpretationDifference: 'Pediatric lower-abdominal concerns use observable bowel, urinary, movement and systemic discriminators pending local safeguarding approval for private reproductive intake.',
    }],
    reporterApplicability: ['patient'],
    sourceIds: [COVERAGE_SOURCE_IDS.nhsPelvicPain],
    sourceMetadataLevel: 'direct',
  },
  {
    ...commonDefinition(INTAKE_QUESTION_IDS.pregnancyContext, 'Direct, private report of whether pregnancy may be possible or confirmed.', 'pregnancy-context', ['adult-private']),
    bodyRegionApplicability: ['lower-abdomen', 'pelvis'],
    pediatricApplicable: false,
    pediatricAgeBands: [],
    ageApplicability: [{
      minimumAgeYears: 18,
      maximumAgeYears: null,
      sourcePopulation: 'The source names pregnancy context but no adolescent threshold; this shared-kiosk prototype limits the question to adult mode pending local privacy and safeguarding approval.',
      interpretationDifference: 'Pediatric reproductive concerns remain available to Paediatrics and safety review without displaying this private question.',
    }],
    physiologyApplicability: 'pregnancy-possible-direct-report-only',
    reporterApplicability: ['patient'],
    sourceIds: [COVERAGE_SOURCE_IDS.nhsPelvicPain],
    sourceMetadataLevel: 'direct',
  },
  {
    ...commonDefinition(INTAKE_QUESTION_IDS.eyeDetail, 'Eye-specific vision, redness, light sensitivity, discharge or injury detail.', 'face-eye-detail', ['shared']),
    bodyRegionApplicability: ['face'],
    sourceIds: [COVERAGE_SOURCE_IDS.nhsEyePain],
    sourceMetadataLevel: 'direct',
  },
  {
    ...commonDefinition(INTAKE_QUESTION_IDS.eyeAssociated, 'Associated eye symptoms used only after an eye complaint is established.', 'face-eye-associated', ['shared']),
    bodyRegionApplicability: ['face'],
    sourceIds: [COVERAGE_SOURCE_IDS.nhsEyePain],
    sourceMetadataLevel: 'direct',
  },
  {
    ...commonDefinition(INTAKE_QUESTION_IDS.earDetail, 'Ear-specific hearing, ringing, discharge, balance or swelling detail.', 'face-ear-detail', ['shared']),
    bodyRegionApplicability: ['face'],
    sourceIds: [COVERAGE_SOURCE_IDS.nhsEarInfections, COVERAGE_SOURCE_IDS.nhsHearingLoss, COVERAGE_SOURCE_IDS.nhsTinnitus, COVERAGE_SOURCE_IDS.nhsVertigo],
    sourceMetadataLevel: 'direct',
  },
  {
    ...commonDefinition(INTAKE_QUESTION_IDS.earAssociated, 'Associated local, hearing, balance and systemic features after an ear complaint is established.', 'face-ear-associated', ['shared']),
    bodyRegionApplicability: ['face'],
    sourceIds: [COVERAGE_SOURCE_IDS.nhsEarInfections, COVERAGE_SOURCE_IDS.nhsHearingLoss, COVERAGE_SOURCE_IDS.nhsTinnitus, COVERAGE_SOURCE_IDS.nhsVertigo],
    sourceMetadataLevel: 'direct',
  },
  {
    ...commonDefinition(INTAKE_QUESTION_IDS.pediatricEarObservation, 'Caregiver-observable ear behaviour, sound response, feeding, balance or discharge.', 'pediatric-ear-observation', ['caregiver', 'young-person']),
    bodyRegionApplicability: ['face'],
    adultApplicable: false,
    pediatricApplicable: true,
    reporterApplicability: ['caregiver', 'patient-or-caregiver'],
    sourceIds: [COVERAGE_SOURCE_IDS.nhsEarInfections],
    sourceMetadataLevel: 'direct',
  },
  {
    ...commonDefinition(INTAKE_QUESTION_IDS.noseDetail, 'Nose-specific blockage, discharge, smell, bleeding, pressure or injury detail.', 'face-nose-detail', ['shared']),
    bodyRegionApplicability: ['face'],
    sourceIds: [COVERAGE_SOURCE_IDS.nhsSinusitis, COVERAGE_SOURCE_IDS.nhsNosebleed],
    sourceMetadataLevel: 'direct',
  },
  {
    ...commonDefinition(INTAKE_QUESTION_IDS.noseAssociated, 'Sinonasal features that accompany a nose complaint: facial pressure, fever, tooth or ear pressure, one-sided symptoms, recurrence.', 'face-nose-associated', ['shared']),
    bodyRegionApplicability: ['face'],
    sourceIds: [COVERAGE_SOURCE_IDS.nhsSinusitis],
    sourceMetadataLevel: 'direct',
  },
  {
    /*
      Split from face-nose-associated by the normalization pass. The same id
      used to carry two meanings, sinonasal features on one branch and bleeding
      burden on the other, which made one evidence id mean two different
      things. Bleeding burden is its own concept now.
    */
    ...commonDefinition(INTAKE_QUESTION_IDS.nosebleedAssociated, 'Bleeding-burden features after a nosebleed or nasal injury: swallowed blood, weakness or dizziness, breathing difficulty, a blow to the head, blood-thinning medicine.', 'face-nosebleed-associated', ['shared']),
    bodyRegionApplicability: ['face'],
    sourceIds: [COVERAGE_SOURCE_IDS.nhsNosebleed],
    sourceMetadataLevel: 'direct',
  },
  {
    ...commonDefinition(INTAKE_QUESTION_IDS.pediatricNoseObservation, 'Caregiver-observable nasal blockage, mouth breathing, feeding difficulty, irritability or bleeding.', 'pediatric-nose-observation', ['caregiver', 'young-person']),
    bodyRegionApplicability: ['face'],
    adultApplicable: false,
    pediatricApplicable: true,
    reporterApplicability: ['caregiver', 'patient-or-caregiver'],
    sourceIds: [COVERAGE_SOURCE_IDS.nhsSinusitis, COVERAGE_SOURCE_IDS.nhsNosebleed],
    sourceMetadataLevel: 'direct',
  },
  {
    ...commonDefinition(INTAKE_QUESTION_IDS.jawDetail, 'Jaw movement, opening, locking, chewing and injury detail.', 'face-jaw-detail', ['shared']),
    bodyRegionApplicability: ['face'],
    sourceIds: [COVERAGE_SOURCE_IDS.nhsTmd],
    sourceMetadataLevel: 'direct',
  },
  {
    ...commonDefinition(INTAKE_QUESTION_IDS.jawAssociated, 'Associated dental, ear, temple, headache or visual features after a jaw complaint.', 'face-jaw-associated', ['shared']),
    bodyRegionApplicability: ['face'],
    sourceIds: [COVERAGE_SOURCE_IDS.nhsTmd, COVERAGE_SOURCE_IDS.nhsMouthUlcers],
    sourceMetadataLevel: 'direct',
  },
  {
    ...commonDefinition(INTAKE_QUESTION_IDS.neckDetail, 'Associated neurological, voice, swallowing, fever or movement change with a neck concern.', 'neck-associated-detail', ['shared']),
    bodyRegionApplicability: ['neck', 'face'],
    sourceIds: [COVERAGE_SOURCE_IDS.nhsNeckPain, COVERAGE_SOURCE_IDS.niceMeningitis],
    sourceMetadataLevel: 'direct',
  },
  {
    ...commonDefinition(INTAKE_QUESTION_IDS.chestDetail, 'Associated breathing, systemic, spreading, meal-related or movement-related chest change.', 'chest-associated-detail', ['shared']),
    bodyRegionApplicability: ['chest'],
    sourceIds: [COVERAGE_SOURCE_IDS.nhsChestPain],
    sourceMetadataLevel: 'direct',
  },
  {
    ...commonDefinition(INTAKE_QUESTION_IDS.skinDetail, 'Appearance, progression, exposure and airway association of a skin or swelling concern.', 'skin-associated-detail', ['shared']),
    sourceIds: [COVERAGE_SOURCE_IDS.nhsAllergy],
    sourceMetadataLevel: 'direct',
  },
  commonDefinition(INTAKE_QUESTION_IDS.swellingDetail, 'Location, progression, tenderness and skin change associated with a swelling or lump.', 'swelling-associated-detail'),
  commonDefinition(INTAKE_QUESTION_IDS.neurologicDetail, 'Distribution, timing and functional effect of weakness, drooping, numbness or tingling.', 'neurologic-associated-detail'),
  commonDefinition(INTAKE_QUESTION_IDS.injuryDetail, 'Mechanism and immediate functional or sensory change after an injury.', 'injury-associated-detail'),
  commonDefinition(INTAKE_QUESTION_IDS.functionImpact, 'Effect of the concern on use of the area or usual activities.', 'function-impact'),
  {
    ...commonDefinition(INTAKE_QUESTION_IDS.pediatricWellbeing, 'Observable change in a child or young person\'s responsiveness and usual behaviour.', 'pediatric-overall-wellbeing', ['caregiver', 'young-person']),
    adultApplicable: false,
    pediatricApplicable: true,
    ageApplicability: [{
      minimumAgeYears: 0,
      maximumAgeYears: 17,
      sourcePopulation: 'Generic history wording applies through age 17; WHO IMCI and NICE danger-sign interpretation is limited to their separately recorded source populations.',
      interpretationDifference: 'This intake answer is descriptive only; age-specific R3 questions own escalation.',
    }],
    reporterApplicability: ['caregiver', 'patient-or-caregiver'],
    sourceIds: [COVERAGE_SOURCE_IDS.cmsHpi, COVERAGE_SOURCE_IDS.whoImci, COVERAGE_SOURCE_IDS.niceFeverUnderFive],
    sourceMetadataLevel: 'inherited-family',
  },
  /*
    Stage B discriminators.

    Each of these exists because a published referral criterion asks for it and
    the interview could not otherwise answer it. They are still descriptive
    history: no answer here carries a numeric specialty likelihood. What they
    do carry is a deterministic, source-cited criterion evaluated in
    direction-gate.ts, which is a different kind of claim from a probability.
  */
  discriminatorDefinition(
    INTAKE_QUESTION_IDS.earPersistence,
    'How long the ear concern has lasted, and whether it recurs.',
    'ear-persistence',
    [COVERAGE_SOURCE_IDS.nhsEarache, COVERAGE_SOURCE_IDS.nhsEarInfections],
    'Separates a first short episode from the persistence and recurrence NHS Earache sends to a clinician.',
  ),
  discriminatorDefinition(
    INTAKE_QUESTION_IDS.nosePersistence,
    'How long the nasal or sinus concern has continued.',
    'nose-persistence',
    [COVERAGE_SOURCE_IDS.nhsSinusitis],
    'Encodes the three-week and three-month points NHS Sinusitis names for escalation and ENT referral.',
  ),
  {
    ...discriminatorDefinition(
      INTAKE_QUESTION_IDS.reproductiveTiming,
      'When reproductive bleeding or pelvic symptoms occur relative to the cycle.',
      'reproductive-timing',
      [COVERAGE_SOURCE_IDS.nhsAbnormalVaginalBleeding, COVERAGE_SOURCE_IDS.nhsHeavyPeriods, COVERAGE_SOURCE_IDS.nhsPelvicPain],
      'Separates bleeding outside the usual pattern, which NHS says is always checked, from cycle-related symptoms.',
    ),
    pediatricApplicable: false,
    pediatricAgeBands: [],
    physiologyApplicability: 'pregnancy-possible-direct-report-only',
    reporterApplicability: ['patient'],
    ageApplicability: [{
      minimumAgeYears: 18,
      maximumAgeYears: null,
      sourcePopulation: 'Adults who have explicitly selected a reproductive or pelvic branch and for whom reproductive physiology is relevant.',
      interpretationDifference: 'Never offered on a male run, never offered to a child, and never inferred from artwork or from a label.',
    }],
  },
  {
    ...discriminatorDefinition(
      INTAKE_QUESTION_IDS.urinaryPattern,
      'Whether the urinary concern recurs, obstructs, or involves the flank with systemic features.',
      'urinary-pattern',
      [COVERAGE_SOURCE_IDS.nhsUrinaryTractInfection, COVERAGE_SOURCE_IDS.nhsPelvicPain],
      'Separates a single lower urinary episode from recurrence, obstruction and possible upper-tract involvement.',
    ),
    // NICE NG224 makes recurrence the question for children too; it is what
    // takes a child to a paediatric specialist rather than an adult service.
    sourceIds: [COVERAGE_SOURCE_IDS.nhsUrinaryTractInfection, COVERAGE_SOURCE_IDS.nhsPelvicPain, COVERAGE_SOURCE_IDS.niceChildUti],
  },
  discriminatorDefinition(
    INTAKE_QUESTION_IDS.bowelPersistence,
    'Whether the bowel change is a recent first episode, is not improving, or recurs regularly.',
    'bowel-persistence',
    [COVERAGE_SOURCE_IDS.nhsConstipation, COVERAGE_SOURCE_IDS.nhsPelvicPain],
    'Encodes the not-improving and regularly-recurrent criteria NHS Constipation sends to a GP.',
  ),
  discriminatorDefinition(
    INTAKE_QUESTION_IDS.bowelAlarmFeature,
    'Whether a sudden bowel-habit change or unintended weight loss accompanies the bowel concern.',
    'bowel-alarm-feature',
    [COVERAGE_SOURCE_IDS.nhsConstipation],
    'Encodes the sudden bowel-habit change and unintended weight-loss criteria NHS Constipation sends to a GP.',
  ),
  /* --- Questionnaire rebuild branch concepts ----------------------------- */
  branchDefinition(INTAKE_QUESTION_IDS.faceLaterality, 'Whether an eye or ear concern affects the selected side only or both sides.', 'face-laterality', ['face'], [COVERAGE_SOURCE_IDS.nhsEyePain, COVERAGE_SOURCE_IDS.nhsEarInfections]),
  branchDefinition(INTAKE_QUESTION_IDS.eyeSquintPattern, 'Whether an eye turn is present all the time or comes and goes.', 'eye-squint-pattern', ['face'], [COVERAGE_SOURCE_IDS.nhsSquint]),
  branchDefinition(INTAKE_QUESTION_IDS.mouthDetail, 'The main mouth change: a sore or ulcer, tooth or gum pain, bleeding, a patch or a lump.', 'mouth-detail', ['face'], [COVERAGE_SOURCE_IDS.nhsMouthUlcers, COVERAGE_SOURCE_IDS.niceSuspectedCancer]),
  branchDefinition(INTAKE_QUESTION_IDS.mouthDuration, 'How long a mouth sore or change has lasted, in the bands the mouth ulcer guidance uses.', 'mouth-duration', ['face'], [COVERAGE_SOURCE_IDS.nhsMouthUlcers, COVERAGE_SOURCE_IDS.niceSuspectedCancer]),
  branchDefinition(INTAKE_QUESTION_IDS.throatDetail, 'The main throat symptom: soreness, painful swallowing, voice change, swallowing difficulty or a lump feeling.', 'throat-detail', ['neck', 'face'], [COVERAGE_SOURCE_IDS.nhsSoreThroat, COVERAGE_SOURCE_IDS.nhsLaryngitis, COVERAGE_SOURCE_IDS.nhsDysphagia]),
  branchDefinition(INTAKE_QUESTION_IDS.throatAssociated, 'Features that accompany a throat concern: fever, swollen glands, a neck lump, ear pain, cold symptoms or snoring.', 'throat-associated', ['neck', 'face'], [COVERAGE_SOURCE_IDS.nhsSoreThroat, COVERAGE_SOURCE_IDS.nhsTonsillitis, COVERAGE_SOURCE_IDS.nhsLumps]),
  branchDefinition(INTAKE_QUESTION_IDS.throatDuration, 'How long the current throat concern has lasted, in the one, two and three week bands the throat guidance uses.', 'throat-duration', ['neck', 'face'], [COVERAGE_SOURCE_IDS.nhsSoreThroat, COVERAGE_SOURCE_IDS.nhsLaryngitis, COVERAGE_SOURCE_IDS.nhsLumps]),
  branchDefinition(INTAKE_QUESTION_IDS.throatRecurrence, 'How often sore throats like this have happened, in the frequency bands of the tonsillectomy referral criteria.', 'throat-recurrence', ['neck', 'face'], [COVERAGE_SOURCE_IDS.aomrcTonsillectomy, COVERAGE_SOURCE_IDS.nhsTonsillitis]),
  branchDefinition(INTAKE_QUESTION_IDS.throatImpact, 'Whether repeated sore throats are disabling and stop normal activities.', 'throat-impact', ['neck', 'face'], [COVERAGE_SOURCE_IDS.aomrcTonsillectomy]),
  branchDefinition(INTAKE_QUESTION_IDS.headDetail, 'Where the headache is and what it feels like, in words a child or caregiver can report.', 'head-detail', ['head'], [COVERAGE_SOURCE_IDS.nhsChildHeadache]),
  branchDefinition(INTAKE_QUESTION_IDS.headFrequency, 'How often headaches happen: first time, now and then, several times a week or every day.', 'head-frequency', ['head'], [COVERAGE_SOURCE_IDS.nhsChildHeadache]),
  branchDefinition(INTAKE_QUESTION_IDS.headTriggers, 'What seems to bring the headache on: screens or reading, activity, missed food or drink, tiredness or stress.', 'head-triggers', ['head'], [COVERAGE_SOURCE_IDS.nhsChildHeadache]),
  branchDefinition(INTAKE_QUESTION_IDS.breathingDetail, 'The breathing features noticed: cough, wheeze, noisy breathing in, fast breathing or chest tightness.', 'breathing-detail', ['chest'], [COVERAGE_SOURCE_IDS.nhmImnci]),
  branchDefinition(INTAKE_QUESTION_IDS.breathingPattern, 'When the breathing problem happens: at night, with activity, with colds, all the time or on and off.', 'breathing-pattern', ['chest'], [COVERAGE_SOURCE_IDS.nhmImnci]),
  branchDefinition(INTAKE_QUESTION_IDS.breathingRecurrence, 'Whether breathing episodes like this have happened before.', 'breathing-recurrence', ['chest'], [COVERAGE_SOURCE_IDS.nhmImnci]),
  branchDefinition(INTAKE_QUESTION_IDS.abdominalDetail, 'Where in the upper tummy the discomfort is and what it is like.', 'abdominal-detail', ['upper-abdomen'], [COVERAGE_SOURCE_IDS.nhsDiarrhoeaVomiting, COVERAGE_SOURCE_IDS.nhmImnci]),
  branchDefinition(INTAKE_QUESTION_IDS.abdominalFoodRelation, 'Whether the tummy discomfort is related to eating or hunger.', 'abdominal-food-relation', ['upper-abdomen'], [COVERAGE_SOURCE_IDS.nhsDiarrhoeaVomiting]),
  branchDefinition(INTAKE_QUESTION_IDS.abdominalAssociated, 'Digestive, urinary and systemic features that accompany an upper tummy concern.', 'abdominal-associated', ['upper-abdomen'], [COVERAGE_SOURCE_IDS.nhsDiarrhoeaVomiting, COVERAGE_SOURCE_IDS.nhmImnci]),
  {
    ...branchDefinition(INTAKE_QUESTION_IDS.pediatricBowelRedFlag, 'Caregiver-reportable bowel red flags: problems since the first weeks of life, leg weakness, tummy swelling with vomiting, or faltering growth.', 'pediatric-bowel-red-flag', ['lower-abdomen', 'pelvis', 'upper-abdomen'], [COVERAGE_SOURCE_IDS.niceChildConstipation]),
    adultApplicable: false,
  },
  branchDefinition(INTAKE_QUESTION_IDS.skinDuration, 'How long a skin change has been present, or whether it keeps coming back.', 'skin-duration', 'all-supported-regions', [COVERAGE_SOURCE_IDS.nicePsoriasis, COVERAGE_SOURCE_IDS.niceChildEczema, COVERAGE_SOURCE_IDS.nhsMoles]),
  branchDefinition(INTAKE_QUESTION_IDS.skinTreatment, 'Whether treatment already tried has settled the skin change.', 'skin-treatment', 'all-supported-regions', [COVERAGE_SOURCE_IDS.nicePsoriasis, COVERAGE_SOURCE_IDS.niceChildEczema]),
  branchDefinition(INTAKE_QUESTION_IDS.skinFeatures, 'Referral-relevant skin features: a changing mole or spot, bleeding or crusting, widespread involvement, or impact on sleep, school or work.', 'skin-features', 'all-supported-regions', [COVERAGE_SOURCE_IDS.nhsMoles, COVERAGE_SOURCE_IDS.niceSuspectedCancer, COVERAGE_SOURCE_IDS.nicePsoriasis, COVERAGE_SOURCE_IDS.niceChildEczema]),
  branchDefinition(INTAKE_QUESTION_IDS.swellingDuration, 'How long a swelling or lump has been present, in the two-week band the lumps guidance uses.', 'swelling-duration', 'all-supported-regions', [COVERAGE_SOURCE_IDS.nhsLumps]),
  branchDefinition(INTAKE_QUESTION_IDS.injuryFunction, 'How well the injured or painful part can be used or can bear weight.', 'injury-function', 'all-supported-regions', [COVERAGE_SOURCE_IDS.nhsJointPain, COVERAGE_SOURCE_IDS.nhsKneePain, COVERAGE_SOURCE_IDS.nhsSprains]),
  branchDefinition(INTAKE_QUESTION_IDS.mskMechanical, 'Mechanical joint features: locking, giving way, painful clicking or swelling that returns.', 'msk-mechanical', 'all-supported-regions', [COVERAGE_SOURCE_IDS.nhsKneePain, COVERAGE_SOURCE_IDS.nhsJointPain]),
  branchDefinition(INTAKE_QUESTION_IDS.mskDuration, 'How long a joint, muscle or injury problem has lasted, or whether it keeps coming back.', 'msk-duration', 'all-supported-regions', [COVERAGE_SOURCE_IDS.nhsJointPain, COVERAGE_SOURCE_IDS.nhsKneePain, COVERAGE_SOURCE_IDS.nhsSprains]),
  /* --- Questionnaire intelligence pass (PENDING CLINICAL REVIEW) ------------ */
  branchDefinition(INTAKE_QUESTION_IDS.toothFeatures, 'The tooth and gum features the dental guidance names for seeing a dentist: not settling with painkillers, pain on biting, hot or cold sensitivity, gum change, swelling, a bad taste, a loose tooth, a high temperature.', 'tooth-features', ['face'], [COVERAGE_SOURCE_IDS.nhsToothache, COVERAGE_SOURCE_IDS.nhsDentalAbscess, COVERAGE_SOURCE_IDS.nhsGumDisease]),
  adultOnly(branchDefinition(INTAKE_QUESTION_IDS.jointPattern, 'Which joints are affected and how: more than one, the small joints of the hands or feet, both sides, long morning stiffness.', 'joint-pattern', 'all-supported-regions', [COVERAGE_SOURCE_IDS.niceRheumatoidArthritis, COVERAGE_SOURCE_IDS.nhsRheumatoidArthritis])),
  branchDefinition(INTAKE_QUESTION_IDS.injuryFeatures, 'What was noticed at and since an injury: a pop, rapid swelling, bruising, an earlier injury to the same place.', 'injury-features', 'all-supported-regions', [COVERAGE_SOURCE_IDS.nhsKneePain, COVERAGE_SOURCE_IDS.nhsSprains]),
  /* --- Questionnaire expansion phase 2 (PENDING CLINICAL REVIEW) ----------- */
  branchDefinition(INTAKE_QUESTION_IDS.mskSiteFeatures, 'The features the NHS page for this part of the body lists in its own symptom table (shoulder, elbow and arm, wrist and hand, hip and thigh, knee, lower leg, ankle and foot, back).', 'msk-site-features', 'all-supported-regions', [COVERAGE_SOURCE_IDS.nhsShoulderPain, COVERAGE_SOURCE_IDS.nhsElbowArmPain, COVERAGE_SOURCE_IDS.nhsWristPain, COVERAGE_SOURCE_IDS.nhsHipPain, COVERAGE_SOURCE_IDS.nhsKneePain, COVERAGE_SOURCE_IDS.nhsHeelPain, COVERAGE_SOURCE_IDS.nhsAnklePain, COVERAGE_SOURCE_IDS.nhsBackPain, COVERAGE_SOURCE_IDS.nhsDvt]),
  branchDefinition(INTAKE_QUESTION_IDS.mskWorseWhen, 'When a joint or muscle problem is worse: with use, with weight, at night or rest, or first thing in the morning.', 'msk-worse-when', 'all-supported-regions', [COVERAGE_SOURCE_IDS.nhsHipPain, COVERAGE_SOURCE_IDS.nhsShoulderPain, COVERAGE_SOURCE_IDS.nhsHeelPain, COVERAGE_SOURCE_IDS.nhsWristPain]),
  branchDefinition(INTAKE_QUESTION_IDS.mskHomeTreatment, 'Whether home treatment (rest, ice or heat, painkillers) has been tried, for how long, and whether it has helped.', 'msk-home-treatment', 'all-supported-regions', [COVERAGE_SOURCE_IDS.nhsJointPain, COVERAGE_SOURCE_IDS.nhsHipPain, COVERAGE_SOURCE_IDS.nhsShoulderPain, COVERAGE_SOURCE_IDS.nhsWristPain, COVERAGE_SOURCE_IDS.nhsAnklePain, COVERAGE_SOURCE_IDS.nhsBackPain, COVERAGE_SOURCE_IDS.nhsNeckPain]),
  branchDefinition(INTAKE_QUESTION_IDS.neuroDistribution, 'Where numbness or tingling is felt: thumb side of the hand, across the hand or arm, both feet or hands, down one leg, or one small patch.', 'neuro-distribution', 'all-supported-regions', [COVERAGE_SOURCE_IDS.nhsCarpalTunnel, COVERAGE_SOURCE_IDS.nhsPeripheralNeuropathy, COVERAGE_SOURCE_IDS.nhsSciatica, COVERAGE_SOURCE_IDS.nhsPinsAndNeedles]),
  adultOnly(branchDefinition(INTAKE_QUESTION_IDS.legVeinFeatures, 'The leg vein features NHS Varicose veins, NICE CG168 and NHS DVT name: bulging veins, aching or heaviness, skin change, a sore not healing, a hard painful vein, a bleeding vein, pain and swelling in one leg.', 'leg-vein-features', 'all-supported-regions', [COVERAGE_SOURCE_IDS.nhsVaricoseVeins, COVERAGE_SOURCE_IDS.niceVaricoseVeins, COVERAGE_SOURCE_IDS.nhsDvt])),
  branchDefinition(INTAKE_QUESTION_IDS.herniaFeatures, 'The features NHS Hernia names for a lump in the tummy or groin: bigger on coughing or straining, smaller lying down, tight skin, a dragging feeling, pain, sickness or bloating.', 'hernia-features', ['upper-abdomen', 'lower-abdomen', 'pelvis'], [COVERAGE_SOURCE_IDS.nhsHernia]),
  adultOnly(branchDefinition(INTAKE_QUESTION_IDS.breastFeatures, 'The breast changes NHS Breast lumps and NICE NG12 name: a lump in the breast or armpit, a nipple turning in, dimpled skin, nipple discharge.', 'breast-features', ['chest'], [COVERAGE_SOURCE_IDS.nhsBreastLump, COVERAGE_SOURCE_IDS.niceSuspectedCancer])),
  branchDefinition(INTAKE_QUESTION_IDS.noseInjuryFeatures, 'The broken-nose features NHS Broken nose lists: a crooked or changed shape, blocked breathing, a crunching sound, swelling not going down after 3 days.', 'nose-injury-features', ['face'], [COVERAGE_SOURCE_IDS.nhsBrokenNose]),
  branchDefinition(INTAKE_QUESTION_IDS.neckInjuryFeatures, 'The whiplash features NHS Whiplash lists: stiffness, headaches, shoulder or arm pain and spasms, not improving after a week or with painkillers.', 'neck-injury-features', ['neck', 'face'], [COVERAGE_SOURCE_IDS.nhsWhiplash]),
  branchDefinition(INTAKE_QUESTION_IDS.oralSwellingSite, 'Where a mouth or jaw swelling is: near a tooth or in the gum, under the jaw or in the neck, inside the cheek or on the lip.', 'oral-swelling-site', ['face'], [COVERAGE_SOURCE_IDS.nhsDentalAbscess, COVERAGE_SOURCE_IDS.nhsToothache, COVERAGE_SOURCE_IDS.nhsLumps]),
  branchDefinition(INTAKE_QUESTION_IDS.urinaryFeatures, 'The urinary features NHS UTI and NHS Enlarged prostate list: burning, cloudy pee, getting up at night, a weak or stop-start flow, straining, not emptying, dribbling.', 'urinary-features', ['lower-abdomen', 'pelvis', 'upper-abdomen'], [COVERAGE_SOURCE_IDS.nhsUrinaryTractInfection, COVERAGE_SOURCE_IDS.nhsProstateEnlargement]),
  branchDefinition(INTAKE_QUESTION_IDS.palpitationTriggers, 'The lifestyle triggers NHS Heart palpitations lists: strenuous exercise, lack of sleep, stress or anxiety, medicines, alcohol, caffeine, nicotine or recreational drugs.', 'palpitation-triggers', ['chest'], [COVERAGE_SOURCE_IDS.nhsPalpitations]),
  adultOnly(branchDefinition(INTAKE_QUESTION_IDS.templeFeatures, 'The features NHS Giant cell arteritis names: tender temples or scalp, jaw pain when eating or talking, frequent severe headaches, vision problems.', 'temple-features', ['face'], [COVERAGE_SOURCE_IDS.nhsGiantCellArteritis])),
  /* --- Normalization pass branch follow-ups ------------------------------- */
  branchDefinition(INTAKE_QUESTION_IDS.noseTreatment, 'Whether pharmacy or GP treatment has been tried for a short nasal or sinus problem, and whether it has helped after 7 days.', 'nose-treatment', ['face'], [COVERAGE_SOURCE_IDS.nhsSinusitis]),
  branchDefinition(INTAKE_QUESTION_IDS.bowelBleedingDuration, 'How long blood has been noticed in the poo, in the 3-week band the rectal bleeding guidance uses.', 'bowel-bleeding-duration', ['lower-abdomen', 'pelvis', 'upper-abdomen'], [COVERAGE_SOURCE_IDS.nhsRectalBleeding]),
  branchDefinition(INTAKE_QUESTION_IDS.bowelTreatment, 'Whether constipation treatment has been tried and whether it helped, for a constipation that keeps coming back.', 'bowel-treatment', ['lower-abdomen', 'pelvis', 'upper-abdomen'], [COVERAGE_SOURCE_IDS.nhsConstipation]),
  branchDefinition(INTAKE_QUESTION_IDS.bowelHabitDuration, 'How long a reported change in usual bowel habit has lasted, in the 3-week band the bowel guidance uses.', 'bowel-habit-duration', ['lower-abdomen', 'pelvis', 'upper-abdomen'], [COVERAGE_SOURCE_IDS.nhsRectalBleeding, COVERAGE_SOURCE_IDS.nhsBowelCancerSymptoms]),
  branchDefinition(INTAKE_QUESTION_IDS.bowelSystemic, 'Other symptoms reported alongside unintended weight loss with a bowel change: tiredness or breathlessness, tummy pain or a lump, often needing to poo.', 'bowel-systemic', ['lower-abdomen', 'pelvis', 'upper-abdomen'], [COVERAGE_SOURCE_IDS.nhsBowelCancerSymptoms]),
  branchDefinition(INTAKE_QUESTION_IDS.neurologicFeatures, 'Features that accompany numbness, tingling or weakness: pain in the same area, a rash or blisters there, or a preceding injury.', 'neurologic-associated-features', 'all-supported-regions', [COVERAGE_SOURCE_IDS.nhsPinsAndNeedles, COVERAGE_SOURCE_IDS.nhsTrigeminalNeuralgia, COVERAGE_SOURCE_IDS.nhsShingles]),
  /* --- Routing reconciliation branch concepts ------------------------------ */
  adultOnly(branchDefinition(INTAKE_QUESTION_IDS.chestPainCharacter, 'What the chest discomfort feels like: tight, heavy or squeezing; sharp or stabbing; burning; or aching.', 'chest-pain-character', ['chest'], [COVERAGE_SOURCE_IDS.nhsAngina, COVERAGE_SOURCE_IDS.niceStableChestPain, COVERAGE_SOURCE_IDS.nhsChestPain])),
  adultOnly(branchDefinition(INTAKE_QUESTION_IDS.chestPainTrigger, 'What brings the chest discomfort on: physical activity, stress or cold, eating or lying down, breathing in or moving, or nothing clear.', 'chest-pain-trigger', ['chest'], [COVERAGE_SOURCE_IDS.niceStableChestPain, COVERAGE_SOURCE_IDS.nhsAngina, COVERAGE_SOURCE_IDS.nhsChestPain])),
  adultOnly(branchDefinition(INTAKE_QUESTION_IDS.chestPainRelief, 'How the chest discomfort settles: within minutes of resting, after an indigestion medicine, or not at all.', 'chest-pain-relief', ['chest'], [COVERAGE_SOURCE_IDS.niceStableChestPain, COVERAGE_SOURCE_IDS.nhsAngina])),
  branchDefinition(INTAKE_QUESTION_IDS.palpitationFrequency, 'How often heartbeat episodes happen: once, now and then, or keeping coming back or becoming more frequent.', 'palpitation-frequency', ['chest'], [COVERAGE_SOURCE_IDS.nhsPalpitations]),
  branchDefinition(INTAKE_QUESTION_IDS.palpitationLength, 'How long one heartbeat episode lasts: seconds, up to a few minutes, or longer than a few minutes.', 'palpitation-length', ['chest'], [COVERAGE_SOURCE_IDS.nhsPalpitations]),
  branchDefinition(INTAKE_QUESTION_IDS.palpitationHistory, 'Heart history that changes how palpitations are assessed: an existing heart condition or a family history of heart problems.', 'palpitation-history', ['chest'], [COVERAGE_SOURCE_IDS.nhsPalpitations]),
  branchDefinition(INTAKE_QUESTION_IDS.upperGiSymptom, 'The main upper digestive symptom: burning after eating or lying down, food or sour fluid coming back up, food sticking when swallowing, or pain when swallowing.', 'upper-gi-symptom', ['chest', 'upper-abdomen'], [COVERAGE_SOURCE_IDS.nhsHeartburn, COVERAGE_SOURCE_IDS.nhsIndigestion, COVERAGE_SOURCE_IDS.nhsDysphagia]),
  adultOnly(branchDefinition(INTAKE_QUESTION_IDS.upperGiFrequency, 'How often heartburn, indigestion or upper tummy discomfort happens: most days, often over weeks, now and then, or for the first time.', 'upper-gi-frequency', ['chest', 'upper-abdomen'], [COVERAGE_SOURCE_IDS.nhsHeartburn, COVERAGE_SOURCE_IDS.nhsIndigestion])),
  adultOnly(branchDefinition(INTAKE_QUESTION_IDS.upperGiTreatment, 'Whether lifestyle changes and pharmacy medicines have helped the heartburn or indigestion.', 'upper-gi-treatment', ['chest', 'upper-abdomen'], [COVERAGE_SOURCE_IDS.nhsHeartburn])),
  adultOnly(branchDefinition(INTAKE_QUESTION_IDS.upperGiAlarm, 'Features that go with heartburn or indigestion: food sticking, keeping being sick, weight loss without trying, or blood in sick or poo.', 'upper-gi-alarm', ['chest', 'upper-abdomen'], [COVERAGE_SOURCE_IDS.nhsHeartburn, COVERAGE_SOURCE_IDS.nhsIndigestion])),
  branchDefinition(INTAKE_QUESTION_IDS.neurologicCourse, 'How numbness, tingling or weakness has changed since it began: sudden, quickly worse over hours or days, gradually worse over weeks or months, the same, better, or coming and going.', 'neurologic-course', 'all-supported-regions', [COVERAGE_SOURCE_IDS.niceNeurologicalReferral, COVERAGE_SOURCE_IDS.nhsStroke]),
  branchDefinition(INTAKE_QUESTION_IDS.neurologicWaking, 'Whether tingling or numbness is mainly present on waking and gone within about 10 minutes.', 'neurologic-waking', 'all-supported-regions', [COVERAGE_SOURCE_IDS.niceNeurologicalReferral, COVERAGE_SOURCE_IDS.nhsPinsAndNeedles]),
  adultOnly(branchDefinition(INTAKE_QUESTION_IDS.facePainPattern, 'What the facial pain is like: sudden stabbing pain set off by touch, eating or brushing; pressure with a blocked or runny nose; worse when chewing; or a constant ache.', 'face-pain-pattern', ['face'], [COVERAGE_SOURCE_IDS.niceNeurologicalReferral, COVERAGE_SOURCE_IDS.nhsTrigeminalNeuralgia, COVERAGE_SOURCE_IDS.nhsSinusitis, COVERAGE_SOURCE_IDS.nhsTmd])),
  adultOnly(branchDefinition(INTAKE_QUESTION_IDS.facePainSide, 'Whether facial pain is on one side of the face or both.', 'face-pain-side', ['face'], [COVERAGE_SOURCE_IDS.niceNeurologicalReferral, COVERAGE_SOURCE_IDS.nhsSinusitis])),
  adultOnly(branchDefinition(INTAKE_QUESTION_IDS.facePainTreatment, 'Whether painkillers or treatment already tried have helped the facial pain.', 'face-pain-treatment', ['face'], [COVERAGE_SOURCE_IDS.niceNeurologicalReferral, COVERAGE_SOURCE_IDS.nhsTrigeminalNeuralgia])),
  branchDefinition(INTAKE_QUESTION_IDS.movementDetail, 'Which movement or use of the area is hardest: lifting or reaching, gripping, walking or standing, bending or turning, or climbing stairs.', 'movement-detail', 'all-supported-regions', [COVERAGE_SOURCE_IDS.nhsJointPain, COVERAGE_SOURCE_IDS.nhsKneePain]),
  branchDefinition(INTAKE_QUESTION_IDS.eyeInjuryDetail, 'What happened to the eye: a chemical splash, something in the eye, a scratch, or a blow.', 'eye-injury-detail', ['face'], [COVERAGE_SOURCE_IDS.nhsEyePain]),
  branchDefinition(INTAKE_QUESTION_IDS.backLegSymptoms, 'Leg features that accompany back pain that spreads into a leg: numbness or tingling, weakness, or pain below the knee.', 'back-leg-symptoms', ['lower-back'], [COVERAGE_SOURCE_IDS.nhsSciatica, COVERAGE_SOURCE_IDS.niceNeurologicalReferral]),
  branchDefinition(INTAKE_QUESTION_IDS.dizzinessDetail, 'What dizziness felt in the head is like: spinning, unsteady, or lightheaded as if about to faint.', 'dizziness-detail', ['head'], [COVERAGE_SOURCE_IDS.nhsVertigo]),
  branchDefinition(INTAKE_QUESTION_IDS.dizzinessAssociated, 'Features that go with dizziness: hearing loss or ringing, ear fullness, recurrence, or head movement as a trigger.', 'dizziness-associated', ['head'], [COVERAGE_SOURCE_IDS.nhsVertigo, COVERAGE_SOURCE_IDS.nhsTinnitus, COVERAGE_SOURCE_IDS.nhsHearingLoss]),
  branchDefinition(INTAKE_QUESTION_IDS.associatedLocation, 'One additional body area where the same pain or discomfort is also felt, or none. Evidence about the presentation; never a second complaint and never a route on its own.', 'associated-location', 'all-supported-regions', [COVERAGE_SOURCE_IDS.nhsChestPain, COVERAGE_SOURCE_IDS.nhsAngina, COVERAGE_SOURCE_IDS.nhsSciatica, COVERAGE_SOURCE_IDS.nhsNeckPain, COVERAGE_SOURCE_IDS.nhsKidneyInfection]),
  /* --- Clinical blocker pass concepts --------------------------------------- */
  adultOnly(branchDefinition(INTAKE_QUESTION_IDS.headacheFeatures, 'Headache features NICE CG150 names for further evaluation that R3 does not already screen: brought on by coughing, sneezing or straining; brought on by exercise; changing with posture; very different from usual headaches.', 'headache-features', ['head'], [COVERAGE_SOURCE_IDS.niceHeadache, COVERAGE_SOURCE_IDS.nhsHeadaches, COVERAGE_SOURCE_IDS.nhsEnglandHeadacheToolkit])),
  adultOnly(branchDefinition(INTAKE_QUESTION_IDS.headacheSinusSymptoms, 'Whether the headache comes with both a blocked or runny nose and pressure or tenderness around the cheeks, eyes or forehead.', 'headache-sinus-symptoms', ['head'], [COVERAGE_SOURCE_IDS.nhsSinusitis])),
  adultOnly(branchDefinition(INTAKE_QUESTION_IDS.headacheSinusPattern, 'Whether a nasal and facial-pressure pattern is one-sided, keeps returning, or has continued after three months of treatment.', 'headache-sinus-pattern', ['head'], [COVERAGE_SOURCE_IDS.nhsSinusitis])),
  adultOnly(branchDefinition(INTAKE_QUESTION_IDS.breathingInfections, 'Whether chest infections keep happening, with a breathing problem.', 'breathing-infections', ['chest'], [COVERAGE_SOURCE_IDS.niceCopd, COVERAGE_SOURCE_IDS.nhsBronchiectasis])),
  adultOnly(branchDefinition(INTAKE_QUESTION_IDS.breathingPhlegm, 'Whether a lot of phlegm (mucus) is coughed up, with a breathing problem.', 'breathing-phlegm', ['chest'], [COVERAGE_SOURCE_IDS.nhsBronchiectasis])),
  adultOnly(branchDefinition(INTAKE_QUESTION_IDS.breathingAnkles, 'Whether the feet, ankles or legs have been swollen, with a breathing problem. Asked only when the approved R1 question has not recorded the same fact.', 'breathing-ankles', ['chest'], [COVERAGE_SOURCE_IDS.nhsHeartFailure])),
  adultOnly(branchDefinition(INTAKE_QUESTION_IDS.breathingLyingFlat, 'Whether breathing gets worse when lying down. Asked only when the approved R1 question has not recorded the same fact.', 'breathing-lying-flat', ['chest'], [COVERAGE_SOURCE_IDS.nhsHeartFailure])),
  adultOnly(branchDefinition(INTAKE_QUESTION_IDS.breathingActivity, 'Whether ordinary activity brings on or worsens the breathing problem. Asked only when the core breathing description has not already recorded the same fact.', 'breathing-activity', ['chest'], [COVERAGE_SOURCE_IDS.nhsHeartFailure])),
  branchDefinition(INTAKE_QUESTION_IDS.abdomenInjuryTiming, 'When an injury to the chest, ribs or upper tummy happened, in the bands the rib injury guidance uses.', 'abdomen-injury-timing', ['upper-abdomen', 'chest'], [COVERAGE_SOURCE_IDS.nhsBrokenRibs]),
  branchDefinition(INTAKE_QUESTION_IDS.abdomenInjuryMovement, 'Whether pain after a chest, rib or upper tummy injury is worse on breathing in, coughing or moving.', 'abdomen-injury-movement', ['upper-abdomen', 'chest'], [COVERAGE_SOURCE_IDS.nhsBrokenRibs]),
  branchDefinition(INTAKE_QUESTION_IDS.abdomenInjuryFeatures, 'What has been noticed since a chest, rib or upper tummy injury: bruising, swelling or tenderness, being sick, or feeling dizzy or faint.', 'abdomen-injury-features', ['upper-abdomen', 'chest'], [COVERAGE_SOURCE_IDS.nhsBrokenRibs, COVERAGE_SOURCE_IDS.nhsStomachAche]),
  branchDefinition(INTAKE_QUESTION_IDS.otherClarifier, 'For an upper tummy concern described as something else: which concern family it is closest to, so the matching branch is asked instead of a generic tail.', 'other-clarifier', ['upper-abdomen'], [COVERAGE_SOURCE_IDS.cmsHpi]),
];

/** A concept whose sources are written for adults: never planned for an under-18 run. */
function adultOnly(definition: CanonicalIntakeQuestionDefinition): CanonicalIntakeQuestionDefinition {
  return { ...definition, pediatricApplicable: false, pediatricAgeBands: [] };
}

const CANONICAL_INTAKE_BY_ID = new Map(CANONICAL_INTAKE_QUESTIONS.map((definition) => [definition.id, definition]));

function options(...pairs: readonly (readonly [string, string])[]): readonly IntakeOption[] {
  return pairs.map(([id, label]) => ({ id, label }));
}

const INTENSITY_OPTIONS = options(
  ['1', 'Minimal'],
  ['2', 'Mild'],
  ['3', 'Moderate'],
  ['4', 'Strong'],
  ['5', 'Severe'],
);

const DURATION_OPTIONS = options(
  ['under-hour', 'Less than an hour'],
  ['few-hours', 'A few hours'],
  ['today', 'Today'],
  ['one-two-days', '1 to 2 days'],
  ['several-days', 'Several days'],
  ['longer', 'Longer'],
);

const ONSET_OPTIONS = options(
  ['gradual', 'Gradually'],
  ['sudden', 'Suddenly'],
  ['event', 'After a specific event'],
  ['unsure', 'Not sure'],
);

const PATTERN_OPTIONS = options(
  ['constant', 'Constant'],
  ['intermittent', 'Comes and goes'],
  ['triggered', 'Only when something sets it off'],
  ['unsure', 'Not sure'],
);

function character(id: string, prompt: string, pairs: readonly (readonly [string, string])[]): IntakeQuestion {
  return { id, category: 'character', eyebrow: 'Character', prompt, control: 'choice-grid', options: options(...pairs) };
}

function intensity(id: string, prompt = 'How strong is it right now?'): IntakeQuestion {
  return { id, category: 'intensity', eyebrow: 'Intensity', prompt, control: 'five-point-scale', options: INTENSITY_OPTIONS };
}

function duration(id: string): IntakeQuestion {
  return {
    id,
    category: 'duration',
    eyebrow: 'Duration',
    prompt: 'How long has this been happening?',
    control: 'segmented',
    options: DURATION_OPTIONS,
  };
}

function onset(id: string): IntakeQuestion {
  return { id, category: 'onset', eyebrow: 'Onset', prompt: 'How did it begin?', control: 'choice-grid', options: ONSET_OPTIONS };
}

function pattern(id: string): IntakeQuestion {
  return {
    id,
    category: 'pattern',
    eyebrow: 'Pattern',
    prompt: 'Is it there all the time, or does it come and go?',
    control: 'choice-grid',
    options: PATTERN_OPTIONS,
  };
}

/**
 * The intake plan per complaint, in the order it is asked.
 *
 * `preScreen` runs before the R3 safety screen unless an acuity answer pulls
 * the screen forward. `postScreen` runs after screening and before adaptive
 * routing questions.
 *
 * Headache has no onset intake question on purpose. R3 already owns a
 * validated onset question for it ("sudden, extremely painful"), and asking a
 * second, looser onset question beside the validated one would record two
 * versions of the same fact. The validated wording is kept; the interview plan
 * places the R3 screen where the onset question would have been.
 */
export interface ComplaintIntakePlan {
  preScreen: readonly IntakeQuestion[];
  postScreen: readonly IntakeQuestion[];
}

export const INTAKE_PLANS: Readonly<Record<string, ComplaintIntakePlan>> = {
  'upper-abdominal-pain': {
    preScreen: [
      character(INTAKE_QUESTION_IDS.symptomCharacter, 'What does it feel like?', [
        ['burning', 'Burning'],
        ['cramping', 'Cramping'],
        ['pressure', 'Pressure'],
        ['sharp', 'Sharp'],
        ['aching', 'Aching'],
        ['unsure', 'Not sure'],
      ]),
      intensity(INTAKE_QUESTION_IDS.currentImpact),
      duration(INTAKE_QUESTION_IDS.duration),
      onset(INTAKE_QUESTION_IDS.onset),
    ],
    postScreen: [pattern(INTAKE_QUESTION_IDS.pattern)],
  },

  'shortness-of-breath': {
    preScreen: [
      character(INTAKE_QUESTION_IDS.symptomCharacter, 'What does your breathing feel like?', [
        ['tight', 'Tight'],
        ['air-hunger', 'Hard to get enough air'],
        ['wheezy', 'Wheezy or noisy'],
        ['effort', 'Breathless with effort'],
        ['unsure', 'Not sure'],
      ]),
      intensity(INTAKE_QUESTION_IDS.currentImpact, 'How much is your breathing bothering you right now?'),
      duration(INTAKE_QUESTION_IDS.duration),
    ],
    // Onset is not asked here: four R3 screens already follow, and a looser
    // onset field would add length without routing or safety value.
    postScreen: [],
  },

  headache: {
    preScreen: [
      character(INTAKE_QUESTION_IDS.symptomCharacter, 'What does it feel like?', [
        ['throbbing', 'Throbbing'],
        ['pressure', 'Pressure'],
        ['tight-band', 'Tight band'],
        ['sharp', 'Sharp'],
        ['dull', 'Dull'],
        ['unsure', 'Not sure'],
      ]),
      intensity(INTAKE_QUESTION_IDS.currentImpact),
      duration(INTAKE_QUESTION_IDS.duration),
    ],
    postScreen: [],
  },

  'joint-musculoskeletal-pain': {
    preScreen: [
      character(INTAKE_QUESTION_IDS.symptomCharacter, 'What does it feel like?', [
        ['aching', 'Aching'],
        ['sharp', 'Sharp'],
        ['stiff', 'Stiff'],
        ['throbbing', 'Throbbing'],
        ['burning', 'Burning'],
        ['unsure', 'Not sure'],
      ]),
      intensity(INTAKE_QUESTION_IDS.currentImpact),
      duration(INTAKE_QUESTION_IDS.duration),
      onset(INTAKE_QUESTION_IDS.onset),
    ],
    postScreen: [],
  },
};

const EMPTY_PLAN: ComplaintIntakePlan = { preScreen: [], postScreen: [] };

function resolveStaticQuestion(question: IntakeQuestion, complaintId: string): IntakeQuestion {
  const canonical = CANONICAL_INTAKE_BY_ID.get(question.id as CanonicalIntakeQuestionId);
  if (!canonical) throw new TypeError(`Unknown canonical intake question: ${question.id}`);
  const characterVariant: Readonly<Record<string, string>> = {
    'upper-abdominal-pain': 'adult-upper-abdominal',
    'shortness-of-breath': 'adult-breathing',
    headache: 'adult-headache',
    'joint-musculoskeletal-pain': 'adult-joint',
  };
  const wordingVariantId = question.id === INTAKE_QUESTION_IDS.symptomCharacter
    ? characterVariant[complaintId] ?? 'patient'
    : question.id === INTAKE_QUESTION_IDS.currentImpact
      ? complaintId === 'shortness-of-breath' ? 'adult-breathing' : 'adult-standard'
      : 'shared';
  return {
    ...question,
    complaintFamily: complaintId,
    applicability: 'adult',
    ageConstraint: '18 years and older',
    routingEvidencePurpose: canonical.routingEvidenceUse,
    safetyPurpose: canonical.safetyUse,
    sourceIds: canonical.sourceIds,
    rationale: canonical.canonicalMeaning,
    canonicalMeaning: canonical.canonicalMeaning,
    wordingVariantId,
    sourceMetadataLevel: canonical.sourceMetadataLevel,
    duplicateEquivalenceGroup: canonical.duplicateEquivalenceGroup,
    stage: 'core',
    purpose: 'CHARACTERIZATION',
    ...(question.id === INTAKE_QUESTION_IDS.currentImpact ? { acuityOptionIds: ['5'] } : {}),
    ...(question.id === INTAKE_QUESTION_IDS.onset ? { acuityOptionIds: ['sudden'] } : {}),
  };
}

/**
 * Every question a published referral criterion in direction-gate.ts reads.
 *
 * Used to classify a question as GATE_CRITERION and to count it against the
 * discrimination budget. Whether a question is asked in every run (`core`) or
 * only while a criterion can still be met (`extension`) is its own `stage`.
 */
export const GATE_CRITERION_QUESTION_IDS: ReadonlySet<string> = new Set([
  // Phase 3: a one-calf answer excludes the elective Orthopaedics and
  // Rheumatology sets (a possible clot is not an elective referral).
  INTAKE_QUESTION_IDS.mskSiteFeatures,
  INTAKE_QUESTION_IDS.earDetail,
  INTAKE_QUESTION_IDS.earAssociated,
  INTAKE_QUESTION_IDS.earPersistence,
  INTAKE_QUESTION_IDS.pediatricEarObservation,
  INTAKE_QUESTION_IDS.noseDetail,
  INTAKE_QUESTION_IDS.noseAssociated,
  INTAKE_QUESTION_IDS.nosebleedAssociated,
  INTAKE_QUESTION_IDS.nosePersistence,
  INTAKE_QUESTION_IDS.pediatricNoseObservation,
  INTAKE_QUESTION_IDS.eyeDetail,
  INTAKE_QUESTION_IDS.eyeAssociated,
  INTAKE_QUESTION_IDS.eyeSquintPattern,
  INTAKE_QUESTION_IDS.throatDetail,
  INTAKE_QUESTION_IDS.throatAssociated,
  INTAKE_QUESTION_IDS.throatDuration,
  INTAKE_QUESTION_IDS.throatRecurrence,
  INTAKE_QUESTION_IDS.throatImpact,
  INTAKE_QUESTION_IDS.lowerAssociatedSystem,
  INTAKE_QUESTION_IDS.reproductiveDetail,
  INTAKE_QUESTION_IDS.reproductiveTiming,
  INTAKE_QUESTION_IDS.urinaryDetail,
  INTAKE_QUESTION_IDS.urinaryPattern,
  INTAKE_QUESTION_IDS.bowelDetail,
  INTAKE_QUESTION_IDS.bowelPersistence,
  INTAKE_QUESTION_IDS.bowelAlarmFeature,
  INTAKE_QUESTION_IDS.pediatricBowelRedFlag,
  INTAKE_QUESTION_IDS.skinDetail,
  INTAKE_QUESTION_IDS.skinDuration,
  INTAKE_QUESTION_IDS.skinTreatment,
  INTAKE_QUESTION_IDS.skinFeatures,
  INTAKE_QUESTION_IDS.swellingDetail,
  INTAKE_QUESTION_IDS.swellingDuration,
  INTAKE_QUESTION_IDS.injuryFunction,
  INTAKE_QUESTION_IDS.mskMechanical,
  INTAKE_QUESTION_IDS.mskDuration,
  INTAKE_QUESTION_IDS.toothFeatures,
  INTAKE_QUESTION_IDS.mouthDuration,
  INTAKE_QUESTION_IDS.mouthDetail,
  INTAKE_QUESTION_IDS.legVeinFeatures,
  INTAKE_QUESTION_IDS.herniaFeatures,
  INTAKE_QUESTION_IDS.breastFeatures,
  INTAKE_QUESTION_IDS.jointPattern,
  INTAKE_QUESTION_IDS.breathingDetail,
  INTAKE_QUESTION_IDS.breathingRecurrence,
  INTAKE_QUESTION_IDS.headFrequency,
  /* Routing reconciliation. */
  INTAKE_QUESTION_IDS.chestPainCharacter,
  INTAKE_QUESTION_IDS.chestPainTrigger,
  INTAKE_QUESTION_IDS.chestPainRelief,
  INTAKE_QUESTION_IDS.associatedLocation,
  INTAKE_QUESTION_IDS.palpitationFrequency,
  INTAKE_QUESTION_IDS.palpitationLength,
  INTAKE_QUESTION_IDS.palpitationHistory,
  INTAKE_QUESTION_IDS.upperGiSymptom,
  INTAKE_QUESTION_IDS.upperGiFrequency,
  INTAKE_QUESTION_IDS.upperGiTreatment,
  INTAKE_QUESTION_IDS.upperGiAlarm,
  INTAKE_QUESTION_IDS.neurologicCourse,
  INTAKE_QUESTION_IDS.neurologicDetail,
  INTAKE_QUESTION_IDS.neurologicFeatures,
  INTAKE_QUESTION_IDS.facePainPattern,
  INTAKE_QUESTION_IDS.facePainSide,
  INTAKE_QUESTION_IDS.facePainTreatment,
  INTAKE_QUESTION_IDS.eyeInjuryDetail,
  /* Clinical blocker pass. */
  INTAKE_QUESTION_IDS.headacheFeatures,
  INTAKE_QUESTION_IDS.headacheSinusSymptoms,
  INTAKE_QUESTION_IDS.headacheSinusPattern,
  INTAKE_QUESTION_IDS.breathingInfections,
  INTAKE_QUESTION_IDS.breathingPhlegm,
  INTAKE_QUESTION_IDS.breathingAnkles,
  INTAKE_QUESTION_IDS.breathingLyingFlat,
  INTAKE_QUESTION_IDS.breathingActivity,
]);

/**
 * Approved R1 questions whose ANSWER a direction criterion also reads, so a
 * weighted run is never asked the same fact twice under another wording. Only
 * the answer is read; the likelihood tables are untouched.
 */
export const R1_ANSWERS_READ_BY_GATE: ReadonlySet<string> = new Set([
  'joint-musculoskeletal-pain-use-weight',
  // Rheumatology (NICE NG100): a swollen joint, not after an injury.
  'joint-musculoskeletal-pain-swelling-bruising',
  'joint-musculoskeletal-pain-injury',
  'upper-abdominal-pain-burning',
  'upper-abdominal-pain-exertional',
  'shortness-of-breath-ankle-swelling',
  'shortness-of-breath-lying-flat',
  'shortness-of-breath-cough',
]);

/**
 * The discriminators that exist only to complete a referral criterion.
 *
 * Retained under its historical name. These are asked after the core branch,
 * and only while a criteria set that reads them can still be satisfied.
 */
export const DIRECTION_GATE_QUESTION_IDS: ReadonlySet<string> = new Set([
  // Sinonasal features matter only while the ENT criteria can still be met:
  // once persistence rules ENT out (under 3 weeks) or the criteria are already
  // met, asking for one-sided or recurrent symptoms changes nothing.
  INTAKE_QUESTION_IDS.noseAssociated,
  INTAKE_QUESTION_IDS.reproductiveTiming,
  INTAKE_QUESTION_IDS.bowelAlarmFeature,
  INTAKE_QUESTION_IDS.throatImpact,
  INTAKE_QUESTION_IDS.eyeSquintPattern,
]);

type CoverageDefinition = Omit<IntakeQuestion, 'complaintFamily' | 'applicability' | 'ageConstraint' | 'routingEvidencePurpose' | 'safetyPurpose' | 'sourceIds' | 'rationale' | 'canonicalMeaning' | 'sourceMetadataLevel' | 'duplicateEquivalenceGroup'> & {
  sourceIds?: readonly string[];
  rationale: string;
  safetyPurpose?: string;
};

function purposeFor(definition: CoverageDefinition): QuestionPurpose {
  if (definition.purpose) return definition.purpose;
  if (GATE_CRITERION_QUESTION_IDS.has(definition.id)) return 'GATE_CRITERION';
  switch (definition.progressionStage) {
    case 'entry':
    case 'characterize':
      return 'CHARACTERIZATION';
    case 'system':
    case 'discriminate':
      return 'DISCRIMINATION';
    default:
      return 'CONTEXT';
  }
}

export function voiceOfContext(context: RegionAssessmentContext): QuestionVoice {
  return context.questionVoice ?? (context.reporterMode === 'caregiver' ? 'caregiver' : 'self');
}

function coverageQuestion(context: RegionAssessmentContext, definition: CoverageDefinition): IntakeQuestion {
  const canonical = CANONICAL_INTAKE_BY_ID.get(definition.id as CanonicalIntakeQuestionId);
  if (!canonical) throw new TypeError(`Unknown canonical intake question: ${definition.id}`);
  const reporterVariant = voiceOfContext(context) === 'caregiver' ? 'caregiver' : 'patient';
  const wordingVariantId = canonical.wordingVariantIds.includes(reporterVariant)
    ? reporterVariant
    : canonical.wordingVariantIds[0];
  return {
    ...definition,
    complaintFamily: context.complaintId,
    applicability: context.patientMode,
    ageConstraint: context.patientMode === 'pediatric'
      ? context.pediatricAgeBand ?? 'under-18'
      : '18 years and older',
    routingEvidencePurpose: GATE_CRITERION_QUESTION_IDS.has(definition.id)
      ? 'Read by the deterministic source-cited direction gate; no numeric specialty likelihood is assigned.'
      : 'Descriptive context only; no numeric specialty likelihood is assigned.',
    safetyPurpose: definition.safetyPurpose ?? 'May bring a branch-relevant R3 check forward but cannot fire or suppress a rule.',
    sourceIds: definition.sourceIds ?? context.sourceIds,
    rationale: definition.rationale,
    canonicalMeaning: canonical.canonicalMeaning,
    wordingVariantId: definition.wordingVariantId ?? wordingVariantId,
    sourceMetadataLevel: canonical.sourceMetadataLevel,
    duplicateEquivalenceGroup: canonical.duplicateEquivalenceGroup,
    branchIds: definition.branchIds ?? [context.concernId],
    progressionStage: definition.progressionStage ?? 'context',
    informationGainRank: definition.informationGainRank ?? 50,
    physiologyEligibility: definition.physiologyEligibility ?? 'all',
    stage: definition.stage ?? (DIRECTION_GATE_QUESTION_IDS.has(definition.id) ? 'extension' : 'core'),
    purpose: purposeFor(definition),
  };
}

const MUSCULOSKELETAL_REGION = /(shoulder|arm|elbow|forearm|wrist|hand|hip|thigh|knee|leg|ankle|foot|back)/;
const LOWER_LIMB_REGION = /(hip|thigh|knee|leg|ankle|foot)/;

/**
 * Where chest pain can spread, in the words of NICE CG95 (neck, shoulders,
 * jaw or arms) and NHS Chest pain (an arm, the neck, jaw, stomach or back).
 * The jaw is part of the face region on the body map.
 */
export const CHEST_SPREAD_AREAS: readonly string[] = [
  'neck', 'face',
  'left-shoulder', 'right-shoulder', 'left-upper-arm', 'right-upper-arm', 'left-elbow', 'right-elbow',
  'left-forearm', 'right-forearm', 'left-wrist', 'right-wrist', 'left-hand', 'right-hand',
  'upper-abdomen', 'upper-back',
];

/**
 * The coverage questionnaire for one assessment.
 *
 * WHY THIS IS NOT ONE TEMPLATE
 *
 * It used to be: an entry question, one branch detail, then the same impact,
 * duration and onset questions for every region, which is why a child's ear,
 * knee, throat and tummy felt like the same questionnaire. Each branch now
 * owns its own characterization, its own timeline question in the bands its
 * source uses (instead of a generic "how long" asked again beside a branch
 * duration), its own discriminators and its own follow-ups, gated on earlier
 * answers. Generic questions appear only where a branch has nothing more
 * specific to ask.
 *
 * THE ORDER
 *
 * informationGainRank sets it: what is happening (10), how much it affects
 * them (20), when it started and how long it has lasted (25 to 30), its
 * pattern (32), branch features (35 to 45), discriminators (50 to 65), then
 * context (70). Safety is not here: R3 owns it and the interview plan places
 * it (interview-plan.ts).
 *
 * THE VOICE
 *
 * Every prompt is written twice through `say(self, caregiver)` and the
 * assessment's locked voice picks one. There is no third form.
 */
function coveragePlan(context: RegionAssessmentContext): ComplaintIntakePlan {
  const voice = voiceOfContext(context);
  const say = (self: string, caregiver: string) => byVoice(voice, self, caregiver);
  const caregiver = voice === 'caregiver';
  const pediatric = context.patientMode === 'pediatric';
  const locationLabel = context.faceSubregionLabel ?? context.bodyRegionLabel;
  const locationPhrase = locationLabel.replace(/^Patient's /, '').toLowerCase();
  const concerns = concernOptionsFor(context.bodyRegionId, context.faceSubregionId, {
    age: context.age,
    sexForAssessment: context.sexForAssessment,
  });
  const questionSources = new Set<string>([COVERAGE_SOURCE_IDS.cmsHpi]);
  if (pediatric) questionSources.add(COVERAGE_SOURCE_IDS.nhmImnci);
  if (context.bodyRegionId === 'lower-abdomen' || context.bodyRegionId === 'pelvis') {
    questionSources.add(COVERAGE_SOURCE_IDS.nhsPelvicPain);
  }
  if (context.bodyRegionId === 'chest') questionSources.add(COVERAGE_SOURCE_IDS.nhsChestPain);
  if (context.bodyRegionId === 'neck' || context.faceSubregionId === 'upper-neck') {
    questionSources.add(COVERAGE_SOURCE_IDS.nhsNeckPain);
    questionSources.add(COVERAGE_SOURCE_IDS.niceMeningitis);
  }
  if (context.faceSubregionId?.includes('eye')) questionSources.add(COVERAGE_SOURCE_IDS.nhsEyePain);
  if (context.faceSubregionId?.includes('ear')) {
    questionSources.add(COVERAGE_SOURCE_IDS.nhsEarInfections);
    questionSources.add(COVERAGE_SOURCE_IDS.nhsHearingLoss);
    questionSources.add(COVERAGE_SOURCE_IDS.nhsTinnitus);
    questionSources.add(COVERAGE_SOURCE_IDS.nhsVertigo);
  }
  if (context.faceSubregionId === 'nose') {
    questionSources.add(COVERAGE_SOURCE_IDS.nhsSinusitis);
    questionSources.add(COVERAGE_SOURCE_IDS.nhsNosebleed);
  }
  if (context.faceSubregionId === 'mouth' || context.faceSubregionId === 'chin' || context.faceSubregionId?.includes('jaw')) {
    questionSources.add(COVERAGE_SOURCE_IDS.nhsMouthUlcers);
    questionSources.add(COVERAGE_SOURCE_IDS.nhsTmd);
  }
  if (context.concernId === 'weakness-drooping' || context.concernId === 'numbness-tingling' || context.concernId === 'vision-change') {
    questionSources.add(COVERAGE_SOURCE_IDS.nhsStroke);
  }
  if (context.concernId === 'skin-change' || context.concernId === 'swelling-lump') {
    questionSources.add(COVERAGE_SOURCE_IDS.nhsAllergy);
  }
  const sourceIds = [...questionSources];

  const entry = coverageQuestion(context, {
    id: INTAKE_QUESTION_IDS.complaintEntry,
    category: 'context',
    eyebrow: 'Type of concern',
    prompt: say(
      `What are you experiencing at the ${locationPhrase}?`,
      `What is your child experiencing at the ${locationPhrase}?`,
    ),
    control: 'choice-grid',
    options: concerns.map(({ id, label }) => ({ id, label })),
    sourceIds,
    rationale: 'Records the stated presentation before any system or specialty discrimination.',
    progressionStage: 'entry',
    informationGainRank: 0,
  });

  /*
    Headache and breathing keep their approved static core: headache's is built
    around R3's validated onset question. What they gain is a discrimination
    extension, asked only after R1 has finished without separating a candidate
    (interview-plan.ts), and only while a published criterion in
    direction-gate.ts can still be met. A converged run is never asked more,
    and a run with no clinical context never sees these questions at all.
    Joint pain and upper abdominal pain are built below with their own branch
    questions and a discrimination extension.
  */
  const approvedComplaintPlan = context.complaintId === 'joint-musculoskeletal-pain' || context.complaintId === 'upper-abdominal-pain'
    ? undefined
    : INTAKE_PLANS[context.complaintId];
  if (approvedComplaintPlan) {
    return {
      preScreen: [entry, ...approvedComplaintPlan.preScreen.map((question) => resolveStaticQuestion(question, context.complaintId))],
      postScreen: [
        ...approvedComplaintPlan.postScreen.map((question) => resolveStaticQuestion(question, context.complaintId)),
        ...weightedExtension(context),
      ],
    };
  }

  const questions: IntakeQuestion[] = [entry];
  const push = (definition: CoverageDefinition) => {
    questions.push(coverageQuestion(context, definition));
  };

  const facePart = context.faceSubregionId;
  const concern = context.concernId;
  const complaint = context.complaintId;
  const isEye = facePart?.includes('eye') ?? false;
  const isEar = facePart?.includes('ear') ?? false;
  const isNose = facePart === 'nose';
  const isOral = facePart === 'mouth' || facePart === 'chin' || (facePart?.includes('jaw') ?? false);
  const isLower = context.bodyRegionId === 'lower-abdomen' || context.bodyRegionId === 'pelvis';
  const isUpperAbdomen = context.bodyRegionId === 'upper-abdomen';
  const isAbdominal = isLower || isUpperAbdomen;
  const isMusculoskeletal = MUSCULOSKELETAL_REGION.test(context.bodyRegionId);
  const isLowerLimb = LOWER_LIMB_REGION.test(context.bodyRegionId);

  /*
    Bowel follow-ups. Each opens only on the answer that makes it relevant, so
    a recent first episode with nothing else reported meets none of them:

      blood reported          -> how long the blood has been noticed
      constipation that keeps
      coming back             -> whether treatment has been tried
      sudden habit change     -> how long the habit has been different
      weight loss             -> the other symptoms that go with it

    They characterize for the handoff. None is a referral criterion, and none
    fires a safety rule: the R3 rectal bleeding checks own that.
  */
  const bowelFollowUps = (premise: readonly ShowCondition[]) => {
    push({
      id: INTAKE_QUESTION_IDS.bowelBleedingDuration,
      category: 'duration',
      eyebrow: 'The blood',
      prompt: say('How long has there been blood in your poo?', 'How long has there been blood in your child\'s poo?'),
      control: 'segmented',
      options: options(['once', 'Only once'], ['under-three-weeks', 'On and off, less than 3 weeks'], ['three-weeks-plus', 'For 3 weeks or more'], ['unsure', 'Not sure']),
      showWhen: [...premise, { questionId: INTAKE_QUESTION_IDS.bowelDetail, optionIds: ['blood'] }],
      sourceIds: [COVERAGE_SOURCE_IDS.nhsRectalBleeding],
      rationale: 'NHS Rectal bleeding names blood in the poo for 3 weeks as a reason to see a GP, separately from its urgent and emergency levels.',
      progressionStage: 'characterize',
      informationGainRank: 27,
    });
    if (!pediatric) {
      push({
        id: INTAKE_QUESTION_IDS.bowelTreatment,
        category: 'context',
        eyebrow: 'Treatment so far',
        prompt: 'Have you tried anything for it, such as more fibre and fluids, or a medicine from a pharmacy?',
        control: 'choice-grid',
        options: options(['helped', 'Yes, and it helps'], ['not-helped', 'Yes, but it has not helped'], ['not-tried', 'Not yet'], ['unsure', 'Not sure']),
        showWhen: [
          ...premise,
          { questionId: INTAKE_QUESTION_IDS.bowelDetail, optionIds: ['constipation'] },
          { questionId: INTAKE_QUESTION_IDS.bowelPersistence, optionIds: ['regularly-recurrent', 'unsure'] },
        ],
        sourceIds: [COVERAGE_SOURCE_IDS.nhsConstipation],
        rationale: 'NHS Constipation starts with diet, fluids and pharmacy treatment and sends constipation that is not getting better with treatment to a GP. Asked of a constipation that keeps coming back, where it is the relevant next fact.',
        progressionStage: 'characterize',
        informationGainRank: 30,
      });
      push({
        id: INTAKE_QUESTION_IDS.bowelHabitDuration,
        category: 'duration',
        eyebrow: 'The change in habit',
        prompt: 'How long has your bowel habit been different from usual?',
        control: 'segmented',
        options: options(['under-three-weeks', 'Less than 3 weeks'], ['three-weeks-plus', '3 weeks or more'], ['unsure', 'Not sure']),
        showWhen: [...premise, { questionId: INTAKE_QUESTION_IDS.bowelAlarmFeature, optionIds: ['sudden-change', 'both'] }],
        sourceIds: [COVERAGE_SOURCE_IDS.nhsRectalBleeding, COVERAGE_SOURCE_IDS.nhsBowelCancerSymptoms],
        rationale: 'NHS guidance names poo that has been different from normal for 3 weeks as a reason to see a GP.',
        progressionStage: 'characterize',
        informationGainRank: 70,
      });
      push({
        id: INTAKE_QUESTION_IDS.bowelSystemic,
        category: 'context',
        eyebrow: 'Anything else',
        prompt: 'Along with the weight loss, have you noticed any of these? Choose all that apply.',
        control: 'multi-select',
        options: options(['tired-breathless', 'More tired or short of breath than usual'], ['pain-lump', 'Tummy pain or a lump in the tummy'], ['urge', 'Often feeling the need to poo'], ['none', 'None of these']),
        exclusiveOptionIds: ['none'],
        showWhen: [...premise, { questionId: INTAKE_QUESTION_IDS.bowelAlarmFeature, optionIds: ['weight-loss', 'both'] }],
        sourceIds: [COVERAGE_SOURCE_IDS.nhsBowelCancerSymptoms],
        rationale: 'The accompanying symptoms NHS lists with unintended weight loss and a bowel change. They can coexist, so all are collected.',
        progressionStage: 'characterize',
        informationGainRank: 72,
      });
    }
  };

  /* Generic building blocks, used only where a branch has nothing more specific. */
  let asksImpact = true;
  let asksDuration = true;
  let asksOnset = true;

  const impact = () => push({
    id: INTAKE_QUESTION_IDS.currentImpact,
    category: 'intensity',
    eyebrow: caregiver ? 'Observed impact' : 'Current impact',
    prompt: say('How much is this bothering you right now?', 'How much is this affecting your child right now?'),
    control: 'five-point-scale',
    options: INTENSITY_OPTIONS,
    sourceIds,
    rationale: 'Captures reported or observed impact; the answer does not itself trigger emergency routing.',
    safetyPurpose: 'A severe response brings the branch safety checks forward; it is not an emergency rule.',
    acuityOptionIds: ['5'],
    progressionStage: 'characterize',
    informationGainRank: 20,
  });
  const duration = () => push({
    id: INTAKE_QUESTION_IDS.duration,
    category: 'duration',
    eyebrow: 'Timeline',
    prompt: say('How long has this been happening?', 'How long has your child had this?'),
    control: 'segmented',
    options: DURATION_OPTIONS,
    sourceIds,
    rationale: 'Establishes the timeline after the complaint has been characterized.',
    progressionStage: 'characterize',
    informationGainRank: 25,
  });
  const onsetQuestion = () => push({
    id: INTAKE_QUESTION_IDS.onset,
    category: 'onset',
    eyebrow: 'Onset',
    prompt: 'How did it begin?',
    control: 'choice-grid',
    options: ONSET_OPTIONS,
    sourceIds,
    rationale: 'Distinguishes sudden, gradual and event-related onset inside the active branch.',
    safetyPurpose: 'A sudden answer brings the branch safety checks forward but cannot fire a rule.',
    acuityOptionIds: ['sudden'],
    progressionStage: 'characterize',
    informationGainRank: 30,
  });

  /* --- Laterality, for the paired face organs ---------------------------- */
  const laterality = (organ: 'eye' | 'ear') => push({
    id: INTAKE_QUESTION_IDS.faceLaterality,
    category: 'context',
    eyebrow: 'Which side',
    prompt: say(`Is it only this ${organ}, or both?`, `Is it only this ${organ}, or both of your child's ${organ}s?`),
    control: 'choice-grid',
    options: options(['this-side', `Only this ${organ}`], ['both', `Both ${organ}s`], ['unsure', 'Not sure']),
    sourceIds: organ === 'eye' ? [COVERAGE_SOURCE_IDS.nhsEyePain] : [COVERAGE_SOURCE_IDS.nhsEarInfections],
    rationale: 'One-sided and two-sided eye and ear problems are assessed differently; the selected side comes from the face map, so only the other side is asked.',
    progressionStage: 'characterize',
    informationGainRank: 15,
  });

  /*
    What was noticed at and since an injury (PENDING CLINICAL REVIEW). NHS
    Knee pain lists an unstable joint with a pop at the time of injury with
    ligament, tendon or cartilage damage, and NHS Sprains and strains turns on
    swelling and bruising. Context for the clinician; it is not a referral
    criterion, and deformity, numbness or being unable to bear weight at all
    stay with the R3 injury check.
  */
  const injuryFeatures = () => push({
    id: INTAKE_QUESTION_IDS.injuryFeatures,
    category: 'context',
    eyebrow: 'Since the injury',
    prompt: say('Have you noticed any of these? Choose all that apply.', 'Have you noticed any of these in your child? Choose all that apply.'),
    control: 'multi-select',
    options: options(['pop', 'A pop or snap at the time'], ['swelled-fast', 'It swelled up within a few hours'], ['bruising', 'Bruising'], ['previous', 'The same place was injured before'], ['none', 'None of these']),
    exclusiveOptionIds: ['none'],
    sourceIds: [COVERAGE_SOURCE_IDS.nhsKneePain, COVERAGE_SOURCE_IDS.nhsSprains],
    rationale: 'NHS Knee pain lists a pop at the time of injury with ligament or cartilage damage, and NHS Sprains and strains turns on swelling and bruising; an earlier injury to the same place is context for the clinician.',
    progressionStage: 'characterize',
    informationGainRank: 22,
  });

  /*
    Tooth and gum features (PENDING CLINICAL REVIEW). Asked only once the
    problem is placed in a tooth or the gum. Each option is a feature NHS
    Toothache, Dental abscess or Gum disease names for seeing a dentist; a
    swelling or a high temperature brings the dental emergency check forward,
    which owns swelling around the eye or neck and a mouth that will not open.
  */
  const toothFeatures = (site: ShowCondition) => push({
    id: INTAKE_QUESTION_IDS.toothFeatures,
    category: 'context',
    eyebrow: 'Tooth or gum',
    prompt: say('Do any of these apply? Choose all that apply.', 'Do any of these apply to your child? Choose all that apply.'),
    control: 'multi-select',
    // How long it has lasted is read from the duration question the branch already asked.
    options: options(
      ['painkillers', 'Painkillers are not helping'],
      ['bite', 'It hurts to bite or chew on it'],
      ['hot-cold', 'It hurts with hot or cold food or drink'],
      ['gums', 'Red, swollen, sore or bleeding gums'],
      ['swelling', 'A swollen cheek or jaw'],
      ['taste', 'A bad taste in the mouth'],
      ['loose', 'A tooth feels loose'],
      ['temperature', 'A high temperature'],
      ['none', 'None of these'],
    ),
    exclusiveOptionIds: ['none'],
    acuityOptionIds: ['swelling', 'temperature'],
    showWhen: site,
    sourceIds: [COVERAGE_SOURCE_IDS.nhsToothache, COVERAGE_SOURCE_IDS.nhsDentalAbscess, COVERAGE_SOURCE_IDS.nhsGumDisease],
    rationale: 'Each option is a feature NHS Toothache, Dental abscess or Gum disease names for seeing a dentist. They can coexist, and together they separate a dental problem from a jaw joint or mouth lining one.',
    progressionStage: 'discriminate',
    informationGainRank: 30,
  });

  /*
    Joint distribution (NICE NG100 1.1.1; NHS Rheumatoid arthritis, PENDING
    CLINICAL REVIEW). An extension: asked only while the Rheumatology criteria
    can still be met, which needs a swollen joint not caused by an injury.
  */
  const jointPatternQuestion = () => push({
    id: INTAKE_QUESTION_IDS.jointPattern,
    category: 'context',
    eyebrow: 'Your joints',
    prompt: 'Do any of these describe your joints? Choose all that apply.',
    control: 'multi-select',
    options: options(['several', 'More than one joint is affected'], ['small-joints', 'Small joints of the fingers, hands, toes or feet'], ['both-sides', 'The same joints on both sides of the body'], ['morning-stiffness', 'Stiff for more than 30 minutes after waking'], ['none', 'None of these']),
    exclusiveOptionIds: ['none'],
    sourceIds: [COVERAGE_SOURCE_IDS.niceRheumatoidArthritis, COVERAGE_SOURCE_IDS.nhsRheumatoidArthritis],
    rationale: 'NICE NG100 refers persistent joint swelling of no clear cause, urgently when more than one joint or the small joints of the hands or feet are affected; NHS Rheumatoid arthritis adds both sides and morning stiffness lasting longer than 30 minutes.',
    progressionStage: 'discriminate',
    informationGainRank: 45,
    stage: 'extension',
  });

  /*
    QUESTIONNAIRE EXPANSION PHASE 2 (PENDING CLINICAL REVIEW)

    Each builder asks what the NHS page for that part of the body lists in its
    own symptom table, in the patient's words, never a diagnosis. Options that
    a page sends for urgent help bring the matching R3 check forward; they
    never fire a rule themselves.
  */
  const siteRegion = context.bodyRegionId;
  const siteFeatures = (): { options: readonly IntakeOption[]; sources: readonly string[]; acuity: readonly string[]; rationale: string } | null => {
    if (/shoulder/.test(siteRegion)) return {
      options: options(['stiff-long', 'Pain and stiffness that has not gone away for months'], ['worse-using', 'Worse when using the arm or shoulder'], ['top', 'Pain on top of the shoulder, where the collarbone meets it'], ['clicks-unstable', 'It clicks, locks or feels unstable'], ['arm-tingling', 'Tingling, numbness or weakness in the arm'], ['none', 'None of these']),
      sources: [COVERAGE_SOURCE_IDS.nhsShoulderPain], acuity: ['arm-tingling'],
      rationale: 'The rows of the NHS Shoulder pain symptom table, in its own words. Pins and needles or numbness is one of its urgent features.',
    };
    if (/upper-arm|elbow|forearm/.test(siteRegion)) return {
      options: options(['outside-elbow', 'Pain on the outside of the elbow, hard to straighten the arm fully'], ['joint-stiff-swollen', 'Stiffness or swelling around the joint'], ['from-shoulder', 'Pain and stiffness coming down from the shoulder'], ['exercise-rest', 'It hurts when you exercise and eases when you rest'], ['tingling', 'Tingling or numbness in the arm'], ['none', 'None of these']),
      sources: [COVERAGE_SOURCE_IDS.nhsElbowArmPain], acuity: ['tingling'],
      rationale: 'The rows of the NHS Elbow and arm pain symptom table. NHS sends an arm that hurts on exercise and eases with rest to 111, and a tingling or numb arm to A&E.',
    };
    if (/wrist|hand/.test(siteRegion)) return {
      options: options(['night-tingling', 'Aching worse at night, with tingling or pins and needles in the fingers'], ['thumb-base', 'Pain, swelling or stiffness at the base of the thumb'], ['lump-top', 'A smooth lump on top of the wrist'], ['grip', 'Hard to move the wrist or grip things'], ['none', 'None of these']),
      sources: [COVERAGE_SOURCE_IDS.nhsWristPain, COVERAGE_SOURCE_IDS.nhsCarpalTunnel], acuity: [],
      rationale: 'The rows of the NHS Wrist pain symptom table; NHS Carpal tunnel syndrome adds that the tingling is usually worse at night.',
    };
    if (/hip|thigh/.test(siteRegion)) return {
      options: options(['worse-walking', 'Worse when walking, and stiff after moving'], ['stiff-after-rest', 'Stiff after not moving, or for more than 30 minutes after waking'], ['spreads-thigh', 'Spreads down the thigh, worse lying on that side'], ['sleep', 'Stopping you sleeping or doing normal activities'], ['hot-swollen', 'Hot or swollen'], ['none', 'None of these']),
      sources: [COVERAGE_SOURCE_IDS.nhsHipPain], acuity: ['hot-swollen'],
      rationale: 'The rows and GP features of NHS Hip pain in adults. A hot, swollen hip is one of its urgent features.',
    };
    if (/knee/.test(siteRegion)) return {
      options: options(['both-knees', 'Pain and stiffness in both knees'], ['kneel-bend', 'Kneeling or bending makes it worse, and it looks warm or red'], ['below-kneecap', 'Pain and swelling just below the kneecap'], ['run-jump', 'Pain between the kneecap and shin after running or jumping'], ['hot-attacks', 'Hot and red, with sudden attacks of very bad pain'], ['blood-thinner', 'Swelling or bruising while taking a blood-thinning medicine'], ['none', 'None of these']),
      sources: [COVERAGE_SOURCE_IDS.nhsKneePain], acuity: ['hot-attacks'],
      rationale: 'The rows of the NHS Knee pain symptom table, in its own words. Hot, red attacks of very bad pain bring the hot-joint check forward.',
    };
    if (/lower-leg/.test(siteRegion)) return {
      options: options(['one-calf', 'Throbbing pain and swelling in one calf'], ['veins', 'Swollen, twisted or bulging veins'], ['heavy-aching', 'Aching or heaviness in the leg'], ['skin-colour', 'Red, dark or discoloured skin over the painful area'], ['none', 'None of these']),
      sources: [COVERAGE_SOURCE_IDS.nhsDvt, COVERAGE_SOURCE_IDS.nhsVaricoseVeins], acuity: ['one-calf', 'skin-colour'],
      rationale: 'NHS DVT describes throbbing pain and swelling in 1 leg with discoloured skin, which brings the leg clot check forward; NHS Varicose veins describes bulging veins with aching or heaviness.',
    };
    if (/ankle|foot/.test(siteRegion)) return {
      options: options(['first-steps', 'Sharp pain between the arch and heel, worse when you start walking'], ['back-heel', 'Pain at the back of the heel, into the ankle or calf'], ['red-swollen', 'Redness and swelling with a dull ache'], ['tingling', 'Tingling or loss of feeling in the foot'], ['calf-ankle-swelling', 'Swelling and bruising in the calf and ankle'], ['none', 'None of these']),
      sources: [COVERAGE_SOURCE_IDS.nhsHeelPain, COVERAGE_SOURCE_IDS.nhsAnklePain], acuity: [],
      rationale: 'The rows and GP features of NHS Heel pain and Ankle pain, in their own words.',
    };
    if (/back/.test(siteRegion)) return {
      options: options(['lump-shape', 'A lump or swelling in the back, or the back has changed shape'], ['day-to-day', 'Stopping you doing day-to-day activities'], ['sudden-worse', 'Severe pain that started suddenly, or is getting worse quickly'], ['unwell', 'Feeling hot, cold, shivery or generally unwell'], ['none', 'None of these']),
      sources: [COVERAGE_SOURCE_IDS.nhsBackPain], acuity: ['sudden-worse', 'unwell'],
      rationale: 'The GP and urgent features of NHS Back pain. Severe pain that started suddenly or is worsening quickly, or feeling hot, shivery or unwell, brings the urgent back check forward.',
    };
    return null;
  };
  const mskSiteFeaturesQuestion = (rank = 30) => {
    const site = siteFeatures();
    if (!site) return;
    push({
      id: INTAKE_QUESTION_IDS.mskSiteFeatures,
      category: 'context',
      eyebrow: 'What you notice',
      prompt: say('Do any of these describe it? Choose all that apply.', 'Do any of these describe what your child has? Choose all that apply.'),
      control: 'multi-select',
      options: site.options,
      exclusiveOptionIds: ['none'],
      acuityOptionIds: site.acuity.length ? site.acuity : undefined,
      sourceIds: site.sources,
      rationale: site.rationale,
      progressionStage: 'characterize',
      informationGainRank: rank,
    });
  };
  const mskWorseWhenQuestion = () => push({
    id: INTAKE_QUESTION_IDS.mskWorseWhen,
    category: 'pattern',
    eyebrow: 'When it is worse',
    prompt: say('When is it worse? Choose all that apply.', 'When is it worse for your child? Choose all that apply.'),
    control: 'multi-select',
    options: isLowerLimb
      ? options(['using', 'When moving it'], ['weight', 'When putting weight on it or walking'], ['night-rest', 'At night, or when resting or lying on it'], ['morning', 'First thing in the morning, easing as you move'], ['no-pattern', 'No clear pattern'])
      : options(['using', 'When moving or using it'], ['lifting', 'When lifting, reaching or gripping'], ['night-rest', 'At night, or when resting or lying on it'], ['morning', 'First thing in the morning, easing as you move'], ['no-pattern', 'No clear pattern']),
    exclusiveOptionIds: ['no-pattern'],
    sourceIds: [COVERAGE_SOURCE_IDS.nhsHipPain, COVERAGE_SOURCE_IDS.nhsShoulderPain, COVERAGE_SOURCE_IDS.nhsHeelPain, COVERAGE_SOURCE_IDS.nhsWristPain],
    rationale: 'The NHS joint pages separate pain worse with use or walking from pain worse after rest or at night and stiffness after waking. Recorded for the clinician; not a referral criterion.',
    progressionStage: 'characterize',
    informationGainRank: 33,
  });
  const homeTreatmentQuestion = (showWhen: ShowCondition) => push({
    id: INTAKE_QUESTION_IDS.mskHomeTreatment,
    category: 'change',
    eyebrow: 'Treatment so far',
    prompt: say(
      'Have you tried treating it at home, such as rest, ice or heat, and painkillers?',
      'Have you tried treating it at home for your child, such as rest, ice or heat, and painkillers?',
    ),
    control: 'choice-grid',
    options: options(['helping', 'Yes, and it is helping'], ['not-improved', 'Yes, for 2 weeks or more, and it has not improved'], ['under-two-weeks', 'Yes, for less than 2 weeks'], ['not-tried', 'Not yet'], ['unsure', 'Not sure']),
    showWhen,
    sourceIds: [COVERAGE_SOURCE_IDS.nhsJointPain, COVERAGE_SOURCE_IDS.nhsHipPain, COVERAGE_SOURCE_IDS.nhsShoulderPain, COVERAGE_SOURCE_IDS.nhsWristPain, COVERAGE_SOURCE_IDS.nhsAnklePain, COVERAGE_SOURCE_IDS.nhsBackPain, COVERAGE_SOURCE_IDS.nhsNeckPain],
    rationale: 'The NHS joint, back and neck pages send pain that has not improved after about 2 weeks (a few weeks for the back and neck) of home treatment to a GP. Asked only once it has lasted long enough for that to matter.',
    progressionStage: 'characterize',
    informationGainRank: 38,
  });
  // NHS: "not improved after 2 weeks of home treatment" can only apply from 2 weeks on.
  const LONGER_MSK = ['two-to-six-weeks', 'over-six-weeks', 'recurring', 'unsure'];
  const neuroDistributionQuestion = () => push({
    id: INTAKE_QUESTION_IDS.neuroDistribution,
    category: 'context',
    eyebrow: 'Where you feel it',
    prompt: say('Where do you feel it most?', 'Where does your child feel it most?'),
    control: 'choice-grid',
    options: options(['thumb-fingers', 'In the thumb and first two or three fingers'], ['hand-arm', 'Across the hand, or up the arm'], ['both-feet-hands', 'In both feet or both hands'], ['down-leg', 'Down one leg'], ['one-patch', 'In one small patch of skin'], ['unsure', 'Not sure']),
    sourceIds: [COVERAGE_SOURCE_IDS.nhsCarpalTunnel, COVERAGE_SOURCE_IDS.nhsPeripheralNeuropathy, COVERAGE_SOURCE_IDS.nhsSciatica, COVERAGE_SOURCE_IDS.nhsPinsAndNeedles],
    rationale: 'NHS Carpal tunnel syndrome (fingers and hand, worse at night), Peripheral neuropathy (both feet or hands) and Sciatica (down one leg) are separated by where the feeling is.',
    progressionStage: 'characterize',
    informationGainRank: 12,
  });
  const legVeinQuestion = () => push({
    id: INTAKE_QUESTION_IDS.legVeinFeatures,
    category: 'context',
    eyebrow: 'Your leg',
    prompt: 'Do any of these apply to your leg? Choose all that apply.',
    control: 'multi-select',
    options: options(['bulging', 'Swollen, twisted or bulging veins'], ['aching-heavy', 'Aching, heaviness or itching in the leg'], ['skin-change', 'Colour change, or dry, scaly or itchy skin on the lower leg'], ['sore', 'A sore on the leg that has not healed after 2 weeks'], ['hard-vein', 'A hard, painful vein'], ['bleeding-vein', 'A vein that is bleeding'], ['one-leg', 'Throbbing pain and swelling in one leg'], ['none', 'None of these']),
    exclusiveOptionIds: ['none'],
    acuityOptionIds: ['bleeding-vein', 'one-leg'],
    sourceIds: [COVERAGE_SOURCE_IDS.nhsVaricoseVeins, COVERAGE_SOURCE_IDS.niceVaricoseVeins, COVERAGE_SOURCE_IDS.nhsDvt],
    rationale: 'The features NICE CG168 refers to a vascular service, and NHS DVT\'s one-leg pattern. A bleeding vein or pain and swelling in one leg brings the matching urgent check forward.',
    progressionStage: 'discriminate',
    informationGainRank: 35,
  });
  const herniaQuestion = () => push({
    id: INTAKE_QUESTION_IDS.herniaFeatures,
    category: 'context',
    eyebrow: 'The lump',
    prompt: say('Do any of these describe the lump? Choose all that apply.', 'Do any of these describe your child\'s lump? Choose all that apply.'),
    control: 'multi-select',
    options: options(['bigger-cough', 'Gets bigger when coughing, sneezing, crying or straining'], ['smaller-lying', 'Gets smaller or goes away when lying down'], ['tight-skin', 'The skin over it looks tight and stretched'], ['dragging', 'A heavy, dragging feeling'], ['pain', 'Pain in or around the lump'], ['sick-bloated', 'Feeling sick, being sick, or a bloated tummy'], ['none', 'None of these']),
    exclusiveOptionIds: ['none'],
    acuityOptionIds: ['pain', 'sick-bloated'],
    sourceIds: [COVERAGE_SOURCE_IDS.nhsHernia],
    rationale: 'The hernia features NHS Hernia lists, in its own words. Pain, sickness or a bloated tummy with the lump are its 111 features and bring the hernia check forward.',
    progressionStage: 'discriminate',
    informationGainRank: 30,
  });
  const breastQuestion = () => push({
    id: INTAKE_QUESTION_IDS.breastFeatures,
    category: 'context',
    eyebrow: 'The lump or change',
    prompt: 'Do any of these apply? Choose all that apply.',
    control: 'multi-select',
    options: options(['breast-lump', 'A lump in the breast'], ['armpit-lump', 'A lump in the armpit'], ['nipple-inward', 'A nipple that has turned inwards'], ['dimpled', 'Dimpled or puckered skin on the breast'], ['nipple-discharge', 'Discharge from one nipple, or bloodstained discharge'], ['none', 'None of these, it is elsewhere on the chest']),
    exclusiveOptionIds: ['none'],
    sourceIds: [COVERAGE_SOURCE_IDS.nhsBreastLump, COVERAGE_SOURCE_IDS.niceSuspectedCancer],
    rationale: 'The changes NHS Breast lumps sends to a GP and on to a breast clinic, and that NICE NG12 1.4 refers. Asked of men and women.',
    progressionStage: 'discriminate',
    informationGainRank: 15,
  });
  const templeQuestion = () => push({
    id: INTAKE_QUESTION_IDS.templeFeatures,
    category: 'context',
    eyebrow: 'Temple and scalp',
    prompt: 'Do any of these apply? Choose all that apply.',
    control: 'multi-select',
    options: options(['scalp-tender', 'Tender temples or scalp, for example when brushing hair'], ['jaw-eating', 'Jaw pain when eating or talking'], ['frequent-severe', 'Frequent, severe headaches'], ['vision', 'Double vision or loss of vision'], ['none', 'None of these']),
    exclusiveOptionIds: ['none'],
    acuityOptionIds: ['scalp-tender', 'jaw-eating', 'vision'],
    sourceIds: [COVERAGE_SOURCE_IDS.nhsGiantCellArteritis],
    rationale: 'The main symptoms NHS Giant cell arteritis lists. Any of the first, second or fourth brings its urgent check forward, because it can cause stroke or blindness if not treated quickly.',
    progressionStage: 'discriminate',
    informationGainRank: 20,
  });

  const injuryMechanism = () => push({
    id: INTAKE_QUESTION_IDS.injuryDetail,
    category: 'context',
    eyebrow: 'Injury',
    prompt: say('What happened?', 'What happened to your child?'),
    control: 'choice-grid',
    options: options(['fall', 'Fall'], ['impact', 'Direct blow or knock'], ['twist', 'Twist or sudden movement'], ['cut-burn', 'Cut or burn'], ['overuse', 'Repeated use or strain'], ['other', 'Something else']),
    sourceIds: [...sourceIds, COVERAGE_SOURCE_IDS.nhsSprains],
    rationale: 'A patient who named an injury is asked what happened, not asked again whether there was one.',
    progressionStage: 'characterize',
    informationGainRank: 10,
  });

  /*
    ASSOCIATED LOCATION

    One reusable concept, asked only in the branches where its sources say
    where else the same pain is felt changes the assessment: chest pain that
    spreads (NHS Chest pain, NHS Angina, NICE CG95), back pain into a leg (NHS
    Sciatica), neck pain into an arm (NHS Neck pain) and lower tummy pain into
    the back or side (NHS Kidney infection). The answer is evidence about this
    presentation: it never becomes a second complaint and never routes alone.
    The patient's own primary area is not offered.
  */
  const associatedLocation = (spec: {
    rationale: string;
    sourceIds: readonly string[];
    acuityRegionIds?: readonly string[];
    informationGainRank: number;
  }) => push({
    id: INTAKE_QUESTION_IDS.associatedLocation,
    category: 'context',
    eyebrow: 'Associated location',
    prompt: say('Do you feel it anywhere else?', 'Does your child feel it anywhere else?'),
    control: 'body-location',
    options: [
      { id: 'none', label: 'No other area' },
      ...BODY_DOMAIN.regions
        .filter((region) => region.id !== context.bodyRegionId)
        .map((region) => ({ id: region.id, label: region.label })),
    ],
    acuityOptionIds: spec.acuityRegionIds,
    sourceIds: spec.sourceIds,
    rationale: spec.rationale,
    progressionStage: 'discriminate',
    informationGainRank: spec.informationGainRank,
  });

  const mskDurationQuestion = (rank = 25) => push({
    id: INTAKE_QUESTION_IDS.mskDuration,
    category: 'duration',
    eyebrow: 'How long',
    prompt: say('How long has this been going on?', 'How long has your child had this?'),
    control: 'segmented',
    options: options(['under-one-week', 'Less than a week'], ['one-to-two-weeks', '1 to 2 weeks'], ['two-to-six-weeks', '2 to 6 weeks'], ['over-six-weeks', 'More than 6 weeks'], ['recurring', 'It keeps coming back'], ['unsure', 'Not sure']),
    sourceIds: [COVERAGE_SOURCE_IDS.nhsJointPain, COVERAGE_SOURCE_IDS.nhsKneePain, COVERAGE_SOURCE_IDS.nhsSprains],
    rationale: 'The joint pain and knee pain guidance turn on two weeks and a few weeks of home treatment; this replaces the generic duration question.',
    progressionStage: 'characterize',
    informationGainRank: rank,
  });

  const mskMechanicalQuestion = (stage: 'core' | 'extension') => push({
    id: INTAKE_QUESTION_IDS.mskMechanical,
    category: 'context',
    eyebrow: 'Joint features',
    prompt: 'Do any of these happen? Choose all that apply.',
    control: 'multi-select',
    options: options(['locks', 'It locks or catches'], ['gives-way', 'It gives way'], ['clicks-pain', 'It clicks painfully'], ['swelling', 'Swelling that has not gone down or keeps returning'], ['none', 'None of these']),
    exclusiveOptionIds: ['none'],
    sourceIds: [COVERAGE_SOURCE_IDS.nhsKneePain, COVERAGE_SOURCE_IDS.nhsJointPain, COVERAGE_SOURCE_IDS.nhsSprains],
    rationale: 'Locking, giving way and persistent swelling are the mechanical features NHS names for specialist assessment; they can coexist.',
    progressionStage: 'discriminate',
    informationGainRank: 40,
    stage,
  });

  /*
    Back pain that spreads into a leg. NHS Sciatica describes pain in the
    bottom and the back of one leg; NICE NG127 separates the leg features that
    change what happens next. Opened only by a leg or hip area chosen as the
    associated location. Both legs, or numbness around the genitals or bottom,
    is screened by the R3 back check instead, which owns those emergencies.
  */
  const LEG_AREAS = BODY_DOMAIN.regions.filter((region) => LOWER_LIMB_REGION.test(region.id)).map((region) => region.id);
  const backLegFollowUp = () => push({
    id: INTAKE_QUESTION_IDS.backLegSymptoms,
    category: 'context',
    eyebrow: 'The leg',
    prompt: say('In that leg, have you noticed any of these? Choose all that apply.', 'In that leg, has your child noticed any of these? Choose all that apply.'),
    control: 'multi-select',
    options: options(['numb-tingling', 'Numbness or pins and needles'], ['weak', 'Weakness, or the foot catching'], ['below-knee', 'Pain reaching below the knee'], ['none', 'None of these']),
    exclusiveOptionIds: ['none'],
    acuityOptionIds: ['weak'],
    showWhen: { questionId: INTAKE_QUESTION_IDS.associatedLocation, optionIds: LEG_AREAS },
    sourceIds: [COVERAGE_SOURCE_IDS.nhsSciatica, COVERAGE_SOURCE_IDS.niceNeurologicalReferral],
    rationale: 'Asked only once back pain is reported in a leg. The leg features are what NHS Sciatica and NICE NG127 use to separate ordinary back pain from nerve-root involvement; weakness brings the back safety check forward.',
    progressionStage: 'discriminate',
    informationGainRank: 38,
  });

  const lowerBackAssociated = () => {
    associatedLocation({
      rationale: 'NHS Sciatica: sciatica affects the bottom and the back of one leg, often into the foot. Whether back pain is also felt in a leg decides whether the leg questions are asked at all.',
      sourceIds: [COVERAGE_SOURCE_IDS.nhsSciatica, COVERAGE_SOURCE_IDS.nhsBackPain],
      informationGainRank: 36,
    });
    backLegFollowUp();
  };

  const upperGiQuestions = (stage: 'core' | 'extension') => {
    push({
      id: INTAKE_QUESTION_IDS.upperGiTreatment,
      category: 'change',
      eyebrow: 'Treatment so far',
      prompt: 'Have you tried changes to eating, or medicines from a pharmacy, for it?',
      control: 'choice-grid',
      options: options(['helping', 'Yes, and they help'], ['not-helping', 'Yes, but they are not helping'], ['not-tried', 'Not yet'], ['unsure', 'Not sure']),
      sourceIds: [COVERAGE_SOURCE_IDS.nhsHeartburn],
      rationale: 'NHS Heartburn and acid reflux sends heartburn that lifestyle changes and pharmacy medicines are not helping to a GP, who may refer for tests.',
      progressionStage: 'discriminate',
      informationGainRank: 45,
      stage,
    });
    push({
      id: INTAKE_QUESTION_IDS.upperGiAlarm,
      category: 'context',
      eyebrow: 'Other changes',
      prompt: 'Have you noticed any of these as well? Choose all that apply.',
      control: 'multi-select',
      options: options(['food-sticking', 'Food getting stuck when swallowing'], ['sick', 'Keep being sick'], ['weight-loss', 'Losing weight without trying'], ['blood', 'Blood in sick, or black poo'], ['none', 'None of these']),
      exclusiveOptionIds: ['none'],
      acuityOptionIds: ['blood'],
      sourceIds: [COVERAGE_SOURCE_IDS.nhsHeartburn, COVERAGE_SOURCE_IDS.nhsIndigestion],
      rationale: 'The accompanying features NHS Heartburn and NHS Indigestion list as reasons to see a GP. They can coexist.',
      progressionStage: 'discriminate',
      informationGainRank: 50,
      stage,
    });
  };

  const upperGiFrequencyQuestion = () => push({
    id: INTAKE_QUESTION_IDS.upperGiFrequency,
    category: 'pattern',
    eyebrow: 'How often',
    prompt: 'How often does it happen?',
    control: 'segmented',
    options: options(['first', 'This is the first time'], ['now-and-then', 'Now and then'], ['often-weeks', 'Often, for 3 weeks or more'], ['most-days', 'Most days'], ['unsure', 'Not sure']),
    sourceIds: [COVERAGE_SOURCE_IDS.nhsHeartburn, COVERAGE_SOURCE_IDS.nhsIndigestion],
    rationale: 'NHS Heartburn names heartburn most days, and NHS Indigestion keeps getting indigestion, as reasons to see a GP; a first or occasional episode is self-care.',
    progressionStage: 'characterize',
    informationGainRank: 25,
  });

  /* ======================================================================
     WEIGHTED ADULT JOINT OR MUSCLE PAIN
     The approved R1 questions follow the R3 screen and own the belief. These
     describe the pain in the joint guidance's own terms, and the mechanical
     question is an extension asked only if R1 ends without separating a
     candidate, so the sourced orthopaedic criteria can still be met.
     ====================================================================== */
  if (complaint === 'joint-musculoskeletal-pain') {
    push({
      id: INTAKE_QUESTION_IDS.symptomCharacter,
      category: 'character',
      eyebrow: 'Character',
      prompt: 'What does it feel like?',
      control: 'choice-grid',
      options: options(['aching', 'Aching'], ['sharp', 'Sharp'], ['stiff', 'Stiff'], ['throbbing', 'Throbbing'], ['burning', 'Burning'], ['unsure', 'Not sure']),
      sourceIds: [COVERAGE_SOURCE_IDS.nhsJointPain, ...sourceIds],
      rationale: 'Characterizes joint or muscle pain in the vocabulary of the joint pain guidance.',
      progressionStage: 'characterize',
      informationGainRank: 10,
    });
    mskDurationQuestion(15);
    impact();
    /*
      No generic onset question here (phase 3): its "after a specific event"
      duplicates the approved R1 injury question, and a sudden, severe joint is
      the R3 hot-joint check. Removing it shortens adult limb pain without
      losing evidence.
    */
    mskSiteFeaturesQuestion();
    homeTreatmentQuestion({ questionId: INTAKE_QUESTION_IDS.mskDuration, optionIds: LONGER_MSK });
    mskMechanicalQuestion('extension');
    jointPatternQuestion();
    return {
      preScreen: questions.filter((question) => question.stage !== 'extension'),
      postScreen: questions.filter((question) => question.stage === 'extension'),
    };
  }

  /* ======================================================================
     WEIGHTED ADULT UPPER ABDOMINAL PAIN
     R1 asks about exertion, sweating, meals, breathlessness, burning and
     nausea. These describe how often it happens in the bands the NHS pages
     use; treatment and accompanying features are an extension asked only if
     R1 ends without separating a candidate.
     ====================================================================== */
  if (complaint === 'upper-abdominal-pain') {
    push({
      id: INTAKE_QUESTION_IDS.symptomCharacter,
      category: 'character',
      eyebrow: 'Character',
      prompt: 'What does it feel like?',
      control: 'choice-grid',
      options: options(['burning', 'Burning'], ['cramping', 'Cramping'], ['pressure', 'Pressure'], ['sharp', 'Sharp'], ['aching', 'Aching'], ['unsure', 'Not sure']),
      sourceIds,
      rationale: 'Characterizes upper abdominal discomfort before the R3 screen.',
      progressionStage: 'characterize',
      informationGainRank: 10,
    });
    upperGiFrequencyQuestion();
    impact();
    onsetQuestion();
    upperGiQuestions('extension');
    return {
      preScreen: questions.filter((question) => question.stage !== 'extension'),
      postScreen: questions.filter((question) => question.stage === 'extension'),
    };
  }

  /* ======================================================================
     EAR
     ====================================================================== */
  if (isEar) {
    asksDuration = false;
    if (caregiver) {
      push({
        id: INTAKE_QUESTION_IDS.pediatricEarObservation,
        category: 'context',
        eyebrow: 'What you have noticed',
        prompt: 'What have you noticed most with your child\'s ear?',
        control: 'choice-grid',
        options: options(
          ['pulling', 'Pulling or rubbing the ear'], ['sound-response', 'Not reacting to some sounds'],
          ['irritable', 'More irritable or restless'], ['feeding', 'Feeding less than usual'],
          ['balance', 'Losing balance'], ['discharge', 'Fluid coming from the ear'],
        ),
        sourceIds: [COVERAGE_SOURCE_IDS.nhsEarInfections, COVERAGE_SOURCE_IDS.nhmImnci],
        rationale: 'Caregiver-observable ear signs replace an adult-style description of sensation (IMNCI asks about rubbing, irritability and discharge).',
        progressionStage: 'characterize',
        informationGainRank: 10,
      });
    } else if (concern === 'injury') {
      injuryMechanism();
    } else {
      push({
        id: INTAKE_QUESTION_IDS.earDetail,
        category: 'context',
        eyebrow: 'Ear detail',
        prompt: concern === 'hearing-balance-change' ? 'What has changed most with your hearing or balance?' : 'What is the ear problem like?',
        control: 'choice-grid',
        options: concern === 'hearing-balance-change'
          ? options(['reduced-hearing', 'Reduced or muffled hearing'], ['ringing', 'Ringing or another sound'], ['spinning', 'A spinning feeling'], ['unsteady', 'Unsteady without spinning'], ['unsure', 'Not sure'])
          : concern === 'ear-discharge'
            ? options(['clear-fluid', 'Clear fluid'], ['pus-like', 'Thick or pus-like fluid'], ['blood', 'Blood'], ['mixed', 'More than one'], ['unsure', 'Not sure'])
            : concern === 'pain'
              ? options(['inside', 'Deep inside the ear'], ['outer', 'Outer ear'], ['touch', 'Worse when touched'], ['pressure', 'Pressure or fullness'], ['unsure', 'Not sure'])
              : concern === 'swelling-lump'
                ? options(['behind', 'Behind the ear'], ['outer', 'On the outer ear or earlobe'], ['front', 'In front of the ear'], ['touch', 'Painful to touch'], ['unsure', 'Not sure'])
                : options(['pressure', 'Pressure or fullness'], ['itching', 'Itching or irritation'], ['hearing', 'Hearing change'], ['balance', 'Dizziness or balance change'], ['local', 'A local skin or swelling change'], ['other', 'Something else']),
        sourceIds: [COVERAGE_SOURCE_IDS.nhsEarInfections, COVERAGE_SOURCE_IDS.nhsHearingLoss, COVERAGE_SOURCE_IDS.nhsTinnitus, COVERAGE_SOURCE_IDS.nhsVertigo],
        rationale: 'Characterizes the selected ear complaint before asking cross-system questions.',
        // Each acuity id must be one of this variant's own options.
        acuityOptionIds: concern === 'hearing-balance-change'
          ? ['spinning']
          : concern === 'swelling-lump' ? ['behind']
          : concern === 'pain' || concern === 'ear-discharge' ? undefined : ['balance'],
        progressionStage: 'characterize',
        informationGainRank: 10,
      });
    }
    laterality('ear');
    push({
      id: INTAKE_QUESTION_IDS.earPersistence,
      category: 'duration',
      eyebrow: 'How long it has lasted',
      prompt: say('How long has this ear problem been going on?', 'How long has your child had this ear problem?'),
      control: 'segmented',
      options: options(
        ['under-three-days', 'Less than 2 to 3 days'],
        ['over-three-days', 'More than 2 to 3 days'],
        ['two-weeks-plus', 'Fluid for 2 weeks or more'],
        ['recurrent', 'It keeps coming back'],
        ['unsure', 'Not sure'],
      ),
      sourceIds: [COVERAGE_SOURCE_IDS.nhsEarache, COVERAGE_SOURCE_IDS.nhsEarInfections, COVERAGE_SOURCE_IDS.nhmImnci],
      rationale: 'NHS Earache separates the first two to three days from a longer or repeated earache, and IMNCI treats ear discharge for 14 days or more differently from a shorter one. This replaces the generic duration question for the ear branch.',
      progressionStage: 'characterize',
      informationGainRank: 25,
    });
    push({
      id: INTAKE_QUESTION_IDS.earAssociated,
      category: 'context',
      eyebrow: 'Other ear changes',
      prompt: say('Is anything else happening with it? Choose all that apply.', 'Have you noticed anything else? Choose all that apply.'),
      control: 'multi-select',
      options: options(['pain', 'Ear pain'], ['hearing', 'Hearing change'], ['ringing', 'Ringing or noise'], ['discharge', 'Fluid or bleeding'], ['pressure', 'Pressure or fullness'], ['dizzy', 'Dizziness or balance change'], ['jaw-tooth', 'Jaw or tooth pain'], ['unwell', 'Feverish or generally unwell'], ['none', 'None of these']),
      exclusiveOptionIds: ['none'],
      acuityOptionIds: ['dizzy'],
      sourceIds: [COVERAGE_SOURCE_IDS.nhsEarInfections, COVERAGE_SOURCE_IDS.nhsHearingLoss, COVERAGE_SOURCE_IDS.nhsTinnitus, COVERAGE_SOURCE_IDS.nhsVertigo, COVERAGE_SOURCE_IDS.nhsTmd],
      rationale: 'These findings can coexist, so all are collected. Local ear evidence is weighed beside the competing balance, jaw or dental and systemic patterns, so ear pain is never treated as an ear-service problem by location alone.',
      progressionStage: 'discriminate',
      informationGainRank: 40,
    });
  /* ======================================================================
     NOSE
     ====================================================================== */
  // A skin change or a lump on the nose is asked by the skin or lump branch, not the sinus one.
  } else if (isNose && concern !== 'skin-change' && concern !== 'swelling-lump') {
    if (caregiver) {
      push({
        id: INTAKE_QUESTION_IDS.pediatricNoseObservation,
        category: 'context',
        eyebrow: 'What you have noticed',
        prompt: 'What have you noticed most with your child\'s nose?',
        control: 'choice-grid',
        options: options(['blocked', 'Blocked nose or breathing through the mouth'], ['runny', 'Runny nose or discharge'], ['bleeding', 'Nosebleed'], ['feeding', 'Difficulty feeding'], ['irritable', 'More irritable than usual'], ['swelling', 'Facial swelling or tenderness']),
        sourceIds: [COVERAGE_SOURCE_IDS.nhsSinusitis, COVERAGE_SOURCE_IDS.nhsNosebleed, COVERAGE_SOURCE_IDS.nhmImnci],
        rationale: 'Uses observable child features supported by the nasal symptom sources.',
        progressionStage: 'characterize',
        informationGainRank: 10,
      });
    } else if (concern === 'injury') {
      injuryMechanism();
      // Phase 3 (PENDING CLINICAL REVIEW): what NHS Broken nose lists; the emergency signs are the R3 nose injury check.
      push({
        id: INTAKE_QUESTION_IDS.noseInjuryFeatures,
        category: 'context',
        eyebrow: 'Since the injury',
        prompt: say('Have you noticed any of these? Choose all that apply.', 'Have you noticed any of these in your child? Choose all that apply.'),
        control: 'multi-select',
        options: options(['crooked', 'The nose looks crooked or has changed shape'], ['blocked', 'Hard to breathe through the nose, or it feels blocked'], ['crunching', 'A crunching or crackling sound when touched'], ['swelling-3-days', 'Swelling that has not started to go down after 3 days'], ['none', 'None of these']),
        exclusiveOptionIds: ['none'],
        sourceIds: [COVERAGE_SOURCE_IDS.nhsBrokenNose],
        rationale: 'The broken-nose features NHS Broken nose lists, in its own words; a crooked nose or swelling not settling after 3 days is its 111 advice. Context for the clinician.',
        progressionStage: 'characterize',
        informationGainRank: 15,
      });
    } else {
      push({
        id: INTAKE_QUESTION_IDS.noseDetail,
        category: 'context',
        eyebrow: 'Nose detail',
        prompt: concern === 'bleeding-discharge' ? 'How long or how heavily did it bleed?' : 'What is the main nose problem?',
        control: 'choice-grid',
        options: concern === 'bleeding-discharge'
          ? options(['under-ten', 'Stopped within 10 minutes'], ['ten-fifteen', 'Lasted 10 to 15 minutes'], ['over-fifteen', 'Longer than 15 minutes'], ['excessive', 'Seems excessive'], ['recurrent', 'Keeps happening'])
          : concern === 'nose-change'
            ? options(['blocked', 'Mostly blocked'], ['runny', 'Mostly runny or discharge'], ['smell', 'Reduced or changed smell'], ['mixed', 'A mixture of these'], ['unsure', 'Not sure'])
            : options(['pressure', 'Pain or pressure'], ['swelling', 'Swelling or tenderness'], ['bleeding', 'Bleeding'], ['discharge', 'Nasal discharge'], ['injury', 'After an injury'], ['other', 'Something else']),
        sourceIds: [COVERAGE_SOURCE_IDS.nhsSinusitis, COVERAGE_SOURCE_IDS.nhsNosebleed],
        rationale: 'Characterizes the selected nasal concern before asking associated features.',
        // Each acuity id must be one of this variant's own options.
        acuityOptionIds: concern === 'bleeding-discharge'
          ? ['over-fifteen', 'excessive']
          : concern === 'nose-change' ? undefined : ['bleeding', 'injury'],
        progressionStage: 'characterize',
        informationGainRank: 10,
      });
    }
    const bleedingBranch = concern === 'bleeding-discharge' || concern === 'injury';
    const SHORT_NASAL = ['one-to-three-weeks', 'unsure'];
    if (bleedingBranch) {
      asksOnset = false;
    } else {
      asksDuration = false;
      push({
        id: INTAKE_QUESTION_IDS.nosePersistence,
        category: 'duration',
        eyebrow: 'How long it has lasted',
        prompt: say('How long has the nose or sinus problem been going on?', 'How long has your child had this nose problem?'),
        control: 'segmented',
        options: options(
          ['under-one-week', 'Less than a week'],
          ['one-to-three-weeks', '1 to 3 weeks'],
          ['three-weeks-to-three-months', '3 weeks to 3 months'],
          ['over-three-months', 'Longer than 3 months'],
          ['unsure', 'Not sure'],
        ),
        sourceIds: [COVERAGE_SOURCE_IDS.nhsSinusitis],
        rationale: 'NHS Sinusitis names three weeks of self-treatment and three months of treatment as its escalation and ENT referral points, so duration is collected in those bands instead of the generic question.',
        progressionStage: 'characterize',
        informationGainRank: 25,
      });
      /*
        A short problem (1 to 3 weeks, or not sure) asks about treatment: NHS
        Sinusitis sends someone who is no better after 7 days of treatment to a
        GP. It cannot reach ENT, whose criteria need 3 weeks or more, so the
        one-sided and recurrent discriminators are not asked of it.
      */
      push({
        id: INTAKE_QUESTION_IDS.noseTreatment,
        category: 'context',
        eyebrow: 'Treatment so far',
        prompt: say(
          'Have you tried treatment from a pharmacy or GP for it?',
          'Has your child had treatment from a pharmacy or GP for it?',
        ),
        control: 'choice-grid',
        options: options(['helped', 'Yes, and it has helped'], ['not-helped', 'Yes, but no better after 7 days'], ['not-tried', 'Not yet'], ['unsure', 'Not sure']),
        showWhen: { questionId: INTAKE_QUESTION_IDS.nosePersistence, optionIds: SHORT_NASAL },
        sourceIds: [COVERAGE_SOURCE_IDS.nhsSinusitis],
        rationale: 'NHS Sinusitis names no improvement after 7 days of pharmacy or GP treatment as a reason to see a GP. Asked only of a short problem, where it is the relevant next step.',
        progressionStage: 'characterize',
        informationGainRank: 30,
      });
      /*
        The sinonasal discriminators. Extension stage: asked only while the ENT
        criteria (3 weeks or more, plus one-sided, recurrent or a sinonasal
        pattern) can still be met and are not met already.
      */
      push({
        id: INTAKE_QUESTION_IDS.noseAssociated,
        category: 'context',
        eyebrow: 'Other changes',
        prompt: say('Is anything else happening with it? Choose all that apply.', 'Have you noticed anything else? Choose all that apply.'),
        control: 'multi-select',
        options: options(['facial-pressure', 'Cheek, eye or forehead pressure'], ['fever', 'High temperature or generally unwell'], ['tooth-ear', 'Toothache or ear pressure'], ['one-sided', 'Mostly on one side'], ['recurrent', 'Keeps coming back'], ['none', 'None of these']),
        exclusiveOptionIds: ['none'],
        sourceIds: [COVERAGE_SOURCE_IDS.nhsSinusitis],
        rationale: 'NHS Sinusitis names one-sided symptoms and repeated episodes as ENT referral criteria. The findings can coexist, so all are collected.',
        progressionStage: 'discriminate',
        informationGainRank: 40,
      });
    }
    if (bleedingBranch) {
      push({
        id: INTAKE_QUESTION_IDS.nosebleedAssociated,
        category: 'context',
        eyebrow: 'Other changes',
        prompt: say('Is anything else happening with it? Choose all that apply.', 'Have you noticed anything else? Choose all that apply.'),
        control: 'multi-select',
        options: options(['swallowed', 'Swallowed blood or vomited'], ['weak-dizzy', 'Weak or dizzy'], ['breathing', 'Difficulty breathing'], ['head-injury', 'Started after a blow to the head'], ['blood-thinner', 'Taking a blood-thinning medicine'], ['none', 'None of these']),
        exclusiveOptionIds: ['none'],
        acuityOptionIds: ['swallowed', 'weak-dizzy', 'breathing', 'head-injury'],
        sourceIds: [COVERAGE_SOURCE_IDS.nhsNosebleed],
        rationale: 'The bleeding-burden features NHS Nosebleed names for immediate assessment. They can coexist, so all are collected, and any of the first four brings the nosebleed check forward.',
        progressionStage: 'discriminate',
        informationGainRank: 40,
      });
    }
  /* ======================================================================
     EYE
     ====================================================================== */
  } else if (isEye) {
    /*
      An eye injury is asked what happened, not which eye change matters most:
      NHS Eye pain treats a chemical in the eye, something stuck in it and a
      blow differently, and a chemical splash is the one that cannot wait.
    */
    if (concern === 'injury') push({
      id: INTAKE_QUESTION_IDS.eyeInjuryDetail,
      category: 'context',
      eyebrow: 'Eye injury',
      prompt: say('What happened to your eye?', 'What happened to your child\'s eye?'),
      control: 'choice-grid',
      options: options(['chemical', 'A chemical or cleaning product splashed in it'], ['something-in', 'Something went into it or is still in it'], ['scratch', 'It was scratched or poked'], ['blow', 'A blow to the eye'], ['other', 'Something else']),
      acuityOptionIds: ['chemical', 'something-in'],
      sourceIds: [COVERAGE_SOURCE_IDS.nhsEyePain],
      rationale: 'NHS Eye pain names a chemical in the eye and something stuck in it for immediate assessment, and an injury for eye-service assessment; the kind of injury decides how soon the eye check is asked.',
      progressionStage: 'characterize',
      informationGainRank: 10,
    });
    else push({
      id: INTAKE_QUESTION_IDS.eyeDetail,
      category: 'context',
      eyebrow: 'Eye detail',
      prompt: concern === 'vision-change'
        ? say('How has your vision changed?', 'How has your child\'s vision changed?')
        : concern === 'pain'
          ? 'What is the eye pain like?'
          : concern === 'eye-redness-discharge'
            ? 'What is the redness or discharge like?'
            : 'Which eye change is most important right now?',
      control: 'choice-grid',
      // Each entry is asked its own descriptors; the shared list is kept for swelling and other.
      options: concern === 'vision-change'
        ? options(['blurred', 'Blurred'], ['double', 'Double vision'], ['reduced', 'Reduced or missing vision'], ['colour', 'Colours look different'], ['flashes', 'Flashes or dark spots'], ['unsure', 'Not sure'])
        : concern === 'pain'
          ? options(['sharp', 'Sharp or stabbing'], ['gritty', 'Gritty, or something in the eye'], ['aching', 'Aching or throbbing'], ['light', 'Worse in bright light'], ['squint', 'The eye turns in or out (a squint)'], ['unsure', 'Hard to describe'])
          : concern === 'eye-redness-discharge'
            ? options(['red', 'Very red'], ['sticky', 'Sticky or crusted discharge'], ['watery', 'Watering'], ['gritty', 'Gritty or something-in-eye feeling'], ['itchy', 'Itchy'], ['light', 'Sensitive to light'], ['unsure', 'Not sure'])
            : options(['pain', 'Pain'], ['red', 'Very red'], ['light', 'Light sensitivity'], ['watery', 'Watering or discharge'], ['gritty', 'Gritty or something-in-eye feeling'], ['swelling', 'Lid or surrounding swelling'], ['squint', 'The eye turns in or out (a squint)']),
      sourceIds: [COVERAGE_SOURCE_IDS.nhsEyePain, COVERAGE_SOURCE_IDS.nhsSquint],
      rationale: 'Starts with the selected eye presentation rather than a generic face questionnaire.',
      // Each acuity id must be one of this variant's own options.
      acuityOptionIds: concern === 'vision-change' ? ['reduced'] : undefined,
      progressionStage: 'characterize',
      informationGainRank: 10,
    });
    laterality('eye');
    // The squint follow-up opens on the "squint" detail, which the vision-change
    // variant does not offer; there it could never be asked, so it is not planned.
    if (concern !== 'vision-change' && concern !== 'injury' && concern !== 'eye-redness-discharge') push({
      id: INTAKE_QUESTION_IDS.eyeSquintPattern,
      category: 'pattern',
      eyebrow: 'Eye turn',
      prompt: say('Is the eye turn there all the time, or does it come and go?', 'Is your child\'s eye turn there all the time, or does it come and go?'),
      control: 'choice-grid',
      options: options(['all-the-time', 'All the time'], ['comes-and-goes', 'It comes and goes'], ['unsure', 'Not sure']),
      showWhen: { questionId: INTAKE_QUESTION_IDS.eyeDetail, optionIds: ['squint'] },
      sourceIds: [COVERAGE_SOURCE_IDS.nhsSquint],
      rationale: 'NHS Squint refers a squint that is there all the time, or one that comes and goes after 3 months of age, to an eye specialist.',
      progressionStage: 'discriminate',
      informationGainRank: 45,
    });
    push({
      id: INTAKE_QUESTION_IDS.eyeAssociated,
      category: 'context',
      eyebrow: 'Other eye changes',
      prompt: 'Do any of these also apply? Choose all that apply.',
      control: 'multi-select',
      // An injury was already described by what happened, so it is not offered again.
      options: concern === 'injury'
        ? options(['vision', 'Vision change'], ['red', 'Very red eye'], ['light', 'Light sensitivity'], ['contact-lens', 'Contact lens use'], ['recent-treatment', 'Eye surgery or treatment in the last 4 weeks'], ['none', 'None of these'])
        : options(['vision', 'Vision change'], ['red', 'Very red eye'], ['light', 'Light sensitivity'], ['contact-lens', 'Contact lens use'], ['recent-treatment', 'Eye surgery or treatment in the last 4 weeks'], ['injury', 'Injury or something stuck'], ['none', 'None of these']),
      exclusiveOptionIds: ['none'],
      acuityOptionIds: concern === 'injury' ? ['vision'] : ['injury'],
      sourceIds: [COVERAGE_SOURCE_IDS.nhsEyePain],
      rationale: 'Collects the eye-service features NHS Eye pain names, and treatment or injury context, after the complaint is established.',
      progressionStage: 'discriminate',
      informationGainRank: 40,
    });
  /* ======================================================================
     MOUTH, JAW AND CHIN
     ====================================================================== */
  // A swelling in the mouth or jaw is asked as a lump (NHS Lumps), not what happens when the jaw moves.
  } else if (isOral && complaint !== 'throat-concern' && concern !== 'swelling-lump') {
    if (concern === 'mouth-change' || concern === 'bleeding-discharge') {
      asksDuration = false;
      push({
        id: INTAKE_QUESTION_IDS.mouthDetail,
        category: 'context',
        eyebrow: 'Mouth detail',
        prompt: concern === 'bleeding-discharge' ? 'Where is the bleeding or discharge coming from?' : 'What is the main change in the mouth?',
        control: 'choice-grid',
        // Each entry is asked its own descriptors: a bleeding concern is asked where it comes from.
        options: concern === 'bleeding-discharge'
          ? options(['gums', 'The gums'], ['sore', 'A sore or ulcer'], ['tooth', 'Around a tooth'], ['injury', 'After a knock or bite'], ['unsure', 'Not sure'])
          : options(['ulcer', 'A sore or ulcer'], ['tooth-gum', 'Tooth or gum pain'], ['bleeding', 'Bleeding'], ['patch', 'A white or red patch'], ['lump', 'A lump'], ['other', 'Something else']),
        sourceIds: [COVERAGE_SOURCE_IDS.nhsMouthUlcers, COVERAGE_SOURCE_IDS.niceSuspectedCancer],
        rationale: 'Separates an ordinary sore from a tooth problem and from the patch or lump features that NICE names for referral.',
        progressionStage: 'characterize',
        informationGainRank: 10,
      });
      push({
        id: INTAKE_QUESTION_IDS.mouthDuration,
        category: 'duration',
        eyebrow: 'How long it has lasted',
        prompt: say('How long has it been there?', 'How long has your child had it?'),
        control: 'segmented',
        options: options(['under-one-week', 'Less than a week'], ['one-to-three-weeks', '1 to 3 weeks'], ['over-three-weeks', 'More than 3 weeks'], ['keeps-returning', 'It keeps coming back'], ['unsure', 'Not sure']),
        sourceIds: [COVERAGE_SOURCE_IDS.nhsMouthUlcers, COVERAGE_SOURCE_IDS.niceSuspectedCancer],
        rationale: 'The mouth ulcer guidance and NICE NG12 both turn on a sore lasting more than 3 weeks.',
        progressionStage: 'characterize',
        informationGainRank: 25,
      });
      toothFeatures({
        questionId: INTAKE_QUESTION_IDS.mouthDetail,
        optionIds: concern === 'bleeding-discharge' ? ['gums', 'tooth'] : ['tooth-gum'],
      });
    } else if (concern === 'injury') {
      injuryMechanism();
    } else {
      push({
        id: INTAKE_QUESTION_IDS.jawDetail,
        category: 'context',
        eyebrow: 'Jaw detail',
        prompt: concern === 'pain' ? 'Where is the pain, and what is it like?' : 'What happens when the jaw moves?',
        control: 'choice-grid',
        options: concern === 'pain'
          ? options(['tooth-gum', 'In a tooth or the gum'], ['joint', 'At the jaw joint, in front of the ear'], ['chewing-pain', 'Worse when chewing'], ['inside', 'Inside the mouth'], ['unsure', 'Hard to describe'])
          : options(['chewing-pain', 'Pain is worse when chewing'], ['limited', 'Cannot open fully'], ['locking', 'Locks open or closed'], ['clicking', 'Clicking, popping or grinding'], ['no-change', 'Movement does not change it'], ['unsure', 'Not sure']),
        sourceIds: [COVERAGE_SOURCE_IDS.nhsTmd],
        rationale: 'Separates movement-related jaw features before asking about neighbouring systems.',
        progressionStage: 'characterize',
        informationGainRank: 10,
      });
      if (concern === 'pain') toothFeatures({ questionId: INTAKE_QUESTION_IDS.jawDetail, optionIds: ['tooth-gum'] });
    }
    push({
      id: INTAKE_QUESTION_IDS.jawAssociated,
      category: 'context',
      eyebrow: 'Other changes',
      prompt: 'Is anything else linked with it? Choose all that apply.',
      control: 'multi-select',
      options: options(['tooth', 'Tooth or dental pain'], ['ear', 'Ear pain or fullness'], ['temple', 'Temple pain or headache'], ['mouth-sore', 'Sore or change inside the mouth'], ['injury', 'A blow or injury'], ['vision', 'New double or reduced vision'], ['none', 'None of these']),
      exclusiveOptionIds: ['none'],
      acuityOptionIds: ['vision'],
      sourceIds: [COVERAGE_SOURCE_IDS.nhsTmd, COVERAGE_SOURCE_IDS.nhsMouthUlcers],
      rationale: 'Dental, ear, temple, oral and injury evidence can coexist and branches only after an oral complaint is known.',
      progressionStage: 'discriminate',
      informationGainRank: 40,
    });
  /* ======================================================================
     THROAT
     ====================================================================== */
  } else if (complaint === 'throat-concern') {
    asksDuration = false;
    asksOnset = false;
    push({
      id: INTAKE_QUESTION_IDS.throatDetail,
      category: 'context',
      eyebrow: 'Throat detail',
      prompt: concern === 'voice-swallow'
        ? say('What has changed most with your voice or swallowing?', 'What has changed most with your child\'s voice or swallowing?')
        : say('What is bothering you most about your throat?', 'What seems to bother your child most about their throat?'),
      control: 'choice-grid',
      // A sore throat and a voice or swallowing change are separate entries, so each is asked its own descriptors.
      options: concern === 'voice-swallow'
        ? options(
          ['hoarse', 'Hoarse or changed voice'],
          ['swallowing', 'Food or drink is hard to get down'],
          ['choking', 'Coughing or choking when eating or drinking'],
          ['lump-feeling', 'Feels like a lump in the throat'],
          ['unsure', 'Not sure'],
        )
        : options(
          ['sore', 'Sore or scratchy throat'],
          ['painful-swallow', 'Pain when swallowing'],
          ['hoarse', 'Hoarse or changed voice'],
          ['lump-feeling', 'Feels like a lump in the throat'],
          ['snoring', 'Loud snoring or noisy breathing when asleep'],
          ['unsure', 'Not sure'],
        ),
      sourceIds: [COVERAGE_SOURCE_IDS.nhsSoreThroat, COVERAGE_SOURCE_IDS.nhsLaryngitis, COVERAGE_SOURCE_IDS.nhsDysphagia],
      rationale: 'Separates an ordinary sore throat from voice, swallowing and lump presentations, which the sources treat differently; NHS Swallowing problems names coughing or choking when eating.',
      acuityOptionIds: concern === 'voice-swallow' ? ['swallowing', 'choking'] : undefined,
      progressionStage: 'characterize',
      informationGainRank: 10,
    });
    push({
      id: INTAKE_QUESTION_IDS.throatDuration,
      category: 'duration',
      eyebrow: 'How long it has lasted',
      prompt: say('How long has this throat problem been going on?', 'How long has your child had this throat problem?'),
      control: 'segmented',
      options: options(['under-one-week', 'Less than a week'], ['one-to-two-weeks', '1 to 2 weeks'], ['two-to-three-weeks', '2 to 3 weeks'], ['over-three-weeks', 'More than 3 weeks'], ['unsure', 'Not sure']),
      sourceIds: [COVERAGE_SOURCE_IDS.nhsSoreThroat, COVERAGE_SOURCE_IDS.nhsLaryngitis, COVERAGE_SOURCE_IDS.nhsLumps],
      rationale: 'NHS pages turn on one week (sore throat), two weeks (voice) and three weeks (a lump), so duration is collected in those bands instead of the generic question.',
      progressionStage: 'characterize',
      informationGainRank: 25,
    });
    push({
      id: INTAKE_QUESTION_IDS.throatAssociated,
      category: 'context',
      eyebrow: 'Other changes',
      prompt: say('Is anything else happening with it? Choose all that apply.', 'Have you noticed anything else? Choose all that apply.'),
      control: 'multi-select',
      options: options(
        ['fever', 'High temperature or shivery'],
        ['glands', 'Swollen, tender glands in the neck'],
        ['neck-lump', 'A lump in the neck that has not gone down'],
        ['ear-pain', 'Ear pain'],
        ['cold', 'Cough, runny nose or other cold symptoms'],
        ['snoring', 'Snoring or pauses in breathing at night'],
        ['none', 'None of these'],
      ),
      exclusiveOptionIds: ['none'],
      sourceIds: [COVERAGE_SOURCE_IDS.nhsSoreThroat, COVERAGE_SOURCE_IDS.nhsTonsillitis, COVERAGE_SOURCE_IDS.nhsLumps],
      rationale: 'Findings that can coexist with a throat concern. A persistent neck lump is a referral feature; cold symptoms point to a short self-limiting illness.',
      progressionStage: 'discriminate',
      informationGainRank: 35,
    });
    push({
      id: INTAKE_QUESTION_IDS.throatRecurrence,
      category: 'pattern',
      eyebrow: 'How often',
      prompt: say('How often have you had sore throats like this?', 'How often has your child had sore throats like this?'),
      control: 'segmented',
      options: options(
        ['first', 'This is the first time'],
        ['occasional', 'A few times, but less often than below'],
        ['seven-in-year', '7 or more times in the past year'],
        ['five-a-year-two-years', '5 or more times a year, for 2 years'],
        ['three-a-year-three-years', '3 or more times a year, for 3 years'],
        ['unsure', 'Not sure'],
      ),
      sourceIds: [COVERAGE_SOURCE_IDS.aomrcTonsillectomy, COVERAGE_SOURCE_IDS.nhsTonsillitis],
      rationale: 'The Academy of Medical Royal Colleges referral criteria for repeated sore throats are exactly these frequency bands, for children and adults, so recurrence is asked in them rather than as "often".',
      progressionStage: 'discriminate',
      informationGainRank: 45,
    });
    push({
      id: INTAKE_QUESTION_IDS.throatImpact,
      category: 'change',
      eyebrow: 'Effect on daily life',
      prompt: say(
        'When you get these sore throats, do they stop you doing your usual things, like work, school or eating normally?',
        'When your child gets these sore throats, do they stop them doing their usual things, like school, play or eating normally?',
      ),
      control: 'yes-no',
      options: options(['yes', 'Yes'], ['no', 'No'], ['unsure', 'Not sure']),
      showWhen: { questionId: INTAKE_QUESTION_IDS.throatRecurrence, optionIds: ['seven-in-year', 'five-a-year-two-years', 'three-a-year-three-years'] },
      sourceIds: [COVERAGE_SOURCE_IDS.aomrcTonsillectomy],
      rationale: 'The same criteria require the episodes to be disabling and prevent normal functioning. Asked only once the frequency criterion is met.',
      progressionStage: 'discriminate',
      informationGainRank: 60,
    });
  /* ======================================================================
     HEAD (children; adults with head pain run the weighted headache set)
     ====================================================================== */
  } else if (complaint === 'head-concern' && concern === 'pain') {
    push({
      id: INTAKE_QUESTION_IDS.headDetail,
      category: 'character',
      eyebrow: 'The headache',
      prompt: say('Where is the headache, and what is it like?', 'Where is your child\'s headache, and what is it like?'),
      control: 'choice-grid',
      options: options(['forehead-pressing', 'Across the forehead, pressing or tight'], ['one-side-throbbing', 'On one side, throbbing'], ['all-over', 'All over the head'], ['back-of-head', 'At the back of the head'], ['unsure', 'Hard to describe']),
      sourceIds: [COVERAGE_SOURCE_IDS.nhsChildHeadache],
      rationale: 'Characterizes the headache in words a child or caregiver can report, without asking them to name a headache type.',
      progressionStage: 'characterize',
      informationGainRank: 10,
    });
    push({
      id: INTAKE_QUESTION_IDS.headFrequency,
      category: 'pattern',
      eyebrow: 'How often',
      prompt: say('How often do you get headaches like this?', 'How often does your child get headaches like this?'),
      control: 'segmented',
      options: options(['first', 'This is the first one'], ['now-and-then', 'Now and then'], ['several-a-week', 'Several times a week'], ['daily', 'Every day'], ['unsure', 'Not sure']),
      sourceIds: [COVERAGE_SOURCE_IDS.nhsChildHeadache],
      rationale: 'NHS Headaches in children sends regular headaches to a doctor; a first or occasional one is self-care. This is that distinction.',
      progressionStage: 'discriminate',
      informationGainRank: 32,
    });
    push({
      id: INTAKE_QUESTION_IDS.headTriggers,
      category: 'context',
      eyebrow: 'What brings it on',
      prompt: 'Does anything seem to bring it on? Choose all that apply.',
      control: 'multi-select',
      options: options(['screens', 'Screens, reading or close work'], ['activity', 'Sport or running around'], ['food-drink', 'Missing meals or not drinking enough'], ['tired-stressed', 'Being tired or stressed'], ['none', 'Nothing obvious']),
      exclusiveOptionIds: ['none'],
      sourceIds: [COVERAGE_SOURCE_IDS.nhsChildHeadache],
      rationale: 'Records ordinary triggers for the handoff. The concerning triggers (coughing, bending, exercise) are asked by the R3 urgent check instead.',
      progressionStage: 'context',
      informationGainRank: 45,
    });
  /* ======================================================================
     BREATHING (children; adults run the weighted breathing set)
     ====================================================================== */
  } else if (complaint === 'chest-breathing-concern') {
    push({
      id: INTAKE_QUESTION_IDS.breathingDetail,
      category: 'character',
      eyebrow: 'Breathing',
      prompt: say('What have you noticed about your breathing? Choose all that apply.', 'What have you noticed about your child\'s breathing? Choose all that apply.'),
      control: 'multi-select',
      options: options(['cough', 'Cough'], ['wheeze', 'Whistling or wheezing when breathing out'], ['noisy-in', 'A harsh noise when breathing in'], ['fast', 'Breathing faster than usual'], ['tight', 'Chest feels tight'], ['none', 'None of these']),
      exclusiveOptionIds: ['none'],
      acuityOptionIds: ['noisy-in', 'fast'],
      sourceIds: [COVERAGE_SOURCE_IDS.nhmImnci],
      rationale: 'IMNCI assesses cough or difficult breathing through observable signs; these can coexist.',
      progressionStage: 'characterize',
      informationGainRank: 10,
    });
    push({
      id: INTAKE_QUESTION_IDS.breathingPattern,
      category: 'pattern',
      eyebrow: 'When it happens',
      prompt: 'When is it worst?',
      control: 'choice-grid',
      options: options(['night', 'At night'], ['activity', 'With exercise or play'], ['colds', 'With colds'], ['all-the-time', 'All the time'], ['on-and-off', 'On and off, with no clear pattern']),
      sourceIds: [COVERAGE_SOURCE_IDS.nhmImnci],
      rationale: 'Separates an illness-related episode from a recurring pattern.',
      progressionStage: 'discriminate',
      informationGainRank: 32,
    });
    push({
      id: INTAKE_QUESTION_IDS.breathingRecurrence,
      category: 'pattern',
      eyebrow: 'Before',
      prompt: say('Have you had breathing problems like this before?', 'Has your child had breathing problems like this before?'),
      control: 'choice-grid',
      options: options(['first', 'No, this is the first time'], ['once-before', 'Once before'], ['keeps-happening', 'Yes, it keeps happening'], ['unsure', 'Not sure']),
      sourceIds: [COVERAGE_SOURCE_IDS.nhmImnci],
      rationale: 'A recurring pattern is handed to the paediatric team differently from a first episode.',
      progressionStage: 'discriminate',
      informationGainRank: 36,
    });
  /* ======================================================================
     ADULT CHEST PAIN
     NICE CG95 defines anginal pain by three features (a constricting
     discomfort in the chest, neck, shoulders, jaw or arms; brought on by
     exertion; settling with rest within about 5 minutes) and names the
     features that make it unlikely (breathing in, movement, eating, pain that
     does not stop). These questions collect exactly those, plus where else it
     is felt. The acute pattern (sudden, persisting, spreading with sweating
     or breathlessness) is the R3 chest check, which these do not repeat.
     ====================================================================== */
  } else if (context.bodyRegionId === 'chest' && concern === 'pain' && !pediatric) {
    asksOnset = false;
    push({
      id: INTAKE_QUESTION_IDS.chestPainCharacter,
      category: 'character',
      eyebrow: 'The chest discomfort',
      prompt: 'What does it feel like?',
      control: 'choice-grid',
      options: options(['tight-heavy', 'Tight, heavy or squeezing'], ['sharp', 'Sharp or stabbing'], ['burning', 'Burning'], ['aching', 'Aching or sore'], ['unsure', 'Hard to describe']),
      sourceIds: [COVERAGE_SOURCE_IDS.niceStableChestPain, COVERAGE_SOURCE_IDS.nhsAngina],
      rationale: 'NICE CG95 and NHS Angina describe anginal pain as a constricting, tight, heavy or squeezing discomfort; sharp and burning pain point elsewhere.',
      progressionStage: 'characterize',
      informationGainRank: 10,
    });
    push({
      id: INTAKE_QUESTION_IDS.chestPainTrigger,
      category: 'pattern',
      eyebrow: 'What brings it on',
      prompt: 'What usually brings it on?',
      control: 'choice-grid',
      options: options(['exertion', 'Physical activity, like walking fast or climbing stairs'], ['stress-cold', 'Stress or cold weather'], ['eating-lying', 'Eating, or lying down after eating'], ['breathing-movement', 'Breathing in, moving, or pressing on the chest'], ['nothing', 'Nothing clear, it comes on at rest'], ['unsure', 'Not sure']),
      sourceIds: [COVERAGE_SOURCE_IDS.niceStableChestPain, COVERAGE_SOURCE_IDS.nhsAngina, COVERAGE_SOURCE_IDS.nhsChestPain],
      rationale: 'Exertion is the second CG95 anginal feature and stress or cold are the other triggers NHS Angina names; pain brought on by breathing in, movement or eating is what CG95 and NHS Chest pain say points to another cause.',
      progressionStage: 'discriminate',
      informationGainRank: 30,
    });
    push({
      id: INTAKE_QUESTION_IDS.chestPainRelief,
      category: 'pattern',
      eyebrow: 'How it settles',
      prompt: 'How does it usually settle?',
      control: 'choice-grid',
      options: options(['rest-minutes', 'Within a few minutes of resting'], ['antacid', 'After an indigestion medicine'], ['on-its-own', 'On its own, not linked to resting'], ['does-not-settle', 'It does not settle, it keeps going'], ['unsure', 'Not sure']),
      acuityOptionIds: ['does-not-settle'],
      sourceIds: [COVERAGE_SOURCE_IDS.niceStableChestPain, COVERAGE_SOURCE_IDS.nhsAngina],
      rationale: 'Settling with rest within about 5 minutes is the third CG95 anginal feature. Pain that does not settle is what CG95 calls continuous or very prolonged, and it brings the chest safety check forward.',
      progressionStage: 'discriminate',
      informationGainRank: 34,
    });
    associatedLocation({
      rationale: 'NICE CG95 counts discomfort felt in the neck, shoulders, jaw or arms as part of anginal pain, and NHS Chest pain names pain spreading to an arm, the neck, jaw, stomach or back. Any of those brings the chest safety check forward.',
      sourceIds: [COVERAGE_SOURCE_IDS.niceStableChestPain, COVERAGE_SOURCE_IDS.nhsChestPain, COVERAGE_SOURCE_IDS.nhsAngina],
      acuityRegionIds: CHEST_SPREAD_AREAS,
      informationGainRank: 36,
    });
  /* ======================================================================
     HEARTBEAT CHANGE
     NHS Heart palpitations: see a GP when they keep coming back or happen more
     often, last more than a few minutes, or come with a heart condition or a
     family history of heart problems; a cardiologist may be needed. Chest
     pain, breathlessness or fainting with them is the R3 palpitations check.
     ====================================================================== */
  } else if (context.bodyRegionId === 'chest' && concern === 'palpitations') {
    asksDuration = false;
    asksOnset = false;
    push({
      id: INTAKE_QUESTION_IDS.palpitationFrequency,
      category: 'pattern',
      eyebrow: 'How often',
      prompt: say('How often have you noticed it?', 'How often has your child noticed it?'),
      control: 'segmented',
      options: options(['once', 'Once'], ['now-and-then', 'Now and then'], ['more-often', 'It keeps coming back, or is happening more often'], ['unsure', 'Not sure']),
      sourceIds: [COVERAGE_SOURCE_IDS.nhsPalpitations],
      rationale: 'NHS Heart palpitations sends palpitations that keep coming back or happen more often to a GP.',
      progressionStage: 'characterize',
      informationGainRank: 10,
    });
    push({
      id: INTAKE_QUESTION_IDS.palpitationLength,
      category: 'duration',
      eyebrow: 'How long it lasts',
      prompt: 'When it happens, how long does it last?',
      control: 'segmented',
      options: options(['seconds', 'A few seconds'], ['few-minutes', 'Up to a few minutes'], ['longer', 'Longer than a few minutes'], ['unsure', 'Not sure']),
      // An episode that lasts may be happening now: NHS names palpitations that do not go away for 999.
      acuityOptionIds: ['longer'],
      sourceIds: [COVERAGE_SOURCE_IDS.nhsPalpitations],
      rationale: 'NHS Heart palpitations names palpitations that last more than a few minutes as a reason to see a GP, and palpitations that do not go away as an emergency; a long episode brings the palpitations check forward.',
      progressionStage: 'characterize',
      informationGainRank: 25,
    });
    push({
      id: INTAKE_QUESTION_IDS.palpitationHistory,
      category: 'context',
      eyebrow: 'Heart history',
      prompt: say('Do any of these apply to you? Choose all that apply.', 'Do any of these apply to your child? Choose all that apply.'),
      control: 'multi-select',
      options: options(['heart-condition', 'A heart condition already known'], ['family-history', 'Heart problems in the family'], ['none', 'None of these'], ['unsure', 'Not sure']),
      exclusiveOptionIds: ['none', 'unsure'],
      sourceIds: [COVERAGE_SOURCE_IDS.nhsPalpitations],
      rationale: 'An existing heart condition and a family history of heart problems are the two history features NHS Heart palpitations names.',
      progressionStage: 'discriminate',
      informationGainRank: 40,
    });
    // Phase 2 (PENDING CLINICAL REVIEW): context for the clinician, not a referral criterion.
    push({
      id: INTAKE_QUESTION_IDS.palpitationTriggers,
      category: 'context',
      eyebrow: 'What brings it on',
      prompt: say('Does anything seem to bring it on? Choose all that apply.', 'Does anything seem to bring it on for your child? Choose all that apply.'),
      control: 'multi-select',
      options: options(['exercise', 'Strenuous exercise'], ['sleep', 'Lack of sleep'], ['stress', 'Stress or anxiety'], ['medicine', 'A medicine'], ['substances', 'Alcohol, caffeine, nicotine or recreational drugs'], ['none', 'Nothing obvious']),
      exclusiveOptionIds: ['none'],
      sourceIds: [COVERAGE_SOURCE_IDS.nhsPalpitations],
      rationale: 'The lifestyle triggers NHS Heart palpitations lists, in its own words. Recorded for the clinician; the emergency features stay with the R3 palpitations check.',
      progressionStage: 'characterize',
      informationGainRank: 30,
    });
  /* ======================================================================
     BURNING OR SWALLOWING, FELT IN THE CHEST
     NHS Heartburn and acid reflux, NHS Indigestion and NHS Swallowing
     problems: how often, whether pharmacy treatment helps, and the
     accompanying features are what those pages send to a GP.
     ====================================================================== */
  } else if (context.bodyRegionId === 'chest' && concern === 'voice-swallow') {
    asksDuration = pediatric;
    asksOnset = false;
    push({
      id: INTAKE_QUESTION_IDS.upperGiSymptom,
      category: 'character',
      eyebrow: 'The main problem',
      prompt: say('What is the main problem?', 'What is the main problem for your child?'),
      control: 'choice-grid',
      options: options(['burning', 'Burning in the chest after eating or lying down'], ['coming-up', 'Food or sour fluid coming back up'], ['sticking', 'Food sticking when swallowing'], ['painful-swallow', 'Pain when swallowing'], ['unsure', 'Not sure']),
      acuityOptionIds: ['sticking'],
      sourceIds: [COVERAGE_SOURCE_IDS.nhsHeartburn, COVERAGE_SOURCE_IDS.nhsDysphagia],
      rationale: 'Separates reflux-type burning from a swallowing problem, which NHS Swallowing problems treats as needing an urgent GP appointment.',
      progressionStage: 'characterize',
      informationGainRank: 10,
    });
    if (!pediatric) {
      upperGiFrequencyQuestion();
      upperGiQuestions('core');
    }
  /* ======================================================================
     ADULT FACIAL PAIN (forehead, cheeks, temples)
     NICE NG127 refers one-sided facial pain set off by touching the face and
     not helped by treatment; NHS Sinusitis describes facial pressure with a
     blocked or runny nose; NHS TMD describes pain worse with chewing. The
     pattern decides which of those follow-ups is asked.
     ====================================================================== */
  } else if (context.complaintId === 'face-general-concern' && concern === 'pain' && !pediatric && facePart !== 'upper-neck') {
    asksOnset = false;
    // The nasal pattern has its own sinus duration bands, so the generic one is asked only of the others.
    asksDuration = false;
    push({
      id: INTAKE_QUESTION_IDS.duration,
      category: 'duration',
      eyebrow: 'Timeline',
      prompt: 'How long has this been happening?',
      control: 'segmented',
      options: DURATION_OPTIONS,
      showWhen: { questionId: INTAKE_QUESTION_IDS.facePainPattern, optionIds: ['shock-triggered', 'chewing', 'tooth', 'constant-ache', 'unsure'] },
      sourceIds,
      rationale: 'Establishes the timeline for facial pain that is not the sinus pattern.',
      progressionStage: 'characterize',
      informationGainRank: 25,
    });
    push({
      id: INTAKE_QUESTION_IDS.facePainPattern,
      category: 'character',
      eyebrow: 'The facial pain',
      prompt: 'Which is closest to the pain?',
      control: 'choice-grid',
      options: options(['shock-triggered', 'Sudden stabbing or electric-shock pain, set off by touch, eating, talking or brushing teeth'], ['pressure-nasal', 'Pressure or ache with a blocked or runny nose'], ['chewing', 'Worse when chewing or opening the mouth'], ['tooth', 'It seems to come from a tooth or the gum'], ['constant-ache', 'A constant ache'], ['unsure', 'Hard to describe']),
      sourceIds: [COVERAGE_SOURCE_IDS.niceNeurologicalReferral, COVERAGE_SOURCE_IDS.nhsTrigeminalNeuralgia, COVERAGE_SOURCE_IDS.nhsSinusitis, COVERAGE_SOURCE_IDS.nhsTmd],
      rationale: 'The trigger pattern, the nasal pattern and the chewing pattern are what separate the three sourced pathways for facial pain.',
      progressionStage: 'characterize',
      informationGainRank: 10,
    });
    push({
      id: INTAKE_QUESTION_IDS.facePainSide,
      category: 'context',
      eyebrow: 'Which side',
      prompt: 'Is it on one side of your face, or both?',
      control: 'choice-grid',
      options: options(['one-side', 'One side'], ['both', 'Both sides'], ['unsure', 'Not sure']),
      sourceIds: [COVERAGE_SOURCE_IDS.niceNeurologicalReferral, COVERAGE_SOURCE_IDS.nhsSinusitis],
      rationale: 'NG127 turns on one-sided pain, and NHS Sinusitis on symptoms on one side of the face.',
      progressionStage: 'characterize',
      informationGainRank: 15,
    });
    if (facePart === 'forehead' || (facePart?.includes('temple') ?? false)) templeQuestion();
    // Phase 3 (PENDING CLINICAL REVIEW): NHS Toothache names a swollen cheek; a facial pain from a tooth is asked the dental features.
    toothFeatures({ questionId: INTAKE_QUESTION_IDS.facePainPattern, optionIds: ['tooth'] });
    push({
      id: INTAKE_QUESTION_IDS.facePainTreatment,
      category: 'change',
      eyebrow: 'Treatment so far',
      prompt: 'Have painkillers or treatment from a doctor or pharmacist helped?',
      control: 'choice-grid',
      options: options(['helped', 'Yes, they help'], ['not-helped', 'No, they have not helped'], ['not-tried', 'Not tried yet'], ['unsure', 'Not sure']),
      showWhen: { questionId: INTAKE_QUESTION_IDS.facePainPattern, optionIds: ['shock-triggered', 'constant-ache'] },
      sourceIds: [COVERAGE_SOURCE_IDS.niceNeurologicalReferral, COVERAGE_SOURCE_IDS.nhsTrigeminalNeuralgia],
      rationale: 'NG127 refers the trigger-pattern pain only when it is refractory to treatment, and NHS Trigeminal neuralgia names pain not helped by ordinary painkillers.',
      progressionStage: 'discriminate',
      informationGainRank: 40,
    });
    push({
      id: INTAKE_QUESTION_IDS.nosePersistence,
      category: 'duration',
      eyebrow: 'How long it has lasted',
      prompt: 'How long have the nose and face symptoms been going on?',
      control: 'segmented',
      options: options(['under-one-week', 'Less than a week'], ['one-to-three-weeks', '1 to 3 weeks'], ['three-weeks-to-three-months', '3 weeks to 3 months'], ['over-three-months', 'Longer than 3 months'], ['unsure', 'Not sure']),
      showWhen: { questionId: INTAKE_QUESTION_IDS.facePainPattern, optionIds: ['pressure-nasal'] },
      sourceIds: [COVERAGE_SOURCE_IDS.nhsSinusitis],
      rationale: 'Facial pressure with a blocked or runny nose is the sinus pattern; NHS Sinusitis turns on three weeks and three months.',
      progressionStage: 'characterize',
      informationGainRank: 25,
    });
    push({
      id: INTAKE_QUESTION_IDS.noseAssociated,
      category: 'context',
      eyebrow: 'Other changes',
      prompt: 'Is anything else happening with it? Choose all that apply.',
      control: 'multi-select',
      options: options(['facial-pressure', 'Cheek, eye or forehead pressure'], ['fever', 'High temperature or generally unwell'], ['tooth-ear', 'Toothache or ear pressure'], ['one-sided', 'Mostly on one side'], ['recurrent', 'Keeps coming back'], ['none', 'None of these']),
      exclusiveOptionIds: ['none'],
      showWhen: { questionId: INTAKE_QUESTION_IDS.facePainPattern, optionIds: ['pressure-nasal'] },
      sourceIds: [COVERAGE_SOURCE_IDS.nhsSinusitis],
      rationale: 'NHS Sinusitis names one-sided symptoms and repeated episodes as ENT referral criteria.',
      progressionStage: 'discriminate',
      informationGainRank: 45,
      stage: 'extension',
    });
  /* ======================================================================
     DIZZINESS OR BALANCE, FELT IN THE HEAD
     NHS Vertigo separates spinning from unsteadiness and names hearing change,
     ringing and ear fullness (the Meniere's pattern) and a vertigo that keeps
     coming back. The neurological features that make it an emergency are the
     R3 neurological check.
     ====================================================================== */
  } else if (context.bodyRegionId === 'head' && concern === 'hearing-balance-change') {
    push({
      id: INTAKE_QUESTION_IDS.dizzinessDetail,
      category: 'character',
      eyebrow: 'The dizziness',
      prompt: say('What does it feel like?', 'What does your child say it feels like?'),
      control: 'choice-grid',
      options: options(['spinning', 'The room or I am spinning'], ['unsteady', 'Unsteady or off balance'], ['lightheaded', 'Lightheaded, as if about to faint'], ['unsure', 'Hard to describe']),
      acuityOptionIds: ['spinning'],
      sourceIds: [COVERAGE_SOURCE_IDS.nhsVertigo],
      rationale: 'NHS Vertigo describes vertigo as a spinning feeling and separates it from general unsteadiness or feeling faint.',
      progressionStage: 'characterize',
      informationGainRank: 10,
    });
    push({
      id: INTAKE_QUESTION_IDS.dizzinessAssociated,
      category: 'context',
      eyebrow: 'Anything else',
      prompt: say('Have you noticed any of these with it? Choose all that apply.', 'Has your child noticed any of these with it? Choose all that apply.'),
      control: 'multi-select',
      options: options(['hearing', 'Hearing loss, or ringing in the ears'], ['ear-fullness', 'Pressure or fullness in an ear'], ['recurrent', 'It keeps coming back'], ['head-movement', 'Brought on by moving the head'], ['none', 'None of these']),
      exclusiveOptionIds: ['none'],
      sourceIds: [COVERAGE_SOURCE_IDS.nhsVertigo, COVERAGE_SOURCE_IDS.nhsTinnitus, COVERAGE_SOURCE_IDS.nhsHearingLoss],
      rationale: 'NHS Vertigo names vertigo that keeps coming back as the reason to see a GP, and hearing change, ringing and ear pressure as the inner-ear pattern. They can coexist.',
      progressionStage: 'discriminate',
      informationGainRank: 40,
    });
  /* ======================================================================
     UPPER ABDOMEN (children, and adults with a non-pain upper tummy concern)
     ====================================================================== */
  /* ======================================================================
     UPPER TUMMY INJURY
     A blow or fall to the upper tummy is assessed in the words of NHS
     Broken or bruised ribs: how it happened, when, whether it hurts to
     breathe in or move, and what has been noticed since. A serious
     accident, worsening breathing or chest pain, coughing blood and shoulder
     pain are R3 emergency features, so the R3 injury check owns them and
     they are not asked twice here.
     ====================================================================== */
  } else if ((isUpperAbdomen || context.bodyRegionId === 'chest') && concern === 'injury') {
    asksDuration = false;
    asksOnset = false;
    push({
      id: INTAKE_QUESTION_IDS.injuryDetail,
      category: 'context',
      eyebrow: 'Injury',
      prompt: say('What happened?', 'What happened to your child?'),
      control: 'choice-grid',
      options: options(['fall', 'A fall'], ['impact', 'A blow or knock, such as in sport'], ['strain', 'Lifting, twisting or straining'], ['other', 'Something else']),
      sourceIds: [COVERAGE_SOURCE_IDS.nhsBrokenRibs],
      rationale: 'NHS Broken or bruised ribs names a fall or a blow as the usual causes. A serious accident is an emergency feature the R3 injury check asks, so it is not offered here.',
      progressionStage: 'characterize',
      informationGainRank: 10,
    });
    push({
      id: INTAKE_QUESTION_IDS.abdomenInjuryTiming,
      category: 'duration',
      eyebrow: 'When it happened',
      prompt: say('When did it happen?', 'When did it happen to your child?'),
      control: 'segmented',
      options: options(['today', 'Today'], ['few-days', 'In the last few days'], ['one-to-three-weeks', '1 to 3 weeks ago'], ['over-three-weeks', 'More than 3 weeks ago'], ['unsure', 'Not sure']),
      sourceIds: [COVERAGE_SOURCE_IDS.nhsBrokenRibs],
      rationale: 'NHS Broken or bruised ribs expects the pain to settle within 2 to 6 weeks and sends pain that has not improved within a few weeks to a GP. This replaces the generic duration question.',
      progressionStage: 'characterize',
      informationGainRank: 15,
    });
    push({
      id: INTAKE_QUESTION_IDS.abdomenInjuryMovement,
      category: 'pattern',
      eyebrow: 'What makes it worse',
      prompt: say('Does it hurt more when you breathe in, cough or move?', 'Does it hurt your child more when they breathe in, cough or move?'),
      control: 'choice-grid',
      options: options(['breathing', 'Breathing in or coughing'], ['moving', 'Moving or bending'], ['both', 'Both'], ['neither', 'Neither'], ['unsure', 'Not sure']),
      sourceIds: [COVERAGE_SOURCE_IDS.nhsBrokenRibs],
      rationale: 'NHS Broken or bruised ribs describes pain that is strongest when breathing in or coughing.',
      progressionStage: 'characterize',
      informationGainRank: 18,
    });
    push({
      id: INTAKE_QUESTION_IDS.abdomenInjuryFeatures,
      category: 'context',
      eyebrow: 'Since the injury',
      prompt: say('Since the injury, have you noticed any of these? Choose all that apply.', 'Since the injury, have you noticed any of these in your child? Choose all that apply.'),
      control: 'multi-select',
      options: options(['bruising', 'Bruising'], ['swelling', 'Swelling or tenderness'], ['sick', 'Being sick'], ['dizzy', 'Feeling dizzy or faint'], ['none', 'None of these']),
      exclusiveOptionIds: ['none'],
      // Being sick or feeling faint after an injury makes the R3 injury check relevant now.
      acuityOptionIds: ['sick', 'dizzy'],
      sourceIds: [COVERAGE_SOURCE_IDS.nhsBrokenRibs, COVERAGE_SOURCE_IDS.nhsStomachAche],
      rationale: 'NHS Broken or bruised ribs lists swelling, tenderness and bruising; NHS Stomach ache treats collapse as an emergency. They can coexist.',
      progressionStage: 'discriminate',
      informationGainRank: 36,
    });
  /* ======================================================================
     UPPER TUMMY, SOMETHING ELSE
     One structured clarifier maps the concern to a real family, and that
     family's own branch is asked, each question gated on the clarifier. The
     questions are the ones the family branch would ask, built by the same
     code, so "something else" never becomes a generic tail. "Not sure"
     keeps only the impact and timeline questions and ends at the parent
     service with a named reason.
     ====================================================================== */
  } else if (concern === 'other' && otherClarifierFamilies(context).length > 0) {
    /*
      Phase 2 (PENDING CLINICAL REVIEW): every region whose "Something else"
      used to end in a generic impact, timeline and onset tail now asks the
      same clarifier the upper tummy introduced, offering only the concern
      families that region has, and then asks that family's own branch.
    */
    const available = otherClarifierFamilies(context);
    asksImpact = false;
    asksDuration = false;
    asksOnset = false;
    push({
      id: INTAKE_QUESTION_IDS.otherClarifier,
      category: 'context',
      eyebrow: 'Closest match',
      prompt: say('Which of these is closest to what is happening?', 'Which of these is closest to what is happening to your child?'),
      control: 'choice-grid',
      options: OTHER_CLARIFIER_OPTIONS.filter((option) => option.id === 'unsure' || available.some(([optionId]) => optionId === option.id)),
      sourceIds,
      rationale: 'Maps a concern described as something else to the branch that fits it, so the questions that follow are specific instead of generic.',
      progressionStage: 'entry',
      informationGainRank: 5,
    });
    const generic = new Set<string>([INTAKE_QUESTION_IDS.complaintEntry, INTAKE_QUESTION_IDS.currentImpact, INTAKE_QUESTION_IDS.duration, INTAKE_QUESTION_IDS.onset, INTAKE_QUESTION_IDS.pediatricWellbeing]);
    const tail = new Map<string, string[]>([[INTAKE_QUESTION_IDS.currentImpact, ['unsure']], [INTAKE_QUESTION_IDS.duration, ['unsure']], [INTAKE_QUESTION_IDS.onset, []]]);
    // Bowel before pain: both branches ask how a bowel change has behaved, and the bowel branch asks it unconditionally.
    for (const [optionId, family] of available) {
      const premise: ShowCondition = { questionId: INTAKE_QUESTION_IDS.otherClarifier, optionIds: [optionId] };
      const branch = intakeQuestionsFor(context.complaintId, { ...context, concernId: family });
      for (const question of branch) {
        if (tail.has(question.id)) tail.get(question.id)!.push(optionId);
        if (generic.has(question.id)) continue;
        const own = question.showWhen ? (Array.isArray(question.showWhen) ? question.showWhen : [question.showWhen as ShowCondition]) : [];
        /*
          The same concept in two families (the function, duration and joint
          questions belong to both injury and pain at a limb) is asked once,
          opened by either clarifier answer. Only when its own conditions are
          identical: a question gated differently in another family keeps the
          first family's gating, as the upper tummy bowel follow-up does.
        */
        const existingIndex = questions.findIndex((existing) => existing.id === question.id);
        if (existingIndex >= 0) {
          const prior = questions[existingIndex];
          const priorConditions = Array.isArray(prior.showWhen) ? prior.showWhen : prior.showWhen ? [prior.showWhen as ShowCondition] : [];
          const [premiseCondition, ...priorOwn] = priorConditions;
          if (
            premiseCondition?.questionId === INTAKE_QUESTION_IDS.otherClarifier
            && !premiseCondition.optionIds.includes(optionId)
            && JSON.stringify(priorOwn) === JSON.stringify(own)
          ) {
            questions[existingIndex] = { ...prior, showWhen: [{ ...premiseCondition, optionIds: [...premiseCondition.optionIds, optionId] }, ...priorOwn] };
          }
          continue;
        }
        questions.push({ ...question, showWhen: [premise, ...own] });
      }
    }
    // The generic impact, timeline and onset questions, asked exactly where the mapped branch asks them.
    for (const [questionId, optionIds] of tail) {
      if (optionIds.length === 0) continue;
      if (questionId === INTAKE_QUESTION_IDS.currentImpact) impact();
      else if (questionId === INTAKE_QUESTION_IDS.duration) duration();
      else onsetQuestion();
      const added = questions.at(-1)!;
      questions[questions.length - 1] = { ...added, showWhen: { questionId: INTAKE_QUESTION_IDS.otherClarifier, optionIds } };
    }
  } else if (isUpperAbdomen && concern === 'pain') {
    push({
      id: INTAKE_QUESTION_IDS.abdominalDetail,
      category: 'character',
      eyebrow: 'The tummy pain',
      prompt: say('Where is the pain, and what is it like?', 'Where is your child\'s tummy pain, and what is it like?'),
      control: 'choice-grid',
      options: options(['top-burning', 'At the top of the tummy, burning'], ['around-navel', 'Around the belly button'], ['cramping', 'Cramping, comes in waves'], ['whole-tummy', 'Across the whole tummy'], ['unsure', 'Hard to describe']),
      sourceIds: [COVERAGE_SOURCE_IDS.nhsDiarrhoeaVomiting],
      rationale: 'Characterizes upper tummy pain in words a child or caregiver can report.',
      progressionStage: 'characterize',
      informationGainRank: 10,
    });
    push({
      id: INTAKE_QUESTION_IDS.abdominalFoodRelation,
      category: 'pattern',
      eyebrow: 'Food',
      prompt: 'Is it linked to eating?',
      control: 'choice-grid',
      options: options(['after-eating', 'Worse after eating'], ['hungry', 'Worse when hungry'], ['no-link', 'No link with food'], ['unsure', 'Not sure']),
      sourceIds: [COVERAGE_SOURCE_IDS.nhsDiarrhoeaVomiting],
      rationale: 'Meal relation is a core digestive discriminator.',
      progressionStage: 'discriminate',
      informationGainRank: 32,
    });
    push({
      id: INTAKE_QUESTION_IDS.abdominalAssociated,
      category: 'context',
      eyebrow: 'Other changes',
      prompt: 'Is anything else happening? Choose all that apply.',
      control: 'multi-select',
      options: options(['vomiting', 'Being sick'], ['diarrhoea', 'Diarrhoea'], ['constipation', 'Constipation'], ['fever', 'High temperature'], ['urine-pain', 'Pain when peeing'], ['none', 'None of these']),
      exclusiveOptionIds: ['none'],
      acuityOptionIds: ['vomiting'],
      sourceIds: [COVERAGE_SOURCE_IDS.nhsDiarrhoeaVomiting, COVERAGE_SOURCE_IDS.nhmImnci],
      rationale: 'Opens the bowel and urinary follow-ups when they are present rather than asking them of every tummy concern.',
      progressionStage: 'system',
      informationGainRank: 36,
    });
    push({
      id: INTAKE_QUESTION_IDS.bowelPersistence,
      category: 'duration',
      eyebrow: 'How it has behaved',
      prompt: 'How has the bowel change behaved so far?',
      control: 'choice-grid',
      options: BOWEL_PERSISTENCE_OPTIONS,
      showWhen: { questionId: INTAKE_QUESTION_IDS.abdominalAssociated, optionIds: ['diarrhoea', 'constipation'] },
      sourceIds: [COVERAGE_SOURCE_IDS.nhsConstipation, COVERAGE_SOURCE_IDS.niceChildConstipation, COVERAGE_SOURCE_IDS.nhmImnci],
      rationale: 'Asked only when a bowel change was named: it separates a recent episode from a persisting or recurring one.',
      progressionStage: 'discriminate',
      informationGainRank: 50,
    });
  /* ======================================================================
     BOWEL CHANGE
     ====================================================================== */
  } else if (isAbdominal && concern === 'bowel-change') {
    asksDuration = false;
    asksOnset = false;
    push({
      id: INTAKE_QUESTION_IDS.bowelDetail,
      category: 'context',
      eyebrow: 'Bowel change',
      prompt: 'What has changed most?',
      control: 'choice-grid',
      options: options(['constipation', 'Constipation'], ['diarrhoea', 'Diarrhoea'], ['blood', 'Blood in poo'], ['bloating', 'Bloating or fullness'], ['vomiting', 'Being sick'], ['appetite', 'Appetite or feeling full quickly'], ['other', 'Another change']),
      sourceIds: [COVERAGE_SOURCE_IDS.nhsPelvicPain, COVERAGE_SOURCE_IDS.nhsConstipation, COVERAGE_SOURCE_IDS.nhsDiarrhoeaVomiting],
      rationale: 'Clarifies the selected bowel branch without naming a condition.',
      acuityOptionIds: ['blood', 'vomiting'],
      progressionStage: 'characterize',
      informationGainRank: 10,
    });
    push({
      id: INTAKE_QUESTION_IDS.bowelPersistence,
      category: 'duration',
      eyebrow: 'How it has behaved',
      prompt: 'How has the bowel change behaved so far?',
      control: 'choice-grid',
      options: BOWEL_PERSISTENCE_OPTIONS,
      sourceIds: [COVERAGE_SOURCE_IDS.nhsConstipation, COVERAGE_SOURCE_IDS.nhsPelvicPain, ...(pediatric ? [COVERAGE_SOURCE_IDS.niceChildConstipation, COVERAGE_SOURCE_IDS.nhmImnci] : [])],
      rationale: 'NHS Constipation separates a bowel change that is not getting better, or that happens regularly, from an ordinary recent episode, and IMNCI treats diarrhoea for 14 days or more as persistent. This replaces the generic duration question.',
      progressionStage: 'characterize',
      informationGainRank: 25,
    });
    if (pediatric) {
      push({
        id: INTAKE_QUESTION_IDS.pediatricBowelRedFlag,
        category: 'context',
        eyebrow: 'Other signs',
        prompt: say('Have you noticed any of these? Choose all that apply.', 'Have you noticed any of these in your child? Choose all that apply.'),
        control: 'multi-select',
        options: options(
          ['since-birth', 'The problem started in the first weeks of life'],
          ['legs', 'New weakness in the legs or trouble walking'],
          ['swollen-vomiting', 'A swollen tummy with being sick'],
          ['growth', 'Not growing or gaining weight as expected'],
          ['none', 'None of these'],
        ),
        exclusiveOptionIds: ['none'],
        // A swollen tummy with vomiting, or new leg weakness, makes the
        // abdominal and neurological safety checks relevant now, not at the end.
        acuityOptionIds: ['swollen-vomiting', 'legs'],
        sourceIds: [COVERAGE_SOURCE_IDS.niceChildConstipation],
        rationale: 'These are the caregiver-reportable red flags in NICE CG99 that send a child\'s bowel problem to a practitioner with paediatric expertise instead of routine treatment.',
        progressionStage: 'discriminate',
        informationGainRank: 45,
      });
    } else {
      push({
        id: INTAKE_QUESTION_IDS.bowelAlarmFeature,
        category: 'change',
        eyebrow: 'Other changes',
        prompt: 'Has anything else changed alongside it?',
        control: 'choice-grid',
        options: BOWEL_ALARM_OPTIONS,
        sourceIds: [COVERAGE_SOURCE_IDS.nhsConstipation],
        rationale: 'NHS Constipation names a sudden change in bowel habit and unintended weight loss among the features that take a bowel concern to a GP.',
        progressionStage: 'discriminate',
        informationGainRank: 65,
      });
    }
    bowelFollowUps([]);
  /* ======================================================================
     URINARY CHANGE
     ====================================================================== */
  } else if (isAbdominal && concern === 'urinary-change') {
    asksOnset = false;
    push({
      id: INTAKE_QUESTION_IDS.urinaryDetail,
      category: 'context',
      eyebrow: 'Urinary change',
      prompt: say('What has changed most when you pass urine?', 'What has changed most when your child passes urine?'),
      control: 'choice-grid',
      options: pediatric
        ? options(['pain', 'Pain, burning or crying when peeing'], ['frequency', 'Going more often or urgently'], ['wetting', 'Wetting again after being dry'], ['difficulty', 'Difficulty passing urine'], ['blood', 'Blood in urine'], ['other', 'Another change'])
        : options(['pain', 'Pain or burning'], ['frequency', 'More often or urgently'], ['difficulty', 'Difficulty passing urine'], ['blood', 'Blood in urine'], ['other', 'Another change']),
      sourceIds: [COVERAGE_SOURCE_IDS.nhsPelvicPain, COVERAGE_SOURCE_IDS.nhsUrinaryTractInfection],
      rationale: 'Clarifies the selected urinary branch before considering other systems; child wording uses the signs NHS lists for children.',
      progressionStage: 'characterize',
      informationGainRank: 10,
    });
    push({
      id: INTAKE_QUESTION_IDS.urinaryPattern,
      category: 'pattern',
      eyebrow: 'Pattern',
      prompt: 'Which of these describes it best?',
      control: 'choice-grid',
      options: URINARY_PATTERN_OPTIONS,
      sourceIds: [COVERAGE_SOURCE_IDS.nhsUrinaryTractInfection, COVERAGE_SOURCE_IDS.nhsPelvicPain, ...(pediatric ? [COVERAGE_SOURCE_IDS.niceChildUti] : [])],
      rationale: 'NHS UTI separates a single lower urinary episode from repeated infection, from obstructive emptying and from pain under the ribs with a high temperature; NICE NG224 sends a child with repeated infections to a paediatric specialist.',
      safetyPurpose: 'A flank and feverish answer brings the urinary safety check forward; it is not itself an emergency rule.',
      acuityOptionIds: ['flank-fever'],
      progressionStage: 'discriminate',
      informationGainRank: 45,
    });
    if (!pediatric) push({
      id: INTAKE_QUESTION_IDS.urinaryFeatures,
      category: 'context',
      eyebrow: 'When you pee',
      prompt: 'Do any of these happen? Choose all that apply.',
      control: 'multi-select',
      options: options(['burning', 'Pain or burning when peeing'], ['cloudy', 'Pee that looks cloudy'], ['night', 'Getting up to pee during the night'], ['weak-flow', 'A weak flow, or stopping and starting'], ['strain', 'Having to push or strain to start'], ['not-empty', 'Feeling the bladder has not fully emptied'], ['dribbling', 'Dribbling after finishing'], ['none', 'None of these']),
      exclusiveOptionIds: ['none'],
      sourceIds: [COVERAGE_SOURCE_IDS.nhsUrinaryTractInfection, COVERAGE_SOURCE_IDS.nhsProstateEnlargement],
      rationale: 'The symptoms NHS UTI and NHS Enlarged prostate list, in their own words (PENDING CLINICAL REVIEW). They separate an infection pattern from an emptying pattern for the clinician; not a referral criterion.',
      progressionStage: 'characterize',
      informationGainRank: 50,
    });
  /* ======================================================================
     ADULT REPRODUCTIVE OR PELVIC CHANGE
     ====================================================================== */
  } else if (
    isLower
    && context.patientMode === 'adult'
    && concern === 'reproductive-pelvic-change'
    /*
      Positively gated, not gated by exclusion: a future SexForAssessment value
      fails closed and gets no reproductive question until someone decides
      what it should be asked.
    */
    && (context.sexForAssessment === 'female' || context.sexForAssessment === 'intersex_or_variation')
  ) {
    const neutralPhysiology = context.sexForAssessment === 'intersex_or_variation';
    push({
      id: INTAKE_QUESTION_IDS.reproductiveDetail,
      category: 'context',
      eyebrow: neutralPhysiology ? 'Pelvic or genital change' : 'Pelvic or reproductive change',
      prompt: neutralPhysiology
        ? 'Which pelvic or genital change is most important right now?'
        : 'Which pelvic or reproductive change is most important right now?',
      control: 'choice-grid',
      options: neutralPhysiology
        ? options(['bleeding', 'Bleeding'], ['discharge', 'Unusual discharge'], ['genital-change', 'Genital change'], ['pelvic-function', 'Pelvic pressure or function change'], ['sexual-pain', 'Pain with sexual activity'], ['other', 'Something else'])
        : options(['bleeding', 'Unusual bleeding'], ['discharge', 'Unusual discharge'], ['cycle', 'Cycle-related change'], ['sexual-pain', 'Pain with sexual activity'], ['pregnancy', 'Pregnancy-related concern'], ['genital-change', 'Genital change'], ['other', 'Something else']),
      sensitive: true,
      sourceIds: [COVERAGE_SOURCE_IDS.nhsPelvicPain],
      rationale: 'Characterizes an explicitly selected pelvic or reproductive concern without inferring physiology from the body artwork.',
      progressionStage: 'characterize',
      informationGainRank: 10,
      physiologyEligibility: neutralPhysiology ? 'explicit-neutral-context' : 'female-reproductive-branch',
    });
    push(reproductiveTimingDefinition(neutralPhysiology, false));
  /* ======================================================================
     SKIN
     ====================================================================== */
  } else if (concern === 'skin-change') {
    asksDuration = false;
    asksOnset = false;
    push({
      id: INTAKE_QUESTION_IDS.skinDetail,
      category: 'context',
      eyebrow: 'Skin change',
      prompt: 'Which best describes the skin change?',
      control: 'choice-grid',
      options: options(['itchy-raised', 'Itchy or raised rash'], ['patches', 'Dry, scaly or thickened patches'], ['mole', 'A mole or spot that has changed'], ['painful-hot', 'Painful, hot or quickly getting worse'], ['new-exposure', 'After a new food, medicine, sting or product'], ['mouth-face', 'With swelling of the face, mouth or throat'], ['other', 'Something else']),
      sourceIds: [COVERAGE_SOURCE_IDS.nhsAllergy, COVERAGE_SOURCE_IDS.nhsMoles, COVERAGE_SOURCE_IDS.nicePsoriasis],
      rationale: 'Separates a long-standing or changing skin concern from an acute reaction or infection before any airway check.',
      acuityOptionIds: ['mouth-face', 'painful-hot'],
      progressionStage: 'characterize',
      informationGainRank: 10,
    });
    push({
      id: INTAKE_QUESTION_IDS.skinDuration,
      category: 'duration',
      eyebrow: 'How long',
      prompt: say('How long have you had it?', 'How long has your child had it?'),
      control: 'segmented',
      options: options(['under-one-week', 'Less than a week'], ['one-to-four-weeks', '1 to 4 weeks'], ['over-four-weeks', 'More than 4 weeks'], ['keeps-returning', 'It keeps coming back'], ['unsure', 'Not sure']),
      sourceIds: [COVERAGE_SOURCE_IDS.nhsMoles, COVERAGE_SOURCE_IDS.niceChildEczema, COVERAGE_SOURCE_IDS.nicePsoriasis],
      rationale: 'Persistence and repeated flares are what the skin referral guidance turns on; this replaces the generic duration question.',
      progressionStage: 'characterize',
      informationGainRank: 25,
    });
    push({
      id: INTAKE_QUESTION_IDS.skinTreatment,
      category: 'change',
      eyebrow: 'Treatment so far',
      prompt: say('Have you tried anything for it?', 'Have you tried anything for it?'),
      control: 'choice-grid',
      options: options(['not-tried', 'Nothing tried yet'], ['settled', 'Tried something and it settled'], ['not-settled', 'Tried something and it has not settled'], ['unsure', 'Not sure']),
      showWhen: { questionId: INTAKE_QUESTION_IDS.skinDuration, optionIds: ['one-to-four-weeks', 'over-four-weeks', 'keeps-returning', 'unsure'] },
      sourceIds: [COVERAGE_SOURCE_IDS.nicePsoriasis, COVERAGE_SOURCE_IDS.niceChildEczema],
      rationale: 'NICE refers a skin condition that treatment has not controlled for specialist dermatological advice. Not asked of a change under a week old.',
      progressionStage: 'discriminate',
      informationGainRank: 40,
    });
    push({
      id: INTAKE_QUESTION_IDS.skinFeatures,
      category: 'context',
      eyebrow: 'Other details',
      prompt: 'Do any of these apply? Choose all that apply.',
      control: 'multi-select',
      options: options(
        ['changed', 'A mole or spot is changing in size, shape or colour'],
        ['bleeding', 'It bleeds, oozes or crusts'],
        ['widespread', 'It covers a large area of the body'],
        ['sleep-life', say('It affects your sleep, work or daily life', 'It affects your child\'s sleep, school or daily life')],
        ['face-hands', 'It is on the face or hands and not settling'],
        ['none', 'None of these'],
      ),
      exclusiveOptionIds: ['none'],
      sourceIds: [COVERAGE_SOURCE_IDS.nhsMoles, COVERAGE_SOURCE_IDS.niceSuspectedCancer, COVERAGE_SOURCE_IDS.nicePsoriasis, COVERAGE_SOURCE_IDS.niceChildEczema],
      rationale: 'The referral features named by NHS Moles, NICE NG12, CG153 and CG57. They can coexist.',
      progressionStage: 'discriminate',
      informationGainRank: 45,
    });
    if (isLowerLimb && !/hip/.test(context.bodyRegionId) && !pediatric) legVeinQuestion();
  /* ======================================================================
     SWELLING OR LUMP
     ====================================================================== */
  } else if (concern === 'swelling-lump') {
    asksDuration = false;
    push({
      id: INTAKE_QUESTION_IDS.swellingDetail,
      category: 'context',
      eyebrow: 'Swelling or lump',
      prompt: 'Which of these describe it? Choose all that apply.',
      control: 'multi-select',
      options: options(['new', 'New or sudden'], ['growing', 'Getting larger'], ['hard-fixed', 'Hard, or fixed in place'], ['tender', 'Tender or painful'], ['hot-red', 'Hot or red'], ['soft-movable', 'Soft and moves under the skin'], ['unsure', 'Not sure']),
      exclusiveOptionIds: ['unsure'],
      sourceIds: [...sourceIds, COVERAGE_SOURCE_IDS.nhsLumps],
      rationale: 'Characterizes progression and local features without inferring a cause. NHS Lumps names a lump that gets bigger, or is hard and does not move, as a reason to see a GP; these can coexist.',
      progressionStage: 'characterize',
      informationGainRank: 10,
    });
    push({
      id: INTAKE_QUESTION_IDS.swellingDuration,
      category: 'duration',
      eyebrow: 'How long',
      prompt: say('How long has it been there?', 'How long has your child had it?'),
      control: 'segmented',
      options: options(['under-two-weeks', 'Less than 2 weeks'], ['two-to-six-weeks', '2 to 6 weeks'], ['over-six-weeks', 'More than 6 weeks'], ['comes-and-goes', 'It comes and goes'], ['unsure', 'Not sure']),
      sourceIds: [COVERAGE_SOURCE_IDS.nhsLumps],
      rationale: 'NHS Lumps turns on a lump lasting more than 2 weeks; this replaces the generic duration question.',
      progressionStage: 'characterize',
      informationGainRank: 25,
    });
    if (isAbdominal) herniaQuestion();
    if (isOral) {
      // Phase 3 (PENDING CLINICAL REVIEW): NHS Dental abscess names a swollen face or jaw for the dentist.
      push({
        id: INTAKE_QUESTION_IDS.oralSwellingSite,
        category: 'context',
        eyebrow: 'Where it is',
        prompt: say('Where is the swelling or lump?', 'Where is your child\'s swelling or lump?'),
        control: 'choice-grid',
        options: options(['tooth-gum', 'Near a tooth or in the gum'], ['jaw-neck', 'Under the jaw or in the neck'], ['inside-cheek-lip', 'Inside the cheek or on the lip'], ['unsure', 'Not sure']),
        sourceIds: [COVERAGE_SOURCE_IDS.nhsDentalAbscess, COVERAGE_SOURCE_IDS.nhsToothache, COVERAGE_SOURCE_IDS.nhsLumps],
        rationale: 'A swelling near a tooth is the dental pattern NHS Dental abscess and Toothache send to a dentist; one under the jaw or inside the cheek or lip is asked as a lump.',
        progressionStage: 'characterize',
        informationGainRank: 12,
      });
      toothFeatures({ questionId: INTAKE_QUESTION_IDS.oralSwellingSite, optionIds: ['tooth-gum'] });
    }
    if (context.bodyRegionId === 'chest' && !pediatric) breastQuestion();
    if (isLowerLimb && !/hip/.test(context.bodyRegionId) && !pediatric) legVeinQuestion();
  /* ======================================================================
     WEAKNESS, DROOPING, NUMBNESS OR TINGLING
     ====================================================================== */
  } else if (concern === 'numbness-tingling' || concern === 'weakness-drooping') {
    // Numbness is asked what it feels like; weakness is asked what has become harder (below).
    if (concern === 'numbness-tingling') push({
      id: INTAKE_QUESTION_IDS.symptomCharacter,
      category: 'character',
      eyebrow: 'The feeling',
      prompt: say('What does it feel like?', 'What does your child say it feels like?'),
      control: 'choice-grid',
      options: options(['pins-needles', 'Pins and needles or tingling'], ['reduced', 'Numb, or reduced feeling'], ['burning', 'Burning'], ['shocks', 'Electric-shock feelings'], ['unsure', 'Hard to describe']),
      sourceIds: [COVERAGE_SOURCE_IDS.nhsPinsAndNeedles, COVERAGE_SOURCE_IDS.niceNeurologicalReferral],
      rationale: 'NHS Pins and needles and NICE NG127 describe altered sensation in these terms; the kind of sensation is the first fact for a numbness concern.',
      progressionStage: 'characterize',
      informationGainRank: 5,
    });
    if (concern === 'numbness-tingling' && (isMusculoskeletal || context.bodyRegionId === 'neck')) neuroDistributionQuestion();
    push({
      id: INTAKE_QUESTION_IDS.neurologicDetail,
      category: 'context',
      eyebrow: 'Sensation or movement',
      prompt: 'Which change is closest?',
      control: 'choice-grid',
      options: options(['one-sided', 'Only on one side'], ['both-sides', 'On both sides'], ['spreading', 'Spreading to another area'], ['function', 'Affecting movement or grip'], ['unsure', 'Not sure']),
      sourceIds: [COVERAGE_SOURCE_IDS.nhsStroke, ...sourceIds],
      rationale: 'Where the change is and whether it affects function. Timing is asked separately as the canonical pattern concept, so it is not recorded twice.',
      acuityOptionIds: ['one-sided', 'spreading'],
      progressionStage: 'characterize',
      informationGainRank: 10,
    });
    /*
      How it has changed replaces the generic impact, duration, onset and
      pattern questions here: NICE NG127 separates exactly these courses. Sudden
      or quickly worsening brings the neurological safety checks forward.
    */
    asksImpact = false;
    asksDuration = false;
    asksOnset = false;
    push({
      id: INTAKE_QUESTION_IDS.neurologicCourse,
      category: 'pattern',
      eyebrow: 'How it has changed',
      prompt: say('How has it changed since it started?', 'How has it changed for your child since it started?'),
      control: 'choice-grid',
      options: options(
        ['sudden', 'It came on suddenly'],
        ['quick', 'Getting quickly worse over hours or days'],
        ['gradual', 'Gradually getting worse over weeks or months'],
        ['same', 'About the same since it started'],
        ['better', 'Getting better'],
        ['comes-goes', 'It comes and goes'],
      ),
      acuityOptionIds: ['sudden', 'quick'],
      sourceIds: [COVERAGE_SOURCE_IDS.niceNeurologicalReferral, COVERAGE_SOURCE_IDS.nhsStroke, COVERAGE_SOURCE_IDS.nhsPinsAndNeedles],
      rationale: 'NICE NG127 refers slowly progressive weakness, refers rapidly progressive weakness or numbness immediately, and treats sudden onset as a possible stroke; NHS Pins and needles names numbness that keeps coming back.',
      progressionStage: 'characterize',
      informationGainRank: 20,
    });
    if (concern === 'numbness-tingling') {
      push({
        id: INTAKE_QUESTION_IDS.neurologicWaking,
        category: 'pattern',
        eyebrow: 'When it happens',
        prompt: say('Is it mainly there when you wake up, and gone within about 10 minutes?', 'Is it mainly there when your child wakes up, and gone within about 10 minutes?'),
        control: 'yes-no',
        options: options(['yes', 'Yes'], ['no', 'No'], ['unsure', 'Not sure']),
        showWhen: { questionId: INTAKE_QUESTION_IDS.neurologicCourse, optionIds: ['same', 'comes-goes', 'better'] },
        sourceIds: [COVERAGE_SOURCE_IDS.niceNeurologicalReferral],
        rationale: 'NICE NG127 says recurrent tingling present on waking and lasting under 10 minutes is not routinely referred; asked only of a stable or recurring numbness.',
        progressionStage: 'discriminate',
        informationGainRank: 30,
      });
    } else if (isMusculoskeletal) {
      push({
        id: INTAKE_QUESTION_IDS.movementDetail,
        category: 'character',
        eyebrow: 'What is harder',
        prompt: say('What has become harder to do?', 'What has become harder for your child to do?'),
        control: 'choice-grid',
        options: isLowerLimb
          ? options(['walk-stand', 'Walking or standing'], ['stairs', 'Climbing stairs'], ['bend-straighten', 'Bending or straightening it'], ['sport', 'Running or sport'], ['other', 'Something else'])
          : options(['lift-reach', 'Lifting or reaching up'], ['grip', 'Gripping or holding things'], ['bend-turn', 'Bending or turning it'], ['bear-load', 'Taking weight on it'], ['other', 'Something else']),
        sourceIds: [COVERAGE_SOURCE_IDS.niceNeurologicalReferral, COVERAGE_SOURCE_IDS.nhsJointPain],
        rationale: 'NICE NG127 describes limb weakness by what it affects; which activity has become harder is the first functional fact for a weakness concern.',
        progressionStage: 'characterize',
        informationGainRank: 25,
      });
    }
    const faceArea = context.bodyRegionId === 'face';
    push({
      id: INTAKE_QUESTION_IDS.neurologicFeatures,
      category: 'context',
      eyebrow: 'Anything else',
      prompt: say('Have you noticed any of these as well? Choose all that apply.', 'Have you noticed any of these in your child as well? Choose all that apply.'),
      control: 'multi-select',
      options: options(['pain', 'Pain in the same area'], ['rash', 'A rash or blisters in the same area'], ['injury', 'It started after an injury'], ['none', 'None of these']),
      exclusiveOptionIds: ['none'],
      // On the face a rash brings the sourced eye-and-nose rash check forward.
      acuityOptionIds: faceArea ? ['rash'] : undefined,
      sourceIds: [COVERAGE_SOURCE_IDS.nhsShingles, COVERAGE_SOURCE_IDS.nhsTrigeminalNeuralgia, COVERAGE_SOURCE_IDS.nhsPinsAndNeedles],
      rationale: 'Pain, a rash or blisters, or an injury in the same area are the accompanying features the shingles, trigeminal neuralgia and pins and needles guidance separate. Stroke-type signs are not repeated here: the R3 neurological check owns them and stops the assessment if they are present.',
      progressionStage: 'discriminate',
      informationGainRank: 40,
    });
  /* ======================================================================
     MUSCULOSKELETAL AND INJURY (children, and adult non-weighted concerns)
     ====================================================================== */
  } else if (isMusculoskeletal && (concern === 'pain' || concern === 'injury' || concern === 'movement-function')) {
    asksDuration = false;
    if (concern === 'injury') {
      asksOnset = false;
      injuryMechanism();
      injuryFeatures();
    } else if (concern === 'movement-function') {
      /*
        A movement problem is asked what cannot be done, not what the pain
        feels like: the patient may have no pain at all.
      */
      push({
        id: INTAKE_QUESTION_IDS.movementDetail,
        category: 'character',
        eyebrow: 'Movement',
        prompt: say('What is hardest to do?', 'What is hardest for your child to do?'),
        control: 'choice-grid',
        options: isLowerLimb
          ? options(['walk-stand', 'Walking or standing'], ['stairs', 'Climbing stairs'], ['bend-straighten', 'Bending or straightening it'], ['sport', 'Running or sport'], ['other', 'Something else'])
          : options(['lift-reach', 'Lifting or reaching up'], ['grip', 'Gripping or holding things'], ['bend-turn', 'Bending or turning it'], ['bear-load', 'Taking weight on it'], ['other', 'Something else']),
        sourceIds: [COVERAGE_SOURCE_IDS.nhsJointPain, COVERAGE_SOURCE_IDS.nhsKneePain],
        rationale: 'NHS Joint pain turns on pain or stiffness that stops normal activities; which activity is limited is the first fact for a movement concern.',
        progressionStage: 'characterize',
        informationGainRank: 10,
      });
    } else {
      push({
        id: INTAKE_QUESTION_IDS.symptomCharacter,
        category: 'character',
        eyebrow: 'Character',
        prompt: say('What does it feel like?', 'How does your child describe it, or what have you seen?'),
        control: 'choice-grid',
        options: options(['aching', 'Aching'], ['sharp', 'Sharp'], ['stiff', 'Stiff'], ['throbbing', 'Throbbing'], ['burning', 'Burning'], ['unsure', 'Not sure']),
        sourceIds: [COVERAGE_SOURCE_IDS.nhsJointPain, ...sourceIds],
        rationale: 'Characterizes joint or muscle pain in the vocabulary of the joint pain guidance.',
        progressionStage: 'characterize',
        informationGainRank: 10,
      });
    }
    push({
      id: INTAKE_QUESTION_IDS.injuryFunction,
      category: 'change',
      eyebrow: 'Using it',
      prompt: isLowerLimb
        ? say('Can you walk and put weight on it?', 'Can your child walk and put weight on it?')
        : say('Can you use it normally?', 'Can your child use it normally?'),
      control: 'choice-grid',
      options: isLowerLimb
        ? options(['normal', 'Yes, normally'], ['painful', 'Yes, but it hurts'], ['limping', 'Limping or putting less weight on it'], ['cannot', 'Not at all'])
        : options(['normal', 'Yes, normally'], ['painful', 'Yes, but it hurts'], ['limping', 'Using it less than usual'], ['cannot', 'Not at all']),
      sourceIds: [COVERAGE_SOURCE_IDS.nhsJointPain, COVERAGE_SOURCE_IDS.nhsKneePain, COVERAGE_SOURCE_IDS.nhsSprains],
      rationale: 'Use and weight bearing are what the joint, knee and sprain guidance turn on. "Not at all" also brings the injury safety check forward.',
      acuityOptionIds: ['cannot'],
      progressionStage: 'characterize',
      informationGainRank: 20,
    });
    asksImpact = false;
    mskDurationQuestion();
    mskMechanicalQuestion('core');
    if (concern !== 'injury') {
      mskSiteFeaturesQuestion();
      mskWorseWhenQuestion();
    }
    homeTreatmentQuestion({ questionId: INTAKE_QUESTION_IDS.mskDuration, optionIds: LONGER_MSK });
    if (concern === 'pain' && context.bodyRegionId === 'lower-back') lowerBackAssociated();
  } else if (concern === 'pain') {
    push({
      id: INTAKE_QUESTION_IDS.symptomCharacter,
      category: 'character',
      eyebrow: 'Character',
      prompt: say('How would you describe the discomfort?', 'How would you describe your child\'s discomfort?'),
      control: 'choice-grid',
      options: isLower
        ? options(['cramping', 'Cramping'], ['sharp', 'Sharp or stabbing'], ['burning', 'Burning'], ['heavy', 'Dull, heavy or pressure'], ['twisted', 'Twisted or knotted'], ['unsure', 'Not sure'])
        : options(['aching', 'Aching'], ['burning', 'Burning'], ['cramping', 'Cramping'], ['pressure', 'Pressure or heaviness'], ['sharp', 'Sharp'], ['unsure', 'Not sure']),
      sourceIds,
      rationale: 'Characterizes pain with vocabulary specific to the selected anatomical branch.',
      progressionStage: 'characterize',
      informationGainRank: 10,
    });
    if (context.bodyRegionId === 'neck' || facePart === 'upper-neck') {
      homeTreatmentQuestion({ questionId: INTAKE_QUESTION_IDS.duration, optionIds: ['several-days', 'longer'] });
      associatedLocation({
        rationale: 'NHS Neck pain names symptoms in the arm, such as pins and needles or a cold arm, as a reason to see a GP; where else the pain is felt is recorded for the clinician and asked before the arm features.',
        sourceIds: [COVERAGE_SOURCE_IDS.nhsNeckPain, COVERAGE_SOURCE_IDS.niceNeurologicalReferral],
        informationGainRank: 36,
      });
    }
    if (isLower) {
      associatedLocation({
        rationale: 'NHS Kidney infection describes pain in the lower back or side with a urinary infection, and says pain in the back just under the ribs needs urgent help. Lower tummy pain also felt in the back brings the urinary and pelvic safety checks forward.',
        sourceIds: [COVERAGE_SOURCE_IDS.nhsKidneyInfection, COVERAGE_SOURCE_IDS.nhsPelvicPain],
        acuityRegionIds: ['lower-back', 'upper-back'],
        informationGainRank: 33,
      });
    }
  } else if (concern === 'injury') {
    asksOnset = false;
    injuryMechanism();
    if (context.bodyRegionId === 'neck' || facePart === 'upper-neck') push({
      id: INTAKE_QUESTION_IDS.neckInjuryFeatures,
      category: 'context',
      eyebrow: 'Since the injury',
      prompt: say('Have you noticed any of these? Choose all that apply.', 'Have you noticed any of these in your child? Choose all that apply.'),
      control: 'multi-select',
      options: options(['stiff', 'Neck stiffness, or difficulty moving the head'], ['headache', 'Headaches'], ['shoulder-arm', 'Pain or muscle spasms in the shoulders or arms'], ['not-improving', 'Not improved after a week, or painkillers are not working'], ['none', 'None of these']),
      exclusiveOptionIds: ['none'],
      sourceIds: [COVERAGE_SOURCE_IDS.nhsWhiplash],
      rationale: 'The whiplash features NHS Whiplash lists (phase 3, PENDING CLINICAL REVIEW); its urgent signs are the R3 neck injury check.',
      progressionStage: 'characterize',
      informationGainRank: 15,
    });
  }

  if (asksImpact) impact();
  if (asksDuration) duration();
  if (asksOnset) onsetQuestion();

  /* --- Lower abdomen: the associated system opens the other branches ------ */
  if (isLower && concern !== 'bowel-change' && concern !== 'urinary-change' && concern !== 'reproductive-pelvic-change') {
    const associatedOptions: Array<readonly [string, string]> = [
      ['bowel', 'Bowel or digestive change'],
      ['urinary', 'Urinary change'],
      ['movement', 'Worse with movement or touch'],
      ['systemic', 'Feverish, sick or generally unwell'],
      ['none', 'None of these'],
    ];
    if (context.patientMode === 'adult' && context.sexForAssessment === 'female') {
      associatedOptions.splice(2, 0, ['reproductive', 'Bleeding, discharge, cycle or pregnancy context']);
    } else if (context.patientMode === 'adult' && context.sexForAssessment === 'intersex_or_variation') {
      associatedOptions.splice(2, 0, ['explicit-pelvic', 'A pelvic or genital change to describe directly']);
    }
    push({
      id: INTAKE_QUESTION_IDS.lowerAssociatedSystem,
      category: 'context',
      eyebrow: 'Associated change',
      prompt: 'Which other change is most relevant right now?',
      control: 'choice-grid',
      options: options(...associatedOptions),
      sensitiveOptionIds: ['reproductive', 'explicit-pelvic'],
      sourceIds: [COVERAGE_SOURCE_IDS.nhsPelvicPain],
      rationale: 'Separates bowel, urinary, movement, systemic and explicitly relevant physiology context after the primary lower-abdominal branch is known. Single choice, because it decides which branch is explored next.',
      acuityOptionIds: ['systemic'],
      progressionStage: 'system',
      informationGainRank: 35,
    });
    const opened = (definition: CoverageDefinition, openedBy: readonly string[]) => push({
      ...definition,
      showWhen: { questionId: INTAKE_QUESTION_IDS.lowerAssociatedSystem, optionIds: openedBy },
    });
    opened({
      id: INTAKE_QUESTION_IDS.bowelDetail,
      category: 'context',
      eyebrow: 'Bowel change',
      prompt: 'What has changed most with your bowels?',
      control: 'choice-grid',
      options: options(['constipation', 'Constipation'], ['diarrhoea', 'Diarrhoea'], ['blood', 'Blood in poo'], ['bloating', 'Bloating or fullness'], ['vomiting', 'Being sick'], ['other', 'Another change']),
      sourceIds: [COVERAGE_SOURCE_IDS.nhsPelvicPain, COVERAGE_SOURCE_IDS.nhsConstipation],
      rationale: 'Characterizes the bowel branch once it has been named as the associated change, so the blood criterion can be asked rather than left unreachable.',
      acuityOptionIds: ['blood'],
      progressionStage: 'characterize',
      informationGainRank: 45,
    }, ['bowel']);
    opened({
      id: INTAKE_QUESTION_IDS.bowelPersistence,
      category: 'duration',
      eyebrow: 'How it has behaved',
      prompt: 'How has the bowel change behaved so far?',
      control: 'choice-grid',
      options: BOWEL_PERSISTENCE_OPTIONS,
      sourceIds: [COVERAGE_SOURCE_IDS.nhsConstipation, COVERAGE_SOURCE_IDS.nhsPelvicPain],
      rationale: 'The persistence distinction applies whether the bowel was named at entry or as the associated change.',
      progressionStage: 'discriminate',
      informationGainRank: 50,
    }, ['bowel']);
    if (context.patientMode === 'adult') {
      opened({
        id: INTAKE_QUESTION_IDS.bowelAlarmFeature,
        category: 'change',
        eyebrow: 'Other changes',
        prompt: 'Has anything else changed alongside the bowel concern?',
        control: 'choice-grid',
        options: BOWEL_ALARM_OPTIONS,
        sourceIds: [COVERAGE_SOURCE_IDS.nhsConstipation],
        rationale: 'NHS Constipation names a sudden bowel-habit change and unintended weight loss among the features that take a bowel concern to a GP.',
        progressionStage: 'discriminate',
        informationGainRank: 65,
      }, ['bowel']);
    }
    bowelFollowUps([{ questionId: INTAKE_QUESTION_IDS.lowerAssociatedSystem, optionIds: ['bowel'] }]);
    opened({
      id: INTAKE_QUESTION_IDS.urinaryDetail,
      category: 'context',
      eyebrow: 'Urinary change',
      prompt: say('What has changed most when you pass urine?', 'What has changed most when your child passes urine?'),
      control: 'choice-grid',
      options: options(['pain', 'Pain or burning'], ['frequency', 'More often or urgently'], ['difficulty', 'Difficulty passing urine'], ['blood', 'Blood in urine'], ['other', 'Another change']),
      sourceIds: [COVERAGE_SOURCE_IDS.nhsUrinaryTractInfection, COVERAGE_SOURCE_IDS.nhsPelvicPain],
      rationale: 'Characterizes the urinary branch once it has been named as the associated change.',
      progressionStage: 'characterize',
      informationGainRank: 55,
    }, ['urinary']);
    opened({
      id: INTAKE_QUESTION_IDS.urinaryPattern,
      category: 'pattern',
      eyebrow: 'Pattern',
      prompt: 'Which of these describes the urinary change best?',
      control: 'choice-grid',
      options: URINARY_PATTERN_OPTIONS,
      sourceIds: [COVERAGE_SOURCE_IDS.nhsUrinaryTractInfection, COVERAGE_SOURCE_IDS.nhsPelvicPain],
      rationale: 'NHS UTI separates a single episode from recurrence, obstruction and possible upper-tract involvement.',
      acuityOptionIds: ['flank-fever'],
      progressionStage: 'discriminate',
      informationGainRank: 60,
    }, ['urinary']);
    if (context.patientMode === 'adult' && (context.sexForAssessment === 'female' || context.sexForAssessment === 'intersex_or_variation')) {
      const neutral = context.sexForAssessment === 'intersex_or_variation';
      opened(reproductiveTimingDefinition(neutral, true), neutral ? ['explicit-pelvic'] : ['reproductive']);
    }
  }

  if (isLower && context.patientMode === 'adult' && context.sexForAssessment === 'female'
    && (concern === 'reproductive-pelvic-change' || concern === 'pain' || concern === 'swelling-lump' || concern === 'other' || concern === 'injury' || concern === 'skin-change')) {
    push({
      id: INTAKE_QUESTION_IDS.pregnancyContext,
      category: 'context',
      eyebrow: 'Private context',
      prompt: 'Could pregnancy be possible or already confirmed?',
      control: 'choice-grid',
      options: options(['yes', 'Yes or possibly'], ['no', 'No'], ['unsure', 'Not sure'], ['prefer-not', 'Prefer not to answer here']),
      showWhen: concern === 'reproductive-pelvic-change'
        ? { questionId: INTAKE_QUESTION_IDS.complaintEntry, optionIds: ['reproductive-pelvic-change'] }
        : { questionId: INTAKE_QUESTION_IDS.lowerAssociatedSystem, optionIds: ['reproductive'] },
      sourceIds: [COVERAGE_SOURCE_IDS.nhsPelvicPain],
      rationale: 'Asks pregnancy context only in an adult female reproductive branch; it is never inferred from artwork or sex alone.',
      safetyPurpose: 'Provides private context for clinical review; it is not a standalone emergency or routing rule.',
      sensitive: true,
      progressionStage: 'context',
      informationGainRank: 70,
      physiologyEligibility: 'female-reproductive-branch',
    });
  }

  /* --- Region context, where the branch did not already cover it ---------- */
  if ((context.bodyRegionId === 'neck' || facePart === 'upper-neck') && complaint !== 'throat-concern') {
    push({
      id: INTAKE_QUESTION_IDS.neckDetail,
      category: 'context',
      eyebrow: 'Associated change',
      prompt: 'Is there another change with it? Choose all that apply.',
      control: 'multi-select',
      options: options(['arm-sensation', 'Arm numbness, tingling or coldness'], ['voice', 'Voice change'], ['swallow', 'Difficulty swallowing'], ['fever-head', 'Feverish with headache or unusual drowsiness'], ['movement', 'Movement is restricted'], ['none', 'None of these']),
      exclusiveOptionIds: ['none'],
      acuityOptionIds: ['fever-head'],
      sourceIds: [COVERAGE_SOURCE_IDS.nhsNeckPain, COVERAGE_SOURCE_IDS.niceMeningitis],
      rationale: 'Separates movement, neurological, voice, swallowing and combined safety-relevant evidence; these can coexist.',
      progressionStage: 'discriminate',
      informationGainRank: 40,
    });
  } else if (
    context.bodyRegionId === 'chest' && complaint !== 'chest-breathing-concern'
    // Chest pain, a heartbeat change and a burning or swallowing concern have their own branches,
    // whose questions and the R3 checks already cover these features.
    && !(concern === 'pain' && !pediatric) && concern !== 'palpitations' && concern !== 'voice-swallow'
  ) {
    push({
      id: INTAKE_QUESTION_IDS.chestDetail,
      category: 'context',
      eyebrow: 'Associated change',
      prompt: 'What else happens with it? Choose all that apply.',
      control: 'multi-select',
      options: options(['breathless', 'Short of breath'], ['sweaty-sick', 'Sweaty, sick or lightheaded'], ['spread', 'Spreads to arm, neck, jaw, stomach or back'], ['meal', 'Related to eating or burning'], ['movement', 'Related to movement or touch'], ['none', 'None of these']),
      exclusiveOptionIds: ['none'],
      acuityOptionIds: ['breathless', 'sweaty-sick', 'spread'],
      sourceIds: [COVERAGE_SOURCE_IDS.nhsChestPain],
      rationale: 'Collects cross-system chest evidence after complaint type and initial characterization; the findings can coexist.',
      progressionStage: 'discriminate',
      informationGainRank: 40,
    });
  } else if (!isEye && !isEar && !isNose && !isOral && !isLower && !isUpperAbdomen && complaint !== 'throat-concern'
    && complaint !== 'chest-breathing-concern' && complaint !== 'head-concern' && !(isMusculoskeletal && (concern === 'pain' || concern === 'injury' || concern === 'movement-function'))
    // The neurological detail already asks whether movement or grip is affected.
    && concern !== 'numbness-tingling'
    && context.bodyRegionId !== 'chest'
    && !(complaint === 'face-general-concern' && concern === 'pain' && !pediatric && facePart !== 'upper-neck')) {
    push({
      id: INTAKE_QUESTION_IDS.functionImpact,
      category: 'context',
      eyebrow: 'Function',
      prompt: say('Is this stopping you from using the area or doing your usual activities?', 'Is this stopping your child from using the area or doing their usual activities?'),
      control: 'choice-grid',
      options: options(['yes', 'Yes'], ['partly', 'Partly'], ['no', 'No'], ['unsure', 'Not sure']),
      sourceIds,
      rationale: 'Captures function within the active anatomical branch without assigning specialty evidence.',
      progressionStage: 'context',
      informationGainRank: 50,
    });
  }

  /*
    Caregiver observation for children.

    The "hard to wake" answer this used to offer duplicated the R3
    altered-consciousness check, so the concept was asked twice. It now asks
    only what R3 does not: eating, drinking and usual play or activity.
  */
  if (pediatric) {
    push({
      id: INTAKE_QUESTION_IDS.pediatricWellbeing,
      category: 'change',
      eyebrow: caregiver ? 'Your child today' : 'Your day',
      prompt: say(
        'Are you eating, drinking and doing your usual activities?',
        context.age < 12 ? 'Is your child eating, drinking and playing as usual?' : 'Is your child eating, drinking and doing their usual activities?',
      ),
      control: 'choice-grid',
      options: options(['usual', 'Yes, as usual'], ['eating-less', 'Eating or drinking less'], ['less-active', 'Less active than usual'], ['unsure', 'Not sure']),
      sourceIds: [COVERAGE_SOURCE_IDS.whoImci, COVERAGE_SOURCE_IDS.nhmImnci, COVERAGE_SOURCE_IDS.niceFeverUnderFive],
      rationale: 'Caregiver-observable function in words a parent can answer; R3 separately owns the danger-sign checks.',
      progressionStage: 'context',
      informationGainRank: 70,
    });
  }

  return {
    preScreen: questions.filter((question) => question.stage !== 'extension'),
    postScreen: questions.filter((question) => question.stage === 'extension'),
  };
}

/**
 * The upper tummy "something else" clarifier. Each option names a real concern
 * family; "Not sure" maps to none and keeps the concern as it was stated.
 */
const OTHER_CLARIFIER_OPTIONS = options(
  ['pain', 'Pain or discomfort'],
  ['digestive', 'A bowel or digestive change'],
  ['swelling', 'Swelling or a lump'],
  ['skin', 'A change in the skin'],
  ['injury', 'An injury'],
  ['urinary', 'A change when peeing'],
  ['numbness', 'Numbness or tingling'],
  ['weakness', 'Weakness or drooping'],
  ['movement', 'Difficulty moving or using it'],
  ['unsure', 'Something else, or not sure'],
);

/** The family each clarifier answer maps to, in the order their branches are built. */
const OTHER_CLARIFIER_ORDER: readonly (readonly [string, RegionConcernId])[] = [
  ['injury', 'injury'],
  ['digestive', 'bowel-change'],
  ['pain', 'pain'],
  ['urinary', 'urinary-change'],
  ['swelling', 'swelling-lump'],
  ['skin', 'skin-change'],
  ['numbness', 'numbness-tingling'],
  ['weakness', 'weakness-drooping'],
  ['movement', 'movement-function'],
];

/*
  Where "Something else" is clarified (phase 2, PENDING CLINICAL REVIEW). The
  eye, ear, nose, mouth and throat branches ask their own detail of an "other"
  concern, and the lower tummy asks which system is involved, so they keep
  that. Everywhere else the clarifier offers the families the region has.
*/
export function otherClarifierFamilies(context: RegionAssessmentContext): readonly (readonly [string, RegionConcernId])[] {
  if (context.concernId !== 'other') return [];
  const face = context.faceSubregionId ?? '';
  if (/eye|ear/.test(face) || face === 'nose' || face === 'mouth' || face === 'chin' || face.includes('jaw')) return [];
  if (context.bodyRegionId === 'lower-abdomen' || context.bodyRegionId === 'pelvis') return [];
  if (context.complaintId === 'throat-concern') return [];
  const offered = new Set<string>(concernOptionsFor(context.bodyRegionId, context.faceSubregionId, {
    age: context.age,
    sexForAssessment: context.sexForAssessment,
  }).map((option) => option.id));
  return OTHER_CLARIFIER_ORDER.filter(([, family]) => offered.has(family));
}

/**
 * The assessment as the clarifier has refined it. An upper tummy concern
 * described as something else, once the clarifier names a family, is read by
 * the published criteria and the contextual safety checks as that family. The
 * stored context is unchanged: the concern the patient chose is still what the
 * handoff records.
 */
export function clarifiedContext(context: RegionAssessmentContext, answers: readonly IntakeAnswer[]): RegionAssessmentContext {
  if (context.concernId !== 'other') return context;
  const chosen = answers.find((answer) => answer.questionId === INTAKE_QUESTION_IDS.otherClarifier)?.optionId;
  const family = otherClarifierFamilies(context).find(([optionId]) => optionId === chosen)?.[1];
  return family ? { ...context, concernId: family } : context;
}

const YES_NO_UNSURE = options(['yes', 'Yes'], ['no', 'No'], ['unsure', 'Not sure']);

/**
 * The discrimination extension for the weighted adult headache and breathing
 * complaints. Every question here completes a published criterion in
 * direction-gate.ts and is asked only after R1 ended without separating a
 * candidate. A fact R1 already recorded is read from R1, never asked again.
 */
function weightedExtension(context: RegionAssessmentContext): IntakeQuestion[] {
  if (context.patientMode !== 'adult') return [];
  const question = (definition: CoverageDefinition) => coverageQuestion(context, { ...definition, stage: 'extension', progressionStage: 'discriminate' });
  if (context.complaintId === 'headache') {
    return [
      question({
        id: INTAKE_QUESTION_IDS.headacheSinusSymptoms,
        category: 'context',
        eyebrow: 'Nose and face',
        prompt: 'With the headache, do you also have a blocked or runny nose and pressure or tenderness around your cheeks, eyes or forehead?',
        control: 'yes-no',
        options: YES_NO_UNSURE,
        sourceIds: [COVERAGE_SOURCE_IDS.nhsSinusitis],
        rationale: 'NHS Sinusitis lists facial pain, pressure or tenderness together with a blocked or runny nose, and includes headache as an accompanying symptom. This asks for the observable pattern without naming a diagnosis.',
        informationGainRank: 48,
      }),
      question({
        id: INTAKE_QUESTION_IDS.headacheFeatures,
        category: 'context',
        eyebrow: 'Headache features',
        prompt: 'Do any of these apply to the headache? Choose all that apply.',
        control: 'multi-select',
        options: options(
          ['cough-strain', 'It is brought on by coughing, sneezing or straining'],
          ['exercise', 'It is brought on by exercise'],
          ['posture', 'It changes when you sit up, stand or lie down'],
          ['changed', 'It is very different from your usual headaches'],
          ['none', 'None of these'],
        ),
        exclusiveOptionIds: ['none'],
        sourceIds: [COVERAGE_SOURCE_IDS.niceHeadache, COVERAGE_SOURCE_IDS.nhsHeadaches, COVERAGE_SOURCE_IDS.nhsEnglandHeadacheToolkit],
        rationale: 'NICE CG150 1.1.1 names these features as reasons to evaluate a headache and consider further investigations or referral. They can coexist. The features R3 already screens as emergencies (sudden severe onset, new weakness, speech, memory or vision change, drowsiness) are not asked again.',
        informationGainRank: 50,
      }),
      question({
        id: INTAKE_QUESTION_IDS.headacheSinusPattern,
        category: 'pattern',
        eyebrow: 'Nose and face pattern',
        prompt: 'Which of these describes the nose and facial-pressure symptoms? Choose all that apply.',
        control: 'multi-select',
        options: options(
          ['one-sided', 'They are only on one side of your face'],
          ['recurrent', 'They keep coming back'],
          ['three-months-treatment', 'They have continued after 3 months of treatment'],
          ['none', 'None of these'],
        ),
        exclusiveOptionIds: ['none'],
        showWhen: { questionId: INTAKE_QUESTION_IDS.headacheSinusSymptoms, optionIds: ['yes'] },
        sourceIds: [COVERAGE_SOURCE_IDS.nhsSinusitis],
        rationale: 'NHS Sinusitis names one-sided facial symptoms, repeated episodes, or symptoms remaining after 3 months of treatment as reasons a GP may refer to ENT.',
        informationGainRank: 52,
      }),
    ];
  }
  if (context.complaintId === 'shortness-of-breath') {
    return [
      question({
        id: INTAKE_QUESTION_IDS.breathingInfections,
        category: 'context',
        eyebrow: 'Chest infections',
        prompt: 'Do you keep getting chest infections?',
        control: 'yes-no',
        options: YES_NO_UNSURE,
        sourceIds: [COVERAGE_SOURCE_IDS.niceCopd, COVERAGE_SOURCE_IDS.nhsBronchiectasis],
        rationale: 'NICE NG115 Table 5 lists frequent infections as a reason for specialist respiratory advice, and NHS Bronchiectasis names frequent chest infections among its main symptoms.',
        informationGainRank: 50,
      }),
      question({
        id: INTAKE_QUESTION_IDS.breathingPhlegm,
        category: 'context',
        eyebrow: 'Phlegm',
        prompt: 'Do you cough up a lot of phlegm (mucus)?',
        control: 'yes-no',
        options: YES_NO_UNSURE,
        sourceIds: [COVERAGE_SOURCE_IDS.nhsBronchiectasis],
        rationale: 'NHS Bronchiectasis names coughing up a lot of phlegm among its main symptoms.',
        informationGainRank: 52,
      }),
      question({
        id: INTAKE_QUESTION_IDS.breathingAnkles,
        category: 'context',
        eyebrow: 'Swelling',
        prompt: 'Have your feet, ankles or legs been swollen?',
        control: 'yes-no',
        options: YES_NO_UNSURE,
        sourceIds: [COVERAGE_SOURCE_IDS.nhsHeartFailure],
        rationale: 'NHS Heart failure names swelling in the feet, ankles or legs. Asked only when the approved R1 question has not already recorded it.',
        informationGainRank: 54,
      }),
      question({
        id: INTAKE_QUESTION_IDS.breathingLyingFlat,
        category: 'context',
        eyebrow: 'Lying down',
        prompt: 'Does your breathing get worse when you lie down?',
        control: 'yes-no',
        options: YES_NO_UNSURE,
        sourceIds: [COVERAGE_SOURCE_IDS.nhsHeartFailure],
        rationale: 'NHS Heart failure names feeling out of breath when lying down. Asked only when the approved R1 question has not already recorded it.',
        informationGainRank: 56,
      }),
      question({
        id: INTAKE_QUESTION_IDS.breathingActivity,
        category: 'context',
        eyebrow: 'Everyday activity',
        prompt: 'Does ordinary activity, such as walking or climbing stairs, bring on or worsen the breathing problem?',
        control: 'yes-no',
        options: YES_NO_UNSURE,
        sourceIds: [COVERAGE_SOURCE_IDS.nhsHeartFailure],
        rationale: 'NHS Heart failure names breathlessness during everyday activity. Asked only when the core breathing description has not already recorded breathlessness with effort.',
        informationGainRank: 58,
      }),
    ];
  }
  return [];
}

const BOWEL_PERSISTENCE_OPTIONS = options(
  ['recent-first', 'Recent, and this is the first time'],
  ['improving', 'Improving with what has been tried'],
  ['not-improving', 'Not getting better with what has been tried'],
  ['regularly-recurrent', 'It happens regularly'],
  ['two-weeks-plus', 'Diarrhoea for 2 weeks or more'],
  ['unsure', 'Not sure'],
);

const BOWEL_ALARM_OPTIONS = options(
  ['sudden-change', 'A sudden change from the usual pattern'],
  ['weight-loss', 'Weight loss without trying'],
  ['both', 'Both of these'],
  ['neither', 'Neither of these'],
  ['unsure', 'Not sure'],
);

const URINARY_PATTERN_OPTIONS = options(
  ['single-episode', 'A single recent episode'],
  ['recurrent', 'It keeps coming back'],
  ['poor-stream', 'The stream is weaker or slower'],
  ['incomplete-emptying', 'It feels like the bladder does not empty'],
  ['flank-fever', 'Pain under the ribs or in the back, with feeling feverish'],
  ['none', 'None of these'],
);

function reproductiveTimingDefinition(neutral: boolean, crossBranch: boolean): CoverageDefinition {
  return {
    id: INTAKE_QUESTION_IDS.reproductiveTiming,
    category: 'pattern',
    eyebrow: 'Private context',
    prompt: neutral ? 'When does it happen?' : 'When does the bleeding or symptom happen?',
    control: 'choice-grid',
    options: neutral
      ? options(['unrelated', 'It does not follow any pattern'], ['after-sex', 'After sexual activity'], ['recurrent', 'It keeps coming back'], ['constant', 'It is there most of the time'], ['prefer-not', 'Prefer not to answer here'])
      : options(
        ['with-periods', 'With periods'],
        ['between-periods', 'Between periods'],
        ['after-sex', 'After sex'],
        ['heavier-than-usual', 'Periods are heavier than usual'],
        ['after-menopause', 'After the menopause'],
        ['unrelated', 'It does not follow the cycle'],
        ['prefer-not', 'Prefer not to answer here'],
      ),
    sensitive: true,
    sourceIds: [COVERAGE_SOURCE_IDS.nhsAbnormalVaginalBleeding, COVERAGE_SOURCE_IDS.nhsHeavyPeriods, COVERAGE_SOURCE_IDS.nhsPelvicPain],
    rationale: crossBranch
      ? 'Cycle relationship is the answer the NHS bleeding and heavy periods pages turn on. Asked only after a reproductive change was explicitly named, never from sex or region alone.'
      : 'NHS states that bleeding between periods or after sex is always checked, and describes heavy periods as investigated and sometimes referred on. Cycle relationship is the answer those pages turn on.',
    progressionStage: 'discriminate',
    informationGainRank: 50,
    physiologyEligibility: neutral ? 'explicit-neutral-context' : 'female-reproductive-branch',
  };
}

export function intakePlanFor(complaintId: string, clinicalContext?: RegionAssessmentContext | null): ComplaintIntakePlan {
  if (clinicalContext) return coveragePlan(clinicalContext);
  const plan = INTAKE_PLANS[complaintId];
  if (!plan) return EMPTY_PLAN;
  return {
    preScreen: plan.preScreen.map((question) => resolveStaticQuestion(question, complaintId)),
    postScreen: plan.postScreen.map((question) => resolveStaticQuestion(question, complaintId)),
  };
}

/** Every intake question a complaint can ask, in plan order. */
export function intakeQuestionsFor(complaintId: string, clinicalContext?: RegionAssessmentContext | null): readonly IntakeQuestion[] {
  const plan = intakePlanFor(complaintId, clinicalContext);
  return [...plan.preScreen, ...plan.postScreen];
}

/** Read-only aliases keep pre-normalization R9D events valid; new interviews never emit them. */
const LEGACY_INTAKE_ID_ALIASES: Readonly<Record<string, Readonly<Record<string, CanonicalIntakeQuestionId>>>> = {
  'upper-abdominal-pain': {
    'intake-upper-abdominal-character': INTAKE_QUESTION_IDS.symptomCharacter,
    'intake-upper-abdominal-intensity': INTAKE_QUESTION_IDS.currentImpact,
    'intake-upper-abdominal-duration': INTAKE_QUESTION_IDS.duration,
    'intake-upper-abdominal-onset': INTAKE_QUESTION_IDS.onset,
    'intake-upper-abdominal-pattern': INTAKE_QUESTION_IDS.pattern,
  },
  'shortness-of-breath': {
    'intake-breath-character': INTAKE_QUESTION_IDS.symptomCharacter,
    'intake-breath-intensity': INTAKE_QUESTION_IDS.currentImpact,
    'intake-breath-duration': INTAKE_QUESTION_IDS.duration,
  },
  headache: {
    'intake-headache-character': INTAKE_QUESTION_IDS.symptomCharacter,
    'intake-headache-intensity': INTAKE_QUESTION_IDS.currentImpact,
    'intake-headache-duration': INTAKE_QUESTION_IDS.duration,
  },
  'joint-musculoskeletal-pain': {
    'intake-joint-character': INTAKE_QUESTION_IDS.symptomCharacter,
    'intake-joint-intensity': INTAKE_QUESTION_IDS.currentImpact,
    'intake-joint-duration': INTAKE_QUESTION_IDS.duration,
    'intake-joint-onset': INTAKE_QUESTION_IDS.onset,
  },
};

export function intakeQuestionById(complaintId: string, questionId: string, clinicalContext?: RegionAssessmentContext | null): IntakeQuestion | null {
  const questions = intakeQuestionsFor(complaintId, clinicalContext);
  const current = questions.find((question) => question.id === questionId);
  if (current) return current;
  const canonicalId = LEGACY_INTAKE_ID_ALIASES[complaintId]?.[questionId];
  const legacy = canonicalId ? questions.find((question) => question.id === canonicalId) : null;
  return legacy ? { ...legacy, id: questionId } : null;
}

export function intakeOptionLabel(question: IntakeQuestion, optionId: string): string {
  const selected = selectedOptionIds(optionId);
  if (question.sensitive || selected.some((id) => question.sensitiveOptionIds?.includes(id))) return 'Response recorded privately';
  return selected
    .map((id) => question.options.find((option) => option.id === id)?.label ?? id)
    .join(', ');
}

/** Whether a question's premise holds for the answers so far. */
export function questionIsEligible(question: IntakeQuestion, answers: readonly IntakeAnswer[]): boolean {
  if (!question.showWhen) return true;
  const conditions = Array.isArray(question.showWhen) ? question.showWhen : [question.showWhen as ShowCondition];
  return conditions.every((condition) => answerIncludes(answers, condition.questionId, condition.optionIds));
}

/**
 * Builds the stored answer for a multi-select question from the chosen ids,
 * in option order, applying exclusive answers such as "None of these".
 */
export function toggleMultiSelect(question: IntakeQuestion, selected: readonly string[], optionId: string): string[] {
  const exclusive = question.exclusiveOptionIds ?? [];
  let next: string[];
  if (selected.includes(optionId)) next = selected.filter((id) => id !== optionId);
  else if (exclusive.includes(optionId)) next = [optionId];
  else next = [...selected.filter((id) => !exclusive.includes(id)), optionId];
  const order = question.options.map((option) => option.id);
  return next.toSorted((left, right) => order.indexOf(left) - order.indexOf(right));
}

export function encodeMultiSelect(optionIds: readonly string[]): string {
  return optionIds.join(MULTI_SELECT_SEPARATOR);
}

/** The next unanswered question in a list, or null. */
export function nextIntakeQuestion(
  asked: readonly IntakeQuestion[],
  answers: readonly IntakeAnswer[],
): IntakeQuestion | null {
  const answered = new Set(answers.map((answer) => answer.questionId));
  const eligible = asked.filter((question) => !answered.has(question.id) && questionIsEligible(question, answers));
  return eligible.toSorted((left, right) =>
    (left.informationGainRank ?? Number.MAX_SAFE_INTEGER) - (right.informationGainRank ?? Number.MAX_SAFE_INTEGER)
    || asked.indexOf(left) - asked.indexOf(right))[0] ?? null;
}
