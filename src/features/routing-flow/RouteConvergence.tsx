import { motion } from 'framer-motion';
import { SpecialtyGlyph } from './SpecialtyGlyph.tsx';
import type { EvidenceTraceItem } from './routing-presentation.ts';

export interface RouteConvergenceProps {
  /** The strongest positive evidence from buildClinicalRoutingExplanation, as given. */
  evidence: readonly EvidenceTraceItem[];
  selected: { registryId: string; label: string };
  reduced: boolean;
}

/**
 * How the patient's own answers converge on the direction.
 *
 * Every element is real session data: the answers are the strongest positive
 * evidence the engine recorded and the destination is the selected direction.
 * Nothing is scored or estimated here. There is no route strength, no list of
 * other specialties and no percentage: those came from the heuristic
 * demonstration model, and a patient would read them as calibrated clinical
 * confidence, which they are not.
 *
 * MECHANICAL REASON for the motion: each line draws from an answer into the
 * direction, which is the relationship the figure exists to show. With reduced
 * motion the finished figure appears at once. The list of answers is readable
 * text, so the figure never carries information by itself.
 */
export function RouteConvergence({ evidence, selected, reduced }: RouteConvergenceProps) {
  const rows = evidence.length;
  const draw = (index: number) =>
    reduced
      ? { initial: false as const }
      : {
          initial: { pathLength: 0 },
          animate: { pathLength: 1 },
          transition: { duration: 0.6, ease: [0.2, 0, 0, 1] as const, delay: 0.2 + index * 0.12 },
        };

  return (
    <figure className="convergence" aria-labelledby="convergence-caption" data-rows={rows}>
      <figcaption className="type-caption convergence__caption" id="convergence-caption">
        Your answers that most supported this direction
      </figcaption>

      <div className="convergence__grid">
        <ol className="convergence__evidence">
          {evidence.map((item) => (
            <li className="convergence__answer" key={`${item.questionId}-${item.optionId}`}>
              <span className="type-caption convergence__question">{item.question}</span>
              <strong className="type-control convergence__value">{item.answer}</strong>
            </li>
          ))}
        </ol>

        <svg className="convergence__lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" focusable="false">
          {evidence.map((item, index) => {
            const y = ((index + 0.5) / rows) * 100;
            return (
              <motion.path
                key={`${item.questionId}-${item.optionId}`}
                className="convergence__line"
                d={`M0 ${y} C 55 ${y}, 45 50, 100 50`}
                vectorEffect="non-scaling-stroke"
                {...draw(index)}
              />
            );
          })}
        </svg>

        <div className="convergence__destination">
          <motion.span
            className="convergence__glyph"
            layoutId={reduced ? undefined : `route-glyph-${selected.registryId}`}
            aria-hidden="true"
          >
            <SpecialtyGlyph specialty={selected.registryId} size={28} />
          </motion.span>
          <span className="convergence__direction">
            <small className="type-caption">Clinical direction</small>
            <strong className="type-control">{selected.label}</strong>
          </span>
        </div>
      </div>

    </figure>
  );
}
