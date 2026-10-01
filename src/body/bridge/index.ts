export {
  BODY_BRIDGE_COMPLAINT_IDS,
  BODY_BRIDGE_PRODUCT_SOURCE_ID,
  BODY_BRIDGE_PROVENANCE,
  BODY_ROUTING_BRIDGE,
  BODY_ROUTING_MAPPINGS,
} from './mappings.ts';
export {
  candidateComplaintIdsForPainLocation,
  candidateComplaintIdsForRegion,
  resolveCandidateComplaints,
} from './resolve.ts';
export type {
  BodyRoutingBridgeDefinition,
  BodyRoutingMapping,
  BridgeProvenanceSource,
  BridgeValidationContext,
  BridgeValidationIssue,
  BridgeValidationReport,
  ComplaintCandidateResolution,
  PainLocationBridgeInput,
} from './types.ts';
export {
  assertBodyRoutingBridgeValid,
  validateBodyRoutingBridge,
  validateCurrentBodyRoutingBridge,
} from './validation.ts';
export { BRIDGE_VERSION } from './version.ts';
