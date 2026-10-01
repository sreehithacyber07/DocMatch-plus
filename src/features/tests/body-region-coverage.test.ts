import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { BODY_DOMAIN, regionAvailableInView } from '../../body/index.ts';
import { resolveArtwork } from '../body-explorer/artwork/registry.ts';
import { FACE_HIT_REGIONS } from '../body-explorer/faceHitMap.ts';
import { FACE_SUBREGION_CONTRACTS, REGION_INTAKE_CONTRACTS } from '../body-explorer/regionIntakeContract.ts';
import { groupForRegion } from '../body-explorer/regionGroups.ts';

test('every selectable body leaf has one truthful intake contract and male/female layer parity', () => {
  assert.equal(BODY_DOMAIN.regions.length, 33);
  assert.equal(Object.keys(REGION_INTAKE_CONTRACTS).length, BODY_DOMAIN.regions.length);
  for (const region of BODY_DOMAIN.regions) {
    const contract = REGION_INTAKE_CONTRACTS[region.id];
    assert.ok(contract, `missing contract: ${region.id}`);
    assert.equal(contract.regionId, region.id);
    assert.equal(contract.patientLabel, region.label);
    assert.equal(contract.parentRegionId, groupForRegion(region.id)?.id);
    assert.equal(contract.laterality, region.laterality);
    assert.equal(contract.supportsGeneralArea, true);
    assert.equal(contract.supportsExactPoint, true);
    assert.equal(contract.faceMode, region.id === 'face');
    if (!contract.complaintEntryAvailable) assert.ok(contract.pendingClinicalReason?.length);
    for (const view of ['front', 'back'] as const) {
      if (!regionAvailableInView(region, view)) continue;
      for (const variant of ['male', 'female'] as const) {
        for (const layer of ['hologram', 'systems', 'structures'] as const) {
          const art = resolveArtwork(variant, view, layer);
          assert.ok(art.entry.assetRef, `${variant} ${layer} ${view} has no artwork`);
          assert.ok(art.hitMap.regions.some((hit) => hit.regionId === region.id),
            `${variant} ${layer} ${view} cannot select ${region.id}`);
        }
      }
    }
  }
});

test('face and lower abdomen remain distinct and have complaint-entry coverage', () => {
  for (const id of ['face', 'lower-abdomen', 'pelvis'] as const) {
    assert.equal(REGION_INTAKE_CONTRACTS[id].complaintEntryAvailable, true);
    assert.equal(REGION_INTAKE_CONTRACTS[id].pendingClinicalReason, undefined);
  }
  assert.notEqual(REGION_INTAKE_CONTRACTS.face.regionId, REGION_INTAKE_CONTRACTS.head.regionId);
  assert.notEqual(REGION_INTAKE_CONTRACTS.face.regionId, REGION_INTAKE_CONTRACTS.neck.regionId);
  assert.notEqual(REGION_INTAKE_CONTRACTS['lower-abdomen'].regionId, REGION_INTAKE_CONTRACTS['upper-abdomen'].regionId);
});

test('all 16 face regions share one parent and no specialty shortcut', () => {
  assert.equal(FACE_HIT_REGIONS.length, 16);
  assert.equal(Object.keys(FACE_SUBREGION_CONTRACTS).length, 16);
  for (const region of FACE_HIT_REGIONS) {
    const contract = FACE_SUBREGION_CONTRACTS[region.id];
    assert.equal(contract.parentRegionId, 'face');
    assert.equal(contract.patientLabel, region.label);
    assert.equal(contract.complaintEntryAvailable, true);
    assert.equal(contract.faceMode, true);
  }
});

/**
 * Every region gets the same confirmation action, with no dead-end redirect.
 *
 * The confirmation button used to branch by region: a resolved region called
 * `onConfirm` with a bridge-matched complaint id, an unmapped one called a
 * separate `onUnsupported` handler, and the label changed between them
 * ("Confirm concern" vs "Confirm breathing concern" vs a "different concern:
 * ask the care team" dead end on Chest specifically). All three branches
 * opened the same concern-type step regardless, so the branching only ever
 * produced misleading copy - it never chose a complaint from location alone.
 * One handler, one label, asked of every region, removes that without
 * changing what pressing it does.
 */
test('every selection reaches the same confirmation action without nearby redirects', async () => {
  const panels = await readFile('src/features/body-explorer/ContextPanels.tsx', 'utf8');
  const explorer = await readFile('src/features/body-explorer/BodyExplorer.tsx', 'utf8');
  assert.match(panels, /onConfirm/);
  assert.match(explorer, /Confirm location/);
  assert.doesNotMatch(panels, /onUnsupported/);
  assert.doesNotMatch(panels, /Nearby covered areas|There is no question set|Pending review/);
  assert.doesNotMatch(explorer, /Review nearby areas/);
  // Location is never presented as if it were the concern, on any region.
  assert.doesNotMatch(panels, /Confirm breathing concern|ask care team|ask the care team/i);
});
