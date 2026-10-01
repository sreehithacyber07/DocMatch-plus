/**
 * The motion vocabulary.
 *
 * Every animated surface in the product draws from this file, so the interface
 * moves one way rather than nine. Each entry is a factory taking the viewer
 * reduced-motion preference, because the preference changes the motion rather
 * than removing it: the transform is dropped and the opacity step is shortened,
 * so a state change stays legible without travel.
 *
 * MECHANICAL REASONS, stated before the code that spends the motion budget:
 *
 *   fadeLift        an element arriving from below reads as new content
 *                   entering a stable frame, which distinguishes it from
 *                   content that merely re-rendered in place.
 *   crossfade       two states of the same object, so neither may travel:
 *                   travel would imply they are different objects.
 *   nodeEnter       a timeline node scales from its own centre because it is
 *                   inserted into an existing line rather than pushed onto a
 *                   stack; the line itself must not appear to move.
 *   orbitReveal     a locator ring sweeps once to say which area is under
 *                   consideration, then stops. A repeating sweep would read as
 *                   a system still searching.
 *   questionSwap    the outgoing question leaves upward and the incoming one
 *                   arrives from below, so the interview reads as a single
 *                   forward track rather than a set of replaced cards.
 *   timelineInsert  height and opacity together, so surrounding content is
 *                   displaced by the real size of the entry rather than
 *                   jumping when it appears.
 *   criticalShift   the safety register enters faster and without travel,
 *                   because a warning that slides in is a warning that
 *                   arrives late.
 *   accordionReveal height from 0 to auto is the disclosure itself; the
 *                   staggered children let the eye land on the first field
 *                   instead of the whole block at once.
 *
 * No spring, no bounce, no repeat except where a value is explicitly named as a
 * one-shot sweep. Nothing here animates a property that changes layout geometry
 * outside its own subtree.
 */
import type { Transition, Variants } from 'framer-motion';

/** The single easing curve. Matches --motion-ease-standard in tokens.css. */
export const EASE = [0.2, 0, 0, 1] as const;

/** Durations, in seconds, matching the --motion-duration-* token scale. */
export const DURATION = {
  immediate: 0.08,
  control: 0.16,
  content: 0.22,
  spatial: 0.32,
  passage: 0.5,
} as const;

export type Reduced = boolean;

/** The reduced-motion substitute: a short opacity step, no travel. */
function flat(duration: number = DURATION.control): Transition {
  return { duration, ease: EASE };
}

export function transition(reduced: Reduced, duration: number = DURATION.spatial, delay = 0): Transition {
  return reduced ? flat() : { duration, ease: EASE, delay };
}

/* --- Entrances ------------------------------------------------------------ */

export function fadeLift(reduced: Reduced, delay = 0, distance = 14) {
  return {
    initial: reduced ? { opacity: 0 } : { opacity: 0, y: distance },
    animate: { opacity: 1, y: 0 },
    exit: reduced ? { opacity: 0 } : { opacity: 0, y: -distance * 0.6 },
    transition: transition(reduced, DURATION.passage, reduced ? 0 : delay),
  };
}

export function crossfade(reduced: Reduced, delay = 0) {
  return {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
    transition: transition(reduced, DURATION.content, reduced ? 0 : delay),
  };
}

export function questionSwap(reduced: Reduced) {
  return {
    initial: reduced ? { opacity: 0 } : { opacity: 0, y: 18 },
    animate: { opacity: 1, y: 0 },
    exit: reduced ? { opacity: 0 } : { opacity: 0, y: -12 },
    transition: transition(reduced, 0.38),
  };
}

export function nodeEnter(reduced: Reduced, index = 0) {
  return {
    initial: reduced ? { opacity: 0 } : { opacity: 0, scale: 0.6 },
    animate: { opacity: 1, scale: 1 },
    transition: transition(reduced, DURATION.spatial, reduced ? 0 : index * 0.04),
  };
}

export function timelineInsert(reduced: Reduced) {
  return {
    initial: reduced ? { opacity: 0 } : { opacity: 0, height: 0 },
    animate: { opacity: 1, height: 'auto' as const },
    exit: reduced ? { opacity: 0 } : { opacity: 0, height: 0 },
    transition: transition(reduced, DURATION.spatial),
  };
}

export function criticalShift(reduced: Reduced) {
  return {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
    transition: { duration: reduced ? DURATION.immediate : DURATION.content, ease: EASE },
  };
}

/* --- Disclosure ----------------------------------------------------------- */

export function accordionReveal(reduced: Reduced) {
  return {
    initial: { height: 0, opacity: 0 },
    animate: { height: 'auto' as const, opacity: 1 },
    exit: { height: 0, opacity: 0 },
    transition: reduced
      ? { duration: DURATION.control, ease: EASE }
      : {
          height: { duration: 0.36, ease: EASE },
          opacity: { duration: 0.26, ease: EASE },
        },
  };
}

/** Children of a disclosure, so the eye lands on the first field. */
export function accordionChildren(reduced: Reduced): Variants {
  return {
    hidden: {},
    shown: {
      transition: { staggerChildren: reduced ? 0 : 0.035, delayChildren: reduced ? 0 : 0.06 },
    },
  };
}

export function accordionChild(reduced: Reduced): Variants {
  return {
    hidden: reduced ? { opacity: 0 } : { opacity: 0, y: 8 },
    shown: { opacity: 1, y: 0, transition: flat(DURATION.content) },
  };
}

export function chevronRotate(open: boolean, reduced: Reduced) {
  return {
    animate: { rotate: open ? 180 : 0 },
    transition: transition(reduced, DURATION.spatial),
  };
}

/* --- Diagrammatic motion -------------------------------------------------- */

/** One sweep of a locator ring, then still. */
export function orbitReveal(reduced: Reduced) {
  if (reduced) return { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: flat() };
  return {
    initial: { opacity: 0, rotate: -40, scale: 0.94 },
    animate: { opacity: 1, rotate: 0, scale: 1 },
    transition: { duration: 0.9, ease: EASE },
  };
}

/** A stroked path drawing itself along its own length. */
export function pathDraw(reduced: Reduced, delay = 0, duration = 0.8) {
  return {
    initial: reduced ? { opacity: 0 } : { pathLength: 0, opacity: 0 },
    animate: reduced ? { opacity: 1 } : { pathLength: 1, opacity: 1 },
    transition: reduced
      ? flat()
      : { pathLength: { duration, ease: EASE, delay }, opacity: { duration: 0.2, delay } },
  };
}
