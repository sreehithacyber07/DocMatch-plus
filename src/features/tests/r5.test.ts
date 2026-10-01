import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  enterAvailable,
  heroIsVisible,
  heroReducer,
  initialHeroState,
  videoMounted,
  type HeroEvent,
  type HeroState,
} from '../hero/hero-state.ts';

function run(from: HeroState, events: readonly HeroEvent[]): HeroState {
  return events.reduce<HeroState>((state, event) => heroReducer(state, event), from);
}

test('every normal root visit starts with the video mounted and Enter visible', () => {
  assert.equal(initialHeroState({ reducedMotion: false }), 'loading');
  assert.equal(videoMounted('loading', { reducedMotion: false }), true);
  assert.equal(enterAvailable('loading'), true);
  assert.equal(enterAvailable('playing'), true);
});

test('session storage and viewport size cannot choose a different entrance', async () => {
  const state = await readFile('src/features/hero/hero-state.ts', 'utf8');
  const experience = await readFile('src/features/hero/HeroExperience.tsx', 'utf8');
  assert.doesNotMatch(state + experience, /sessionStorage|localStorage|matchMedia|preferStill|HeroIntro/);
  assert.doesNotMatch(state + experience, /Skip intro|Symptom\s*.*Specialist|Clinical routing/);
});

test('reduced motion uses the same identity composition with a still', () => {
  assert.equal(initialHeroState({ reducedMotion: true }), 'fallback');
  assert.equal(videoMounted('fallback', { reducedMotion: true }), false);
  assert.equal(enterAvailable('fallback'), true);
});

test('video readiness, ending and failure resolve without an alternate intro', () => {
  assert.equal(run('loading', ['video-ready']), 'playing');
  assert.equal(run('loading', ['video-ready', 'video-ended']), 'final');
  assert.equal(run('loading', ['video-error']), 'fallback');
  assert.equal(run('playing', ['video-error']), 'fallback');
  assert.equal(heroReducer('final', 'video-error'), 'final');
});

test('the held final frame remains mounted and actionable', () => {
  assert.equal(videoMounted('final', { reducedMotion: false }), true);
  assert.equal(enterAvailable('final'), true);
  assert.equal(heroIsVisible('final'), true);
});

test('Enter is available throughout the visit and exits once', () => {
  for (const state of ['loading', 'playing', 'final', 'fallback'] as const) {
    assert.equal(run(state, ['enter', 'exit-complete']), 'dismissed');
  }
  assert.equal(enterAvailable('exiting'), false);
  assert.equal(heroReducer('exiting', 'enter'), 'exiting');
});

test('dismissed remains terminal for every event', () => {
  const events: HeroEvent[] = ['video-ready', 'video-ended', 'video-error', 'enter', 'exit-complete'];
  for (const event of events) assert.equal(heroReducer('dismissed', event), 'dismissed');
  assert.equal(heroIsVisible('dismissed'), false);
});

test('the reducer is deterministic across the complete state/event table', () => {
  const states: HeroState[] = ['loading', 'playing', 'final', 'fallback', 'exiting', 'dismissed'];
  const events: HeroEvent[] = ['video-ready', 'video-ended', 'video-error', 'enter', 'exit-complete'];
  for (const state of states) {
    for (const event of events) {
      const next = heroReducer(state, event);
      assert.ok(states.includes(next));
      assert.equal(next, heroReducer(state, event));
    }
  }
});

test('the hero surface contains only the logo and Enter as visible copy', async () => {
  const source = await readFile('src/features/hero/HeroExperience.tsx', 'utf8');
  const css = await readFile('src/features/hero/hero.css', 'utf8');
  assert.match(source, /<Brandmark size="hero"\s*\/>/);
  assert.match(source, /<span className="type-control">Enter<\/span>/);
  assert.doesNotMatch(source, /<motion\.button/);
  assert.match(css, /\.hero__content\s*\{[^}]*align-content:\s*center/s);
  assert.doesNotMatch(source, /Skip intro|Does not diagnose|Patient routing system/);
});

test('the result contains no stray convergence glyph', async () => {
  const source = await readFile('src/features/routing-flow/RoutingResult.tsx', 'utf8');
  assert.doesNotMatch(source, /<Convergence|className="converge"/);
});
