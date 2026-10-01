/// <reference types="node" />

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { join } from 'node:path';
import {
  BODY_DOMAIN,
  BODY_DOMAIN_VERSION,
  BODY_LAYER_IDS,
  BODY_REGION_IDS,
  BODY_REGIONS,
  BODY_VIEW_IDS,
  R4_MAX_PAIN_POINTS,
  changeBodyLayer,
  changeBodyView,
  createBodySelectionState,
  exactPointPainLocation,
  generalAreaPainLocation,
  getAdjacentKeyboardRegion,
  getKeyboardRegionOrder,
  painLocationFromSelection,
  regionAvailableInView,
  selectRegion,
  selectStructure,
  selectSystem,
  setPainPrecision,
  validateArtworkPackage,
  validateBodyDomain,
  validateBodySelectionState,
  validateHitMapPackage,
  validatePainLocation,
  validatePrimaryPainLocations,
  type BodyArtworkPackage,
  type BodyDomainDefinition,
  type BodySelectionState,
  type SemanticHitMapPackage,
} from '../index.ts';

function bodySourceFiles(directory = join(process.cwd(), 'src', 'body')): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === 'tests' ? [] : bodySourceFiles(path);
    return entry.name.endsWith('.ts') ? [path] : [];
  });
}

function domainSource(): string {
  return bodySourceFiles()
    .filter((path) => !path.includes(`${join('body', 'bridge')}`))
    .map((path) => readFileSync(path, 'utf8'))
    .join('\n');
}

function membershipFixture(): BodyDomainDefinition {
  return {
    ...BODY_DOMAIN,
    provenanceSources: [{
      id: 'fixture-anatomy-source',
      organization: 'Test institution',
      title: 'Test anatomy source',
      reference: 'fixture://anatomy',
      relationshipSupported: 'Test-only shoulder membership.',
      reviewStatus: 'reviewed',
      version: '1',
    }],
    systems: [{
      id: 'fixture-musculoskeletal',
      label: 'Fixture musculoskeletal system',
      regionIds: ['left-shoulder'],
      provenanceIds: ['fixture-anatomy-source'],
    }],
    structures: [{
      id: 'fixture-left-shoulder-structure',
      label: 'Fixture left shoulder structure',
      systemId: 'fixture-musculoskeletal',
      regionIds: ['left-shoulder'],
      provenanceIds: ['fixture-anatomy-source'],
    }],
    systemMembershipStatus: { status: 'ready', provenanceIds: ['fixture-anatomy-source'] },
    structureMembershipStatus: { status: 'ready', provenanceIds: ['fixture-anatomy-source'] },
  };
}

function artworkFixture(): BodyArtworkPackage {
  return {
    artworkVersion: 'founder-artwork-fixture-1',
    coordinateSpaces: [{ id: 'front-space', width: 100, height: 200, aspectRatio: 0.5 }],
    assets: [{
      assetId: 'front-hologram-artwork',
      assetRef: 'opaque-future-asset-reference',
      view: 'front',
      layer: 'hologram',
      coordinateSpaceId: 'front-space',
      intrinsicWidth: 100,
      intrinsicHeight: 200,
    }],
    regionReferences: [{
      regionId: 'left-knee',
      view: 'front',
      coordinateSpaceId: 'front-space',
      markerAnchor: { x: 0.5, y: 0.5 },
      labelAnchor: { x: 0.6, y: 0.5 },
      zoomTarget: { x: 0.3, y: 0.3, width: 0.4, height: 0.4 },
    }],
  };
}

test('current body domain is structurally valid while anatomy membership data is explicitly blocked', () => {
  const report = validateBodyDomain(BODY_DOMAIN);
  assert.equal(report.structureValid, true);
  assert.equal(report.anatomyDataReady, false);
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.blockers.map((blocker) => blocker.code), [
    'SYSTEM_MEMBERSHIP_EVIDENCE_REQUIRED',
    'STRUCTURE_MEMBERSHIP_EVIDENCE_REQUIRED',
  ]);
});

test('all required canonical region IDs exist', () => {
  assert.equal(BODY_REGIONS.length, 33);
  assert.deepEqual(BODY_REGIONS.map((region) => region.id), [...BODY_REGION_IDS]);
});

test('canonical region IDs are unique', () => {
  assert.equal(new Set(BODY_REGIONS.map((region) => region.id)).size, BODY_REGIONS.length);
});

test('every region has a patient-readable non-empty label', () => {
  for (const region of BODY_REGIONS) assert.ok(region.label.trim().length > 0);
  assert.equal(BODY_REGIONS.find((region) => region.id === 'left-shoulder')?.label, 'Left shoulder');
});

test('laterality is explicitly patient-relative in canonical left and right IDs', () => {
  for (const region of BODY_REGIONS) {
    if (region.id.startsWith('left-')) assert.equal(region.laterality, 'left');
    else if (region.id.startsWith('right-')) assert.equal(region.laterality, 'right');
    else assert.equal(region.laterality, 'midline');
  }
});

test('every lateral region has a reciprocal opposite-sided pair', () => {
  const byId = new Map(BODY_REGIONS.map((region) => [region.id, region]));
  for (const region of BODY_REGIONS.filter((candidate) => candidate.laterality !== 'midline')) {
    assert.ok(region.pairedRegionId);
    const pair = byId.get(region.pairedRegionId);
    assert.ok(pair);
    assert.equal(pair.pairedRegionId, region.id);
    assert.notEqual(pair.laterality, region.laterality);
  }
});

test('front and back availability is valid and semantic', () => {
  assert.deepEqual(BODY_VIEW_IDS, ['front', 'back']);
  assert.equal(regionAvailableInView(BODY_REGIONS.find((region) => region.id === 'face')!, 'front'), true);
  assert.equal(regionAvailableInView(BODY_REGIONS.find((region) => region.id === 'face')!, 'back'), false);
  assert.equal(regionAvailableInView(BODY_REGIONS.find((region) => region.id === 'upper-back')!, 'back'), true);
  assert.equal(regionAvailableInView(BODY_REGIONS.find((region) => region.id === 'left-knee')!, 'front'), true);
  assert.equal(regionAvailableInView(BODY_REGIONS.find((region) => region.id === 'left-knee')!, 'back'), true);
});

test('semantic identity is independent of artwork and hit-target IDs', () => {
  const artwork = artworkFixture();
  const hitMap: SemanticHitMapPackage = {
    hitMapVersion: 'fixture-hit-map-1',
    artworkVersion: artwork.artworkVersion,
    targets: [
      { hitTargetId: 'shape-a', geometryRef: 'geometry-a', regionId: 'left-knee', view: 'front', coordinateSpaceId: 'front-space', capabilities: { pointer: true, keyboard: true, touch: true, minimumTargetSizeCssPx: 44 } },
      { hitTargetId: 'shape-b', geometryRef: 'geometry-b', regionId: 'left-knee', view: 'front', coordinateSpaceId: 'front-space', capabilities: { pointer: true, keyboard: true, touch: true, minimumTargetSizeCssPx: 44 } },
    ],
  };
  assert.equal(validateArtworkPackage(artwork).valid, true);
  assert.equal(validateHitMapPackage(hitMap, artwork).valid, true);
  assert.equal(new Set(hitMap.targets.map((target) => target.regionId)).size, 1);
  assert.notEqual(hitMap.targets[0].hitTargetId, hitMap.targets[0].regionId);
});

test('hit-map validation rejects ambiguous geometry ownership', () => {
  const artwork = artworkFixture();
  const hitMap: SemanticHitMapPackage = {
    hitMapVersion: 'fixture-hit-map-1',
    artworkVersion: artwork.artworkVersion,
    targets: [
      { hitTargetId: 'a', geometryRef: 'shared', regionId: 'left-knee', view: 'front', coordinateSpaceId: 'front-space', capabilities: { pointer: true, keyboard: true, touch: true, minimumTargetSizeCssPx: 44 } },
      { hitTargetId: 'b', geometryRef: 'shared', regionId: 'right-knee', view: 'front', coordinateSpaceId: 'front-space', capabilities: { pointer: true, keyboard: true, touch: true, minimumTargetSizeCssPx: 44 } },
    ],
  };
  assert.ok(validateHitMapPackage(hitMap, artwork).errors.some((candidate) => candidate.code === 'AMBIGUOUS_GEOMETRY_OWNERSHIP'));
});

test('a general-area pain location is valid without a point', () => {
  const location = generalAreaPainLocation('upper-abdomen');
  assert.deepEqual(location, { regionId: 'upper-abdomen', precision: 'general-area' });
  assert.equal(validatePainLocation(location).valid, true);
});

test('an exact pain point is valid within normalized bounds', () => {
  const location = exactPointPainLocation('left-knee', { x: 0.125, y: 0.875 });
  assert.deepEqual(location, { regionId: 'left-knee', precision: 'exact-point', point: { x: 0.125, y: 0.875 } });
  assert.equal(validatePainLocation(location).valid, true);
});

test('exact pain points outside zero through one are rejected', () => {
  assert.equal(validatePainLocation({ regionId: 'left-knee', precision: 'exact-point', point: { x: -0.01, y: 1.01 } }).valid, false);
  assert.throws(() => exactPointPainLocation('left-knee', { x: 1.1, y: 0.5 }), /finite number from 0 to 1/i);
});

test('an exact point without a selected region is rejected', () => {
  const invalid = { ...createBodySelectionState(), painPrecision: 'exact-point', exactPoint: { x: 0.5, y: 0.5 } } as BodySelectionState;
  assert.ok(validateBodySelectionState(invalid).errors.some((candidate) => candidate.code === 'POINT_WITHOUT_REGION'));
});

test('a general-area location with a point is rejected', () => {
  assert.ok(validatePainLocation({ regionId: 'left-knee', precision: 'general-area', point: { x: 0.5, y: 0.5 } }).errors.some((candidate) => candidate.code === 'GENERAL_AREA_HAS_POINT'));
});

test('R4 enforces one primary pain location', () => {
  assert.equal(R4_MAX_PAIN_POINTS, 1);
  const report = validatePrimaryPainLocations([
    generalAreaPainLocation('left-knee'),
    generalAreaPainLocation('right-knee'),
  ]);
  assert.ok(report.errors.some((candidate) => candidate.code === 'TOO_MANY_PAIN_LOCATIONS'));
});

test('changing region clears an incompatible exact point', () => {
  const initial = selectRegion(createBodySelectionState(), 'left-knee');
  const exact = setPainPrecision(initial, 'exact-point', { x: 0.2, y: 0.8 });
  const changed = selectRegion(exact, 'right-knee');
  assert.equal(changed.selectedRegionId, 'right-knee');
  assert.equal(changed.painPrecision, 'general-area');
  assert.equal(changed.exactPoint, null);
});

test('layer changes preserve the selected semantic region', () => {
  const selected = selectRegion(createBodySelectionState(), 'left-knee');
  const systems = changeBodyLayer(selected, 'systems');
  const structures = changeBodyLayer(systems, 'structures');
  const hologram = changeBodyLayer(structures, 'hologram');
  assert.equal(systems.selectedRegionId, 'left-knee');
  assert.equal(structures.selectedRegionId, 'left-knee');
  assert.equal(hologram.selectedRegionId, 'left-knee');
  assert.deepEqual(BODY_LAYER_IDS, ['hologram', 'systems', 'structures']);
});

test('changing region clears incompatible system and structure selections', () => {
  const domain = membershipFixture();
  let state = selectRegion(createBodySelectionState(), 'left-shoulder', domain);
  state = changeBodyLayer(state, 'structures', domain);
  state = selectSystem(state, 'fixture-musculoskeletal', domain);
  state = selectStructure(state, 'fixture-left-shoulder-structure', domain);
  const changed = selectRegion(state, 'right-shoulder', domain);
  assert.equal(changed.selectedSystemId, null);
  assert.equal(changed.selectedStructureId, null);
});

test('front and back switching preserves a compatible region and patient side while clearing view-bound point geometry', () => {
  let state = selectRegion(createBodySelectionState('front'), 'left-knee');
  state = setPainPrecision(state, 'exact-point', { x: 0.3, y: 0.6 });
  const back = changeBodyView(state, 'back');
  assert.equal(back.selectedRegionId, 'left-knee');
  assert.equal(back.painPrecision, 'general-area');
  assert.equal(back.exactPoint, null);
  assert.equal(BODY_REGIONS.find((region) => region.id === back.selectedRegionId)?.laterality, 'left');
});

test('view switching clears an unavailable region without remapping it', () => {
  const face = selectRegion(createBodySelectionState('front'), 'face');
  const back = changeBodyView(face, 'back');
  assert.equal(back.view, 'back');
  assert.equal(back.selectedRegionId, null);
  assert.equal(back.exactPoint, null);
});

test('keyboard traversal is deterministic and wraps predictably', () => {
  const first = getKeyboardRegionOrder('front');
  const second = getKeyboardRegionOrder('front');
  assert.deepEqual(first, second);
  assert.notEqual(first, second);
  assert.equal(getAdjacentKeyboardRegion('front', null, 'next'), 'head');
  assert.equal(getAdjacentKeyboardRegion('front', first[first.length - 1], 'next'), 'head');
});

test('keyboard traversal references every available region exactly once', () => {
  for (const view of BODY_VIEW_IDS) {
    const order = getKeyboardRegionOrder(view);
    assert.equal(new Set(order).size, order.length);
    assert.deepEqual(
      [...order].toSorted(),
      BODY_REGIONS.filter((region) => regionAvailableInView(region, view)).map((region) => region.id).toSorted(),
    );
  }
});

test('body-domain runtime source has no browser or DOM dependency', () => {
  assert.doesNotMatch(domainSource(), /\b(?:window|document|HTMLElement|SVGElement|CanvasRenderingContext2D)\b/);
});

test('body-domain runtime source has no React dependency', () => {
  assert.doesNotMatch(domainSource(), /from\s+['"](?:react|react-dom|zustand|framer-motion|three)['"]/);
});

test('body-domain runtime source has no storage or network persistence', () => {
  assert.doesNotMatch(domainSource(), /\b(?:localStorage|sessionStorage|indexedDB|fetch|XMLHttpRequest|WebSocket)\b/);
});

test('body domain imports no routing mathematics or safety controller', () => {
  assert.doesNotMatch(domainSource(), /engine[\\/](?:belief|entropy|questions|session|specialties|stopping|safety)/);
});

test('body domain has no specialty or clinical inference fields', () => {
  assert.doesNotMatch(JSON.stringify(BODY_DOMAIN), /specialty|diagnos|emergency|likelihood|prior|belief/i);
});

test('domain validation rejects duplicate IDs and invalid membership references', () => {
  const base = membershipFixture();
  const invalid: BodyDomainDefinition = {
    ...base,
    regions: [...base.regions, { ...base.regions[0] }],
    systems: [{ ...base.systems[0], regionIds: ['left-shoulder', 'not-a-region' as 'left-shoulder'] }],
    structures: [{ ...base.structures[0], systemId: 'missing-system' }],
  };
  const report = validateBodyDomain(invalid);
  assert.equal(report.structureValid, false);
  assert.ok(report.errors.some((candidate) => candidate.code === 'DUPLICATE_REGION_ID'));
  assert.ok(report.errors.some((candidate) => candidate.code === 'UNKNOWN_SYSTEM_REGION'));
  assert.ok(report.errors.some((candidate) => candidate.code === 'UNKNOWN_STRUCTURE_SYSTEM'));
});

test('artwork validation rejects invalid semantic references and normalized anchors', () => {
  const base = artworkFixture();
  const invalid: BodyArtworkPackage = {
    ...base,
    regionReferences: [{
      regionId: 'face',
      view: 'back',
      coordinateSpaceId: 'front-space',
      markerAnchor: { x: 1.2, y: 0.5 },
    }],
  };
  const report = validateArtworkPackage(invalid);
  assert.equal(report.valid, false);
  assert.ok(report.errors.some((candidate) => candidate.code === 'REGION_UNAVAILABLE_IN_VIEW'));
  assert.ok(report.errors.some((candidate) => candidate.code === 'ANCHOR_OUT_OF_BOUNDS'));
});

test('selection can materialize one immutable normalized pain location', () => {
  const selected = selectRegion(createBodySelectionState(), 'upper-abdomen');
  const exact = setPainPrecision(selected, 'exact-point', { x: 0.4, y: 0.7 });
  const location = painLocationFromSelection(exact);
  assert.deepEqual(location, { regionId: 'upper-abdomen', precision: 'exact-point', point: { x: 0.4, y: 0.7 } });
  assert.notEqual(location && 'point' in location ? location.point : null, exact.exactPoint);
  assert.equal(BODY_DOMAIN_VERSION, '0.1.0-body-domain');
});
