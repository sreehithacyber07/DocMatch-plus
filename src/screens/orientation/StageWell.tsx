import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Pictogram } from '../../components/pictograms';
import type { Stage } from './stages';

export interface StageWellProps {
  stage: Stage;
  index: number;
  total: number;
  panelId: string;
  labelledBy: string;
}

function ordinal(value: number) {
  return value.toString().padStart(2, '0');
}

/**
 * The dominant volume of the screen. In R0 it holds the active stage's mark.
 * Its proportions, grounding line and light field are sized for the interactive
 * body that will occupy this same slot later, so the surrounding interface does
 * not have to change shape to receive it.
 */
export function StageWell({ stage, index, total, panelId, labelledBy }: StageWellProps) {
  const reduceMotion = useReducedMotion();
  const critical = stage.register === 'critical';

  return (
    <div
      className="well"
      data-register={critical ? 'critical' : undefined}
      data-emission={critical ? 'critical' : 'foundation'}
      id={panelId}
      role="tabpanel"
      aria-labelledby={labelledBy}
      tabIndex={0}
    >
      <span className="well__light" aria-hidden="true" />
      <span className="well__floor" aria-hidden="true" />

      <p className="well__index type-caption">
        Stage {ordinal(index + 1)} of {ordinal(total)}
      </p>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          className="well__occupant"
          key={stage.id}
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 10 }}
          animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -5 }}
          transition={{ duration: reduceMotion ? 0.12 : 0.28, ease: [0.2, 0, 0, 1] }}
        >
          <span className="well__mark">
            <Pictogram
              name={stage.pictogram}
              size={40}
              state={critical ? 'critical' : 'active'}
            />
          </span>
          <h2 className="well__name type-display">{stage.name}</h2>
          <p className="well__action type-body">{stage.action}</p>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
