import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { EASE, pathDraw } from '../../styles/motion-variants.ts';
import { BODY_ASSETS } from '../../features/body-explorer/artwork/bodyAssetRegistry.ts';

interface SceneProps {
  reduced: boolean;
}

/** Illustrative answers, never read from or written to the patient session. */
export function ClarifyScene({ reduced }: SceneProps) {
  const [level, setLevel] = useState(1);
  const [assetFailed, setAssetFailed] = useState(false);

  useEffect(() => {
    if (reduced) return;
    const second = window.setTimeout(() => setLevel(2), 1000);
    const third = window.setTimeout(() => setLevel(3), 1450);
    return () => {
      window.clearTimeout(second);
      window.clearTimeout(third);
    };
  }, [reduced]);

  const steps = [
    { question: 'What does it feel like?', field: 'Character', value: 'Burning' },
    { question: 'How strong is it?', field: 'Intensity', value: `${reduced ? 3 : level} / 5` },
    { question: 'How long has it been?', field: 'Duration', value: 'Today' },
  ];

  return (
    <div className="ovisual__scene clarify-scene">
      <p className="ovisual__micro">Example intake signals</p>
      <div className="clarify-scene__body">
        {assetFailed ? (
          <span className="clarify-scene__asset-fallback">Anatomy visual temporarily unavailable</span>
        ) : (
          <img src={BODY_ASSETS.male.hologram.front} alt="" draggable={false} onError={() => setAssetFailed(true)} />
        )}
        <motion.span
          className="clarify-scene__anchor"
          initial={reduced ? false : { opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: reduced ? 0 : 0.3, ease: EASE, delay: reduced ? 0 : 0.22 }}
        />
        <motion.div
          className="clarify-scene__location"
          initial={reduced ? false : { opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: reduced ? 0 : 0.34, ease: EASE, delay: reduced ? 0 : 0.38 }}
        >
          <span>Location</span>
          <strong>Upper abdomen</strong>
        </motion.div>
      </div>
      <div className="clarify-scene__sequence">
        {steps.map((step, index) => (
          <motion.div
            className="clarify-scene__step"
            key={step.field}
            initial={reduced ? false : { opacity: 0, y: 9 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduced ? 0 : 0.36, ease: EASE, delay: reduced ? 0 : 0.55 + index * 0.34 }}
          >
            <span className="clarify-scene__question">{step.question}</span>
            <span className="clarify-scene__answer">
              <span>{step.field}</span>
              {step.field === 'Duration' ? (
                <svg className="clarify-scene__clock" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <motion.path d="M12 3a9 9 0 1 1-9 9" {...pathDraw(reduced, 1.3, 0.4)} />
                  <path d="M12 6v6l4 2" />
                </svg>
              ) : null}
              <strong>{step.value}</strong>
            </span>
            {index === 0 ? (
              <span className="clarify-scene__choices">Other answers: Cramping / Pressure</span>
            ) : null}
          </motion.div>
        ))}
      </div>
    </div>
  );
}

/** A warning example: the assessment stops while its parallel safety rail escalates. */
export function CheckScene({ reduced }: SceneProps) {
  return (
    <div className="ovisual__scene check-scene">
      <p className="ovisual__micro">Example warning response</p>
      <svg viewBox="0 0 540 330" role="presentation" focusable="false">
        <text className="check-scene__heading" x="54" y="75">ASSESSMENT</text>
        <text className="check-scene__heading" x="54" y="177">SAFETY MONITORING</text>
        <path className="check-scene__base" d="M54 111H486" />
        <path className="check-scene__base" d="M54 213H486" />
        <motion.path className="check-scene__assessment" d="M54 111H280" {...pathDraw(reduced, 0.12, 0.68)} />
        <motion.path className="check-scene__safety" d="M54 213H280" {...pathDraw(reduced, 0.28, 0.68)} />
        <motion.path className="check-scene__interrupt" d="M280 213V111" {...pathDraw(reduced, 0.88, 0.3)} />
        <motion.circle
          className="check-scene__warning-halo"
          cx="280" cy="213" r="19"
          initial={reduced ? false : { opacity: 0, scale: 0.7 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: reduced ? 0 : 0.35, ease: EASE, delay: reduced ? 0 : 0.87 }}
        />
        <motion.circle
          className="check-scene__warning"
          cx="280" cy="213" r="5"
          initial={reduced ? false : { opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: reduced ? 0 : 0.3, ease: EASE, delay: reduced ? 0 : 0.92 }}
        />
        <motion.g
          initial={reduced ? false : { opacity: 0, x: 10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: reduced ? 0 : 0.36, ease: EASE, delay: reduced ? 0 : 1.12 }}
        >
          <text className="check-scene__result" x="309" y="105">ROUTING PAUSED</text>
          <text className="check-scene__review" x="309" y="207">CLINICAL REVIEW</text>
          <text className="check-scene__detail" x="309" y="228">Warning sign identified</text>
        </motion.g>
      </svg>
    </div>
  );
}

const ROUTE_SIGNALS = [
  { label: 'Location', y: 70 },
  { label: 'Character', y: 120 },
  { label: 'Intensity', y: 170 },
  { label: 'Duration', y: 220 },
  { label: 'Responses', y: 270 },
] as const;

/* Candidate directions leaving the routing core. Only the middle one is lit;
   the others end in open nodes. None is named, because the onboarding has no
   patient and so no real direction to show. */
const ROUTE_CANDIDATES = [
  { y: 92, chosen: false },
  { y: 170, chosen: true },
  { y: 248, chosen: false },
] as const;

/**
 * Route.
 *
 * Named intake streams converge through the routing core, which fans out to
 * candidate directions; one is lit and the others stop at open nodes. The
 * scene ends at the specialty direction. The handoff is its own stage.
 *
 * Illustrative only: no specialty is named and no score or confidence value is
 * shown, because the onboarding has no session to draw them from.
 */
export function RouteScene({ reduced }: SceneProps) {
  const at = (delay: number) => (reduced ? 0 : delay);
  const appear = (delay: number, from: { x?: number; y?: number; scale?: number } = {}) => ({
    initial: reduced ? false : { opacity: 0, ...from },
    animate: { opacity: 1, x: 0, y: 0, scale: 1 },
    transition: { duration: reduced ? 0 : 0.34, ease: EASE, delay: at(delay) },
  });

  return (
    <div className="ovisual__scene route-scene">
      <p className="ovisual__micro">From your answers to a specialty direction</p>
      <svg viewBox="0 0 660 350" role="presentation" focusable="false">
        <defs>
          <linearGradient id="route-trace" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" style={{ stopColor: 'var(--color-border-structural)' }} />
            <stop offset="1" style={{ stopColor: 'var(--color-border-interactive)' }} />
          </linearGradient>
        </defs>
        {/* Intake streams into the routing core. */}
        {ROUTE_SIGNALS.map((signal, index) => {
          const path = `M150 ${signal.y} C215 ${signal.y}, 225 170, 272 170`;
          return (
            <g key={signal.label}>
              <text className="route-scene__signal" x="8" y={signal.y + 5}>{signal.label}</text>
              <circle className="route-scene__source" cx="143" cy={signal.y} r="3" />
              <path className="route-scene__path-base" d={path} />
              <motion.path className="route-scene__trace" d={path} {...pathDraw(reduced, 0.12 + index * 0.1, 0.5)} />
            </g>
          );
        })}

        <circle className="route-scene__core-outer" cx="304" cy="170" r="32" />
        <circle className="route-scene__core-inner" cx="304" cy="170" r="22" />
        <path className="route-scene__core-ticks" d="M304 130v7m0 66v7m-40-40h7m66 0h7" />
        <motion.path className="route-scene__core-route" d="M292 179l12-22 12 22-12-5-12 5Z" {...pathDraw(reduced, 0.7, 0.4)} />
        <text className="route-scene__caption" x="304" y="230" textAnchor="middle">Routing logic</text>

        {/* The core fans out; one direction is taken. */}
        {ROUTE_CANDIDATES.map((candidate, index) => {
          const path = `M336 170 C 390 170, 400 ${candidate.y}, 452 ${candidate.y}`;
          return (
            <g key={candidate.y}>
              <path className={candidate.chosen ? 'route-scene__path-base' : 'route-scene__branch'} d={path} />
              {candidate.chosen ? (
                <motion.path className="route-scene__trace route-scene__trace--out" d={path} {...pathDraw(reduced, 1.0, 0.35)} />
              ) : null}
              <motion.circle
                className={candidate.chosen ? 'route-scene__candidate route-scene__candidate--chosen' : 'route-scene__candidate'}
                cx="462"
                cy={candidate.y}
                r="9"
                {...appear(0.9 + index * 0.08, { scale: 0.5 })}
              />
            </g>
          );
        })}

        <path className="route-scene__path-base" d="M471 170H560" />
        <motion.path className="route-scene__trace route-scene__trace--out" d="M471 170H560" {...pathDraw(reduced, 1.35, 0.35)} />
        <motion.circle className="route-scene__beacon-halo" cx="584" cy="170" r="20" {...appear(1.6, { scale: 0.6 })} />
        <motion.circle className="route-scene__beacon" cx="584" cy="170" r="7" {...appear(1.62, { scale: 0.4 })} />
        <motion.text className="route-scene__destination" x="584" y="128" textAnchor="middle" {...appear(1.7, { y: 6 })}>
          Specialty
        </motion.text>
        <motion.text className="route-scene__detail" x="584" y="214" textAnchor="middle" {...appear(1.74, { y: 6 })}>
          direction
        </motion.text>
      </svg>
    </div>
  );
}

/* The fragments the patient gave, and the document rows they settle into. */
const HANDOFF_FRAGMENTS = [
  { label: 'Where', y: 96 },
  { label: 'What you felt', y: 146 },
  { label: 'Your answers', y: 196 },
  { label: 'Safety check', y: 246 },
] as const;

const HANDOFF_ROWS = [
  { key: 'S', label: 'Subjective', y: 128 },
  { key: 'O', label: 'Objective', y: 170 },
  { key: 'A', label: 'Assessment', y: 212 },
  { key: 'P', label: 'Plan', y: 254 },
] as const;

/**
 * SOAP and handoff.
 *
 * What the patient reported settles into a structured Subjective, Objective,
 * Assessment and Plan document, which is marked prepared and passes to the
 * care team. The document shows section names and blank rules only. It holds
 * no example patient data, because a sample note on an introduction would
 * present invented clinical content as a record.
 *
 * MECHANICAL REASON for the motion: each fragment's line runs into the row it
 * becomes, which is the organising step the stage describes; the document then
 * passes once to the care team, where responsibility for the next decision
 * sits. With reduced motion the finished document is shown at once.
 */
export function HandoffScene({ reduced, preparedOnly = false }: SceneProps & { preparedOnly?: boolean }) {
  const at = (delay: number) => (reduced ? 0 : delay);
  const appear = (delay: number, from: { x?: number; y?: number; scale?: number } = {}) => ({
    initial: reduced ? false : { opacity: 0, ...from },
    animate: { opacity: 1, x: 0, y: 0, scale: 1 },
    transition: { duration: reduced ? 0 : 0.34, ease: EASE, delay: at(delay) },
  });

  return (
    <div className="ovisual__scene route-scene handoff-scene">
      <p className="ovisual__micro">From your report to a clinical handoff</p>
      <svg viewBox="0 0 660 350" role="presentation" focusable="false">
        <defs>
          <linearGradient id="route-trace" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" style={{ stopColor: 'var(--color-border-structural)' }} />
            <stop offset="1" style={{ stopColor: 'var(--color-border-interactive)' }} />
          </linearGradient>
        </defs>
        {/* Patient report fragments. */}
        {HANDOFF_FRAGMENTS.map((fragment, index) => {
          const path = `M146 ${fragment.y} C 185 ${fragment.y}, 190 ${HANDOFF_ROWS[index].y}, 226 ${HANDOFF_ROWS[index].y}`;
          return (
            <motion.g key={fragment.label} {...appear(0.1 + index * 0.1, { x: -10 })}>
              <rect className="handoff-scene__fragment" x="8" y={fragment.y - 15} width="138" height="30" rx="6" />
              <text className="handoff-scene__fragment-label" x="22" y={fragment.y + 5}>{fragment.label}</text>
              <path className="route-scene__path-base" d={path} />
              <motion.path className="route-scene__trace" d={path} {...pathDraw(reduced, 0.5 + index * 0.12, 0.4)} />
            </motion.g>
          );
        })}

        {/* The document. */}
        <motion.path className="route-scene__doc" d="M226 72h196l22 22v214H226Z M422 72v22h22" {...pathDraw(reduced, 0.3, 0.6)} />
        <motion.text className="route-scene__doc-title" x="242" y="97" {...appear(0.8)}>
          Clinical handoff
        </motion.text>
        {HANDOFF_ROWS.map((row, index) => (
          <motion.g key={row.key} {...appear(1.0 + index * 0.16, { x: -8 })}>
            <circle className="handoff-scene__key-ring" cx="252" cy={row.y} r="11" />
            <text className="route-scene__soap-key" x="252" y={row.y + 4} textAnchor="middle">{row.key}</text>
            <text className="route-scene__soap-label" x="272" y={row.y - 2}>{row.label}</text>
            <path className="route-scene__soap-rule" d={`M272 ${row.y + 9}h148`} />
            <path className="route-scene__soap-rule" d={`M272 ${row.y + 17}h104`} />
          </motion.g>
        ))}
        <motion.g {...appear(1.75, { y: 6 })}>
          <path className="handoff-scene__check" d="M242 286l5 5 9-10" />
          <text className="handoff-scene__status" x="264" y="291">Prepared for clinical handoff</text>
        </motion.g>

        {preparedOnly ? null : (
          <>
            {/* The older onboarding scene retains its existing illustrative transfer. */}
            <path className="route-scene__path-base" d="M444 190H560" />
            <motion.path className="route-scene__trace" d="M444 190H560" {...pathDraw(reduced, 2.0, 0.45)} />
            {reduced ? null : (
              <motion.g
                initial={{ opacity: 0, x: 0 }}
                animate={{ opacity: [0, 1, 1, 0], x: [0, 0, 96, 100] }}
                transition={{ duration: 0.9, ease: EASE, delay: 2.1, times: [0, 0.15, 0.85, 1] }}
              >
                <path className="route-scene__packet" d="M446 182h12l4 4v12h-16Z" />
              </motion.g>
            )}
            <motion.circle className="route-scene__care-halo" cx="592" cy="190" r="24" {...appear(2.5, { scale: 0.6 })} />
            <motion.g {...appear(2.55, { scale: 0.7 })}>
              <circle className="route-scene__care-node" cx="592" cy="190" r="15" />
              <path className="route-scene__care-glyph" d="M592 183.5a3.6 3.6 0 1 1 0 .01M584 199c1.4-5.2 14.6-5.2 16 0" />
            </motion.g>
            <motion.text className="route-scene__destination" x="592" y="240" textAnchor="middle" {...appear(2.65, { y: 6 })}>
              Care team
            </motion.text>
            <motion.text className="route-scene__detail" x="592" y="260" textAnchor="middle" {...appear(2.7, { y: 6 })}>
              reviews and decides
            </motion.text>
          </>
        )}
      </svg>
    </div>
  );
}
