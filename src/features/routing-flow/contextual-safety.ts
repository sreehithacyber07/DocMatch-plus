import type { RegionAssessmentContext } from '../body-explorer/clinical-coverage.ts';
import { answerIncludes, clarifiedContext, INTAKE_QUESTION_IDS, type IntakeAnswer } from './intake-questions.ts';

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
const ORAL: ReadonlySet<string> = new Set(['mouth', 'patient-right-jaw', 'patient-left-jaw', 'chin']);

function answered(answers: readonly IntakeAnswer[], questionId: string, ...optionIds: readonly string[]): boolean {
  return answerIncludes(answers, questionId, optionIds);
}

/**
 * NHS Ear infections names swelling around the ear as an urgent reason to be
 * seen. It is asked when the branch points at it (a swelling concern, a local
 * swelling or outer-ear tenderness, or a feverish ear), not of every earache.
 */
/**
 * NHS Dental abscess and Toothache send swelling around the eye or neck, a lot
 * of swelling in the mouth, or a mouth that will not open, to 999 or A&E
 * (PENDING CLINICAL REVIEW). Asked once an oral problem is placed in a tooth
 * or the gum, a dental swelling or high temperature is reported, or the
 * concern is a swelling in the mouth or jaw.
 */
function dentalSpreadRelevant(context: RegionAssessmentContext, answers: readonly IntakeAnswer[]): boolean {
  // Phase 3: a facial pain that comes from a tooth carries the same dental emergency check.
  if (context.complaintId === 'face-general-concern' && answered(answers, INTAKE_QUESTION_IDS.facePainPattern, 'tooth')) return true;
  if (context.bodyRegionId !== 'face' || !ORAL.has(context.faceSubregionId ?? '')) return false;
  return context.concernId === 'swelling-lump'
    || answered(answers, INTAKE_QUESTION_IDS.jawDetail, 'tooth-gum')
    || answered(answers, INTAKE_QUESTION_IDS.mouthDetail, 'tooth-gum', 'gums', 'tooth')
    || answered(answers, INTAKE_QUESTION_IDS.jawAssociated, 'tooth')
    || answered(answers, INTAKE_QUESTION_IDS.toothFeatures, 'swelling', 'temperature')
    || answered(answers, INTAKE_QUESTION_IDS.oralSwellingSite, 'tooth-gum');
}

/**
 * Phase 2 checks (PENDING CLINICAL REVIEW), each made relevant by the branch
 * or by an answer, never asked of every patient:
 *
 *   NHS DVT            a lower-limb swelling, or pain and swelling in one calf
 *                      or leg, or discoloured skin over a painful lower leg
 *   NHS Hernia         a tummy or groin lump with any hernia feature
 *   NHS GCA            temple or scalp tenderness, jaw pain or vision change
 *   NHS Back pain      any adult back pain
 *   NHS Cellulitis     skin reported as painful, hot or quickly getting worse
 *   NHS Varicose veins a bleeding vein
 *   NHS Broken ribs    a chest injury
 */
const LOWER_LIMB = /(thigh|knee|lower-leg|ankle|foot)/;
function expansionSafety(context: RegionAssessmentContext, answers: readonly IntakeAnswer[]): string[] {
  const ids: string[] = [];
  const region = context.bodyRegionId;
  const concern = context.concernId;
  if (LOWER_LIMB.test(region) && (
    concern === 'swelling-lump'
    || answered(answers, INTAKE_QUESTION_IDS.mskSiteFeatures, 'one-calf', 'skin-colour', 'calf-ankle-swelling')
    || answered(answers, INTAKE_QUESTION_IDS.legVeinFeatures, 'one-leg')
  )) ids.push('safety-dvt-one-leg', 'safety-dvt-breathless-chest');
  if (answered(answers, INTAKE_QUESTION_IDS.legVeinFeatures, 'bleeding-vein')) ids.push('safety-varicose-bleeding');
  if (answered(answers, INTAKE_QUESTION_IDS.herniaFeatures, 'bigger-cough', 'smaller-lying', 'tight-skin', 'dragging', 'pain', 'sick-bloated')) {
    ids.push('safety-hernia-complication');
  }
  if (answered(answers, INTAKE_QUESTION_IDS.templeFeatures, 'scalp-tender', 'jaw-eating', 'vision')) ids.push('safety-gca-features');
  if (/back/.test(region) && concern === 'pain' && context.patientMode === 'adult') ids.push('safety-back-urgent');
  if (answered(answers, INTAKE_QUESTION_IDS.skinDetail, 'painful-hot')) ids.push('safety-skin-hot-swollen', 'safety-skin-infection-emergency');
  if (region === 'chest' && concern === 'injury') ids.push('safety-upper-abdomen-injury-emergency');
  /*
    Phase 3 (PENDING CLINICAL REVIEW). A head or face injury is asked the NHS
    Head injury 999 and 111 lists. A child is already asked the unresponsive,
    fit and sudden neurological checks, so only the mechanism and urgent
    questions are added for a child. A nose injury adds the NHS Broken nose
    A&E signs; a neck injury the NHS Whiplash urgent signs.
  */
  const neckArea = region === 'neck' || context.faceSubregionId === 'upper-neck';
  if (concern === 'injury' && (region === 'head' || region === 'face') && !neckArea) {
    if (context.patientMode === 'adult') ids.push('safety-head-injury-signs');
    ids.push('safety-head-injury-mechanism', 'safety-head-injury-urgent');
  }
  if (concern === 'injury' && context.faceSubregionId === 'nose') ids.push('safety-nose-injury-emergency', 'safety-nose-injury-urgent');
  if (concern === 'injury' && neckArea) ids.push('safety-neck-injury-urgent');
  /*
    Phase 4 (PENDING CLINICAL REVIEW). What was noticed after a face injury
    opens the matching NHS lists: a black eye the NHS Black eye A&E and urgent
    lists, a cut or wound the NHS Broken nose face-wound item. Facial weakness
    is asked the NHS Bell's palsy urgent features (a sudden droop stays with
    the stroke check), a voice or swallowing concern the NHS Swallowing
    problems urgent list, and a lower tummy or pelvic injury the NHS Blood in
    urine urgent check.
  */
  if (answered(answers, INTAKE_QUESTION_IDS.faceInjuryFeatures, 'black-eye')) ids.push('safety-black-eye-emergency', 'safety-black-eye-urgent');
  if (answered(answers, INTAKE_QUESTION_IDS.faceInjuryFeatures, 'wound')) ids.push('safety-face-wound-emergency');
  if (concern === 'weakness-drooping' && region === 'face') ids.push('safety-face-weakness-urgent');
  if (concern === 'voice-swallow') ids.push('safety-swallowing-urgent');
  if (concern === 'injury' && (region === 'lower-abdomen' || region === 'pelvis')) ids.push('safety-lower-injury-blood-in-urine');
  return ids;
}

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
  if (dentalSpreadRelevant(context, intakeAnswers)) ids.add('safety-dental-spreading-swelling');
  for (const id of expansionSafety(context, intakeAnswers)) ids.add(id);
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
  if (abdominal && ['pain', 'bowel-change', 'other', 'swelling-lump', 'injury'].includes(concern)) {
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
  // A clarified "Something else" is screened as the family it was clarified to (phase 2).
  context = clarifiedContext(context, intakeAnswers);
  if (context.patientMode === 'pediatric') return [...pediatricSafety(context, intakeAnswers)];

  const ids = new Set<string>();
  const concern = context.concernId;
  const upperAbdomenInjury = context.bodyRegionId === 'upper-abdomen'
    && (concern === 'injury' || answered(intakeAnswers, INTAKE_QUESTION_IDS.otherClarifier, 'injury'));

  const weighted = WEIGHTED_SAFETY[context.complaintId];
  /*
    The approved weighted safety sets are frozen. The phase 2 checks are not
    added to them: adult limb pain runs the weighted joint complaint, so a calf
    clot or an urgent back feature reported there is recorded in the answers
    but not screened by R3. Adding them is a clinical review item
    (docs/clinical-expansion/phase-2), not a silent change to approved rules.
  */
  if (weighted) {
    // Phase 3 candidate fix (PENDING CLINICAL REVIEW): separate joint-specific
    // clot and back checks, added beside the frozen set only where they apply.
    if (context.complaintId !== 'joint-musculoskeletal-pain') return weighted;
    const extra: string[] = [];
    if (LOWER_LIMB.test(context.bodyRegionId)) extra.push('safety-joint-dvt-one-leg', 'safety-joint-dvt-breathless');
    if (context.bodyRegionId === 'upper-back') extra.push('safety-joint-back-urgent');
    return [...weighted, ...extra];
  }
  for (const id of expansionSafety(context, intakeAnswers)) ids.add(id);

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
    // Phase 4: severe or worsening pain, or feeling faint, is the same emergency after an injury,
    // and for a concern described as something else once it is worse with movement or touch or comes with feeling unwell.
    if (concern === 'pain' || concern === 'reproductive-pelvic-change' || concern === 'injury'
      || answered(intakeAnswers, INTAKE_QUESTION_IDS.lowerAssociatedSystem, 'movement', 'systemic')) {
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
  if (dentalSpreadRelevant(context, intakeAnswers)) ids.add('safety-dental-spreading-swelling');
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
