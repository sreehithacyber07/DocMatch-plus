import type { RegionAssessmentContext } from '../body-explorer/clinical-coverage.ts';
import { answerIncludes, INTAKE_QUESTION_IDS, type IntakeAnswer } from './intake-questions.ts';

const WEIGHTED_SAFETY: Readonly<Record<string, readonly string[]>> = {
  'upper-abdominal-pain': [
    'upper-abdominal-pain-exertional',
    'upper-abdominal-pain-sweating',
    'upper-abdominal-pain-breathlessness',
  ],
  'shortness-of-breath': [
    'safety-shortness-of-breath-severe',
    'safety-shortness-of-breath-pale-blue-grey',
    'safety-shortness-of-breath-sudden-confusion',
    'safety-shortness-of-breath-coughing-blood',
  ],
  headache: [
    'safety-headache-sudden-extremely-painful',
    'safety-headache-new-one-sided-weakness',
    'safety-headache-speech-memory-vision',
    'safety-headache-drowsy-confused',
  ],
  'joint-musculoskeletal-pain': [
    'joint-musculoskeletal-pain-injury',
    'safety-joint-injury-severe-or-displaced',
    'safety-joint-injury-sensation-circulation',
    'safety-joint-sudden-hot-swollen',
  ],
};

/**
 * The Government of India IMNCI general danger signs, plus the young-infant
 * sign. IMNCI checks every sick child under five for these after asking what
 * the problem is and BEFORE the main symptoms, so they are the one safety
 * block the interview asks first rather than at the end.
 */
export const EARLY_SAFETY_QUESTION_IDS: ReadonlySet<string> = new Set([
  'safety-pediatric-severe-breathing',
  'safety-pediatric-unresponsive-or-seizure',
  'safety-pediatric-under-five-feeding-vomiting',
  'safety-infant-serious-illness',
]);

const MUSCULOSKELETAL_REGION = /(shoulder|arm|elbow|forearm|wrist|hand|hip|thigh|knee|leg|ankle|foot|back)/;

function answered(answers: readonly IntakeAnswer[], questionId: string, ...optionIds: readonly string[]): boolean {
  return answerIncludes(answers, questionId, optionIds);
}

/**
 * NHS Ear infections names swelling around the ear as an urgent reason to be
 * seen. It is asked when the branch points at it (a swelling concern, a local
 * swelling or outer-ear tenderness, or a feverish ear), not of every earache.
 */
function earSwellingRelevant(context: RegionAssessmentContext, answers: readonly IntakeAnswer[]): boolean {
  return context.concernId === 'swelling-lump'
    || answered(answers, INTAKE_QUESTION_IDS.earDetail, 'local', 'touch', 'outer')
    || answered(answers, INTAKE_QUESTION_IDS.earAssociated, 'unwell');
}

/**
 * The safety questions a child is asked.
 *
 * Age sets the population (IMNCI for under-fives, NHS child guidance above
 * that), anatomy and concern set which checks are relevant, and answers can
 * add the ones they make relevant. An emergency check that has nothing to do
 * with the child's complaint is not asked.
 */
function pediatricSafety(context: RegionAssessmentContext, intakeAnswers: readonly IntakeAnswer[]): Set<string> {
  const ids = new Set<string>();
  const concern = context.concernId;
  const complaint = context.complaintId;
  const face = context.faceSubregionId ?? '';
  const region = context.bodyRegionId;
  const underFive = context.pediatricAgeBand === 'infant-under-one' || context.pediatricAgeBand === 'young-child';
  const abdominal = region === 'upper-abdomen' || region === 'lower-abdomen' || region === 'pelvis';
  const upperAbdomenInjury = region === 'upper-abdomen'
    && (concern === 'injury' || answered(intakeAnswers, INTAKE_QUESTION_IDS.otherClarifier, 'injury'));

  if (underFive) {
    ids.add('safety-pediatric-severe-breathing');
    ids.add('safety-pediatric-unresponsive-or-seizure');
    ids.add('safety-pediatric-under-five-feeding-vomiting');
  }
  if (context.pediatricAgeBand === 'infant-under-one') ids.add('safety-infant-serious-illness');

  if (complaint === 'chest-breathing-concern' || region === 'chest') {
    ids.add('safety-pediatric-severe-breathing');
    if (underFive && complaint === 'chest-breathing-concern') {
      ids.add('safety-pediatric-chest-indrawing-or-stridor');
      ids.add('safety-pediatric-fast-breathing');
    }
  }
  if (complaint === 'throat-concern') {
    ids.add('safety-throat-airway');
    ids.add('safety-throat-urgent');
  }
  if (complaint === 'head-concern') {
    if (concern === 'pain') {
      ids.add('safety-pediatric-headache-sudden-or-injury');
      ids.add('safety-pediatric-headache-urgent');
    }
    ids.add('safety-pediatric-fever-stiff-neck-rash');
    ids.add('safety-pediatric-sudden-neurological-change');
    ids.add('safety-pediatric-unresponsive-or-seizure');
  }
  if (face.includes('ear')) {
    // IMNCI assesses tender swelling behind the ear for every ear problem under five.
    if (underFive) ids.add('safety-pediatric-under-five-ear-swelling');
    else if (earSwellingRelevant(context, intakeAnswers)) ids.add('safety-ear-swelling-behind-ear');
    if (concern === 'hearing-balance-change' && answered(intakeAnswers, INTAKE_QUESTION_IDS.pediatricEarObservation, 'balance')) {
      ids.add('safety-pediatric-sudden-neurological-change');
    }
  }
  if (face === 'nose' && (concern === 'bleeding-discharge' || concern === 'injury'
    || answered(intakeAnswers, INTAKE_QUESTION_IDS.pediatricNoseObservation, 'bleeding')
    || answered(intakeAnswers, INTAKE_QUESTION_IDS.noseDetail, 'bleeding', 'injury'))) {
    ids.add('safety-nosebleed-prolonged-or-excessive');
  }
  if (face === 'nose' && concern === 'nose-change') ids.add('safety-sinus-urgent');
  if (face && answered(intakeAnswers, INTAKE_QUESTION_IDS.neurologicFeatures, 'rash')) ids.add('safety-face-rash-eye-nose');
  if (abdominal && answered(intakeAnswers, INTAKE_QUESTION_IDS.bowelDetail, 'blood')) {
    ids.add('safety-rectal-bleeding-heavy');
    ids.add('safety-rectal-bleeding-urgent');
  }
  if (face.includes('eye') && ['pain', 'vision-change', 'eye-redness-discharge', 'injury'].includes(concern)) {
    ids.add('safety-eye-sudden-vision-loss-or-injury');
  }
  if (['weakness-drooping', 'numbness-tingling', 'vision-change'].includes(concern)) {
    ids.add('safety-pediatric-sudden-neurological-change');
  }
  if (abdominal && ['pain', 'bowel-change', 'other', 'swelling-lump'].includes(concern)) {
    ids.add('safety-pediatric-abdominal-emergency');
  }
  if (upperAbdomenInjury) ids.add('safety-upper-abdomen-injury-emergency');
  if (abdominal && (concern === 'bowel-change'
    || answered(intakeAnswers, INTAKE_QUESTION_IDS.abdominalAssociated, 'vomiting', 'diarrhoea')
    || answered(intakeAnswers, INTAKE_QUESTION_IDS.lowerAssociatedSystem, 'bowel', 'systemic'))) {
    ids.add('safety-pediatric-dehydration');
  }
  if (abdominal && (concern === 'urinary-change'
    || answered(intakeAnswers, INTAKE_QUESTION_IDS.lowerAssociatedSystem, 'urinary')
    || answered(intakeAnswers, INTAKE_QUESTION_IDS.abdominalAssociated, 'urine-pain')
    || answered(intakeAnswers, INTAKE_QUESTION_IDS.associatedLocation, 'lower-back', 'upper-back'))) {
    ids.add('safety-urinary-unwell');
  }
  if (concern === 'skin-change') {
    ids.add('safety-pediatric-fever-stiff-neck-rash');
    ids.add('safety-skin-airway-swelling');
  }
  if (concern === 'swelling-lump' && (region === 'face' || region === 'neck')) ids.add('safety-skin-airway-swelling');
  if ((region === 'neck' || face === 'upper-neck') && complaint !== 'throat-concern') {
    if (['voice-swallow', 'swelling-lump'].includes(concern)) ids.add('safety-skin-airway-swelling');
    if (answered(intakeAnswers, INTAKE_QUESTION_IDS.neckDetail, 'fever-head')) ids.add('safety-pediatric-fever-stiff-neck-rash');
  }
  if (MUSCULOSKELETAL_REGION.test(region) && (concern === 'injury'
    || intakeAnswers.some((answer) => answer.questionId === INTAKE_QUESTION_IDS.injuryDetail))) {
    ids.add('safety-pediatric-injury-emergency');
    ids.add('safety-injury-worsening');
  }
  if (region === 'chest' && concern === 'palpitations') ids.add('safety-palpitations-emergency');
  if (region === 'lower-back' && ['pain', 'injury', 'movement-function'].includes(concern)) ids.add('safety-back-cauda-equina');
  if (region === 'head' && concern === 'injury') {
    ids.add('safety-pediatric-unresponsive-or-seizure');
    ids.add('safety-pediatric-sudden-neurological-change');
  }
  return ids;
}

/**
 * Narrows R3 screening to the warning-sign concepts made relevant by the
 * patient-stated branch. This controls question eligibility only; it never
 * changes a rule predicate, severity, source, or payload.
 */
export function safetyQuestionIdsForClinicalContext(
  context: RegionAssessmentContext | null | undefined,
  intakeAnswers: readonly IntakeAnswer[],
): readonly string[] | undefined {
  if (!context) return undefined;
  if (context.patientMode === 'pediatric') return [...pediatricSafety(context, intakeAnswers)];

  const ids = new Set<string>();
  const concern = context.concernId;
  const upperAbdomenInjury = context.bodyRegionId === 'upper-abdomen'
    && (concern === 'injury' || answered(intakeAnswers, INTAKE_QUESTION_IDS.otherClarifier, 'injury'));

  const weighted = WEIGHTED_SAFETY[context.complaintId];
  if (weighted) return weighted;

  /*
    Adult limb injury and movement concerns run the musculoskeletal branch
    (not the weighted pain complaint), so the injury and hot-joint checks come
    with them: NHS Joint pain and Sprains and strains apply to adults too.
  */
  if (context.complaintId === 'musculoskeletal-concern') {
    if (concern === 'injury') {
      ids.add('safety-pediatric-injury-emergency');
      ids.add('safety-injury-worsening');
    }
    ids.add('safety-joint-sudden-hot-swollen');
    // NHS Back pain and Sciatica: the 999 back features are asked of any lower back concern.
    if (context.bodyRegionId === 'lower-back') ids.add('safety-back-cauda-equina');
  }
  // NHS Broken or bruised ribs: the upper-tummy/lower-rib injury branch owns
  // one exact immediate-danger check, including when "Something else" was
  // clarified to an injury.
  if (upperAbdomenInjury) ids.add('safety-upper-abdomen-injury-emergency');
  // NHS Heart palpitations: the 999 features, asked only in the heartbeat branch.
  if (context.bodyRegionId === 'chest' && concern === 'palpitations') ids.add('safety-palpitations-emergency');
  /*
    NICE NG127: rapidly progressive weakness or numbness, or weakness with
    breathing or swallowing difficulty, is referred immediately. Asked once the
    course answer makes it plausible, never of every numbness.
  */
  if (
    answered(intakeAnswers, INTAKE_QUESTION_IDS.neurologicCourse, 'quick')
    || (concern === 'weakness-drooping' && answered(intakeAnswers, INTAKE_QUESTION_IDS.neurologicCourse, 'gradual'))
  ) {
    ids.add('safety-neuro-rapidly-progressive');
  }

  if (concern === 'breathing') ids.add('safety-generic-severe-breathing');
  if (['weakness-drooping', 'numbness-tingling'].includes(concern)) {
    ids.add('safety-generic-new-neurological-change');
  }
  // NHS Vertigo: vertigo with double vision, hearing loss, speech change or limb weakness or numbness is an emergency.
  if (context.bodyRegionId === 'head' && concern === 'hearing-balance-change') ids.add('safety-generic-new-neurological-change');
  // The NHS vertigo source names speech, vision and limb change as the features
  // that separate a vestibular pattern from a neurological one, so the generic
  // neurological check becomes eligible once an adult ear branch actually
  // reports dizziness or balance change. Ear pain alone never activates it.
  if (
    context.complaintId === 'face-ear-concern'
    && (answered(intakeAnswers, INTAKE_QUESTION_IDS.earAssociated, 'dizzy')
      || answered(intakeAnswers, INTAKE_QUESTION_IDS.earDetail, 'spinning', 'unsteady', 'balance'))
  ) {
    ids.add('safety-generic-new-neurological-change');
  }
  if (context.complaintId === 'face-ear-concern' && earSwellingRelevant(context, intakeAnswers)) {
    ids.add('safety-ear-swelling-behind-ear');
  }
  if (context.bodyRegionId === 'lower-abdomen' || context.bodyRegionId === 'pelvis') {
    if (concern === 'pain' || concern === 'reproductive-pelvic-change') {
      ids.add('safety-lower-abdominal-severe-or-faint');
    }
    if (context.sexForAssessment === 'female' && concern === 'reproductive-pelvic-change') {
      ids.add('safety-lower-abdominal-heavy-bleeding');
    }
  }
  // NHS UTI guidance names a high or low temperature, shivering, and pain in
  // the back just under the ribs as reasons for an urgent appointment in
  // adults too. It is asked once the urinary branch is actually open.
  if (
    ['lower-abdomen', 'pelvis', 'upper-abdomen'].includes(context.bodyRegionId)
    && (concern === 'urinary-change'
      || answered(intakeAnswers, INTAKE_QUESTION_IDS.lowerAssociatedSystem, 'urinary')
      || answered(intakeAnswers, INTAKE_QUESTION_IDS.abdominalAssociated, 'urine-pain')
      // NHS Kidney infection: tummy pain also felt in the back or side.
      || answered(intakeAnswers, INTAKE_QUESTION_IDS.associatedLocation, 'lower-back', 'upper-back'))
  ) {
    ids.add('safety-urinary-unwell');
  }
  if (context.complaintId === 'face-eye-concern' && ['pain', 'vision-change', 'eye-redness-discharge', 'injury'].includes(concern)) {
    ids.add('safety-eye-sudden-vision-loss-or-injury');
  }
  // Nasal trauma is the other branch the NHS nosebleed guidance covers, so the
  // prolonged or excessive bleeding check is eligible there as well. It stays
  // out of blockage, discharge and smell branches, which have no bleeding.
  if (context.complaintId === 'face-nose-concern' && (concern === 'bleeding-discharge' || concern === 'injury'
    || answered(intakeAnswers, INTAKE_QUESTION_IDS.noseDetail, 'bleeding', 'injury'))) {
    ids.add('safety-nosebleed-prolonged-or-excessive');
  }
  // NHS Sinusitis: very unwell, painkillers not helping or getting worse is urgent.
  if (context.complaintId === 'face-nose-concern' && concern === 'nose-change') ids.add('safety-sinus-urgent');
  // NHS Shingles: a facial rash on the eye or nose, or a vision change, is urgent.
  if (context.bodyRegionId === 'face' && answered(intakeAnswers, INTAKE_QUESTION_IDS.neurologicFeatures, 'rash')) {
    ids.add('safety-face-rash-eye-nose');
  }
  // NHS Rectal bleeding: two sourced levels once blood is reported. Blood alone is not escalated.
  if (
    ['lower-abdomen', 'pelvis', 'upper-abdomen'].includes(context.bodyRegionId)
    && answered(intakeAnswers, INTAKE_QUESTION_IDS.bowelDetail, 'blood')
  ) {
    ids.add('safety-rectal-bleeding-heavy');
    ids.add('safety-rectal-bleeding-urgent');
  }
  if (context.bodyRegionId === 'chest' && concern === 'pain') {
    ids.add('safety-chest-persistent-spreading-associated');
  }
  if (context.complaintId === 'throat-concern') {
    ids.add('safety-throat-airway');
    ids.add('safety-throat-urgent');
  }
  if (
    ['skin-change', 'swelling-lump'].includes(concern)
    // A burning or swallowing concern felt in the chest is reflux-type, not an airway swelling.
    || (concern === 'voice-swallow' && context.complaintId !== 'throat-concern' && context.bodyRegionId !== 'chest')
    || answered(intakeAnswers, INTAKE_QUESTION_IDS.skinDetail, 'mouth-face')
  ) {
    ids.add('safety-skin-airway-swelling');
  }
  if (
    (context.bodyRegionId === 'neck' || context.faceSubregionId === 'upper-neck')
    && answered(intakeAnswers, INTAKE_QUESTION_IDS.neckDetail, 'fever-head')
  ) {
    ids.add('safety-neck-meningitis-warning-pattern');
  }
  return [...ids];
}
