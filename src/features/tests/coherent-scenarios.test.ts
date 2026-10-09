/**
 * Clinically coherent presentations (questionnaire expansion phase 2).
 *
 * The coverage matrix walks random answers, which is a reachability probe and
 * says nothing about whether a real presentation reaches the right service.
 * These scenarios are coherent: each answers the way a patient with that
 * presentation would, and asserts the direction, the safety outcome or the
 * honest fallback the published criteria call for. Every specialist
 * direction, the insufficient and ambiguous cases, the urgent and emergency
 * tiers and children are covered. New rules are PENDING CLINICAL REVIEW.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSoapHandoff, routingRationaleLines } from '../routing-flow/soap-handoff.ts';
import { intakeQuestionsFor, INTAKE_QUESTION_IDS as Q } from '../routing-flow/intake-questions.ts';
import { PATIENT_PRIORITY_TEXT, referralPriorityNotes } from '../routing-flow/referral-priority.ts';
import { routableSpecialties } from '../routing-flow/specialty-registry.ts';
import { contextFor, walkAssessment, type ContextSpec, type Script } from './clinical-walk.ts';

interface Scenario {
  name: string;
  spec: ContextSpec;
  script: Script;
  expect: { route?: string; fallback?: string; interrupted?: string; urgent?: string; minQuestions?: number; asks?: string[] };
}

const ADULT = { age: 45, sex: 'female' } as const;
const MALE = { age: 55, sex: 'male' } as const;

const SCENARIOS: readonly Scenario[] = [
  /* --- Every specialist direction --------------------------------------- */
  { name: 'ear discharge for weeks', spec: { region: 'face', face: 'patient-left-ear', concern: 'ear-discharge', age: 40 }, script: { [Q.earDetail]: 'pus-like', [Q.earPersistence]: 'two-weeks-plus' }, expect: { route: 'otorhinolaryngology' } },
  { name: 'growing hard neck lump', spec: { region: 'neck', concern: 'swelling-lump', ...MALE }, script: { [Q.swellingDetail]: 'growing+hard-fixed', [Q.swellingDuration]: 'over-six-weeks' }, expect: { route: 'otorhinolaryngology' } },
  { name: 'child squint all the time', spec: { region: 'face', face: 'patient-right-eye', concern: 'pain', age: 6 }, script: { [Q.eyeDetail]: 'squint', [Q.eyeSquintPattern]: 'all-the-time' }, expect: { route: 'ophthalmology' } },
  { name: 'anginal chest pain', spec: { region: 'chest', concern: 'pain', age: 58, sex: 'female' }, script: { [Q.chestPainCharacter]: 'tight-heavy', [Q.chestPainTrigger]: 'exertion', [Q.chestPainRelief]: 'rest-minutes', [Q.associatedLocation]: 'left-upper-arm' }, expect: { route: 'cardiology' } },
  { name: 'persistent constipation with weight loss', spec: { region: 'lower-abdomen', concern: 'bowel-change', ...MALE }, script: { [Q.bowelDetail]: 'constipation', [Q.bowelPersistence]: 'not-improving', [Q.bowelAlarmFeature]: 'sudden-change' }, expect: { route: 'medical-gastroenterology' } },
  { name: 'poor urinary stream', spec: { region: 'lower-abdomen', concern: 'urinary-change', age: 60, sex: 'male' }, script: { [Q.urinaryDetail]: 'difficulty', [Q.urinaryPattern]: 'poor-stream' }, expect: { route: 'urology' } },
  { name: 'bleeding between periods', spec: { region: 'lower-abdomen', concern: 'reproductive-pelvic-change', age: 34, sex: 'female' }, script: { [Q.reproductiveDetail]: 'bleeding', [Q.reproductiveTiming]: 'between-periods' }, expect: { route: 'obstetrics-gynaecology' } },
  { name: 'gradually progressive leg weakness', spec: { region: 'right-thigh', concern: 'weakness-drooping', age: 62, sex: 'male' }, script: { [Q.neurologicDetail]: 'function', [Q.neurologicCourse]: 'gradual', [Q.neurologicFeatures]: 'none' }, expect: { route: 'neurology' } },
  { name: 'locking knee for weeks', spec: { region: 'left-knee', concern: 'pain', age: 34, sex: 'male' }, script: { [Q.mskDuration]: 'over-six-weeks', 'joint-musculoskeletal-pain-use-weight': 'yes', [Q.jointPattern]: 'none', [Q.mskSiteFeatures]: 'none' }, expect: { route: 'orthopaedics', minQuestions: 10 } },
  { name: 'swollen small joints both hands', spec: { region: 'right-hand', concern: 'pain', ...ADULT }, script: { [Q.mskDuration]: 'over-six-weeks', 'joint-musculoskeletal-pain-injury': 'no', 'joint-musculoskeletal-pain-swelling-bruising': 'yes', [Q.mskMechanical]: 'none', [Q.jointPattern]: 'small-joints+both-sides', [Q.mskSiteFeatures]: 'none' }, expect: { route: 'clinical-immunology-rheumatology' } },
  { name: 'toothache for days, worse on biting', spec: { region: 'face', face: 'mouth', concern: 'pain', ...ADULT }, script: { [Q.jawDetail]: 'tooth-gum', [Q.duration]: 'several-days', [Q.toothFeatures]: 'bite' }, expect: { route: 'dentistry' } },
  { name: 'white patch in the mouth', spec: { region: 'face', face: 'mouth', concern: 'mouth-change', ...MALE }, script: { [Q.mouthDetail]: 'patch', [Q.mouthDuration]: 'one-to-three-weeks' }, expect: { route: 'dentistry' } },
  { name: 'groin lump that goes away lying down', spec: { region: 'pelvis', concern: 'swelling-lump', ...MALE }, script: { [Q.herniaFeatures]: 'bigger-cough+smaller-lying', [Q.lowerAssociatedSystem]: 'none' }, expect: { route: 'general-surgery' } },
  { name: 'breast lump with a nipple change', spec: { region: 'chest', concern: 'swelling-lump', ...ADULT }, script: { [Q.breastFeatures]: 'breast-lump+nipple-inward' }, expect: { route: 'general-surgery' } },
  { name: 'a lone breast lump goes through the GP, as NHS describes', spec: { region: 'chest', concern: 'swelling-lump', ...ADULT }, script: { [Q.breastFeatures]: 'breast-lump' }, expect: { route: 'general-medicine' } },
  { name: 'aching bulging leg veins', spec: { region: 'left-lower-leg', concern: 'swelling-lump', age: 60, sex: 'female' }, script: { [Q.legVeinFeatures]: 'bulging+aching-heavy' }, expect: { route: 'vascular-surgery' } },
  { name: 'leg sore not healing', spec: { region: 'right-lower-leg', concern: 'skin-change', age: 70, sex: 'male' }, script: { [Q.skinDetail]: 'other', [Q.legVeinFeatures]: 'sore+aching-heavy' }, expect: { route: 'vascular-surgery' } },

  /* --- Insufficient evidence and genuine ambiguity ---------------------- */
  { name: 'recent first constipation stays general', spec: { region: 'lower-abdomen', concern: 'bowel-change', ...MALE }, script: { [Q.bowelDetail]: 'constipation', [Q.bowelPersistence]: 'recent-first', [Q.bowelAlarmFeature]: 'neither' }, expect: { route: 'general-medicine' } },
  { name: 'one dental feature is not enough', spec: { region: 'face', face: 'mouth', concern: 'pain', ...ADULT }, script: { [Q.jawDetail]: 'tooth-gum', [Q.duration]: 'today', [Q.toothFeatures]: 'bite' }, expect: { route: 'general-medicine' } },
  { name: 'veins without symptoms are not enough', spec: { region: 'left-lower-leg', concern: 'swelling-lump', age: 60, sex: 'female' }, script: { [Q.legVeinFeatures]: 'bulging' }, expect: { route: 'general-medicine' } },
  { name: 'cardiac and respiratory both met', spec: { region: 'chest', concern: 'breathing', age: 45, sex: 'male' }, script: { [Q.symptomCharacter]: 'tight', [Q.duration]: 'under-hour', 'shortness-of-breath-ankle-swelling': 'yes', 'shortness-of-breath-lying-flat': 'yes', 'shortness-of-breath-wheeze': 'no', 'shortness-of-breath-palpitations': 'yes', [Q.breathingInfections]: 'yes', [Q.breathingPhlegm]: 'yes' }, expect: { route: 'general-medicine', fallback: 'TRUE_MULTISYSTEM_AMBIGUITY' } },

  /* --- Urgent: the direction stands, the urgency is recorded ------------ */
  { name: 'one swollen calf', spec: { region: 'left-lower-leg', concern: 'swelling-lump', age: 60, sex: 'female' }, script: { [Q.legVeinFeatures]: 'one-leg', 'safety-dvt-one-leg': 'yes' }, expect: { urgent: 'dvt-suspected-urgent' } },
  { name: 'painful hernia', spec: { region: 'pelvis', concern: 'swelling-lump', ...MALE }, script: { [Q.herniaFeatures]: 'bigger-cough+pain', 'safety-hernia-complication': 'yes' }, expect: { urgent: 'hernia-complication-urgent' } },
  { name: 'tender temple with jaw pain', spec: { region: 'face', face: 'patient-left-temple', concern: 'pain', age: 70, sex: 'female' }, script: { [Q.facePainPattern]: 'constant-ache', [Q.templeFeatures]: 'scalp-tender+jaw-eating', 'safety-gca-features': 'yes' }, expect: { urgent: 'temporal-arteritis-urgent' } },
  { name: 'hot swollen skin', spec: { region: 'left-forearm', concern: 'skin-change', ...ADULT }, script: { [Q.skinDetail]: 'painful-hot', 'safety-skin-hot-swollen': 'yes' }, expect: { urgent: 'skin-painful-hot-swollen-urgent' } },
  { name: 'back pain getting worse quickly', spec: { region: 'lower-back', concern: 'pain', ...MALE }, script: { [Q.mskSiteFeatures]: 'sudden-worse', 'safety-back-urgent': 'yes' }, expect: { urgent: 'back-urgent-features' } },
  { name: 'bleeding varicose vein', spec: { region: 'right-lower-leg', concern: 'swelling-lump', age: 70, sex: 'female' }, script: { [Q.legVeinFeatures]: 'bleeding-vein+bulging', 'safety-varicose-bleeding': 'yes' }, expect: { urgent: 'varicose-vein-bleeding-urgent', route: 'vascular-surgery' } },

  /* --- Emergency: interrupts before any direction ----------------------- */
  { name: 'swollen calf and breathless', spec: { region: 'left-lower-leg', concern: 'swelling-lump', age: 60, sex: 'female' }, script: { [Q.legVeinFeatures]: 'one-leg', 'safety-dvt-one-leg': 'yes', 'safety-dvt-breathless-chest': 'yes' }, expect: { interrupted: 'dvt-breathless-or-chest-pain' } },
  { name: 'hot skin with fast breathing', spec: { region: 'left-forearm', concern: 'skin-change', ...ADULT }, script: { [Q.skinDetail]: 'painful-hot', 'safety-skin-hot-swollen': 'yes', 'safety-skin-infection-emergency': 'yes' }, expect: { interrupted: 'skin-infection-emergency-features' } },
  { name: 'chest injury with worsening breathing', spec: { region: 'chest', concern: 'injury', ...MALE }, script: { [Q.injuryDetail]: 'fall', 'safety-upper-abdomen-injury-emergency': 'yes' }, expect: { interrupted: 'upper-abdomen-injury-emergency' } },
  { name: 'dental swelling to the eye', spec: { region: 'face', face: 'patient-left-jaw', concern: 'pain', ...ADULT }, script: { [Q.jawDetail]: 'tooth-gum', [Q.toothFeatures]: 'swelling', 'safety-dental-spreading-swelling': 'yes' }, expect: { interrupted: 'dental-spreading-swelling' } },

  /* --- Children ----------------------------------------------------------- */
  { name: 'child knee injury, cannot bear weight', spec: { region: 'left-knee', concern: 'injury', age: 10 }, script: { [Q.injuryDetail]: 'fall', [Q.injuryFunction]: 'cannot', [Q.mskDuration]: 'two-to-six-weeks' }, expect: { route: 'orthopaedics' } },
  { name: 'child groin lump goes to Paediatrics first', spec: { region: 'pelvis', concern: 'swelling-lump', age: 8 }, script: { [Q.herniaFeatures]: 'bigger-cough+smaller-lying' }, expect: { route: 'paediatrics' } },
  { name: 'child sore bleeding gums', spec: { region: 'face', face: 'mouth', concern: 'mouth-change', age: 8, sex: 'male' }, script: { [Q.mouthDetail]: 'tooth-gum', [Q.mouthDuration]: 'one-to-three-weeks', [Q.toothFeatures]: 'gums+bite' }, expect: { route: 'dentistry' } },

  /* --- Depth: the history is collected before the conclusion ------------ */
  { name: 'adult shoulder pain asks the shoulder table and home treatment', spec: { region: 'left-shoulder', concern: 'pain', age: 50, sex: 'female' }, script: { [Q.mskDuration]: 'over-six-weeks', [Q.mskSiteFeatures]: 'stiff-long+worse-using', [Q.mskHomeTreatment]: 'not-improved', [Q.jointPattern]: 'none' }, expect: { asks: [Q.mskSiteFeatures, Q.mskHomeTreatment], minQuestions: 12 } },
  { name: 'hand tingling asks where it is felt', spec: { region: 'right-hand', concern: 'numbness-tingling', ...ADULT }, script: { [Q.neuroDistribution]: 'thumb-fingers' }, expect: { asks: [Q.neuroDistribution] } },
  { name: 'a child wrist movement problem asks what is worse and when', spec: { region: 'left-wrist', concern: 'movement-function', age: 12 }, script: {}, expect: { asks: [Q.mskSiteFeatures, Q.mskWorseWhen], minQuestions: 6 } },
];

for (const scenario of SCENARIOS) {
  test(`coherent: ${scenario.name}`, () => {
    const walk = walkAssessment(contextFor(scenario.spec), scenario.script);
    const { expect } = scenario;
    if (expect.interrupted) {
      assert.equal(walk.outcome, 'interrupted');
      assert.equal(walk.interruptedRuleId, expect.interrupted);
      assert.equal(walk.route, null, 'no direction is shown before an emergency');
      return;
    }
    assert.equal(walk.outcome, 'result');
    if (expect.route) assert.equal(walk.route?.registryId, expect.route);
    if (expect.fallback) assert.equal(walk.route?.fallbackReason, expect.fallback);
    if (expect.urgent) assert.ok(walk.urgentRuleIds.includes(expect.urgent), walk.urgentRuleIds.join(','));
    const asked = walk.steps.map((step) => step.questionId);
    for (const id of expect.asks ?? []) assert.ok(asked.includes(id), `${id} was not asked`);
    const routine = walk.counts.context + walk.counts.discrimination + walk.counts.routing;
    if (expect.minQuestions) assert.ok(routine >= expect.minQuestions, `${routine} routine questions`);
  });
}

test('every routable specialist direction is reached by at least one coherent presentation', () => {
  const reached = new Set(SCENARIOS.map((scenario) => scenario.expect.route).filter(Boolean));
  const missing = routableSpecialties()
    .map((record) => record.id)
    .filter((id) => !reached.has(id) && !['respiratory-medicine', 'dermatology'].includes(id));
  // Respiratory Medicine and Dermatology have their own scripted paths in questionnaire-rebuild.test.
  assert.deepEqual(missing, []);
});

/* --- Referral priority notes (NICE NG12, PENDING CLINICAL REVIEW) ---------- */

test('a breast lump at 30 or over carries the NG12 1.4.1 note; under 30 the 1.4.3 note', () => {
  const answers = (id: string, option: string) => [{ questionId: id, optionId: option, answeredAt: '' }];
  const older = referralPriorityNotes(contextFor({ region: 'chest', concern: 'swelling-lump', age: 45, sex: 'female' }), answers(Q.breastFeatures, 'breast-lump'));
  assert.deepEqual(older.map((note) => note.id), ['ng12-1.4.1-breast-lump']);
  const younger = referralPriorityNotes(contextFor({ region: 'chest', concern: 'swelling-lump', age: 25, sex: 'female' }), answers(Q.breastFeatures, 'breast-lump'));
  assert.deepEqual(younger.map((note) => note.id), ['ng12-1.4.3-breast-lump-under-30']);
});

test('the oral, neck, hoarseness and growing-lump notes fire only on their stated thresholds', () => {
  const a = (pairs: Record<string, string>) => Object.entries(pairs).map(([questionId, optionId]) => ({ questionId, optionId, answeredAt: '' }));
  const mouth = contextFor({ region: 'face', face: 'mouth', concern: 'mouth-change', age: 50, sex: 'male' });
  assert.deepEqual(referralPriorityNotes(mouth, a({ [Q.mouthDetail]: 'ulcer', [Q.mouthDuration]: 'over-three-weeks' })).map((n) => n.id), ['ng12-1.8.2-oral-ulcer']);
  assert.deepEqual(referralPriorityNotes(mouth, a({ [Q.mouthDetail]: 'ulcer', [Q.mouthDuration]: 'one-to-three-weeks' })), []);
  const neck = contextFor({ region: 'neck', concern: 'swelling-lump', age: 50, sex: 'male' });
  assert.deepEqual(referralPriorityNotes(neck, a({ [Q.swellingDuration]: 'over-six-weeks' })).map((n) => n.id), ['ng12-1.8.1-neck-lump']);
  assert.deepEqual(referralPriorityNotes(neck, a({ [Q.swellingDuration]: 'under-two-weeks' })), []);
  const throat = contextFor({ region: 'neck', concern: 'voice-swallow', age: 50, sex: 'male' });
  assert.deepEqual(referralPriorityNotes(throat, a({ [Q.throatDetail]: 'hoarse', [Q.throatDuration]: 'over-three-weeks' })).map((n) => n.id), ['ng12-1.8.1-hoarseness']);
  const thigh = contextFor({ region: 'left-thigh', concern: 'swelling-lump', age: 50, sex: 'male' });
  assert.deepEqual(referralPriorityNotes(thigh, a({ [Q.swellingDetail]: 'growing' })).map((n) => n.id), ['ng12-1.11.4-growing-lump']);
});

/* --- SOAP routing rationale and uncertainty (phase 3) ---------------------- */

test('SOAP Assessment says which criteria were met, or what stayed uncertain, never a condition', () => {
  const rationale = (spec: ContextSpec, script: Script) => {
    const walk = walkAssessment(contextFor(spec), script);
    assert.ok(walk.route, 'route');
    return routingRationaleLines(walk.route);
  };
  // A met criteria set names its criteria and their review status.
  const dental = rationale({ region: 'face', face: 'mouth', concern: 'pain', ...ADULT }, { [Q.jawDetail]: 'tooth-gum', [Q.duration]: 'several-days', [Q.toothFeatures]: 'bite' });
  assert.equal(dental.length, 1);
  assert.equal(dental[0].label, 'Routing basis');
  assert.match(dental[0].value, /^Published referral criteria met \((\d+)\): .+pending clinical review\.$/);
  // One dental feature: the parent service says what was missing.
  const partial = rationale({ region: 'face', face: 'mouth', concern: 'pain', ...ADULT }, { [Q.jawDetail]: 'tooth-gum', [Q.duration]: 'today', [Q.toothFeatures]: 'bite' });
  assert.equal(partial[0].label, 'Uncertainty');
  assert.ok(partial.some((line) => line.label === 'Partly met' && /^Dental care: 1 of 2 required features reported\.$/.test(line.value)), JSON.stringify(partial));
  // An exclusion is named as the reason a service was not chosen.
  const excluded = rationale({ region: 'right-hand', concern: 'pain', ...ADULT }, { [Q.mskDuration]: 'over-six-weeks', 'joint-musculoskeletal-pain-injury': 'yes', 'joint-musculoskeletal-pain-swelling-bruising': 'yes', [Q.mskMechanical]: 'none', [Q.jointPattern]: 'small-joints+both-sides', [Q.mskSiteFeatures]: 'none' });
  assert.ok(excluded.some((line) => line.label === 'Not referred' && line.value.startsWith('Rheumatology')), JSON.stringify(excluded));
  // Genuine ambiguity says so.
  const ambiguous = rationale({ region: 'chest', concern: 'breathing', age: 45, sex: 'male' }, { [Q.symptomCharacter]: 'tight', [Q.duration]: 'under-hour', 'shortness-of-breath-ankle-swelling': 'yes', 'shortness-of-breath-lying-flat': 'yes', 'shortness-of-breath-wheeze': 'no', 'shortness-of-breath-palpitations': 'yes', [Q.breathingInfections]: 'yes', [Q.breathingPhlegm]: 'yes' });
  assert.match(ambiguous[0].value, /more than one body system/);
  for (const line of [...dental, ...partial, ...excluded, ...ambiguous]) {
    assert.doesNotMatch(line.value, /diagnos|probab|confiden|likely|\d\s*%/i, line.value);
  }
});

test('a priority note reaches the handoff Plan and never names a condition to the patient', () => {
  const context = contextFor({ region: 'chest', concern: 'swelling-lump', age: 45, sex: 'female' });
  const answers = [{ questionId: Q.breastFeatures, optionId: 'breast-lump', answeredAt: '' }];
  const notes = referralPriorityNotes(context, answers);
  const soap = buildSoapHandoff({
    complaintLabel: 'Lump',
    complaintSource: 'bridge-resolved',
    capture: { painLocation: { regionId: 'chest', precision: 'general-area' }, view: 'front' },
    intakePlan: intakeQuestionsFor(context.complaintId, context),
    intakeAnswers: answers,
    timeline: [],
    converged: true,
    directionLabel: 'General Surgery',
    referralPriority: notes.map((note) => note.clinicianText),
  });
  const plan = soap.find((section) => section.key === 'P')!;
  assert.ok(plan.lines.some((line) => line.label === 'Referral priority' && /NG12 1\.4\.1/.test(line.value) && /PENDING CLINICAL REVIEW/.test(line.value)));
  assert.doesNotMatch(PATIENT_PRIORITY_TEXT, /cancer|tumou?r|malignan/i);
  for (const note of notes) assert.doesNotMatch(note.clinicianText, /\bcancer\b(?! pathway)/i);
});
