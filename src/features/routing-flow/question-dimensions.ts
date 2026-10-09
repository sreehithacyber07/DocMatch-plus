/**
 * Which history dimension each question collects.
 *
 * Structural metadata for audits and tests only: nothing here changes what is
 * asked, a route or a safety outcome. It lets the coverage matrix show, for
 * every region and concern, which parts of a history (onset, course,
 * character, what makes it worse, function...) the questionnaire actually
 * collects, and which it does not.
 */
import { INTAKE_QUESTION_IDS } from './intake-questions.ts';

export type HistoryDimension =
  | 'entry'
  | 'location'
  | 'onset'
  | 'duration'
  | 'frequency'
  | 'progression'
  | 'severity'
  | 'character'
  | 'associated'
  | 'radiation'
  | 'aggravating'
  | 'relieving'
  | 'function'
  | 'injury'
  | 'exposure'
  | 'history'
  | 'treatment'
  | 'age-specific'
  | 'distinguishing';

const Q = INTAKE_QUESTION_IDS;

export const INTAKE_DIMENSIONS: Readonly<Record<string, readonly HistoryDimension[]>> = {
  [Q.complaintEntry]: ['entry'],
  [Q.otherClarifier]: ['entry'],
  [Q.symptomCharacter]: ['character'],
  [Q.currentImpact]: ['severity'],
  [Q.duration]: ['duration'],
  [Q.onset]: ['onset'],
  [Q.pattern]: ['frequency'],
  [Q.lowerAssociatedSystem]: ['associated', 'distinguishing'],
  [Q.bowelDetail]: ['character', 'distinguishing'],
  [Q.urinaryDetail]: ['character', 'distinguishing'],
  [Q.reproductiveDetail]: ['character', 'distinguishing'],
  [Q.pregnancyContext]: ['history'],
  [Q.eyeDetail]: ['character', 'distinguishing'],
  [Q.eyeAssociated]: ['associated', 'history'],
  [Q.earDetail]: ['character', 'location'],
  [Q.earAssociated]: ['associated'],
  [Q.pediatricEarObservation]: ['character', 'age-specific'],
  [Q.noseDetail]: ['character'],
  [Q.noseAssociated]: ['associated', 'distinguishing'],
  [Q.pediatricNoseObservation]: ['character', 'age-specific'],
  [Q.jawDetail]: ['location', 'character', 'aggravating'],
  [Q.jawAssociated]: ['associated'],
  [Q.neckDetail]: ['associated', 'radiation'],
  [Q.chestDetail]: ['associated', 'radiation'],
  [Q.skinDetail]: ['character', 'exposure'],
  [Q.swellingDetail]: ['character', 'progression'],
  [Q.neurologicDetail]: ['location', 'function'],
  [Q.injuryDetail]: ['injury'],
  [Q.functionImpact]: ['function'],
  [Q.pediatricWellbeing]: ['function', 'age-specific'],
  [Q.earPersistence]: ['duration'],
  [Q.nosePersistence]: ['duration'],
  [Q.reproductiveTiming]: ['frequency', 'distinguishing'],
  [Q.urinaryPattern]: ['frequency', 'distinguishing'],
  [Q.bowelPersistence]: ['duration', 'progression'],
  [Q.bowelAlarmFeature]: ['associated', 'distinguishing'],
  [Q.faceLaterality]: ['location'],
  [Q.eyeSquintPattern]: ['frequency'],
  [Q.mouthDetail]: ['character', 'distinguishing'],
  [Q.mouthDuration]: ['duration'],
  [Q.throatDetail]: ['character'],
  [Q.throatAssociated]: ['associated'],
  [Q.throatDuration]: ['duration'],
  [Q.throatRecurrence]: ['frequency'],
  [Q.throatImpact]: ['function'],
  [Q.headDetail]: ['location', 'character'],
  [Q.headFrequency]: ['frequency'],
  [Q.headTriggers]: ['aggravating'],
  [Q.breathingDetail]: ['character', 'associated'],
  [Q.breathingPattern]: ['frequency', 'aggravating'],
  [Q.breathingRecurrence]: ['frequency', 'history'],
  [Q.abdominalDetail]: ['location', 'character'],
  [Q.abdominalFoodRelation]: ['aggravating'],
  [Q.abdominalAssociated]: ['associated'],
  [Q.pediatricBowelRedFlag]: ['associated', 'age-specific'],
  [Q.skinDuration]: ['duration'],
  [Q.skinTreatment]: ['treatment'],
  [Q.skinFeatures]: ['associated', 'distinguishing'],
  [Q.swellingDuration]: ['duration'],
  [Q.injuryFunction]: ['function'],
  [Q.mskMechanical]: ['distinguishing'],
  [Q.mskDuration]: ['duration'],
  [Q.toothFeatures]: ['associated', 'aggravating', 'distinguishing'],
  [Q.jointPattern]: ['location', 'distinguishing'],
  [Q.injuryFeatures]: ['injury', 'associated'],
  [Q.mskSiteFeatures]: ['character', 'distinguishing'],
  [Q.mskWorseWhen]: ['aggravating'],
  [Q.mskHomeTreatment]: ['treatment', 'relieving'],
  [Q.neuroDistribution]: ['location', 'distinguishing'],
  [Q.legVeinFeatures]: ['associated', 'distinguishing'],
  [Q.herniaFeatures]: ['aggravating', 'relieving', 'distinguishing'],
  [Q.breastFeatures]: ['location', 'distinguishing'],
  [Q.templeFeatures]: ['associated', 'distinguishing'],
  [Q.urinaryFeatures]: ['character', 'associated', 'distinguishing'],
  [Q.noseInjuryFeatures]: ['injury', 'associated'],
  [Q.neckInjuryFeatures]: ['injury', 'associated', 'function'],
  [Q.oralSwellingSite]: ['location', 'distinguishing'],
  [Q.palpitationTriggers]: ['aggravating'],
  [Q.nosebleedAssociated]: ['associated', 'history'],
  [Q.noseTreatment]: ['treatment'],
  [Q.bowelBleedingDuration]: ['duration'],
  [Q.bowelTreatment]: ['treatment'],
  [Q.bowelHabitDuration]: ['duration'],
  [Q.bowelSystemic]: ['associated'],
  [Q.neurologicFeatures]: ['associated'],
  [Q.chestPainCharacter]: ['character'],
  [Q.chestPainTrigger]: ['aggravating'],
  [Q.chestPainRelief]: ['relieving'],
  [Q.palpitationFrequency]: ['frequency'],
  [Q.palpitationLength]: ['duration'],
  [Q.palpitationHistory]: ['history'],
  [Q.upperGiSymptom]: ['character'],
  [Q.upperGiFrequency]: ['frequency'],
  [Q.upperGiTreatment]: ['treatment'],
  [Q.upperGiAlarm]: ['associated'],
  [Q.neurologicCourse]: ['onset', 'progression'],
  [Q.neurologicWaking]: ['frequency'],
  [Q.facePainPattern]: ['character', 'aggravating'],
  [Q.facePainSide]: ['location'],
  [Q.facePainTreatment]: ['treatment'],
  [Q.movementDetail]: ['function'],
  [Q.eyeInjuryDetail]: ['injury', 'exposure'],
  [Q.backLegSymptoms]: ['radiation', 'associated'],
  [Q.dizzinessDetail]: ['character'],
  [Q.dizzinessAssociated]: ['associated', 'aggravating'],
  [Q.associatedLocation]: ['radiation'],
  [Q.headacheFeatures]: ['associated', 'distinguishing'],
  [Q.headacheSinusSymptoms]: ['associated'],
  [Q.headacheSinusPattern]: ['duration', 'distinguishing'],
  [Q.breathingInfections]: ['history'],
  [Q.breathingPhlegm]: ['associated'],
  [Q.breathingAnkles]: ['associated'],
  [Q.breathingLyingFlat]: ['aggravating'],
  [Q.breathingActivity]: ['aggravating'],
  [Q.abdomenInjuryTiming]: ['injury', 'duration'],
  [Q.abdomenInjuryMovement]: ['aggravating'],
  [Q.abdomenInjuryFeatures]: ['associated'],
};

/** The approved R1 questions' evidence dimension, in the same vocabulary. */
const ENGINE_DIMENSION: Readonly<Record<string, HistoryDimension>> = {
  trigger: 'aggravating',
  character: 'character',
  location: 'location',
  associated: 'associated',
  timing: 'frequency',
  mechanism: 'injury',
  function: 'function',
  sign: 'associated',
};

export function dimensionsOf(questionId: string, engineDimension?: string): readonly HistoryDimension[] {
  if (INTAKE_DIMENSIONS[questionId]) return INTAKE_DIMENSIONS[questionId];
  if (engineDimension && ENGINE_DIMENSION[engineDimension]) return [ENGINE_DIMENSION[engineDimension]];
  return [];
}

/** The core dimensions a routine history is expected to cover where they apply. */
export const CORE_DIMENSIONS: readonly HistoryDimension[] = ['onset', 'duration', 'severity', 'character', 'associated', 'aggravating', 'function'];
