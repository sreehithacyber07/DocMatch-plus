/**
 * Specialist direction matrix (phase 3).
 *
 * For every routable specialist direction: a clear positive presentation, a
 * negative or insufficient one, and, where they exist, a relevant exclusion,
 * a competing service, a child and a safety escalation. Each is a coherent
 * presentation walked through the real interview. A pass is evidence that the
 * encoded criteria behave as written, not clinical accuracy. New rules are
 * PENDING CLINICAL REVIEW.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { routableSpecialties } from '../routing-flow/specialty-registry.ts';
import { INTAKE_QUESTION_IDS as Q } from '../routing-flow/intake-questions.ts';
import { contextFor, walkAssessment, type ContextSpec, type Script } from './clinical-walk.ts';

type Kind = 'positive' | 'negative' | 'exclusion' | 'competitor' | 'child' | 'safety';
interface Case { direction: string; kind: Kind; name: string; spec: ContextSpec; script: Script; expect: { route?: string; notRoute?: string; interrupted?: string; urgent?: string; fallback?: string } }

const M = { age: 55, sex: 'male' } as const;
const F = { age: 45, sex: 'female' } as const;
const BREATHING = { region: 'chest', concern: 'breathing', age: 45, sex: 'male' } as const;
const RESPIRATORY: Script = {
  [Q.symptomCharacter]: 'tight', [Q.duration]: 'longer',
  'shortness-of-breath-ankle-swelling': 'no', 'shortness-of-breath-cough': 'yes', 'shortness-of-breath-night-variation': 'no',
  'shortness-of-breath-palpitations': 'no', 'shortness-of-breath-lying-flat': 'no', 'shortness-of-breath-wheeze': 'no',
  [Q.breathingInfections]: 'yes', [Q.breathingPhlegm]: 'no', [Q.breathingActivity]: 'no',
};
const CARDIAC_BREATHING: Script = {
  [Q.symptomCharacter]: 'tight', [Q.duration]: 'under-hour',
  'shortness-of-breath-ankle-swelling': 'yes', 'shortness-of-breath-lying-flat': 'yes', 'shortness-of-breath-wheeze': 'no',
  'shortness-of-breath-palpitations': 'yes', [Q.breathingInfections]: 'no', [Q.breathingPhlegm]: 'no',
};
const HAND = { region: 'right-hand', concern: 'pain', ...F } as const;
const RA: Script = {
  [Q.mskDuration]: 'over-six-weeks', 'joint-musculoskeletal-pain-injury': 'no', 'joint-musculoskeletal-pain-swelling-bruising': 'yes',
  [Q.mskMechanical]: 'none', [Q.mskSiteFeatures]: 'none', [Q.jointPattern]: 'small-joints+both-sides',
};

const CASES: readonly Case[] = [
  /* ENT */
  { direction: 'otorhinolaryngology', kind: 'positive', name: 'ear discharge for 2 weeks or more', spec: { region: 'face', face: 'patient-left-ear', concern: 'ear-discharge', age: 40 }, script: { [Q.earDetail]: 'pus-like', [Q.earPersistence]: 'two-weeks-plus' }, expect: { route: 'otorhinolaryngology' } },
  { direction: 'otorhinolaryngology', kind: 'negative', name: 'earache for under 3 days', spec: { region: 'face', face: 'patient-left-ear', concern: 'pain', age: 40 }, script: { [Q.earDetail]: 'inside', [Q.earPersistence]: 'under-three-days', [Q.earAssociated]: 'none' }, expect: { notRoute: 'otorhinolaryngology' } },
  { direction: 'otorhinolaryngology', kind: 'child', name: 'recurrent disabling sore throats in a child', spec: { region: 'neck', concern: 'throat', age: 10 }, script: { [Q.throatRecurrence]: 'seven-in-year', [Q.throatImpact]: 'yes' }, expect: { route: 'otorhinolaryngology' } },
  /* Ophthalmology */
  { direction: 'ophthalmology', kind: 'positive', name: 'constant squint in a child', spec: { region: 'face', face: 'patient-right-eye', concern: 'pain', age: 6 }, script: { [Q.eyeDetail]: 'squint', [Q.eyeSquintPattern]: 'all-the-time' }, expect: { route: 'ophthalmology' } },
  { direction: 'ophthalmology', kind: 'safety', name: 'chemical in the eye with sudden vision loss', spec: { region: 'face', face: 'patient-left-eye', concern: 'injury', age: 40 }, script: { [Q.eyeInjuryDetail]: 'chemical', 'safety-eye-sudden-vision-loss-or-injury': 'yes' }, expect: { interrupted: 'eye-sudden-vision-loss-or-injury' } },
  /* Cardiology */
  { direction: 'cardiology', kind: 'positive', name: 'anginal chest pain', spec: { region: 'chest', concern: 'pain', age: 58, sex: 'female' }, script: { [Q.chestPainCharacter]: 'tight-heavy', [Q.chestPainTrigger]: 'exertion', [Q.chestPainRelief]: 'rest-minutes', [Q.associatedLocation]: 'left-upper-arm' }, expect: { route: 'cardiology' } },
  { direction: 'cardiology', kind: 'negative', name: 'sharp chest pain on breathing in', spec: { region: 'chest', concern: 'pain', age: 58, sex: 'female' }, script: { [Q.chestPainCharacter]: 'sharp', [Q.chestPainTrigger]: 'breathing-movement', [Q.chestPainRelief]: 'on-its-own', [Q.associatedLocation]: 'none' }, expect: { notRoute: 'cardiology' } },
  { direction: 'cardiology', kind: 'competitor', name: 'cardiac and respiratory features together', spec: BREATHING, script: { ...CARDIAC_BREATHING, [Q.breathingInfections]: 'yes', [Q.breathingPhlegm]: 'yes' }, expect: { route: 'general-medicine', fallback: 'TRUE_MULTISYSTEM_AMBIGUITY' } },
  { direction: 'cardiology', kind: 'safety', name: 'persistent spreading chest pain', spec: { region: 'chest', concern: 'pain', age: 58, sex: 'male' }, script: { [Q.chestPainRelief]: 'does-not-settle', 'safety-chest-persistent-spreading-associated': 'yes' }, expect: { interrupted: 'chest-persistent-spreading-associated' } },
  /* Respiratory */
  { direction: 'respiratory-medicine', kind: 'positive', name: 'cough with repeated chest infections', spec: BREATHING, script: RESPIRATORY, expect: { route: 'respiratory-medicine' } },
  { direction: 'respiratory-medicine', kind: 'negative', name: 'breathlessness with no supported pattern', spec: BREATHING, script: { ...RESPIRATORY, 'shortness-of-breath-cough': 'no', [Q.breathingInfections]: 'no', [Q.symptomCharacter]: 'unsure' }, expect: { notRoute: 'respiratory-medicine' } },
  { direction: 'respiratory-medicine', kind: 'safety', name: 'unable to speak with breathlessness', spec: BREATHING, script: { 'safety-shortness-of-breath-severe': 'yes' }, expect: { interrupted: 'breathing-severe-inability-to-speak' } },
  /* Neurology */
  { direction: 'neurology', kind: 'positive', name: 'gradually progressive leg weakness', spec: { region: 'right-thigh', concern: 'weakness-drooping', age: 62, sex: 'male' }, script: { [Q.neurologicDetail]: 'function', [Q.neurologicCourse]: 'gradual', [Q.neurologicFeatures]: 'none' }, expect: { route: 'neurology' } },
  { direction: 'neurology', kind: 'negative', name: 'stable weakness', spec: { region: 'right-thigh', concern: 'weakness-drooping', age: 62, sex: 'male' }, script: { [Q.neurologicDetail]: 'function', [Q.neurologicCourse]: 'same', [Q.neurologicFeatures]: 'none' }, expect: { notRoute: 'neurology' } },
  { direction: 'neurology', kind: 'safety', name: 'quickly worsening weakness', spec: { region: 'right-thigh', concern: 'weakness-drooping', age: 62, sex: 'male' }, script: { [Q.neurologicDetail]: 'function', [Q.neurologicCourse]: 'quick', 'safety-neuro-rapidly-progressive': 'yes' }, expect: { interrupted: 'neuro-rapidly-progressive-weakness' } },
  /* Gastroenterology */
  { direction: 'medical-gastroenterology', kind: 'positive', name: 'persistent constipation with a sudden change', spec: { region: 'lower-abdomen', concern: 'bowel-change', ...M }, script: { [Q.bowelDetail]: 'constipation', [Q.bowelPersistence]: 'not-improving', [Q.bowelAlarmFeature]: 'sudden-change' }, expect: { route: 'medical-gastroenterology' } },
  { direction: 'medical-gastroenterology', kind: 'negative', name: 'a recent first episode', spec: { region: 'lower-abdomen', concern: 'bowel-change', ...M }, script: { [Q.bowelDetail]: 'constipation', [Q.bowelPersistence]: 'recent-first', [Q.bowelAlarmFeature]: 'neither' }, expect: { route: 'general-medicine' } },
  { direction: 'medical-gastroenterology', kind: 'child', name: 'a child with constipation goes to Paediatrics', spec: { region: 'lower-abdomen', concern: 'bowel-change', age: 8 }, script: { [Q.bowelDetail]: 'constipation', [Q.bowelPersistence]: 'regularly-recurrent' }, expect: { notRoute: 'medical-gastroenterology' } },
  /* Orthopaedics */
  { direction: 'orthopaedics', kind: 'positive', name: 'a single locking knee for weeks', spec: { region: 'left-knee', concern: 'pain', age: 34, sex: 'male' }, script: { [Q.mskDuration]: 'over-six-weeks', 'joint-musculoskeletal-pain-use-weight': 'yes', [Q.jointPattern]: 'none', [Q.mskSiteFeatures]: 'none' }, expect: { route: 'orthopaedics' } },
  { direction: 'orthopaedics', kind: 'exclusion', name: 'more than one joint excludes Orthopaedics', spec: HAND, script: { ...RA, 'joint-musculoskeletal-pain-use-weight': 'yes', [Q.jointPattern]: 'several' }, expect: { notRoute: 'orthopaedics' } },
  { direction: 'orthopaedics', kind: 'exclusion', name: 'a one-calf clot pattern excludes an elective referral', spec: { region: 'left-lower-leg', concern: 'pain', age: 55, sex: 'female' }, script: { [Q.mskDuration]: 'over-six-weeks', 'joint-musculoskeletal-pain-use-weight': 'yes', 'joint-musculoskeletal-pain-swelling-bruising': 'yes', [Q.mskSiteFeatures]: 'one-calf', 'safety-joint-dvt-one-leg': 'yes', [Q.jointPattern]: 'none' }, expect: { route: 'general-medicine', urgent: 'joint-dvt-suspected-urgent' } },
  { direction: 'orthopaedics', kind: 'child', name: 'a child knee injury, cannot bear weight', spec: { region: 'left-knee', concern: 'injury', age: 10 }, script: { [Q.injuryDetail]: 'fall', [Q.injuryFunction]: 'cannot', [Q.mskDuration]: 'two-to-six-weeks' }, expect: { route: 'orthopaedics' } },
  /* Rheumatology */
  { direction: 'clinical-immunology-rheumatology', kind: 'positive', name: 'swollen small joints on both sides', spec: HAND, script: RA, expect: { route: 'clinical-immunology-rheumatology' } },
  { direction: 'clinical-immunology-rheumatology', kind: 'negative', name: 'swelling without a distribution feature', spec: { region: 'left-knee', concern: 'pain', age: 65, sex: 'female' }, script: { ...RA, [Q.jointPattern]: 'none', [Q.mskMechanical]: 'locks' }, expect: { notRoute: 'clinical-immunology-rheumatology' } },
  { direction: 'clinical-immunology-rheumatology', kind: 'exclusion', name: 'swelling after an injury', spec: HAND, script: { ...RA, 'joint-musculoskeletal-pain-injury': 'yes' }, expect: { notRoute: 'clinical-immunology-rheumatology' } },
  { direction: 'clinical-immunology-rheumatology', kind: 'child', name: 'a child with swollen joints goes to Paediatrics', spec: { region: 'right-hand', concern: 'pain', age: 10 }, script: {}, expect: { notRoute: 'clinical-immunology-rheumatology' } },
  /* Dermatology */
  { direction: 'dermatology', kind: 'positive', name: 'a changing mole that keeps returning', spec: { region: 'left-forearm', concern: 'skin-change', age: 34 }, script: { [Q.skinDetail]: 'mole', [Q.skinDuration]: 'keeps-returning', [Q.skinFeatures]: 'changed' }, expect: { route: 'dermatology' } },
  { direction: 'dermatology', kind: 'negative', name: 'a rash under a week old', spec: { region: 'left-forearm', concern: 'skin-change', age: 34 }, script: { [Q.skinDetail]: 'itchy-raised', [Q.skinDuration]: 'under-one-week', [Q.skinFeatures]: 'none' }, expect: { notRoute: 'dermatology' } },
  { direction: 'dermatology', kind: 'safety', name: 'hot swollen skin with systemic signs', spec: { region: 'left-forearm', concern: 'skin-change', ...F }, script: { [Q.skinDetail]: 'painful-hot', 'safety-skin-hot-swollen': 'yes', 'safety-skin-infection-emergency': 'yes' }, expect: { interrupted: 'skin-infection-emergency-features' } },
  /* Obstetrics and gynaecology */
  { direction: 'obstetrics-gynaecology', kind: 'positive', name: 'bleeding between periods', spec: { region: 'lower-abdomen', concern: 'reproductive-pelvic-change', age: 34, sex: 'female' }, script: { [Q.reproductiveDetail]: 'bleeding', [Q.reproductiveTiming]: 'between-periods' }, expect: { route: 'obstetrics-gynaecology' } },
  { direction: 'obstetrics-gynaecology', kind: 'negative', name: 'never offered to a male patient', spec: { region: 'lower-abdomen', concern: 'pain', ...M }, script: {}, expect: { notRoute: 'obstetrics-gynaecology' } },
  /* Urology */
  { direction: 'urology', kind: 'positive', name: 'difficulty passing urine with a poor stream', spec: { region: 'lower-abdomen', concern: 'urinary-change', age: 60, sex: 'male' }, script: { [Q.urinaryDetail]: 'difficulty', [Q.urinaryPattern]: 'poor-stream' }, expect: { route: 'urology' } },
  { direction: 'urology', kind: 'negative', name: 'a single burning episode', spec: { region: 'lower-abdomen', concern: 'urinary-change', age: 30, sex: 'female' }, script: { [Q.urinaryDetail]: 'pain', [Q.urinaryPattern]: 'single-episode' }, expect: { notRoute: 'urology' } },
  /* Dental care */
  { direction: 'dentistry', kind: 'positive', name: 'toothache for days, worse on biting', spec: { region: 'face', face: 'mouth', concern: 'pain', ...F }, script: { [Q.jawDetail]: 'tooth-gum', [Q.duration]: 'several-days', [Q.toothFeatures]: 'bite' }, expect: { route: 'dentistry' } },
  { direction: 'dentistry', kind: 'negative', name: 'jaw joint pain is not dental', spec: { region: 'face', face: 'patient-left-jaw', concern: 'pain', ...F }, script: { [Q.jawDetail]: 'joint', [Q.jawAssociated]: 'ear' }, expect: { notRoute: 'dentistry' } },
  { direction: 'dentistry', kind: 'positive', name: 'cheek pain from a tooth (phase 3)', spec: { region: 'face', face: 'patient-left-cheek', concern: 'pain', ...F }, script: { [Q.facePainPattern]: 'tooth', [Q.duration]: 'longer', [Q.toothFeatures]: 'hot-cold' }, expect: { route: 'dentistry' } },
  { direction: 'dentistry', kind: 'positive', name: 'a jaw swelling near a tooth (phase 3)', spec: { region: 'face', face: 'patient-left-jaw', concern: 'swelling-lump', ...F }, script: { [Q.oralSwellingSite]: 'tooth-gum', [Q.toothFeatures]: 'swelling+bite' }, expect: { route: 'dentistry' } },
  { direction: 'dentistry', kind: 'child', name: 'a child with sore, bleeding gums', spec: { region: 'face', face: 'mouth', concern: 'mouth-change', age: 8, sex: 'male' }, script: { [Q.mouthDetail]: 'tooth-gum', [Q.mouthDuration]: 'one-to-three-weeks', [Q.toothFeatures]: 'gums+bite' }, expect: { route: 'dentistry' } },
  { direction: 'dentistry', kind: 'safety', name: 'dental swelling spreading to the eye', spec: { region: 'face', face: 'patient-left-jaw', concern: 'pain', ...F }, script: { [Q.jawDetail]: 'tooth-gum', [Q.toothFeatures]: 'swelling', 'safety-dental-spreading-swelling': 'yes' }, expect: { interrupted: 'dental-spreading-swelling' } },
  /* Geriatric Medicine (phase 4, NICE NG249 1.1.3) */
  { direction: 'geriatric-medicine', kind: 'positive', name: 'a fall at 74 with 2 or more falls this year', spec: { region: 'face', face: 'patient-left-cheek', concern: 'injury', age: 74, sex: 'female' }, script: { [Q.injuryDetail]: 'fall', [Q.fallsCount]: 'two-plus', [Q.fallGetUp]: 'yes', [Q.faceInjuryFeatures]: 'none' }, expect: { route: 'geriatric-medicine' } },
  { direction: 'geriatric-medicine', kind: 'positive', name: 'a fall at 72, could not get up alone', spec: { region: 'left-knee', concern: 'injury', age: 72, sex: 'male' }, script: { [Q.injuryDetail]: 'fall', [Q.fallsCount]: 'once', [Q.fallGetUp]: 'needed-help', [Q.injuryFunction]: 'normal' }, expect: { route: 'geriatric-medicine' } },
  { direction: 'geriatric-medicine', kind: 'negative', name: 'a first fall at 74, got up alone', spec: { region: 'face', face: 'patient-left-cheek', concern: 'injury', age: 74, sex: 'female' }, script: { [Q.injuryDetail]: 'fall', [Q.fallsCount]: 'once', [Q.fallGetUp]: 'yes', [Q.faceInjuryFeatures]: 'none' }, expect: { notRoute: 'geriatric-medicine' } },
  { direction: 'geriatric-medicine', kind: 'negative', name: 'a knock, not a fall, at 74', spec: { region: 'face', face: 'patient-left-cheek', concern: 'injury', age: 74, sex: 'female' }, script: { [Q.injuryDetail]: 'impact', [Q.faceInjuryFeatures]: 'none' }, expect: { notRoute: 'geriatric-medicine' } },
  { direction: 'geriatric-medicine', kind: 'competitor', name: 'falls and an injury needing Orthopaedics are reported as ambiguity', spec: { region: 'left-knee', concern: 'injury', age: 72, sex: 'male' }, script: { [Q.injuryDetail]: 'fall', [Q.fallsCount]: 'two-plus', [Q.fallGetUp]: 'yes', [Q.injuryFunction]: 'cannot', [Q.mskDuration]: 'two-to-six-weeks' }, expect: { route: 'general-medicine', fallback: 'TRUE_MULTISYSTEM_AMBIGUITY' } },
  { direction: 'geriatric-medicine', kind: 'child', name: 'never asked or routed under 65', spec: { region: 'left-knee', concern: 'injury', age: 50, sex: 'male' }, script: { [Q.injuryDetail]: 'fall' }, expect: { notRoute: 'geriatric-medicine' } },
  { direction: 'geriatric-medicine', kind: 'safety', name: 'knocked out in a fall stops before any direction', spec: { region: 'face', face: 'forehead', concern: 'injury', age: 74, sex: 'female' }, script: { [Q.injuryDetail]: 'fall', [Q.fallsCount]: 'two-plus', 'safety-head-injury-signs': 'yes' }, expect: { interrupted: 'head-injury-emergency-signs' } },
  /* Dental care after an injury (phase 4, NHS Broken tooth) */
  { direction: 'dentistry', kind: 'positive', name: 'a broken tooth after a knock, painful to bite (phase 4)', spec: { region: 'face', face: 'mouth', concern: 'injury', ...F }, script: { [Q.injuryDetail]: 'impact', [Q.faceInjuryFeatures]: 'tooth', [Q.toothFeatures]: 'bite' }, expect: { route: 'dentistry' } },
  { direction: 'dentistry', kind: 'negative', name: 'a broken tooth with no tooth symptom stays general (review item)', spec: { region: 'face', face: 'mouth', concern: 'injury', ...F }, script: { [Q.injuryDetail]: 'impact', [Q.faceInjuryFeatures]: 'tooth', [Q.toothFeatures]: 'none' }, expect: { notRoute: 'dentistry' } },
  { direction: 'dentistry', kind: 'child', name: 'a child chipped a tooth in a fall, sensitive to cold', spec: { region: 'face', face: 'mouth', concern: 'injury', age: 9 }, script: { [Q.injuryDetail]: 'fall', [Q.faceInjuryFeatures]: 'tooth', [Q.toothFeatures]: 'hot-cold' }, expect: { route: 'dentistry' } },
  /* General Surgery */
  { direction: 'general-surgery', kind: 'positive', name: 'a groin lump that goes away lying down', spec: { region: 'pelvis', concern: 'swelling-lump', ...M }, script: { [Q.herniaFeatures]: 'bigger-cough+smaller-lying', [Q.lowerAssociatedSystem]: 'none' }, expect: { route: 'general-surgery' } },
  { direction: 'general-surgery', kind: 'negative', name: 'a groin lump with one feature', spec: { region: 'pelvis', concern: 'swelling-lump', ...M }, script: { [Q.herniaFeatures]: 'tight-skin', [Q.lowerAssociatedSystem]: 'none' }, expect: { notRoute: 'general-surgery' } },
  { direction: 'general-surgery', kind: 'child', name: 'a child groin lump goes to Paediatrics', spec: { region: 'pelvis', concern: 'swelling-lump', age: 8 }, script: { [Q.herniaFeatures]: 'bigger-cough+smaller-lying' }, expect: { route: 'paediatrics' } },
  { direction: 'general-surgery', kind: 'safety', name: 'a painful hernia records urgency', spec: { region: 'pelvis', concern: 'swelling-lump', ...M }, script: { [Q.herniaFeatures]: 'bigger-cough+pain', 'safety-hernia-complication': 'yes' }, expect: { urgent: 'hernia-complication-urgent' } },
  /* Vascular Surgery */
  { direction: 'vascular-surgery', kind: 'positive', name: 'aching bulging leg veins', spec: { region: 'left-lower-leg', concern: 'swelling-lump', age: 60, sex: 'female' }, script: { [Q.legVeinFeatures]: 'bulging+aching-heavy' }, expect: { route: 'vascular-surgery' } },
  { direction: 'vascular-surgery', kind: 'negative', name: 'veins without a symptom', spec: { region: 'left-lower-leg', concern: 'swelling-lump', age: 60, sex: 'female' }, script: { [Q.legVeinFeatures]: 'bulging' }, expect: { notRoute: 'vascular-surgery' } },
  { direction: 'vascular-surgery', kind: 'exclusion', name: 'a one-leg clot pattern is not elective', spec: { region: 'left-lower-leg', concern: 'swelling-lump', age: 60, sex: 'female' }, script: { [Q.legVeinFeatures]: 'bulging+aching-heavy+one-leg', 'safety-dvt-one-leg': 'yes' }, expect: { notRoute: 'vascular-surgery', urgent: 'dvt-suspected-urgent' } },
  { direction: 'vascular-surgery', kind: 'safety', name: 'one swollen leg with breathlessness', spec: { region: 'left-lower-leg', concern: 'swelling-lump', age: 60, sex: 'female' }, script: { [Q.legVeinFeatures]: 'one-leg', 'safety-dvt-one-leg': 'yes', 'safety-dvt-breathless-chest': 'yes' }, expect: { interrupted: 'dvt-breathless-or-chest-pain' } },
];

for (const item of CASES) {
  test(`${item.direction} / ${item.kind}: ${item.name}`, () => {
    const walk = walkAssessment(contextFor(item.spec), item.script);
    const { expect } = item;
    if (expect.interrupted) {
      assert.equal(walk.outcome, 'interrupted', `outcome ${walk.outcome}`);
      assert.equal(walk.interruptedRuleId, expect.interrupted);
      assert.equal(walk.route, null);
      return;
    }
    assert.equal(walk.outcome, 'result', `outcome ${walk.outcome}`);
    if (expect.route) assert.equal(walk.route?.registryId, expect.route);
    if (expect.notRoute) assert.notEqual(walk.route?.registryId, expect.notRoute);
    if (expect.fallback) assert.equal(walk.route?.fallbackReason, expect.fallback);
    if (expect.urgent) assert.ok(walk.urgentRuleIds.includes(expect.urgent), walk.urgentRuleIds.join(','));
    if (walk.route?.basis === 'parent-service') assert.ok(walk.route.fallbackReason, 'a parent service always names its reason');
  });
}

test('every routable specialist direction has a positive and a negative case in the matrix', () => {
  const specialists = routableSpecialties().map((record) => record.id).filter((id) => id !== 'general-medicine' && id !== 'paediatrics');
  for (const id of specialists) {
    assert.ok(CASES.some((item) => item.direction === id && item.kind === 'positive'), `${id} positive`);
    assert.ok(CASES.some((item) => item.direction === id && item.kind !== 'positive'), `${id} negative, exclusion, child or safety`);
  }
});

/* --- Phase 3 safety gaps: head, face, nose and neck injury; weighted joint ---- */

const INJURY: readonly { name: string; spec: ContextSpec; script: Script; expect: { interrupted?: string; urgent?: string } }[] = [
  { name: 'adult face injury, knocked out', spec: { region: 'face', face: 'forehead', concern: 'injury', age: 40 }, script: { [Q.injuryDetail]: 'fall', 'safety-head-injury-signs': 'yes' }, expect: { interrupted: 'head-injury-emergency-signs' } },
  { name: 'adult head injury from a high fall', spec: { region: 'head', concern: 'injury', age: 40 }, script: { [Q.injuryDetail]: 'fall', 'safety-head-injury-mechanism': 'yes' }, expect: { interrupted: 'head-injury-emergency-mechanism' } },
  { name: 'adult cheek injury on a blood thinner', spec: { region: 'face', face: 'patient-left-cheek', concern: 'injury', age: 70 }, script: { [Q.injuryDetail]: 'fall', 'safety-head-injury-urgent': 'yes' }, expect: { urgent: 'head-injury-urgent' } },
  { name: 'child head injury from a high fall', spec: { region: 'head', concern: 'injury', age: 6 }, script: { [Q.injuryDetail]: 'fall', 'safety-head-injury-mechanism': 'yes' }, expect: { interrupted: 'head-injury-emergency-mechanism' } },
  { name: 'nose injury with a purple swelling inside', spec: { region: 'face', face: 'nose', concern: 'injury', age: 30 }, script: { [Q.injuryDetail]: 'impact', 'safety-nose-injury-emergency': 'yes' }, expect: { interrupted: 'nose-injury-emergency' } },
  { name: 'neck injury with arm weakness', spec: { region: 'neck', concern: 'injury', age: 40 }, script: { [Q.injuryDetail]: 'impact', 'safety-neck-injury-urgent': 'yes' }, expect: { urgent: 'neck-injury-urgent' } },
  /* Phase 4 (PENDING CLINICAL REVIEW) */
  { name: 'black eye with blood in the eye', spec: { region: 'face', face: 'forehead', concern: 'injury', age: 30 }, script: { [Q.injuryDetail]: 'impact', [Q.faceInjuryFeatures]: 'black-eye', 'safety-black-eye-emergency': 'yes' }, expect: { interrupted: 'black-eye-emergency' } },
  { name: 'black eye with a headache that will not go', spec: { region: 'face', face: 'patient-left-cheek', concern: 'injury', age: 30 }, script: { [Q.injuryDetail]: 'impact', [Q.faceInjuryFeatures]: 'black-eye', 'safety-black-eye-urgent': 'yes' }, expect: { urgent: 'black-eye-urgent' } },
  { name: 'a large or contaminated face wound', spec: { region: 'face', face: 'patient-right-cheek', concern: 'injury', age: 30 }, script: { [Q.injuryDetail]: 'impact', [Q.faceInjuryFeatures]: 'wound', 'safety-face-wound-emergency': 'yes' }, expect: { interrupted: 'face-wound-emergency' } },
  { name: 'a crooked nose after an injury', spec: { region: 'face', face: 'nose', concern: 'injury', age: 30 }, script: { [Q.injuryDetail]: 'impact', 'safety-nose-injury-urgent': 'yes' }, expect: { urgent: 'nose-injury-urgent' } },
  { name: "facial weakness over a few days (Bell's palsy features)", spec: { region: 'face', face: 'patient-left-cheek', concern: 'weakness-drooping', age: 40 }, script: { 'safety-face-weakness-urgent': 'yes' }, expect: { urgent: 'face-weakness-urgent' } },
  { name: 'adult swallowing difficulty', spec: { region: 'neck', concern: 'voice-swallow', age: 60 }, script: { 'safety-swallowing-urgent': 'yes' }, expect: { urgent: 'swallowing-urgent' } },
  { name: 'child coughing and choking when eating', spec: { region: 'chest', concern: 'voice-swallow', age: 8, sex: 'male' }, script: { 'safety-swallowing-urgent': 'yes' }, expect: { urgent: 'swallowing-urgent' } },
  { name: 'blood in the pee after a lower tummy injury', spec: { region: 'lower-abdomen', concern: 'injury', age: 30, sex: 'male' }, script: { 'safety-lower-injury-blood-in-urine': 'yes' }, expect: { urgent: 'lower-injury-blood-in-urine-urgent' } },
  { name: 'severe pain or feeling faint after a pelvic injury', spec: { region: 'pelvis', concern: 'injury', age: 30, sex: 'female' }, script: { 'safety-lower-abdominal-severe-or-faint': 'yes' }, expect: { interrupted: 'lower-abdominal-severe-or-faint' } },
  { name: 'adult calf pain with one swollen leg', spec: { region: 'left-lower-leg', concern: 'pain', age: 55, sex: 'female' }, script: { 'joint-musculoskeletal-pain-swelling-bruising': 'yes', 'safety-joint-dvt-one-leg': 'yes', 'safety-joint-dvt-breathless': 'yes' }, expect: { interrupted: 'joint-dvt-breathless-or-chest-pain' } },
  { name: 'adult upper back pain getting worse quickly', spec: { region: 'upper-back', concern: 'pain', age: 55, sex: 'male' }, script: { 'joint-musculoskeletal-pain-injury': 'no', 'safety-joint-back-urgent': 'yes' }, expect: { urgent: 'joint-back-urgent-features' } },
];

for (const item of INJURY) {
  test(`phase 3 safety: ${item.name}`, () => {
    const walk = walkAssessment(contextFor(item.spec), item.script);
    if (item.expect.interrupted) {
      assert.equal(walk.outcome, 'interrupted', `outcome ${walk.outcome}`);
      assert.equal(walk.interruptedRuleId, item.expect.interrupted);
    } else {
      assert.equal(walk.outcome, 'result');
      assert.ok(walk.urgentRuleIds.includes(item.expect.urgent!), walk.urgentRuleIds.join(','));
    }
  });
}

test('the joint clot screen is not asked when the painful area is not swollen', () => {
  const walk = walkAssessment(contextFor({ region: 'left-lower-leg', concern: 'pain', age: 55, sex: 'female' }), { 'joint-musculoskeletal-pain-swelling-bruising': 'no' });
  assert.ok(!walk.steps.some((step) => step.questionId === 'safety-joint-dvt-one-leg'));
});

test('an adult face injury now asks the head injury checks; an arm injury does not', () => {
  const face = walkAssessment(contextFor({ region: 'face', face: 'forehead', concern: 'injury', age: 40 }), {});
  for (const id of ['safety-head-injury-signs', 'safety-head-injury-mechanism', 'safety-head-injury-urgent']) {
    assert.ok(face.steps.some((step) => step.questionId === id), id);
  }
  const arm = walkAssessment(contextFor({ region: 'left-forearm', concern: 'injury', age: 40 }), {});
  assert.ok(!arm.steps.some((step) => step.questionId.startsWith('safety-head-injury')));
});
