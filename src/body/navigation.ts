import { BODY_DOMAIN } from './domain.ts';
import type { BodyRegionId, BodyView } from './ids.ts';

export type KeyboardDirection = 'next' | 'previous';

export function getKeyboardRegionOrder(view: BodyView): BodyRegionId[] {
  return [...BODY_DOMAIN.keyboardOrder[view]];
}
export function getAdjacentKeyboardRegion(
  view: BodyView,
  currentRegionId: BodyRegionId | null,
  direction: KeyboardDirection,
): BodyRegionId | null {
  const order = BODY_DOMAIN.keyboardOrder[view];
  if (order.length === 0) return null;
  if (currentRegionId === null || !order.includes(currentRegionId)) {
    return direction === 'next' ? order[0] : order[order.length - 1];
  }
  const currentIndex = order.indexOf(currentRegionId);
  const offset = direction === 'next' ? 1 : -1;
  return order[(currentIndex + offset + order.length) % order.length];
}
