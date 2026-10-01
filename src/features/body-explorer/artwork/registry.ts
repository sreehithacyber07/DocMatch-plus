import type { BodyLayerId, BodyView } from '../../../body/index.ts';
import {
  ARTWORK_COORDINATE_SPACE_ID,
  ARTWORK_VIEWBOX_HEIGHT,
  ARTWORK_VIEWBOX_WIDTH,
  hitMapFor,
  type BodyVariantId,
  type HitMapPackage,
} from './hitmap-geometry.ts';
import { BODY_ASSETS } from './bodyAssetRegistry.ts';

/**
 * Presentation metadata for the single approved asset registry.
 *
 * No component may contain an asset path. Approved URLs live in bodyAssetRegistry.
 *
 * "approved" means the founder has supplied and approved the artwork.
 * "pending" means the slot exists but no artwork has been supplied. A pending
 * slot renders a neutral unavailable state and never a placeholder body.
 */
export type ArtworkStatus = 'approved' | 'pending';

export interface BodyArtworkEntry {
  assetId: string;
  variantId: BodyVariantId;
  view: BodyView;
  layer: BodyLayerId;
  status: ArtworkStatus;
  /** Public URL of the visible artwork. Undefined while the slot is pending. */
  assetRef?: string;
  coordinateSpaceId: string;
  intrinsicWidth: number;
  intrinsicHeight: number;
}

export const ARTWORK_VERSION = '0.2.0-approved-body-families';

export function faceArtwork(variantId: BodyVariantId): string | null {
  return BODY_ASSETS[variantId].focus.face;
}

function entry(
  variantId: BodyVariantId,
  view: BodyView,
  layer: BodyLayerId,
  status: ArtworkStatus,
): BodyArtworkEntry {
  const assetId = `${variantId}-${layer}-${view}`;
  const assetRef = BODY_ASSETS[variantId][layer][view];
  const femaleHologram = variantId === 'female' && layer === 'hologram';
  return {
    assetId,
    variantId,
    view,
    layer,
    status,
    assetRef: status === 'approved' ? assetRef : undefined,
    coordinateSpaceId: ARTWORK_COORDINATE_SPACE_ID,
    intrinsicWidth: femaleHologram ? (view === 'front' ? 1145 : 1144) : ARTWORK_VIEWBOX_WIDTH,
    intrinsicHeight: femaleHologram ? (view === 'front' ? 1374 : 1375) : ARTWORK_VIEWBOX_HEIGHT,
  };
}

export const BODY_ARTWORK: readonly BodyArtworkEntry[] = [
  // Supplied and approved by the founder.
  entry('male', 'front', 'hologram', 'approved'),
  entry('male', 'back', 'hologram', 'approved'),

  entry('male', 'front', 'systems', 'approved'),
  entry('male', 'back', 'systems', 'approved'),
  entry('male', 'front', 'structures', 'approved'),
  entry('male', 'back', 'structures', 'approved'),

  entry('female', 'front', 'hologram', 'approved'),
  entry('female', 'back', 'hologram', 'approved'),
  entry('female', 'front', 'systems', 'approved'),
  entry('female', 'back', 'systems', 'approved'),
  entry('female', 'front', 'structures', 'approved'),
  entry('female', 'back', 'structures', 'approved'),
];

export interface ResolvedArtwork {
  entry: BodyArtworkEntry;
  hitMap: HitMapPackage;
  /** True when a visible asset reference exists to attempt loading. */
  hasAsset: boolean;
}

export function resolveArtwork(
  variantId: BodyVariantId,
  view: BodyView,
  layer: BodyLayerId,
): ResolvedArtwork {
  const found = BODY_ARTWORK.find(
    (candidate) =>
      candidate.variantId === variantId && candidate.view === view && candidate.layer === layer,
  );
  if (!found) throw new TypeError(`No artwork slot declared for ${variantId} ${layer} ${view}.`);
  return { entry: found, hitMap: hitMapFor(variantId, view, layer), hasAsset: found.assetRef !== undefined };
}

export function layerAvailable(variantId: BodyVariantId, view: BodyView, layer: BodyLayerId): boolean {
  return resolveArtwork(variantId, view, layer).entry.status === 'approved';
}

export function variantAvailable(variantId: BodyVariantId): boolean {
  return BODY_ARTWORK.some(
    (candidate) => candidate.variantId === variantId && candidate.status === 'approved',
  );
}

/** Slots still awaiting artwork, for the founder-facing report and dev surface. */
export function pendingArtworkSlots(): BodyArtworkEntry[] {
  return BODY_ARTWORK.filter((candidate) => candidate.status === 'pending');
}
