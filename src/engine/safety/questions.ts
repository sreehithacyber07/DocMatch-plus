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
  NHS_HEAD_INJURY_SAFETY_SOURCE_ID,
  NHS_BROKEN_NOSE_SAFETY_SOURCE_ID,
  NHS_WHIPLASH_SAFETY_SOURCE_ID,
  NHS_BLACK_EYE_SAFETY_SOURCE_ID,
  NHS_BELLS_PALSY_SAFETY_SOURCE_ID,
  NHS_SWALLOWING_SAFETY_SOURCE_ID,
  NHS_BLOOD_IN_URINE_SAFETY_SOURCE_ID,
  NHS_DVT_SAFETY_SOURCE_ID,
  NHS_HERNIA_SAFETY_SOURCE_ID,
  NHS_GCA_SAFETY_SOURCE_ID,
  NHS_CELLULITIS_SAFETY_SOURCE_ID,
  NHS_VARICOSE_VEINS_SAFETY_SOURCE_ID,
  NHS_DENTAL_ABSCESS_SAFETY_SOURCE_ID,
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
    /*
      PENDING CLINICAL REVIEW. NHS Dental abscess and Toothache send these to
      999 or A&E. Breathing, speaking and swallowing difficulty is already the
      airway check, so it is not repeated here.
    */
    id: 'safety-dental-spreading-swelling',
    text: 'Is there swelling around your eye or in your neck, a lot of swelling inside your mouth, or is it hard to open your mouth?',
    caregiverText:
      'Is there swelling around your child’s eye or in their neck, a lot of swelling inside their mouth, or is it hard for them to open their mouth?',
    applicableComplaintIds: ['face-oral-jaw-concern', 'face-general-concern'],
    liveWhen: ALWAYS,
    priority: { severity: 'emergency', dependencyRank: 35 },
    provenanceIds: [NHS_DENTAL_ABSCESS_SAFETY_SOURCE_ID],
  }),
  /* --- Questionnaire expansion phase 2 (PENDING CLINICAL REVIEW) ----------- */
  ownedQuestion({
    id: 'safety-dvt-one-leg',
    text: 'Is there throbbing pain and swelling in one leg, usually in the calf or thigh?',
    caregiverText: 'Does your child have throbbing pain and swelling in one leg, usually in the calf or thigh?',
    applicableComplaintIds: ['musculoskeletal-concern', 'regional-skin-concern', 'general-region-concern'],
    liveWhen: ALWAYS,
    // Screened at emergency priority because its emergency follow-up depends on it
    // and a dependency must come first; a yes on its own still fires only the urgent rule.
    priority: { severity: 'emergency', dependencyRank: 36 },
    provenanceIds: [NHS_DVT_SAFETY_SOURCE_ID],
  }),
  /*
    Phase 3 candidate fix (PENDING CLINICAL REVIEW). Adult limb pain runs the
    weighted joint complaint, whose approved checks are left unchanged. These
    are separate, joint-specific checks. The clot screen is live only after
    the approved R1 question reports a swollen area (NHS DVT: pain AND
    swelling); the back screen only when the pain did not follow an injury
    (an injury has its own approved severity checks). With a clinical
    context the interview asks them only for the lower limb and the upper back.
  */
  /* --- Phase 3: head, face, nose and neck injury (PENDING CLINICAL REVIEW) -- */
  ownedQuestion({
    id: 'safety-head-injury-signs',
    text: 'Since the injury, has there been any of these: being knocked out, a fit, being unable to stay awake, new problems with vision, hearing, walking, balance, speech or understanding, new numbness or weakness, or a change in behaviour?',
    caregiverText: 'Since the injury, has your child had any of these: being knocked out, a fit, being unable to stay awake, new problems with vision, hearing, walking, balance, speech or understanding, new numbness or weakness, or a change in behaviour?',
    applicableComplaintIds: ['general-region-concern', 'face-general-concern', 'face-nose-concern', 'face-eye-concern', 'face-ear-concern', 'face-oral-jaw-concern', 'head-concern'],
    liveWhen: ALWAYS,
    priority: { severity: 'emergency', dependencyRank: 13 },
    provenanceIds: [NHS_HEAD_INJURY_SAFETY_SOURCE_ID],
  }),
  ownedQuestion({
    id: 'safety-head-injury-mechanism',
    text: 'Did it happen in a fall from more than 1 metre or 5 stairs, or at high speed such as a road accident, or is there clear fluid or blood from the ears or nose, bruising behind the ears, a black eye without the eye being hit, or a dent in the head or something in the wound?',
    caregiverText: 'Did it happen in a fall from more than 1 metre or 5 stairs, or at high speed such as a road accident, or is there clear fluid or blood from your child\'s ears or nose, bruising behind the ears, a black eye without the eye being hit, a dent in the head or something in the wound, or, for a baby under 1, any bruise, swelling or large cut on the head?',
    applicableComplaintIds: ['general-region-concern', 'face-general-concern', 'face-nose-concern', 'face-eye-concern', 'face-ear-concern', 'face-oral-jaw-concern', 'head-concern'],
    liveWhen: ALWAYS,
    priority: { severity: 'emergency', dependencyRank: 14 },
    provenanceIds: [NHS_HEAD_INJURY_SAFETY_SOURCE_ID],
  }),
  ownedQuestion({
    id: 'safety-head-injury-urgent',
    text: 'Since the injury, have you been sick or felt dizzy, or do you take a medicine that thins the blood, or had you been drinking alcohol or taking drugs at the time?',
    caregiverText: 'Since the injury, has your child been sick or seemed dizzy, or does your child take a medicine that thins the blood?',
    applicableComplaintIds: ['general-region-concern', 'face-general-concern', 'face-nose-concern', 'face-eye-concern', 'face-ear-concern', 'face-oral-jaw-concern', 'head-concern'],
    liveWhen: ALWAYS,
    priority: { severity: 'urgent', dependencyRank: 68 },
    provenanceIds: [NHS_HEAD_INJURY_SAFETY_SOURCE_ID],
  }),
  ownedQuestion({
    id: 'safety-nose-injury-emergency',
    text: 'Since the nose injury, is there a purple swelling inside the nose, a severe headache with blurred or double vision, eye pain and double vision, neck pain or a stiff neck with numbness or tingling in the arms, or a large cut or open wound on the nose or face, or something in the wound such as glass?',
    caregiverText: 'Since the nose injury, does your child have a purple swelling inside the nose, a severe headache with blurred or double vision, eye pain and double vision, neck pain or a stiff neck with numbness or tingling in the arms, or a large cut or open wound on the nose or face, or something in the wound such as glass?',
    applicableComplaintIds: ['face-nose-concern'],
    liveWhen: ALWAYS,
    priority: { severity: 'emergency', dependencyRank: 15 },
    provenanceIds: [NHS_BROKEN_NOSE_SAFETY_SOURCE_ID],
  }),
  /* Phase 4 (PENDING CLINICAL REVIEW). Each text is the source's own list, minus items another check already asks. */
  ownedQuestion({
    id: 'safety-nose-injury-urgent',
    text: 'Since the nose injury, is your nose crooked, has the swelling not started to go down after 3 days, are painkillers not helping, is it still hard to breathe through your nose after the swelling has gone, are you having regular nosebleeds, or is there a very high temperature or a hot, cold or shivery feeling?',
    caregiverText: 'Since the nose injury, is your child\'s nose crooked, has the swelling not started to go down after 3 days, are painkillers not helping, is it still hard for them to breathe through their nose after the swelling has gone, are they having regular nosebleeds, or do they have a very high temperature or seem hot, cold or shivery?',
    applicableComplaintIds: ['face-nose-concern'],
    liveWhen: ALWAYS,
    priority: { severity: 'urgent', dependencyRank: 70 },
    provenanceIds: [NHS_BROKEN_NOSE_SAFETY_SOURCE_ID],
  }),
  ownedQuestion({
    id: 'safety-face-wound-emergency',
    text: 'Is it a large cut or open wound on your face, or is there something in the wound, such as glass?',
    caregiverText: 'Does your child have a large cut or open wound on their face, or something in the wound, such as glass?',
    applicableComplaintIds: ['face-general-concern', 'face-oral-jaw-concern'],
    liveWhen: ALWAYS,
    priority: { severity: 'emergency', dependencyRank: 16 },
    provenanceIds: [NHS_BROKEN_NOSE_SAFETY_SOURCE_ID],
  }),
  ownedQuestion({
    id: 'safety-black-eye-emergency',
    text: 'With the black eye, can you see blood in the eye, is the black centre of the eye an unusual shape, is there bruising around both eyes, or is there double vision, loss of vision, flashing lights, halos or shadows, pain when looking at a bright light, or an eye that will not move?',
    caregiverText: 'With the black eye, can you see blood in your child\'s eye, is the black centre of the eye an unusual shape, is there bruising around both eyes, or does your child have double vision, loss of vision, flashing lights, halos or shadows, pain when looking at a bright light, or an eye they cannot move?',
    applicableComplaintIds: ['face-general-concern', 'face-oral-jaw-concern'],
    liveWhen: ALWAYS,
    priority: { severity: 'emergency', dependencyRank: 17 },
    provenanceIds: [NHS_BLACK_EYE_SAFETY_SOURCE_ID],
  }),
  ownedQuestion({
    id: 'safety-black-eye-urgent',
    text: 'With the black eye, is there a headache that does not go away or blurry vision, is the area around the eye warm or leaking pus, is there a very high temperature or a hot, cold or shivery feeling, or is there a bleeding disorder such as haemophilia?',
    caregiverText: 'With the black eye, does your child have a headache that does not go away or blurry vision, is the area around the eye warm or leaking pus, do they have a very high temperature or seem hot, cold or shivery, or do they have a bleeding disorder such as haemophilia?',
    applicableComplaintIds: ['face-general-concern', 'face-oral-jaw-concern'],
    liveWhen: ALWAYS,
    priority: { severity: 'urgent', dependencyRank: 71 },
    provenanceIds: [NHS_BLACK_EYE_SAFETY_SOURCE_ID],
  }),
  ownedQuestion({
    id: 'safety-face-weakness-urgent',
    text: 'Has one side of your face become weak or hard to move over a few days, or is there a drooping eyelid or corner of the mouth, drooling, a dry mouth, loss of taste, or a dry or watering eye?',
    caregiverText: 'Has one side of your child\'s face become weak or hard to move over a few days, or do they have a drooping eyelid or corner of the mouth, drooling, a dry mouth, loss of taste, or a dry or watering eye?',
    applicableComplaintIds: ['face-neurologic-concern'],
    liveWhen: ALWAYS,
    priority: { severity: 'urgent', dependencyRank: 72 },
    provenanceIds: [NHS_BELLS_PALSY_SAFETY_SOURCE_ID],
  }),
  ownedQuestion({
    id: 'safety-swallowing-urgent',
    text: 'Is it difficult to swallow, or do you cough or choke when eating or drinking, feel that something is stuck in your throat after eating, keep bringing food back up, have a wet, gurgly voice or feel short of breath after eating or drinking, or get lots of chest infections?',
    caregiverText: 'Does your child have difficulty swallowing, cough or choke when eating or drinking, seem to have something stuck in their throat after eating, keep bringing food or milk back up, cry a lot or arch their back when feeding, have a wet, gurgly voice or get short of breath after eating or drinking, or get lots of chest infections?',
    applicableComplaintIds: ['throat-concern', 'chest-concern', 'neck-concern', 'face-general-concern', 'face-oral-jaw-concern'],
    liveWhen: ALWAYS,
    priority: { severity: 'urgent', dependencyRank: 73 },
    provenanceIds: [NHS_SWALLOWING_SAFETY_SOURCE_ID],
  }),
  ownedQuestion({
    id: 'safety-lower-injury-blood-in-urine',
    text: 'Since the injury, have you had blood in your pee, or do you think you may have?',
    caregiverText: 'Since the injury, has your child had blood in their pee, or do you think they may have?',
    applicableComplaintIds: LOWER_ABDOMINAL_COMPLAINTS,
    liveWhen: ALWAYS,
    priority: { severity: 'urgent', dependencyRank: 74 },
    provenanceIds: [NHS_BLOOD_IN_URINE_SAFETY_SOURCE_ID],
  }),
  ownedQuestion({
    id: 'safety-neck-injury-urgent',
    text: 'Since the neck injury, is there severe pain even with painkillers, tingling or pins and needles on one or both sides of the body, problems walking or sitting upright, a sudden electric-shock feeling in the neck and back, or weakness in the hands, arms or legs?',
    caregiverText: 'Since the neck injury, does your child have severe pain even with painkillers, tingling or pins and needles on one or both sides of the body, problems walking or sitting upright, a sudden electric-shock feeling in the neck and back, or weakness in the hands, arms or legs?',
    applicableComplaintIds: ['neck-concern', 'face-general-concern'],
    liveWhen: ALWAYS,
    priority: { severity: 'urgent', dependencyRank: 69 },
    provenanceIds: [NHS_WHIPLASH_SAFETY_SOURCE_ID],
  }),
  ownedQuestion({
    id: 'safety-joint-dvt-one-leg',
    text: 'Is the pain and swelling in one leg, throbbing, usually in the calf or thigh?',
    applicableComplaintIds: ['joint-musculoskeletal-pain'],
    liveWhen: answerEquals('joint-musculoskeletal-pain-swelling-bruising', 'yes'),
    priority: { severity: 'emergency', dependencyRank: 36 },
    provenanceIds: [NHS_DVT_SAFETY_SOURCE_ID],
  }),
  ownedQuestion({
    id: 'safety-joint-dvt-breathless',
    text: 'With the leg pain and swelling, is there any shortness of breath or chest pain?',
    applicableComplaintIds: ['joint-musculoskeletal-pain'],
    liveWhen: answerEquals('safety-joint-dvt-one-leg', 'yes'),
    priority: { severity: 'emergency', dependencyRank: 37 },
    provenanceIds: [NHS_DVT_SAFETY_SOURCE_ID],
  }),
  ownedQuestion({
    id: 'safety-joint-back-urgent',
    text: 'Do you feel hot, cold, shivery or generally unwell, or is the back pain severe and started suddenly, or getting worse quickly?',
    applicableComplaintIds: ['joint-musculoskeletal-pain'],
    liveWhen: answerEquals('joint-musculoskeletal-pain-injury', 'no'),
    priority: { severity: 'urgent', dependencyRank: 65 },
    provenanceIds: [NHS_BACK_PAIN_SAFETY_SOURCE_ID],
  }),
  ownedQuestion({
    id: 'safety-dvt-breathless-chest',
    text: 'With the leg pain or swelling, is there any shortness of breath or chest pain?',
    caregiverText: 'With the leg pain or swelling, is your child short of breath, or do they have chest pain?',
    applicableComplaintIds: ['musculoskeletal-concern', 'regional-skin-concern', 'general-region-concern'],
    liveWhen: answerEquals('safety-dvt-one-leg', 'yes'),
    priority: { severity: 'emergency', dependencyRank: 37 },
    provenanceIds: [NHS_DVT_SAFETY_SOURCE_ID],
  }),
  ownedQuestion({
    id: 'safety-hernia-complication',
    text: 'With the lump, is there pain in or around it, a bloated tummy, feeling or being sick, constipation, or a high temperature?',
    caregiverText: 'With the lump, does your child have pain in or around it, a bloated tummy, feeling or being sick, constipation, or a high temperature?',
    applicableComplaintIds: ['general-region-concern', 'lower-abdominal-pelvic-concern', 'upper-abdominal-concern'],
    liveWhen: ALWAYS,
    priority: { severity: 'urgent', dependencyRank: 63 },
    provenanceIds: [NHS_HERNIA_SAFETY_SOURCE_ID],
  }),
  ownedQuestion({
    id: 'safety-gca-features',
    text: 'Are your temples or scalp tender, or does your jaw hurt when eating or talking, together with new or severe headaches or any change in your vision?',
    applicableComplaintIds: ['face-general-concern'],
    liveWhen: ALWAYS,
    priority: { severity: 'urgent', dependencyRank: 64 },
    provenanceIds: [NHS_GCA_SAFETY_SOURCE_ID],
  }),
  ownedQuestion({
    id: 'safety-back-urgent',
    text: 'Do you feel hot, cold, shivery or generally unwell, or is the back pain severe and started suddenly, or getting worse quickly?',
    caregiverText: 'Does your child feel hot, cold, shivery or generally unwell, or is the back pain severe and started suddenly, or getting worse quickly?',
    applicableComplaintIds: ['musculoskeletal-concern'],
    liveWhen: ALWAYS,
    priority: { severity: 'urgent', dependencyRank: 65 },
    provenanceIds: [NHS_BACK_PAIN_SAFETY_SOURCE_ID],
  }),
  ownedQuestion({
    id: 'safety-skin-hot-swollen',
    text: 'Is the skin painful, hot and swollen?',
    caregiverText: 'Is your child\'s skin painful, hot and swollen?',
    applicableComplaintIds: ['regional-skin-concern', 'face-general-concern'],
    liveWhen: ALWAYS,
    // Screened at emergency priority because its emergency follow-up depends on it.
    priority: { severity: 'emergency', dependencyRank: 36 },
    provenanceIds: [NHS_CELLULITIS_SAFETY_SOURCE_ID],
  }),
  ownedQuestion({
    id: 'safety-skin-infection-emergency',
    text: 'With the hot, swollen skin, is there a very high temperature or feeling hot, cold or shivery, a fast heartbeat or fast breathing, purple patches, dizziness or faintness, or confusion?',
    caregiverText: 'With the hot, swollen skin, does your child have a very high temperature or seem hot, cold or shivery, a fast heartbeat or fast breathing, purple patches, seem dizzy or faint, or seem confused?',
    applicableComplaintIds: ['regional-skin-concern', 'face-general-concern'],
    liveWhen: answerEquals('safety-skin-hot-swollen', 'yes'),
    priority: { severity: 'emergency', dependencyRank: 37 },
    provenanceIds: [NHS_CELLULITIS_SAFETY_SOURCE_ID],
  }),
  ownedQuestion({
    id: 'safety-varicose-bleeding',
    text: 'Is a vein on your leg bleeding?',
    caregiverText: 'Is a vein on your child\'s leg bleeding?',
    applicableComplaintIds: ['musculoskeletal-concern', 'regional-skin-concern', 'general-region-concern'],
    liveWhen: ALWAYS,
    priority: { severity: 'urgent', dependencyRank: 67 },
    provenanceIds: [NHS_VARICOSE_VEINS_SAFETY_SOURCE_ID],
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
    // A chest injury joined in phase 2: NHS Broken or bruised ribs is about the chest wall (PENDING CLINICAL REVIEW).
    applicableComplaintIds: ['general-region-concern', 'upper-abdominal-concern', 'chest-concern'],
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
