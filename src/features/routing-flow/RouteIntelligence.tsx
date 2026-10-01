import { useId, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { BeliefHistoryEntry, ReadonlyBelief } from '../../engine/index.ts';
import { EASE } from '../../styles/motion-variants.ts';
import { SessionTimeline, type TimelineEntry } from './SessionTimeline.tsx';
import { SpecialtyGlyph } from './SpecialtyGlyph.tsx';
import {
  buildRouteVisualization,
  type RouteDirectionView,
  type RouteVisualizationModel,
} from './routing-presentation.ts';
import { isRoutingDebugEnabled } from './routing-debug.ts';

interface RouteIntelligenceProps {
  belief: ReadonlyBelief;
  history: readonly BeliefHistoryEntry[];
  latestEntry?: TimelineEntry;
  reduceMotion: boolean;
  /** When given, directions outside this set are internal state and are never drawn. */
  eligibleRegistryIds?: readonly string[];
}

/** The compact, live specialty-direction instrument. */
export function RouteIntelligence({ belief, history, latestEntry, reduceMotion, eligibleRegistryIds }: RouteIntelligenceProps) {
  const model = buildRouteVisualization({
    belief,
    history,
    eligibleRegistryIds,
    latestAnswerKind: latestEntry?.kind ?? 'initial',
    latestQuestionId: latestEntry?.questionId,
  });
  return <RouteField model={model} latestEntry={latestEntry} reduceMotion={reduceMotion} />;
}

function RouteField({
  model,
  latestEntry,
  reduceMotion,
}: {
  model: RouteVisualizationModel;
  latestEntry?: TimelineEntry;
  reduceMotion: boolean;
}) {
  return (
    <section className="route-field" aria-labelledby="route-field-title">
      <div className="route-field__head">
        <span className="route-field__beacon" aria-hidden="true" />
        <span>
          <p className="type-label route-field__title" id="route-field-title">
            Internal routing state (development only)
          </p>
          <p className="type-caption route-field__scope">Heuristic demonstration values; never shown to patients</p>
        </span>
      </div>

      <p className="type-caption route-field__announcement" aria-live="polite" aria-atomic="true">
        {model.announcement}
      </p>

      <DirectionList directions={model.visibleDirections} reduceMotion={reduceMotion} />

      {model.otherDirections.length > 0 ? (
        <details className="route-field__other">
          <summary className="type-caption">Other directions ({model.otherDirections.length})</summary>
          <DirectionList directions={model.otherDirections} reduceMotion={true} secondary />
        </details>
      ) : null}

      <AnimatePresence initial={false} mode="wait">
        {model.status === 'routing-updated' && model.changes.length > 0 ? (
          <motion.div
            className="route-update"
            key={model.changes.map((change) => `${change.questionId}-${change.label}`).join('-')}
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -5 }}
            transition={{ duration: reduceMotion ? 0.1 : 0.3, ease: EASE }}
          >
            <p className="type-caption route-update__title">What changed</p>
            <ul>
              {model.changes.map((change) => (
                <li key={`${change.questionId}-${change.engineSpecialtyId}`}>
                  <span className="route-update__movement" aria-hidden="true">
                    {change.movement === 'increased' ? '\u2191' : '\u2193'}
                  </span>
                  <span>
                    <strong className="type-control">{change.label}</strong>
                    <small className="type-caption">
                      {change.movement === 'increased' ? 'More supported' : 'Less prominent'} after &quot;{latestEntry?.label ?? change.optionId}&quot;
                    </small>
                  </span>
                </li>
              ))}
            </ul>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}

function DirectionList({
  directions,
  reduceMotion,
  secondary = false,
}: {
  directions: readonly RouteDirectionView[];
  reduceMotion: boolean;
  secondary?: boolean;
}) {
  return (
    <motion.ol className="direction-list" data-secondary={secondary} layout={!reduceMotion}>
      <AnimatePresence initial={false} mode="popLayout">
        {directions.map((direction) => (
          <motion.li
            className="direction"
            key={direction.registryId}
            layout={!reduceMotion}
            aria-label={direction.ariaLabel}
            initial={reduceMotion ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
            transition={{ duration: reduceMotion ? 0 : 0.34, ease: EASE }}
          >
            <motion.span
              className="direction__glyph"
              layoutId={reduceMotion ? undefined : `route-glyph-${direction.registryId}`}
              aria-hidden="true"
            >
              <SpecialtyGlyph specialty={direction.registryId} size={22} />
            </motion.span>
            <span className="direction__body">
              <span className="direction__label-line">
                <strong className="type-control">{direction.label}</strong>
                <small className="type-caption">{direction.strength}</small>
              </span>
              <span className="direction__trace" aria-hidden="true">
                <motion.span
                  className="direction__trace-fill"
                  initial={false}
                  animate={{ scaleX: direction.traceStrength }}
                  transition={{ duration: reduceMotion ? 0 : 0.48, ease: EASE }}
                />
                <motion.span
                  className="direction__trace-node"
                  initial={false}
                  animate={{ left: `${direction.traceStrength * 100}%` }}
                  transition={{ duration: reduceMotion ? 0 : 0.48, ease: EASE }}
                />
              </span>
            </span>
          </motion.li>
        ))}
      </AnimatePresence>
    </motion.ol>
  );
}

export interface InterviewIntelligenceRailProps extends RouteIntelligenceProps {
  complaintLabel: string;
  regionSummary: string | null;
  timeline: readonly TimelineEntry[];
  status: string;
  onChange: (questionId: string) => void;
}

/**
 * The patient-facing side panel during the interview.
 *
 * It shows what the patient has said and that the direction is being refined.
 * It never shows specialty names, rankings or strengths while questions are
 * being answered: those are internal model state (see routing-debug.ts).
 */
export function InterviewIntelligenceRail(props: InterviewIntelligenceRailProps) {
  // Keep the static DEV gate here so the entire internal rail is absent from production bundles.
  if (typeof import.meta.env !== 'undefined' && import.meta.env.DEV && isRoutingDebugEnabled()) {
    return <DebugIntelligenceRail {...props} />;
  }
  const { complaintLabel, regionSummary, timeline, status, onChange, reduceMotion } = props;
  return (
    <>
      <div className="intelligence-rail intelligence-rail--desktop">
        <RefiningStatus />
        <SessionTimeline
          complaintLabel={complaintLabel}
          regionSummary={regionSummary}
          status={status}
          timeline={timeline}
          reduceMotion={reduceMotion}
          onChange={onChange}
        />
      </div>
      <div className="intelligence-rail intelligence-rail--mobile">
        <details className="route-sheet route-sheet--session">
          <summary>
            <span>
              <small className="type-caption">Refining your clinical direction</small>
              <strong className="type-control">{timeline.length} responses captured</strong>
            </span>
            <span className="route-sheet__chevron" aria-hidden="true">v</span>
          </summary>
          <SessionTimeline
            complaintLabel={complaintLabel}
            regionSummary={regionSummary}
            status={status}
            timeline={timeline}
            reduceMotion={reduceMotion}
            onChange={onChange}
          />
        </details>
      </div>
    </>
  );
}

function RefiningStatus() {
  return (
    <section className="refining-status" aria-labelledby="refining-status-title">
      <p className="type-label refining-status__title" id="refining-status-title">
        <span className="route-field__beacon" aria-hidden="true" />
        Refining your clinical direction
      </p>
      <p className="type-caption refining-status__body">
        Each answer decides what is asked next. A direction is shown once the questions are complete.
      </p>
    </section>
  );
}

/** The developer view: the internal belief ranking, behind ?debug=routing in development only. */
function DebugIntelligenceRail({
  complaintLabel,
  regionSummary,
  timeline,
  status,
  onChange,
  ...routeProps
}: InterviewIntelligenceRailProps) {
  const [mode, setMode] = useState<'route' | 'session'>('route');
  const id = useId();
  const latestEntry = timeline.at(-1);
  const topDirection = buildRouteVisualization({
    belief: routeProps.belief,
    history: routeProps.history,
    eligibleRegistryIds: routeProps.eligibleRegistryIds,
    latestAnswerKind: latestEntry?.kind ?? 'initial',
    latestQuestionId: latestEntry?.questionId,
    maxVisible: 1,
  }).visibleDirections[0];

  return (
    <>
      <div className="intelligence-rail intelligence-rail--desktop">
        <div className="intelligence-rail__tabs" role="tablist" aria-label="Interview information">
          {(['route', 'session'] as const).map((item) => (
            <button
              key={item}
              id={`${id}-${item}-tab`}
              type="button"
              role="tab"
              aria-selected={mode === item}
              aria-controls={`${id}-${item}-panel`}
              className="type-label"
              onClick={() => setMode(item)}
            >
              {item === 'route' ? 'Route' : 'Session'}
            </button>
          ))}
        </div>
        <AnimatePresence initial={false} mode="wait">
          {mode === 'route' ? (
            <motion.div
              key="route"
              id={`${id}-route-panel`}
              role="tabpanel"
              aria-labelledby={`${id}-route-tab`}
              initial={routeProps.reduceMotion ? { opacity: 0 } : { opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={routeProps.reduceMotion ? { opacity: 0 } : { opacity: 0, x: -6 }}
              transition={{ duration: routeProps.reduceMotion ? 0.1 : 0.24, ease: EASE }}
            >
              <RouteIntelligence {...routeProps} latestEntry={latestEntry} />
            </motion.div>
          ) : (
            <motion.div
              key="session"
              id={`${id}-session-panel`}
              role="tabpanel"
              aria-labelledby={`${id}-session-tab`}
              initial={routeProps.reduceMotion ? { opacity: 0 } : { opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={routeProps.reduceMotion ? { opacity: 0 } : { opacity: 0, x: -6 }}
              transition={{ duration: routeProps.reduceMotion ? 0.1 : 0.24, ease: EASE }}
            >
              <SessionTimeline
                complaintLabel={complaintLabel}
                regionSummary={regionSummary}
                status={status}
                timeline={timeline}
                reduceMotion={routeProps.reduceMotion}
                onChange={onChange}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="intelligence-rail intelligence-rail--mobile">
        <details className="route-sheet">
          <summary>
            <span>
              <small className="type-caption">Current route</small>
              <strong className="type-control">{topDirection?.label ?? 'Refining directions'}</strong>
            </span>
            <span className="route-sheet__chevron" aria-hidden="true">v</span>
          </summary>
          <RouteIntelligence {...routeProps} latestEntry={latestEntry} />
        </details>
        <details className="route-sheet route-sheet--session">
          <summary>
            <span>
              <small className="type-caption">Session</small>
              <strong className="type-control">{timeline.length} responses captured</strong>
            </span>
            <span className="route-sheet__chevron" aria-hidden="true">v</span>
          </summary>
          <SessionTimeline
            complaintLabel={complaintLabel}
            regionSummary={regionSummary}
            status={status}
            timeline={timeline}
            reduceMotion={routeProps.reduceMotion}
            onChange={onChange}
          />
        </details>
      </div>
    </>
  );
}
