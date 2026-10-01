import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Pictogram } from '../../components/pictograms';
import { SessionTimeline, type TimelineEntry } from './SessionTimeline.tsx';
import { priorityPresentationFor, type DeploymentMode } from '../trust/deployment.ts';

const EASE = [0.2, 0, 0, 1] as const;

export interface PriorityEscalationProps {
  severity: 'emergency' | 'urgent';
  mustStop: boolean;
  actionLabel: string;
  secondaryLabel?: string;
  headline: string;
  guidance: string;
  deploymentMode: DeploymentMode;
  indicator: string;
  complaintLabel: string;
  regionSummary: string | null;
  timeline: TimelineEntry[];
  reduceMotion: boolean;
  onNewPatient: () => void;
}

/**
 * Priority escalation.
 *
 * The same room as the rest of the product, lit differently: the ocean base is
 * unchanged and a localized red field rises behind the content, so this reads as
 * the product reacting rather than a separate application taking over. There is
 * no bordered rectangle around the state. Structure comes from one vertical
 * urgent rail and an open column of fields.
 *
 * Inside a staffed facility the primary action is the care team; the emergency
 * number stays available but secondary, because walking a patient out of a
 * hospital to call an ambulance would be the wrong instruction.
 */
export function PriorityEscalation({
  severity,
  mustStop,
  actionLabel,
  secondaryLabel,
  headline,
  guidance,
  deploymentMode,
  indicator,
  complaintLabel,
  regionSummary,
  timeline,
  reduceMotion,
  onNewPatient,
}: PriorityEscalationProps) {
  const [localActionShown, setLocalActionShown] = useState(false);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const presentation = priorityPresentationFor(deploymentMode, {
    actionLabel,
    secondaryLabel,
    headline,
    guidance,
  });

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  const rise = (delay: number) => ({
    initial: reduceMotion ? { opacity: 0 } : { opacity: 0, y: 14 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: reduceMotion ? 0.12 : 0.5, ease: EASE, delay: reduceMotion ? 0 : delay },
  });

  return (
    <div
      className="priority"
      data-severity={severity}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="priority-headline"
      aria-describedby="priority-guidance priority-indicator"
    >
      {/* The localized escalation field. It belongs to this state only and
          fades in with it, so the room changes rather than the application. */}
      <motion.span
        className="priority__field"
        aria-hidden="true"
        initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 1.06 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: reduceMotion ? 0.12 : 0.9, ease: EASE }}
      />

      <section className="priority__state">
        <span className="priority__rail" aria-hidden="true" />

        <motion.div className="priority__symbol" aria-hidden="true" {...rise(0)}>
          <span className="priority__orbit" />
          <Pictogram name="priority" size={40} state="critical" />
        </motion.div>

        <motion.p className="type-label priority__eyebrow" {...rise(0.06)}>
          Clinical safety alert
        </motion.p>

        <motion.h1
          ref={titleRef}
          className="type-heading-1 priority__headline"
          id="priority-headline"
          tabIndex={-1}
          {...rise(0.12)}
        >
          Immediate clinical assessment is recommended
        </motion.h1>

        <motion.div className="priority__actions" {...rise(0.18)}>
          {presentation.primaryKind === 'local-instruction' ? (
            <button className="urgent-action" type="button" onClick={() => setLocalActionShown(true)}>
              <Pictogram name="handoff" size={20} state="critical" />
              <span className="type-control">{presentation.primaryLabel}</span>
            </button>
          ) : presentation.primaryKind === 'telephone' ? (
            <a className="urgent-action" href="tel:112">
              <Pictogram name="assistance" size={20} state="critical" />
              <span className="type-control">{presentation.primaryLabel}</span>
            </a>
          ) : (
            <p className="type-control priority__remote">{presentation.primaryLabel}</p>
          )}
        </motion.div>

        <motion.p className="type-body priority__guidance" id="priority-guidance" {...rise(0.24)}>
          Normal specialty routing has been paused because one of the answers needs prompt clinical attention.
          {' '}This is not a diagnosis. {presentation.guidance}
        </motion.p>

        <motion.div className="priority__indicator" id="priority-indicator" {...rise(0.3)}>
          <span className="priority__indicator-mark" aria-hidden="true">
            <Pictogram name="alert" size={20} state="critical" />
          </span>
          <span>
            <small className="type-caption">Warning sign identified</small>
            <strong className="type-control">{indicator}</strong>
          </span>
        </motion.div>

        {localActionShown && presentation.confirmation ? (
          <p className="priority__prototype type-caption" role="status">
            {presentation.confirmation}
          </p>
        ) : null}

        <p className="priority__fallback type-caption">{presentation.fallback}</p>

        <button className="link-action priority__restart" type="button" onClick={onNewPatient}>
          Start new patient
        </button>
      </section>

      <aside className="priority__aside" aria-label="Session snapshot">
        <SessionTimeline
          complaintLabel={complaintLabel}
          regionSummary={regionSummary}
          status={mustStop ? 'Routing paused / Priority clinical review required' : 'Routing paused / Priority clinical review'}
          timeline={timeline}
          reduceMotion={reduceMotion}
        />
      </aside>
    </div>
  );
}
