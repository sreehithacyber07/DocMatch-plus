import type {
  BodyLaterality,
  BodyLayerId,
  BodyRegionGroupId,
  BodyRegionId,
  BodyView,
} from './ids.ts';

export type ViewAvailability = BodyView | 'both';
export type PainPrecision = 'general-area' | 'exact-point';
export type AnatomyReviewStatus = 'pending' | 'reviewed' | 'rejected';

export interface BodyRegionDefinition {
  id: BodyRegionId;
  label: string;
  laterality: BodyLaterality;
  pairedRegionId?: BodyRegionId;
  groupId: BodyRegionGroupId;
  viewAvailability: ViewAvailability;
}
export interface BodyLayerDefinition {
  id: BodyLayerId;
  label: string;
  purpose: string;
}

export interface AnatomyProvenanceSource {
  id: string;
  organization: string;
  title: string;
  reference: string;
  locator?: string;
  relationshipSupported: string;
  reviewStatus: AnatomyReviewStatus;
  version: string;
}

export interface BodySystemDefinition {
  id: string;
  label: string;
  regionIds: readonly BodyRegionId[];
  provenanceIds: readonly string[];
}

export interface BodyStructureDefinition {
  id: string;
  label: string;
  systemId?: string;
  regionIds: readonly BodyRegionId[];
  provenanceIds: readonly string[];
}

export type AnatomyMembershipStatus =
  | { status: 'ready'; provenanceIds: readonly string[] }
  | { status: 'blocked'; reason: string; requiredEvidence: string };

export interface BodyDomainDefinition {
  bodyDomainVersion: string;
  regions: readonly BodyRegionDefinition[];
  layers: readonly BodyLayerDefinition[];
  systems: readonly BodySystemDefinition[];
  structures: readonly BodyStructureDefinition[];
  provenanceSources: readonly AnatomyProvenanceSource[];
  systemMembershipStatus: AnatomyMembershipStatus;
  structureMembershipStatus: AnatomyMembershipStatus;
  keyboardOrder: Readonly<Record<BodyView, readonly BodyRegionId[]>>;
}

export interface NormalizedPoint {
  x: number;
  y: number;
}

export type PainLocation =
  | { regionId: BodyRegionId; precision: 'general-area' }
  | { regionId: BodyRegionId; precision: 'exact-point'; point: NormalizedPoint };

export interface BodySelectionState {
  view: BodyView;
  layer: BodyLayerId;
  selectedRegionId: BodyRegionId | null;
  selectedSystemId: string | null;
  selectedStructureId: string | null;
  painPrecision: PainPrecision;
  exactPoint: NormalizedPoint | null;
}

export interface BodyValidationIssue {
  code: string;
  path: string;
  message: string;
}

export interface BodyDomainValidationReport {
  structureValid: boolean;
  anatomyDataReady: boolean;
  errors: BodyValidationIssue[];
  blockers: BodyValidationIssue[];
}

export interface ContractValidationReport {
  valid: boolean;
  errors: BodyValidationIssue[];
}
