import { motion, useReducedMotion } from 'framer-motion';
import { crossfade, pathDraw } from '../../styles/motion-variants.ts';
import type { MotifKind } from './question-motif-kind.ts';

/**
 * The question-type motif.
 *
 * One drawn figure per kind of question, occupying the lower area of the
 * interview that was previously blank. It is not decoration standing in for
 * content: it names what is being asked in a second channel, so a patient
 * looking at a duration question sees a duration instrument and a patient
 * looking at a safety question sees the safety register before reading a word.
 *
 * MECHANICAL REASON for the motion: each motif draws along its own stroke when
 * the question changes. A question that merely swapped its text would give no
 * signal that the interview had advanced; the redraw is that signal, and it
 * runs once rather than looping, because a looping diagram reads as a process
 * still running.
 *
 * Drawn on the same 24-unit grid as the pictogram set and stroked with the same
 * tokens, so these belong to the product rather than to an icon library.
 */
interface MotifDefinition {
  /** Stroked paths, drawn in order. */
  strokes: readonly string[];
  /** Filled marks, faded in after the strokes. */
  marks?: readonly { cx: number; cy: number; r: number }[];
  caption: string;
}

const MOTIFS: Readonly<Record<MotifKind, MotifDefinition>> = {
  /* Concentric sensation rings: a quality radiating from one place. */
  character: {
    strokes: ['M12 4a8 8 0 1 0 0 16', 'M12 7.2a4.8 4.8 0 1 0 0 9.6', 'M12 2v3M12 19v3'],
    marks: [{ cx: 12, cy: 12, r: 1.6 }],
    caption: 'What it feels like',
  },
  /* A rising ramp: magnitude. */
  intensity: {
    strokes: ['M3 19h18', 'M5 17V15M9 17v-4M13 17V9.5M17 17V5.5'],
    caption: 'How strong it feels',
  },
  /* A clock arc: elapsed time. */
  duration: {
    strokes: ['M12 3a9 9 0 1 0 9 9', 'M12 7v5l3.6 2.2'],
    marks: [{ cx: 21, cy: 12, r: 1.3 }],
    caption: 'How long it has lasted',
  },
  /* A gradual curve against a sudden strike. */
  onset: {
    strokes: ['M3 19c6 0 9-4 11-11', 'M17.5 5.5 21 19'],
    caption: 'How it began',
  },
  /* A continuous line against a pulse line. */
  pattern: {
    strokes: ['M3 9h18', 'M3 16h3l2-4 2 8 2-8 2 4h6'],
    caption: 'How it behaves',
  },
  /* Three trajectories: improving, level, worsening. */
  change: {
    strokes: ['M3 17 10 10', 'M3 12h7', 'M3 7 10 14', 'M13 12h8'],
    marks: [{ cx: 21, cy: 12, r: 1.4 }],
    caption: 'Which way it is going',
  },
  /* A situation marker on a baseline. */
  context: {
    strokes: ['M3 18h18', 'M8 18V9M16 18v-6'],
    marks: [
      { cx: 8, cy: 7.4, r: 1.5 },
      { cx: 16, cy: 10.4, r: 1.5 },
    ],
    caption: 'When you notice it',
  },
  /* A second point joined to the first: where else it is felt. */
  location: {
    strokes: ['M6.5 7.5a3 3 0 1 0 0.01 0', 'M8.6 9.6 15.4 14.4'],
    marks: [
      { cx: 6.5, cy: 10.5, r: 1.4 },
      { cx: 17.5, cy: 16, r: 1.6 },
    ],
    caption: 'Where you feel it',
  },
  /* A branch: the answer selects the next question. */
  routing: {
    strokes: ['M3 12h5', 'M8 12 15 6', 'M8 12l7 6'],
    marks: [
      { cx: 3, cy: 12, r: 1.5 },
      { cx: 16.4, cy: 5.4, r: 1.6 },
      { cx: 16.4, cy: 18.6, r: 1.6 },
    ],
    caption: 'Your answer decides what comes next',
  },
  /* A parallel rail carrying a warning mark. */
  safety: {
    strokes: ['M3 8h18', 'M12 11.5v4.5'],
    marks: [{ cx: 12, cy: 19.2, r: 1.5 }],
    caption: 'Checked before the assessment continues',
  },
};

export function QuestionMotif({ kind }: { kind: MotifKind }) {
  const reduced = Boolean(useReducedMotion());
  const motif = MOTIFS[kind];

  return (
    <motion.figure className="motif" data-kind={kind} key={kind} {...crossfade(reduced)}>
      <span className="motif__field" aria-hidden="true" />
      <svg className="motif__art" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        {motif.strokes.map((d, index) => (
          <motion.path key={d} d={d} {...pathDraw(reduced, 0.08 + index * 0.12, 0.7)} />
        ))}
        {motif.marks?.map((mark, index) => (
          <motion.circle
            key={`${mark.cx}-${mark.cy}`}
            cx={mark.cx}
            cy={mark.cy}
            r={mark.r}
            className="motif__mark"
            {...crossfade(reduced, reduced ? 0 : 0.4 + index * 0.08)}
          />
        ))}
      </svg>
      <figcaption className="type-caption motif__caption">{motif.caption}</figcaption>
    </motion.figure>
  );
}
