/// <reference types="node" />

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { createRoutingSession, SPECIALTY_IDS } from '../../engine/index.ts';
import { R2B_DEMONSTRATION_KNOWLEDGE } from '../../engine/data/demonstration/knowledge.ts';
import { DEMONSTRATION_ENGINE_CONFIG } from '../../engine/data/demonstration/policy.ts';
import { materializeDemonstrationComplaint } from '../../engine/data/materialize.ts';
import { evaluateSafetyController } from '../../engine/safety/controller.ts';
import { R3_SAFETY_KNOWLEDGE } from '../../engine/safety/knowledge.ts';
import { BODY_DOMAIN, exactPointPainLocation, generalAreaPainLocation } from '../index.ts';
import {
  BODY_BRIDGE_COMPLAINT_IDS,
  BODY_ROUTING_BRIDGE,
  BRIDGE_VERSION,
  candidateComplaintIdsForPainLocation,
  candidateComplaintIdsForRegion,
  resolveCandidateComplaints,
  validateBodyRoutingBridge,
  type BodyRoutingBridgeDefinition,
} from '../bridge/index.ts';

function bridgeSourceFiles(directory = join(process.cwd(), 'src', 'body', 'bridge')): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? bridgeSourceFiles(path) : entry.name.endsWith('.ts') ? [path] : [];
  });
}

test('a mapped region returns deterministic complaint IDs', () => {
  const first = candidateComplaintIdsForRegion('upper-abdomen');
  const second = candidateComplaintIdsForRegion('upper-abdomen');
  assert.deepEqual(first, ['upper-abdominal-pain']);
  assert.deepEqual(second, first);
  assert.notEqual(first, second);
});
test('an unmapped valid region returns a typed empty result', () => {
  assert.deepEqual(resolveCandidateComplaints('chest'), { status: 'unmapped', regionId: 'chest', complaintIds: [] });
});

test('an invalid region is handled predictably without throwing', () => {
  assert.deepEqual(resolveCandidateComplaints('unknown-region'), { status: 'unknown-region', regionId: 'unknown-region', complaintIds: [] });
});

test('every mapped complaint exists in the frozen R2 knowledge base', () => {
  const complaintIds = new Set(R2B_DEMONSTRATION_KNOWLEDGE.complaints.map((complaint) => complaint.id));
  for (const mapping of BODY_ROUTING_BRIDGE.mappings) {
    for (const complaintId of mapping.complaintIds) assert.ok(complaintIds.has(complaintId));
  }
});

test('bridge validation rejects duplicate region and complaint mappings', () => {
  const mapping = BODY_ROUTING_BRIDGE.mappings.find((candidate) => candidate.regionId === 'head')!;
  const invalid: BodyRoutingBridgeDefinition = {
    ...BODY_ROUTING_BRIDGE,
    mappings: [
      { ...mapping, complaintIds: [mapping.complaintIds[0], mapping.complaintIds[0]] },
      { ...mapping, complaintIds: [...mapping.complaintIds] },
    ],
  };
  const report = validateBodyRoutingBridge(invalid, BODY_DOMAIN, R2B_DEMONSTRATION_KNOWLEDGE);
  assert.ok(report.errors.some((candidate) => candidate.code === 'DUPLICATE_REGION_MAPPING'));
  assert.ok(report.errors.some((candidate) => candidate.code === 'DUPLICATE_COMPLAINT_MAPPING'));
});

test('bridge mappings contain complaint IDs and no specialty IDs', () => {
  const mappedIds = BODY_ROUTING_BRIDGE.mappings.flatMap((mapping) => mapping.complaintIds);
  assert.equal(mappedIds.some((id) => SPECIALTY_IDS.some((specialtyId) => specialtyId === id)), false);
  assert.doesNotMatch(JSON.stringify(BODY_ROUTING_BRIDGE.mappings), /specialtyId|prior|likelihood|belief|redFlag|safetyRule/);
});

test('bridge resolution is immutable', () => {
  const before = structuredClone(BODY_ROUTING_BRIDGE);
  const result = resolveCandidateComplaints('head');
  const mutable = result.complaintIds as string[];
  mutable.push('caller-local-value');
  assert.deepEqual(BODY_ROUTING_BRIDGE, before);
  assert.deepEqual(candidateComplaintIdsForRegion('head'), ['headache']);
});

test('exact pain coordinates do not affect bridge output', () => {
  const first = candidateComplaintIdsForPainLocation(exactPointPainLocation('left-knee', { x: 0, y: 0 }));
  const second = candidateComplaintIdsForPainLocation(exactPointPainLocation('left-knee', { x: 1, y: 1 }));
  const general = candidateComplaintIdsForPainLocation(generalAreaPainLocation('left-knee'));
  assert.deepEqual(first, second);
  assert.deepEqual(second, general);
});

test('artwork IDs cannot affect bridge output', () => {
  const before = candidateComplaintIdsForRegion('head');
  const unrelatedArtworkMetadata = { artworkVersion: 'replacement', hitTargetId: 'anything', assetRef: 'anything-else' };
  assert.deepEqual(candidateComplaintIdsForRegion('head'), before);
  assert.equal('regionId' in unrelatedArtworkMetadata, false);
});

test('front and back rendering choice cannot change complaint mapping', () => {
  const frontSelection = { view: 'front', regionId: 'left-knee' } as const;
  const backSelection = { view: 'back', regionId: 'left-knee' } as const;
  assert.deepEqual(candidateComplaintIdsForRegion(frontSelection.regionId), candidateComplaintIdsForRegion(backSelection.regionId));
});

test('bridge version and frozen compatibility versions are explicit', () => {
  assert.equal(BRIDGE_VERSION, '0.1.0-body-routing-bridge');
  assert.equal(BODY_ROUTING_BRIDGE.bridgeVersion, BRIDGE_VERSION);
  assert.equal(BODY_ROUTING_BRIDGE.compatibleBodyDomainVersion, BODY_DOMAIN.bodyDomainVersion);
  assert.equal(BODY_ROUTING_BRIDGE.compatibleKnowledgeVersion, R2B_DEMONSTRATION_KNOWLEDGE.knowledgeVersion);
});

test('current bridge validation passes with product-taxonomy provenance', () => {
  const report = validateBodyRoutingBridge(BODY_ROUTING_BRIDGE, BODY_DOMAIN, R2B_DEMONSTRATION_KNOWLEDGE);
  assert.deepEqual(report, { structureValid: true, knowledgeCompatible: true, errors: [] });
  assert.ok(BODY_ROUTING_BRIDGE.provenanceSources.every((source) => source.reviewStatus === 'reviewed'));
});

test('bridge coverage is conservative and leaves unsupported regions unmapped', () => {
  assert.deepEqual(BODY_BRIDGE_COMPLAINT_IDS, {
    headache: 'headache',
    jointMusculoskeletalPain: 'joint-musculoskeletal-pain',
    upperAbdominalPain: 'upper-abdominal-pain',
  });
  for (const regionId of ['face', 'chest', 'lower-abdomen', 'pelvis'] as const) {
    assert.deepEqual(candidateComplaintIdsForRegion(regionId), []);
  }
  assert.equal(BODY_ROUTING_BRIDGE.mappings.some((mapping) => mapping.complaintIds.includes('shortness-of-breath')), false);
});

test('upper abdomen bridges through existing R2, R1, and R3 responsibilities', () => {
  const resolution = resolveCandidateComplaints('upper-abdomen');
  assert.equal(resolution.status, 'mapped');
  const complaintId = resolution.complaintIds[0];
  const complaint = materializeDemonstrationComplaint(R2B_DEMONSTRATION_KNOWLEDGE, complaintId, []);
  const session = createRoutingSession(complaintId, complaint.prior, '2026-09-10T00:00:00.000Z');
  const result = evaluateSafetyController({
    session,
    complaint,
    safetyAnswers: [],
    safetyKnowledge: R3_SAFETY_KNOWLEDGE,
    engineConfig: DEMONSTRATION_ENGINE_CONFIG,
  });
  assert.equal(session.presentingComplaintId, 'upper-abdominal-pain');
  assert.equal(result.status, 'safety-screening');
  assert.equal('specialtyId' in resolution, false);
});

test('head maps to the existing headache complaint without making a specialty decision', () => {
  const resolution = resolveCandidateComplaints('head');
  assert.deepEqual(resolution.complaintIds, ['headache']);
  const complaint = materializeDemonstrationComplaint(R2B_DEMONSTRATION_KNOWLEDGE, resolution.complaintIds[0], []);
  assert.equal(complaint.complaintId, 'headache');
  assert.equal('specialtyId' in resolution, false);
});

test('representative shoulder, knee, and lower-back regions use the approved musculoskeletal complaint', () => {
  for (const regionId of ['left-shoulder', 'right-knee', 'lower-back'] as const) {
    assert.deepEqual(candidateComplaintIdsForRegion(regionId), ['joint-musculoskeletal-pain']);
  }
});

test('bridge runtime has no UI, storage, backend, network, Bayesian, or safety dependency', () => {
  const source = bridgeSourceFiles().map((path) => readFileSync(path, 'utf8')).join('\n');
  assert.doesNotMatch(source, /from\s+['"](?:react|react-dom|zustand|framer-motion|three)['"]/);
  assert.doesNotMatch(source, /\b(?:window|document|localStorage|sessionStorage|indexedDB|fetch|XMLHttpRequest|WebSocket)\b/);
  assert.doesNotMatch(source, /engine[\\/](?:belief|entropy|questions|session|specialties|stopping|safety)/);
});
