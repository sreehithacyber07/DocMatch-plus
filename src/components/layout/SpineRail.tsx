import { motion, useReducedMotion } from 'framer-motion';
import { Pictogram, type PictogramName } from '../pictograms';

export interface SpineStage {
  name: string;
  pictogram: PictogramName;
}

export interface SpineRailProps {
  stage: string;
  stagePosition?: {
    current: number;
    total: number;
  };
  /** Full stage set. When supplied the rail becomes a navigable index. */
  stages?: SpineStage[];
  onSelectStage?: (index: number) => void;
  /** Marks the active stage as a safety-register step. */
  criticalIndex?: number;
}

function formatPosition(value: number) {
  return Math.max(0, Math.round(value)).toString().padStart(2, '0');
}

export function SpineRail({
  stage,
  stagePosition,
  stages,
  onSelectStage,
  criticalIndex,
}: SpineRailProps) {
  const reduceMotion = useReducedMotion();
  const total = stagePosition?.total ?? stages?.length ?? 0;
  const current = stagePosition?.current ?? 1;
  const progress = stagePosition ? `${formatPosition(current)} / ${formatPosition(total)}` : null;

  const nodes = Array.from({ length: total }, (_, index) => {
    const position = index + 1;
    const state =
      position < current ? 'completed' : position === current ? 'active' : 'upcoming';
    return { position, state, stage: stages?.[index] };
  });

  const navigable = Boolean(stages && onSelectStage);

  return (
    <aside className="spine-rail" data-emission="structural" aria-label="DocMatch orientation">
      <div className="spine-rail__identity">
        <img className="spine-rail__logo" src="/logo.png" alt="DocMatch" draggable={false} />
      </div>

      <div className="spine-rail__axis-region">
        <span className="spine-rail__axis-line" aria-hidden="true" />
        <ul
          className="spine-rail__nodes"
          aria-label={navigable ? 'Stages' : undefined}
          role={navigable ? undefined : 'presentation'}
        >
          {nodes.map((node) => {
            const label = node.stage
              ? `Stage ${formatPosition(node.position)}, ${node.stage.name}`
              : `Stage ${formatPosition(node.position)}`;
            const isCritical = criticalIndex === node.position - 1;

            const body = (
              <>
                {node.state === 'active' && (
                  <motion.span
                    className="spine-rail__node-lit"
                    layoutId={reduceMotion ? undefined : 'spine-rail-active'}
                    data-register={isCritical ? 'critical' : undefined}
                    transition={{ duration: 0.32, ease: [0.2, 0, 0, 1] }}
                    aria-hidden="true"
                  />
                )}
                <span className="spine-rail__node-mark" aria-hidden="true">
                  {node.stage ? (
                    <Pictogram
                      name={node.stage.pictogram}
                      size={20}
                      state={
                        isCritical && node.state === 'active'
                          ? 'critical'
                          : node.state === 'active'
                            ? 'active'
                            : node.state === 'completed'
                              ? 'completed'
                              : 'default'
                      }
                    />
                  ) : (
                    /* Callers that pass only a position get a plain mark. A node
                       must never render as an empty box. */
                    <span className="spine-rail__node-dot" />
                  )}
                </span>
              </>
            );

            return (
              <li className="spine-rail__node" data-state={node.state} key={node.position}>
                {navigable ? (
                  <button
                    className="spine-rail__node-control"
                    type="button"
                    onClick={() => onSelectStage?.(node.position - 1)}
                    aria-current={node.state === 'active' ? 'step' : undefined}
                    aria-label={label}
                  >
                    {body}
                  </button>
                ) : (
                  <span className="spine-rail__node-control" aria-hidden="true">
                    {body}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      <div className="spine-rail__stage">
        <span className="spine-rail__stage-label">{stage}</span>
        {progress ? <span className="spine-rail__position">{progress}</span> : null}
      </div>
    </aside>
  );
}
