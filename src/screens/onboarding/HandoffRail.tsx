import { useEffect, useState } from 'react';
import { Pictogram, type PictogramName } from '../../components/pictograms';

/**
 * DocMatch+ prepares the handoff.
 *
 * Replaces the row that listed Diagnosis, Medication decisions, Treatment
 * decisions and Final clinical judgment as four equal items. Read at a glance,
 * those words looked like DocMatch+ capabilities, because nothing on the screen
 * said whose they were. The boundary is now carried by POSITION rather than by
 * a denial: the four decisions only exist as branches of the Care team node,
 * which sits at the far end of a path that DocMatch+ hands over.
 *
 * MECHANICAL REASONS for the motion:
 *
 *   node, then connector, then node   each connector fills after its source
 *                                     node is lit, so the eye follows the
 *                                     information in the order it moves.
 *   the travelling signal             one small mark runs along each connector
 *                                     once, as it fills. It is the transfer
 *                                     itself, not decoration, and it does not
 *                                     repeat.
 *   decisions branch last             the clinician-only decisions draw out of
 *                                     the Care team node after it is reached,
 *                                     so they visibly belong to it.
 *   Next lights at the end            the action becomes prominent when the
 *                                     story it concludes has finished, which
 *                                     ties it to the rail instead of leaving a
 *                                     large button floating by itself.
 *
 * The sequence plays once per visit to the introduction, not on every stage
 * change, and is instant under reduced motion.
 */
interface RailNode {
  id: string;
  mark: PictogramName;
  title: string;
  detail: string;
  owner: 'patient' | 'docmatch' | 'care-team';
}

const NODES: readonly RailNode[] = [
  {
    id: 'report',
    mark: 'body',
    title: 'What you report',
    detail: 'Location, symptoms and how they have changed',
    owner: 'patient',
  },
  {
    id: 'organize',
    mark: 'summary',
    title: 'DocMatch+ organizes',
    detail: 'A structured intake from your responses',
    owner: 'docmatch',
  },
  {
    id: 'direction',
    mark: 'routing',
    title: 'Specialty direction',
    detail: 'A recommended point of care',
    owner: 'docmatch',
  },
  {
    id: 'care-team',
    mark: 'clinician',
    title: 'Care team',
    detail: 'Clinical assessment and decisions',
    owner: 'care-team',
  },
];

const DECISIONS: readonly { mark: PictogramName; label: string }[] = [
  { mark: 'diagnosis', label: 'Diagnosis' },
  { mark: 'prescription', label: 'Medication' },
  { mark: 'treatment', label: 'Treatment' },
  { mark: 'result', label: 'Final clinical judgment' },
];

/** Reveal steps: one per node, then the decision branch. */
const TOTAL_STEPS = NODES.length + 1;
const STEP_MS = 520;

export interface HandoffRailProps {
  reduced: boolean;
  /** Called once the whole sequence has been revealed. */
  onRevealed?: () => void;
}

export function HandoffRail({ reduced, onRevealed }: HandoffRailProps) {
  const [stepped, setStepped] = useState(0);
  // Under reduced motion the whole sequence is shown at once, derived rather
  // than set, so no render passes through a partial state.
  const revealed = reduced ? TOTAL_STEPS : stepped;

  useEffect(() => {
    if (reduced) return;
    const timers = Array.from({ length: TOTAL_STEPS }, (_, index) =>
      window.setTimeout(() => setStepped(index + 1), 350 + index * STEP_MS),
    );
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [reduced]);

  useEffect(() => {
    if (revealed === TOTAL_STEPS) onRevealed?.();
  }, [revealed, onRevealed]);

  const decisionsShown = revealed >= TOTAL_STEPS;

  return (
    <section className="handoff-rail" aria-labelledby="handoff-rail-title" data-reduced={reduced}>
      <div className="handoff-rail__intro">
        <p className="type-label handoff-rail__title" id="handoff-rail-title">
          DocMatch+ prepares the handoff
        </p>
        <p className="type-caption handoff-rail__lead">
          It organizes what you reported and directs the intake. The care team takes it from there.
        </p>
      </div>

      <ol className="handoff-rail__path">
        {NODES.map((node, index) => {
          const lit = revealed > index;
          const connectorLit = revealed > index + 1;
          const isCareTeam = node.owner === 'care-team';
          return (
            <li className="handoff-rail__step" key={node.id} data-lit={lit} data-owner={node.owner}>
              <span className="handoff-rail__node">
                <span className="handoff-rail__mark" aria-hidden="true">
                  <Pictogram name={node.mark} size={20} state={lit ? (isCareTeam ? 'completed' : 'active') : 'default'} />
                </span>
                <span className="handoff-rail__text">
                  <strong className="type-control handoff-rail__node-title">{node.title}</strong>
                  <span className="type-caption handoff-rail__node-detail">{node.detail}</span>
                </span>
              </span>

              {index < NODES.length - 1 ? (
                <span className="handoff-rail__connector" data-lit={connectorLit} aria-hidden="true">
                  <span className="handoff-rail__connector-fill" />
                  <span className="handoff-rail__signal" />
                </span>
              ) : null}

              {isCareTeam ? (
                <ul
                  className="handoff-rail__decisions"
                  data-shown={decisionsShown}
                  aria-label="Decisions that stay with the care team"
                >
                  {DECISIONS.map((decision, decisionIndex) => (
                    <li
                      className="handoff-rail__decision"
                      key={decision.label}
                      style={{ transitionDelay: reduced ? '0ms' : `${decisionIndex * 90}ms` }}
                    >
                      <span className="handoff-rail__branch" aria-hidden="true" />
                      <span className="handoff-rail__decision-mark" aria-hidden="true">
                        <Pictogram name={decision.mark} size={20} />
                      </span>
                      <span className="type-caption handoff-rail__decision-label">{decision.label}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
