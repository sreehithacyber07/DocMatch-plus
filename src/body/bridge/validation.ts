import type { KnowledgeBase } from '../../engine/data/types.ts';
import { BODY_DOMAIN } from '../domain.ts';
import type { BodyDomainDefinition } from '../types.ts';
import { BODY_ROUTING_BRIDGE } from './mappings.ts';
import type {
  BodyRoutingBridgeDefinition,
  BridgeValidationIssue,
  BridgeValidationReport,
} from './types.ts';

function issue(code: string, path: string, message: string): BridgeValidationIssue {
  return { code, path, message };
}

function duplicateValues(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates].toSorted();
}

const FORBIDDEN_BRIDGE_KEYS = new Set([
  'specialtyId',
  'specialtyIds',
  'prior',
  'priors',
  'likelihood',
  'likelihoods',
  'belief',
  'beliefs',
  'redFlagRuleId',
  'redFlagRuleIds',
  'safetyRuleId',
  'safetyRuleIds',
]);

function forbiddenKeyPaths(value: unknown, path = 'bridge'): string[] {
  if (typeof value !== 'object' || value === null) return [];
  if (Array.isArray(value)) return value.flatMap((entry, index) => forbiddenKeyPaths(entry, `${path}[${index}]`));
  return Object.entries(value).flatMap(([key, entry]) => [
    ...(FORBIDDEN_BRIDGE_KEYS.has(key) ? [`${path}.${key}`] : []),
    ...forbiddenKeyPaths(entry, `${path}.${key}`),
  ]);
}

export function validateBodyRoutingBridge(
  bridge: Readonly<BodyRoutingBridgeDefinition>,
  domain: Readonly<BodyDomainDefinition>,
  knowledge: Readonly<KnowledgeBase>,
): BridgeValidationReport {
  const errors: BridgeValidationIssue[] = [];
  if (bridge.bridgeVersion.trim().length === 0) errors.push(issue('MISSING_BRIDGE_VERSION', 'bridgeVersion', 'Bridge version is required.'));
  if (bridge.compatibleBodyDomainVersion !== domain.bodyDomainVersion) errors.push(issue('BODY_DOMAIN_VERSION_MISMATCH', 'compatibleBodyDomainVersion', 'Bridge body-domain version is incompatible.'));
  if (bridge.compatibleKnowledgeVersion !== knowledge.knowledgeVersion) errors.push(issue('KNOWLEDGE_VERSION_MISMATCH', 'compatibleKnowledgeVersion', 'Bridge knowledge version is incompatible.'));

  const regionIds = new Set(domain.regions.map((region) => region.id));
  const complaintOrder = new Map(knowledge.complaints.map((complaint, index) => [complaint.id, index]));
  const provenanceIds = new Set(bridge.provenanceSources.map((source) => source.id));
  for (const duplicate of duplicateValues(bridge.provenanceSources.map((source) => source.id))) errors.push(issue('DUPLICATE_PROVENANCE_ID', 'provenanceSources', `Duplicate bridge provenance ID ${duplicate}.`));
  bridge.provenanceSources.forEach((source, index) => {
    if ([source.id, source.organization, source.title, source.reference, source.locator, source.relationshipSupported, source.version].some((value) => value.trim().length === 0)) {
      errors.push(issue('INCOMPLETE_PROVENANCE', `provenanceSources[${index}]`, 'Bridge provenance must be complete.'));
    }
  });

  const mappingRegionIds = bridge.mappings.map((mapping) => mapping.regionId);
  for (const duplicate of duplicateValues(mappingRegionIds)) errors.push(issue('DUPLICATE_REGION_MAPPING', 'mappings', `Duplicate mapping for region ${duplicate}.`));
  const domainOrder = new Map(domain.regions.map((region, index) => [region.id, index]));
  let previousRegionOrder = -1;
  bridge.mappings.forEach((mapping, index) => {
    const path = `mappings[${index}]`;
    if (!regionIds.has(mapping.regionId)) errors.push(issue('UNKNOWN_REGION', `${path}.regionId`, `Unknown body region ${mapping.regionId}.`));
    const currentRegionOrder = domainOrder.get(mapping.regionId) ?? Number.MAX_SAFE_INTEGER;
    if (currentRegionOrder <= previousRegionOrder) errors.push(issue('NONDETERMINISTIC_REGION_ORDER', path, 'Mappings must follow canonical body-region order.'));
    previousRegionOrder = currentRegionOrder;
    if (mapping.complaintIds.length === 0) errors.push(issue('EMPTY_MAPPING', `${path}.complaintIds`, 'Mapped regions require at least one complaint.'));
    for (const duplicate of duplicateValues(mapping.complaintIds)) errors.push(issue('DUPLICATE_COMPLAINT_MAPPING', `${path}.complaintIds`, `Duplicate complaint ${duplicate}.`));
    let previousComplaintOrder = -1;
    for (const complaintId of mapping.complaintIds) {
      const currentComplaintOrder = complaintOrder.get(complaintId);
      if (currentComplaintOrder === undefined) errors.push(issue('UNKNOWN_COMPLAINT', `${path}.complaintIds`, `Complaint ${complaintId} does not exist in R2.`));
      else if (currentComplaintOrder <= previousComplaintOrder) errors.push(issue('NONDETERMINISTIC_COMPLAINT_ORDER', `${path}.complaintIds`, 'Complaint IDs must follow the R2 knowledge order.'));
      else previousComplaintOrder = currentComplaintOrder;
    }
    if (mapping.provenanceIds.length === 0) errors.push(issue('MISSING_MAPPING_PROVENANCE', `${path}.provenanceIds`, 'Every mapping requires provenance.'));
    for (const sourceId of mapping.provenanceIds) if (!provenanceIds.has(sourceId)) errors.push(issue('UNKNOWN_PROVENANCE', `${path}.provenanceIds`, `Unknown bridge provenance ${sourceId}.`));
  });

  for (const path of forbiddenKeyPaths(bridge)) errors.push(issue('FORBIDDEN_ROUTING_CONCERN', path, 'The body bridge cannot own specialty, Bayesian, or safety fields.'));
  const knowledgeCompatible = !errors.some((candidate) => ['UNKNOWN_COMPLAINT', 'KNOWLEDGE_VERSION_MISMATCH'].includes(candidate.code));
  return { structureValid: errors.length === 0, knowledgeCompatible, errors };
}
export function validateCurrentBodyRoutingBridge(knowledge: Readonly<KnowledgeBase>): BridgeValidationReport {
  return validateBodyRoutingBridge(BODY_ROUTING_BRIDGE, BODY_DOMAIN, knowledge);
}

export function assertBodyRoutingBridgeValid(
  bridge: Readonly<BodyRoutingBridgeDefinition>,
  domain: Readonly<BodyDomainDefinition>,
  knowledge: Readonly<KnowledgeBase>,
): void {
  const report = validateBodyRoutingBridge(bridge, domain, knowledge);
  if (!report.structureValid || !report.knowledgeCompatible) throw new TypeError(report.errors.map((candidate) => `${candidate.path}: ${candidate.message}`).join('\n'));
}
