import { useEffect } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { orbitReveal, pathDraw } from '../../styles/motion-variants.ts';
import { CheckScene, ClarifyScene, HandoffScene, RouteScene } from './OnboardingScenes.tsx';
import { BODY_ASSETS } from '../../features/body-explorer/artwork/bodyAssetRegistry.ts';
import type { BodyLayerId } from '../../body/index.ts';

/**
 * Locate and Refine use the actual Body Explorer artwork. Later stages use
 * purpose-drawn scenes so the same body does not stand in for every concept.
 */
export type OnboardingStageId = 'locate' | 'refine' | 'clarify' | 'check' | 'route' | 'handoff';

const LAYER_ART: readonly { id: BodyLayerId; label: string }[] = [
  { id: 'hologram', label: 'Surface' },
  { id: 'systems', label: 'Systems' },
  { id: 'structures', label: 'Structures' },
];

export interface OnboardingVisualProps {
  stage: OnboardingStageId;
  /** Which anatomy layer the Refine stage is currently showing. */
  layerIndex: number;
  /** Landing artwork stops at preparation; it does not imply delivery. */
  handoffPreparedOnly?: boolean;
}

export function OnboardingVisual({ stage, layerIndex, handoffPreparedOnly = false }: OnboardingVisualProps) {
  const reduced = Boolean(useReducedMotion());

  const art = stage === 'refine' ? LAYER_ART[layerIndex % LAYER_ART.length] : LAYER_ART[0];
  const bodyStage = stage === 'locate' || stage === 'refine';
  /* Only preload the visible male editorial asset. */
  useEffect(() => {
    if (!bodyStage) return;
    const image = new Image();
    image.src = BODY_ASSETS.male[art.id].front;
  }, [art.id, bodyStage]);

  return (
    <div className="ovisual" data-stage={stage} aria-hidden="true">
      <span className="ovisual__field" />
      <span className="ovisual__vignette" />

      {bodyStage ? (
        <div className="ovisual__figure">
          <AnimatePresence initial={false} mode="sync">
            <motion.img
              className="ovisual__art"
              key={art.id}
              src={BODY_ASSETS.male[art.id].front}
              alt=""
              draggable={false}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduced ? 0 : 0.55, ease: [0.2, 0, 0, 1] }}
            />
          </AnimatePresence>
          {stage === 'locate' ? <svg className="ovisual__overlay" viewBox="0 0 200 300" focusable="false"><Locate reduced={reduced} /></svg> : null}
          <span className="ovisual__floor" />
        </div>
      ) : null}

      {stage === 'clarify' ? <ClarifyScene reduced={reduced} /> : null}
      {stage === 'check' ? <CheckScene reduced={reduced} /> : null}
      {stage === 'route' ? <RouteScene reduced={reduced} /> : null}
      {stage === 'handoff' ? <HandoffScene reduced={reduced} preparedOnly={handoffPreparedOnly} /> : null}

      {stage === 'refine' ? (
        <div className="ovisual__layers">
          {LAYER_ART.map((layer, index) => (
            <span
              className="ovisual__layer-tick type-caption"
              key={layer.id}
              data-state={index === layerIndex % LAYER_ART.length ? 'on' : 'off'}
            >
              {layer.label}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/* --- Stage geometry ------------------------------------------------------- */

/** A locator ring sweeping onto one point of the torso. */
function Locate({ reduced }: { reduced: boolean }) {
  return (
    <g className="ovisual__locate">
      <motion.ellipse className="ovisual__orbit" cx="100" cy="120" rx="54" ry="20" {...orbitReveal(reduced)} />
      <motion.ellipse
        className="ovisual__orbit ovisual__orbit--inner"
        cx="100"
        cy="120"
        rx="30"
        ry="11"
        {...orbitReveal(reduced)}
      />
      <motion.path className="ovisual__cross" d="M100 100v40M80 120h40" {...pathDraw(reduced, 0.45, 0.5)} />
      <motion.circle
        className="ovisual__target"
        cx="100"
        cy="120"
        r="4"
        initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.3 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: reduced ? 0.16 : 0.4, delay: reduced ? 0 : 0.7, ease: [0.2, 0, 0, 1] }}
      />
    </g>
  );
}
