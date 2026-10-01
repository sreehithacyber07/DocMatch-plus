/**
 * The questionnaire, paediatric and specialty-routing rebuild.
 *
 * Every assessment here is walked through clinical-walk.ts, which makes the
 * calls RoutingFlow makes, so a trace in this file is the trace a patient sees.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as React from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BODY_DOMAIN } from '../../body/index.ts';
import { createRoutingSession } from '../../engine/index.ts';
import { materializeDemonstrationComplaint, R2B_DEMONSTRATION_KNOWLEDGE } from '../../engine/data/index.ts';
import { R3_SAFETY_KNOWLEDGE } from '../../engine/safety/index.ts';
import { concernOptionsFor, type RegionAssessmentContext } from '../body-explorer/clinical-coverage.ts';
import { FACE_HIT_REGIONS, type FaceRegionId } from '../body-explorer/faceHitMap.ts';
import { emptyPatientContext, finalizePatientContext, localToday, type PatientContextDraft } from '../intake/patient-context.ts';
import {
  needsReporterChoice,
  questionVoiceFor,
  voiceLeaks,
  type QuestionVoice,
  type ReporterChoice,
} from '../intake/question-voice.ts';
import { UnderEighteenAcknowledgement } from '../intake/UnderEighteenAcknowledgement.tsx';
import { safetyQuestionIdsForClinicalContext } from '../routing-flow/contextual-safety.ts';
import { evaluateDirectionGate } from '../routing-flow/direction-gate.ts';
import { intakeQuestionsFor, type IntakeAnswer } from '../routing-flow/intake-questions.ts';
import { eligibleRouteDirections, isPresentable } from '../routing-flow/route-eligibility.ts';
import { InterviewIntelligenceRail } from '../routing-flow/RouteIntelligence.tsx';
import { routableSpecialties } from '../routing-flow/specialty-registry.ts';
import { contextFor, walkAssessment, type ContextSpec, type Script, type WalkResult } from './clinical-walk.ts';

// The components are compiled with the classic JSX runtime under tsx.
(globalThis as { React?: typeof React }).React = React;

const source = (path: string) => readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');

interface Band {
  label: string;
  age: number;
  reporter?: ReporterChoice;
}

const PEDIATRIC_BANDS: readonly Band[] = [
  { label: 'infant', age: 0 },
  { label: '1-4', age: 3 },
  { label: '5-11', age: 8 },
  { label: '12-17 self', age: 15, reporter: 'young-person' },
  { label: '12-17 caregiver', age: 15, reporter: 'caregiver' },
];
const ADULT: Band = { label: 'adult', age: 34 };

type Family = Omit<ContextSpec, 'age' | 'reporter'>;

const PEDIATRIC_FAMILIES: Readonly<Record<string, Family>> = {
  ear: { region: 'face', face: 'patient-left-ear', concern: 'pain' },
  nose: { region: 'face', face: 'nose', concern: 'nose-change' },
  throat: { region: 'neck', concern: 'throat' },
  eye: { region: 'face', face: 'patient-right-eye', concern: 'eye-redness-discharge' },
  breathing: { region: 'chest', concern: 'breathing' },
  abdomen: { region: 'upper-abdomen', concern: 'pain' },
  urinary: { region: 'lower-abdomen', concern: 'urinary-change' },
  skin: { region: 'left-forearm', concern: 'skin-change' },
  knee: { region: 'right-knee', concern: 'injury' },
};

const ADULT_FAMILIES: Readonly<Record<string, Family>> = {
  'upper abdomen': { region: 'upper-abdomen', concern: 'pain' },
  'lower abdomen': { region: 'lower-abdomen', concern: 'pain' },
  constipation: { region: 'lower-abdomen', concern: 'bowel-change' },
  urinary: { region: 'lower-abdomen', concern: 'urinary-change', sex: 'male' },
  reproductive: { region: 'lower-abdomen', concern: 'reproductive-pelvic-change' as never, sex: 'female' },
  ear: { region: 'face', face: 'patient-left-ear', concern: 'pain' },
  nose: { region: 'face', face: 'nose', concern: 'nose-change' },
  throat: { region: 'neck', concern: 'throat' },
  eye: { region: 'face', face: 'patient-right-eye', concern: 'vision-change' },
  neck: { region: 'neck', concern: 'swelling-lump' },
  face: { region: 'face', face: 'patient-left-cheek', concern: 'numbness-tingling' },
  joint: { region: 'right-knee', concern: 'pain' },
  skin: { region: 'left-forearm', concern: 'skin-change' },
  headache: { region: 'head', concern: 'pain' },
  breathing: { region: 'chest', concern: 'breathing' },
};

/** Questions every branch may share. Everything else is branch-specific. */
const SHARED_QUESTION_IDS = new Set([
  'intake-history-complaint-entry',
  'intake-history-current-impact',
  'intake-history-duration',
  'intake-history-onset',
  'intake-history-pattern',
  'intake-history-symptom-character',
  'intake-history-function-impact',
  'intake-pediatric-overall-wellbeing',
]);

function walk(family: Family, band: Band, script: Script = {}): WalkResult {
  return walkAssessment(contextFor({ ...family, age: band.age, reporter: band.reporter ?? null }), script);
}

function everyContext(ages: readonly Band[]): { context: RegionAssessmentContext; band: Band }[] {
  const out: { context: RegionAssessmentContext; band: Band }[] = [];
  for (const region of BODY_DOMAIN.regions) {
    const faces: readonly (FaceRegionId | null)[] = region.id === 'face' ? FACE_HIT_REGIONS.map((face) => face.id) : [null];
    for (const face of faces) {
      for (const band of ages) {
        for (const sex of ['female', 'male'] as const) {
          for (const concern of concernOptionsFor(region.id, face, { age: band.age, sexForAssessment: sex })) {
            out.push({
              band,
              context: contextFor({ region: region.id, face, concern: concern.id, age: band.age, sex, reporter: band.reporter ?? null }),
            });
          }
        }
      }
    }
  }
  return out;
}

function intakeAnswersOf(result: WalkResult): IntakeAnswer[] {
  const plan = intakeQuestionsFor(result.context.complaintId, result.context);
  return [
    { questionId: plan[0].id, optionId: result.context.concernId, answeredAt: '' },
    ...result.steps
      .filter((step) => step.owner === 'intake')
      .map((step) => ({ questionId: step.questionId, optionId: step.answer, answeredAt: '' })),
  ];
}

/* --- Under-18 acknowledgement and the locked voice ------------------------------ */

/** A complete draft for a patient who is exactly `age` today: age is derived from the date of birth, never stored. */
function completeDraft(age: number, acknowledged: boolean, reporter: ReporterChoice | null = null): PatientContextDraft {
  const today = localToday();
  const parts = { day: String(today.day).padStart(2, '0'), month: String(today.month).padStart(2, '0'), year: String(today.year - age) };
  return {
    ...emptyPatientContext(),
    dateOfBirth: `${parts.year}-${parts.month}-${parts.day}`,
    dateOfBirthParts: parts,
    sexForAssessment: 'female',
    accessibilityNeeds: ['none'],
    existingConditions: ['none_known'],
    previousSimilarEpisode: 'no',
    allergyStatus: 'none_known',
    medicationStatus: 'none',
    surgeryStatus: 'no',
    underEighteenAcknowledged: acknowledged,
    reporter,
  };
}

test('the adult-presence acknowledgement is required under 18 and never at 18', () => {
  for (const age of [4, 10, 15, 17]) {
    assert.equal(finalizePatientContext(completeDraft(age, false)), null, `age ${age} passed without the acknowledgement`);
    assert.ok(finalizePatientContext(completeDraft(age, true, needsReporterChoice(age) ? 'caregiver' : null)));
  }
  assert.ok(finalizePatientContext(completeDraft(18, false)), 'an adult is not asked for an acknowledgement');
});

test('only 12 to 17 are asked who is answering, and the answer locks the voice', () => {
  assert.deepEqual([4, 10, 11, 12, 15, 17, 18].map(needsReporterChoice), [false, false, false, true, true, true, false]);
  assert.equal(questionVoiceFor(4), 'caregiver');
  assert.equal(questionVoiceFor(10), 'caregiver');
  assert.equal(questionVoiceFor(15, 'young-person'), 'self');
  assert.equal(questionVoiceFor(15, 'caregiver'), 'caregiver');
  assert.equal(questionVoiceFor(17, null), 'caregiver', 'an unanswered choice addresses the responsible adult');
  assert.equal(questionVoiceFor(18, 'caregiver'), 'self');
  assert.equal(finalizePatientContext(completeDraft(15, true, 'young-person'))?.questionVoice, 'self');
  assert.equal(finalizePatientContext(completeDraft(15, true, 'caregiver'))?.questionVoice, 'caregiver');
  assert.equal(finalizePatientContext(completeDraft(10, true))?.questionVoice, 'caregiver');
  assert.equal(finalizePatientContext(completeDraft(40, false))?.questionVoice, 'self');
});

test('the acknowledgement stores nothing about the adult', () => {
  const context = finalizePatientContext(completeDraft(10, true))!;
  assert.ok(Object.keys(context).every((key) => !/guardian|parent|carer|adult|relationship|phone|contact/i.test(key)));
  const modal = source('src/features/intake/UnderEighteenAcknowledgement.tsx');
  assert.doesNotMatch(modal, /type="(?:text|tel|email)"|TextField|OptionalPhoneField/);
});

test('the acknowledgement carries the approved copy, and asks who is answering only for 12 to 17', () => {
  const render = (age: number) => renderToStaticMarkup(createElement(UnderEighteenAcknowledgement, {
    open: true, age, onContinue: () => undefined, onBack: () => undefined,
  })).replace(/\s+/g, ' ');
  const shared = [
    'Under-18 assessment',
    'A responsible adult should be present',
    'This assessment is for someone under 18. A parent, guardian, caregiver, or other responsible adult should stay with them while the questions are answered. Some questions may need their help, and any urgent guidance should be acted on by an adult.',
    'DocMatch+ organizes the symptoms reported here and recommends a clinical direction. It does not provide a diagnosis.',
    'Go back',
  ];
  // Under 12: the adult answers, and the primary action names the adult's presence.
  const child = render(10);
  for (const copy of [...shared, 'Continue with an adult present']) assert.ok(child.includes(copy), `age 10 missing: ${copy}`);
  assert.doesNotMatch(child, /WHO WILL ANSWER/i);
  // 12 to 17: who is answering is chosen first, and Continue waits for the choice.
  const teen = render(15);
  for (const copy of [...shared, 'WHO WILL ANSWER THE QUESTIONS?', 'The young person', 'Parent, guardian or caregiver', 'CONTINUE TO ASSESSMENT']) {
    assert.ok(teen.includes(copy), `age 15 missing: ${copy}`);
  }
  assert.match(teen, /<button[^>]*disabled[^>]*>(?:<span[^>]*>)?CONTINUE TO ASSESSMENT/, 'Continue is disabled until a reporter is chosen');
  assert.doesNotMatch(teen, /legal|law|required by/i, 'a product safety rule, not a legal claim');
  const intake = source('src/features/intake/PatientIntake.tsx');
  assert.match(intake, /isUnder18\(age\) && !draft\.underEighteenAcknowledged/);
  assert.match(intake, /underEighteenAcknowledged: false, reporter: null/, 'a corrected age resets the acknowledgement');
});

/* --- Mixed voice ------------------------------------------------------------------- */

test('no assessment mixes voices: zero leaks across every region, face area, concern and age mode', () => {
  const leaks: string[] = [];
  const check = (voice: QuestionVoice, where: string, text: string) => {
    for (const pattern of voiceLeaks(voice, text)) leaks.push(`${where} [${voice}] ${pattern} :: ${text}`);
  };
  const safetyById = new Map(R3_SAFETY_KNOWLEDGE.questions.map((question) => [question.id, question]));
  let sessions = 0;
  for (const { context, band } of everyContext([...PEDIATRIC_BANDS, ADULT])) {
    const voice = context.questionVoice;
    const where = `${band.label} ${context.bodyRegionId}/${context.faceSubregionId ?? '-'}/${context.concernId}`;
    for (const question of intakeQuestionsFor(context.complaintId, context)) {
      check(voice, where, question.prompt);
      for (const option of question.options) check(voice, where, option.label);
    }
    // Every safety question this context could ask, in the wording it would use.
    for (const id of safetyQuestionIdsForClinicalContext(context, [])) {
      const question = safetyById.get(id);
      if (!question || question.kind !== 'safety_owned') continue;
      if (voice === 'caregiver') assert.ok(question.caregiverText, `${id} has no caregiver wording but a caregiver context can ask it`);
      check(voice, where, voice === 'caregiver' ? question.caregiverText ?? question.text : question.text);
    }
    const result = walkAssessment(context);
    sessions += 1;
    for (const step of result.steps) check(voice, where, step.text);
  }
  assert.ok(sessions > 2000);
  assert.deepEqual(leaks, []);
});

/* --- Paediatric matrix ----------------------------------------------------------- */

test('paediatric matrix: every band and family completes with a presentable route and its own branch', () => {
  for (const band of PEDIATRIC_BANDS) {
    for (const [name, family] of Object.entries(PEDIATRIC_FAMILIES)) {
      const result = walk(family, band);
      const where = `${band.label} ${name}`;
      assert.equal(result.outcome, 'result', where);
      assert.equal(result.voice, band.reporter === 'young-person' ? 'self' : 'caregiver', where);
      const route = result.route!;
      assert.ok(isPresentable(eligibleRouteDirections(result.context), route.registryId), `${where} presented ${route.registryId}`);
      assert.ok(
        !['cardiology', 'respiratory-medicine', 'urology', 'obstetrics-gynaecology', 'medical-gastroenterology', 'general-medicine'].includes(route.registryId),
        `${where}: a child was sent to an adult service (${route.registryId})`,
      );
      const specific = result.steps.filter((step) => step.owner === 'intake' && !SHARED_QUESTION_IDS.has(step.questionId));
      assert.ok(specific.length >= 2, `${where} asked only generic questions`);
    }
  }
});

test('ear, knee, abdomen, throat and breathing are different assessments for a child', () => {
  for (const band of [PEDIATRIC_BANDS[1], PEDIATRIC_BANDS[2]]) {
    const names = ['ear', 'knee', 'abdomen', 'throat', 'breathing'] as const;
    // The branch questions. The canonical core (impact, duration, onset,
    // wellbeing) is shared on purpose so one concept is never asked twice in two
    // wordings, and under five the IMNCI danger signs are the same checks for
    // every complaint, so neither counts here.
    const branch = Object.fromEntries(names.map((name) => [
      name,
      new Set(walk(PEDIATRIC_FAMILIES[name], band).steps
        .filter((step) => step.owner === 'intake' && !SHARED_QUESTION_IDS.has(step.questionId))
        .map((step) => step.questionId)),
    ]));
    for (const name of names) assert.ok(branch[name].size >= 2, `${band.label} ${name} has ${branch[name].size} branch questions`);
    for (const left of names) {
      for (const right of names) {
        if (left >= right) continue;
        const shared = [...branch[left]].filter((id) => branch[right].has(id));
        assert.deepEqual(shared, [], `${band.label} ${left} and ${right} share branch questions`);
      }
    }
  }
});

/* --- Adult matrix ---------------------------------------------------------------- */

test('adult matrix: each family gets its own branch questions and a presentable route', () => {
  const firstBranch = new Map<string, string>();
  for (const [name, family] of Object.entries(ADULT_FAMILIES)) {
    const result = walk(family, ADULT);
    assert.equal(result.outcome, 'result', name);
    assert.equal(result.voice, 'self');
    assert.ok(isPresentable(eligibleRouteDirections(result.context), result.route!.registryId), `${name} presented ${result.route!.registryId}`);
    const specific = result.steps.filter((step) => step.owner === 'intake' && !SHARED_QUESTION_IDS.has(step.questionId));
    const routing = result.steps.filter((step) => step.owner === 'routing' || step.owner === 'screened-routing');
    const minimum = eligibleRouteDirections(result.context).narrowerServiceIds.length > 0 ? 2 : 1;
    assert.ok(specific.length + routing.length >= minimum, `${name} asked only generic questions`);
    firstBranch.set(name, (specific[0] ?? routing[0]).questionId);
  }
  // Region and concern decide the branch: no two families open on the same branch question,
  // except the constipation/lower-abdomen pair, which share the lower-abdomen branch by design.
  const opening = [...firstBranch.entries()].filter(([name]) => name !== 'lower abdomen');
  assert.equal(new Set(opening.map(([, id]) => id)).size, opening.length, JSON.stringify(opening));
});

/* --- Adaptivity -------------------------------------------------------------------- */

/*
  Branches whose questions are all relevant whatever the earlier answers, so
  the order does not change. Each is short (four or five questions) and has no
  sourced conditional follow-up yet. They are listed so the gap stays visible
  and the test fails the day one becomes adaptive.
*/
const COMPACT_BRANCHES = new Set<string>([]);

test('an answer changes what is asked next, in every major family', () => {
  const families: [string, Family, Band][] = [
    ...Object.entries(PEDIATRIC_FAMILIES).map(([name, family]): [string, Family, Band] => [`child ${name}`, family, PEDIATRIC_BANDS[2]]),
    ...Object.entries(ADULT_FAMILIES).map(([name, family]): [string, Family, Band] => [`adult ${name}`, family, ADULT]),
  ];
  for (const [name, family, band] of families) {
    const base = walk(family, band);
    const plan = intakeQuestionsFor(base.context.complaintId, base.context);
    const sequences = new Set<string>([base.steps.map((entry) => entry.questionId).join('>')]);
    for (const step of base.steps.filter((entry) => entry.classification !== 'SAFETY')) {
      const options = step.owner === 'intake'
        ? plan.find((candidate) => candidate.id === step.questionId)!.options.map((option) => option.id)
        : ['yes', 'no', 'unsure'];
      for (const optionId of options) {
        try {
          sequences.add(walk(family, band, { [step.questionId]: optionId }).steps.map((entry) => entry.questionId).join('>'));
        } catch {
          // An option the question does not offer.
        }
      }
    }
    if (COMPACT_BRANCHES.has(name)) {
      assert.equal(sequences.size, 1, `${name} is adaptive now; remove it from COMPACT_BRANCHES`);
      continue;
    }
    assert.ok(sequences.size > 1, `${name}: no answer changes what is asked next`);
  }
});

test('named adaptive traces: answer A leads to question X, answer B to question Y', () => {
  const next = (family: Family, band: Band, script: Script, after: string) => {
    const steps = walk(family, band, script).steps;
    return steps[steps.findIndex((step) => step.questionId === after) + 1]?.questionId;
  };
  const child = PEDIATRIC_BANDS[2];
  // Throat: a first episode is not asked about impact; a recurrent pattern is.
  const firstThroat = walk(PEDIATRIC_FAMILIES.throat, child, { 'intake-throat-recurrence': 'first' });
  const recurrentThroat = walk(PEDIATRIC_FAMILIES.throat, child, { 'intake-throat-recurrence': 'seven-in-year' });
  assert.ok(!firstThroat.steps.some((step) => step.questionId === 'intake-throat-impact'));
  assert.ok(recurrentThroat.steps.some((step) => step.questionId === 'intake-throat-impact'));
  // Lower abdomen: the associated system chosen opens its own branch.
  const lower = ADULT_FAMILIES['lower abdomen'];
  const bowel = walk(lower, ADULT, { 'intake-lower-associated-system': 'bowel' }).steps.map((step) => step.questionId);
  const urinary = walk(lower, ADULT, { 'intake-lower-associated-system': 'urinary' }).steps.map((step) => step.questionId);
  assert.ok(bowel.includes('intake-lower-bowel-detail') && !bowel.includes('intake-lower-urinary-detail'));
  assert.ok(urinary.includes('intake-lower-urinary-detail') && !urinary.includes('intake-lower-bowel-detail'));
  // A child's bowel red flag brings the abdominal safety check forward.
  const bowelChild = { region: 'lower-abdomen', concern: 'bowel-change' } as Family;
  assert.equal(
    next(bowelChild, PEDIATRIC_BANDS[1], { 'intake-pediatric-bowel-red-flag': 'swollen-vomiting' }, 'intake-pediatric-bowel-red-flag'),
    'safety-pediatric-abdominal-emergency',
  );
  assert.notEqual(
    next(bowelChild, PEDIATRIC_BANDS[1], { 'intake-pediatric-bowel-red-flag': 'none' }, 'intake-pediatric-bowel-red-flag'),
    'safety-pediatric-abdominal-emergency',
  );
});

/* --- Throat regressions ------------------------------------------------------------ */

test('throat: a short uncomplicated sore throat in a child is not sent to ENT', () => {
  const result = walk(PEDIATRIC_FAMILIES.throat, PEDIATRIC_BANDS[2], {
    'intake-throat-detail': 'sore',
    'intake-throat-duration': 'under-one-week',
    'intake-throat-associated': 'fever',
    'intake-throat-recurrence': 'first',
  });
  assert.equal(result.outcome, 'result');
  assert.equal(result.route!.registryId, 'paediatrics');
  assert.notEqual(result.route!.registryId, 'otorhinolaryngology');
  assert.equal(result.route!.gate?.openDiscriminatorQuestionIds.length, 0);
});

test('throat: a recurrent, disabling pattern that meets the published criteria reaches ENT', () => {
  const result = walk(PEDIATRIC_FAMILIES.throat, PEDIATRIC_BANDS[2], {
    'intake-throat-detail': 'sore',
    'intake-throat-duration': 'under-one-week',
    'intake-throat-associated': 'fever',
    'intake-throat-recurrence': 'seven-in-year',
    'intake-throat-impact': 'yes',
  });
  assert.equal(result.route!.registryId, 'otorhinolaryngology');
  assert.equal(result.route!.basis, 'source-backed-criteria');
});

test('throat: difficulty breathing, drooling or being unable to swallow stops the assessment at once', () => {
  const result = walk(PEDIATRIC_FAMILIES.throat, PEDIATRIC_BANDS[2], { 'safety-throat-airway': 'yes' });
  assert.equal(result.outcome, 'interrupted');
  assert.equal(result.route, null);
  assert.equal(result.interruptedRuleId, 'throat-airway-danger');
  assert.equal(result.steps.at(-1)!.questionId, 'safety-throat-airway', 'nothing is asked after a hard stop');
});

/* --- Stomach and irrelevant specialties -------------------------------------------- */

test('an abdominal assessment can only ever present an abdominal or parent service', () => {
  const allowed = new Set(['medical-gastroenterology', 'urology', 'obstetrics-gynaecology', 'general-medicine', 'paediatrics', 'dermatology']);
  for (const { context } of everyContext([PEDIATRIC_BANDS[2], ADULT])) {
    if (!['upper-abdomen', 'lower-abdomen', 'pelvis'].includes(context.bodyRegionId)) continue;
    const eligibility = eligibleRouteDirections(context);
    // R1 weighs a cardiac cause for adult upper abdominal pain on exertion; that is the one
    // non-abdominal service an abdominal assessment may present.
    const cardiacAllowed = context.complaintId === 'upper-abdominal-pain';
    for (const id of eligibility.narrowerServiceIds) {
      assert.ok(allowed.has(id) || (cardiacAllowed && id === 'cardiology'), `${context.bodyRegionId}/${context.concernId} could present ${id}`);
    }
    if (context.concernId !== 'skin-change') assert.ok(!eligibility.narrowerServiceIds.includes('dermatology'));
    assert.ok(!eligibility.narrowerServiceIds.includes('neurology'));
    assert.ok(!eligibility.narrowerServiceIds.includes('orthopaedics'));
  }
});

test('no route outside the eligible set is ever presented, over sampled answer paths', () => {
  let seed = 5;
  const random = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  const families = [...Object.values(ADULT_FAMILIES).map((family) => [family, ADULT] as const),
    ...Object.values(PEDIATRIC_FAMILIES).map((family) => [family, PEDIATRIC_BANDS[2]] as const)];
  for (const [family, band] of families) {
    const context = contextFor({ ...family, age: band.age });
    const eligibility = eligibleRouteDirections(context);
    for (let run = 0; run < 60; run += 1) {
      const result = walkAssessment(context, {}, 40, (_id, options, kind) =>
        kind === 'safety' ? 'no' : options[Math.floor(random() * options.length)]);
      if (result.route) assert.ok(isPresentable(eligibility, result.route.registryId), `${context.complaintId} presented ${result.route.registryId}`);
    }
  }
});

test('the patient-facing interview panel shows no specialty and no percentage', () => {
  const complaint = materializeDemonstrationComplaint(R2B_DEMONSTRATION_KNOWLEDGE, 'upper-abdominal-pain', []);
  const session = createRoutingSession('upper-abdominal-pain', complaint.prior, '2026-09-24T00:00:00.000Z');
  const html = renderToStaticMarkup(createElement(InterviewIntelligenceRail, {
    belief: session.belief,
    history: [],
    reduceMotion: true,
    complaintLabel: 'Upper abdomen',
    regionSummary: null,
    timeline: [],
    status: 'Refining',
    onChange: () => undefined,
  }));
  const text = html.replace(/<[^>]+>/g, ' ');
  assert.match(text, /Refining your clinical direction/);
  assert.doesNotMatch(text, /\d\s*%|per cent|probability|confidence/i);
  for (const specialty of routableSpecialties()) {
    for (const name of [specialty.patientFacingName, specialty.canonicalName]) assert.ok(!text.includes(name), `the questionnaire panel named ${name}`);
  }
  // The internal view needs a development build and an explicit flag.
  const debugGuard = source('src/features/routing-flow/routing-debug.ts');
  assert.match(debugGuard, /typeof import\.meta\.env !== 'undefined'/);
  assert.match(debugGuard, /import\.meta\.env\.DEV/);
  assert.match(debugGuard, /import\.meta\.env\.VITE_ROUTING_DEBUG === '1'/);
});

/* --- Every routing-enabled specialty has a provable path ------------------------- */

const PROVABLE_PATHS: readonly { target: string; spec: ContextSpec; script: Script; basis?: string }[] = [
  /* Routing reconciliation: the new sourced entries (NICE NG127, NICE CG95, NHS). */
  {
    target: 'neurology',
    spec: { region: 'left-upper-arm', concern: 'weakness-drooping', age: 55, sex: 'male' },
    script: { 'intake-neurologic-associated-detail': 'function', 'intake-neurologic-course': 'gradual', 'intake-neurologic-associated-features': 'none' },
    basis: 'source-backed-criteria',
  },
  {
    target: 'neurology',
    spec: { region: 'face', face: 'patient-right-cheek', concern: 'pain', age: 60, sex: 'female' },
    script: { 'intake-face-pain-pattern': 'shock-triggered', 'intake-face-pain-side': 'one-side', 'intake-face-pain-treatment': 'not-helped' },
    basis: 'source-backed-criteria',
  },
  {
    target: 'cardiology',
    spec: { region: 'chest', concern: 'pain', age: 58, sex: 'male' },
    script: { 'intake-chest-pain-character': 'tight-heavy', 'intake-chest-pain-trigger': 'exertion', 'intake-chest-pain-relief': 'rest-minutes', 'intake-associated-location': 'none' },
    basis: 'source-backed-criteria',
  },
  {
    target: 'cardiology',
    spec: { region: 'chest', concern: 'palpitations', age: 45, sex: 'female' },
    script: { 'intake-palpitation-frequency': 'more-often', 'intake-palpitation-episode-length': 'longer', 'intake-palpitation-history': 'none' },
    basis: 'source-backed-criteria',
  },
  {
    target: 'medical-gastroenterology',
    spec: { region: 'chest', concern: 'voice-swallow', age: 45, sex: 'female' },
    script: { 'intake-upper-gi-symptom': 'burning', 'intake-upper-gi-frequency': 'most-days', 'intake-upper-gi-treatment': 'not-helping', 'intake-upper-gi-alarm': 'none' },
    basis: 'source-backed-criteria',
  },
  {
    target: 'otorhinolaryngology',
    spec: { region: 'face', face: 'patient-left-ear', concern: 'pain', age: 34 },
    script: { 'intake-face-ear-persistence': 'recurrent', 'intake-face-ear-associated': 'discharge' },
  },
  {
    target: 'otorhinolaryngology',
    spec: { region: 'face', face: 'nose', concern: 'nose-change', age: 34 },
    script: { 'intake-face-nose-detail': 'blocked', 'intake-face-nose-persistence': 'over-three-months', 'intake-face-nose-associated': 'tooth-ear' },
  },
  {
    target: 'ophthalmology',
    spec: { region: 'face', face: 'patient-right-eye', concern: 'eye-redness-discharge', age: 34 },
    script: { 'intake-face-eye-detail': 'gritty', 'intake-face-eye-associated': 'red' },
  },
  {
    target: 'dermatology',
    spec: { region: 'left-forearm', concern: 'skin-change', age: 34 },
    script: { 'intake-skin-associated-detail': 'mole', 'intake-skin-duration': 'keeps-returning', 'intake-skin-features': 'changed' },
  },
  {
    target: 'obstetrics-gynaecology',
    spec: { region: 'lower-abdomen', concern: 'reproductive-pelvic-change' as never, age: 34, sex: 'female' },
    script: { 'intake-lower-reproductive-detail': 'sexual-pain', 'intake-lower-reproductive-timing': 'with-periods' },
  },
  {
    target: 'urology',
    spec: { region: 'lower-abdomen', concern: 'urinary-change', age: 50, sex: 'male' },
    script: { 'intake-lower-urinary-detail': 'blood', 'intake-lower-urinary-pattern': 'recurrent' },
  },
  {
    target: 'medical-gastroenterology',
    spec: { region: 'lower-abdomen', concern: 'bowel-change', age: 50 },
    script: { 'intake-lower-bowel-detail': 'blood', 'intake-lower-bowel-persistence': 'not-improving' },
  },
  {
    target: 'orthopaedics',
    spec: { region: 'right-knee', concern: 'injury', age: 10 },
    script: { 'intake-injury-associated-detail': 'overuse', 'intake-injury-function': 'limping', 'intake-msk-mechanical': 'locks' },
  },
  {
    target: 'paediatrics',
    spec: { region: 'lower-abdomen', concern: 'urinary-change', age: 8 },
    script: { 'intake-lower-urinary-detail': 'pain', 'intake-lower-urinary-pattern': 'poor-stream' },
    basis: 'source-backed-criteria',
  },
  {
    target: 'general-medicine',
    spec: { region: 'face', face: 'patient-left-ear', concern: 'pain', age: 34 },
    script: {},
    basis: 'parent-service',
  },
  {
    target: 'cardiology',
    spec: { region: 'chest', concern: 'breathing', age: 45, sex: 'male' },
    script: {
      'intake-history-symptom-character': 'tight',
      'intake-history-duration': 'under-hour',
      'shortness-of-breath-ankle-swelling': 'yes',
      'shortness-of-breath-lying-flat': 'yes',
      'shortness-of-breath-wheeze': 'no',
      'shortness-of-breath-palpitations': 'yes',
    },
    basis: 'bayesian-convergence',
  },
  {
    target: 'medical-gastroenterology',
    spec: { region: 'upper-abdomen', concern: 'pain', age: 45, sex: 'male' },
    script: {
      'intake-history-symptom-character': 'unsure',
      'intake-history-current-impact': '2',
      'intake-history-duration': 'under-hour',
      'upper-abdominal-pain-exertional': 'no',
      'intake-history-onset': 'sudden',
      'intake-history-pattern': 'triggered',
      'upper-abdominal-pain-meal-relation': 'yes',
      'upper-abdominal-pain-burning': 'yes',
      'upper-abdominal-pain-nausea-vomiting': 'yes',
    },
    basis: 'bayesian-convergence',
  },
  {
    target: 'orthopaedics',
    spec: { region: 'right-knee', concern: 'pain', age: 45 },
    script: {
      'intake-history-symptom-character': 'sharp',
      'intake-history-duration': 'today',
      'joint-musculoskeletal-pain-injury': 'yes',
      'intake-history-onset': 'gradual',
      'joint-musculoskeletal-pain-swelling-bruising': 'yes',
      'joint-musculoskeletal-pain-use-weight': 'yes',
    },
    basis: 'bayesian-convergence',
  },
];

test('every routing-enabled specialty is reached by at least one scripted assessment', () => {
  const reached = new Set<string>();
  for (const path of PROVABLE_PATHS) {
    const result = walkAssessment(contextFor(path.spec), path.script);
    assert.equal(result.outcome, 'result', path.target);
    assert.equal(result.route!.registryId, path.target, `${path.target}: ${result.steps.map((step) => `${step.questionId}=${step.answer}`).join(' ')}`);
    if (path.basis) assert.equal(result.route!.basis, path.basis, path.target);
    reached.add(path.target);
  }
  // Respiratory medicine is reached by R1 on a breathing pattern; its path is sampled below.
  const missing = routableSpecialties().map((specialty) => specialty.id).filter((id) => !reached.has(id) && id !== 'respiratory-medicine');
  assert.deepEqual(missing, []);
});

test('respiratory medicine is reachable from an adult breathing assessment', () => {
  const context = contextFor({ region: 'chest', concern: 'breathing', age: 45, sex: 'male' });
  let seed = 7;
  const random = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  let hit: WalkResult | null = null;
  for (let run = 0; run < 400 && !hit; run += 1) {
    const result = walkAssessment(context, {}, 40, (_id, options, kind) =>
      kind === 'safety' ? 'no' : options[Math.floor(random() * options.length)]);
    if (result.route?.registryId === 'respiratory-medicine') hit = result;
  }
  assert.ok(hit, 'no breathing path reached Respiratory medicine');
  assert.ok(
    hit.route!.basis === 'bayesian-convergence' || hit.route!.basis === 'source-backed-criteria',
    `unexpected respiratory route basis ${hit.route!.basis}`,
  );
});

/* --- Premature fallback ------------------------------------------------------------ */

test('no parent-service fallback is returned while a narrower route is still reachable', () => {
  const failures: string[] = [];
  for (const { context, band } of everyContext([PEDIATRIC_BANDS[1], PEDIATRIC_BANDS[2], PEDIATRIC_BANDS[3], ADULT])) {
    for (const pick of ['first', 'last'] as const) {
      const result = walkAssessment(context, {}, 40, (_id, options, kind) =>
        kind === 'safety' ? 'no' : pick === 'first' ? options[0] : options.at(-1));
      if (result.outcome !== 'result' || result.route!.basis !== 'parent-service') continue;
      // The canonical route gate includes both intake evidence and the approved
      // R1 answers it is allowed to read. Re-evaluating from intake alone makes
      // an already-answered equivalent question look falsely open.
      const gate = result.route!.gate ?? evaluateDirectionGate(context, intakeAnswersOf(result));
      const where = `${band.label} ${context.bodyRegionId}/${context.faceSubregionId ?? '-'}/${context.concernId} (${pick})`;
      if (result.route!.guardMessage) failures.push(`${where}: guard ${result.route!.guardMessage}`);
      if (gate.openDiscriminatorQuestionIds.length) failures.push(`${where}: open ${gate.openDiscriminatorQuestionIds.join(',')}`);
      if (gate.assessments.some((assessment) => assessment.supported && !assessment.parentService)) failures.push(`${where}: a narrower gate was met`);
      if (!result.route!.fallbackReason) failures.push(`${where}: fallback without a named reason`);
    }
  }
  assert.deepEqual(failures, []);
});

/* --- Safety sequencing ------------------------------------------------------------- */

test('an urgent finding is recorded and the assessment continues to a specialty direction', () => {
  const result = walk(PEDIATRIC_FAMILIES.throat, PEDIATRIC_BANDS[2], {
    'intake-throat-recurrence': 'seven-in-year',
    'intake-throat-impact': 'yes',
    'safety-throat-urgent': 'yes',
  });
  assert.equal(result.outcome, 'result');
  assert.ok(result.urgentRuleIds.includes('throat-urgent-review'));
  assert.equal(result.route!.registryId, 'otorhinolaryngology', 'urgency does not suppress the direction');
});

test('a routine assessment answers its safety checks and returns to the questionnaire naturally', () => {
  const result = walk(PEDIATRIC_FAMILIES.ear, PEDIATRIC_BANDS[1]);
  assert.equal(result.outcome, 'result');
  assert.deepEqual(result.urgentRuleIds, []);
  const kinds = result.steps.map((step) => (step.classification === 'SAFETY' ? 'S' : 'Q')).join('');
  // Under five the IMNCI danger signs come first; after that the safety checks do not
  // interleave with the questions one by one.
  assert.doesNotMatch(kinds.replace(/^S+/, ''), /QSQS/, kinds);
});

test('an adult routine case asks its questions first and safety checks after, not interleaved', () => {
  for (const [name, family] of Object.entries(ADULT_FAMILIES)) {
    const kinds = walk(family, ADULT).steps.map((step) => (step.classification === 'SAFETY' ? 'S' : 'Q')).join('');
    assert.doesNotMatch(kinds, /SQS/, `${name}: ${kinds}`);
  }
});

test('safety questions are counted apart from routing, context and discrimination', () => {
  const totals = { context: [] as number[], discrimination: [] as number[], safety: [] as number[], routing: [] as number[] };
  for (const band of [...PEDIATRIC_BANDS, ADULT]) {
    for (const family of Object.values(band === ADULT ? ADULT_FAMILIES : PEDIATRIC_FAMILIES)) {
      const result = walk(family, band);
      const safetySteps = result.steps.filter((step) => step.classification === 'SAFETY').length;
      assert.equal(result.counts.safety, safetySteps);
      assert.equal(result.counts.context + result.counts.discrimination + result.counts.routing + result.counts.safety, result.steps.length);
      for (const key of Object.keys(totals) as (keyof typeof totals)[]) totals[key].push(result.counts[key]);
    }
  }
  const nonSafety = totals.context.map((value, index) => value + totals.discrimination[index] + totals.routing[index]);
  assert.ok(Math.max(...nonSafety) <= 12, `max non-safety ${Math.max(...nonSafety)}`);
  assert.ok(Math.min(...nonSafety) >= 3, `min non-safety ${Math.min(...nonSafety)}`);
});

/* --- Patient-facing copy ----------------------------------------------------------- */

test('questions ask about observable features, never a disease name', () => {
  const disease = /tonsillitis|strep|appendicitis|migraine|asthma|pneumonia|otitis|sinusitis|conjunctivitis|fracture|dislocation|meningitis|abscess|gastroenteritis/i;
  for (const { context } of everyContext([PEDIATRIC_BANDS[2], ADULT])) {
    for (const question of intakeQuestionsFor(context.complaintId, context)) {
      assert.doesNotMatch(question.prompt, disease, question.prompt);
      for (const option of question.options) assert.doesNotMatch(option.label, disease, option.label);
    }
  }
  for (const question of R3_SAFETY_KNOWLEDGE.questions) {
    if (question.kind !== 'safety_owned') continue;
    assert.doesNotMatch(question.text, disease, question.text);
    if (question.caregiverText) assert.doesNotMatch(question.caregiverText, disease, question.caregiverText);
  }
});

test('the safety label, urgent note and hard-stop screen use the approved wording', () => {
  const flow = source('src/features/routing-flow/RoutingFlow.tsx');
  assert.match(flow, /className="safety-label type-label"/);
  assert.match(flow, /<span>Safety check<\/span>/);
  assert.match(flow, /This is an important safety question\./);
  const result = source('src/features/routing-flow/RoutingResult.tsx');
  assert.match(result, /Urgent clinical review/);
  assert.match(result, /One or more answers indicate that this should be assessed promptly\./);
  const escalation = source('src/features/routing-flow/PriorityEscalation.tsx');
  assert.match(escalation, /Clinical safety alert/);
  assert.match(escalation, /Immediate clinical assessment is recommended/);
  assert.match(escalation, /Normal specialty routing has been paused/);
  assert.doesNotMatch(escalation, /notified|has been alerted|is on the way/i);
  const css = source('src/features/routing-flow/routing-flow.css');
  assert.doesNotMatch(css.slice(css.indexOf('.safety-label {')), /animation:\s*[a-z]/, 'the safety label never animates');
});
