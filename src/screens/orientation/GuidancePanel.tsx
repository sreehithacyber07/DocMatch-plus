import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import type { Stage } from './stages';

export interface GuidancePanelProps {
  stage: Stage;
  index: number;
}

/**
 * The context surface beside the well. Its content is replaced when the stage
 * changes, which is the same relationship the body view will have with the
 * information around it.
 */
export function GuidancePanel({ stage, index }: GuidancePanelProps) {
  const reduceMotion = useReducedMotion();

  return (
    <section
      className="guidance"
      data-register={stage.register}
      data-emission={stage.register === 'critical' ? 'critical' : undefined}
      aria-live="polite"
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          className="guidance__body"
          key={stage.id}
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 5 }}
          animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduceMotion ? 0.12 : 0.22, ease: [0.2, 0, 0, 1] }}
        >
          <p className="guidance__step type-caption">
            Stage {(index + 1).toString().padStart(2, '0')}
          </p>
          <h3 className="guidance__name type-heading-2">{stage.name}</h3>
          <p className="guidance__detail type-body-small">{stage.detail}</p>

          <dl className="guidance__exchange">
            <div className="guidance__exchange-row">
              <dt className="type-caption">You provide</dt>
              <dd className="type-data">{stage.provides}</dd>
            </div>
            <div className="guidance__exchange-row">
              <dt className="type-caption">DocMatch returns</dt>
              <dd className="type-data">{stage.returns}</dd>
            </div>
          </dl>
        </motion.div>
      </AnimatePresence>
    </section>
  );
}
