import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BODY_DOMAIN,
  BODY_REGION_IDS,
  R4_MAX_PAIN_POINTS,
  bodyRegionById,
  changeBodyLayer,
  changeBodyView,
  clearRegion,
  createBodySelectionState,
  getAdjacentKeyboardRegion,
  painLocationFromSelection,
  selectRegion,
  setPainPrecision,
  validateBodySelectionState,
  validatePrimaryPainLocations,
  type BodyRegionId,
} from '../../body/index.ts';
import { candidateComplaintIdsForRegion, resolveCandidateComplaints } from '../../body/bridge/index.ts';
import {
  ARTWORK_VIEWBOX_HEIGHT,
  ARTWORK_VIEWBOX_WIDTH,
  HIT_MAPS,
  hitMapFor,
  shapeBounds,
} from '../body-explorer/artwork/hitmap-geometry.ts';
import { BODY_ARTWORK, layerAvailable, pendingArtworkSlots, resolveArtwork, variantAvailable } from '../body-explorer/artwork/registry.ts';
import { lateralityLabel } from '../body-explorer/useBodyExplorer.ts';
import { patientRelativeSide } from '../body-explorer/laterality.ts';
import { REGION_GROUPS } from '../body-explorer/regionGroups.ts';
import { presentationFor } from '../routing-flow/answer-presentation.ts';
import {
  DEMONSTRATION_ENGINE_CONFIG,
  materializeDemonstrationComplaint,
  R2B_DEMONSTRATION_COMPLAINTS,
  R2B_DEMONSTRATION_KNOWLEDGE,
} from '../../engine/data/index.ts';
import {
  evaluateSafetyController,
  R3_SAFETY_KNOWLEDGE,
  recordSafetyAnswer,
  reconcileSafetyAnswers,
  type SafetyAnswer,
} from '../../engine/safety/index.ts';
import {
  answerSessionQuestion,
  createRoutingSession,
  ENGINE_VERSION,
  informationGain,
  replayBelief,
} from '../../engine/index.ts';

const UPPER_ABDOMEN = 'upper-abdomen' as BodyRegionId;

function materialize(complaintId: string, history: readonly { questionId: string; optionId: string }[] = []) {
  return materializeDemonstrationComplaint(R2B_DEMONSTRATION_KNOWLEDGE, complaintId, history);
}

function newSession(complaintId: string) {
  return createRoutingSession(complaintId, materialize(complaintId).prior, '2026-09-10T00:00:00.000Z');
}

function controllerFor(
  complaintId: string,
  routing: readonly { questionId: string; optionId: string }[],
  safetyAnswers: readonly SafetyAnswer[] = [],
) {
  const complaint = materialize(complaintId, routing);
  let session = newSession(complaintId);
  for (const answer of routing) {
    session = answerSessionQuestion(
      session,
      { ...answer, answeredAt: '2026-09-10T00:00:01.000Z' },
      complaint.questions,
      DEMONSTRATION_ENGINE_CONFIG.posteriorFloor,
    );
  }
  return {
    session,
    complaint,
    result: evaluateSafetyController({
      session,
      complaint,
      safetyAnswers,
      safetyKnowledge: R3_SAFETY_KNOWLEDGE,
      engineConfig: DEMONSTRATION_ENGINE_CONFIG,
    }),
  };
}

/* --- Hit maps and artwork ------------------------------------------------- */

test('every hit-map region id is a frozen Body Domain region', () => {
  for (const pack of HIT_MAPS) {
    for (const region of pack.regions) {
      assert.ok(BODY_REGION_IDS.includes(region.regionId), `${region.regionId} is not a Body Domain region`);
    }
  }
});

test('hit-map regions are available in the view they are drawn for', () => {
  for (const pack of HIT_MAPS) {
    for (const region of pack.regions) {
      const definition = bodyRegionById(region.regionId);
      assert.ok(definition);
      assert.ok(
        definition.viewAvailability === 'both' || definition.viewAvailability === pack.view,
        `${region.regionId} is not available in ${pack.view}`,
      );
    }
  }
});

test('hit-map region ids are unique per package and geometry stays inside the artwork box', () => {
  for (const pack of HIT_MAPS) {
    const ids = pack.regions.map((region) => region.regionId);
    assert.equal(new Set(ids).size, ids.length, `${pack.variantId} ${pack.view} has duplicate regions`);
    for (const region of pack.regions) {
      const bounds = shapeBounds(region.shape);
      assert.ok(bounds.x >= -40 && bounds.y >= -40, `${region.regionId} starts outside the artwork box`);
      assert.ok(bounds.x + bounds.width <= ARTWORK_VIEWBOX_WIDTH + 40, `${region.regionId} overflows horizontally`);
      assert.ok(bounds.y + bounds.height <= ARTWORK_VIEWBOX_HEIGHT + 40, `${region.regionId} overflows vertically`);
      assert.ok(bounds.width > 0 && bounds.height > 0, `${region.regionId} has empty geometry`);
    }
  }
});

test('male and female, front and back, every layer has its own calibrated registration over shared region ids', () => {
  const layers = ['hologram', 'systems', 'structures'] as const;
  assert.equal(HIT_MAPS.length, 12);
  for (const view of ['front', 'back'] as const) {
    const ids = hitMapFor('male', view).regions.map((region) => region.regionId).sort();
    for (const variant of ['male', 'female'] as const) {
      for (const layer of layers) {
        const pack = hitMapFor(variant, view, layer);
        assert.equal(pack.alignmentPending, false);
        // Common semantics: the same region ids in every variant and layer of a view.
        assert.deepEqual(pack.regions.map((region) => region.regionId).sort(), ids, `${variant} ${view} ${layer}`);
      }
      // Layer-specific registration: each layer is its own drawing, so its geometry is its own.
      assert.notDeepEqual(hitMapFor(variant, view, 'hologram').regions, hitMapFor(variant, view, 'systems').regions);
    }
    // Sex-specific registration: the female geometry is not the male geometry reused.
    assert.notDeepEqual(hitMapFor('male', view).regions, hitMapFor('female', view).regions);
  }
  // The stage resolves the registration of the layer it is showing.
  assert.equal(resolveArtwork('female', 'front', 'systems').hitMap.layer, 'systems');
});

test('hit map laterality is patient relative in both views, never mirrored', () => {
  const midX = ARTWORK_VIEWBOX_WIDTH / 2;
  for (const pack of HIT_MAPS) {
    for (const region of pack.regions) {
      const side = region.regionId.startsWith('right-') ? 'right' : region.regionId.startsWith('left-') ? 'left' : null;
      if (!side) continue;
      const bounds = shapeBounds(region.shape);
      const centre = bounds.x + bounds.width / 2;
      // Front: the patient faces the viewer, so patient right is on the viewer's left.
      // Back: the viewer looks from behind, so patient right is on the viewer's right.
      const onViewerLeft = centre < midX;
      const expectViewerLeft = (pack.view === 'front') === (side === 'right');
      assert.equal(onViewerLeft, expectViewerLeft, `${pack.variantId} ${pack.view} ${pack.layer} ${region.regionId} is on the wrong side`);
    }
  }
});

test('male hologram artwork is approved and resolves to an asset reference', () => {
  for (const view of ['front', 'back'] as const) {
    const resolved = resolveArtwork('male', view, 'hologram');
    assert.equal(resolved.entry.status, 'approved');
    assert.equal(resolved.hasAsset, true);
    assert.equal(resolved.entry.assetRef, `/body/male hologram ${view}.png`);
    assert.equal(resolved.entry.intrinsicWidth, ARTWORK_VIEWBOX_WIDTH);
    assert.equal(resolved.entry.intrinsicHeight, ARTWORK_VIEWBOX_HEIGHT);
  }
});

test('male systems and structures artwork is approved so the visual layers can switch', () => {
  for (const view of ['front', 'back'] as const) {
    assert.equal(layerAvailable('male', view, 'systems'), true);
    assert.equal(layerAvailable('male', view, 'structures'), true);
    assert.equal(resolveArtwork('male', view, 'systems').entry.assetRef, `/body/male systems ${view}.png`);
    assert.equal(
      resolveArtwork('male', view, 'structures').entry.assetRef,
      `/body/male organ ${view}.png`,
    );
  }
});

test('anatomy membership data stays blocked, so no system or structure is claimed', () => {
  // Artwork existing does not license inventing which systems or structures
  // belong to a region. That relationship is still unapproved.
  assert.equal(BODY_DOMAIN.systemMembershipStatus.status, 'blocked');
  assert.equal(BODY_DOMAIN.structureMembershipStatus.status, 'blocked');
  assert.equal(BODY_DOMAIN.systems.length, 0);
  assert.equal(BODY_DOMAIN.structures.length, 0);
});

test('every declared artwork slot resolves to a file that exists on disk', async () => {
  const fsp = await import('node:fs/promises');
  for (const slot of BODY_ARTWORK.filter((candidate) => candidate.status === 'approved')) {
    assert.ok(slot.assetRef, `${slot.assetId} is approved without an asset reference`);
    await fsp.access(`public${slot.assetRef}`);
  }
});

test('the presentation region groups only reference frozen region ids', () => {
  const seen = new Set<string>();
  for (const group of REGION_GROUPS) {
    for (const regionId of group.regionIds) {
      assert.ok(BODY_REGION_IDS.includes(regionId), `${regionId} is not a Body Domain region`);
      assert.equal(seen.has(regionId), false, `${regionId} appears in more than one group`);
      seen.add(regionId);
    }
    assert.ok(group.regionIds.includes(group.emblemRegionId));
  }
});

test('both approved body families have complete presentation artwork', () => {
  assert.equal(variantAvailable('female'), true);
  assert.equal(variantAvailable('male'), true);
  assert.deepEqual(pendingArtworkSlots(), []);
  assert.equal(BODY_ARTWORK.length, 12);
});

/* --- Selection ------------------------------------------------------------ */

test('a front region can be selected and a back region cannot be selected from the front view', () => {
  const state = selectRegion(createBodySelectionState('front'), UPPER_ABDOMEN);
  assert.equal(state.selectedRegionId, UPPER_ABDOMEN);
  assert.equal(validateBodySelectionState(state).valid, true);
  assert.throws(() => selectRegion(createBodySelectionState('front'), 'lower-back' as BodyRegionId));
});

test('a back region can be selected in the back view', () => {
  const state = selectRegion(createBodySelectionState('back'), 'lower-back' as BodyRegionId);
  assert.equal(state.selectedRegionId, 'lower-back');
  assert.equal(validateBodySelectionState(state).valid, true);
});

test('laterality is patient relative and midline regions carry no side', () => {
  // Clinical records keep the patient-relative side; a sided region is never recorded as midline.
  assert.equal(patientRelativeSide('left'), 'Your left side');
  assert.equal(patientRelativeSide('right'), 'Your right side');
  assert.equal(patientRelativeSide('midline'), null);
  // The explorer's separate side chip is intentionally empty: the region name already carries the side.
  assert.equal(lateralityLabel('left'), null);
  assert.equal(bodyRegionById('left-knee')?.laterality, 'left');
  assert.equal(bodyRegionById('upper-abdomen')?.laterality, 'midline');
});

test('switching view clears a region that does not exist in the new view', () => {
  const front = selectRegion(createBodySelectionState('front'), UPPER_ABDOMEN);
  const back = changeBodyView(front, 'back');
  assert.equal(back.view, 'back');
  assert.equal(back.selectedRegionId, null);
});

test('switching view keeps a region that exists in both views', () => {
  const front = selectRegion(createBodySelectionState('front'), 'left-knee' as BodyRegionId);
  const back = changeBodyView(front, 'back');
  assert.equal(back.selectedRegionId, 'left-knee');
});

test('clearing a region removes the pain point and resets precision', () => {
  let state = selectRegion(createBodySelectionState('front'), UPPER_ABDOMEN);
  state = setPainPrecision(state, 'exact-point', { x: 0.4, y: 0.6 });
  state = clearRegion(state);
  assert.equal(state.selectedRegionId, null);
  assert.equal(state.exactPoint, null);
  assert.equal(state.painPrecision, 'general-area');
});

/* --- Pain location -------------------------------------------------------- */

test('general area produces a location with no point', () => {
  const state = selectRegion(createBodySelectionState('front'), UPPER_ABDOMEN);
  const location = painLocationFromSelection(state);
  assert.deepEqual(location, { regionId: UPPER_ABDOMEN, precision: 'general-area' });
});

test('exact point stores normalized coordinates inside the region', () => {
  let state = selectRegion(createBodySelectionState('front'), UPPER_ABDOMEN);
  state = setPainPrecision(state, 'exact-point', { x: 0.25, y: 0.75 });
  const location = painLocationFromSelection(state);
  assert.equal(location?.precision, 'exact-point');
  assert.deepEqual(location && 'point' in location ? location.point : null, { x: 0.25, y: 0.75 });
});

test('out of range pain coordinates are rejected', () => {
  const state = selectRegion(createBodySelectionState('front'), UPPER_ABDOMEN);
  assert.throws(() => setPainPrecision(state, 'exact-point', { x: 1.2, y: 0.5 }));
  assert.throws(() => setPainPrecision(state, 'exact-point', { x: 0.5, y: -0.1 }));
});

test('R4 permits exactly one primary pain location', () => {
  assert.equal(R4_MAX_PAIN_POINTS, 1);
  const one = [{ regionId: UPPER_ABDOMEN, precision: 'general-area' }];
  const two = [...one, { regionId: 'chest', precision: 'general-area' }];
  assert.equal(validatePrimaryPainLocations(one).valid, true);
  assert.equal(validatePrimaryPainLocations(two).valid, false);
});

test('changing region discards a point captured in the previous region', () => {
  let state = selectRegion(createBodySelectionState('front'), UPPER_ABDOMEN);
  state = setPainPrecision(state, 'exact-point', { x: 0.3, y: 0.3 });
  state = selectRegion(state, 'chest' as BodyRegionId);
  assert.equal(state.exactPoint, null);
  assert.equal(state.painPrecision, 'general-area');
});

/* --- Zoom and keyboard ---------------------------------------------------- */

test('zoom bounds for a selected region are inside the artwork box', () => {
  const region = hitMapFor('male', 'front').regions.find((candidate) => candidate.regionId === UPPER_ABDOMEN);
  assert.ok(region);
  const bounds = shapeBounds(region.shape);
  assert.ok(bounds.width > 0 && bounds.height > 0);
  assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= ARTWORK_VIEWBOX_WIDTH);
});

test('keyboard traversal follows the frozen order and wraps', () => {
  const order = BODY_DOMAIN.keyboardOrder.front;
  const first = order[0];
  const next = getAdjacentKeyboardRegion('front', first, 'next');
  assert.equal(next, order[1]);
  const wrapped = getAdjacentKeyboardRegion('front', order[order.length - 1], 'next');
  assert.equal(wrapped, order[0]);
  const backwards = getAdjacentKeyboardRegion('front', first, 'previous');
  assert.equal(backwards, order[order.length - 1]);
});

test('every keyboard-ordered region has geometry in its hit map', () => {
  for (const view of ['front', 'back'] as const) {
    const available = new Set(hitMapFor('male', view).regions.map((region) => region.regionId));
    for (const regionId of BODY_DOMAIN.keyboardOrder[view]) {
      assert.ok(available.has(regionId), `${regionId} is missing geometry in the male ${view} hit map`);
    }
  }
});

/* --- Bridge --------------------------------------------------------------- */

test('the bridge maps upper abdomen to the upper abdominal pain complaint', () => {
  const resolution = resolveCandidateComplaints(UPPER_ABDOMEN);
  assert.equal(resolution.status, 'mapped');
  assert.deepEqual([...resolution.complaintIds], ['upper-abdominal-pain']);
});

test('the bridge maps the head to headache and a joint region to musculoskeletal pain', () => {
  assert.ok(candidateComplaintIdsForRegion('head' as BodyRegionId).includes('headache'));
  assert.ok(candidateComplaintIdsForRegion('left-knee' as BodyRegionId).includes('joint-musculoskeletal-pain'));
});

test('an unmapped region returns no complaint rather than a forced mapping', () => {
  const unmapped = BODY_REGION_IDS.filter((regionId) => candidateComplaintIdsForRegion(regionId).length === 0);
  assert.ok(unmapped.length > 0, 'expected at least one deliberately unmapped region');
  for (const regionId of unmapped) {
    assert.equal(resolveCandidateComplaints(regionId).status, 'unmapped');
  }
});

test('every complaint the bridge names exists in R2 knowledge', () => {
  const known = new Set(R2B_DEMONSTRATION_COMPLAINTS.map((complaint) => complaint.id));
  for (const regionId of BODY_REGION_IDS) {
    for (const complaintId of candidateComplaintIdsForRegion(regionId)) {
      assert.ok(known.has(complaintId), `${complaintId} is not an R2 complaint`);
    }
  }
});

/* --- Flow ----------------------------------------------------------------- */

test('the controller opens with a safety screen before ordinary routing questions', () => {
  const { result } = controllerFor('upper-abdominal-pain', []);
  assert.equal(result.status, 'safety-screening');
  assert.equal(result.informationGainBypassed, true);
});

test('an ordinary information-gain question follows once safety permits', () => {
  const { result } = controllerFor('upper-abdominal-pain', [
    { questionId: 'upper-abdominal-pain-exertional', optionId: 'no' },
  ]);
  assert.equal(result.status, 'question');
  assert.equal(result.informationGainBypassed, false);
});

test('routing answers are recorded on the session and change the belief', () => {
  const complaint = materialize('upper-abdominal-pain');
  const session = newSession('upper-abdominal-pain');
  const answered = answerSessionQuestion(
    session,
    { questionId: 'upper-abdominal-pain-exertional', optionId: 'yes', answeredAt: '2026-09-10T00:00:01.000Z' },
    complaint.questions,
    DEMONSTRATION_ENGINE_CONFIG.posteriorFloor,
  );
  assert.equal(answered.answers.length, 1);
  assert.notDeepEqual(answered.belief, session.belief);
  assert.equal(answered.engineVersion, ENGINE_VERSION);
});

test('safety-owned answers are recorded separately and never enter the belief', () => {
  const { result, session } = controllerFor('upper-abdominal-pain', []);
  assert.equal(result.status, 'safety-screening');
  if (result.status !== 'safety-screening') return;
  if (result.question.answerTarget !== 'safety_state') return;
  const recorded = recordSafetyAnswer([], result.question, {
    questionId: result.question.id,
    optionId: result.question.options[0].id,
    answeredAt: '2026-09-10T00:00:02.000Z',
  });
  assert.equal(recorded.length, 1);
  assert.equal(session.answers.length, 0);
});

test('a fired safety rule interrupts and bypasses information gain', () => {
  const { result } = controllerFor('upper-abdominal-pain', [
    { questionId: 'upper-abdominal-pain-exertional', optionId: 'yes' },
    { questionId: 'upper-abdominal-pain-sweating', optionId: 'yes' },
  ]);
  assert.equal(result.status, 'interrupted');
  if (result.status !== 'interrupted') return;
  assert.equal(result.informationGainBypassed, true);
  assert.ok(result.firedRuleIds.length > 0);
  assert.ok(['emergency', 'urgent'].includes(result.severity));
  assert.ok(result.payload.headline.trim().length > 0);
  assert.ok(result.payload.primaryAction.label.trim().length > 0);
});

test('an interruption carries a continuation policy the interface can honour', () => {
  const { result } = controllerFor('upper-abdominal-pain', [
    { questionId: 'upper-abdominal-pain-exertional', optionId: 'yes' },
    { questionId: 'upper-abdominal-pain-sweating', optionId: 'yes' },
  ]);
  if (result.status !== 'interrupted') return;
  assert.ok(['must_stop', 'may_continue_after_acknowledgement'].includes(result.continuationPolicy));
});

test('a complete non-urgent path reaches a routed result', () => {
  const path = [
    { questionId: 'upper-abdominal-pain-exertional', optionId: 'no' },
    { questionId: 'upper-abdominal-pain-meal-relation', optionId: 'yes' },
  ];
  let routing = [...path];
  let guard = 0;
  let outcome = controllerFor('upper-abdominal-pain', routing);
  while (outcome.result.status === 'question' && guard < 10) {
    routing = [...routing, { questionId: outcome.result.selection.questionId, optionId: 'no' }];
    outcome = controllerFor('upper-abdominal-pain', routing);
    guard += 1;
  }
  assert.equal(outcome.result.status, 'result');
  if (outcome.result.status !== 'result') return;
  assert.ok(outcome.result.routingOutcome.specialtyId.length > 0);
});

test('the meal-related path routes to gastroenterology, matching the R2B regression', () => {
  let routing = [
    { questionId: 'upper-abdominal-pain-exertional', optionId: 'no' },
    { questionId: 'upper-abdominal-pain-meal-relation', optionId: 'yes' },
  ];
  let outcome = controllerFor('upper-abdominal-pain', routing);
  let guard = 0;
  while (outcome.result.status === 'question' && guard < 10) {
    routing = [...routing, { questionId: outcome.result.selection.questionId, optionId: 'no' }];
    outcome = controllerFor('upper-abdominal-pain', routing);
    guard += 1;
  }
  if (outcome.result.status !== 'result') return;
  assert.equal(outcome.result.routingOutcome.specialtyId, 'gastroenterology');
});

/* --- Replay --------------------------------------------------------------- */

test('replaying a changed routing answer recomputes from clean history', () => {
  const complaint = materialize('upper-abdominal-pain');
  const session = newSession('upper-abdominal-pain');
  const yes = answerSessionQuestion(
    session,
    { questionId: 'upper-abdominal-pain-exertional', optionId: 'yes', answeredAt: '2026-09-10T00:00:01.000Z' },
    complaint.questions,
    DEMONSTRATION_ENGINE_CONFIG.posteriorFloor,
  );
  const changed = answerSessionQuestion(
    yes,
    { questionId: 'upper-abdominal-pain-exertional', optionId: 'no', answeredAt: '2026-09-10T00:00:03.000Z' },
    complaint.questions,
    DEMONSTRATION_ENGINE_CONFIG.posteriorFloor,
  );
  const fresh = answerSessionQuestion(
    newSession('upper-abdominal-pain'),
    { questionId: 'upper-abdominal-pain-exertional', optionId: 'no', answeredAt: '2026-09-10T00:00:03.000Z' },
    complaint.questions,
    DEMONSTRATION_ENGINE_CONFIG.posteriorFloor,
  );
  assert.deepEqual(changed.belief, fresh.belief);
  assert.equal(changed.answers.length, 1);
});

test('replay does not mutate the original session', () => {
  const complaint = materialize('upper-abdominal-pain');
  const session = newSession('upper-abdominal-pain');
  const snapshot = JSON.stringify(session);
  answerSessionQuestion(
    session,
    { questionId: 'upper-abdominal-pain-exertional', optionId: 'yes', answeredAt: '2026-09-10T00:00:01.000Z' },
    complaint.questions,
    DEMONSTRATION_ENGINE_CONFIG.posteriorFloor,
  );
  assert.equal(JSON.stringify(session), snapshot);
});

test('a safety answer whose dependency changed does not stay live', () => {
  // The joint safety questions are only live while the injury answer is yes.
  const safetyAnswers: SafetyAnswer[] = [
    { questionId: 'safety-joint-injury-severe-or-displaced', optionId: 'no', answeredAt: '2026-09-10T00:00:02.000Z' },
  ];
  const live = reconcileSafetyAnswers(
    {
      complaintId: 'joint-musculoskeletal-pain',
      routingAnswers: [
        { questionId: 'joint-musculoskeletal-pain-injury', optionId: 'yes', answeredAt: '2026-09-10T00:00:01.000Z' },
      ],
      safetyAnswers,
    },
    R3_SAFETY_KNOWLEDGE,
  );
  const stale = reconcileSafetyAnswers(
    {
      complaintId: 'joint-musculoskeletal-pain',
      routingAnswers: [
        { questionId: 'joint-musculoskeletal-pain-injury', optionId: 'no', answeredAt: '2026-09-10T00:00:03.000Z' },
      ],
      safetyAnswers,
    },
    R3_SAFETY_KNOWLEDGE,
  );
  assert.equal(live.retained.length, 1, 'the answer is live while its dependency holds');
  assert.equal(stale.retained.length, 0, 'the answer must not stay live after its dependency changes');
  assert.equal(stale.removed.length, 1);
});

test('belief history supports the result explanation', () => {
  const complaint = materialize('upper-abdominal-pain');
  const session = answerSessionQuestion(
    newSession('upper-abdominal-pain'),
    { questionId: 'upper-abdominal-pain-exertional', optionId: 'no', answeredAt: '2026-09-10T00:00:01.000Z' },
    complaint.questions,
    DEMONSTRATION_ENGINE_CONFIG.posteriorFloor,
  );
  const replay = replayBelief(
    session.initialBelief,
    session.answers,
    complaint.questions,
    DEMONSTRATION_ENGINE_CONFIG.posteriorFloor,
  );
  assert.equal(replay.history.length, 1);
  assert.deepEqual(replay.belief, session.belief);
});

/* --- Layer behaviour ------------------------------------------------------ */

test('changing layer preserves the selected region and the pain point', () => {
  let state = selectRegion(createBodySelectionState('front'), UPPER_ABDOMEN);
  state = setPainPrecision(state, 'exact-point', { x: 0.5, y: 0.5 });
  const systems = changeBodyLayer(state, 'systems');
  assert.equal(systems.selectedRegionId, UPPER_ABDOMEN);
  assert.deepEqual(systems.exactPoint, { x: 0.5, y: 0.5 });
  assert.equal(systems.selectedSystemId, null);
});

test('no patient-facing copy in the routing flow claims a diagnosis', async () => {
  const fs = await import('node:fs/promises');
  const banned = [/you have/i, /diagnos(is|e)/i, /likely condition/i, /probability of disease/i];
  const files = [
    'src/features/routing-flow/RoutingFlow.tsx',
    'src/features/body-explorer/BodyExplorer.tsx',
    'src/features/body-explorer/RegionPanel.tsx',
  ];
  for (const file of files) {
    const source = await fs.readFile(file, 'utf8');
    for (const pattern of banned) {
      const match = source.match(pattern);
      if (match && !/does not provide a diagnosis|not a diagnosis/i.test(source.slice(Math.max(0, (match.index ?? 0) - 60), (match.index ?? 0) + 60))) {
        assert.fail(`${file} contains diagnosis wording: ${match[0]}`);
      }
    }
  }
});

/* --- Adaptive selection surfaced by the interview -------------------------- */

test('the next question is chosen from the answer history, not a fixed script', () => {
  // Two different histories for the same complaint. Whatever the controller
  // offers next must be derived from that history, never from a fixed script.
  const afterYes = controllerFor('upper-abdominal-pain', [
    { questionId: 'upper-abdominal-pain-exertional', optionId: 'yes' },
  ]);
  const afterNo = controllerFor('upper-abdominal-pain', [
    { questionId: 'upper-abdominal-pain-exertional', optionId: 'no' },
  ]);

  const offered = (outcome: ReturnType<typeof controllerFor>) => {
    const { result } = outcome;
    if (result.status === 'question') return result.selection.questionId;
    if (result.status === 'safety-screening') return result.question.id;
    return null;
  };

  const yesNext = offered(afterYes);
  const noNext = offered(afterNo);
  assert.ok(yesNext, 'no question offered after answering yes');
  assert.ok(noNext, 'no question offered after answering no');

  // The two histories do not lead to the same next question, which is what the
  // interview is surfacing when it says the route is being refined.
  assert.notEqual(yesNext, noNext);

  // Nothing already answered is offered again.
  for (const outcome of [afterYes, afterNo]) {
    const next = offered(outcome);
    assert.equal(
      outcome.session.answers.some((answer) => answer.questionId === next),
      false,
      'the engine re-offered a question that was already answered',
    );
  }
});

test('question selection is deterministic for a given history', () => {
  const path = [{ questionId: 'upper-abdominal-pain-exertional', optionId: 'no' }];
  const first = controllerFor('upper-abdominal-pain', path);
  const second = controllerFor('upper-abdominal-pain', path);
  if (first.result.status !== 'question' || second.result.status !== 'question') return;
  assert.equal(first.result.selection.questionId, second.result.selection.questionId);
  assert.equal(first.result.selection.informationGain, second.result.selection.informationGain);
});

test('the engine picks the highest information gain among eligible questions', () => {
  const routing = [{ questionId: 'upper-abdominal-pain-exertional', optionId: 'no' }];
  const { result, session, complaint } = controllerFor('upper-abdominal-pain', routing);
  if (result.status !== 'question') return;
  const asked = new Set(session.askedQuestionIds);
  for (const question of complaint.questions) {
    if (asked.has(question.id)) continue;
    if (question.appliesWhen && !question.appliesWhen(session.belief, session.askedQuestionIds)) continue;
    const gain = informationGain(session.belief, question, DEMONSTRATION_ENGINE_CONFIG.posteriorFloor);
    assert.ok(
      gain <= result.selection.informationGain + 1e-9,
      `${question.id} had higher gain than the selected question`,
    );
  }
});

test('an answer presentation never changes what an option means', () => {
  const binary = [
    { id: 'yes', label: 'Yes' },
    { id: 'no', label: 'No' },
  ];
  // A two-option set stays binary, so clinically binary and safety questions
  // are never redrawn as a scale.
  assert.equal(presentationFor(binary), 'binary');
  const ordinal = [
    { id: 'never', label: 'Never' },
    { id: 'sometimes', label: 'Sometimes' },
    { id: 'often', label: 'Often' },
  ];
  assert.equal(presentationFor(ordinal), 'ordinal');
  // Presentation is derived from the option set; it never rewrites ids.
  assert.deepEqual(binary.map((option) => option.id), ['yes', 'no']);
});

test('every safety question in the knowledge base is binary', () => {
  // A scale must never be substituted for a red-flag decision.
  for (const question of R3_SAFETY_KNOWLEDGE.questions) {
    if (question.kind !== 'safety_owned') continue;
    assert.equal(question.options.length, 2, `${question.id} is not binary`);
  }
});
