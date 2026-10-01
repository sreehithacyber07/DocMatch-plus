import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { nodeEnter, timelineInsert } from '../../styles/motion-variants.ts';
import type { TimelineEntry } from './timeline-types.ts';
export type { TimelineEntry } from './timeline-types.ts';

export interface SessionTimelineProps {
  complaintLabel: string;
  regionSummary: string | null;
  status: string;
  timeline: readonly TimelineEntry[];
  reduceMotion?: boolean;
  onChange?: (questionId: string) => void;
}

/**
 * The session, as an open trail.
 *
 * One thin line with a node per answer. No panel, no boxed rows, no card: the
 * rail is carried by the line and the type, which is what lets it sit in a
 * narrow column without reading as a dashboard widget.
 *
 * Order is oldest first, so the line grows downward the way the conversation
 * ran and a new answer always appears at the end rather than displacing the
 * ones above it. Each entry enters by height and opacity together, so the
 * entries below are pushed by the real size of the new one instead of jumping.
 */
export function SessionTimeline({
  complaintLabel,
  regionSummary,
  status,
  timeline,
  reduceMotion,
  onChange,
}: SessionTimelineProps) {
  const preference = Boolean(useReducedMotion());
  const reduced = reduceMotion ?? preference;
  const entries = timeline.slice(-8);

  return (
    <section className="trail" aria-label="Session">
      <p className="type-label trail__title">Session</p>

      <div className="trail__identity">
        <strong className="type-control trail__concern">{complaintLabel}</strong>
        <span className="type-caption trail__place">{regionSummary ?? 'Confirmed body region'}</span>
      </div>

      <p className="type-caption trail__section">Response trail</p>

      {entries.length === 0 ? (
        <div className="trail__start" aria-hidden="true">
          <span className="trail__node trail__node--pending" />
          <span className="trail__stub" />
        </div>
      ) : (
        <ol className="trail__list">
          <AnimatePresence initial={false}>
            {entries.map((entry, index) => (
              <motion.li
                className="trail__entry"
                key={`${entry.kind}-${entry.questionId}`}
                data-kind={entry.kind}
                {...timelineInsert(reduced)}
              >
                <span className="trail__rail" aria-hidden="true" />
                <motion.span className="trail__node" aria-hidden="true" {...nodeEnter(reduced, index)} />
                {entry.changeable && onChange ? (
                  <button className="trail__body" type="button" onClick={() => onChange(entry.questionId)}>
                    <span className="trail__label type-caption">{entry.text}</span>
                    <strong className="trail__value type-control">{entry.label}</strong>
                    <span className="trail__change type-caption">Change</span>
                  </button>
                ) : (
                  <span className="trail__body">
                    <span className="trail__label type-caption">{entry.text}</span>
                    <strong className="trail__value type-control">{entry.label}</strong>
                  </span>
                )}
              </motion.li>
            ))}
          </AnimatePresence>
        </ol>
      )}

      <div className="trail__status">
        <span className="type-caption trail__status-label">Status</span>
        <strong className="type-control trail__status-value">{status}</strong>
      </div>
    </section>
  );
}
