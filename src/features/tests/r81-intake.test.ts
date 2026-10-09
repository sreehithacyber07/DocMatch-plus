import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import * as React from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  ACCESSIBILITY_OPTIONS,
  CONDITION_NONE_KNOWN,
  CONDITION_OPTIONS,
  SEX_OPTIONS,
  ageOn,
  emptyPatientContext,
  finalizePatientContext,
  isLeapYear,
  keepOtherText,
  visibleErrors,
  summarizePatientContext,
  toggleExclusive,
  validateDateOfBirth,
  validateStep,
  type AccessibilityNeed,
  type PatientContextDraft,
} from '../intake/patient-context.ts';
import { TERMS_PREVIEW, TERMS_SECTIONS, TERMS_VALIDATION_MESSAGE } from '../intake/terms-content.ts';
import { buildSoapHandoff, HANDOFF_STATUS, NO_MEASUREMENTS_NOTE } from '../routing-flow/soap-handoff.ts';
import { RouteConvergence } from '../routing-flow/RouteConvergence.tsx';
import { SoapDocument } from '../routing-flow/SoapDocument.tsx';
import type { EvidenceTraceItem } from '../routing-flow/routing-presentation.ts';
import { Calendar } from '../../components/primitives/Calendar.tsx';
import {
  addMonths,
  dateFromParts,
  keyTarget,
  monthGrid,
  partsFromDate,
} from '../../components/primitives/calendar-model.ts';

// Components compiled by tsx outside Vite use the classic JSX runtime.
(globalThis as { React?: typeof React }).React = React;

const ROOT = process.cwd();
const source = (relativePath: string) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
const TODAY = { year: 2026, month: 9, day: 19 };
const dob = (day: string, month: string, year: string) => validateDateOfBirth({ day, month, year }, TODAY);

/* --- Terms ------------------------------------------------------------------- */

test('the terms have the ten required sections in order', () => {
  assert.deepEqual(TERMS_SECTIONS.map((section) => section.title), [
    'Purpose of DocMatch+',
    'Not a diagnosis',
    'Emergency situations',
    'Information you provide',
    'Safety checks',
    'Session and privacy',
    'Clinical handoff',
    'Automated processing',
    'Limitations',
    'Your choice',
  ]);
  assert.equal(TERMS_VALIDATION_MESSAGE, 'Please review and accept the Terms & Conditions before beginning.');
});

test('the terms make no compliance claim and follow the copy rules', () => {
  const text = [...TERMS_PREVIEW, ...TERMS_SECTIONS.flatMap((section) => [section.title, ...section.body])].join(' ');
  assert.doesNotMatch(text, /HIPAA|GDPR|DPDP|FDA|certified|certification|approved medical device|compliant/i);
  assert.doesNotMatch(text, /—/, 'no em dash');
  assert.doesNotMatch(text, /!/);
  assert.doesNotMatch(text, /\b(simply|just|seamless|unlock|empower)\b/i);
  // Emergency: staff first, 112 second, and no alert is claimed.
  const emergency = TERMS_SECTIONS.find((section) => section.id === 'emergency')!.body.join(' ');
  assert.ok(emergency.indexOf('member of staff') < emergency.indexOf('112'));
  assert.match(emergency, /does not alert anyone/);
});

test('an unchecked Begin is held with a visible, linked, focused error and subtle shake', () => {
  const threshold = source('src/features/intake/IntakeThreshold.tsx');
  assert.match(threshold, /if \(!accepted\) \{\s*setInvalid\(true\);\s*checkboxRef\.current\?\.focus\(\);\s*return;/);
  assert.match(threshold, /aria-invalid=\{invalid && !accepted \? true : undefined\}/);
  assert.match(threshold, /id="terms-accept-error"/);
  assert.match(threshold, /\{TERMS_VALIDATION_MESSAGE\}/);
  // Checking the box clears the error.
  assert.match(threshold, /if \(next\) setInvalid\(false\)/);
  // Begin is never disabled: activating it must produce the validation.
  assert.doesNotMatch(threshold, /threshold__begin"[^>]*disabled/);
  const css = source('src/features/intake/intake.css');
  assert.match(cssRule(css, '.terms-consent[data-invalid]'), /animation:/, 'the consent error shakes');
});

test('the terms link opens the full dialog, and the hover preview is not the only way in', () => {
  const threshold = source('src/features/intake/IntakeThreshold.tsx');
  assert.match(threshold, /className="terms-consent__link" type="button" onClick=\{\(\) => setTermsOpen\(true\)\}/);
  assert.match(threshold, /<HoverCard/);
  assert.match(threshold, /<PremiumTerms/);
  const hover = source('src/components/primitives/HoverCard.tsx');
  // Hover only for a mouse; focus opens it for the keyboard; Escape dismisses.
  assert.match(hover, /pointerType === 'mouse'/);
  assert.match(hover, /onFocus=/);
  assert.match(hover, /event\.key === 'Escape'/);
});

/* --- Date of birth and age ----------------------------------------------------- */

test('a valid date of birth gives a birthday-aware age', () => {
  assert.deepEqual(dob('19', '09', '2008'), { ok: true, iso: '2008-09-19', age: 18 }); // birthday today
  assert.deepEqual(dob('20', '09', '2008'), { ok: true, iso: '2008-09-20', age: 17 }); // tomorrow
  assert.deepEqual(dob('18', '09', '2008'), { ok: true, iso: '2008-09-18', age: 18 }); // yesterday
  assert.deepEqual(dob('1', '1', '1990'), { ok: true, iso: '1990-01-01', age: 36 });
});

test('impossible, future and malformed dates are rejected with a reason', () => {
  assert.equal(dob('31', '04', '1990').ok, false);
  assert.equal(dob('30', '02', '2004').ok, false);
  assert.equal(dob('00', '05', '1990').ok, false);
  assert.equal(dob('10', '13', '1990').ok, false);
  assert.equal(dob('10', '00', '1990').ok, false);
  const future = dob('20', '09', '2026');
  assert.equal(future.ok, false);
  assert.equal(future.ok === false && future.error, 'Date of birth cannot be in the future.');
  assert.equal(dob('10', '05', '199').ok, false);
  assert.equal(dob('10', '05', '1850').ok, false);
  assert.equal(dob('', '', '').ok, false);
  assert.equal(dob('a', '05', '1990').ok, false);
});

test('leap years follow the Gregorian rule, including 29 February birthdays', () => {
  assert.ok(isLeapYear(2000) && isLeapYear(2004) && !isLeapYear(1900) && !isLeapYear(2003));
  assert.equal(dob('29', '02', '2004').ok, true);
  assert.equal(dob('29', '02', '2000').ok, true);
  assert.equal(dob('29', '02', '2003').ok, false);
  assert.equal(dob('29', '02', '1900').ok, false);
  const leapling = { year: 2004, month: 2, day: 29 };
  assert.equal(ageOn(leapling, { year: 2023, month: 2, day: 28 }), 18);
  assert.equal(ageOn(leapling, { year: 2023, month: 3, day: 1 }), 19);
  assert.equal(ageOn(leapling, { year: 2024, month: 2, day: 29 }), 20);
});

test('the date of birth never starts on today', () => {
  // The draft holds the typed parts and, separately, the canonical ISO date once valid; both start empty.
  assert.equal(emptyPatientContext().dateOfBirth, null);
  assert.deepEqual(emptyPatientContext().dateOfBirthParts, { day: '', month: '', year: '' });
  const field = source('src/components/primitives/DateField.tsx');
  assert.doesNotMatch(field, /new Date\(/);
});

/* --- Sex ------------------------------------------------------------------------- */

test('sex for this assessment is required with exactly three options', () => {
  assert.deepEqual(SEX_OPTIONS.map((option) => option.label), ['Female', 'Male', 'Other']);
  assert.ok(!SEX_OPTIONS.some((option) => /prefer/i.test(option.label)));
  const draft = { ...emptyPatientContext(), dateOfBirth: '1988-06-14', dateOfBirthParts: { day: '14', month: '06', year: '1988' } };
  assert.ok(validateStep('basics', draft, TODAY).sexForAssessment);
  assert.deepEqual(validateStep('basics', { ...draft, sexForAssessment: 'male' }, TODAY), {});
});

/* --- Exclusive answers ------------------------------------------------------------ */

test('accessibility None is mutually exclusive', () => {
  let needs: AccessibilityNeed[] = [];
  needs = toggleExclusive(needs, 'vision', 'none');
  needs = toggleExclusive(needs, 'hearing', 'none');
  assert.deepEqual(needs, ['vision', 'hearing']);
  needs = toggleExclusive(needs, 'none', 'none');
  assert.deepEqual(needs, ['none']);
  needs = toggleExclusive(needs, 'mobility', 'none');
  assert.deepEqual(needs, ['mobility']);
  assert.equal(ACCESSIBILITY_OPTIONS[0].label, 'None');
  assert.equal(ACCESSIBILITY_OPTIONS.length, 10);
});

test('conditions None known is mutually exclusive and the list is not presented as complete', () => {
  let conditions: string[] = [];
  conditions = toggleExclusive(conditions, 'diabetes', CONDITION_NONE_KNOWN);
  conditions = toggleExclusive(conditions, CONDITION_NONE_KNOWN, CONDITION_NONE_KNOWN);
  assert.deepEqual(conditions, [CONDITION_NONE_KNOWN]);
  conditions = toggleExclusive(conditions, 'asthma', CONDITION_NONE_KNOWN);
  assert.deepEqual(conditions, ['asthma']);
  assert.equal(CONDITION_OPTIONS.length, 19);
  assert.match(source('src/features/intake/PatientContextStep.tsx'), /The list is not complete/);
});

/* --- Dependent fields --------------------------------------------------------------- */

const complete = (): PatientContextDraft => ({
  ...emptyPatientContext(),
  dateOfBirth: '1988-06-14',
  dateOfBirthParts: { day: '14', month: '06', year: '1988' },
  sexForAssessment: 'female',
  accessibilityNeeds: ['none'],
  existingConditions: [CONDITION_NONE_KNOWN],
  previousSimilarEpisode: 'no',
  allergyStatus: 'none_known',
  medicationStatus: 'none',
  surgeryStatus: 'no',
});

test('Other answers reveal their text fields and keep them only while Other is chosen', () => {
  const step = source('src/features/intake/PatientContextStep.tsx');
  assert.match(step, /show=\{draft\.accessibilityNeeds\.includes\('other'\)\}/);
  assert.match(step, /show=\{draft\.existingConditions\.includes\(CONDITION_OTHER\)\}/);
  const withOther = finalizePatientContext({ ...complete(), accessibilityNeeds: ['other'], accessibilityOther: ' Sign language ' }, TODAY)!;
  assert.equal(withOther.accessibilityOther, 'Sign language');
  const without = finalizePatientContext({ ...complete(), accessibilityNeeds: ['vision'], accessibilityOther: 'left over' }, TODAY)!;
  assert.equal(without.accessibilityOther, undefined);
});

test('a previous similar episode asks about an earlier explanation, and never treats it as current', () => {
  const draft = { ...complete(), previousSimilarEpisode: 'yes_once' as const };
  assert.ok(validateStep('history', draft, TODAY).previousExplanationKnown);
  const answered = { ...draft, previousExplanationKnown: 'yes' as const, previousExplanation: 'Told it was a strain' };
  assert.deepEqual(validateStep('history', answered, TODAY), {});
  assert.equal(finalizePatientContext(answered, TODAY)!.previousExplanation, 'Told it was a strain');
  const changedToNo = { ...answered, previousSimilarEpisode: 'no' as const };
  const final = finalizePatientContext(changedToNo, TODAY)!;
  assert.equal(final.previousExplanationKnown, undefined);
  assert.equal(final.previousExplanation, undefined);
  assert.match(source('src/features/intake/PatientContextStep.tsx'), /It is not treated as the reason for today/);
});

test('a known allergy needs a type, and Other keeps its text only while chosen', () => {
  const known = { ...complete(), allergyStatus: 'known' as const };
  assert.ok(validateStep('background', known, TODAY).allergies);
  const typed = { ...known, allergies: ['latex', 'other'], allergyOther: 'Plasters' };
  assert.deepEqual(validateStep('background', typed, TODAY), {});
  assert.equal(finalizePatientContext(typed, TODAY)!.allergyOther, 'Plasters');
  const none = finalizePatientContext({ ...typed, allergyStatus: 'none_known' }, TODAY)!;
  assert.deepEqual(none.allergies, []);
  assert.equal(none.allergyOther, undefined);
});

test('Add medication needs at least one entry and keeps several', () => {
  const adding = { ...complete(), medicationStatus: 'known' as const, medications: ['', '  '] };
  assert.ok(validateStep('background', adding, TODAY).medications);
  const listed = { ...adding, medications: ['First', ' ', 'Second '] };
  assert.deepEqual(finalizePatientContext(listed, TODAY)!.medications, ['First', 'Second']);
  assert.deepEqual(finalizePatientContext({ ...listed, medicationStatus: 'not_sure' }, TODAY)!.medications, []);
});

test('a previous surgery is required and its detail is kept only for Yes', () => {
  assert.ok(validateStep('background', { ...complete(), surgeryStatus: null }, TODAY).surgeryStatus);
  const yes = { ...complete(), surgeryStatus: 'yes' as const, surgeries: 'Appendix removed' };
  assert.equal(finalizePatientContext(yes, TODAY)!.surgeries, 'Appendix removed');
  assert.equal(finalizePatientContext({ ...yes, surgeryStatus: 'not_sure' }, TODAY)!.surgeries, undefined);
});

test('the completed context has a derived age and a summary without the name', () => {
  const context = finalizePatientContext({ ...complete(), assessmentName: ' Asha ' }, TODAY)!;
  assert.equal(context.derivedAge, 38);
  assert.equal(context.assessmentName, 'Asha');
  assert.ok(!summarizePatientContext(context).some((line) => line.value.includes('Asha')));
  assert.equal(finalizePatientContext({ ...complete(), sexForAssessment: null }, TODAY), null);
});

/* --- Privacy --------------------------------------------------------------------- */

test('patient context never reaches storage, the backend, the engine or the trusted SOAP', () => {
  const intakeFiles = fs.readdirSync(path.join(ROOT, 'src/features/intake')).map((file) => source(`src/features/intake/${file}`));
  const primitiveFiles = fs.readdirSync(path.join(ROOT, 'src/components/primitives')).map((file) => source(`src/components/primitives/${file}`));
  for (const text of [...intakeFiles, ...primitiveFiles]) {
    assert.doesNotMatch(text, /localStorage|sessionStorage|indexedDB|document\.cookie/);
    assert.doesNotMatch(text, /supabase|persistence\//i);
  }
  // No backend, persistence, engine or SOAP builder file mentions the context.
  const walk = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)]);
  const guarded = [
    ...walk(path.join(ROOT, 'src/engine')),
    ...walk(path.join(ROOT, 'src/features/persistence')),
    ...walk(path.join(ROOT, 'supabase')),
    path.join(ROOT, 'src/features/routing-flow/soap-handoff.ts'),
  ].filter((file) => /\.(ts|tsx|sql)$/.test(file));
  for (const file of guarded) {
    assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /patientContext|PatientContext|assessmentName|features\/intake/, file);
  }
  // RouteScreen keeps it in React state and out of the persisted assessment start.
  const route = source('src/screens/route/RouteScreen.tsx');
  assert.match(route, /useState<\{ epoch: number; context: PatientContext \} \| null>/);
  assert.match(route, /intake\?\.epoch === patientSession\.epoch \? intake\.context : null/);
  const start = route.slice(route.indexOf('const assessmentStart'), route.indexOf('const persistence ='));
  assert.doesNotMatch(start, /patientContext|intake/);
  // Free text never goes to form history or a spelling service.
  assert.match(source('src/features/intake/PatientContextStep.tsx'), /autoComplete: 'off', spellCheck: false/);
});

test('raw patient context stays out of the Bayesian routing engine', () => {
  const flow = source('src/features/routing-flow/RoutingFlow.tsx');
  const uses = flow.split('patientContext').length - 1;
  // Normalized clinicalContext owns question eligibility; the raw prop is result-only here.
  assert.equal(uses, 4, `RoutingFlow mentions patientContext ${uses} times`);
  assert.match(flow, /patientContext=\{patientContext\}/);
});

/* --- Route ---------------------------------------------------------------------- */

const EVIDENCE: EvidenceTraceItem[] = [
  { questionId: 'q1', optionId: 'yes', question: 'Does it hurt when you lift your arm?', answer: 'Yes', direction: 'Orthopaedics', movement: 'increased', rawDelta: 0.2 },
  { questionId: 'q2', optionId: 'no', question: 'Did it start after a fall?', answer: 'No', direction: 'Orthopaedics', movement: 'increased', rawDelta: 0.1 },
];
test('the route figure renders only the evidence it is given, with no score, strength or runner-up list', () => {
  const html = renderToStaticMarkup(createElement(RouteConvergence, {
    evidence: EVIDENCE,
    selected: { registryId: 'orthopaedics', label: 'Orthopaedics' },
    reduced: true,
  }));
  for (const item of EVIDENCE) {
    assert.ok(html.includes(item.question));
  }
  assert.equal((html.match(/class="convergence__answer"/g) ?? []).length, 2);
  assert.equal((html.match(/class="convergence__line"/g) ?? []).length, 2);
  assert.match(html, /Orthopaedics/);
  // Strength words and other specialties came from heuristic belief values.
  // Checked on the text only, so the <strong> element is not mistaken for a word.
  const text = html.replace(/<[^>]+>/g, ' ');
  assert.doesNotMatch(text, /Strong|Developing|Emerging|route strength/i);
  assert.doesNotMatch(text, /General Medicine|also considered/i);
  assert.doesNotMatch(text, /%|confidence|probability|diagnos/i);
});

test('the result feeds the route figure from buildClinicalRoutingExplanation only', () => {
  const result = source('src/features/routing-flow/RoutingResult.tsx');
  assert.match(result, /evidence=\{explanation\.strongestPositiveEvidence\.slice\(0, 3\)\}/);
  assert.doesNotMatch(result, /alternatives=|routeStrength/);
  assert.match(result, /selected=\{explanation\.selectedSpecialty\}/);
  assert.doesNotMatch(source('src/features/routing-flow/RouteConvergence.tsx'), /belief|probability|Math\.round/);
});

/* --- SOAP -------------------------------------------------------------------------- */

test('the SOAP document renders buildSoapHandoff unchanged, prepared and never sent', () => {
  const sections = buildSoapHandoff({
    complaintLabel: 'Shoulder pain',
    complaintSource: 'bridge-resolved',
    capture: { painLocation: null, view: null },
    intakePlan: [],
    intakeAnswers: [],
    timeline: [],
    converged: true,
    directionLabel: 'Orthopaedics',
  });
  assert.deepEqual(sections.map((section) => section.key), ['S', 'O', 'A', 'P']);
  const html = renderToStaticMarkup(createElement(SoapDocument, { sections, status: HANDOFF_STATUS, reduced: true }));
  for (const line of sections.flatMap((section) => section.lines)) {
    assert.ok(html.includes(line.label), line.label);
  }
  assert.ok(html.includes(NO_MEASUREMENTS_NOTE));
  assert.ok(html.includes('Prepared for clinical handoff'));
  assert.match(html, /class="soap soap-document"/);
  // The A section's own scope line (from the builder) states the boundary once.
  assert.match(html, /Specialty direction from your answers/);
  assert.equal((html.match(/not a diagnosis/gi) ?? []).length, 1);
  assert.doesNotMatch(html, /\bsent\b|notified|diagnosis confirmed|confirmed diagnosis/i);
  assert.doesNotMatch(html, /\bbpm\b|mmHg|SpO2|temperature:|°/i);
  const result = source('src/features/routing-flow/RoutingResult.tsx');
  assert.match(result, /const soap = buildSoapHandoff\(/);
  assert.match(result, /<Disclose title="SOAP Summary"/);
  assert.match(result, /<SoapDocument sections=\{soap\} status=\{HANDOFF_STATUS\}/);
});

/* --- Onboarding and motion ----------------------------------------------------------- */

test('the landing story has six truthful chapters and no fake intake screen', () => {
  const screen = source('src/screens/onboarding/OnboardingScreen.tsx');
  const ids = [...screen.matchAll(/^\s{4}id: '(\w+)',$/gm)].map((match) => match[1]);
  assert.deepEqual(ids, ['locate', 'refine', 'clarify', 'check', 'route', 'handoff']);
  const story = source('src/screens/entry/LandingStory.tsx');
  const chapters = [...story.matchAll(/^\s{4}id: '(\w+)', number:/gm)].map((match) => match[1]);
  assert.deepEqual(chapters, ids);
  assert.match(story, /A specialty direction, not a diagnosis/);
  assert.match(story, /Prepared for clinical handoff/);
  assert.doesNotMatch(story, /patient name|doctor notified|confidence score/i);
  const scenes = source('src/screens/onboarding/OnboardingScenes.tsx');
  const route = scenes.slice(scenes.indexOf('export function RouteScene'), scenes.indexOf('const HANDOFF_FRAGMENTS'));
  assert.doesNotMatch(route, /SOAP|Care team/);
  assert.match(scenes, /export function HandoffScene/);
  assert.match(scenes, /Prepared for clinical handoff/);
});

test('onboarding and the intake fit the window on desktop', () => {
  const onboarding = source('src/screens/onboarding/onboarding.css');
  const block = onboarding.slice(onboarding.indexOf('R8.1 composition'));
  assert.match(block, /@media \(min-width: 68\.75rem\) \{\s*\.onboarding \{[^}]*height: 100dvh;/);
  assert.match(block, /\.onboarding__actions \{\s*position: static;/);
  const intake = source('src/features/intake/intake.css');
  assert.match(intake, /\.intake \{[^}]*height: 100dvh;/);
  // The shell never scrolls the document; the step body scrolls inside itself.
  assert.match(intake, /main\.route-surface\.route-surface--intake \{[^}]*overflow: hidden;/);
  assert.match(intake, /\.context__scroll \{[^}]*overflow-y: auto;/);
  assert.match(intake, /\.context \{[^}]*grid-template-rows: minmax\(0, 1fr\) auto;/);
});

test('every new motion has a reduced-motion path', () => {
  for (const file of [
    'src/components/primitives/Button.tsx',
    'src/components/primitives/Field.tsx',
    'src/features/intake/PatientIntake.tsx',
    'src/features/routing-flow/RouteConvergence.tsx',
    'src/features/routing-flow/SoapDocument.tsx',
  ]) {
    assert.match(source(file), /reduced/, file);
  }
  const scenes = source('src/screens/onboarding/OnboardingScenes.tsx');
  assert.match(scenes, /initial: reduced \? false/);
  assert.match(source('src/components/primitives/primitives.css'), /prefers-reduced-motion: reduce/);
});

/* --- R8.1 correction pass ------------------------------------------------------ */

test('existing conditions are required, and None known or a condition satisfies them', () => {
  const draft = { ...complete(), existingConditions: [] as string[] };
  assert.ok(validateStep('history', draft, TODAY).existingConditions);
  assert.deepEqual(validateStep('history', { ...draft, existingConditions: [CONDITION_NONE_KNOWN] }, TODAY), {});
  assert.deepEqual(validateStep('history', { ...draft, existingConditions: ['asthma'] }, TODAY), {});
  assert.equal(finalizePatientContext(draft, TODAY), null);
  // None known clears positive answers and the stale Other text; Other text stays optional.
  const cleared = toggleExclusive(['asthma', 'other'], CONDITION_NONE_KNOWN, CONDITION_NONE_KNOWN);
  assert.deepEqual(cleared, [CONDITION_NONE_KNOWN]);
  assert.equal(keepOtherText(cleared, 'Gout'), '');
  assert.equal(keepOtherText(['other'], 'Gout'), 'Gout');
  assert.deepEqual(validateStep('history', { ...draft, existingConditions: ['other'], conditionOther: '' }, TODAY), {});
  const step = source('src/features/intake/PatientContextStep.tsx');
  assert.match(step, /conditionOther: keepOtherText\(existingConditions, draft\.conditionOther, CONDITION_OTHER\)/);
  const combobox = step.slice(step.indexOf('id="context-conditions"'), step.indexOf("onLeave={() => onLeave('existingConditions')}"));
  assert.doesNotMatch(combobox, /\boptional\b/);
  assert.match(combobox, /error=\{errors\.existingConditions\}/);
});

test('no step greets the patient with errors', () => {
  const all = validateStep('basics', emptyPatientContext(), TODAY);
  assert.ok(all.dateOfBirth && all.sexForAssessment);
  assert.deepEqual(visibleErrors(all, false, new Set()), {});
  assert.deepEqual(Object.keys(visibleErrors(all, false, new Set(['dateOfBirth']))), ['dateOfBirth']);
  assert.deepEqual(visibleErrors(all, true, new Set()), all);
  const intake = source('src/features/intake/PatientIntake.tsx');
  assert.match(intake, /visibleErrors\(validateStep\(phase, draft\), Boolean\(attempted\[phase\]\), touched\)/);
});

test('the calendar model builds months, moves by key and round-trips typed dates', () => {
  // September 2026 starts on a Tuesday.
  const grid = monthGrid(2026, 9);
  assert.deepEqual(grid[0], [null, null, 1, 2, 3, 4, 5]);
  assert.equal(grid.flat().filter((day) => day !== null).length, 30);
  assert.equal(monthGrid(2024, 2).flat().filter((day) => day !== null).length, 29);
  const day = { year: 2007, month: 11, day: 20 };
  assert.deepEqual(keyTarget(day, 'ArrowRight', false), { year: 2007, month: 11, day: 21 });
  assert.deepEqual(keyTarget(day, 'ArrowUp', false), { year: 2007, month: 11, day: 13 });
  assert.deepEqual(keyTarget(day, 'PageDown', true), { year: 2008, month: 11, day: 20 });
  assert.deepEqual(addMonths({ year: 2024, month: 1, day: 31 }, 1), { year: 2024, month: 2, day: 29 });
  assert.deepEqual(dateFromParts({ day: '20', month: '11', year: '2007' }), day);
  assert.deepEqual(partsFromDate(day), { day: '20', month: '11', year: '2007' });
  assert.deepEqual(partsFromDate({ year: 1990, month: 3, day: 7 }), { day: '07', month: '03', year: '1990' });
  assert.equal(dateFromParts({ day: '31', month: '04', year: '1990' }), null);
  assert.equal(dateFromParts({ day: '1', month: '1', year: '90' }), null);
});

test('the calendar never preselects today and never allows a future day', () => {
  const today = { year: 2026, month: 9, day: 19 };
  const earliest = { year: 1900, month: 1, day: 1 };
  const html = renderToStaticMarkup(createElement(Calendar, { selected: null, onSelect: () => {}, min: earliest, max: today, today }));
  assert.doesNotMatch(html, /data-selected/);
  assert.match(html, /role="grid"/);
  assert.match(html, /aria-label="Saturday, 19 September 2026, today"/);
  const future = /<button[^>]*data-date="2026-9-20"[^>]*>/.exec(html)?.[0] ?? '';
  assert.match(future, /disabled=""/);
  assert.match(future, /not available/);
  // The month and year choosers are DocMatch+ listboxes, never native selects
  // (whose OS-drawn menus cannot be themed): the years reach the earliest
  // birth year, and months after today are unavailable.
  assert.doesNotMatch(html, /<select|<option/);
  const years = renderToStaticMarkup(createElement(Calendar, { selected: null, onSelect: () => {}, min: earliest, max: today, today, initialPanel: 'years' }));
  assert.match(years, /role="listbox"[^>]*aria-label="Choose a year"/);
  assert.match(years, /role="option"[^>]*aria-selected="true"[^>]*>2026</);
  assert.match(years, /role="option"[^>]*>1900</);
  assert.doesNotMatch(years, />2027</);
  const months = renderToStaticMarkup(createElement(Calendar, { selected: null, onSelect: () => {}, min: earliest, max: today, today, initialPanel: 'months' }));
  assert.match(months, /aria-disabled="true" aria-label="October, not available"/);
  assert.match(months, /aria-selected="true"[^>]*aria-label="September"/);
  const selected = renderToStaticMarkup(createElement(Calendar, {
    selected: { year: 2007, month: 11, day: 20 },
    onSelect: () => {},
    min: earliest,
    max: today,
    today,
  }));
  assert.match(selected, /data-selected="true"[^>]*data-date="2007-11-20"/);
});

/*
  The About You rework changed the calendar from "choose, then confirm" to
  "a chosen day is the answer". The intent the old test protected still holds
  and is what is asserted: typed and chosen dates stay in step, a choice never
  applies silently without closing and returning focus to the field, Escape
  leaves the typed date untouched, and there is no native date input.
*/
test('the date of birth is typed or chosen, kept in step, and a dismissed calendar changes nothing', () => {
  const field = source('src/components/primitives/DateField.tsx');
  assert.match(field, /onSelect=\{\(date\) => \{\s*onValueChange\(partsFromDate\(date\)\);\s*close\(true\);/);
  assert.match(field, /if \(returnFocus\) triggerRef\.current\?\.focus\(\)/);
  const escape = field.slice(field.indexOf("event.key === 'Escape'"), field.indexOf("event.key === 'Escape'") + 200);
  assert.match(escape, /close\(true\)/);
  assert.doesNotMatch(escape, /onValueChange/);
  assert.match(field, /parsePastedDate/);
  assert.doesNotMatch(field, /type="date"/);
});

test('every checkbox target is at least 48px', () => {
  const css = source('src/components/primitives/primitives.css');
  assert.match(cssRule(css, '.dm-checkbox'), /width: var\(--control-target-minimum\);\s*height: var\(--control-target-minimum\);/);
  assert.match(cssRule(css, '.dm-choice'), /min-height: var\(--control-target-minimum\)/);
  // A choice's native input covers its whole cell.
  assert.match(cssRule(css, '.dm-choice__input'), /inset: 0;/);
  assert.match(cssRule(css, '.dm-chip__remove'), /width: var\(--control-target-minimum\);/);
});

function cssRule(css: string, selector: string): string {
  const start = css.indexOf(`${selector} {`);
  assert.ok(start >= 0, `${selector} not found`);
  return css.slice(start, css.indexOf('}', start));
}
