import type { BodyVariantId } from './hitmap-geometry.ts';

/** Presentation-only fit of the shared 1000x1200 hitmap to each undistorted 1145x1374 asset. */
export const FACE_ASSET_REGISTRATION: Record<BodyVariantId, { offsetX: number; offsetY: number; scaleX: number; scaleY: number }> = {
  male: { offsetX: 0, offsetY: 91.9, scaleX: 1.1765, scaleY: 0.9009 },
  female: { offsetX: 0, offsetY: 90, scaleX: 1.05, scaleY: 0.8333 },
};
