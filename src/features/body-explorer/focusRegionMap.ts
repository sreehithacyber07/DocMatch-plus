import type { BodyRegionId } from '../../body/index.ts';
import { ARTWORK_VIEWBOX_HEIGHT, ARTWORK_VIEWBOX_WIDTH } from './artwork/hitmap-geometry.ts';
import { FACE_REGION_BY_ID, type FaceRegionId } from './faceHitMap.ts';

export interface FocusTarget { x: number; y: number; zoom: number; maxZoom: number }

export function bodyFocusTarget(regionId: BodyRegionId | null, bounds: { x: number; y: number; width: number; height: number } | null): FocusTarget {
  if (!regionId || !bounds) return { x: 0.5, y: 0.5, zoom: 1.6, maxZoom: 5 };
  const head = regionId === 'head' || regionId === 'face';
  return {
    x: (bounds.x + bounds.width / 2) / ARTWORK_VIEWBOX_WIDTH,
    y: (bounds.y + bounds.height / 2) / ARTWORK_VIEWBOX_HEIGHT,
    zoom: head ? 3.2 : 2.4,
    maxZoom: 5,
  };
}

export function faceFocusTarget(regionId: FaceRegionId): FocusTarget {
  const { x, y, defaultZoom, maxZoom } = FACE_REGION_BY_ID[regionId].focus;
  return { x, y, zoom: defaultZoom, maxZoom };
}

export function clampFocusPan(zoom: number, x: number, y: number) {
  const limit = Math.max(0, (zoom - 1) / 2);
  return { x: Math.max(-limit, Math.min(limit, x)), y: Math.max(-limit, Math.min(limit, y)) };
}

export function panForTarget(target: FocusTarget, imageRatio: number, frameRatio = 4 / 3) {
  const fit = Math.min(1, imageRatio / frameRatio);
  const fittedX = (1 - fit) / 2 + target.x * fit;
  return clampFocusPan(target.zoom, (0.5 - fittedX) * target.zoom, (0.5 - target.y) * target.zoom);
}
