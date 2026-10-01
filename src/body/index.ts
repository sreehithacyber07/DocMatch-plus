export { BODY_DOMAIN, BODY_LAYERS } from './domain.ts';
export {
  BODY_LATERALITY_IDS,
  BODY_LAYER_IDS,
  BODY_REGION_GROUP_IDS,
  BODY_REGION_IDS,
  BODY_VIEW_IDS,
  type BodyLaterality,
  type BodyLayerId,
  type BodyRegionGroupId,
  type BodyRegionId,
  type BodyView,
} from './ids.ts';
export { getAdjacentKeyboardRegion, getKeyboardRegionOrder, type KeyboardDirection } from './navigation.ts';
export {
  R4_MAX_PAIN_POINTS,
  assertPainLocation,
  exactPointPainLocation,
  generalAreaPainLocation,
  validatePainLocation,
  validatePrimaryPainLocations,
} from './pain-location.ts';
export { BODY_REGIONS, bodyRegionById, regionAvailableInView } from './regions.ts';
export {
  changeBodyLayer,
  changeBodyView,
  clearRegion,
  createBodySelectionState,
  painLocationFromSelection,
  selectRegion,
  selectStructure,
  selectSystem,
  setPainPrecision,
  validateBodySelectionState,
} from './selection.ts';
export type {
  AnatomyProvenanceSource,
  AnatomyReviewStatus,
  AnatomyMembershipStatus,
  BodyDomainDefinition,
  BodyDomainValidationReport,
  BodyLayerDefinition,
  BodyRegionDefinition,
  BodySelectionState,
  BodyStructureDefinition,
  BodySystemDefinition,
  BodyValidationIssue,
  ContractValidationReport,
  NormalizedPoint,
  PainLocation,
  PainPrecision,
  ViewAvailability,
} from './types.ts';
export { assertBodyDomainValid, validateBodyDomain } from './validation.ts';
export { BODY_DOMAIN_VERSION } from './version.ts';
export {
  validateArtworkPackage,
  validateHitMapPackage,
  type ArtworkCoordinateSpace,
  type BodyArtworkAsset,
  type BodyArtworkPackage,
  type HitTargetCapabilities,
  type NormalizedBounds,
  type RegionArtworkReference,
  type SemanticHitMapPackage,
  type SemanticHitTarget,
} from './artwork.ts';
