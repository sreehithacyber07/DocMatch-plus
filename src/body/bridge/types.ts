import type { KnowledgeBase } from '../../engine/data/types.ts';
import type { BodyDomainDefinition, PainLocation } from '../types.ts';
import type { BodyRegionId } from '../ids.ts';

export interface BridgeProvenanceSource {
  id: string;
  organization: string;
  title: string;
  reference: string;
  locator: string;
  relationshipSupported: string;
  reviewStatus: 'reviewed';
  version: string;
}

export interface BodyRoutingMapping {
  regionId: BodyRegionId;
  complaintIds: readonly string[];
  provenanceIds: readonly string[];
}

export interface BodyRoutingBridgeDefinition {
  bridgeVersion: string;
  compatibleBodyDomainVersion: string;
  compatibleKnowledgeVersion: string;
  mappings: readonly BodyRoutingMapping[];
  provenanceSources: readonly BridgeProvenanceSource[];
}

export type ComplaintCandidateResolution =
  | { status: 'mapped'; regionId: BodyRegionId; complaintIds: readonly string[] }
  | { status: 'unmapped'; regionId: BodyRegionId; complaintIds: readonly [] }
  | { status: 'unknown-region'; regionId: string; complaintIds: readonly [] };

export interface BridgeValidationIssue {
  code: string;
  path: string;
  message: string;
}

export interface BridgeValidationReport {
  structureValid: boolean;
  knowledgeCompatible: boolean;
  errors: BridgeValidationIssue[];
}

export interface BridgeValidationContext {
  bodyDomain: Readonly<BodyDomainDefinition>;
  knowledge: Readonly<KnowledgeBase>;
}

export type PainLocationBridgeInput = Readonly<PainLocation>;
