/**
 * Phase 4: questionnaire depth, wider routing and stopping (PENDING CLINICAL REVIEW).
 *
 * Each previously shallow pathway that sources allow to deepen now asks its
 * sourced question; each new question stays out of pathways it does not
 * belong to; new hard stops still interrupt at once; and no assessment ends
 * at a parent service while a question that could still change the outcome
 * is unasked (a question-bank gap is never presented as sufficient evidence).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { BODY_DOMAIN, type BodyRegionId } from '../../body/index.ts';
import { concernOptionsFor } from '../body-explorer/clinical-coverage.ts';
import { FACE_HIT_REGIONS, type FaceRegionId } from '../body-explorer/faceHitMap.ts';
import { INTAKE_QUESTION_IDS as Q, intakeQuestionsFor } from '../routing-flow/intake-questions.ts';
import { buildSoapHandoff } from '../routing-flow/soap-handoff.ts';
import { soapBackground } from '../routing-flow/soap-background.ts';
import { patientFor } from './clinical-walk.ts';
import { contextFor, walkAssessment, type ContextSpec, type Script } from './clinical-walk.ts';

const asked = (spec: ContextSpec, script: Script = {}) => walkAssessment(contextFor(spec), script);
const ids = (walk: ReturnType<typeof walkAssessment>) => walk.steps.map((step) => step.questionId);
const routine = (walk: ReturnType<typeof walkAssessment>) => walk.steps.filter((step) => step.owner !== 'safety').length;

test('weakness and numbness are asked when they started, everywhere they are offered', () => {
  for (const spec of [
    { region: 'face', face: 'forehead', concern: 'weakness-drooping', age: 40 },
    { region: 'face', face: 'patient-left-cheek', concern: 'numbness-tingling', age: 40 },
    { region: 'head', concern: 'weakness-drooping', age: 40 },
    { region: 'neck', concern: 'weakness-drooping', age: 40 },
    { region: 'right-thigh', concern: 'weakness-drooping', age: 62, sex: 'male' },
    { region: 'face', face: 'patient-left-cheek', concern: 'weakness-drooping', age: 8 },
  ] as const) {
    const walk = asked(spec);
    assert.ok(ids(walk).includes(Q.neurologicDuration), JSON.stringify(spec));
    assert.ok(routine(walk) >= 5, `${JSON.stringify(spec)}: ${routine(walk)} routine questions`);
  }
});

test("facial weakness is asked the NHS Bell's palsy urgent features after the stroke check, never limb weakness", () => {
  const face = ids(asked({ region: 'face', face: 'patient-left-cheek', concern: 'weakness-drooping', age: 40 }));
  assert.ok(face.indexOf('safety-generic-new-neurological-change') < face.indexOf('safety-face-weakness-urgent'), face.join(' > '));
  assert.ok(!ids(asked({ region: 'right-thigh', concern: 'weakness-drooping', age: 40 })).includes('safety-face-weakness-urgent'));
});

test('a face injury is asked what was noticed; a tooth is offered only where teeth are', () => {
  const forehead = asked({ region: 'face', face: 'forehead', concern: 'injury', age: 40 });
  assert.ok(ids(forehead).includes(Q.faceInjuryFeatures));
  assert.ok(routine(forehead) >= 5, `${routine(forehead)}`);
  const foreheadOptions = forehead.steps.find((step) => step.questionId === Q.faceInjuryFeatures);
  assert.ok(foreheadOptions);
  assert.ok(ids(asked({ region: 'face', face: 'mouth', concern: 'injury', age: 40 })).includes(Q.faceInjuryFeatures));
  // A limb injury keeps its own injury questions.
  assert.ok(!ids(asked({ region: 'left-forearm', concern: 'injury', age: 40 })).includes(Q.faceInjuryFeatures));
});

test('a mouth injury does not ask how it began after asking what happened', () => {
  const walk = ids(asked({ region: 'face', face: 'mouth', concern: 'injury', age: 40 }));
  assert.ok(walk.includes(Q.injuryDetail));
  assert.ok(!walk.includes(Q.onset), walk.join(' > '));
});

test('falls questions are asked at 65 and over after a fall, and only then', () => {
  const older = ids(asked({ region: 'left-knee', concern: 'injury', age: 72, sex: 'male' }, { [Q.injuryDetail]: 'fall' }));
  assert.ok(older.includes(Q.fallsCount) && older.includes(Q.fallGetUp));
  assert.ok(!ids(asked({ region: 'left-knee', concern: 'injury', age: 72, sex: 'male' }, { [Q.injuryDetail]: 'impact' })).includes(Q.fallsCount));
  assert.ok(!ids(asked({ region: 'left-knee', concern: 'injury', age: 64, sex: 'male' }, { [Q.injuryDetail]: 'fall' })).includes(Q.fallsCount));
  assert.ok(!ids(asked({ region: 'left-knee', concern: 'injury', age: 10 }, { [Q.injuryDetail]: 'fall' })).includes(Q.fallsCount));
});

test('nose bleeding, nose lumps and chewing pain are asked their sourced follow-ups', () => {
  assert.ok(ids(asked({ region: 'face', face: 'nose', concern: 'bleeding-discharge', age: 50 })).includes(Q.nosebleedFrequency));
  assert.ok(ids(asked({ region: 'face', face: 'nose', concern: 'swelling-lump', age: 50 })).includes(Q.nosePolypFeatures));
  assert.ok(ids(asked({ region: 'face', face: 'patient-left-cheek', concern: 'pain', age: 50 }, { [Q.facePainPattern]: 'chewing' })).includes(Q.faceTmdFeatures));
  assert.ok(!ids(asked({ region: 'face', face: 'patient-left-cheek', concern: 'pain', age: 50 }, { [Q.facePainPattern]: 'tooth' })).includes(Q.faceTmdFeatures));
});

test('a lower tummy or pelvic injury now has its safety checks; an upper tummy injury keeps its own', () => {
  for (const region of ['lower-abdomen', 'pelvis'] as const) {
    const walk = ids(asked({ region, concern: 'injury', age: 40, sex: 'female' }));
    assert.ok(walk.includes('safety-lower-abdominal-severe-or-faint'), region);
    assert.ok(walk.includes('safety-lower-injury-blood-in-urine'), region);
  }
  const child = ids(asked({ region: 'lower-abdomen', concern: 'injury', age: 8 }));
  assert.ok(child.includes('safety-pediatric-abdominal-emergency') && child.includes('safety-lower-injury-blood-in-urine'));
  assert.ok(!ids(asked({ region: 'upper-abdomen', concern: 'injury', age: 40 })).includes('safety-lower-injury-blood-in-urine'));
});

test('a lower tummy concern described as something else is asked the pelvic emergency check once movement or feeling unwell is reported', () => {
  for (const option of ['movement', 'systemic']) {
    assert.ok(ids(asked({ region: 'lower-abdomen', concern: 'other', age: 40, sex: 'female' }, { [Q.lowerAssociatedSystem]: option })).includes('safety-lower-abdominal-severe-or-faint'), option);
  }
  assert.ok(!ids(asked({ region: 'lower-abdomen', concern: 'other', age: 40, sex: 'female' }, { [Q.lowerAssociatedSystem]: 'none' })).includes('safety-lower-abdominal-severe-or-faint'));
});

test('a voice or swallowing concern is asked the NHS swallowing check, adults and children', () => {
  for (const spec of [
    { region: 'neck', concern: 'voice-swallow', age: 60 },
    { region: 'chest', concern: 'voice-swallow', age: 8, sex: 'male' },
    { region: 'chest', concern: 'voice-swallow', age: 50, sex: 'female' },
  ] as const) {
    assert.ok(ids(asked(spec)).includes('safety-swallowing-urgent'), JSON.stringify(spec));
  }
});

test('the new hard stops interrupt at once: nothing is asked after the sign', () => {
  for (const [spec, script, rule] of [
    [{ region: 'face', face: 'forehead', concern: 'injury', age: 30 }, { [Q.injuryDetail]: 'impact', [Q.faceInjuryFeatures]: 'black-eye', 'safety-black-eye-emergency': 'yes' }, 'black-eye-emergency'],
    [{ region: 'face', face: 'patient-right-cheek', concern: 'injury', age: 30 }, { [Q.injuryDetail]: 'impact', [Q.faceInjuryFeatures]: 'wound', 'safety-face-wound-emergency': 'yes' }, 'face-wound-emergency'],
  ] as const) {
    const walk = asked(spec, script);
    assert.equal(walk.outcome, 'interrupted');
    assert.equal(walk.interruptedRuleId, rule);
    assert.equal(walk.steps.at(-1)?.questionId, `safety-${rule}`);
  }
});

/* --- Premature conclusion audit over every location, concern and profile ---- */

const PROFILES = [
  { age: 40, sex: 'female' as const },
  { age: 40, sex: 'male' as const },
  { age: 72, sex: 'female' as const },
  { age: 15, sex: 'female' as const, reporter: 'young-person' as const },
  { age: 8, sex: 'male' as const },
];

test('no assessment ends at a parent service while a question that could change it is still unasked', () => {
  const regions = [...new Set<BodyRegionId>([...BODY_DOMAIN.keyboardOrder.front, ...BODY_DOMAIN.keyboardOrder.back])].filter((id) => id !== 'face');
  const locations: { region: BodyRegionId; face: FaceRegionId | null }[] = [
    ...regions.map((region) => ({ region, face: null })),
    ...FACE_HIT_REGIONS.map((face) => ({ region: 'face' as BodyRegionId, face: face.id })),
  ];
  let walks = 0;
  const premature: string[] = [];
  for (const location of locations) {
    for (const profile of PROFILES) {
      for (const concern of concernOptionsFor(location.region, location.face, { age: profile.age, sexForAssessment: profile.sex })) {
        const walk = walkAssessment(contextFor({ region: location.region, face: location.face, concern: concern.id, ...profile }), {});
        walks += 1;
        if (walk.outcome !== 'result' || !walk.route) continue;
        const open = walk.route.gate?.openDiscriminatorQuestionIds ?? [];
        if (walk.route.basis === 'parent-service' && open.length > 0) {
          premature.push(`${location.region}/${location.face ?? '-'}/${concern.id}/${profile.age}: ${open.join(',')}`);
        }
      }
    }
  }
  assert.ok(walks > 1800, `${walks} walks`);
  assert.deepEqual(premature, []);
});

/* --- SOAP background (browser handoff only) -------------------------------- */

test('the browser SOAP carries the background the patient gave; unanswered items are never written as negatives', () => {
  const patient = { ...patientFor(58, 'female'), existingConditions: [], allergyStatus: 'none_known', medicationStatus: 'none', surgeryStatus: 'no' } as Parameters<typeof soapBackground>[0];
  const background = soapBackground(patient);
  assert.ok(!background.some((line) => line.value === 'Not answered'), JSON.stringify(background));
  assert.ok(background.some((line) => line.label === 'Allergies'));
  const context = contextFor({ region: 'face', face: 'mouth', concern: 'pain', age: 58, sex: 'female' });
  const base = {
    complaintLabel: 'Pain',
    complaintSource: 'bridge-resolved' as const,
    capture: { painLocation: null, view: null },
    intakePlan: intakeQuestionsFor(context.complaintId, context),
    intakeAnswers: [],
    timeline: [],
    converged: false,
    directionLabel: 'General Medicine',
  };
  const withBackground = buildSoapHandoff({ ...base, background }).find((section) => section.key === 'S')!;
  assert.ok(withBackground.lines.some((line) => line.label === 'Allergies'));
  // The trusted server handoff never passes background, so its Subjective has none.
  const server = buildSoapHandoff(base).find((section) => section.key === 'S')!;
  assert.ok(!server.lines.some((line) => ['Allergies', 'Medications', 'Existing conditions'].includes(line.label)));
});