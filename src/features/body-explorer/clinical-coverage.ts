import { BODY_DOMAIN, type BodyRegionId } from '../../body/index.ts';
import {
  GENERIC_ADULT_COMPLAINT_IDS,
  PEDIATRIC_COMPLAINT_IDS,
} from '../../engine/coverage-complaints.ts';
import { voiceOf, type PatientContext, type SexForAssessment } from '../intake/patient-context.ts';
import { questionVoiceFor, type QuestionVoice } from '../intake/question-voice.ts';
import { FACE_HIT_REGIONS, FACE_REGION_BY_ID, type FaceRegionId } from './faceHitMap.ts';

export type PatientMode = 'adult' | 'pediatric';
export type PediatricAgeBand = 'infant-under-one' | 'young-child' | 'school-age' | 'adolescent';
/**
 * `patient-or-caregiver` is retained only so earlier canonical metadata still
 * type-checks. A live assessment is always one of the two locked voices.
 */
export type ReporterMode = 'caregiver' | 'patient-or-caregiver' | 'patient';

export type RegionConcernId =
  | 'pain'
  | 'breathing'
  | 'palpitations'
  | 'vision-change'
  | 'eye-redness-discharge'
  | 'hearing-balance-change'
  | 'ear-discharge'
  | 'nose-change'
  | 'bleeding-discharge'
  | 'swelling-lump'
  | 'skin-change'
  | 'numbness-tingling'
  | 'weakness-drooping'
  | 'injury'
  | 'movement-function'
  | 'bowel-change'
  | 'urinary-change'
  | 'reproductive-pelvic-change'
  | 'voice-swallow'
  | 'throat'
  | 'mouth-change'
  | 'other';

export interface CoverageSource {
  id: string;
  organization: string;
  title: string;
  url: string;
  scope: string;
  accessedAt: '2026-09-21' | '2026-09-22' | '2026-09-23' | '2026-09-24' | '2026-09-25' | '2026-09-26' | '2026-10-08' | '2026-10-09';
  clinicalReviewStatus: 'source-backed-prototype-pending-clinical-review';
}

export const COVERAGE_SOURCE_IDS = {
  cmsHpi: 'coverage-cms-history-present-illness',
  nhsPelvicPain: 'coverage-nhs-pelvic-pain',
  nhsEyePain: 'coverage-nhs-eye-pain',
  nhsEarInfections: 'coverage-nhs-ear-infections',
  nhsHearingLoss: 'coverage-nhs-hearing-loss',
  nhsTinnitus: 'coverage-nhs-tinnitus',
  nhsVertigo: 'coverage-nhs-vertigo',
  nhsSinusitis: 'coverage-nhs-sinusitis',
  nhsNosebleed: 'coverage-nhs-nosebleed',
  nhsMouthUlcers: 'coverage-nhs-mouth-ulcers',
  nhsTmd: 'coverage-nhs-temporomandibular-disorder',
  nhsStroke: 'coverage-nhs-stroke-symptoms',
  nhsChestPain: 'coverage-nhs-chest-pain',
  nhsNeckPain: 'coverage-nhs-neck-pain',
  nhsAllergy: 'coverage-nhs-allergy',
  nhsEarache: 'coverage-nhs-earache',
  nhsConstipation: 'coverage-nhs-constipation',
  nhsUrinaryTractInfection: 'coverage-nhs-urinary-tract-infection',
  nhsHeavyPeriods: 'coverage-nhs-heavy-periods',
  nhsAbnormalVaginalBleeding: 'coverage-nhs-vaginal-bleeding-between-periods-or-after-sex',
  whoImci: 'coverage-who-imci',
  niceFeverUnderFive: 'coverage-nice-fever-under-five',
  niceMeningitis: 'coverage-nice-meningitis',
  nbemsBroad: 'coverage-nbems-broad-specialties',
  nbemsSuper: 'coverage-nbems-super-specialties',
  /* Added by the questionnaire rebuild research pass, accessed 2026-09-23. */
  nhmImnci: 'coverage-nhm-imnci-module-5',
  nhsSoreThroat: 'coverage-nhs-sore-throat',
  nhsTonsillitis: 'coverage-nhs-tonsillitis',
  aomrcTonsillectomy: 'coverage-aomrc-ebi-tonsillectomy',
  nhsLaryngitis: 'coverage-nhs-laryngitis',
  nhsDysphagia: 'coverage-nhs-swallowing-problems',
  nhsLumps: 'coverage-nhs-lumps',
  niceSuspectedCancer: 'coverage-nice-ng12-suspected-cancer',
  niceChildConstipation: 'coverage-nice-cg99-constipation-children',
  niceChildUti: 'coverage-nice-ng224-uti-under-16',
  niceChildEczema: 'coverage-nice-cg57-eczema-under-12',
  nicePsoriasis: 'coverage-nice-cg153-psoriasis',
  nhsMoles: 'coverage-nhs-moles',
  nhsJointPain: 'coverage-nhs-joint-pain',
  nhsKneePain: 'coverage-nhs-knee-pain',
  nhsSprains: 'coverage-nhs-sprains-and-strains',
  nhsChildHeadache: 'coverage-nhs-headaches-in-children',
  nhsDiarrhoeaVomiting: 'coverage-nhs-diarrhoea-and-vomiting',
  nhsSquint: 'coverage-nhs-squint',
  /* Added by the normalization pass, accessed 2026-09-24. */
  nhsRectalBleeding: 'coverage-nhs-rectal-bleeding',
  nhsBowelCancerSymptoms: 'coverage-nhs-bowel-cancer-symptoms',
  nhsPinsAndNeedles: 'coverage-nhs-pins-and-needles',
  nhsTrigeminalNeuralgia: 'coverage-nhs-trigeminal-neuralgia',
  nhsShingles: 'coverage-nhs-shingles',
  /* Added by the routing reconciliation pass, accessed 2026-09-25. */
  nhsAngina: 'coverage-nhs-angina',
  niceStableChestPain: 'coverage-nice-cg95-chest-pain',
  nhsPalpitations: 'coverage-nhs-heart-palpitations',
  nhsHeartburn: 'coverage-nhs-heartburn-acid-reflux',
  nhsIndigestion: 'coverage-nhs-indigestion',
  niceNeurologicalReferral: 'coverage-nice-ng127-neurological-referral',
  nhsBackPain: 'coverage-nhs-back-pain',
  nhsSciatica: 'coverage-nhs-sciatica',
  nhsKidneyInfection: 'coverage-nhs-kidney-infection',
  /* Added by the clinical blocker pass, accessed 2026-09-26. */
  niceHeadache: 'coverage-nice-cg150-headache',
  nhsEnglandHeadacheToolkit: 'coverage-nhs-england-rightcare-headache',
  nhsHeadaches: 'coverage-nhs-headaches',
  nhsHeartFailure: 'coverage-nhs-heart-failure',
  niceCopd: 'coverage-nice-ng115-copd',
  nhsBronchiectasis: 'coverage-nhs-bronchiectasis',
  nhsCough: 'coverage-nhs-cough',
  nhsBrokenRibs: 'coverage-nhs-broken-or-bruised-ribs',
  nhsStomachAche: 'coverage-nhs-stomach-ache',
  /* Added by the questionnaire intelligence pass, accessed 2026-10-08. PENDING CLINICAL REVIEW. */
  nhsToothache: 'coverage-nhs-toothache',
  nhsDentalAbscess: 'coverage-nhs-dental-abscess',
  nhsGumDisease: 'coverage-nhs-gum-disease',
  niceRheumatoidArthritis: 'coverage-nice-ng100-rheumatoid-arthritis',
  nhsRheumatoidArthritis: 'coverage-nhs-rheumatoid-arthritis-symptoms',
  /* Questionnaire expansion phase 2, accessed 2026-10-08, each page read directly. PENDING CLINICAL REVIEW. */
  nhsShoulderPain: 'coverage-nhs-shoulder-pain',
  nhsHipPain: 'coverage-nhs-hip-pain',
  nhsElbowArmPain: 'coverage-nhs-elbow-arm-pain',
  nhsWristPain: 'coverage-nhs-wrist-pain',
  nhsHeelPain: 'coverage-nhs-heel-pain',
  nhsAnklePain: 'coverage-nhs-ankle-pain',
  nhsDvt: 'coverage-nhs-dvt',
  nhsVaricoseVeins: 'coverage-nhs-varicose-veins',
  niceVaricoseVeins: 'coverage-nice-cg168-varicose-veins',
  nhsHernia: 'coverage-nhs-hernia',
  nhsBreastLump: 'coverage-nhs-breast-lump',
  nhsGiantCellArteritis: 'coverage-nhs-giant-cell-arteritis',
  nhsMouthCancer: 'coverage-nhs-mouth-cancer-symptoms',
  nhsCarpalTunnel: 'coverage-nhs-carpal-tunnel',
  nhsPeripheralNeuropathy: 'coverage-nhs-peripheral-neuropathy',
  nhsCellulitis: 'coverage-nhs-cellulitis',
  nhsProstateEnlargement: 'coverage-nhs-prostate-enlargement',
  /* Phase 3, accessed 2026-10-09, each page read directly. PENDING CLINICAL REVIEW. */
  nhsHeadInjury: 'coverage-nhs-head-injury',
  nhsBrokenNose: 'coverage-nhs-broken-nose',
  nhsWhiplash: 'coverage-nhs-whiplash',
  /* Phase 4, accessed 2026-10-09, each page read directly. PENDING CLINICAL REVIEW. */
  nhsFalls: 'coverage-nhs-falls',
  niceFalls: 'coverage-nice-ng249-falls',
  nhsBlackEye: 'coverage-nhs-black-eye',
  nhsBrokenTooth: 'coverage-nhs-broken-or-knocked-out-tooth',
  nhsNasalPolyps: 'coverage-nhs-nasal-polyps',
  nhsBellsPalsy: 'coverage-nhs-bells-palsy',
} as const;

const REBUILD_ACCESSED = '2026-09-23' as const;
const NORMALIZATION_ACCESSED = '2026-09-24' as const;
const RECONCILIATION_ACCESSED = '2026-09-25' as const;
const BLOCKER_PASS_ACCESSED = '2026-09-26' as const;
const INTELLIGENCE_PASS_ACCESSED = '2026-10-08' as const;
const PHASE3_ACCESSED = '2026-10-09' as const;
const PHASE4_ACCESSED = '2026-10-09' as const;
const PENDING = 'source-backed-prototype-pending-clinical-review' as const;

export const CLINICAL_COVERAGE_SOURCES: readonly CoverageSource[] = [
  {
    id: COVERAGE_SOURCE_IDS.cmsHpi,
    organization: 'Centers for Medicare & Medicaid Services',
    title: '1997 Documentation Guidelines for Evaluation and Management Services',
    url: 'https://www.cms.gov/files/document/master1pdf',
    scope: 'Supports descriptive history fields for location, quality, severity, duration, timing, context, modifying factors and associated symptoms; it supplies no routing weights.',
    accessedAt: '2026-09-21',
    clinicalReviewStatus: 'source-backed-prototype-pending-clinical-review',
  },
  {
    id: COVERAGE_SOURCE_IDS.nhsPelvicPain,
    organization: 'National Health Service',
    title: 'Pelvic pain',
    url: 'https://www.nhs.uk/symptoms/pelvic-pain/',
    scope: 'Supports symptom-led bowel, urinary, reproductive, pregnancy and urgent-feature questions for lower abdominal and pelvic concerns.',
    accessedAt: '2026-09-21',
    clinicalReviewStatus: 'source-backed-prototype-pending-clinical-review',
  },
  {
    id: COVERAGE_SOURCE_IDS.nhsEyePain,
    organization: 'National Health Service',
    title: 'Eye pain',
    url: 'https://www.nhs.uk/symptoms/eye-pain/',
    scope: 'Supports questions about pain, redness, light sensitivity, vision change, sudden onset, injury and recent eye treatment.',
    accessedAt: '2026-09-21',
    clinicalReviewStatus: 'source-backed-prototype-pending-clinical-review',
  },
  {
    id: COVERAGE_SOURCE_IDS.nhsEarInfections,
    organization: 'National Health Service',
    title: 'Ear infections',
    url: 'https://www.nhs.uk/conditions/ear-infections/',
    scope: 'Supports symptom questions about ear pain, hearing change, discharge, pressure, surrounding swelling, dizziness and balance change without diagnosing an infection.',
    accessedAt: '2026-09-21',
    clinicalReviewStatus: 'source-backed-prototype-pending-clinical-review',
  },
  {
    id: COVERAGE_SOURCE_IDS.nhsHearingLoss,
    organization: 'National Health Service',
    title: 'Hearing loss',
    url: 'https://www.nhs.uk/conditions/hearing-loss/',
    scope: 'Supports non-diagnostic questions about gradual or sudden hearing change and associated ear pain, discharge, ringing or dizziness.',
    accessedAt: '2026-09-21',
    clinicalReviewStatus: 'source-backed-prototype-pending-clinical-review',
  },
  {
    id: COVERAGE_SOURCE_IDS.nhsTinnitus,
    organization: 'National Health Service',
    title: 'Tinnitus',
    url: 'https://www.nhs.uk/conditions/tinnitus/',
    scope: 'Supports questions about ringing or other sounds, laterality, pattern, pulse timing, sudden hearing change, facial weakness and spinning sensation.',
    accessedAt: '2026-09-21',
    clinicalReviewStatus: 'source-backed-prototype-pending-clinical-review',
  },
  {
    id: COVERAGE_SOURCE_IDS.nhsVertigo,
    organization: 'National Health Service',
    title: 'Vertigo',
    url: 'https://www.nhs.uk/conditions/vertigo/',
    scope: 'Supports questions about spinning, duration, nausea, headache, hearing change, vision change, speech and limb sensation or weakness.',
    accessedAt: '2026-09-21',
    clinicalReviewStatus: 'source-backed-prototype-pending-clinical-review',
  },
  {
    id: COVERAGE_SOURCE_IDS.nhsSinusitis,
    organization: 'National Health Service',
    title: 'Sinusitis (sinus infection)',
    url: 'https://www.nhs.uk/conditions/sinusitis-sinus-infection/',
    scope: 'Supports symptom questions about facial pain or swelling, nasal blockage or discharge, smell change and pressure around the cheeks, eyes, forehead or ears.',
    accessedAt: '2026-09-21',
    clinicalReviewStatus: 'source-backed-prototype-pending-clinical-review',
  },
  {
    id: COVERAGE_SOURCE_IDS.nhsNosebleed,
    organization: 'National Health Service',
    title: 'Nosebleed',
    url: 'https://www.nhs.uk/conditions/nosebleed/',
    scope: 'Supports questions about recurrent or prolonged bleeding, amount, swallowed blood, injury, weakness, dizziness and breathing difficulty.',
    accessedAt: '2026-09-21',
    clinicalReviewStatus: 'source-backed-prototype-pending-clinical-review',
  },
  {
    id: COVERAGE_SOURCE_IDS.nhsMouthUlcers,
    organization: 'National Health Service',
    title: 'Mouth ulcers',
    url: 'https://www.nhs.uk/conditions/mouth-ulcers/',
    scope: 'Supports non-diagnostic questions about mouth pain, sores or changes, bleeding, duration, injury and oral or dental irritation.',
    accessedAt: '2026-09-21',
    clinicalReviewStatus: 'source-backed-prototype-pending-clinical-review',
  },
  {
    id: COVERAGE_SOURCE_IDS.nhsTmd,
    organization: 'National Health Service',
    title: 'Temporomandibular disorder (TMD)',
    url: 'https://www.nhs.uk/conditions/temporomandibular-disorder-tmd/',
    scope: 'Supports questions about jaw, ear or temple pain, movement limitation, locking, chewing relationship, injury and associated head or vision symptoms without inferring a diagnosis.',
    accessedAt: '2026-09-21',
    clinicalReviewStatus: 'source-backed-prototype-pending-clinical-review',
  },
  {
    id: COVERAGE_SOURCE_IDS.nhsStroke,
    organization: 'National Health Service',
    title: 'Symptoms of a stroke',
    url: 'https://www.nhs.uk/conditions/stroke/symptoms/',
    scope: 'Supports evidence-triggered safety questions for sudden facial or one-sided weakness, speech difficulty, numbness and sudden visual loss; location alone never activates this branch.',
    accessedAt: '2026-09-21',
    clinicalReviewStatus: 'source-backed-prototype-pending-clinical-review',
  },
  {
    id: COVERAGE_SOURCE_IDS.nhsChestPain,
    organization: 'National Health Service',
    title: 'Chest pain',
    url: 'https://www.nhs.uk/conditions/chest-pain/',
    scope: 'Supports chest symptom characterization and emergency checks for persistent pain, spread and associated breathlessness or sweating.',
    accessedAt: '2026-09-21',
    clinicalReviewStatus: 'source-backed-prototype-pending-clinical-review',
  },
  {
    id: COVERAGE_SOURCE_IDS.nhsNeckPain,
    organization: 'National Health Service',
    title: 'Neck pain and stiff neck',
    url: 'https://www.nhs.uk/symptoms/neck-pain-and-stiff-neck/',
    scope: 'Supports questions about pain, stiffness, injury, movement and associated arm sensation changes.',
    accessedAt: '2026-09-21',
    clinicalReviewStatus: 'source-backed-prototype-pending-clinical-review',
  },
  {
    id: COVERAGE_SOURCE_IDS.nhsAllergy,
    organization: 'National Health Service',
    title: 'Allergies',
    url: 'https://www.nhs.uk/conditions/allergies/',
    scope: 'Supports skin and swelling questions and emergency checks for sudden mouth, tongue or throat swelling with breathing or swallowing difficulty.',
    accessedAt: '2026-09-21',
    clinicalReviewStatus: 'source-backed-prototype-pending-clinical-review',
  },
  {
    id: COVERAGE_SOURCE_IDS.nhsEarache,
    organization: 'National Health Service',
    title: 'Earache',
    url: 'https://www.nhs.uk/conditions/earache/',
    scope: 'Supports separating locally otologic earache from pain referred from the teeth, jaw or throat, and names the discharge, hearing-change, persistence and recurrence features that warrant clinical review.',
    accessedAt: '2026-09-22',
    clinicalReviewStatus: 'source-backed-prototype-pending-clinical-review',
  },
  {
    id: COVERAGE_SOURCE_IDS.nhsConstipation,
    organization: 'National Health Service',
    title: 'Constipation',
    url: 'https://www.nhs.uk/conditions/constipation/',
    scope: 'Supports stool frequency, consistency, straining and incomplete-emptying questions, and names the persistence, recurrence, rectal bleeding, weight-loss and sudden bowel-habit-change features that warrant clinical review.',
    accessedAt: '2026-09-22',
    clinicalReviewStatus: 'source-backed-prototype-pending-clinical-review',
  },
  {
    id: COVERAGE_SOURCE_IDS.nhsUrinaryTractInfection,
    organization: 'National Health Service',
    title: 'Urinary tract infections (UTIs)',
    url: 'https://www.nhs.uk/conditions/urinary-tract-infections-utis/',
    scope: 'Supports dysuria, frequency, urgency, haematuria and difficulty-passing-urine questions, and names the flank pain and systemic features that indicate possible upper urinary tract involvement.',
    accessedAt: '2026-09-22',
    clinicalReviewStatus: 'source-backed-prototype-pending-clinical-review',
  },
  {
    id: COVERAGE_SOURCE_IDS.nhsHeavyPeriods,
    organization: 'National Health Service',
    title: 'Heavy periods',
    url: 'https://www.nhs.uk/conditions/heavy-periods/',
    scope: 'Supports menstrual-volume and cycle-relationship questions and the referral pathway for bleeding a general practitioner investigates or refers onward.',
    accessedAt: '2026-09-22',
    clinicalReviewStatus: 'source-backed-prototype-pending-clinical-review',
  },
  {
    id: COVERAGE_SOURCE_IDS.nhsAbnormalVaginalBleeding,
    organization: 'National Health Service',
    title: 'Vaginal bleeding between periods or after sex',
    url: 'https://www.nhs.uk/symptoms/vaginal-bleeding-between-periods-or-after-sex/',
    scope: 'Supports intermenstrual and postcoital bleeding questions, states that unusual vaginal bleeding is always checked, and names missed period with unusual bleeding and abdominal pain as an urgent same-day combination.',
    accessedAt: '2026-09-22',
    clinicalReviewStatus: 'source-backed-prototype-pending-clinical-review',
  },
  {
    id: COVERAGE_SOURCE_IDS.whoImci,
    organization: 'World Health Organization',
    title: 'Model IMCI handbook: Integrated Management of Childhood Illness',
    url: 'https://www.who.int/publications/i/item/9241546441',
    scope: 'Supports caregiver wording and under-five danger-sign checks for feeding or drinking, vomiting everything, convulsions and lethargy or unconsciousness.',
    accessedAt: '2026-09-21',
    clinicalReviewStatus: 'source-backed-prototype-pending-clinical-review',
  },
  {
    id: COVERAGE_SOURCE_IDS.niceFeverUnderFive,
    organization: 'National Institute for Health and Care Excellence',
    title: 'Fever in under 5s: assessment and initial management',
    url: 'https://www.nice.org.uk/guidance/ng143/chapter/Recommendations',
    scope: 'Supports caregiver-reported change, poor feeding, reduced activity and immediate escalation for airway, breathing, circulation or consciousness compromise.',
    accessedAt: '2026-09-21',
    clinicalReviewStatus: 'source-backed-prototype-pending-clinical-review',
  },
  {
    id: COVERAGE_SOURCE_IDS.niceMeningitis,
    organization: 'National Institute for Health and Care Excellence',
    title: 'Meningitis (bacterial) and meningococcal disease: recognition, diagnosis and management',
    url: 'https://www.nice.org.uk/guidance/ng240/chapter/recommendations',
    scope: 'Supports escalation for the combined warning pattern of fever, headache, neck stiffness and altered consciousness or cognition.',
    accessedAt: '2026-09-21',
    clinicalReviewStatus: 'source-backed-prototype-pending-clinical-review',
  },
  {
    id: COVERAGE_SOURCE_IDS.nbemsBroad,
    organization: 'National Board of Examinations in Medical Sciences',
    title: 'DNB Broad Specialty disciplines',
    url: 'https://natboard.edu.in/dnbbroad',
    scope: 'Supports current India-facing broad-specialty nomenclature, including General Medicine and Paediatrics.',
    accessedAt: '2026-09-21',
    clinicalReviewStatus: 'source-backed-prototype-pending-clinical-review',
  },
  {
    id: COVERAGE_SOURCE_IDS.nbemsSuper,
    organization: 'National Board of Examinations in Medical Sciences',
    title: 'DrNB Super Specialty disciplines',
    url: 'https://natboard.edu.in/dnbsuper',
    scope: 'Supports specialty taxonomy only; it does not enable direct routing or supply likelihood weights.',
    accessedAt: '2026-09-21',
    clinicalReviewStatus: 'source-backed-prototype-pending-clinical-review',
  },
  /*
    Questionnaire rebuild sources. Each scope states exactly what the page was
    read to support and nothing more. None of them supplies a probability.
  */
  {
    id: COVERAGE_SOURCE_IDS.nhmImnci,
    organization: 'National Health Mission, Ministry of Health and Family Welfare, Government of India',
    title: 'IMNCI Module 5: Assess and Classify the Sick Child Age 2 Months up to 5 Years',
    url: 'https://nhm.gov.in/New-Update-2022-24/CH-Programmes/Pediatric_Care/IMNCI-Resource-Materails/module_5.pdf',
    scope: 'Caregiver-directed assessment order (the child\'s problem, then general danger signs, then main symptoms) and caregiver-observable wording for breathing, diarrhoea duration (14 days or more), blood in stool, ear pain and ear discharge duration (14 days or more). Children under five only; it names no specialty.',
    accessedAt: REBUILD_ACCESSED,
    clinicalReviewStatus: PENDING,
  },
  {
    id: COVERAGE_SOURCE_IDS.nhsSoreThroat,
    organization: 'National Health Service',
    title: 'Sore throat',
    url: 'https://www.nhs.uk/conditions/sore-throat/',
    scope: 'For adults and children: see a GP if a sore throat does not improve after a week, if sore throats are frequent, or if a lump in the mouth or neck lasts more than 3 weeks; a child under 5 who needs help for a sore throat should see a GP. A short sore throat is self-care.',
    accessedAt: REBUILD_ACCESSED,
    clinicalReviewStatus: PENDING,
  },
  {
    id: COVERAGE_SOURCE_IDS.nhsTonsillitis,
    organization: 'National Health Service',
    title: 'Tonsillitis',
    url: 'https://www.nhs.uk/conditions/tonsillitis/',
    scope: 'See a GP if tonsillitis does not go away within a week or throat infections keep coming back; tonsil removal is usually only for severe tonsillitis that keeps coming back.',
    accessedAt: REBUILD_ACCESSED,
    clinicalReviewStatus: PENDING,
  },
  {
    id: COVERAGE_SOURCE_IDS.aomrcTonsillectomy,
    organization: 'Academy of Medical Royal Colleges (Evidence-Based Interventions programme)',
    title: 'Tonsillectomy for recurrent tonsillitis',
    url: 'https://ebi.aomrc.org.uk/interventions/tonsillectomy-for-recurrent-tonsillitis/',
    scope: 'For children and adults: referral is considered for disabling sore throats that prevent normal functioning, at 7 or more in the past year, 5 or more a year for 2 years, or 3 or more a year for 3 years.',
    accessedAt: REBUILD_ACCESSED,
    clinicalReviewStatus: PENDING,
  },
  {
    id: COVERAGE_SOURCE_IDS.nhsLaryngitis,
    organization: 'National Health Service',
    title: 'Laryngitis',
    url: 'https://www.nhs.uk/conditions/laryngitis/',
    scope: 'See a GP if voice symptoms do not improve after 2 weeks or voice problems keep coming back.',
    accessedAt: REBUILD_ACCESSED,
    clinicalReviewStatus: PENDING,
  },
  {
    id: COVERAGE_SOURCE_IDS.nhsDysphagia,
    organization: 'National Health Service',
    title: 'Swallowing problems (dysphagia)',
    url: 'https://www.nhs.uk/conditions/swallowing-problems-dysphagia/',
    scope: 'Difficulty swallowing, coughing or choking when eating, or a feeling of something stuck in the throat warrants an urgent GP appointment; child-specific feeding signs are named.',
    accessedAt: REBUILD_ACCESSED,
    clinicalReviewStatus: PENDING,
  },
  {
    id: COVERAGE_SOURCE_IDS.nhsLumps,
    organization: 'National Health Service',
    title: 'Lumps',
    url: 'https://www.nhs.uk/conditions/lumps/',
    scope: 'See a GP about a lump that lasts more than 2 weeks, gets bigger, is hard, or a neck swelling that does not go down within 2 weeks.',
    accessedAt: REBUILD_ACCESSED,
    clinicalReviewStatus: PENDING,
  },
  {
    id: COVERAGE_SOURCE_IDS.niceSuspectedCancer,
    organization: 'National Institute for Health and Care Excellence',
    title: 'Suspected cancer: recognition and referral (NG12)',
    url: 'https://www.nice.org.uk/guidance/ng12/chapter/Recommendations-organised-by-site-of-cancer',
    scope: 'Persistent unexplained hoarseness or an unexplained neck lump (age 45 and over) and a pigmented skin lesion that changes in size, shape or colour are recognised referral features. Read directly on 2026-10-08: 1.4.1 refer a breast lump at 30 and over on a suspected cancer pathway, 1.4.2 consider it for breast skin changes or an armpit lump at 30 and over, 1.4.3 non-urgent referral under 30; 1.8.2 consider a suspected cancer pathway for oral ulceration lasting more than 3 weeks or a persistent unexplained neck lump; 1.8.3 urgent dentist assessment for a lump on the lip or in the mouth or a red or white patch; 1.8.5 an unexplained thyroid lump; 1.11.4 urgent direct-access ultrasound for an unexplained lump increasing in size in an adult. Used only as persistence, change and referral-priority criteria; nothing here suggests or names a cancer.',
    accessedAt: REBUILD_ACCESSED,
    clinicalReviewStatus: PENDING,
  },
  {
    id: COVERAGE_SOURCE_IDS.niceChildConstipation,
    organization: 'National Institute for Health and Care Excellence',
    title: 'Constipation in children and young people: diagnosis and management (CG99)',
    url: 'https://www.nice.org.uk/guidance/cg99/chapter/Recommendations',
    scope: 'Chronic constipation lasts longer than 8 weeks; children who do not respond to treatment within 3 months, or who have red flags such as symptoms from birth, leg weakness or tummy swelling with vomiting, are referred to a practitioner with paediatric expertise. Names no adult specialty.',
    accessedAt: REBUILD_ACCESSED,
    clinicalReviewStatus: PENDING,
  },
  {
    id: COVERAGE_SOURCE_IDS.niceChildUti,
    organization: 'National Institute for Health and Care Excellence',
    title: 'Urinary tract infection in under 16s: diagnosis and management (NG224)',
    url: 'https://www.nice.org.uk/guidance/ng224/chapter/Recommendations',
    scope: 'Babies and children with recurrent urinary infection are referred for assessment by a paediatric specialist, not an adult urology service.',
    accessedAt: REBUILD_ACCESSED,
    clinicalReviewStatus: PENDING,
  },
  {
    id: COVERAGE_SOURCE_IDS.niceChildEczema,
    organization: 'National Institute for Health and Care Excellence',
    title: 'Atopic eczema in under 12s: diagnosis and management (CG57)',
    url: 'https://www.nice.org.uk/guidance/cg57/chapter/1-Guidance',
    scope: 'A child\'s skin condition is referred for specialist dermatological advice when management has not controlled it, it keeps flaring, facial involvement has not responded, or it causes significant sleep, school or psychological impact.',
    accessedAt: REBUILD_ACCESSED,
    clinicalReviewStatus: PENDING,
  },
  {
    id: COVERAGE_SOURCE_IDS.nicePsoriasis,
    organization: 'National Institute for Health and Care Excellence',
    title: 'Psoriasis: assessment and management (CG153)',
    url: 'https://www.nice.org.uk/guidance/cg153/chapter/Recommendations',
    scope: 'Refer for dermatology specialist advice where there is diagnostic uncertainty, extensive involvement, no control with topical treatment, or a major impact on wellbeing; children are referred at presentation.',
    accessedAt: REBUILD_ACCESSED,
    clinicalReviewStatus: PENDING,
  },
  {
    id: COVERAGE_SOURCE_IDS.nhsMoles,
    organization: 'National Health Service',
    title: 'Moles',
    url: 'https://www.nhs.uk/conditions/moles/',
    scope: 'A mole that changes size, shape or colour, bleeds, itches or becomes crusty, or a new mark that has not gone after a few weeks, should be seen; suspected concerns are referred to a hospital specialist.',
    accessedAt: REBUILD_ACCESSED,
    clinicalReviewStatus: PENDING,
  },
  {
    id: COVERAGE_SOURCE_IDS.nhsJointPain,
    organization: 'National Health Service',
    title: 'Joint pain',
    url: 'https://www.nhs.uk/symptoms/joint-pain/',
    scope: 'See a GP if joint pain stops normal activities or sleep, keeps coming back, or lasts beyond two weeks of home treatment, and for any joint problem in a child.',
    accessedAt: REBUILD_ACCESSED,
    clinicalReviewStatus: PENDING,
  },
  {
    id: COVERAGE_SOURCE_IDS.nhsKneePain,
    organization: 'National Health Service',
    title: 'Knee pain',
    url: 'https://www.nhs.uk/symptoms/knee-pain/',
    scope: 'A knee that locks, gives way or painfully clicks, cannot bear weight or is badly swollen needs urgent advice; pain not improving within a few weeks is seen and may be referred for a scan or specialist treatment. An unstable knee after an injury, with a popping sound at the time, is listed with ligament, tendon, meniscus or cartilage damage.',
    accessedAt: REBUILD_ACCESSED,
    clinicalReviewStatus: PENDING,
  },
  {
    id: COVERAGE_SOURCE_IDS.nhsShoulderPain,
    organization: 'National Health Service',
    title: 'Shoulder pain',
    url: 'https://www.nhs.uk/symptoms/shoulder-pain/',
    scope: 'Lists pain and stiffness that does not go away over months, pain worse while using the arm or shoulder, a tingling, numb or weak arm with a clicking or locking shoulder, and pain on top of the shoulder where the collarbone meets it. See a GP if it is getting worse or does not improve after 2 weeks; urgent if sudden or very bad pain, cannot move the arm, changed shape or badly swollen, pins and needles, numbness or a high temperature.',
    accessedAt: INTELLIGENCE_PASS_ACCESSED,
    clinicalReviewStatus: PENDING,
  },
  {
    id: COVERAGE_SOURCE_IDS.nhsHipPain,
    organization: 'National Health Service',
    title: 'Hip pain in adults',
    url: 'https://www.nhs.uk/symptoms/hip-pain/',
    scope: 'Lists pain worse when walking with stiffness after moving, pain and stiffness worse after not moving, pain spreading to the thigh worse lying on it, and a hot swollen hip with a high temperature. See a GP if it stops normal activities or sleep, is getting worse or keeps coming back, has not improved after 2 weeks of home treatment, or stiffness lasts more than 30 minutes after waking; urgent if a hot swollen hip, changed skin colour or feeling unwell with a high temperature.',
    accessedAt: INTELLIGENCE_PASS_ACCESSED,
    clinicalReviewStatus: PENDING,
  },
  {
    id: COVERAGE_SOURCE_IDS.nhsElbowArmPain,
    organization: 'National Health Service',
    title: 'Elbow and arm pain',
    url: 'https://www.nhs.uk/symptoms/elbow-and-arm-pain/',
    scope: 'Lists pain on the outside of the elbow with difficulty fully straightening the arm, joint pain with stiffness and swelling, pain and stiffness coming down from the shoulder, and a swollen joint with a high temperature. See a GP if it does not go away after a few weeks; 111 if the arm hurts on exercise and eases with rest, or is swollen with a very high temperature; A&E if it tingles or feels numb.',
    accessedAt: INTELLIGENCE_PASS_ACCESSED,
    clinicalReviewStatus: PENDING,
  },
  {
    id: COVERAGE_SOURCE_IDS.nhsWristPain,
    organization: 'National Health Service',
    title: 'Wrist pain',
    url: 'https://www.nhs.uk/symptoms/hand-pain/wrist-pain/',
    scope: 'Lists aching worse at night with tingling, numbness or pins and needles, pain, swelling and stiffness at the base of the thumb that lasts a long time, a smooth lump on top of the wrist, and difficulty moving the wrist or gripping. See a GP if it stops normal activities, gets worse, has not improved after 2 weeks of home treatment, or comes with tingling or loss of sensation.',
    accessedAt: INTELLIGENCE_PASS_ACCESSED,
    clinicalReviewStatus: PENDING,
  },
  {
    id: COVERAGE_SOURCE_IDS.nhsHeelPain,
    organization: 'National Health Service',
    title: 'Heel pain',
    url: 'https://www.nhs.uk/symptoms/foot-pain/heel-pain/',
    scope: 'Lists sharp pain between the arch and heel that is worse on starting to walk and better with rest, pain at the back of the heel and in the ankle and calf, and redness and swelling with a dull ache. See a GP if severe or stopping normal activities, getting worse or coming back, not improved after 2 weeks of home treatment, with tingling or loss of sensation in the foot, or with diabetes.',
    accessedAt: INTELLIGENCE_PASS_ACCESSED,
    clinicalReviewStatus: PENDING,
  },
  {
    id: COVERAGE_SOURCE_IDS.nhsAnklePain,
    organization: 'National Health Service',
    title: 'Ankle pain',
    url: 'https://www.nhs.uk/symptoms/foot-pain/ankle-pain/',
    scope: 'Lists pain, swelling and bruising after exercise, pain in the ankle and heel with calf pain on tiptoe, and redness and swelling with a dull ache. See a GP if it stops normal activities, has not improved after 2 weeks of home treatment, or comes with tingling or numbness; 111 for severe pain, an ankle at an odd angle or not being able to walk.',
    accessedAt: INTELLIGENCE_PASS_ACCESSED,
    clinicalReviewStatus: PENDING,
  },
  {
    id: COVERAGE_SOURCE_IDS.nhsDvt,
    organization: 'National Health Service',
    title: 'Deep vein thrombosis (DVT)',
    url: 'https://www.nhs.uk/conditions/deep-vein-thrombosis-dvt/',
    scope: 'Symptoms are throbbing pain and swelling in 1 leg (rarely both), usually in the calf or thigh, with red, blue or darkened skin around the painful area. Ask for an urgent GP appointment or get help from 111 if you think you have DVT; call 999 or go to A&E with DVT symptoms and shortness of breath or chest pain.',
    accessedAt: INTELLIGENCE_PASS_ACCESSED,
    clinicalReviewStatus: PENDING,
  },
  {
    id: COVERAGE_SOURCE_IDS.nhsVaricoseVeins,
    organization: 'National Health Service',
    title: 'Varicose veins',
    url: 'https://www.nhs.uk/conditions/varicose-veins/',
    scope: 'Symptoms include pain, aching or heaviness, skin changes such as itching, colour change or dry scaly skin, and swollen ankles or legs. See a GP for pain, itching or swelling in the legs or a sore on the leg not healed after 2 weeks; urgent GP or 111 for varicose veins that are bleeding.',
    accessedAt: INTELLIGENCE_PASS_ACCESSED,
    clinicalReviewStatus: PENDING,
  },
  {
    id: COVERAGE_SOURCE_IDS.niceVaricoseVeins,
    organization: 'National Institute for Health and Care Excellence',
    title: 'Varicose veins: diagnosis and management (CG168), recommendations 1.2.1 and 1.2.2',
    url: 'https://www.nice.org.uk/guidance/cg168/chapter/Recommendations',
    scope: '1.2.1 Refer people with bleeding varicose veins to a vascular service immediately. 1.2.2 Refer to a vascular service: symptomatic primary or recurrent varicose veins (with troublesome symptoms, typically pain, aching, discomfort, swelling, heaviness and itching); lower-limb skin changes such as pigmentation or eczema thought to be caused by chronic venous insufficiency; superficial vein thrombosis (hard, painful veins); a venous leg ulcer (a break in the skin below the knee not healed within 2 weeks); a healed venous leg ulcer.',
    accessedAt: INTELLIGENCE_PASS_ACCESSED,
    clinicalReviewStatus: PENDING,
  },
  {
    id: COVERAGE_SOURCE_IDS.nhsHernia,
    organization: 'National Health Service',
    title: 'Hernia',
    url: 'https://www.nhs.uk/conditions/hernia/',
    scope: 'Symptoms include a bulge or lump that may get bigger when you cough, sneeze or cry and smaller when you lie down, tight and stretched skin over it, a heavy dragging feeling, and pain in or around it. See a GP if you think you have a hernia; they can refer for tests or treatment. Get help from 111 with a hernia and pain in or around it, a bloated tummy, feeling or being sick, vomiting blood, constipation, a high temperature or sudden confusion.',
    accessedAt: INTELLIGENCE_PASS_ACCESSED,
    clinicalReviewStatus: PENDING,
  },
  {
    id: COVERAGE_SOURCE_IDS.nhsBreastLump,
    organization: 'National Health Service',
    title: 'Breast lumps',
    url: 'https://www.nhs.uk/conditions/breast-lump/',
    scope: 'See a GP (non-urgent) for a lump in the breast or armpit, or other unusual changes such as a nipple turning inwards, dimpled skin or bloodstained nipple discharge; if the cause is unclear they refer to a hospital or breast clinic for tests.',
    accessedAt: INTELLIGENCE_PASS_ACCESSED,
    clinicalReviewStatus: PENDING,
  },
  {
    id: COVERAGE_SOURCE_IDS.nhsGiantCellArteritis,
    organization: 'National Health Service',
    title: 'Giant cell arteritis (temporal arteritis)',
    url: 'https://www.nhs.uk/conditions/giant-cell-arteritis/',
    scope: 'Main symptoms are frequent severe headaches, pain or tenderness at the temples or on the scalp, jaw pain while eating or talking, and vision problems such as double vision or loss of vision. Ask for an urgent GP appointment or get help from 111 if you think you might have it; it can lead to stroke and blindness if not treated quickly.',
    accessedAt: INTELLIGENCE_PASS_ACCESSED,
    clinicalReviewStatus: PENDING,
  },
  {
    id: COVERAGE_SOURCE_IDS.nhsMouthCancer,
    organization: 'National Health Service',
    title: 'Mouth cancer: symptoms',
    url: 'https://www.nhs.uk/conditions/mouth-cancer/symptoms/',
    scope: 'See a GP or dentist for a mouth ulcer that has lasted more than 3 weeks, a lump in the mouth, on the lip, on the neck or in the throat, a red or white patch in the mouth, mouth pain that is not going away, difficulty swallowing or speaking, or a hoarse voice that does not go away.',
    accessedAt: INTELLIGENCE_PASS_ACCESSED,
    clinicalReviewStatus: PENDING,
  },
  {
    id: COVERAGE_SOURCE_IDS.nhsCarpalTunnel,
    organization: 'National Health Service',
    title: 'Carpal tunnel syndrome',
    url: 'https://www.nhs.uk/conditions/carpal-tunnel-syndrome/',
    scope: 'An ache or pain in the fingers, hand or arm with tingling or pins and needles, usually worse at night. See a GP if symptoms are getting worse or not going away, or home treatment is not working; a specialist is seen if it is getting worse and other treatments have not worked.',
    accessedAt: INTELLIGENCE_PASS_ACCESSED,
    clinicalReviewStatus: PENDING,
  },
  {
    id: COVERAGE_SOURCE_IDS.nhsPeripheralNeuropathy,
    organization: 'National Health Service',
    title: 'Peripheral neuropathy',
    url: 'https://www.nhs.uk/conditions/peripheral-neuropathy/',
    scope: 'Numbness and tingling in the feet or hands, burning, stabbing or shooting pain, loss of balance and weakness. See a GP for pain, tingling or loss of sensation in the feet, or loss of balance or weakness; people with diabetes have regular checks.',
    accessedAt: INTELLIGENCE_PASS_ACCESSED,
    clinicalReviewStatus: PENDING,
  },
  {
    id: COVERAGE_SOURCE_IDS.nhsCellulitis,
    organization: 'National Health Service',
    title: 'Cellulitis',
    url: 'https://www.nhs.uk/conditions/cellulitis/',
    scope: 'Skin that is painful, hot and swollen, usually red. Ask for an urgent GP appointment or get help from 111 if your skin is painful, hot and swollen; call 999 or go to A&E with a very high temperature or feeling hot, cold or shivery, a fast heartbeat or fast breathing, purple patches, feeling dizzy or faint, confusion, or cold, clammy or pale skin.',
    accessedAt: INTELLIGENCE_PASS_ACCESSED,
    clinicalReviewStatus: PENDING,
  },
  {
    id: COVERAGE_SOURCE_IDS.nhsHeadInjury,
    organization: 'National Health Service',
    title: 'Head injury and concussion',
    url: 'https://www.nhs.uk/conditions/head-injury-and-concussion/',
    scope: 'Call 999 after a head injury if knocked out and not woken, cannot stay awake, a fit, a fall from more than 1 metre or 5 stairs, vision or hearing problems, a black eye without hitting the eye, clear fluid from the ears or nose, bleeding from the ears or bruising behind them, new numbness or weakness, problems walking, balancing, understanding, speaking or writing, a high-speed injury, a dent or something in a head wound, a bruise, swelling or large cut on the head under 1 year old, or a change in behaviour. Get help from 111 if being sick, dizzy, taking a blood thinner, or drinking alcohol or taking drugs at the time.',
    accessedAt: PHASE3_ACCESSED,
    clinicalReviewStatus: PENDING,
  },
  {
    id: COVERAGE_SOURCE_IDS.nhsBrokenNose,
    organization: 'National Health Service',
    title: 'Broken nose',
    url: 'https://www.nhs.uk/conditions/broken-nose/',
    scope: 'Symptoms: pain, swelling and bruising, a crunching or crackling sound when touched, difficulty breathing through the nose, the nose changing shape. Get help from 111 if the nose is crooked after the injury, the swelling has not started to go down after 3 days, painkillers are not helping, it is still hard to breathe through the nose after the swelling has gone, there are regular nosebleeds, or a very high temperature or feeling hot, cold or shivery. Call 999 or go to A&E for a nosebleed that will not stop, a large cut or open wound on the nose or face or something in the wound, clear watery fluid from the nose, a severe headache with blurred or double vision, eye pain and double vision, neck pain or a stiff neck with numbness or tingling in the arms, a purple swelling inside the nose, or other signs of a severe head injury.',
    accessedAt: PHASE3_ACCESSED,
    clinicalReviewStatus: PENDING,
  },
  {
    id: COVERAGE_SOURCE_IDS.nhsWhiplash,
    organization: 'National Health Service',
    title: 'Whiplash',
    url: 'https://www.nhs.uk/conditions/whiplash/',
    scope: 'Symptoms: neck pain, stiffness and difficulty moving the head, headaches, pain and spasms in the shoulders and arms. GP if not improved after 1 week or painkillers have not worked. Urgent GP or 111 for severe pain despite painkillers, tingling or pins and needles on one or both sides of the body, problems walking or sitting upright, a sudden electric-shock feeling in the neck and back, or weak hands, arms or legs.',
    accessedAt: PHASE3_ACCESSED,
    clinicalReviewStatus: PENDING,
  },
  {
    id: COVERAGE_SOURCE_IDS.nhsFalls,
    organization: 'National Health Service',
    title: 'Falls',
    url: 'https://www.nhs.uk/conditions/falls/',
    scope: 'See a GP if you have had a fall or are worried about your balance or mobility; a GP may refer you to a specialist falls service. Get help from 111 if someone has fallen and may be in pain, injured or unwell. Call 999 if someone has fallen and may have injured the head, back, neck or hip, or cannot get up.',
    accessedAt: PHASE4_ACCESSED,
    clinicalReviewStatus: PENDING,
  },
  {
    id: COVERAGE_SOURCE_IDS.niceFalls,
    organization: 'National Institute for Health and Care Excellence',
    title: 'Falls: assessment and prevention in older people and in people 50 and over at higher risk (NG249)',
    url: 'https://www.nice.org.uk/guidance/ng249',
    scope: 'Covers people aged 65 and over (and 50 to 64 at higher risk). Recommendation 1.1.3: offer a comprehensive falls assessment to people who have fallen in the last year and are living with frailty, were injured in a fall and needed medical treatment, lost consciousness in a fall, were unable to get up independently after a fall, or have had 2 or more falls in the last year. The recommendations page itself could not be opened directly; the 1.1.3 wording was taken from secondary reproductions and the archived guideline page, and must be checked against NICE before clinical use.',
    accessedAt: PHASE4_ACCESSED,
    clinicalReviewStatus: PENDING,
  },
  {
    id: COVERAGE_SOURCE_IDS.nhsBlackEye,
    organization: 'National Health Service',
    title: 'Black eye',
    url: 'https://www.nhs.uk/conditions/black-eye/',
    scope: 'See a GP if a black eye does not go away within 3 weeks. Urgent GP or 111 for a headache that does not go away or blurry vision, warmth or pus around the eye, a very high temperature or feeling hot, cold or shivery, blood-thinning medicine, or a bleeding disorder. Go to A&E for blood in the eye, an irregularly shaped pupil, bruising around both eyes after a blow to the head, losing consciousness or being sick after a blow to the head, vision problems (double vision, loss of vision, flashing lights, halos or shadows, pain looking at bright light), or an eye that cannot move.',
    accessedAt: PHASE4_ACCESSED,
    clinicalReviewStatus: PENDING,
  },
  {
    id: COVERAGE_SOURCE_IDS.nhsBrokenTooth,
    organization: 'National Health Service',
    title: 'Broken or knocked-out tooth',
    url: 'https://www.nhs.uk/conditions/broken-or-knocked-out-tooth/',
    scope: 'See a dentist if you or your child has chipped, cracked or broken a tooth; for urgent dental treatment call a dentist, or 111 if you cannot get an emergency appointment.',
    accessedAt: PHASE4_ACCESSED,
    clinicalReviewStatus: PENDING,
  },
  {
    id: COVERAGE_SOURCE_IDS.nhsNasalPolyps,
    organization: 'National Health Service',
    title: 'Nasal polyps',
    url: 'https://www.nhs.uk/conditions/nasal-polyps/',
    scope: 'Symptoms: a blocked nose, a runny nose, postnasal drip, a reduced sense of smell or taste, snoring. See a GP if you think you may have nasal polyps, have difficulty breathing, symptoms are getting worse or you notice changes to your sense of smell.',
    accessedAt: PHASE4_ACCESSED,
    clinicalReviewStatus: PENDING,
  },
  {
    id: COVERAGE_SOURCE_IDS.nhsBellsPalsy,
    organization: 'National Health Service',
    title: "Bell's palsy",
    url: 'https://www.nhs.uk/conditions/bells-palsy/',
    scope: "Symptoms: weakness on 1 side of the face, usually over a few days; a drooping eyelid or corner of the mouth; drooling; a dry mouth; loss of taste; a dry or watering eye. Call 999 if a face droops on 1 side, a person cannot lift both arms, or has difficulty speaking (possible stroke). Urgent GP or 111 if you have symptoms of Bell's palsy.",
    accessedAt: PHASE4_ACCESSED,
    clinicalReviewStatus: PENDING,
  },
  {
    id: COVERAGE_SOURCE_IDS.nhsProstateEnlargement,
    organization: 'National Health Service',
    title: 'Enlarged prostate',
    url: 'https://www.nhs.uk/conditions/prostate-enlargement/',
    scope: 'Difficulty starting to pee or having to strain, a weak or stop-start flow, feeling the bladder has not fully emptied, dribbling afterwards, and needing to pee more often or urgently, including at night. See a GP for difficulty peeing or needing to pee more often; urgent for blood in the pee, pain when peeing or not being able to pee.',
    accessedAt: INTELLIGENCE_PASS_ACCESSED,
    clinicalReviewStatus: PENDING,
  },
  {
    id: COVERAGE_SOURCE_IDS.nhsToothache,
    organization: 'National Health Service',
    title: 'Toothache',
    url: 'https://www.nhs.uk/conditions/toothache/',
    scope: 'See a dentist for toothache that lasts more than 2 days or does not go away with painkillers, or with a high temperature, pain when biting, red gums, a bad taste, or a swollen cheek or jaw. Swelling around the eye or neck, or swelling making it hard to breathe, swallow or speak, is an A&E or 999 emergency.',
    accessedAt: INTELLIGENCE_PASS_ACCESSED,
    clinicalReviewStatus: PENDING,
  },
  {
    id: COVERAGE_SOURCE_IDS.nhsDentalAbscess,
    organization: 'National Health Service',
    title: 'Dental abscess',
    url: 'https://www.nhs.uk/conditions/dental-abscess/',
    scope: 'Lists intense tooth or gum pain, sensitivity to hot or cold, a bad taste, a swollen face or jaw and a high temperature; ask for an urgent dentist appointment. A swollen or painful eye, a lot of swelling in the mouth, or being hard to breathe, speak, swallow or open the mouth is a 999 or A&E emergency. A GP surgery cannot provide dental care.',
    accessedAt: INTELLIGENCE_PASS_ACCESSED,
    clinicalReviewStatus: PENDING,
  },
  {
    id: COVERAGE_SOURCE_IDS.nhsGumDisease,
    organization: 'National Health Service',
    title: 'Gum disease',
    url: 'https://www.nhs.uk/conditions/gum-disease/',
    scope: 'See a dentist for gums that bleed when brushing or are painful and swollen; urgently for very sore and swollen gums or teeth becoming loose.',
    accessedAt: INTELLIGENCE_PASS_ACCESSED,
    clinicalReviewStatus: PENDING,
  },
  {
    id: COVERAGE_SOURCE_IDS.niceRheumatoidArthritis,
    organization: 'National Institute for Health and Care Excellence',
    title: 'Rheumatoid arthritis in adults: management (NG100), recommendation 1.1.1',
    url: 'https://www.nice.org.uk/guidance/ng100/chapter/Recommendations',
    scope: 'Refer any adult with suspected persistent synovitis of undetermined cause for specialist opinion; refer urgently if the small joints of the hands or feet are affected, more than one joint is affected, or there has been a delay of 3 months or longer between onset and seeking advice.',
    accessedAt: INTELLIGENCE_PASS_ACCESSED,
    clinicalReviewStatus: PENDING,
  },
  {
    id: COVERAGE_SOURCE_IDS.nhsRheumatoidArthritis,
    organization: 'National Health Service',
    title: 'Rheumatoid arthritis: symptoms',
    url: 'https://www.nhs.uk/conditions/rheumatoid-arthritis/symptoms/',
    scope: 'Affected joints swell and become hot and tender; stiffness is worse in the morning and usually lasts longer than 30 minutes; the small joints of the hands and feet are often affected first, usually on both sides.',
    accessedAt: INTELLIGENCE_PASS_ACCESSED,
    clinicalReviewStatus: PENDING,
  },
  {
    id: COVERAGE_SOURCE_IDS.nhsSprains,
    organization: 'National Health Service',
    title: 'Sprains and strains',
    url: 'https://www.nhs.uk/conditions/sprains-and-strains/',
    scope: 'An injury that is getting worse or not improving with self-care should be seen; increasing swelling or bruising and marked stiffness need urgent advice.',
    accessedAt: REBUILD_ACCESSED,
    clinicalReviewStatus: PENDING,
  },
  {
    id: COVERAGE_SOURCE_IDS.nhsChildHeadache,
    organization: 'National Health Service',
    title: 'Headaches in children',
    url: 'https://www.nhs.uk/conditions/headaches-in-children/',
    scope: 'Separates regular headaches (see a GP) from a headache that is worsening, wakes the child, comes with vomiting or vision problems, or is triggered by coughing or exercise (urgent), and names emergency features. Names no specialist referral.',
    accessedAt: REBUILD_ACCESSED,
    clinicalReviewStatus: PENDING,
  },
  {
    id: COVERAGE_SOURCE_IDS.nhsDiarrhoeaVomiting,
    organization: 'National Health Service',
    title: 'Diarrhoea and vomiting',
    url: 'https://www.nhs.uk/conditions/diarrhoea-and-vomiting/',
    scope: 'Diarrhoea for more than 7 days or vomiting for more than 2 days, dehydration, blood in diarrhoea and being unable to keep fluids down need advice; child-specific dehydration signs are named.',
    accessedAt: REBUILD_ACCESSED,
    clinicalReviewStatus: PENDING,
  },
  {
    id: COVERAGE_SOURCE_IDS.nhsSquint,
    organization: 'National Health Service',
    title: 'Squint',
    url: 'https://www.nhs.uk/conditions/squint/',
    scope: 'A child with a squint all the time, or one that comes and goes after 3 months of age, is referred to an eye specialist.',
    accessedAt: REBUILD_ACCESSED,
    clinicalReviewStatus: PENDING,
  },
  {
    id: COVERAGE_SOURCE_IDS.nhsRectalBleeding,
    organization: 'National Health Service',
    title: 'Bleeding from the bottom (rectal bleeding)',
    url: 'https://www.nhs.uk/conditions/bleeding-from-the-bottom-rectal-bleeding/',
    scope: 'Blood in the poo for 3 weeks, or poo that has been softer, thinner or longer than normal for 3 weeks, is a reason to see a GP; it separates that routine level from the urgent and emergency levels R3 screens. Page last reviewed 12 April 2023.',
    accessedAt: NORMALIZATION_ACCESSED,
    clinicalReviewStatus: PENDING,
  },
  {
    id: COVERAGE_SOURCE_IDS.nhsBowelCancerSymptoms,
    organization: 'National Health Service',
    title: 'Symptoms of bowel cancer',
    url: 'https://www.nhs.uk/conditions/bowel-cancer/symptoms/',
    scope: 'Names a change in poo that is not usual, blood in the poo, often feeling the need to poo, weight loss without trying, and tiredness or breathlessness as symptoms to see a GP about. Used to characterize a reported habit change or weight loss; it names no specialist referral route. Page last reviewed 4 September 2026.',
    accessedAt: NORMALIZATION_ACCESSED,
    clinicalReviewStatus: PENDING,
  },
  {
    id: COVERAGE_SOURCE_IDS.nhsPinsAndNeedles,
    organization: 'National Health Service',
    title: 'Pins and needles',
    url: 'https://www.nhs.uk/conditions/pins-and-needles/',
    scope: 'Pins and needles that are constant or keep coming back are a reason to see a GP. Names no specialist referral route. Page last reviewed 4 January 2024.',
    accessedAt: NORMALIZATION_ACCESSED,
    clinicalReviewStatus: PENDING,
  },
  {
    id: COVERAGE_SOURCE_IDS.nhsTrigeminalNeuralgia,
    organization: 'National Health Service',
    title: 'Trigeminal neuralgia',
    url: 'https://www.nhs.uk/conditions/trigeminal-neuralgia/',
    scope: 'Frequent or persistent facial pain not helped by ordinary painkillers, once a dentist has ruled out dental causes, is a reason to see a GP. Names no specialist referral route. Page last reviewed 27 January 2023.',
    accessedAt: NORMALIZATION_ACCESSED,
    clinicalReviewStatus: PENDING,
  },
  {
    id: COVERAGE_SOURCE_IDS.nhsShingles,
    organization: 'National Health Service',
    title: 'Shingles',
    url: 'https://www.nhs.uk/conditions/shingles/',
    scope: 'A tingling or painful feeling in an area of skin can come before a shingles rash; a rash on the eye or nose, or vision change, needs an urgent appointment. Page last reviewed 23 November 2023.',
    accessedAt: NORMALIZATION_ACCESSED,
    clinicalReviewStatus: PENDING,
  },
  /*
    Routing reconciliation sources. Each was read on 2026-09-25 for exactly the
    criterion it is cited for. None supplies a probability.
  */
  {
    id: COVERAGE_SOURCE_IDS.nhsAngina,
    organization: 'National Health Service',
    title: 'Angina',
    url: 'https://www.nhs.uk/conditions/angina/',
    scope: 'Angina is pain in the chest, neck, shoulders, jaw or arms, felt as tightness, squeezing, pressure or a dull ache, often brought on by physical activity, emotional stress or cold weather and settling with rest. "If a GP thinks you may have angina, you\'ll be referred to a heart specialist (cardiologist)." Pain that does not stop with rest, or spreads to the arm, neck, jaw or back, is an emergency. Page last reviewed 18 March 2025.',
    accessedAt: RECONCILIATION_ACCESSED,
    clinicalReviewStatus: PENDING,
  },
  {
    id: COVERAGE_SOURCE_IDS.niceStableChestPain,
    organization: 'National Institute for Health and Care Excellence',
    title: 'Recent-onset chest pain of suspected cardiac origin: assessment and diagnosis (CG95)',
    url: 'https://www.nice.org.uk/guidance/cg95/chapter/Recommendations',
    scope: 'Recommendation 1.3.3.1: anginal pain is constricting discomfort in the front of the chest, or in the neck, shoulders, jaw or arms; precipitated by physical exertion; relieved by rest or GTN within about 5 minutes. Three features are typical angina, two atypical, one or none non-anginal. Recommendation 1.3.3.5: pain that is continuous or very prolonged, unrelated to activity, brought on by breathing in, or associated with dizziness, palpitations, tingling or difficulty swallowing makes stable angina unlikely; consider gastrointestinal or musculoskeletal causes.',
    accessedAt: RECONCILIATION_ACCESSED,
    clinicalReviewStatus: PENDING,
  },
  {
    id: COVERAGE_SOURCE_IDS.nhsPalpitations,
    organization: 'National Health Service',
    title: 'Heart palpitations',
    url: 'https://www.nhs.uk/conditions/heart-palpitations/',
    scope: 'See a GP if palpitations keep coming back or happen more often, last more than a few minutes, or come with an existing heart condition or a family history of heart problems; you may be referred to a heart specialist (cardiologist) for tests. Call 999 if palpitations do not go away, or come with chest pain, shortness of breath, or feeling faint or fainting. Page last reviewed 17 March 2026.',
    accessedAt: RECONCILIATION_ACCESSED,
    clinicalReviewStatus: PENDING,
  },
  {
    id: COVERAGE_SOURCE_IDS.nhsHeartburn,
    organization: 'National Health Service',
    title: 'Heartburn and acid reflux',
    url: 'https://www.nhs.uk/conditions/heartburn-and-acid-reflux/',
    scope: 'See a GP if lifestyle changes and pharmacy medicines are not helping, you have heartburn most days, or you also have food getting stuck in your throat, frequently being sick, or losing weight for no reason. A GP may refer you to a specialist for tests such as a gastroscopy. Page last reviewed 20 November 2023.',
    accessedAt: RECONCILIATION_ACCESSED,
    clinicalReviewStatus: PENDING,
  },
  {
    id: COVERAGE_SOURCE_IDS.nhsIndigestion,
    organization: 'National Health Service',
    title: 'Indigestion',
    url: 'https://www.nhs.uk/conditions/indigestion/',
    scope: 'See a GP if you keep getting indigestion, are in severe pain, have lost a lot of weight without meaning to, have difficulty swallowing, keep being sick, have iron deficiency anaemia, feel a lump in your stomach, or have bloody vomit or poo. Page last reviewed 5 May 2023.',
    accessedAt: RECONCILIATION_ACCESSED,
    clinicalReviewStatus: PENDING,
  },
  {
    id: COVERAGE_SOURCE_IDS.niceNeurologicalReferral,
    organization: 'National Institute for Health and Care Excellence',
    title: 'Suspected neurological conditions: recognition and referral (NG127)',
    url: 'https://www.nice.org.uk/guidance/ng127/chapter/Recommendations',
    scope: 'Adults only. 1.7.5: slowly (weeks to months) progressive limb or neck weakness is referred for neuromuscular assessment. 1.7.2 and 1.10.2: rapidly progressive symmetrical weakness, or numbness and weakness or imbalance, is referred immediately. 1.3.2: unilateral facial pain triggered by touching the face and refractory to treatment is referred. 1.10.13: recurrent tingling present on waking and lasting under 10 minutes is not routinely referred. 1.10.6: persistent distal altered sensation is investigated with blood tests before neurological referral. 1.7.11: an uncomplicated Bell\'s palsy is not routinely referred. 1.7.3: severe low back pain radiating into the leg with new bladder, bowel or sexual disturbance or perineal numbness is referred immediately.',
    accessedAt: RECONCILIATION_ACCESSED,
    clinicalReviewStatus: PENDING,
  },
  {
    id: COVERAGE_SOURCE_IDS.nhsBackPain,
    organization: 'National Health Service',
    title: 'Back pain',
    url: 'https://www.nhs.uk/conditions/back-pain/',
    scope: 'See a GP if back pain does not improve after a few weeks of home treatment or stops day-to-day activities; community musculoskeletal services such as physiotherapy are often available without referral. Call 999 for pain, tingling, weakness or numbness in both legs, loss of feeling around the genitals or anus, or new bladder or bowel changes. Names no specialist route. Page last reviewed 5 March 2026.',
    accessedAt: RECONCILIATION_ACCESSED,
    clinicalReviewStatus: PENDING,
  },
  {
    id: COVERAGE_SOURCE_IDS.nhsSciatica,
    organization: 'National Health Service',
    title: 'Sciatica',
    url: 'https://www.nhs.uk/conditions/sciatica/',
    scope: 'Sciatica usually affects the bottom and the back of one leg, often including the foot and toes. See a GP if it has not improved after a few weeks, is getting worse or stops normal activities; call 999 for sciatica on both sides, severe or worsening weakness or numbness in both legs, numbness around the genitals or anus, or loss of bladder or bowel control. Page last reviewed 3 December 2024.',
    accessedAt: RECONCILIATION_ACCESSED,
    clinicalReviewStatus: PENDING,
  },
  {
    id: COVERAGE_SOURCE_IDS.nhsKidneyInfection,
    organization: 'National Health Service',
    title: 'Kidney infection',
    url: 'https://www.nhs.uk/conditions/kidney-infection/',
    scope: 'A kidney infection causes pain in the lower back or side with a high temperature, feeling sick and pain when peeing; pain in the back just under the ribs with a urinary infection needs urgent help. Page last reviewed 13 February 2025.',
    accessedAt: RECONCILIATION_ACCESSED,
    clinicalReviewStatus: PENDING,
  },
  /*
    Clinical blocker pass sources. Each was read on 2026-09-26 for exactly the
    criterion it is cited for. None supplies a probability, and every criterion
    that cites one is listed in docs/clinical-review-register.md as needing
    clinician review.
  */
  {
    id: COVERAGE_SOURCE_IDS.niceHeadache,
    organization: 'National Institute for Health and Care Excellence',
    title: 'Headaches in over 12s: diagnosis and management (CG150)',
    url: 'https://www.nice.org.uk/guidance/cg150/chapter/Recommendations',
    scope: 'Recommendation 1.1.1: evaluate people with headache and any of these features and consider the need for further investigations and/or referral: worsening headache with fever; sudden onset reaching maximum intensity within 5 minutes; new neurological deficit; new cognitive dysfunction; change in personality; impaired consciousness; recent head trauma; headache triggered by cough, valsalva or sneeze; headache triggered by exercise; orthostatic headache (changes with posture); symptoms of giant cell arteritis; symptoms of acute narrow angle glaucoma; a substantial change in the characteristics of their headache. 1.1.2 adds new-onset headache with vomiting without other obvious cause. Names no destination service. Last updated 3 June 2025.',
    accessedAt: BLOCKER_PASS_ACCESSED,
    clinicalReviewStatus: PENDING,
  },
  {
    id: COVERAGE_SOURCE_IDS.nhsEnglandHeadacheToolkit,
    organization: 'NHS England',
    title: 'RightCare Headache and Migraine Toolkit',
    url: 'https://www.england.nhs.uk/rightcare/wp-content/uploads/sites/40/2020/01/rightcare-headache-and-migraine-toolkit-v1.pdf',
    scope: 'Where a secondary headache disorder is suspected on clinical symptoms, refer the patient to secondary care, in the context of specialist outpatient neurology services; primary headaches are managed in primary care and referred only when they do not respond to treatment. Published 2020.',
    accessedAt: BLOCKER_PASS_ACCESSED,
    clinicalReviewStatus: PENDING,
  },
  {
    id: COVERAGE_SOURCE_IDS.nhsHeadaches,
    organization: 'National Health Service',
    title: 'Headaches',
    url: 'https://www.nhs.uk/conditions/headaches/',
    scope: 'See a GP if headaches keep coming back or painkillers do not help. Ask for an urgent GP appointment or call 111 for a headache triggered or made worse by coughing, sneezing, bending down or exercising, among other features. Call 999 for a sudden very painful headache, weakness or numbness, speech, memory or vision change, drowsiness, a seizure or a headache after a head injury. Page last reviewed 17 April 2024.',
    accessedAt: BLOCKER_PASS_ACCESSED,
    clinicalReviewStatus: PENDING,
  },
  {
    id: COVERAGE_SOURCE_IDS.nhsHeartFailure,
    organization: 'National Health Service',
    title: 'Heart failure',
    url: 'https://www.nhs.uk/conditions/heart-failure/',
    scope: 'Symptoms include feeling out of breath when doing everyday activities or lying down, and swelling in the feet, ankles, legs or tummy. Breathlessness lying down or from everyday activity is a reason for an urgent GP appointment or NHS 111. If the doctor thinks it may be heart failure, they do tests and refer you to a heart specialist (cardiologist). Page last reviewed 26 June 2026.',
    accessedAt: BLOCKER_PASS_ACCESSED,
    clinicalReviewStatus: PENDING,
  },
  {
    id: COVERAGE_SOURCE_IDS.niceCopd,
    organization: 'National Institute for Health and Care Excellence',
    title: 'Chronic obstructive pulmonary disease in over 16s: diagnosis and management (NG115)',
    url: 'https://www.nice.org.uk/guidance/ng115/chapter/Recommendations',
    scope: 'Recommendation 1.1.30 and Table 5: refer for specialist advice when clinically indicated; frequent infections (to exclude bronchiectasis), haemoptysis and diagnostic uncertainty are listed reasons. 1.1.31: people referred do not always have to be seen by a respiratory physician. Written for people with COPD. Last updated 26 July 2019.',
    accessedAt: BLOCKER_PASS_ACCESSED,
    clinicalReviewStatus: PENDING,
  },
  {
    id: COVERAGE_SOURCE_IDS.nhsBronchiectasis,
    organization: 'National Health Service',
    title: 'Bronchiectasis',
    url: 'https://www.nhs.uk/conditions/bronchiectasis/',
    scope: 'Symptoms include a cough that does not go away, coughing up a lot of phlegm, and frequent chest infections. See a GP for a cough lasting more than 3 weeks; a very bad cough with a lot of phlegm every day is a reason for an urgent appointment. If tests show it could be bronchiectasis, you are referred to a specialist for more tests.',
    accessedAt: BLOCKER_PASS_ACCESSED,
    clinicalReviewStatus: PENDING,
  },
  {
    id: COVERAGE_SOURCE_IDS.nhsCough,
    organization: 'National Health Service',
    title: 'Cough',
    url: 'https://www.nhs.uk/conditions/cough/',
    scope: 'A cough usually clears up within 3 to 4 weeks. See a GP for a cough lasting more than 3 weeks (a persistent cough); coughing up blood is a reason for an urgent appointment. A GP may rarely refer to a specialist.',
    accessedAt: BLOCKER_PASS_ACCESSED,
    clinicalReviewStatus: PENDING,
  },
  {
    id: COVERAGE_SOURCE_IDS.nhsBrokenRibs,
    organization: 'National Health Service',
    title: 'Broken or bruised ribs',
    url: 'https://www.nhs.uk/conditions/broken-or-bruised-ribs/',
    scope: 'Usually caused by a fall, a blow or severe coughing; pain is strongest when breathing in or coughing, with swelling, tenderness and sometimes bruising, and it usually settles within 2 to 6 weeks. See a GP or call 111 if the pain has not improved within a few weeks. Call 999 after a serious accident such as a car accident, for worsening shortness of breath or chest pain, pain in the tummy or shoulder, or coughing up blood. Page last reviewed 10 January 2024.',
    accessedAt: BLOCKER_PASS_ACCESSED,
    clinicalReviewStatus: PENDING,
  },
  {
    id: COVERAGE_SOURCE_IDS.nhsStomachAche,
    organization: 'National Health Service',
    title: 'Stomach ache',
    url: 'https://www.nhs.uk/symptoms/stomach-ache/',
    scope: 'Call 999 or go to A&E if a stomach ache came on very suddenly or is severe, it hurts to touch, there is vomiting of blood, bloody or black poo, inability to pee, poo or breathe, chest pain, or someone has collapsed. Ask for an urgent GP appointment or call 111 if it gets much worse or keeps coming back. Page last reviewed 26 May 2023.',
    accessedAt: BLOCKER_PASS_ACCESSED,
    clinicalReviewStatus: PENDING,
  },
];

export interface RegionConcernOption {
  id: RegionConcernId;
  label: string;
  description: string;
}

export interface RegionAssessmentContext {
  bodyRegionId: BodyRegionId;
  bodyRegionLabel: string;
  faceSubregionId: FaceRegionId | null;
  faceSubregionLabel: string | null;
  concernId: RegionConcernId;
  concernLabel: string;
  complaintId: string;
  complaintLabel: string;
  patientMode: PatientMode;
  pediatricAgeBand: PediatricAgeBand | null;
  /** Derived from `questionVoice`: `caregiver` or `patient`, never mixed. */
  reporterMode: ReporterMode;
  /** Locked for the whole assessment; see intake/question-voice.ts. */
  questionVoice: QuestionVoice;
  age: number;
  sexForAssessment: SexForAssessment;
  sourceIds: readonly string[];
}

const option = (id: RegionConcernId, label: string, description: string): RegionConcernOption => ({ id, label, description });

const PAIN = option('pain', 'Pain or discomfort', 'Aching, burning, cramping, pressure, sharpness or soreness.');
const SWELLING = option('swelling-lump', 'Swelling or a lump', 'A new swelling, fullness, pressure or noticeable change.');
const SKIN = option('skin-change', 'Skin change', 'Rash, itching, colour change, sore or another skin concern.');
const NUMBNESS = option('numbness-tingling', 'Numbness or tingling', 'Reduced feeling, pins and needles or unusual sensation.');
const WEAKNESS = option('weakness-drooping', 'Weakness or drooping', 'New weakness, reduced control or a change in symmetry.');
const INJURY = option('injury', 'Injury', 'A fall, impact, twist, cut, burn or other injury.');
const FUNCTION = option('movement-function', 'Movement or function', 'Difficulty moving, using, bearing weight or doing usual activities.');
const OTHER = option('other', 'Something else', 'Another concern in this location.');
/*
  A sore throat is its own concern.

  It used to have nowhere to go: "Pain" at the neck meant neck pain, and "Voice
  or swallowing change" meant hoarseness, so a child with a sore throat was
  questioned as a stiff neck and ended at Paediatrics. The throat branch has
  its own questions, its own airway safety check and its own source-backed
  ENT criteria.
*/
const THROAT = option('throat', 'Sore throat', 'A sore, painful or scratchy throat, or pain when swallowing.');

const EYE_OPTIONS = [
  PAIN,
  option('vision-change', 'Vision change', 'Blurred, double, reduced, missing or otherwise changed vision.'),
  option('eye-redness-discharge', 'Redness or discharge', 'Redness, watering, stickiness, light sensitivity or discharge.'),
  SWELLING,
  INJURY,
  OTHER,
] as const;

const EAR_OPTIONS = [
  PAIN,
  option('hearing-balance-change', 'Hearing or balance change', 'Reduced hearing, ringing, dizziness or unsteadiness.'),
  option('ear-discharge', 'Discharge or bleeding', 'Fluid, pus or blood from the ear.'),
  SWELLING,
  INJURY,
  OTHER,
] as const;

const ORAL_OPTIONS = [
  PAIN,
  THROAT,
  option('mouth-change', 'Sore or mouth change', 'A sore, ulcer, tooth-related concern or change inside the mouth.'),
  SWELLING,
  option('bleeding-discharge', 'Bleeding or discharge', 'Bleeding or fluid from the mouth or nearby area.'),
  option('movement-function', 'Swallowing or movement', 'Difficulty swallowing, opening the mouth or moving the jaw.'),
  INJURY,
  OTHER,
] as const;

const FACE_GENERAL_OPTIONS = [PAIN, WEAKNESS, NUMBNESS, SWELLING, SKIN, INJURY, OTHER] as const;

const LOWER_ABDOMEN_OPTIONS = [
  PAIN,
  SWELLING,
  option('bowel-change', 'Bowel change', 'Constipation, diarrhoea, blood, bloating or a change from usual.'),
  option('urinary-change', 'Urinary change', 'Pain, urgency, frequency, difficulty or blood when passing urine.'),
  option('reproductive-pelvic-change', 'Pelvic or reproductive change', 'Bleeding, discharge, cycle, pregnancy-related or genital concern.'),
  INJURY,
  SKIN,
  OTHER,
] as const;

const CHEST_OPTIONS = [
  PAIN,
  option('breathing', 'Breathing difficulty', 'Breathlessness, tightness, wheeze or trouble getting enough air.'),
  option('palpitations', 'Heartbeat change', 'Racing, pounding, fluttering or an irregular-feeling heartbeat.'),
  option('voice-swallow', 'Burning or swallowing concern', 'Burning after eating, reflux-like discomfort or difficulty swallowing.'),
  INJURY,
  SKIN,
  /*
    Phase 2 (PENDING CLINICAL REVIEW): NHS Breast lumps sends a lump in the
    breast or armpit, or a nipple or breast skin change, to a GP and on to a
    breast clinic. The chest had no lump entry, so these had no path.
  */
  option('swelling-lump', 'Lump, swelling or breast change', 'A lump in the chest, breast or armpit, or a change in the breast or nipple.'),
  OTHER,
] as const;

const NECK_OPTIONS = [
  option('pain', 'Neck pain or stiffness', 'Aching, stiffness or pain in the neck itself.'),
  THROAT,
  SWELLING,
  option('voice-swallow', 'Voice or swallowing change', 'Hoarseness, a lump-in-the-throat feeling or difficulty swallowing.'),
  NUMBNESS,
  WEAKNESS,
  INJURY,
  SKIN,
  OTHER,
] as const;

const HEAD_OPTIONS = [
  PAIN,
  option('hearing-balance-change', 'Dizziness or balance change', 'Dizziness, spinning or unsteadiness.'),
  NUMBNESS,
  WEAKNESS,
  INJURY,
  SKIN,
  SWELLING,
  OTHER,
] as const;

const MUSCULOSKELETAL_OPTIONS = [PAIN, SWELLING, NUMBNESS, WEAKNESS, INJURY, FUNCTION, SKIN, OTHER] as const;
const UPPER_ABDOMEN_OPTIONS = [PAIN, SWELLING, option('bowel-change', 'Digestive or bowel change', 'Nausea, vomiting, bloating, stool or appetite change.'), option('urinary-change', 'Urinary change', 'Pain, frequency, difficulty or blood when passing urine.'), SKIN, INJURY, OTHER] as const;

const EYE_REGIONS = new Set<FaceRegionId>(['patient-right-eye', 'patient-left-eye']);
const EAR_REGIONS = new Set<FaceRegionId>(['patient-right-ear', 'patient-left-ear']);
const ORAL_REGIONS = new Set<FaceRegionId>(['mouth', 'patient-right-jaw', 'patient-left-jaw', 'chin']);

export interface ConcernEligibilityContext {
  age?: number;
  sexForAssessment?: SexForAssessment;
}

export function concernOptionsFor(
  regionId: BodyRegionId,
  faceSubregionId: FaceRegionId | null,
  patient?: ConcernEligibilityContext,
): readonly RegionConcernOption[] {
  if (regionId === 'face' && faceSubregionId) {
    if (EYE_REGIONS.has(faceSubregionId)) return EYE_OPTIONS;
    if (EAR_REGIONS.has(faceSubregionId)) return EAR_OPTIONS;
    if (faceSubregionId === 'nose') {
      return [PAIN, option('nose-change', 'Blocked, runny or smell change', 'A blocked or runny nose, discharge or change in smell.'), option('bleeding-discharge', 'Bleeding or discharge', 'Bleeding or unusual fluid from the nose.'), SWELLING, INJURY, SKIN, OTHER];
    }
    if (ORAL_REGIONS.has(faceSubregionId)) return ORAL_OPTIONS;
    if (faceSubregionId === 'upper-neck') return NECK_OPTIONS;
    return FACE_GENERAL_OPTIONS;
  }
  if (regionId === 'head') return HEAD_OPTIONS;
  if (regionId === 'neck') return NECK_OPTIONS;
  if (regionId === 'chest') return CHEST_OPTIONS;
  if (regionId === 'upper-abdomen') return UPPER_ABDOMEN_OPTIONS;
  if (regionId === 'lower-abdomen' || regionId === 'pelvis') {
    if (patient?.age !== undefined && patient.age < 18) {
      return LOWER_ABDOMEN_OPTIONS.filter((option) => option.id !== 'reproductive-pelvic-change');
    }
    /*
      With a patient in hand, the reproductive entry is offered only where
      reproductive physiology is positively established. The previous guard
      excluded `male` by name, so any value that was neither male nor intersex
      would have inherited the female option set; naming the eligible values
      instead makes a future addition to SexForAssessment fail closed.

      Called with no patient, this is the region catalogue rather than one
      person's eligibility, so the full option list is returned and the
      per-patient gate above is what decides.
    */
    if (patient?.sexForAssessment !== undefined
      && patient.sexForAssessment !== 'female'
      && patient.sexForAssessment !== 'intersex_or_variation') {
      return LOWER_ABDOMEN_OPTIONS.filter((option) => option.id !== 'reproductive-pelvic-change');
    }
    if (patient?.sexForAssessment === 'intersex_or_variation') {
      return LOWER_ABDOMEN_OPTIONS.map((option) => option.id === 'reproductive-pelvic-change'
        ? {
            ...option,
            label: 'Pelvic or genital change',
            description: 'A pelvic, genital, bleeding or discharge concern to describe directly.',
          }
        : option);
    }
    return LOWER_ABDOMEN_OPTIONS;
  }
  if (regionId === 'upper-back' || regionId === 'lower-back' || regionId.includes('shoulder') || regionId.includes('arm') || regionId.includes('elbow') || regionId.includes('forearm') || regionId.includes('wrist') || regionId.includes('hand') || regionId.includes('hip') || regionId.includes('thigh') || regionId.includes('knee') || regionId.includes('leg') || regionId.includes('ankle') || regionId.includes('foot')) {
    return MUSCULOSKELETAL_OPTIONS;
  }
  return [PAIN, SWELLING, SKIN, NUMBNESS, WEAKNESS, INJURY, FUNCTION, OTHER];
}

export function pediatricAgeBand(age: number): PediatricAgeBand | null {
  if (!Number.isInteger(age) || age < 0 || age >= 18) return null;
  if (age === 0) return 'infant-under-one';
  if (age < 5) return 'young-child';
  if (age < 12) return 'school-age';
  return 'adolescent';
}

/** The reporter mode a locked voice implies. There is no mixed mode at runtime. */
export function reporterModeFor(age: number, voice: QuestionVoice = questionVoiceFor(age)): ReporterMode {
  return voice === 'caregiver' ? 'caregiver' : 'patient';
}

const LOWER_ABDOMINAL = new Set<BodyRegionId>(['lower-abdomen', 'pelvis']);
const MUSCULOSKELETAL = new Set<BodyRegionId>([
  'upper-back', 'lower-back',
  'left-shoulder', 'right-shoulder', 'left-upper-arm', 'right-upper-arm',
  'left-elbow', 'right-elbow', 'left-forearm', 'right-forearm', 'left-wrist', 'right-wrist',
  'left-hand', 'right-hand', 'left-hip', 'right-hip', 'left-thigh', 'right-thigh',
  'left-knee', 'right-knee', 'left-lower-leg', 'right-lower-leg', 'left-ankle', 'right-ankle',
  'left-foot', 'right-foot',
]);

function isThroatConcern(regionId: BodyRegionId, faceSubregionId: FaceRegionId | null, concernId: RegionConcernId): boolean {
  if (concernId === 'throat') return true;
  // Hoarseness and swallowing are throat symptoms wherever the neck was tapped.
  return concernId === 'voice-swallow' && (regionId === 'neck' || faceSubregionId === 'upper-neck');
}

function adultComplaintId(regionId: BodyRegionId, faceSubregionId: FaceRegionId | null, concernId: RegionConcernId): string {
  if (isThroatConcern(regionId, faceSubregionId, concernId)) return 'throat-concern';
  if (regionId === 'upper-abdomen' && concernId === 'pain') return 'upper-abdominal-pain';
  if (regionId === 'chest' && concernId === 'breathing') return 'shortness-of-breath';
  if (regionId === 'head' && concernId === 'pain') return 'headache';
  /*
    Only pain runs the weighted joint and muscle pain complaint: its approved R1
    questions presuppose pain and open by asking whether an injury caused it. A
    patient who named an injury, or a movement problem, is asked what happened
    or what they cannot do, in the musculoskeletal branch with its own sourced
    orthopaedic criteria, instead of the same pain questionnaire.
  */
  // Lower back pain is its own branch: NHS Back pain and Sciatica name 999 features (both legs,
  // numbness around the genitals or bottom, bladder or bowel change) the joint pain set does not ask.
  if (MUSCULOSKELETAL.has(regionId) && concernId === 'pain' && regionId !== 'lower-back') return 'joint-musculoskeletal-pain';
  if (regionId === 'lower-back' && concernId === 'pain') return 'musculoskeletal-concern';
  if (MUSCULOSKELETAL.has(regionId) && ['injury', 'movement-function'].includes(concernId)) return 'musculoskeletal-concern';
  if (regionId === 'face' && faceSubregionId && EYE_REGIONS.has(faceSubregionId)) return 'face-eye-concern';
  if (regionId === 'face' && faceSubregionId && EAR_REGIONS.has(faceSubregionId)) return 'face-ear-concern';
  if (regionId === 'face' && faceSubregionId === 'nose') return 'face-nose-concern';
  if (regionId === 'face' && faceSubregionId && ORAL_REGIONS.has(faceSubregionId)) return 'face-oral-jaw-concern';
  if (regionId === 'face' && ['weakness-drooping', 'numbness-tingling'].includes(concernId)) return 'face-neurologic-concern';
  if (regionId === 'face') return 'face-general-concern';
  if (concernId === 'skin-change') return 'regional-skin-concern';
  if (LOWER_ABDOMINAL.has(regionId) && ['reproductive-pelvic-change', 'bleeding-discharge'].includes(concernId)) {
    return 'lower-abdominal-reproductive-concern';
  }
  if (LOWER_ABDOMINAL.has(regionId)) return 'lower-abdominal-pelvic-concern';
  if (regionId === 'chest') return 'chest-concern';
  if (regionId === 'neck') return 'neck-concern';
  if (['weakness-drooping', 'numbness-tingling', 'vision-change'].includes(concernId)) return 'regional-neurologic-concern';
  return 'general-region-concern';
}

/*
  The complaint family for a child.

  A child used to be collapsed into one of three age-band families, so ear
  pain, a knee injury and a sore throat all ran the same questionnaire. A child
  now keeps the same anatomical family an adult would get. The only exception
  is the four weighted demonstration complaints: their R1 likelihoods and
  questions were written for adults, so a child with the same anatomy and
  concern runs their coverage twin, which is questioned through branch
  discriminators instead of adult Bayesian weights.
*/
const PEDIATRIC_TWIN: Readonly<Record<string, string>> = {
  'upper-abdominal-pain': 'upper-abdominal-concern',
  'shortness-of-breath': 'chest-breathing-concern',
  headache: 'head-concern',
  'joint-musculoskeletal-pain': 'musculoskeletal-concern',
};

export function complaintIdFor(
  regionId: BodyRegionId,
  faceSubregionId: FaceRegionId | null,
  concernId: RegionConcernId,
  patientMode: PatientMode,
): string {
  const anatomical = adultComplaintId(regionId, faceSubregionId, concernId);
  if (patientMode === 'pediatric') {
    if (PEDIATRIC_TWIN[anatomical]) return PEDIATRIC_TWIN[anatomical];
    // Upper-abdominal and musculoskeletal concerns that are not pain keep the
    // same twin so the branch questions stay anatomical.
    if (regionId === 'upper-abdomen' && anatomical === 'general-region-concern') return 'upper-abdominal-concern';
    if (MUSCULOSKELETAL.has(regionId) && anatomical === 'general-region-concern') return 'musculoskeletal-concern';
    if (regionId === 'head' && anatomical === 'general-region-concern') return 'head-concern';
  }
  return anatomical;
}

export function complaintLabelFor(complaintId: string, concernLabel: string, locationLabel: string): string {
  const known: Record<string, string> = {
    'upper-abdominal-pain': 'Upper abdominal pain',
    'shortness-of-breath': 'Shortness of breath',
    headache: 'Headache',
    'joint-musculoskeletal-pain': 'Joint or muscle pain',
    'throat-concern': 'Sore throat or throat concern',
  };
  return known[complaintId] ?? `${concernLabel} at ${locationLabel}`;
}

export function createRegionAssessmentContext(input: {
  regionId: BodyRegionId;
  regionLabel: string;
  faceSubregionId: FaceRegionId | null;
  concern: RegionConcernOption;
  patient: PatientContext;
}): RegionAssessmentContext {
  const patientMode: PatientMode = input.patient.derivedAge < 18 ? 'pediatric' : 'adult';
  const ageBand = pediatricAgeBand(input.patient.derivedAge);
  const questionVoice = voiceOf(input.patient);
  const complaintId = complaintIdFor(input.regionId, input.faceSubregionId, input.concern.id, patientMode);
  const faceSubregionLabel = input.faceSubregionId ? FACE_REGION_BY_ID[input.faceSubregionId].label : null;
  const locationLabel = faceSubregionLabel ?? input.regionLabel;
  return {
    bodyRegionId: input.regionId,
    bodyRegionLabel: input.regionLabel,
    faceSubregionId: input.faceSubregionId,
    faceSubregionLabel,
    concernId: input.concern.id,
    concernLabel: input.concern.label,
    complaintId,
    complaintLabel: complaintLabelFor(complaintId, input.concern.label, locationLabel),
    patientMode,
    pediatricAgeBand: ageBand,
    reporterMode: reporterModeFor(input.patient.derivedAge, questionVoice),
    questionVoice,
    age: input.patient.derivedAge,
    sexForAssessment: input.patient.sexForAssessment,
    sourceIds: patientMode === 'pediatric'
      ? [COVERAGE_SOURCE_IDS.cmsHpi, COVERAGE_SOURCE_IDS.nhmImnci, COVERAGE_SOURCE_IDS.whoImci, COVERAGE_SOURCE_IDS.niceFeverUnderFive, COVERAGE_SOURCE_IDS.nbemsBroad]
      : [COVERAGE_SOURCE_IDS.cmsHpi, COVERAGE_SOURCE_IDS.nbemsBroad],
  };
}

export { GENERIC_ADULT_COMPLAINT_IDS, PEDIATRIC_COMPLAINT_IDS };

export function isGenericCoverageComplaint(complaintId: string): boolean {
  return [...GENERIC_ADULT_COMPLAINT_IDS, ...PEDIATRIC_COMPLAINT_IDS].includes(complaintId as never);
}

export interface BodyRegionCoverageRow {
  regionId: BodyRegionId;
  label: string;
  parent: string;
  laterality: 'left' | 'right' | 'midline';
  adultComplaintFamilies: readonly string[];
  pediatricComplaintFamilies: readonly string[];
  questionSetIds: readonly string[];
  safetyRules: readonly string[];
  possibleDestinationFamilies: readonly string[];
  coverageStatus: 'SUPPORTED';
  sourceIds: readonly string[];
  testId: string;
}

function destinationFamilies(regionId: BodyRegionId): readonly string[] {
  if (regionId === 'face') return ['General Medicine', 'Eye care', 'ENT', 'Neurology', 'Dental care', 'Dermatology'];
  if (regionId === 'lower-abdomen' || regionId === 'pelvis') {
    return ['General Medicine', 'Medical Gastroenterology', 'Urology', 'Obstetrics and Gynaecology', 'General Surgery'];
  }
  if (regionId === 'chest') return ['General Medicine', 'Cardiology', 'Respiratory Medicine', 'Medical Gastroenterology', 'General Surgery'];
  if (regionId === 'neck') return ['General Medicine', 'ENT', 'Neurology', 'Orthopaedics', 'Endocrinology'];
  if (regionId === 'head') return ['General Medicine', 'Neurology', 'ENT', 'Eye care'];
  if (regionId === 'upper-abdomen') return ['General Medicine', 'Medical Gastroenterology', 'Cardiology', 'General Surgery'];
  return ['General Medicine', 'Orthopaedics', 'Rheumatology', 'Vascular Surgery', 'Neurology', 'Dermatology'];
}

function safetyRuleIds(regionId: BodyRegionId): readonly string[] {
  const common = ['generic-severe-breathing', 'generic-new-neurological-change', 'generic-unresponsive-or-seizure'];
  if (regionId === 'lower-abdomen' || regionId === 'pelvis') return [...common, 'lower-abdominal-severe-or-faint', 'lower-abdominal-heavy-bleeding'];
  if (regionId === 'chest') return [...common, 'chest-persistent-spreading-associated'];
  if (regionId === 'neck') return [...common, 'skin-airway-swelling', 'neck-meningitis-warning-pattern'];
  if (regionId === 'face') return [...common, 'eye-sudden-vision-loss-or-injury', 'skin-airway-swelling'];
  return common;
}

/** Auditable coverage inventory. Destination families are possibilities only; no row performs routing. */
export const BODY_REGION_COVERAGE_MATRIX: readonly BodyRegionCoverageRow[] = BODY_DOMAIN.regions.map((region) => {
  const adultFamilies = [...new Set(
    region.id === 'face'
      ? FACE_HIT_REGIONS.flatMap((faceRegion) => concernOptionsFor('face', faceRegion.id)
        .map((concern) => adultComplaintId('face', faceRegion.id, concern.id)))
      : concernOptionsFor(region.id, null).map((concern) => adultComplaintId(region.id, null, concern.id)),
  )];
  const pediatricFamilies = [...new Set(
    region.id === 'face'
      ? FACE_HIT_REGIONS.flatMap((faceRegion) => concernOptionsFor('face', faceRegion.id, { age: 8 })
        .map((concern) => complaintIdFor('face', faceRegion.id, concern.id, 'pediatric')))
      : concernOptionsFor(region.id, null, { age: 8 }).map((concern) => complaintIdFor(region.id, null, concern.id, 'pediatric')),
  )];
  return {
    regionId: region.id,
    label: region.label,
    parent: region.groupId,
    laterality: region.laterality,
    adultComplaintFamilies: adultFamilies,
    pediatricComplaintFamilies: pediatricFamilies,
    questionSetIds: [`${region.id}-complaint-entry`, `${region.id}-adaptive-intake`],
    safetyRules: safetyRuleIds(region.id),
    possibleDestinationFamilies: destinationFamilies(region.id),
    coverageStatus: 'SUPPORTED',
    sourceIds: [
      COVERAGE_SOURCE_IDS.cmsHpi,
      COVERAGE_SOURCE_IDS.nbemsBroad,
      COVERAGE_SOURCE_IDS.nbemsSuper,
      ...(region.id === 'lower-abdomen' || region.id === 'pelvis' ? [COVERAGE_SOURCE_IDS.nhsPelvicPain] : []),
      ...(region.id === 'face' ? [
        COVERAGE_SOURCE_IDS.nhsEyePain,
        COVERAGE_SOURCE_IDS.nhsEarInfections,
        COVERAGE_SOURCE_IDS.nhsSinusitis,
        COVERAGE_SOURCE_IDS.nhsMouthUlcers,
        COVERAGE_SOURCE_IDS.nhsTmd,
        COVERAGE_SOURCE_IDS.nhsStroke,
      ] : []),
    ],
    testId: `coverage-${region.id}`,
  };
});

/**
 * One publication, two registry roles.
 *
 * These publications are recorded twice on purpose: once here, as the source a
 * question or a direction criterion cites, and once in the R3 safety registry
 * (src/engine/safety/sources.ts), as the provenance of a safety rule with its
 * own evidence-register entry. The records carry different contracts, so they
 * are not merged. They are declared as the same publication here instead, and
 * a test holds every cross-registry duplicate to this table and to a matching
 * URL, so a third copy or a silent divergence cannot appear.
 */
export const COVERAGE_SAFETY_SAME_PUBLICATION: Readonly<Record<string, string>> = {
  [COVERAGE_SOURCE_IDS.niceHeadache]: 'r3-nice-cg150-headache-2025',
  [COVERAGE_SOURCE_IDS.nhsBrokenRibs]: 'r3-nhs-broken-or-bruised-ribs',
  [COVERAGE_SOURCE_IDS.nhsDentalAbscess]: 'r3-nhs-dental-abscess',
  [COVERAGE_SOURCE_IDS.nhsDvt]: 'r3-nhs-dvt',
  [COVERAGE_SOURCE_IDS.nhsHernia]: 'r3-nhs-hernia',
  [COVERAGE_SOURCE_IDS.nhsGiantCellArteritis]: 'r3-nhs-giant-cell-arteritis',
  [COVERAGE_SOURCE_IDS.nhsCellulitis]: 'r3-nhs-cellulitis',
  [COVERAGE_SOURCE_IDS.nhsVaricoseVeins]: 'r3-nhs-varicose-veins',
  [COVERAGE_SOURCE_IDS.nhsHeadInjury]: 'r3-nhs-head-injury',
  [COVERAGE_SOURCE_IDS.nhsBrokenNose]: 'r3-nhs-broken-nose',
  [COVERAGE_SOURCE_IDS.nhsWhiplash]: 'r3-nhs-whiplash',
  [COVERAGE_SOURCE_IDS.nhsBlackEye]: 'r3-nhs-black-eye',
  [COVERAGE_SOURCE_IDS.nhsBellsPalsy]: 'r3-nhs-bells-palsy',
  [COVERAGE_SOURCE_IDS.nhsDysphagia]: 'r3-nhs-swallowing-problems',
  [COVERAGE_SOURCE_IDS.nhsPelvicPain]: 'r3-nhs-pelvic-pain-2026',
  [COVERAGE_SOURCE_IDS.nhsEyePain]: 'r3-nhs-eye-pain-2025',
  [COVERAGE_SOURCE_IDS.nhsEarInfections]: 'r3-nhs-ear-infections',
  [COVERAGE_SOURCE_IDS.nhsSinusitis]: 'r3-nhs-sinusitis',
  [COVERAGE_SOURCE_IDS.nhsNosebleed]: 'r3-nhs-nosebleed',
  [COVERAGE_SOURCE_IDS.nhsStroke]: 'r3-nhs-stroke-symptoms-2024',
  [COVERAGE_SOURCE_IDS.nhsChestPain]: 'r3-nhs-chest-pain',
  [COVERAGE_SOURCE_IDS.nhsAllergy]: 'r3-nhs-allergy-anaphylaxis',
  [COVERAGE_SOURCE_IDS.nhsUrinaryTractInfection]: 'r3-nhs-urinary-tract-infection',
  [COVERAGE_SOURCE_IDS.whoImci]: 'r3-who-imci-danger-signs',
  [COVERAGE_SOURCE_IDS.niceFeverUnderFive]: 'r3-nice-ng143-fever-under-five',
  [COVERAGE_SOURCE_IDS.niceMeningitis]: 'r3-nice-ng240-meningitis',
  [COVERAGE_SOURCE_IDS.nhmImnci]: 'r3-nhm-imnci-module-5-sick-child',
  [COVERAGE_SOURCE_IDS.nhsSoreThroat]: 'r3-nhs-sore-throat',
  [COVERAGE_SOURCE_IDS.nhsTonsillitis]: 'r3-nhs-tonsillitis',
  [COVERAGE_SOURCE_IDS.nhsJointPain]: 'r3-nhs-joint-pain-2026',
  [COVERAGE_SOURCE_IDS.nhsSprains]: 'r3-nhs-sprains-and-strains',
  [COVERAGE_SOURCE_IDS.nhsChildHeadache]: 'r3-nhs-headaches-in-children',
  [COVERAGE_SOURCE_IDS.nhsDiarrhoeaVomiting]: 'r3-nhs-diarrhoea-and-vomiting',
  [COVERAGE_SOURCE_IDS.nhsRectalBleeding]: 'r3-nhs-rectal-bleeding',
  [COVERAGE_SOURCE_IDS.nhsShingles]: 'r3-nhs-shingles',
  [COVERAGE_SOURCE_IDS.nhsPalpitations]: 'r3-nhs-heart-palpitations',
  [COVERAGE_SOURCE_IDS.niceNeurologicalReferral]: 'r3-nice-ng127-neurological-referral',
  [COVERAGE_SOURCE_IDS.nhsBackPain]: 'r3-nhs-back-pain',
  [COVERAGE_SOURCE_IDS.nhsSciatica]: 'r3-nhs-sciatica',
};
