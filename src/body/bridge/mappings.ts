import { R2B_DEMONSTRATION_COMPLAINTS } from '../../engine/data/demonstration/complaints.ts';
import { KNOWLEDGE_VERSION } from '../../engine/data/version.ts';
import { BODY_DOMAIN } from '../domain.ts';
import type { BodyRegionId } from '../ids.ts';
import { BODY_DOMAIN_VERSION } from '../version.ts';
import type { BodyRoutingBridgeDefinition, BodyRoutingMapping, BridgeProvenanceSource } from './types.ts';
import { BRIDGE_VERSION } from './version.ts';

export const BODY_BRIDGE_PRODUCT_SOURCE_ID = 'docmatch-body-complaint-taxonomy-r4';

export const BODY_BRIDGE_PROVENANCE: readonly BridgeProvenanceSource[] = [
  {
    id: BODY_BRIDGE_PRODUCT_SOURCE_ID,
    organization: 'DocMatch+',
    title: 'Body Domain and Body-to-Routing Bridge approved product semantics',
    reference: 'Founder implementation brief',
    locator: 'Sections 24-29',
    relationshipSupported: 'Conservative association of semantic body regions with existing presenting-complaint choices.',
    reviewStatus: 'reviewed',
    version: BRIDGE_VERSION,
  },
];

function existingR2ComplaintId(expectedId: string): string {
  const complaint = R2B_DEMONSTRATION_COMPLAINTS.find((candidate) => candidate.id === expectedId);
  if (!complaint) throw new TypeError(`Required R2 complaint ${expectedId} is unavailable.`);
  return complaint.id;
}

export const BODY_BRIDGE_COMPLAINT_IDS = {
  headache: existingR2ComplaintId('headache'),
  jointMusculoskeletalPain: existingR2ComplaintId('joint-musculoskeletal-pain'),
  upperAbdominalPain: existingR2ComplaintId('upper-abdominal-pain'),
} as const;

const MUSCULOSKELETAL_REGION_IDS = new Set<BodyRegionId>([
  'neck',
  'upper-back',
  'lower-back',
  'left-shoulder',
  'right-shoulder',
  'left-upper-arm',
  'right-upper-arm',
  'left-elbow',
  'right-elbow',
  'left-forearm',
  'right-forearm',
  'left-wrist',
  'right-wrist',
  'left-hand',
  'right-hand',
  'left-hip',
  'right-hip',
  'left-thigh',
  'right-thigh',
  'left-knee',
  'right-knee',
  'left-lower-leg',
  'right-lower-leg',
  'left-ankle',
  'right-ankle',
  'left-foot',
  'right-foot',
]);

function mappingForRegion(regionId: BodyRegionId): BodyRoutingMapping | null {
  let complaintId: string | null = null;
  if (regionId === 'head') complaintId = BODY_BRIDGE_COMPLAINT_IDS.headache;
  else if (regionId === 'upper-abdomen') complaintId = BODY_BRIDGE_COMPLAINT_IDS.upperAbdominalPain;
  else if (MUSCULOSKELETAL_REGION_IDS.has(regionId)) complaintId = BODY_BRIDGE_COMPLAINT_IDS.jointMusculoskeletalPain;
  return complaintId === null
    ? null
    : { regionId, complaintIds: [complaintId], provenanceIds: [BODY_BRIDGE_PRODUCT_SOURCE_ID] };
}

export const BODY_ROUTING_MAPPINGS: readonly BodyRoutingMapping[] = BODY_DOMAIN.regions
  .map((region) => mappingForRegion(region.id))
  .filter((mapping): mapping is BodyRoutingMapping => mapping !== null);

export const BODY_ROUTING_BRIDGE: BodyRoutingBridgeDefinition = {
  bridgeVersion: BRIDGE_VERSION,
  compatibleBodyDomainVersion: BODY_DOMAIN_VERSION,
  compatibleKnowledgeVersion: KNOWLEDGE_VERSION,
  mappings: BODY_ROUTING_MAPPINGS,
  provenanceSources: BODY_BRIDGE_PROVENANCE,
};
