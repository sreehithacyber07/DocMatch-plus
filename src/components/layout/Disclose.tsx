import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useId, useState, type ReactNode } from 'react';
import { Pictogram, type PictogramName } from '../pictograms';
import {
  accordionChild,
  accordionChildren,
  accordionReveal,
  chevronRotate,
} from '../../styles/motion-variants.ts';

export interface DiscloseProps {
  title: string;
  /** Shown on the trigger while collapsed, so the section is useful closed. */
  preview?: ReactNode;
  mark?: PictogramName;
  defaultOpen?: boolean;
  /** Draws the trigger at section weight rather than rail weight. */
  emphasis?: 'rail' | 'section';
  children: ReactNode;
}

/**
 * The one disclosure in the product.
 *
 * MECHANICAL REASON for the motion: the panel animates its own height from 0 to
 * its content height, which is the disclosure itself. Fading a
 * fixed-height panel would either clip the content or reserve its space while
 * closed, and both defeat the reason to collapse it. Because the height is
 * animated rather than the page scrolled, content below is displaced smoothly
 * instead of jumping, so opening a summary never moves what the reader is
 * looking at.
 *
 * The chevron rotates rather than swapping glyphs: one mark rotating is the
 * same object changing state, which is what the control does.
 *
 * No border is drawn around any of it. The trigger, its rule and the indent of
 * the panel carry the grouping, so a page of disclosures does not read as a
 * stack of boxes.
 */
export function Disclose({
  title,
  preview,
  mark,
  defaultOpen = false,
  emphasis = 'rail',
  children,
}: DiscloseProps) {
  const reduced = Boolean(useReducedMotion());
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();

  return (
    <section className="disclose" data-open={open} data-emphasis={emphasis}>
      <button
        className="disclose__trigger"
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((current) => !current)}
      >
        {mark ? (
          <span className="disclose__mark" aria-hidden="true">
            <Pictogram name={mark} size={20} state={open ? 'active' : 'default'} />
          </span>
        ) : null}

        <span className="disclose__heading">
          <span className="type-label disclose__title">{title}</span>
          {preview && !open ? <span className="disclose__preview type-caption">{preview}</span> : null}
        </span>

        <motion.span className="disclose__chevron" aria-hidden="true" {...chevronRotate(open, reduced)}>
          <svg viewBox="0 0 24 24" focusable="false">
            <path d="M5 9.5 12 16l7-6.5" />
          </svg>
        </motion.span>
      </button>

      <AnimatePresence initial={false}>
        {open ? (
          <motion.div className="disclose__panel" id={panelId} {...accordionReveal(reduced)}>
            <motion.div
              className="disclose__inner"
              variants={accordionChildren(reduced)}
              initial="hidden"
              animate="shown"
            >
              {children}
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}

/** A staggered child of a Disclose panel. */
export function DiscloseItem({ children, className }: { children: ReactNode; className?: string }) {
  const reduced = Boolean(useReducedMotion());
  return (
    <motion.div className={className} variants={accordionChild(reduced)}>
      {children}
    </motion.div>
  );
}
