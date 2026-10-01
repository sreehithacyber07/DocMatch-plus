/** What every layer of the ambient canvas reads on each frame. */
export interface Scene {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  /** Seconds since start; 0 under reduced motion, so every layer is still. */
  time: number;
  /** Eased scroll position plus any stage offset, in pixels. */
  scroll: number;
  /** Optional landing-story anchor; other product screens keep the original centre. */
  focusX: number;
  story: boolean;
  /** Eased cursor position as a fraction of the viewport. */
  cursor: { x: number; y: number };
  /** 0 when the cursor is away or motion is reduced, 1 when it is present. */
  presence: number;
  small: boolean;
}

/** Where the travelling light is this frame, for layers that respond to it. */
export interface PulsePoint {
  active: boolean;
  x: number;
  y: number;
  /** 0 to 1 over the life of the pulse, peaking in the middle. */
  fade: number;
}

export const NO_PULSE: PulsePoint = { active: false, x: 0, y: 0, fade: 0 };
