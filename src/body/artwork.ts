import { BODY_DOMAIN } from './domain.ts';
import { BODY_LAYER_IDS, BODY_VIEW_IDS, type BodyLayerId, type BodyRegionId, type BodyView } from './ids.ts';
import type { BodyDomainDefinition, BodyValidationIssue, ContractValidationReport, NormalizedPoint } from './types.ts';

export interface ArtworkCoordinateSpace {
  id: string;
  width: number;
  height: number;
  aspectRatio: number;
}
export interface BodyArtworkAsset {
  assetId: string;
  assetRef: string;
  view: BodyView;
  layer: BodyLayerId;
  coordinateSpaceId: string;
  intrinsicWidth: number;
  intrinsicHeight: number;
}

export interface NormalizedBounds extends NormalizedPoint {
  width: number;
  height: number;
}

export interface RegionArtworkReference {
  regionId: BodyRegionId;
  view: BodyView;
  coordinateSpaceId: string;
  markerAnchor?: NormalizedPoint;
  labelAnchor?: NormalizedPoint;
  zoomTarget?: NormalizedBounds;
}

export interface BodyArtworkPackage {
  artworkVersion: string;
  coordinateSpaces: readonly ArtworkCoordinateSpace[];
  assets: readonly BodyArtworkAsset[];
  regionReferences: readonly RegionArtworkReference[];
}

export interface HitTargetCapabilities {
  pointer: true;
  keyboard: true;
  touch: true;
  minimumTargetSizeCssPx: number;
}

export interface SemanticHitTarget {
  hitTargetId: string;
  geometryRef: string;
  regionId: BodyRegionId;
  view: BodyView;
  coordinateSpaceId: string;
  capabilities: HitTargetCapabilities;
}

export interface SemanticHitMapPackage {
  hitMapVersion: string;
  artworkVersion: string;
  targets: readonly SemanticHitTarget[];
}

function pointErrors(point: Readonly<NormalizedPoint>, path: string): BodyValidationIssue[] {
  const errors: BodyValidationIssue[] = [];
  if (!Number.isFinite(point.x) || point.x < 0 || point.x > 1) errors.push({ code: 'ANCHOR_OUT_OF_BOUNDS', path: `${path}.x`, message: 'Normalized x must be from 0 to 1.' });
  if (!Number.isFinite(point.y) || point.y < 0 || point.y > 1) errors.push({ code: 'ANCHOR_OUT_OF_BOUNDS', path: `${path}.y`, message: 'Normalized y must be from 0 to 1.' });
  return errors;
}

export function validateArtworkPackage(
  artwork: Readonly<BodyArtworkPackage>,
  domain: Readonly<BodyDomainDefinition> = BODY_DOMAIN,
): ContractValidationReport {
  const errors: BodyValidationIssue[] = [];
  if (artwork.artworkVersion.trim().length === 0) errors.push({ code: 'MISSING_ARTWORK_VERSION', path: 'artwork.artworkVersion', message: 'Artwork version is required.' });
  const spaces = new Set<string>();
  artwork.coordinateSpaces.forEach((space, index) => {
    const path = `artwork.coordinateSpaces[${index}]`;
    if (space.id.trim().length === 0) errors.push({ code: 'EMPTY_COORDINATE_SPACE_ID', path: `${path}.id`, message: 'Coordinate-space ID is required.' });
    if (spaces.has(space.id)) errors.push({ code: 'DUPLICATE_COORDINATE_SPACE', path: `${path}.id`, message: `Duplicate coordinate-space ID ${space.id}.` });
    spaces.add(space.id);
    if (![space.width, space.height, space.aspectRatio].every((value) => Number.isFinite(value) && value > 0)) {
      errors.push({ code: 'INVALID_COORDINATE_SPACE', path, message: 'Coordinate-space dimensions and aspect ratio must be positive finite numbers.' });
    } else if (Math.abs(space.width / space.height - space.aspectRatio) > 1e-9) {
      errors.push({ code: 'ASPECT_RATIO_MISMATCH', path: `${path}.aspectRatio`, message: 'Aspect ratio must match intrinsic width divided by height.' });
    }
  });
  const assetIds = new Set<string>();
  artwork.assets.forEach((asset, index) => {
    const path = `artwork.assets[${index}]`;
    if (asset.assetId.trim().length === 0 || asset.assetRef.trim().length === 0) errors.push({ code: 'EMPTY_ARTWORK_REFERENCE', path, message: 'Asset ID and opaque asset reference are required.' });
    if (assetIds.has(asset.assetId)) errors.push({ code: 'DUPLICATE_ARTWORK_ASSET', path: `${path}.assetId`, message: `Duplicate artwork asset ${asset.assetId}.` });
    assetIds.add(asset.assetId);
    if (!BODY_VIEW_IDS.includes(asset.view) || !BODY_LAYER_IDS.includes(asset.layer)) errors.push({ code: 'INVALID_ARTWORK_SCOPE', path, message: 'Artwork asset must use known view and layer IDs.' });
    if (!spaces.has(asset.coordinateSpaceId)) errors.push({ code: 'UNKNOWN_COORDINATE_SPACE', path: `${path}.coordinateSpaceId`, message: 'Artwork asset references an unknown coordinate space.' });
    if (![asset.intrinsicWidth, asset.intrinsicHeight].every((value) => Number.isFinite(value) && value > 0)) errors.push({ code: 'INVALID_INTRINSIC_SIZE', path, message: 'Intrinsic dimensions must be positive finite numbers.' });
  });
  const regions = new Map(domain.regions.map((region) => [region.id, region]));
  artwork.regionReferences.forEach((reference, index) => {
    const path = `artwork.regionReferences[${index}]`;
    const region = regions.get(reference.regionId);
    if (!region) errors.push({ code: 'UNKNOWN_REGION', path: `${path}.regionId`, message: 'Artwork reference points to an unknown semantic region.' });
    if (!BODY_VIEW_IDS.includes(reference.view)) errors.push({ code: 'INVALID_VIEW', path: `${path}.view`, message: 'Artwork reference uses an unknown view.' });
    if (region && region.viewAvailability !== 'both' && region.viewAvailability !== reference.view) errors.push({ code: 'REGION_UNAVAILABLE_IN_VIEW', path: `${path}.view`, message: 'Artwork reference uses a view where the semantic region is unavailable.' });
    if (!spaces.has(reference.coordinateSpaceId)) errors.push({ code: 'UNKNOWN_COORDINATE_SPACE', path: `${path}.coordinateSpaceId`, message: 'Artwork reference uses an unknown coordinate space.' });
    if (reference.markerAnchor) errors.push(...pointErrors(reference.markerAnchor, `${path}.markerAnchor`));
    if (reference.labelAnchor) errors.push(...pointErrors(reference.labelAnchor, `${path}.labelAnchor`));
    if (reference.zoomTarget) {
      errors.push(...pointErrors(reference.zoomTarget, `${path}.zoomTarget`));
      if (!Number.isFinite(reference.zoomTarget.width) || reference.zoomTarget.width <= 0 || reference.zoomTarget.x + reference.zoomTarget.width > 1) errors.push({ code: 'ZOOM_TARGET_OUT_OF_BOUNDS', path: `${path}.zoomTarget.width`, message: 'Zoom target width must remain within normalized bounds.' });
      if (!Number.isFinite(reference.zoomTarget.height) || reference.zoomTarget.height <= 0 || reference.zoomTarget.y + reference.zoomTarget.height > 1) errors.push({ code: 'ZOOM_TARGET_OUT_OF_BOUNDS', path: `${path}.zoomTarget.height`, message: 'Zoom target height must remain within normalized bounds.' });
    }
  });
  return { valid: errors.length === 0, errors };
}

export function validateHitMapPackage(
  hitMap: Readonly<SemanticHitMapPackage>,
  artwork: Readonly<BodyArtworkPackage>,
  domain: Readonly<BodyDomainDefinition> = BODY_DOMAIN,
): ContractValidationReport {
  const errors: BodyValidationIssue[] = [];
  if (hitMap.hitMapVersion.trim().length === 0) errors.push({ code: 'MISSING_HIT_MAP_VERSION', path: 'hitMap.hitMapVersion', message: 'Hit-map version is required.' });
  if (hitMap.artworkVersion !== artwork.artworkVersion) errors.push({ code: 'ARTWORK_VERSION_MISMATCH', path: 'hitMap.artworkVersion', message: 'Hit map and visible artwork must declare the same artwork version.' });
  const regionIds = new Set(domain.regions.map((region) => region.id));
  const regions = new Map(domain.regions.map((region) => [region.id, region]));
  const spaces = new Set(artwork.coordinateSpaces.map((space) => space.id));
  const targetIds = new Set<string>();
  const geometryOwners = new Map<string, BodyRegionId>();
  hitMap.targets.forEach((target, index) => {
    const path = `hitMap.targets[${index}]`;
    if (target.hitTargetId.trim().length === 0 || target.geometryRef.trim().length === 0) errors.push({ code: 'EMPTY_HIT_TARGET_REFERENCE', path, message: 'Hit-target ID and geometry reference are required.' });
    if (targetIds.has(target.hitTargetId)) errors.push({ code: 'DUPLICATE_HIT_TARGET_ID', path: `${path}.hitTargetId`, message: `Duplicate hit-target ID ${target.hitTargetId}.` });
    targetIds.add(target.hitTargetId);
    if (!regionIds.has(target.regionId)) errors.push({ code: 'UNKNOWN_REGION', path: `${path}.regionId`, message: 'Hit target points to an unknown semantic region.' });
    if (!BODY_VIEW_IDS.includes(target.view)) errors.push({ code: 'INVALID_VIEW', path: `${path}.view`, message: 'Hit target uses an unknown view.' });
    const region = regions.get(target.regionId);
    if (region && region.viewAvailability !== 'both' && region.viewAvailability !== target.view) errors.push({ code: 'REGION_UNAVAILABLE_IN_VIEW', path: `${path}.view`, message: 'Hit target uses a view where the semantic region is unavailable.' });
    if (!spaces.has(target.coordinateSpaceId)) errors.push({ code: 'UNKNOWN_COORDINATE_SPACE', path: `${path}.coordinateSpaceId`, message: 'Hit target uses an unknown coordinate space.' });
    const ownershipKey = `${target.view}:${target.coordinateSpaceId}:${target.geometryRef}`;
    const owner = geometryOwners.get(ownershipKey);
    if (owner && owner !== target.regionId) errors.push({ code: 'AMBIGUOUS_GEOMETRY_OWNERSHIP', path: `${path}.geometryRef`, message: `Geometry ${target.geometryRef} is owned by multiple semantic regions.` });
    geometryOwners.set(ownershipKey, target.regionId);
    if (!target.capabilities.pointer || !target.capabilities.keyboard || !target.capabilities.touch) errors.push({ code: 'INCOMPLETE_INTERACTION_CAPABILITY', path: `${path}.capabilities`, message: 'Hit targets must support pointer, keyboard, and touch interaction.' });
    if (!Number.isFinite(target.capabilities.minimumTargetSizeCssPx) || target.capabilities.minimumTargetSizeCssPx < 24) errors.push({ code: 'TARGET_SIZE_TOO_SMALL', path: `${path}.capabilities.minimumTargetSizeCssPx`, message: 'Minimum target size must be at least 24 CSS pixels.' });
  });
  return { valid: errors.length === 0, errors };
}
