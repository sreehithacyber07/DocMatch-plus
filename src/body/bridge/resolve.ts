import { BODY_DOMAIN } from '../domain.ts';
import type { BodyRegionId } from '../ids.ts';
import { validatePainLocation } from '../pain-location.ts';
import type { BodyDomainDefinition } from '../types.ts';
import { BODY_ROUTING_BRIDGE } from './mappings.ts';
import type {
  BodyRoutingBridgeDefinition,
  ComplaintCandidateResolution,
  PainLocationBridgeInput,
} from './types.ts';

export function resolveCandidateComplaints(
  regionId: string,
  bridge: Readonly<BodyRoutingBridgeDefinition> = BODY_ROUTING_BRIDGE,
  domain: Readonly<BodyDomainDefinition> = BODY_DOMAIN,
): ComplaintCandidateResolution {
  if (!domain.regions.some((region) => region.id === regionId)) {
    return { status: 'unknown-region', regionId, complaintIds: [] };
  }
  const mapping = bridge.mappings.find((candidate) => candidate.regionId === regionId);
  if (!mapping) return { status: 'unmapped', regionId: regionId as BodyRegionId, complaintIds: [] };
  return { status: 'mapped', regionId: mapping.regionId, complaintIds: [...mapping.complaintIds] };
}
export function candidateComplaintIdsForRegion(regionId: BodyRegionId): string[] {
  return [...resolveCandidateComplaints(regionId).complaintIds];
}

export function candidateComplaintIdsForPainLocation(location: PainLocationBridgeInput): string[] {
  const validation = validatePainLocation(location);
  if (!validation.valid) throw new TypeError(validation.errors.map((issue) => `${issue.path}: ${issue.message}`).join('\n'));
  return candidateComplaintIdsForRegion(location.regionId);
}
