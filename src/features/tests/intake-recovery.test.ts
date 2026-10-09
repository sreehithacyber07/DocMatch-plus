/**
 * Intake recovery, the date-of-birth chooser and ambient-canvas pacing.
 *
 * Covers the page-memory retention that keeps a patient's answers through Back
 * and Forward and an accidental exit from /route, and the privacy rules around
 * it: memory only, never across patients, never across a kiosk reset, and
 * never a way around a priority interruption.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createPatientMemory, RESUME_WINDOW_MS, type RetentionPolicy } from '../trust/patient-memory.ts';
import { emptyPatientContext, finalizePatientContext, validateDateOfBirth } from '../intake/patient-context.ts';
import { Calendar } from '../../components/primitives/Calendar.tsx';
import { chooserKeyTarget, monthAvailable, yearOptions } from '../../components/primitives/calendar-model.ts';
import { createFrameGovernor, pixelRatioFor, RESTING_FPS } from '../../components/docmatch-visual/frame-governor.ts';
import { answer, controllerFor, currentStep, startInterview } from './interview-driver.ts';

(globalThis as { React?: typeof React }).React = React;

const ROOT = process.cwd();
const source = (relativePath: string) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

type Parts = { route: { name: string }; intake: { step: string } };
const WEB: RetentionPolicy = { retainAcrossExit: true, resumeWindowMs: RESUME_WINDOW_MS };
const KIOSK: RetentionPolicy = { retainAcrossExit: false, resumeWindowMs: RESUME_WINDOW_MS };

function manualTimers() {
  const pending = new Map<number, () => void>();
  let next = 0;
  return {
    timers: {
      set: (callback: () => void) => {
        next += 1;
        pending.set(next, callback);
        return next;
      },
      clear: (handle: unknown) => pending.delete(handle as number),
    },
    fireAll: () => {
      for (const [key, callback] of [...pending]) {
        pending.delete(key);
        callback();
      }
    },
    count: () => pending.size,
  };
}

function disposable() {
  const record = { disposed: 0 };
  return { record, value: { dispose: () => { record.disposed += 1; } } };
}

/* --- Page-memory retention ------------------------------------------------------ */

test('a web patient who leaves /route briefly resumes with every answer', () => {
  let clock = 0;
  const timers = manualTimers();
  const memory = createPatientMemory<Parts>(WEB, { now: () => clock, timers: timers.timers });
  const { epoch } = memory.resume();
  memory.attach();
  memory.write(epoch, 'route', { name: 'A' });
  memory.write(epoch, 'intake', { step: 'background' });
  memory.leave();
  clock += 60_000;
  const back = memory.resume();
  assert.equal(back.resumed, true);
  assert.equal(back.epoch, epoch);
  assert.deepEqual(memory.read(back.epoch, 'intake'), { step: 'background' });
  memory.attach();
  assert.equal(timers.count(), 0, 'returning cancels the expiry');
});

test('the latest value is canonical: a later write replaces an earlier one', () => {
  const memory = createPatientMemory<Parts>(WEB);
  memory.write(0, 'route', { name: 'first' });
  memory.write(0, 'route', { name: 'corrected' });
  assert.deepEqual(memory.read(0, 'route'), { name: 'corrected' });
});

test('retained state expires, and expiry releases the backend session it holds', () => {
  let clock = 0;
  const timers = manualTimers();
  const memory = createPatientMemory<Parts>(WEB, { now: () => clock, timers: timers.timers });
  const session = disposable();
  memory.write(0, 'route', { name: 'A' });
  memory.park(0, 'confirmed-at', session.value);
  memory.leave();
  clock += RESUME_WINDOW_MS + 1;
  timers.fireAll();
  assert.equal(session.record.disposed, 1);
  assert.equal(memory.resume().resumed, false);
  assert.equal(memory.read(0, 'route'), undefined);
});

test('an expired memory is not resumed even if its timer never ran', () => {
  let clock = 0;
  const memory = createPatientMemory<Parts>(WEB, { now: () => clock, timers: manualTimers().timers });
  memory.write(0, 'route', { name: 'A' });
  memory.leave();
  clock += RESUME_WINDOW_MS + 1;
  assert.equal(memory.resume().resumed, false);
});

test('KIOSK: leaving /route discards the patient, so the next person can never resume them', () => {
  const memory = createPatientMemory<Parts>(KIOSK);
  const session = disposable();
  memory.write(0, 'route', { name: 'previous patient' });
  memory.park(0, 'confirmed-at', session.value);
  assert.equal(session.record.disposed, 1, 'a kiosk never holds a backend session across an exit');
  memory.leave();
  assert.equal(memory.resume().resumed, false);
  assert.equal(memory.read(0, 'route'), undefined);
});

test('KIOSK: an inactivity reset discards the patient and moves the epoch on', () => {
  const memory = createPatientMemory<Parts>(KIOSK);
  memory.write(0, 'route', { name: 'previous patient' });
  memory.reset(1);
  assert.equal(memory.read(0, 'route'), undefined);
  assert.equal(memory.read(1, 'route'), undefined);
  // A screen still holding the old epoch cannot write the old patient back.
  memory.write(0, 'route', { name: 'previous patient' });
  assert.equal(memory.read(1, 'route'), undefined);
});

test('ISOLATION: one patient can never resume another patient\'s state or backend session', () => {
  const memory = createPatientMemory<Parts>(WEB, { timers: manualTimers().timers });
  const first = disposable();
  memory.write(0, 'intake', { step: 'history' });
  memory.park(0, 'patient-a', first.value);
  memory.reset(1); // New Patient
  assert.equal(first.record.disposed, 1, 'the previous patient\'s session is ended at the reset');
  assert.equal(memory.unpark(1, 'patient-a'), null);
  assert.equal(memory.unpark(0, 'patient-a'), null);
  assert.equal(memory.read(1, 'intake'), undefined);
  // A session released for a stale epoch is ended, never kept.
  const stale = disposable();
  memory.park(0, 'patient-a', stale.value);
  assert.equal(stale.record.disposed, 1);
  // A different concern of the same patient does not take another key's session.
  const current = disposable();
  memory.park(1, 'concern-1', current.value);
  assert.equal(memory.unpark(1, 'concern-2'), null);
  assert.equal(memory.unpark(1, 'concern-1'), current.value);
  assert.equal(current.record.disposed, 0);
});

test('changing location carries only what is explicitly carried into the next epoch', () => {
  const memory = createPatientMemory<Parts>(WEB);
  memory.write(0, 'route', { name: 'A' });
  memory.write(0, 'intake', { step: 'background' });
  memory.reset(1, { intake: { step: 'background' } });
  assert.deepEqual(memory.read(1, 'intake'), { step: 'background' });
  assert.equal(memory.read(1, 'route'), undefined);
});

test('discard (a page restored from the back/forward cache) releases everything', () => {
  const memory = createPatientMemory<Parts>(WEB, { timers: manualTimers().timers });
  const session = disposable();
  memory.write(0, 'route', { name: 'A' });
  memory.park(0, 'k', session.value);
  memory.leave();
  memory.discard();
  assert.equal(session.record.disposed, 1);
  assert.equal(memory.resume().resumed, false);
});

test('retention is page memory only, web/self-service only, and wired to every reset', () => {
  const memory = source('src/features/trust/patient-memory.ts');
  const routeMemory = source('src/screens/route/route-memory.ts');
  const route = source('src/screens/route/RouteScreen.tsx');
  for (const file of [memory, routeMemory, route]) {
    assert.doesNotMatch(file, /\b(?:localStorage|sessionStorage|indexedDB)\b|document\.cookie|history\.(?:push|replace)State|searchParams/);
  }
  assert.match(routeMemory, /retainAcrossExit: DEPLOYMENT_MODE === 'web\/self-service'/);
  assert.match(routeMemory, /event\.persisted\) routeMemory\.discard\(\)/);
  // Every reset moves the memory to the next epoch before React commits it.
  assert.match(route, /const clearPatientSession = useCallback\(\(reason: PatientResetReason\) => \{\s*const next = routeMemory\.epoch\(\) \+ 1;\s*routeMemory\.reset\(next\);/);
  assert.match(route, /onReset=\{clearPatientSession\}/);
  assert.match(route, /clearPatientSession\('history-return'\)/);
  assert.match(route, /return \(\) => routeMemory\.leave\(\)/);
});

/* --- Intake: values survive Back, Forward and a remount ------------------------- */
/*
  The intake and the questionnaire import CSS and Vite environment values, so
  they are not rendered under Node here; their remount behaviour is exercised
  in the browser QA. These tests pin the wiring and the clinical guarantees.
*/

test('the intake restores every answer, the step and the optional contact from its snapshot', () => {
  const intake = source('src/features/intake/PatientIntake.tsx');
  assert.match(intake, /useState<Phase>\(\(\) => snapshot\?\.phase \?\? 'terms'\)/);
  assert.match(intake, /useState\(\(\) => snapshot\?\.termsAccepted \?\? false\)/);
  assert.match(intake, /useState<PatientContextDraft>\(\(\) => snapshot\?\.draft \?\? emptyPatientContext\(\)\)/);
  assert.match(intake, /useState<PhoneValue>\(\(\) => snapshot\?\.phone \?\? EMPTY_PHONE\)/);
  assert.match(intake, /onSnapshot\?\.\(\{ phase, termsAccepted, draft, phone \}\)/);
  // The steps share one draft, so Back and Continue keep every answer; the
  // contact is held beside it rather than inside the field that unmounts.
  const step = source('src/features/intake/PatientContextStep.tsx');
  assert.match(step, /<OptionalPhoneField value=\{phone\} onChange=\{onPhoneChange\} \/>/);
  assert.doesNotMatch(source('src/features/intake/OptionalPhoneField.tsx'), /useState<CountryCode>|setNumber/);
});

test('only a corrected date of birth resets what depends on it', () => {
  const intake = source('src/features/intake/PatientIntake.tsx');
  // The under-18 acknowledgement and who is answering depend on the age, so a
  // corrected age asks again; every other answer is left as it was.
  assert.match(intake, /const ageChanged = 'dateOfBirth' in update;\s*return ageChanged\s*\? \{ \.\.\.current, \.\.\.update, underEighteenAcknowledged: false, reporter: null \}\s*: \{ \.\.\.current, \.\.\.update \};/);
});

test('the optional contact is never part of the patient context or persistence', () => {
  const context = finalizePatientContext({
    ...emptyPatientContext(),
    assessmentName: 'Asha Example',
    dateOfBirthParts: { day: '15', month: '01', year: '1981' },
    dateOfBirth: '1981-01-15',
    sexForAssessment: 'female',
    accessibilityNeeds: ['none'],
    existingConditions: ['None known'],
    previousSimilarEpisode: 'no',
    allergyStatus: 'none_known',
    medicationStatus: 'known',
    medications: ['Salbutamol inhaler'],
    surgeryStatus: 'no',
  });
  assert.ok(context);
  assert.deepEqual(context.medications, ['Salbutamol inhaler']);
  assert.doesNotMatch(JSON.stringify(context), /phone|7700/i);
  assert.doesNotMatch(source('src/features/persistence/events.ts'), /phone/i);
  assert.doesNotMatch(source('src/features/persistence/records.ts'), /phone|assessment_name|date_of_birth/i);
});

test('the body map restores the selected region, view, layer and face detail', () => {
  const body = source('src/features/body-explorer/BodyExplorer.tsx');
  assert.match(body, /useBodyExplorer\(variant, snapshot\)/);
  assert.match(body, /snapshot=\{snapshot\?\.variant === chosenVariant \? snapshot : undefined\}/);
  const hook = source('src/features/body-explorer/useBodyExplorer.ts');
  assert.match(hook, /restored\?\.selection \?\? createBodySelectionState\('front'\)/);
});

/* --- Questionnaire: restoration never weakens a priority interruption ---------- */

function reachHeadacheHardStop() {
  let state = startInterview('headache');
  state = answer(state, 'throbbing');
  state = answer(state, '5');
  const screen = currentStep(state);
  assert.equal(screen.kind === 'engine' && screen.question.id, 'safety-headache-sudden-extremely-painful');
  state = answer(state, 'yes');
  assert.equal(controllerFor(state).status, 'interrupted');
  return state;
}

test('CRITICAL: answers restored from page memory reach the same priority interruption', () => {
  const state = reachHeadacheHardStop();
  // What the flow keeps is answers only; R3 evaluates them again on restore.
  const kept = structuredClone({ session: state.session, safetyAnswers: state.safetyAnswers, intakeAnswers: state.intakeAnswers });
  const restored = { ...state, ...kept };
  assert.equal(controllerFor(restored).status, 'interrupted');
  assert.deepEqual(controllerFor(restored), controllerFor(state));
  assert.equal(currentStep(restored).kind, 'interrupted');
});

test('restoration replays answers through the same R3 controller; no stored decision is trusted', () => {
  const flow = source('src/features/routing-flow/RoutingFlow.tsx');
  const snapshotType = flow.slice(flow.indexOf('export interface RoutingSnapshot'), flow.indexOf('}', flow.indexOf('export interface RoutingSnapshot')));
  assert.match(snapshotType, /complaintId: string;\s*session: RoutingSession;\s*safetyAnswers: readonly SafetyAnswer\[\];\s*intakeAnswers: readonly IntakeAnswer\[\];/);
  assert.doesNotMatch(snapshotType, /controller|status|surface|interrupted|result/);
  assert.match(flow, /const restored = snapshot\?\.complaintId === complaintId \? snapshot : undefined;/);
  assert.match(flow, /restored\?\.session \?\? createRoutingSession\(/);
  assert.match(flow, /useState<readonly SafetyAnswer\[\]>\(\(\) => restored\?\.safetyAnswers \?\? \[\]\)/);
  // R3 still evaluates in render from that state, exactly as before.
  assert.ok(flow.indexOf('evaluateSafetyController({') > flow.indexOf('const restored ='));
});

test('a remount continues the same backend session instead of duplicating it', () => {
  const hook = source('src/features/persistence/usePatientPersistence.ts');
  assert.match(hook, /const kept = retention\?\.take\(\) \?\? null;/);
  assert.match(hook, /if \(!kept\) queueMicrotask\(\(\) => persistence\.begin\(start\)\)/);
  assert.match(hook, /if \(retention\) retention\.release\(persistence\);\s*else void persistence\.dispose\(\);/);
});

/* --- Date of birth chooser --------------------------------------------------------- */

const TODAY = { year: 2026, month: 10, day: 8 };
const EARLIEST = { year: 1900, month: 1, day: 1 };

test('the year chooser offers every allowed year, newest first, and none in the future', () => {
  const years = yearOptions(EARLIEST, TODAY);
  assert.equal(years[0], 2026);
  assert.equal(years.at(-1), 1900);
  assert.equal(years.length, 127);
});

test('months outside the allowed range are unavailable', () => {
  assert.equal(monthAvailable(2026, 10, EARLIEST, TODAY), true);
  assert.equal(monthAvailable(2026, 11, EARLIEST, TODAY), false);
  assert.equal(monthAvailable(1900, 1, EARLIEST, TODAY), true);
  assert.equal(monthAvailable(1899, 12, EARLIEST, TODAY), false);
});

test('chooser keys move by one, by a row, by a page, and to either end', () => {
  assert.equal(chooserKeyTarget(5, 'ArrowRight', 4, 127, 12), 6);
  assert.equal(chooserKeyTarget(5, 'ArrowLeft', 4, 127, 12), 4);
  assert.equal(chooserKeyTarget(5, 'ArrowDown', 4, 127, 12), 9);
  assert.equal(chooserKeyTarget(1, 'ArrowUp', 4, 127, 12), 0);
  assert.equal(chooserKeyTarget(5, 'PageDown', 4, 127, 12), 17);
  assert.equal(chooserKeyTarget(125, 'PageDown', 4, 127, 12), 126);
  assert.equal(chooserKeyTarget(40, 'Home', 4, 127, 12), 0);
  assert.equal(chooserKeyTarget(40, 'End', 4, 127, 12), 126);
  assert.equal(chooserKeyTarget(40, 'Tab', 4, 127, 12), null);
});

test('chooser keys move focus in the key handler, not a later render', () => {
  const calendar = source('src/components/primitives/Calendar.tsx');
  const handler = calendar.slice(calendar.indexOf('const onChooserKeyDown'), calendar.indexOf('const previous = addMonths'));
  assert.ok(handler.includes(`const option = chooserRef.current?.querySelectorAll<HTMLElement>('[role="option"]')[next];`));
  assert.ok(handler.includes('option?.focus({ preventScroll: true });'));
  // Pressing a calendar button keeps focus inside the calendar (Safari would drop it to the page).
  assert.ok(calendar.includes(`if ((event.target as Element).closest('button')) event.preventDefault();`));
});

test('the calendar has no native select and its choosers are navy listboxes', () => {
  const calendar = source('src/components/primitives/Calendar.tsx');
  assert.doesNotMatch(calendar, /<select|<option/);
  assert.match(calendar, /role="listbox"/);
  const css = source('src/components/primitives/primitives.css');
  const chooser = css.slice(css.indexOf('.dm-calendar__chooser {'), css.indexOf('}', css.indexOf('.dm-calendar__chooser {')));
  assert.match(chooser, /#04101d/);
  assert.match(chooser, /#020713/);
  assert.doesNotMatch(css.slice(css.indexOf('.dm-calendar__option {'), css.indexOf('.dm-calendar__option:focus-visible')), /#fff(?:fff)?;\s*\}|background: (?:white|#fff)/i);
  assert.match(css, /\.dm-calendar__option \{[^}]*min-height: 44px/);
});

test('a chosen year keeps the month and moves the days to that year', () => {
  const html = renderToStaticMarkup(createElement(Calendar, {
    selected: { year: 1981, month: 1, day: 15 },
    onSelect: () => undefined,
    min: EARLIEST,
    max: TODAY,
    today: TODAY,
    initialPanel: 'years',
  }));
  assert.match(html, /role="option"[^>]*aria-selected="true"[^>]*>1981</);
  assert.match(html, /aria-label="Month, January\. Choose a month"/);
});

test('date of birth rules are unchanged: leap days, invalid dates, future dates and under-18', () => {
  const today = { year: 2026, month: 10, day: 8 };
  assert.equal(validateDateOfBirth({ day: '29', month: '02', year: '2004' }, today).ok, true);
  assert.equal(validateDateOfBirth({ day: '29', month: '02', year: '2003' }, today).ok, false);
  assert.equal(validateDateOfBirth({ day: '31', month: '04', year: '1990' }, today).ok, false);
  assert.equal(validateDateOfBirth({ day: '09', month: '10', year: '2026' }, today).ok, false);
  const minor = validateDateOfBirth({ day: '15', month: '01', year: '2011' }, today);
  assert.ok(minor.ok && minor.age === 15);
});

/* --- Ambient canvas pacing ----------------------------------------------------------- */

test('the ambient canvas rests at 30 fps and uses the full rate only while settling', () => {
  const governor = createFrameGovernor();
  let drawn = 0;
  for (let t = 0; t < 1000; t += 1000 / 60) if (governor.due(t, false)) drawn += 1;
  assert.ok(Math.abs(drawn - RESTING_FPS) <= 1, `${drawn} frames at rest`);
  const active = createFrameGovernor();
  let fast = 0;
  for (let t = 0; t < 1000; t += 1000 / 120) if (active.due(t, true)) fast += 1;
  assert.ok(fast <= 61, `${fast} frames on a 120 Hz display`);
});

test('easing at a lower frame rate settles as fast as the 60 fps original', () => {
  const governor = createFrameGovernor();
  governor.easing(0);
  const twoFrames = governor.easing(1000 / 30)(0.1);
  assert.ok(Math.abs(twoFrames - (1 - 0.9 * 0.9)) < 1e-9);
});

test('touch and small screens draw the canvas at a pixel ratio of at most 1.5', () => {
  assert.equal(pixelRatioFor(3, 390, true), 1.5);
  assert.equal(pixelRatioFor(2, 1440, false), 2);
  assert.equal(pixelRatioFor(1, 1440, false), 1);
});

test('the ambient canvas registers each listener once and removes the same reference', () => {
  const field = source('src/components/docmatch-visual/SignalField.tsx');
  for (const [target, type, handler] of [
    ['window', 'resize', 'redraw'],
    ['window', 'pointermove', 'pointerMove'],
    ['document', 'visibilitychange', 'visibility'],
  ]) {
    const add = new RegExp(`${target}\\.addEventListener\\('${type}', ${handler}`, 'g');
    const remove = new RegExp(`${target}\\.removeEventListener\\('${type}', ${handler}\\)`, 'g');
    assert.equal(field.match(add)?.length, 1, `${type} added once`);
    assert.equal(field.match(remove)?.length, 1, `${type} removed once`);
  }
  assert.match(field, /cancelAnimationFrame\(frame\);\s*repaintAtmosphereRef/);
});
