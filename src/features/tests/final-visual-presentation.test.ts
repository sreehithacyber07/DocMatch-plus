import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';
import { parsePastedDate } from '../../components/primitives/calendar-model.ts';
import { SEX_OPTIONS } from '../intake/patient-context.ts';
import { BODY_ASSETS } from '../body-explorer/artwork/bodyAssetRegistry.ts';
import { FACE_ASSET_REGISTRATION } from '../body-explorer/artwork/faceAssetRegistration.ts';
import { faceArtwork, resolveArtwork } from '../body-explorer/artwork/registry.ts';
import { FACE_HIT_REGIONS, FACE_HITMAP_VIEWBOX, FACE_REGION_BY_ID } from '../body-explorer/faceHitMap.ts';
import { bodyFocusTarget, faceFocusTarget, panForTarget } from '../body-explorer/focusRegionMap.ts';

test('all 14 approved presentation assets exist in their own family', async () => {
  for (const variant of ['male', 'female'] as const) {
    for (const layer of ['hologram', 'systems', 'structures'] as const) {
      for (const view of ['front', 'back'] as const) {
        const path = BODY_ASSETS[variant][layer][view];
        assert.match(path, new RegExp(`^/body/${variant} `));
        assert.equal(resolveArtwork(variant, view, layer).entry.assetRef, path);
        await access(`public${path}`);
      }
    }
    assert.match(faceArtwork(variant) ?? '', new RegExp(`^/body/${variant} `));
    await access(`public${BODY_ASSETS[variant].focus.face}`);
  }
});

test('the editorial story references only male body artwork', async () => {
  const source = await readFile('src/screens/onboarding/OnboardingVisual.tsx', 'utf8');
  // The plain asset map, not the hit-map registry, keeps generated geometry out
  // of the entrance bundle.
  assert.match(source, /BODY_ASSETS\.male\[art\.id\]\.front/);
  assert.doesNotMatch(source, /female|artwork\/registry/);
  const clarify = await readFile('src/screens/onboarding/OnboardingScenes.tsx', 'utf8');
  assert.match(clarify, /BODY_ASSETS\.male\.hologram\.front/);
});

test('sex control has the three approved visible labels without changing internal value', () => {
  assert.deepEqual(SEX_OPTIONS.map(({ label }) => label), ['Female', 'Male', 'Other']);
  assert.equal(SEX_OPTIONS[2].value, 'intersex_or_variation');
});

test('date paste accepts separators and rejects invalid or future dates', () => {
  const min = { year: 1900, month: 1, day: 1 };
  const max = { year: 2026, month: 9, day: 20 };
  for (const input of ['20/11/2007', '20-11-2007', '20 11 2007']) {
    assert.deepEqual(parsePastedDate(input, min, max), { day: '20', month: '11', year: '2007' });
  }
  assert.equal(parsePastedDate('31/02/2007', min, max), null);
  assert.equal(parsePastedDate('21/09/2026', min, max), null);
});

test('one 1000x1200 semantic face map serves both assets', () => {
  assert.deepEqual(FACE_HITMAP_VIEWBOX, { width: 1000, height: 1200 });
  assert.equal(FACE_HIT_REGIONS.length, 16);
  assert.equal(new Set(FACE_HIT_REGIONS.map(({ id }) => id)).size, 16);
  assert.equal(FACE_HIT_REGIONS.at(-1)?.id, 'face-general');
  assert.ok(FACE_HIT_REGIONS.every(({ path, focus }) => path.length > 20 && focus.maxZoom >= focus.defaultZoom));
});

test('face laterality is patient-relative and specific hits beat fallback', async () => {
  for (const part of ['temple', 'eye', 'cheek', 'jaw', 'ear']) {
    assert.ok(FACE_REGION_BY_ID[`patient-right-${part}` as keyof typeof FACE_REGION_BY_ID].focus.x < 0.5);
    assert.ok(FACE_REGION_BY_ID[`patient-left-${part}` as keyof typeof FACE_REGION_BY_ID].focus.x > 0.5);
  }
  const overlay = await readFile('src/features/body-explorer/FaceHitOverlay.tsx', 'utf8');
  assert.match(overlay, /sort\(\(a, b\) => b\.priority - a\.priority\)/);
  assert.ok(FACE_REGION_BY_ID['face-general'].priority > FACE_REGION_BY_ID['patient-right-eye'].priority);
});

test('both overlay registrations align to measured eye, mouth, ear, and neck landmarks', () => {
  const landmarks = {
    male: { eye: 0.4, mouth: 0.67, ear: 0.49, neck: 0.9 },
    female: { eye: 0.41, mouth: 0.65, ear: 0.49, neck: 0.9 },
  } as const;
  for (const variant of ['male', 'female'] as const) {
    const registration = FACE_ASSET_REGISTRATION[variant];
    const vertical = (overlayY: number) => 0.5 + (overlayY - 0.5) * registration.scaleY + registration.offsetY / 1200;
    const horizontal = (overlayX: number) => 0.5 + (overlayX - 0.5) * registration.scaleX + registration.offsetX / 1000;
    assert.ok(Math.abs(vertical(FACE_REGION_BY_ID['patient-right-eye'].focus.y) - landmarks[variant].eye) < 0.03);
    assert.ok(Math.abs(vertical(FACE_REGION_BY_ID.mouth.focus.y) - landmarks[variant].mouth) < 0.03);
    assert.ok(Math.abs(vertical(FACE_REGION_BY_ID['patient-right-ear'].focus.y) - landmarks[variant].ear) < 0.03);
    assert.ok(Math.abs(vertical(FACE_REGION_BY_ID['upper-neck'].focus.y) - landmarks[variant].neck) < 0.03);
    assert.ok(Math.abs(horizontal(FACE_REGION_BY_ID['patient-right-eye'].focus.x) - 0.35) < 0.03);
    assert.ok(Math.abs(horizontal(FACE_REGION_BY_ID['patient-left-eye'].focus.x) - 0.65) < 0.03);
  }
});

test('face registration is applied to the overlay and never distorts the approved PNG', async () => {
  const stage = await readFile('src/features/body-explorer/FaceDetailStage.tsx', 'utf8');
  const css = await readFile('src/features/body-explorer/body-explorer.css', 'utf8');
  assert.match(stage, /<img className="stage__face-artwork"[^>]*draggable=\{false\} \/>/);
  assert.match(stage, /<FaceHitOverlay[^>]*style=\{overlayRegistrationStyle\}/);
  assert.match(css, /\.stage__face-artwork\s*\{[^}]*object-fit:\s*contain/s);
  assert.doesNotMatch(css, /\.stage__face-artwork\s*\{[^}]*scale/s);
});

test('face rail and overlay share selected and hovered semantic state', async () => {
  const explorer = await readFile('src/features/body-explorer/BodyExplorer.tsx', 'utf8');
  const panels = await readFile('src/features/body-explorer/ContextPanels.tsx', 'utf8');
  const overlay = await readFile('src/features/body-explorer/FaceHitOverlay.tsx', 'utf8');
  assert.match(explorer, /hoveredFaceSubregionId/);
  assert.match(explorer, /<FaceRegionRail/);
  assert.match(panels, /FACE_HIT_REGIONS/);
  assert.match(panels, /Selecting an area helps tailor the questions that follow\./);
  assert.match(overlay, /data-hovered=\{hovered === region\.id\}/);
});

test('region focus has distinct pan and zoom targets', () => {
  const left = faceFocusTarget('patient-right-eye');
  const right = faceFocusTarget('patient-left-eye');
  const leftPan = panForTarget(left, 1000 / 1200);
  const rightPan = panForTarget(right, 1000 / 1200);
  assert.ok(leftPan.x > 0 && rightPan.x < 0);
  assert.ok(left.zoom > 1 && right.zoom > 1);
  const head = bodyFocusTarget('head', { x: 400, y: 40, width: 200, height: 150 });
  const abdomen = bodyFocusTarget('upper-abdomen', { x: 400, y: 500, width: 200, height: 150 });
  assert.ok(head.y < abdomen.y);
  assert.ok(head.zoom > abdomen.zoom);
});
