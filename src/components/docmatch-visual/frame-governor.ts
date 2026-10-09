/**
 * Frame pacing for the ambient canvas, kept pure so it can be tested.
 *
 * The background drifts slowly, so at rest it is drawn at RESTING_FPS. While
 * something the eye tracks is still settling (the landing scroll parallax or
 * the cursor's pull on the strand) it is drawn at ACTIVE_FPS, which also caps
 * high-refresh displays that would otherwise draw it 120 times a second.
 */
export const RESTING_FPS = 30;
export const ACTIVE_FPS = 60;
/** The rate the original easing constants were tuned for. */
const REFERENCE_FRAME_MS = 1000 / 60;
/** A small tolerance so a 60 Hz display does not skip every other 30 fps slot. */
const SLACK_MS = 2;

export interface FrameGovernor {
  /** True when a frame should be drawn at `now`; records it as drawn. */
  due(now: number, active: boolean): boolean;
  /**
   * Converts a per-60fps-frame easing rate into the rate for the time elapsed
   * since the previous drawn frame, so motion settles at the same speed at any
   * frame rate.
   */
  easing(now: number): (rate: number) => number;
  /** Forgets the last frame, for example after the tab was hidden. */
  reset(): void;
}

export function createFrameGovernor(): FrameGovernor {
  let lastDrawn = -Infinity;
  let lastEased = -Infinity;
  return {
    due(now, active) {
      const interval = 1000 / (active ? ACTIVE_FPS : RESTING_FPS);
      if (now - lastDrawn < interval - SLACK_MS) return false;
      lastDrawn = now;
      return true;
    },
    easing(now) {
      const elapsed = Number.isFinite(lastEased) ? now - lastEased : REFERENCE_FRAME_MS;
      lastEased = now;
      // Bounded so a long pause (a hidden tab) does not jump in one frame.
      const steps = Math.min(6, Math.max(1, elapsed / REFERENCE_FRAME_MS));
      return (rate) => 1 - Math.pow(1 - rate, steps);
    },
    reset() {
      lastDrawn = -Infinity;
      lastEased = -Infinity;
    },
  };
}

/** Small or touch screens draw at a pixel ratio of at most 1.5; others at most 2. */
export function pixelRatioFor(devicePixelRatio: number, width: number, coarsePointer: boolean): number {
  const cap = coarsePointer || width <= 700 ? 1.5 : 2;
  return Math.max(1, Math.min(devicePixelRatio, cap));
}
