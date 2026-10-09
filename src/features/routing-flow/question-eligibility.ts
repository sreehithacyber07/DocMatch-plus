/**
 * Question eligibility: where each canonical concept may be asked at all.
 *
 * The branch builder (intake-questions.ts coveragePlan) decides what to ask.
 * This table states, independently, where each concept is ALLOWED to appear:
 * which anatomy, which concerns, which ages and which physiology. The tests
 * walk every region, face area, concern, age and sex and assert that every
 * planned question sits inside its declared scope, so a reproductive question
 * on a male run, a bowel question at a wrist, or a urinary question at the
 * face is a failing test, not a code review finding.
 *
 * The specialties a concept discriminates are NOT restated here: they are
 * derived from the published criteria in direction-gate.ts, so the two can
 * never drift apart.
 *
 * Generic history concepts (what it feels like, how much it bothers you, how
 * long, how it began) are deliberately reusable and are declared `any`: that
 * reuse is intentional and is reported as such by the repetition audit.
 */
import type { RegionAssessmentContext, RegionConcernId } from '../body-explorer/clinical-coverage.ts';
import { DIRECTION_CRITERIA_SETS } from './direction-gate.ts';
import { INTAKE_QUESTION_IDS as Q, otherClarifierFamilies } from './intake-questions.ts';

type Area =
  | 'any' | 'head' | 'neck' | 'chest' | 'upper-abdomen' | 'abdomen' | 'lower-abdomen' | 'limb' | 'lower-back'
  | 'face' | 'face-eye' | 'face-ear' | 'face-nose' | 'face-oral' | 'face-upper-neck' | 'face-general';

export interface ConceptScope {
  areas: readonly Area[];
  concerns: 'any' | readonly RegionConcernId[];
  ages: 'all' | 'adult' | 'child';
  physiology: 'all' | 'female-or-explicit';
  /** Why the concept may be reused across anatomy, when it may. */
  reuse?: string;
}

const MSK = /(shoulder|arm|elbow|forearm|wrist|hand|hip|thigh|knee|leg|ankle|foot|back)/;
const EYE = ['patient-right-eye', 'patient-left-eye'];
const EAR = ['patient-right-ear', 'patient-left-ear'];
const ORAL = ['mouth', 'patient-right-jaw', 'patient-left-jaw', 'chin'];

function inArea(area: Area, context: RegionAssessmentContext): boolean {
  const region = context.bodyRegionId;
  const face = context.faceSubregionId ?? '';
  switch (area) {
    case 'any': return true;
    case 'head': return region === 'head';
    case 'neck': return region === 'neck' || face === 'upper-neck';
    case 'chest': return region === 'chest';
    case 'upper-abdomen': return region === 'upper-abdomen';
    case 'lower-abdomen': return region === 'lower-abdomen' || region === 'pelvis';
    case 'abdomen': return region === 'upper-abdomen' || region === 'lower-abdomen' || region === 'pelvis';
    case 'limb': return MSK.test(region);
    case 'lower-back': return region === 'lower-back';
    case 'face': return region === 'face';
    case 'face-eye': return region === 'face' && EYE.includes(face);
    case 'face-ear': return region === 'face' && EAR.includes(face);
    case 'face-nose': return region === 'face' && face === 'nose';
    case 'face-oral': return region === 'face' && ORAL.includes(face);
    case 'face-upper-neck': return region === 'face' && face === 'upper-neck';
    case 'face-general': return region === 'face' && !EYE.includes(face) && !EAR.includes(face) && !ORAL.includes(face) && face !== 'nose' && face !== 'upper-neck';
  }
}

const GENERIC = 'A generic history concept (character, impact, timeline, onset): intentionally reused wherever a branch has nothing more specific.';
const scope = (areas: readonly Area[], concerns: ConceptScope['concerns'] = 'any', ages: ConceptScope['ages'] = 'all', physiology: ConceptScope['physiology'] = 'all'): ConceptScope =>
  ({ areas, concerns, ages, physiology });
const generic = (): ConceptScope => ({ areas: ['any'], concerns: 'any', ages: 'all', physiology: 'all', reuse: GENERIC });

export const CONCEPT_SCOPE: Readonly<Record<string, ConceptScope>> = {
  [Q.complaintEntry]: generic(),
  [Q.symptomCharacter]: generic(),
  [Q.currentImpact]: generic(),
  [Q.duration]: generic(),
  [Q.onset]: generic(),
  [Q.pattern]: generic(),
  [Q.functionImpact]: { ...generic(), reuse: 'Function in the tapped area, asked where the branch has no function question of its own.' },
  [Q.pediatricWellbeing]: scope(['any'], 'any', 'child'),

  [Q.lowerAssociatedSystem]: scope(['lower-abdomen'], ['pain', 'swelling-lump', 'injury', 'skin-change', 'other']),
  [Q.bowelDetail]: scope(['abdomen']),
  [Q.bowelPersistence]: scope(['abdomen']),
  [Q.bowelAlarmFeature]: scope(['abdomen'], 'any', 'adult'),
  [Q.bowelBleedingDuration]: scope(['abdomen']),
  [Q.bowelTreatment]: scope(['abdomen'], 'any', 'adult'),
  [Q.bowelHabitDuration]: scope(['abdomen'], 'any', 'adult'),
  [Q.bowelSystemic]: scope(['abdomen'], 'any', 'adult'),
  [Q.pediatricBowelRedFlag]: scope(['abdomen'], ['bowel-change'], 'child'),
  [Q.urinaryDetail]: scope(['abdomen']),
  [Q.urinaryPattern]: scope(['abdomen']),
  [Q.reproductiveDetail]: scope(['lower-abdomen'], ['reproductive-pelvic-change'], 'adult', 'female-or-explicit'),
  [Q.reproductiveTiming]: scope(['lower-abdomen'], 'any', 'adult', 'female-or-explicit'),
  [Q.pregnancyContext]: scope(['lower-abdomen'], 'any', 'adult', 'female-or-explicit'),
  [Q.abdominalDetail]: scope(['upper-abdomen'], ['pain']),
  [Q.abdominalFoodRelation]: scope(['upper-abdomen'], ['pain']),
  [Q.abdominalAssociated]: scope(['upper-abdomen'], ['pain']),

  [Q.eyeDetail]: scope(['face-eye']),
  [Q.eyeAssociated]: scope(['face-eye']),
  [Q.eyeSquintPattern]: scope(['face-eye']),
  [Q.eyeInjuryDetail]: scope(['face-eye'], ['injury']),
  [Q.faceLaterality]: scope(['face-eye', 'face-ear']),
  [Q.earDetail]: scope(['face-ear']),
  [Q.earAssociated]: scope(['face-ear']),
  [Q.earPersistence]: scope(['face-ear']),
  [Q.pediatricEarObservation]: scope(['face-ear'], 'any', 'child'),
  [Q.noseDetail]: scope(['face-nose']),
  [Q.noseTreatment]: scope(['face-nose']),
  [Q.nosebleedAssociated]: scope(['face-nose'], ['bleeding-discharge', 'injury']),
  [Q.pediatricNoseObservation]: scope(['face-nose'], 'any', 'child'),
  // The sinus pattern is also asked of adult facial pain described as pressure with a blocked nose.
  [Q.nosePersistence]: scope(['face-nose', 'face-general']),
  [Q.noseAssociated]: scope(['face-nose', 'face-general']),
  [Q.jawDetail]: scope(['face-oral']),
  [Q.jawAssociated]: scope(['face-oral']),
  [Q.mouthDetail]: scope(['face-oral'], ['mouth-change', 'bleeding-discharge']),
  [Q.mouthDuration]: scope(['face-oral'], ['mouth-change', 'bleeding-discharge']),
  [Q.facePainPattern]: scope(['face-general'], ['pain'], 'adult'),
  [Q.facePainSide]: scope(['face-general'], ['pain'], 'adult'),
  [Q.facePainTreatment]: scope(['face-general'], ['pain'], 'adult'),

  [Q.throatDetail]: scope(['neck', 'face-oral', 'face-upper-neck'], ['throat', 'voice-swallow']),
  [Q.throatAssociated]: scope(['neck', 'face-oral', 'face-upper-neck'], ['throat', 'voice-swallow']),
  [Q.throatDuration]: scope(['neck', 'face-oral', 'face-upper-neck'], ['throat', 'voice-swallow']),
  [Q.throatRecurrence]: scope(['neck', 'face-oral', 'face-upper-neck'], ['throat', 'voice-swallow']),
  [Q.throatImpact]: scope(['neck', 'face-oral', 'face-upper-neck'], ['throat', 'voice-swallow']),
  [Q.neckDetail]: scope(['neck']),

  [Q.chestDetail]: scope(['chest']),
  [Q.chestPainCharacter]: scope(['chest'], ['pain'], 'adult'),
  [Q.chestPainTrigger]: scope(['chest'], ['pain'], 'adult'),
  [Q.chestPainRelief]: scope(['chest'], ['pain'], 'adult'),
  [Q.palpitationFrequency]: scope(['chest'], ['palpitations']),
  [Q.palpitationLength]: scope(['chest'], ['palpitations']),
  [Q.palpitationHistory]: scope(['chest'], ['palpitations']),
  [Q.upperGiSymptom]: scope(['chest'], ['voice-swallow']),
  [Q.upperGiFrequency]: scope(['chest', 'upper-abdomen'], ['voice-swallow', 'pain'], 'adult'),
  [Q.upperGiTreatment]: scope(['chest', 'upper-abdomen'], ['voice-swallow', 'pain'], 'adult'),
  [Q.upperGiAlarm]: scope(['chest', 'upper-abdomen'], ['voice-swallow', 'pain'], 'adult'),
  [Q.breathingDetail]: scope(['chest'], ['breathing'], 'child'),
  [Q.breathingPattern]: scope(['chest'], ['breathing'], 'child'),
  [Q.breathingRecurrence]: scope(['chest'], ['breathing'], 'child'),
  [Q.breathingInfections]: scope(['chest'], ['breathing'], 'adult'),
  [Q.breathingPhlegm]: scope(['chest'], ['breathing'], 'adult'),
  [Q.breathingAnkles]: scope(['chest'], ['breathing'], 'adult'),
  [Q.breathingLyingFlat]: scope(['chest'], ['breathing'], 'adult'),
  [Q.breathingActivity]: scope(['chest'], ['breathing'], 'adult'),

  [Q.headDetail]: scope(['head'], ['pain'], 'child'),
  [Q.headFrequency]: scope(['head'], ['pain'], 'child'),
  [Q.headTriggers]: scope(['head'], ['pain'], 'child'),
  [Q.headacheFeatures]: scope(['head'], ['pain'], 'adult'),
  [Q.headacheSinusSymptoms]: scope(['head'], ['pain'], 'adult'),
  [Q.headacheSinusPattern]: scope(['head'], ['pain'], 'adult'),
  [Q.dizzinessDetail]: scope(['head'], ['hearing-balance-change']),
  [Q.dizzinessAssociated]: scope(['head'], ['hearing-balance-change']),

  [Q.skinDetail]: scope(['any'], ['skin-change']),
  [Q.skinDuration]: scope(['any'], ['skin-change']),
  [Q.skinTreatment]: scope(['any'], ['skin-change']),
  [Q.skinFeatures]: scope(['any'], ['skin-change']),
  [Q.swellingDetail]: scope(['any'], ['swelling-lump']),
  [Q.swellingDuration]: scope(['any'], ['swelling-lump']),
  [Q.neurologicDetail]: scope(['any'], ['numbness-tingling', 'weakness-drooping']),
  [Q.neurologicFeatures]: scope(['any'], ['numbness-tingling', 'weakness-drooping']),
  [Q.neurologicCourse]: scope(['any'], ['numbness-tingling', 'weakness-drooping']),
  [Q.neurologicWaking]: scope(['any'], ['numbness-tingling']),
  [Q.injuryDetail]: scope(['any'], ['injury']),
  [Q.abdomenInjuryTiming]: scope(['upper-abdomen', 'chest'], ['injury', 'other']),
  [Q.abdomenInjuryMovement]: scope(['upper-abdomen', 'chest'], ['injury', 'other']),
  [Q.abdomenInjuryFeatures]: scope(['upper-abdomen', 'chest'], ['injury', 'other']),
  // Phase 2: every region whose "Something else" is clarified (otherClarifierFamilies decides which).
  [Q.otherClarifier]: scope(['any'], ['other']),
  [Q.injuryFunction]: scope(['limb'], ['pain', 'injury', 'movement-function']),
  [Q.mskMechanical]: scope(['limb'], ['pain', 'injury', 'movement-function']),
  [Q.mskDuration]: scope(['limb'], ['pain', 'injury', 'movement-function']),
  // Questionnaire intelligence pass (PENDING CLINICAL REVIEW).
  // Phase 3: also a cheek or facial pain from a tooth, and a mouth or jaw lump near a tooth.
  [Q.toothFeatures]: scope(['face-oral', 'face-general'], ['mouth-change', 'bleeding-discharge', 'pain', 'swelling-lump']),
  [Q.jointPattern]: scope(['limb'], ['pain'], 'adult'),
  [Q.injuryFeatures]: scope(['limb'], ['injury']),
  // Questionnaire expansion phase 2 (PENDING CLINICAL REVIEW).
  [Q.mskSiteFeatures]: scope(['limb'], ['pain', 'movement-function']),
  [Q.mskWorseWhen]: scope(['limb'], ['pain', 'movement-function']),
  [Q.mskHomeTreatment]: scope(['limb', 'neck'], ['pain', 'injury', 'movement-function']),
  [Q.neuroDistribution]: scope(['limb', 'neck'], ['numbness-tingling']),
  [Q.legVeinFeatures]: scope(['limb'], ['swelling-lump', 'skin-change'], 'adult'),
  [Q.herniaFeatures]: scope(['abdomen'], ['swelling-lump']),
  [Q.breastFeatures]: scope(['chest'], ['swelling-lump'], 'adult'),
  [Q.templeFeatures]: scope(['face-general'], ['pain'], 'adult'),
  [Q.urinaryFeatures]: scope(['abdomen'], ['urinary-change'], 'adult'),
  [Q.noseInjuryFeatures]: scope(['face-nose'], ['injury']),
  [Q.neckInjuryFeatures]: scope(['neck'], ['injury']),
  [Q.oralSwellingSite]: scope(['face-oral'], ['swelling-lump']),
  [Q.palpitationTriggers]: scope(['chest'], ['palpitations']),
  [Q.movementDetail]: scope(['limb'], ['movement-function', 'weakness-drooping']),
  [Q.backLegSymptoms]: scope(['lower-back'], ['pain']),
  [Q.associatedLocation]: scope(['chest', 'neck', 'lower-back', 'lower-abdomen'], ['pain']),
};

/**
 * The upper-tummy "Something else" clarifier can open exactly these real
 * branches. Their questions are present in the plan behind a show condition,
 * so the original stored concern remains `other` while the answer establishes
 * the narrower family. This whitelist keeps that deliberate conditional reuse
 * distinct from an unrelated-question leak.
 */
const UPPER_ABDOMEN_OTHER_BRANCH_CONCEPTS: ReadonlySet<string> = new Set([
  Q.injuryDetail,
  Q.abdomenInjuryTiming,
  Q.abdomenInjuryMovement,
  Q.abdomenInjuryFeatures,
  Q.bowelDetail,
  Q.bowelPersistence,
  Q.bowelAlarmFeature,
  Q.bowelBleedingDuration,
  Q.bowelTreatment,
  Q.bowelHabitDuration,
  Q.bowelSystemic,
  Q.pediatricBowelRedFlag,
  Q.abdominalDetail,
  Q.abdominalFoodRelation,
  Q.abdominalAssociated,
  Q.urinaryDetail,
  Q.urinaryPattern,
  Q.swellingDetail,
  Q.swellingDuration,
  Q.herniaFeatures,
  Q.skinDetail,
  Q.skinDuration,
  Q.skinTreatment,
  Q.skinFeatures,
]);

/** Whether a concept may be asked in this context at all. */
export function conceptEligible(questionId: string, context: RegionAssessmentContext): { ok: boolean; reason: string } {
  const declared = CONCEPT_SCOPE[questionId];
  if (!declared) return { ok: false, reason: 'no declared scope' };
  if (!declared.areas.some((area) => inArea(area, context))) return { ok: false, reason: `outside ${declared.areas.join('/')}` };
  // "Something else" opens the branch of the family the clarifier names (phase 2, every clarified region).
  const clarifiedFamilies = otherClarifierFamilies(context).map(([, family]) => family);
  const clarifiedUpperAbdomenOther = (context.bodyRegionId === 'upper-abdomen'
    && context.concernId === 'other'
    && UPPER_ABDOMEN_OTHER_BRANCH_CONCEPTS.has(questionId))
    || (declared.concerns !== 'any' && declared.concerns.some((family) => clarifiedFamilies.includes(family)));
  if (declared.concerns !== 'any' && !declared.concerns.includes(context.concernId) && !clarifiedUpperAbdomenOther) {
    return { ok: false, reason: `concern ${context.concernId} not in scope` };
  }
  if (declared.ages === 'adult' && context.patientMode !== 'adult') return { ok: false, reason: 'adult-only concept' };
  if (declared.ages === 'child' && context.patientMode !== 'pediatric') return { ok: false, reason: 'child-only concept' };
  if (declared.physiology === 'female-or-explicit'
    && context.sexForAssessment !== 'female' && context.sexForAssessment !== 'intersex_or_variation') {
    return { ok: false, reason: 'physiology not established' };
  }
  return { ok: true, reason: 'in scope' };
}

/** The services whose published criteria read this concept: derived, never restated. */
export function specialtiesDiscriminatedBy(questionId: string): readonly string[] {
  return [...new Set(
    DIRECTION_CRITERIA_SETS
      .filter((set) => [...set.supporting, ...set.excluding].some((criterion) => criterion.questionId === questionId))
      .map((set) => set.directionId),
  )].sort();
}
