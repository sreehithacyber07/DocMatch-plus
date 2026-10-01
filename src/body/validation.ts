import {
  BODY_LATERALITY_IDS,
  BODY_LAYER_IDS,
  BODY_REGION_GROUP_IDS,
  BODY_REGION_IDS,
  BODY_VIEW_IDS,
} from './ids.ts';
import { regionAvailableInView } from './regions.ts';
import type { BodyDomainDefinition, BodyDomainValidationReport, BodyValidationIssue } from './types.ts';

function duplicateValues(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates].toSorted();
}

function error(code: string, path: string, message: string): BodyValidationIssue {
  return { code, path, message };
}

function validateMembershipStatus(
  domain: Readonly<BodyDomainDefinition>,
  kind: 'system' | 'structure',
  sourceIds: ReadonlySet<string>,
  errors: BodyValidationIssue[],
  blockers: BodyValidationIssue[],
): void {
  const status = kind === 'system' ? domain.systemMembershipStatus : domain.structureMembershipStatus;
  const entries = kind === 'system' ? domain.systems : domain.structures;
  const path = `${kind}MembershipStatus`;
  if (status.status === 'blocked') {
    if (status.reason.trim().length === 0 || status.requiredEvidence.trim().length === 0) {
      errors.push(error('INCOMPLETE_BLOCKED_STATUS', path, `Blocked ${kind} membership must state a reason and required evidence.`));
    }
    if (entries.length > 0) {
      errors.push(error('BLOCKED_DATA_MATERIALIZED', kind === 'system' ? 'systems' : 'structures', `Blocked ${kind} membership cannot contain materialized entries.`));
    }
    blockers.push(error(
      kind === 'system' ? 'SYSTEM_MEMBERSHIP_EVIDENCE_REQUIRED' : 'STRUCTURE_MEMBERSHIP_EVIDENCE_REQUIRED',
      path,
      status.reason,
    ));
    return;
  }
  if (status.provenanceIds.length === 0) errors.push(error('READY_STATUS_MISSING_PROVENANCE', `${path}.provenanceIds`, `Ready ${kind} membership requires provenance.`));
  for (const sourceId of status.provenanceIds) {
    if (!sourceIds.has(sourceId)) errors.push(error('UNKNOWN_PROVENANCE', `${path}.provenanceIds`, `Unknown provenance source ${sourceId}.`));
  }
}

export function validateBodyDomain(domain: Readonly<BodyDomainDefinition>): BodyDomainValidationReport {
  const errors: BodyValidationIssue[] = [];
  const blockers: BodyValidationIssue[] = [];
  if (domain.bodyDomainVersion.trim().length === 0) errors.push(error('MISSING_BODY_DOMAIN_VERSION', 'bodyDomainVersion', 'Body domain version is required.'));

  const regionIds = domain.regions.map((region) => region.id);
  for (const duplicate of duplicateValues(regionIds)) errors.push(error('DUPLICATE_REGION_ID', 'regions', `Duplicate region ID ${duplicate}.`));
  for (const requiredId of BODY_REGION_IDS) {
    if (!regionIds.includes(requiredId)) errors.push(error('MISSING_REQUIRED_REGION', 'regions', `Missing required body region ${requiredId}.`));
  }
  for (const regionId of regionIds) {
    if (!BODY_REGION_IDS.includes(regionId)) errors.push(error('UNAPPROVED_REGION_ID', 'regions', `Region ${regionId} is outside the approved canonical set.`));
  }
  const regionById = new Map(domain.regions.map((region) => [region.id, region]));
  domain.regions.forEach((region, index) => {
    const path = `regions[${index}]`;
    if (!/^[a-z]+(?:-[a-z]+)*$/.test(region.id) || /(?:^|-)(?:svg|path|dom|element)(?:-|$)/.test(region.id)) {
      errors.push(error('NON_SEMANTIC_REGION_ID', `${path}.id`, `Region ID ${region.id} must be stable semantic anatomy, independent of artwork or DOM IDs.`));
    }
    if (region.label.trim().length === 0) errors.push(error('EMPTY_REGION_LABEL', `${path}.label`, 'Every region requires a patient-readable label.'));
    if (!BODY_LATERALITY_IDS.includes(region.laterality)) errors.push(error('INVALID_LATERALITY', `${path}.laterality`, `Invalid laterality for ${region.id}.`));
    if (!BODY_REGION_GROUP_IDS.includes(region.groupId)) errors.push(error('INVALID_REGION_GROUP', `${path}.groupId`, `Invalid group for ${region.id}.`));
    if (![...BODY_VIEW_IDS, 'both'].includes(region.viewAvailability)) errors.push(error('INVALID_VIEW_AVAILABILITY', `${path}.viewAvailability`, `Invalid view availability for ${region.id}.`));
    if (region.laterality === 'midline' && region.pairedRegionId !== undefined) errors.push(error('MIDLINE_REGION_HAS_PAIR', `${path}.pairedRegionId`, `Midline region ${region.id} cannot declare a bilateral pair.`));
    if (region.laterality !== 'midline') {
      if (!region.pairedRegionId) {
        errors.push(error('MISSING_BILATERAL_PAIR', `${path}.pairedRegionId`, `Lateral region ${region.id} requires its patient-relative pair.`));
      } else {
        const pair = regionById.get(region.pairedRegionId);
        if (!pair) errors.push(error('UNKNOWN_BILATERAL_PAIR', `${path}.pairedRegionId`, `Pair ${region.pairedRegionId} does not exist.`));
        else if (pair.pairedRegionId !== region.id || pair.laterality === region.laterality || pair.groupId !== region.groupId) errors.push(error('INVALID_BILATERAL_PAIR', `${path}.pairedRegionId`, `Pair for ${region.id} must be reciprocal, opposite-sided, and in the same group.`));
      }
    }
  });

  const layerIds = domain.layers.map((layer) => layer.id);
  for (const duplicate of duplicateValues(layerIds)) errors.push(error('DUPLICATE_LAYER_ID', 'layers', `Duplicate layer ID ${duplicate}.`));
  for (const layerId of BODY_LAYER_IDS) {
    if (!layerIds.includes(layerId)) errors.push(error('MISSING_LAYER', 'layers', `Missing body layer ${layerId}.`));
  }
  for (const layerId of layerIds) {
    if (!BODY_LAYER_IDS.includes(layerId)) errors.push(error('UNAPPROVED_LAYER_ID', 'layers', `Layer ${layerId} is outside the approved semantic set.`));
  }
  domain.layers.forEach((layer, index) => {
    if (layer.label.trim().length === 0 || layer.purpose.trim().length === 0) errors.push(error('INCOMPLETE_LAYER', `layers[${index}]`, 'Body layers require labels and purposes.'));
  });

  const sourceIds = domain.provenanceSources.map((source) => source.id);
  for (const duplicate of duplicateValues(sourceIds)) errors.push(error('DUPLICATE_PROVENANCE_ID', 'provenanceSources', `Duplicate anatomy provenance ID ${duplicate}.`));
  domain.provenanceSources.forEach((source, index) => {
    if ([source.id, source.organization, source.title, source.reference, source.relationshipSupported, source.version].some((value) => value.trim().length === 0)) {
      errors.push(error('INCOMPLETE_PROVENANCE', `provenanceSources[${index}]`, 'Anatomy provenance fields must be complete.'));
    }
    if (!['pending', 'reviewed', 'rejected'].includes(source.reviewStatus)) errors.push(error('INVALID_REVIEW_STATUS', `provenanceSources[${index}].reviewStatus`, 'Unknown anatomy review status.'));
  });
  const sourceIdSet = new Set(sourceIds);

  const systemIds = domain.systems.map((system) => system.id);
  for (const duplicate of duplicateValues(systemIds)) errors.push(error('DUPLICATE_SYSTEM_ID', 'systems', `Duplicate system ID ${duplicate}.`));
  domain.systems.forEach((system, index) => {
    const path = `systems[${index}]`;
    if (system.id.trim().length === 0 || system.label.trim().length === 0) errors.push(error('INCOMPLETE_SYSTEM', path, 'Systems require IDs and labels.'));
    if (system.provenanceIds.length === 0) errors.push(error('SYSTEM_MISSING_PROVENANCE', `${path}.provenanceIds`, 'Materialized system membership requires provenance.'));
    for (const regionId of system.regionIds) if (!regionById.has(regionId)) errors.push(error('UNKNOWN_SYSTEM_REGION', `${path}.regionIds`, `Unknown system region ${regionId}.`));
    for (const sourceId of system.provenanceIds) if (!sourceIdSet.has(sourceId)) errors.push(error('UNKNOWN_PROVENANCE', `${path}.provenanceIds`, `Unknown provenance source ${sourceId}.`));
  });

  const structureIds = domain.structures.map((structure) => structure.id);
  for (const duplicate of duplicateValues(structureIds)) errors.push(error('DUPLICATE_STRUCTURE_ID', 'structures', `Duplicate structure ID ${duplicate}.`));
  const systemIdSet = new Set(systemIds);
  domain.structures.forEach((structure, index) => {
    const path = `structures[${index}]`;
    if (structure.id.trim().length === 0 || structure.label.trim().length === 0) errors.push(error('INCOMPLETE_STRUCTURE', path, 'Structures require IDs and labels.'));
    if (structure.systemId && !systemIdSet.has(structure.systemId)) errors.push(error('UNKNOWN_STRUCTURE_SYSTEM', `${path}.systemId`, `Unknown structure system ${structure.systemId}.`));
    if (structure.provenanceIds.length === 0) errors.push(error('STRUCTURE_MISSING_PROVENANCE', `${path}.provenanceIds`, 'Materialized structure membership requires provenance.'));
    for (const regionId of structure.regionIds) if (!regionById.has(regionId)) errors.push(error('UNKNOWN_STRUCTURE_REGION', `${path}.regionIds`, `Unknown structure region ${regionId}.`));
    for (const sourceId of structure.provenanceIds) if (!sourceIdSet.has(sourceId)) errors.push(error('UNKNOWN_PROVENANCE', `${path}.provenanceIds`, `Unknown provenance source ${sourceId}.`));
  });

  validateMembershipStatus(domain, 'system', sourceIdSet, errors, blockers);
  validateMembershipStatus(domain, 'structure', sourceIdSet, errors, blockers);

  for (const view of BODY_VIEW_IDS) {
    const order = domain.keyboardOrder[view];
    for (const duplicate of duplicateValues(order)) errors.push(error('DUPLICATE_TRAVERSAL_OWNERSHIP', `keyboardOrder.${view}`, `Region ${duplicate} occurs more than once in ${view} traversal.`));
    for (const regionId of order) {
      const region = regionById.get(regionId);
      if (!region) errors.push(error('UNKNOWN_TRAVERSAL_REGION', `keyboardOrder.${view}`, `Unknown traversal region ${regionId}.`));
      else if (!regionAvailableInView(region, view)) errors.push(error('UNAVAILABLE_TRAVERSAL_REGION', `keyboardOrder.${view}`, `Region ${regionId} is unavailable in ${view}.`));
    }
    for (const region of domain.regions.filter((candidate) => regionAvailableInView(candidate, view))) {
      if (!order.includes(region.id)) errors.push(error('MISSING_TRAVERSAL_REGION', `keyboardOrder.${view}`, `Region ${region.id} is missing from ${view} traversal.`));
    }
  }

  const anatomyDataReady = errors.length === 0 && domain.systemMembershipStatus.status === 'ready' && domain.structureMembershipStatus.status === 'ready';
  return { structureValid: errors.length === 0, anatomyDataReady, errors, blockers };
}

export function assertBodyDomainValid(domain: Readonly<BodyDomainDefinition>): void {
  const report = validateBodyDomain(domain);
  if (!report.structureValid) throw new TypeError(report.errors.map((issue) => `${issue.path}: ${issue.message}`).join('\n'));
}
