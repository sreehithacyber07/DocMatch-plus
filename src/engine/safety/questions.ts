import type { OwnedSafetyQuestion, RoutingSafetyQuestion, SafetyCondition, SafetyQuestion } from './types.ts';
import { ALL_COVERAGE_COMPLAINT_IDS, GENERIC_ADULT_COMPLAINT_IDS } from '../coverage-complaints.ts';
import {
  AHA_CHEST_PAIN_SAFETY_SOURCE_ID,
  AHA_WARNING_SIGNS_SOURCE_ID,
  NHS_ARTHRITIS_SAFETY_SOURCE_ID,
  NHS_BREATHLESSNESS_SAFETY_SOURCE_ID,
  NHS_HEADACHE_SAFETY_SOURCE_ID,
  NHS_JOINT_PAIN_SAFETY_SOURCE_ID,
  NICE_HEADACHE_SAFETY_SOURCE_ID,
  NHS_ALLERGY_SAFETY_SOURCE_ID,
  NHS_CHEST_PAIN_SAFETY_SOURCE_ID,
  NHS_EYE_PAIN_SAFETY_SOURCE_ID,
  NHS_PELVIC_PAIN_SAFETY_SOURCE_ID,
  NHS_STROKE_SAFETY_SOURCE_ID,
  NICE_FEVER_CHILD_SAFETY_SOURCE_ID,
  NICE_MENINGITIS_SAFETY_SOURCE_ID,
  NHS_CHILD_EMERGENCY_SAFETY_SOURCE_ID,
  NHS_NOSEBLEED_SAFETY_SOURCE_ID,
  WHO_IMCI_SAFETY_SOURCE_ID,
  NHM_IMNCI_SICK_CHILD_SAFETY_SOURCE_ID,
  NHM_IMNCI_YOUNG_INFANT_SAFETY_SOURCE_ID,
  NHS_SORE_THROAT_SAFETY_SOURCE_ID,
  NHS_TONSILLITIS_SAFETY_SOURCE_ID,
  NHS_CHILD_HEADACHE_SAFETY_SOURCE_ID,
  NHS_CHILD_RASH_SAFETY_SOURCE_ID,
  NHS_SPRAINS_SAFETY_SOURCE_ID,
  NHS_DIARRHOEA_VOMITING_SAFETY_SOURCE_ID,
  NHS_UTI_SAFETY_SOURCE_ID,
  NHS_EAR_INFECTION_SAFETY_SOURCE_ID,
  NHS_RECTAL_BLEEDING_SAFETY_SOURCE_ID,
  NHS_SINUSITIS_SAFETY_SOURCE_ID,
  NHS_SHINGLES_SAFETY_SOURCE_ID,
  NHS_PALPITATIONS_SAFETY_SOURCE_ID,
  NICE_NEUROLOGICAL_REFERRAL_SAFETY_SOURCE_ID,
  NHS_BACK_PAIN_SAFETY_SOURCE_ID,
  NHS_SCIATICA_SAFETY_SOURCE_ID,
  NHS_BROKEN_RIBS_SAFETY_SOURCE_ID,
} from './sources.ts';

const ALWAYS: SafetyCondition = { kind: 'always' };
const YES_NO_OPTIONS = [
  { id: 'yes', label: 'Yes' },
  { id: 'no', label: 'No' },
] as const;

function answerEquals(questionId: string, optionId: string): SafetyCondition {
  return { kind: 'answer_equals', questionId, optionId };
}

function all(...conditions: SafetyCondition[]): SafetyCondition {
  return { kind: 'all', conditions };
}

function routingQuestion(
  id: string,
  complaintId: string,
  liveWhen: SafetyCondition,
  dependencyRank: number,
  provenanceIds: readonly string[],
): RoutingSafetyQuestion {
  return {
    kind: 'routing_reference',
    id,
    routingQuestionId: id,
    applicableComplaintIds: [complaintId],
    liveWhen,
    priority: { severity: 'emergency', dependencyRank },
    provenanceIds,
  };
}

function ownedQuestion(
  definition: Omit<OwnedSafetyQuestion, 'kind' | 'options'>,
): OwnedSafetyQuestion {
  return { ...definition, kind: 'safety_owned', options: YES_NO_OPTIONS };
}

const UPPER_ABDOMINAL_SAFETY_QUESTIONS: readonly SafetyQuestion[] = [
  routingQuestion(
    'upper-abdominal-pain-exertional',
    'upper-abdominal-pain',
    ALWAYS,
    0,
    [AHA_CHEST_PAIN_SAFETY_SOURCE_ID, AHA_WARNING_SIGNS_SOURCE_ID],
  ),
  routingQuestion(
    'upper-abdominal-pain-sweating',
    'upper-abdominal-pain',
    answerEquals('upper-abdominal-pain-exertional', 'yes'),
    10,
    [AHA_CHEST_PAIN_SAFETY_SOURCE_ID, AHA_WARNING_SIGNS_SOURCE_ID],
  ),
  routingQuestion(
    'upper-abdominal-pain-breathlessness',
    'upper-abdominal-pain',
    all(
      answerEquals('upper-abdominal-pain-exertional', 'yes'),
      answerEquals('upper-abdominal-pain-sweating', 'no'),
    ),
    20,
    [AHA_CHEST_PAIN_SAFETY_SOURCE_ID, AHA_WARNING_SIGNS_SOURCE_ID],
  ),
];

const BREATHING_SAFETY_QUESTIONS: readonly SafetyQuestion[] = [
  ownedQuestion({
    id: 'safety-shortness-of-breath-severe',
    text: 'Are you gasping, choking, or unable to get words out because of your breathing?',
    applicableComplaintIds: ['shortness-of-breath'],
    liveWhen: ALWAYS,
    priority: { severity: 'emergency', dependencyRank: 0 },
    provenanceIds: [NHS_BREATHLESSNESS_SAFETY_SOURCE_ID],
  }),
  ownedQuestion({
    id: 'safety-shortness-of-breath-pale-blue-grey',
    text: 'Have your lips or skin become very pale, blue, or grey?',
    applicableComplaintIds: ['shortness-of-breath'],
    liveWhen: ALWAYS,
    priority: { severity: 'emergency', dependencyRank: 10 },
    provenanceIds: [NHS_BREATHLESSNESS_SAFETY_SOURCE_ID],
  }),
  ownedQuestion({
    id: 'safety-shortness-of-breath-sudden-confusion',
    text: 'Have you suddenly become confused while having the breathing problem?',
    applicableComplaintIds: ['shortness-of-breath'],
    liveWhen: ALWAYS,
    priority: { severity: 'emergency', dependencyRank: 20 },
    provenanceIds: [NHS_BREATHLESSNESS_SAFETY_SOURCE_ID],
  }),
  ownedQuestion({
    id: 'safety-shortness-of-breath-coughing-blood',
    text: 'Are you coughing up blood?',
    applicableComplaintIds: ['shortness-of-breath'],
    liveWhen: ALWAYS,
    priority: { severity: 'urgent', dependencyRank: 30 },
    provenanceIds: [NHS_BREATHLESSNESS_SAFETY_SOURCE_ID],
  }),
];

const HEADACHE_SAFETY_QUESTIONS: readonly SafetyQuestion[] = [
  ownedQuestion({
    id: 'safety-headache-sudden-extremely-painful',
    text: 'Did the headache start suddenly and become extremely painful within a few minutes?',
    applicableComplaintIds: ['headache'],
    liveWhen: ALWAYS,
    priority: { severity: 'emergency', dependencyRank: 0 },
    provenanceIds: [NHS_HEADACHE_SAFETY_SOURCE_ID, NICE_HEADACHE_SAFETY_SOURCE_ID],
  }),
  ownedQuestion({
    id: 'safety-headache-new-one-sided-weakness',
    text: 'Since the headache began, have you developed new weakness or numbness on one side of your face or body?',
    applicableComplaintIds: ['headache'],
    liveWhen: ALWAYS,
    priority: { severity: 'emergency', dependencyRank: 10 },
    provenanceIds: [NHS_HEADACHE_SAFETY_SOURCE_ID, NICE_HEADACHE_SAFETY_SOURCE_ID],
  }),
  ownedQuestion({
    id: 'safety-headache-speech-memory-vision',
    text: 'Since the headache began, have you had new trouble speaking, remembering, or seeing?',
    applicableComplaintIds: ['headache'],
    liveWhen: ALWAYS,
    priority: { severity: 'emergency', dependencyRank: 20 },
    provenanceIds: [NHS_HEADACHE_SAFETY_SOURCE_ID, NICE_HEADACHE_SAFETY_SOURCE_ID],
  }),
  ownedQuestion({
    id: 'safety-headache-drowsy-confused',
    text: 'Have you become unusually drowsy or confused with the headache?',
    applicableComplaintIds: ['headache'],
    liveWhen: ALWAYS,
    priority: { severity: 'emergency', dependencyRank: 30 },
    provenanceIds: [NHS_HEADACHE_SAFETY_SOURCE_ID, NICE_HEADACHE_SAFETY_SOURCE_ID],
  }),
];

const JOINT_SAFETY_QUESTIONS: readonly SafetyQuestion[] = [
  routingQuestion(
    'joint-musculoskeletal-pain-injury',
    'joint-musculoskeletal-pain',
    ALWAYS,
    0,
    [NHS_JOINT_PAIN_SAFETY_SOURCE_ID],
  ),
  ownedQuestion({
    id: 'safety-joint-injury-severe-or-displaced',
    text: 'After the injury, is the pain very severe, are you unable to put weight on it, or does the joint look out of place?',
    applicableComplaintIds: ['joint-musculoskeletal-pain'],
    liveWhen: answerEquals('joint-musculoskeletal-pain-injury', 'yes'),
    priority: { severity: 'emergency', dependencyRank: 10 },
    provenanceIds: [NHS_JOINT_PAIN_SAFETY_SOURCE_ID],
  }),
  ownedQuestion({
    id: 'safety-joint-injury-sensation-circulation',
    text: 'After the injury, is the area numb or tingling, blue or grey, or cold to touch?',
    applicableComplaintIds: ['joint-musculoskeletal-pain'],
    liveWhen: all(
      answerEquals('joint-musculoskeletal-pain-injury', 'yes'),
      answerEquals('safety-joint-injury-severe-or-displaced', 'no'),
    ),
    priority: { severity: 'emergency', dependencyRank: 20 },
    provenanceIds: [NHS_JOINT_PAIN_SAFETY_SOURCE_ID],
  }),
  ownedQuestion({
    id: 'safety-joint-sudden-hot-swollen',
    text: 'Did one joint become severely painful and swollen suddenly, with skin that feels hot or looks red?',
    applicableComplaintIds: ['joint-musculoskeletal-pain', 'musculoskeletal-concern'],
    liveWhen: ALWAYS,
    priority: { severity: 'urgent', dependencyRank: 30 },
    provenanceIds: [NHS_JOINT_PAIN_SAFETY_SOURCE_ID, NHS_ARTHRITIS_SAFETY_SOURCE_ID],
  }),
];

/*
  The complaint families in which the NHS stroke warning signs are a relevant
  question at all. `face-ear-concern` is here because a vestibular presentation
  is the recognised stroke mimic: the question is only ever ASKED when the ear
  branch has actually reported dizziness, spinning or unsteadiness, which the
  presentation layer decides in contextual-safety.ts. Ear pain on its own never
  reaches it. The rule, predicate, severity, payload and source are unchanged.
*/
const NEUROLOGIC_GENERIC_COMPLAINTS = [
  'face-eye-concern',
  'face-ear-concern',
  'face-neurologic-concern',
  'regional-neurologic-concern',
  // Neck numbness or weakness, and dizziness felt in the head (NHS Vertigo names these stroke-type
  // features with vertigo as an emergency). Asked only where contextual scoping enables it.
  'neck-concern',
  'general-region-concern',
] as const;

const LOWER_ABDOMINAL_COMPLAINTS = [
  'lower-abdominal-pelvic-concern',
  'lower-abdominal-reproductive-concern',
] as const;

const GENERIC_SAFETY_QUESTIONS: readonly SafetyQuestion[] = [
  ownedQuestion({
    id: 'safety-generic-severe-breathing',
    text: 'Are you gasping, choking, or unable to get words out because of your breathing?',
    applicableComplaintIds: GENERIC_ADULT_COMPLAINT_IDS,
    liveWhen: ALWAYS,
    priority: { severity: 'emergency', dependencyRank: 0 },
    provenanceIds: [NHS_BREATHLESSNESS_SAFETY_SOURCE_ID, NHS_ALLERGY_SAFETY_SOURCE_ID],
  }),
  ownedQuestion({
    id: 'safety-generic-new-neurological-change',
    text: 'Did you suddenly develop one-sided weakness or drooping, trouble speaking, or loss of vision?',
    applicableComplaintIds: NEUROLOGIC_GENERIC_COMPLAINTS,
    liveWhen: ALWAYS,
    priority: { severity: 'emergency', dependencyRank: 10 },
    provenanceIds: [NHS_STROKE_SAFETY_SOURCE_ID],
  }),
  ownedQuestion({
    id: 'safety-generic-unresponsive-or-seizure',
    text: 'Have you had a seizure, fainted and not fully recovered, or become unusually hard to wake?',
    applicableComplaintIds: GENERIC_ADULT_COMPLAINT_IDS,
    liveWhen: ALWAYS,
    priority: { severity: 'emergency', dependencyRank: 20 },
    provenanceIds: [NHS_HEADACHE_SAFETY_SOURCE_ID],
  }),
  ownedQuestion({
    id: 'safety-lower-abdominal-severe-or-faint',
    text: 'Is the lower abdominal or pelvic pain severe or getting worse, especially with movement or touch, or have you felt faint or passed out?',
    applicableComplaintIds: LOWER_ABDOMINAL_COMPLAINTS,
    liveWhen: ALWAYS,
    priority: { severity: 'emergency', dependencyRank: 30 },
    provenanceIds: [NHS_PELVIC_PAIN_SAFETY_SOURCE_ID],
  }),
  ownedQuestion({
    id: 'safety-lower-abdominal-heavy-bleeding',
    text: 'Is there heavy vaginal bleeding with the lower abdominal or pelvic concern?',
    applicableComplaintIds: ['lower-abdominal-reproductive-concern'],
    liveWhen: ALWAYS,
    priority: { severity: 'emergency', dependencyRank: 40 },
    provenanceIds: [NHS_PELVIC_PAIN_SAFETY_SOURCE_ID],
  }),
  ownedQuestion({
    id: 'safety-eye-sudden-vision-loss-or-injury',
    text: 'Did your vision suddenly disappear, or is your eye pierced or is something stuck in it?',
    caregiverText: 'Did your child’s vision suddenly disappear, or is their eye pierced or is something stuck in it?',
    applicableComplaintIds: ['face-eye-concern'],
    liveWhen: ALWAYS,
    priority: { severity: 'emergency', dependencyRank: 30 },
    provenanceIds: [NHS_EYE_PAIN_SAFETY_SOURCE_ID],
  }),
  ownedQuestion({
    id: 'safety-nosebleed-prolonged-or-excessive',
    text: 'Has the nosebleed lasted longer than 10 to 15 minutes, seemed excessive, followed a blow to the head, or made you weak, dizzy, sick with swallowed blood, or short of breath?',
    caregiverText: 'Has your child’s nosebleed lasted longer than 10 to 15 minutes, seemed excessive, followed a blow to the head, or made them weak, dizzy, sick with swallowed blood, or short of breath?',
    applicableComplaintIds: ['face-nose-concern'],
    liveWhen: ALWAYS,
    priority: { severity: 'emergency', dependencyRank: 30 },
    provenanceIds: [NHS_NOSEBLEED_SAFETY_SOURCE_ID],
  }),
  ownedQuestion({
    id: 'safety-chest-persistent-spreading-associated',
    text: 'Is there sudden chest discomfort that does not go away and either spreads to an arm, neck, jaw, stomach or back, or comes with sweating, sickness, lightheadedness or breathlessness?',
    applicableComplaintIds: ['chest-concern'],
    liveWhen: ALWAYS,
    priority: { severity: 'emergency', dependencyRank: 30 },
    provenanceIds: [NHS_CHEST_PAIN_SAFETY_SOURCE_ID],
  }),
  ownedQuestion({
    id: 'safety-skin-airway-swelling',
    text: 'Did your lips, mouth, tongue or throat suddenly swell, with trouble breathing or swallowing?',
    caregiverText: 'Did your child’s lips, mouth, tongue or throat suddenly swell, with trouble breathing or swallowing?',
    applicableComplaintIds: ['regional-skin-concern', 'face-general-concern', 'face-oral-jaw-concern', 'neck-concern', 'throat-concern'],
    liveWhen: ALWAYS,
    priority: { severity: 'emergency', dependencyRank: 30 },
    provenanceIds: [NHS_ALLERGY_SAFETY_SOURCE_ID],
  }),
  ownedQuestion({
    id: 'safety-neck-meningitis-warning-pattern',
    text: 'Are fever and headache present with a stiff neck, plus unusual drowsiness, confusion or difficulty staying awake?',
    applicableComplaintIds: ['neck-concern'],
    liveWhen: ALWAYS,
    priority: { severity: 'emergency', dependencyRank: 40 },
    provenanceIds: [NICE_MENINGITIS_SAFETY_SOURCE_ID],
  }),
];

/*
  Paediatric and all-age branch checks.

  Children keep their anatomical complaint family, so these questions are
  applicable to every coverage family. Which of them is actually asked, and
  when, is decided in contextual-safety.ts from age, anatomy, concern and the
  answers so far; a question outside that set is never shown.

  Every owned question below carries two wordings of the SAME question: `text`
  for a person answering about themselves, `caregiverText` for a parent or
  caregiver answering about their child. The options, and therefore what an
  answer means to a predicate, are identical.
*/
const PEDIATRIC_SAFETY_QUESTIONS: readonly SafetyQuestion[] = [
  ownedQuestion({
    id: 'safety-pediatric-severe-breathing',
    text: 'Are you struggling to breathe, gasping, or unable to speak normally because of your breathing?',
    caregiverText: 'Is your child struggling to breathe, gasping, or unable to speak or cry normally because of their breathing?',
    applicableComplaintIds: ALL_COVERAGE_COMPLAINT_IDS,
    liveWhen: ALWAYS,
    priority: { severity: 'emergency', dependencyRank: 0 },
    provenanceIds: [NICE_FEVER_CHILD_SAFETY_SOURCE_ID, NHS_BREATHLESSNESS_SAFETY_SOURCE_ID, NHM_IMNCI_SICK_CHILD_SAFETY_SOURCE_ID],
  }),
  ownedQuestion({
    id: 'safety-pediatric-unresponsive-or-seizure',
    // A fit, or a child who cannot be woken or does not respond: the IMNCI and NHS
    // signs. "Unusually drowsy" is not one of them and is no longer asked here.
    text: 'Have you had a fit (seizure), or been very hard to wake or not responding normally?',
    caregiverText: 'Has your child had a fit (seizure), or are they very hard to wake or not responding to you normally?',
    applicableComplaintIds: ALL_COVERAGE_COMPLAINT_IDS,
    liveWhen: ALWAYS,
    priority: { severity: 'emergency', dependencyRank: 10 },
    provenanceIds: [WHO_IMCI_SAFETY_SOURCE_ID, NICE_FEVER_CHILD_SAFETY_SOURCE_ID, NHS_CHILD_EMERGENCY_SAFETY_SOURCE_ID],
  }),
  ownedQuestion({
    id: 'safety-pediatric-under-five-feeding-vomiting',
    text: 'Are you not able to drink at all, or vomiting up everything you take?',
    caregiverText: 'Is your child not able to drink or breastfeed at all, or vomiting up everything they take?',
    applicableComplaintIds: ALL_COVERAGE_COMPLAINT_IDS,
    liveWhen: ALWAYS,
    priority: { severity: 'emergency', dependencyRank: 20 },
    provenanceIds: [WHO_IMCI_SAFETY_SOURCE_ID, NHM_IMNCI_SICK_CHILD_SAFETY_SOURCE_ID],
  }),
  ownedQuestion({
    id: 'safety-infant-serious-illness',
    // IMNCI young-infant signs (stopped feeding; moving only when touched or not
    // at all) and NICE NG143's red feature for fever (38°C or more under 3 months).
    // "Much less active" and "felt hot" are amber or lower and are not asked here.
    text: 'Have you stopped feeding, or started moving only when touched or not at all, or (under 3 months old) had a temperature of 38°C or more?',
    caregiverText:
      'Has your baby stopped feeding, or started moving only when touched or not at all, or, if under 3 months old, had a temperature of 38°C or more?',
    applicableComplaintIds: ALL_COVERAGE_COMPLAINT_IDS,
    liveWhen: ALWAYS,
    priority: { severity: 'emergency', dependencyRank: 25 },
    provenanceIds: [NHM_IMNCI_YOUNG_INFANT_SAFETY_SOURCE_ID, NICE_FEVER_CHILD_SAFETY_SOURCE_ID],
  }),
  ownedQuestion({
    id: 'safety-pediatric-sudden-neurological-change',
    text: 'Did you suddenly develop weakness or drooping on one side, trouble speaking, or loss of vision?',
    caregiverText: 'Did your child suddenly develop weakness or drooping on one side, trouble speaking, or loss of vision?',
    applicableComplaintIds: ALL_COVERAGE_COMPLAINT_IDS,
    liveWhen: ALWAYS,
    priority: { severity: 'emergency', dependencyRank: 30 },
    provenanceIds: [NHS_STROKE_SAFETY_SOURCE_ID],
  }),
  ownedQuestion({
    id: 'safety-pediatric-chest-indrawing-or-stridor',
    text: 'When you breathe in, does the skin below your ribs pull in, or is there a harsh noise even while you are calm?',
    caregiverText:
      'When your child breathes in, does the skin below their ribs pull in, or is there a harsh noise even while they are calm?',
    applicableComplaintIds: ['chest-breathing-concern', 'chest-concern'],
    liveWhen: ALWAYS,
    priority: { severity: 'emergency', dependencyRank: 32 },
    provenanceIds: [NHM_IMNCI_SICK_CHILD_SAFETY_SOURCE_ID],
  }),
  ownedQuestion({
    id: 'safety-throat-airway',
    text: 'Are you having difficulty breathing, unable to swallow, drooling, or making a high-pitched sound when you breathe in?',
    caregiverText:
      'Is your child having difficulty breathing, unable to swallow, drooling, or making a high-pitched sound when they breathe in?',
    applicableComplaintIds: ['throat-concern', 'neck-concern', 'face-oral-jaw-concern'],
    liveWhen: ALWAYS,
    priority: { severity: 'emergency', dependencyRank: 34 },
    provenanceIds: [NHS_SORE_THROAT_SAFETY_SOURCE_ID, NHM_IMNCI_SICK_CHILD_SAFETY_SOURCE_ID],
  }),
  ownedQuestion({
    id: 'safety-pediatric-headache-sudden-or-injury',
    text: 'Did the headache start suddenly and become extremely painful, or have you had a head injury in the last 3 months?',
    caregiverText:
      'Did your child’s headache start suddenly and become extremely painful, or has your child had a head injury in the last 3 months?',
    applicableComplaintIds: ['head-concern'],
    liveWhen: ALWAYS,
    priority: { severity: 'emergency', dependencyRank: 36 },
    provenanceIds: [NHS_CHILD_HEADACHE_SAFETY_SOURCE_ID],
  }),
  ownedQuestion({
    id: 'safety-pediatric-fever-stiff-neck-rash',
    text: 'Is there a high temperature with a stiff neck, pain when you look at bright lights, or a rash that does not fade when a glass is pressed on it?',
    caregiverText:
      'Does your child have a high temperature with a stiff neck, pain when looking at bright lights, or a rash that does not fade when a glass is pressed on it?',
    applicableComplaintIds: ['head-concern', 'regional-skin-concern', 'neck-concern', 'face-general-concern'],
    liveWhen: ALWAYS,
    priority: { severity: 'emergency', dependencyRank: 38 },
    provenanceIds: [NHS_CHILD_HEADACHE_SAFETY_SOURCE_ID, NHS_CHILD_RASH_SAFETY_SOURCE_ID, NICE_MENINGITIS_SAFETY_SOURCE_ID],
  }),
  ownedQuestion({
    id: 'safety-pediatric-injury-emergency',
    text: 'Since the injury, is the pain very bad, does the area look out of place or bent at an odd angle, is it numb, tingling or cold, or can you not put any weight on it or use it at all?',
    caregiverText:
      'Since the injury, is your child in very bad pain, does the area look out of place or bent at an odd angle, is it numb, tingling or cold, or can they not put any weight on it or use it at all?',
    applicableComplaintIds: ['musculoskeletal-concern', 'general-region-concern'],
    liveWhen: ALWAYS,
    priority: { severity: 'emergency', dependencyRank: 40 },
    provenanceIds: [NHS_JOINT_PAIN_SAFETY_SOURCE_ID, NHS_SPRAINS_SAFETY_SOURCE_ID],
  }),
  ownedQuestion({
    id: 'safety-pediatric-abdominal-emergency',
    text: 'Are you vomiting green or yellow-green fluid, vomiting blood, or having a sudden, severe pain in your tummy?',
    caregiverText:
      'Is your child vomiting green or yellow-green fluid, vomiting blood, or having a sudden, severe pain in their tummy?',
    applicableComplaintIds: ['upper-abdominal-concern', 'lower-abdominal-pelvic-concern', 'general-region-concern'],
    liveWhen: ALWAYS,
    priority: { severity: 'emergency', dependencyRank: 42 },
    provenanceIds: [NHS_DIARRHOEA_VOMITING_SAFETY_SOURCE_ID],
  }),
  ownedQuestion({
    id: 'safety-pediatric-under-five-ear-swelling',
    text: 'Is there a tender swelling behind your ear?',
    caregiverText: 'Is there a tender swelling behind your child’s ear?',
    applicableComplaintIds: ['face-ear-concern'],
    liveWhen: ALWAYS,
    priority: { severity: 'emergency', dependencyRank: 44 },
    provenanceIds: [NHM_IMNCI_SICK_CHILD_SAFETY_SOURCE_ID],
  }),
  /* --- Urgent, continuable ------------------------------------------------ */
  ownedQuestion({
    id: 'safety-ear-swelling-behind-ear',
    text: 'Is there a tender swelling behind or around your ear?',
    caregiverText: 'Is there a tender swelling behind or around your child’s ear?',
    applicableComplaintIds: ['face-ear-concern'],
    liveWhen: ALWAYS,
    priority: { severity: 'urgent', dependencyRank: 48 },
    provenanceIds: [NHS_EAR_INFECTION_SAFETY_SOURCE_ID],
  }),
  ownedQuestion({
    id: 'safety-pediatric-fast-breathing',
    text: 'Are you breathing much faster than usual, even while resting?',
    caregiverText: 'Is your child breathing much faster than usual, even while resting?',
    applicableComplaintIds: ['chest-breathing-concern', 'chest-concern'],
    liveWhen: ALWAYS,
    priority: { severity: 'urgent', dependencyRank: 50 },
    provenanceIds: [NHM_IMNCI_SICK_CHILD_SAFETY_SOURCE_ID],
  }),
  ownedQuestion({
    id: 'safety-throat-urgent',
    text: 'Is the sore throat so painful that it is hard to eat or drink, or are you very hot, shivery, or peeing much less than usual?',
    caregiverText:
      'Is your child’s sore throat so painful that eating or drinking is hard, or are they very hot, shivery, or peeing much less than usual?',
    applicableComplaintIds: ['throat-concern', 'neck-concern', 'face-oral-jaw-concern'],
    liveWhen: ALWAYS,
    priority: { severity: 'urgent', dependencyRank: 52 },
    provenanceIds: [NHS_SORE_THROAT_SAFETY_SOURCE_ID, NHS_TONSILLITIS_SAFETY_SOURCE_ID],
  }),
  ownedQuestion({
    id: 'safety-pediatric-headache-urgent',
    text: 'Is the headache getting worse, waking you at night, making you vomit, affecting your eyes or vision, or brought on by coughing, bending or exercise?',
    caregiverText:
      'Is your child’s headache getting worse, waking them at night, making them vomit, affecting their eyes or vision, or brought on by coughing, bending or exercise?',
    applicableComplaintIds: ['head-concern'],
    liveWhen: ALWAYS,
    priority: { severity: 'urgent', dependencyRank: 54 },
    provenanceIds: [NHS_CHILD_HEADACHE_SAFETY_SOURCE_ID],
  }),
  ownedQuestion({
    id: 'safety-injury-worsening',
    text: 'Is the swelling or bruising getting worse, or is the area very stiff and hard to move?',
    caregiverText: 'Is the swelling or bruising on your child getting worse, or is the area very stiff and hard for them to move?',
    applicableComplaintIds: ['musculoskeletal-concern', 'general-region-concern'],
    liveWhen: ALWAYS,
    priority: { severity: 'urgent', dependencyRank: 56 },
    provenanceIds: [NHS_SPRAINS_SAFETY_SOURCE_ID],
  }),
  ownedQuestion({
    id: 'safety-pediatric-dehydration',
    text: 'Are you peeing much less than usual, unable to keep fluids down, or passing blood in your poo?',
    caregiverText:
      'Is your child peeing less than usual (or having fewer wet nappies), unable to keep fluids down, or passing blood in their poo?',
    applicableComplaintIds: ['upper-abdominal-concern', 'lower-abdominal-pelvic-concern', 'general-region-concern'],
    liveWhen: ALWAYS,
    priority: { severity: 'urgent', dependencyRank: 58 },
    provenanceIds: [NHS_DIARRHOEA_VOMITING_SAFETY_SOURCE_ID],
  }),
  ownedQuestion({
    id: 'safety-urinary-unwell',
    text: 'Along with the urinary change, is there a high temperature, are you feeling generally unwell, or is there pain in your side or back?',
    caregiverText:
      'Along with the urinary change, does your child have a high temperature, seem generally unwell, or have pain in their side or back?',
    applicableComplaintIds: ['upper-abdominal-concern', 'lower-abdominal-pelvic-concern', 'general-region-concern'],
    liveWhen: ALWAYS,
    priority: { severity: 'urgent', dependencyRank: 60 },
    provenanceIds: [NHS_UTI_SAFETY_SOURCE_ID],
  }),
];

/*
  Branch checks added by the normalization pass. Each is scoped by
  contextual-safety.ts to the branch whose answers make it relevant, so it is
  never asked on a concern it does not belong to.
*/
const BRANCH_SAFETY_QUESTIONS: readonly SafetyQuestion[] = [
  ownedQuestion({
    id: 'safety-rectal-bleeding-heavy',
    text: 'Are you bleeding non-stop from your bottom, or is there a lot of blood, such as the toilet water turning red or large blood clots?',
    caregiverText:
      'Is your child bleeding non-stop from their bottom, or is there a lot of blood, such as the toilet water turning red or large blood clots?',
    applicableComplaintIds: ['upper-abdominal-concern', 'lower-abdominal-pelvic-concern', 'general-region-concern'],
    liveWhen: ALWAYS,
    priority: { severity: 'emergency', dependencyRank: 38 },
    provenanceIds: [NHS_RECTAL_BLEEDING_SAFETY_SOURCE_ID],
  }),
  ownedQuestion({
    id: 'safety-rectal-bleeding-urgent',
    text: 'Is your poo black or dark red, or is there blood mixed with diarrhoea?',
    caregiverText: 'Is your child’s poo black or dark red, or is there blood mixed with their diarrhoea?',
    applicableComplaintIds: ['upper-abdominal-concern', 'lower-abdominal-pelvic-concern', 'general-region-concern'],
    liveWhen: ALWAYS,
    priority: { severity: 'urgent', dependencyRank: 54 },
    provenanceIds: [NHS_RECTAL_BLEEDING_SAFETY_SOURCE_ID],
  }),
  ownedQuestion({
    id: 'safety-sinus-urgent',
    text: 'With these nose or sinus symptoms, do you feel very unwell, are painkillers not helping, or are the symptoms getting worse?',
    caregiverText:
      'With these nose or sinus symptoms, does your child seem very unwell, are painkillers not helping, or are their symptoms getting worse?',
    applicableComplaintIds: ['face-nose-concern'],
    liveWhen: ALWAYS,
    priority: { severity: 'urgent', dependencyRank: 58 },
    provenanceIds: [NHS_SINUSITIS_SAFETY_SOURCE_ID],
  }),
  ownedQuestion({
    id: 'safety-face-rash-eye-nose',
    text: 'Is the rash on or near your eye or nose, or has your vision changed?',
    caregiverText: 'Is the rash on or near your child’s eye or nose, or has their vision changed?',
    applicableComplaintIds: ['face-neurologic-concern', 'face-general-concern'],
    liveWhen: ALWAYS,
    priority: { severity: 'urgent', dependencyRank: 58 },
    provenanceIds: [NHS_SHINGLES_SAFETY_SOURCE_ID],
  }),
  /*
    Routing reconciliation: the immediate-danger pattern of each new branch.
    Each is asked only where its branch is open (contextual-safety.ts).
  */
  ownedQuestion({
    id: 'safety-palpitations-emergency',
    text: 'Is your heartbeat racing or irregular right now and not settling, or have you had chest pain, shortness of breath, or felt faint or fainted with it?',
    caregiverText: 'Is your child’s heartbeat racing or irregular right now and not settling, or have they had chest pain, shortness of breath, or felt faint or fainted with it?',
    applicableComplaintIds: ['chest-concern'],
    liveWhen: ALWAYS,
    priority: { severity: 'emergency', dependencyRank: 30 },
    provenanceIds: [NHS_PALPITATIONS_SAFETY_SOURCE_ID],
  }),
  ownedQuestion({
    id: 'safety-neuro-rapidly-progressive',
    text: 'Over hours or days, has the weakness or numbness spread to both sides of your body, or made walking, breathing or swallowing difficult?',
    caregiverText: 'Over hours or days, has your child’s weakness or numbness spread to both sides of their body, or made walking, breathing or swallowing difficult?',
    applicableComplaintIds: ['regional-neurologic-concern', 'neck-concern', 'face-neurologic-concern'],
    liveWhen: ALWAYS,
    priority: { severity: 'emergency', dependencyRank: 15 },
    provenanceIds: [NICE_NEUROLOGICAL_REFERRAL_SAFETY_SOURCE_ID],
  }),
  ownedQuestion({
    id: 'safety-back-cauda-equina',
    text: 'With the back pain, is there numbness, tingling or weakness in both legs, numbness around your genitals or bottom, or a new problem controlling your bladder or bowels?',
    caregiverText: 'With the back pain, does your child have numbness, tingling or weakness in both legs, numbness around their genitals or bottom, or a new problem controlling their bladder or bowels?',
    applicableComplaintIds: ['musculoskeletal-concern'],
    liveWhen: ALWAYS,
    priority: { severity: 'emergency', dependencyRank: 12 },
    provenanceIds: [NHS_BACK_PAIN_SAFETY_SOURCE_ID, NHS_SCIATICA_SAFETY_SOURCE_ID, NICE_NEUROLOGICAL_REFERRAL_SAFETY_SOURCE_ID],
  }),
  ownedQuestion({
    id: 'safety-upper-abdomen-injury-emergency',
    text: 'Since the injury, has your breathing or chest pain been getting worse, have you coughed up blood, is there pain in your shoulder, or did it happen in a serious accident such as a car crash?',
    caregiverText: 'Since the injury, has your child’s breathing or chest pain been getting worse, have they coughed up blood, is there pain in their shoulder, or did it happen in a serious accident such as a car crash?',
    applicableComplaintIds: ['general-region-concern', 'upper-abdominal-concern'],
    liveWhen: ALWAYS,
    priority: { severity: 'emergency', dependencyRank: 11 },
    provenanceIds: [NHS_BROKEN_RIBS_SAFETY_SOURCE_ID],
  }),
];

export const R3_SAFETY_QUESTIONS: readonly SafetyQuestion[] = [
  ...UPPER_ABDOMINAL_SAFETY_QUESTIONS,
  ...BREATHING_SAFETY_QUESTIONS,
  ...HEADACHE_SAFETY_QUESTIONS,
  ...JOINT_SAFETY_QUESTIONS,
  ...GENERIC_SAFETY_QUESTIONS,
  ...PEDIATRIC_SAFETY_QUESTIONS,
  ...BRANCH_SAFETY_QUESTIONS,
];
