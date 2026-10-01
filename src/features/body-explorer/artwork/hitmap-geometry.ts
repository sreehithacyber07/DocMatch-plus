import type { BodyLayerId, BodyRegionId, BodyView } from '../../../body/index.ts';

/**
 * Interaction geometry for the body hit maps.
 *
 * Male and female, front and back, each layer has its own registration, generated
 * from the measured silhouette of the approved artwork as the stage renders it
 * (limb contours, joint landmarks and torso extents). Region ids are frozen
 * Body Domain ids shared by every variant and view. Laterality is the
 * patient's: on the front view patient right is on the viewer's left, on the
 * back view it is on the viewer's right.
 * These shapes are a transparent interaction overlay. They are not visible
 * anatomy and must never be styled as anatomy.
 *
 * Every coordinate belongs to the 1024x1536 artwork coordinate space.
 */
export type HitShape =
  | { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number }
  | { kind: 'rect'; x: number; y: number; width: number; height: number; cornerRadius: number }
  | { kind: 'path'; d: string };

export interface HitRegion {
  regionId: BodyRegionId;
  shape: HitShape;
}

export type BodyVariantId = 'male' | 'female';

export interface HitMapPackage {
  variantId: BodyVariantId;
  view: BodyView;
  /** The artwork layer this registration was fitted to. */
  layer: BodyLayerId;
  coordinateSpaceId: string;
  viewBoxWidth: number;
  viewBoxHeight: number;
  /** Preliminary geometry still awaiting alignment against final artwork. */
  alignmentPending: boolean;
  regions: readonly HitRegion[];
}

/*
  The region geometry is generated from the measured silhouettes of the
  approved artwork (scripts/audit/body-silhouette-audit.mjs and
  scripts/audit/body-hitmap-generate.mjs), in the 1024x1536 frame every layer
  is drawn in. Each layer is its own drawing: the systems and organ figures are
  proportioned differently from the hologram (arm spread, hand and foot
  position), so every variant, view and layer has its own registration over
  the same region ids.
*/
import { GENERATED_HIT_REGIONS } from './hitmap-regions.generated.ts';

export const ARTWORK_COORDINATE_SPACE_ID = 'docmatch-body-1024x1536';
export const ARTWORK_VIEWBOX_WIDTH = 1024;
export const ARTWORK_VIEWBOX_HEIGHT = 1536;

export const HIT_MAPS: readonly HitMapPackage[] = (['male', 'female'] as const).flatMap((variantId) =>
  (['front', 'back'] as const).flatMap((view) =>
    (['hologram', 'systems', 'structures'] as const).map((layer) => ({
      variantId,
      view,
      layer,
      coordinateSpaceId: ARTWORK_COORDINATE_SPACE_ID,
      viewBoxWidth: ARTWORK_VIEWBOX_WIDTH,
      viewBoxHeight: ARTWORK_VIEWBOX_HEIGHT,
      alignmentPending: false,
      regions: GENERATED_HIT_REGIONS[variantId][view][layer],
    })),
  ),
);

/** The registration for the layer on screen; the hologram when no layer is named. */
export function hitMapFor(variantId: BodyVariantId, view: BodyView, layer: BodyLayerId = 'hologram'): HitMapPackage {
  const found = HIT_MAPS.find((candidate) => candidate.variantId === variantId && candidate.view === view && candidate.layer === layer);
  if (!found) throw new TypeError(`No hit map for ${variantId} ${view} ${layer}.`);
  return found;
}

/** Axis-aligned bounds of a hit shape, in artwork coordinates. */
export function shapeBounds(shape: HitShape): { x: number; y: number; width: number; height: number } {
  if (shape.kind === 'ellipse') {
    return { x: shape.cx - shape.rx, y: shape.cy - shape.ry, width: shape.rx * 2, height: shape.ry * 2 };
  }
  if (shape.kind === 'rect') {
    return { x: shape.x, y: shape.y, width: shape.width, height: shape.height };
  }
  const numbers = shape.d.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  const xs: number[] = [];
  const ys: number[] = [];
  for (let index = 0; index + 1 < numbers.length; index += 2) {
    xs.push(numbers[index]);
    ys.push(numbers[index + 1]);
  }
  if (xs.length === 0) return { x: 0, y: 0, width: ARTWORK_VIEWBOX_WIDTH, height: ARTWORK_VIEWBOX_HEIGHT };
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return { x: minX, y: minY, width: Math.max(...xs) - minX, height: Math.max(...ys) - minY };
}
