import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Pictogram, type PictogramName } from '../../components/pictograms';
import { EASE } from '../../styles/motion-variants.ts';
import { OnboardingVisual, type OnboardingStageId } from './OnboardingVisual.tsx';
import './onboarding.css';

/**
 * The introduction.
 *
 * Six stages, one persistent visual, no centre card. On desktop the stage rail
 * runs down the left, the figure sits in the middle and the copy, with its one
 * action, on the right, so the whole introduction is a single screen with no
 * footer below it. On narrower screens the rail runs across the top and the
 * action follows the copy in normal flow. There is no panel around anything:
 * the grouping is carried by position and by the rail, not by borders.
 *
 * Route and Handoff are separate stages. Route ends at a specialty direction;
 * Handoff shows the answers organised into a SOAP note and states which
 * decisions stay with the care team.
 *
 * The copy states what the patient will do, in their words. It does not restate
 * the product category on every stage, and it carries no claim the build cannot
 * support.
 */
interface Stage {
  id: OnboardingStageId;
  index: string;
  /** The short name on the progress rail. */
  name: string;
  headline: string;
  body: string;
  /** The decisions that stay with the care team, listed on the Handoff stage. */
  decisions?: readonly { mark: PictogramName; label: string }[];
}

/**
 * One stage transition, shared by every stage.
 *
 * The layers are absolutely positioned inside a reserved box, so the outgoing
 * and incoming stage overlap instead of one leaving a gap the layout collapses
 * into. Only opacity and a few pixels of travel are animated: nothing here can
 * change the geometry of the row, the rail, the footer or the CTA.
 */
const STAGE_TRANSITION = { duration: 0.28, ease: EASE } as const;

/*
  R8.1: the outgoing and incoming layers overlap in the same fixed box and move
  a few pixels along the direction of travel, so the stage reads as the same
  frame changing its contents rather than a new page arriving. Only opacity,
  14px of horizontal travel and a barely perceptible depth change are
  animated; nothing here can resize the frame. With reduced motion the content
  is replaced at once.
*/
const stageLayer = (reduced: boolean) => ({
  initial: reduced ? { opacity: 0 } : { opacity: 0, x: 14, scale: 0.995 },
  animate: { opacity: 1, x: 0, scale: 1 },
  exit: reduced ? { opacity: 0 } : { opacity: 0, x: -14, scale: 0.995 },
  transition: reduced ? { duration: 0 } : STAGE_TRANSITION,
});

/** Small internal stagger. The scene settles quickly; the page never moves. */
const copyLine = (reduced: boolean, index: number) => ({
  initial: reduced ? { opacity: 0 } : { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: reduced ? 0.12 : 0.34, ease: EASE, delay: reduced ? 0 : index * 0.04 },
});

const STAGES: readonly Stage[] = [
  {
    id: 'locate',
    index: '01',
    name: 'Locate',
    headline: 'Start with where it feels wrong.',
    body: 'You do not need to know the medical name. Point to the place that feels wrong.',
  },
  {
    id: 'refine',
    index: '02',
    name: 'Refine',
    headline: 'Location starts the story. Context sharpens it.',
    body: 'Move between surface anatomy, body systems and internal structures when they help you describe what you feel.',
  },
  {
    id: 'clarify',
    index: '03',
    name: 'Clarify',
    headline: 'Ask what matters next.',
    body: 'Your answers shape what DocMatch+ asks next.',
  },
  {
    id: 'check',
    index: '04',
    name: 'Check',
    headline: 'Safety does not wait until the end.',
    body: 'If an answer needs immediate attention, normal routing pauses for clinical review.',
  },
  {
    id: 'route',
    index: '05',
    name: 'Route',
    headline: 'Turn the story into a direction.',
    body: 'Your location and answers point to the specialty best placed to see you first.',
  },
  {
    id: 'handoff',
    index: '06',
    name: 'Handoff',
    headline: 'Carry the context forward.',
    body: 'What you reported is organized as a Subjective, Objective, Assessment and Plan note: a prepared handoff for the care team to review.',
    decisions: [
      { mark: 'diagnosis', label: 'Diagnosis' },
      { mark: 'prescription', label: 'Medication' },
      { mark: 'treatment', label: 'Treatment' },
      { mark: 'result', label: 'Final clinical judgment' },
    ],
  },
];

export interface OnboardingScreenProps {
  /** Reports the settled stage, so the page can move the DNA on with it. */
  onStageChange?: (index: number) => void;
  /** The last stage offers a way back to the top of the page. */
  onReturnToTop?: () => void;
}

export function OnboardingScreen({ onStageChange, onReturnToTop }: OnboardingScreenProps) {
  const reduced = Boolean(useReducedMotion());
  const [activeIndex, setActiveIndex] = useState(0);
  const [visibleIndex, setVisibleIndex] = useState<number | null>(0);
  const [targetIndex, setTargetIndex] = useState<number | null>(null);
  const [phase, setPhase] = useState<'idle' | 'exiting' | 'resolving' | 'filling'>('idle');
  const [litSegmentCount, setLitSegmentCount] = useState(0);
  const [layerIndex, setLayerIndex] = useState(0);
  const stage = STAGES[activeIndex];
  const visibleStage = visibleIndex === null ? null : STAGES[visibleIndex];
  const atEnd = activeIndex === STAGES.length - 1;

  /*
    The Refine stage cycles the three real anatomy layers so the crossfade is
    visible without the patient having to drive it. It runs only while that
    stage is on screen, and not at all under reduced motion, where the stage
    shows one layer and says so.
  */
  useEffect(() => {
    if (stage.id !== 'refine' || reduced) return;
    const timer = window.setInterval(() => setLayerIndex((current) => current + 1), 1800);
    return () => window.clearInterval(timer);
  }, [stage.id, reduced]);

  useEffect(() => {
    if (targetIndex === null || reduced) return;
    if (phase === 'resolving') {
      const timer = window.setTimeout(() => {
        setLitSegmentCount(targetIndex);
        setPhase('filling');
      }, 45);
      return () => window.clearTimeout(timer);
    }
    if (phase === 'filling') {
      const distance = Math.abs(targetIndex - activeIndex);
      const timer = window.setTimeout(() => {
        setActiveIndex(targetIndex);
        setVisibleIndex(targetIndex);
        setTargetIndex(null);
        setPhase('idle');
      }, 310 + Math.max(0, distance - 1) * 70);
      return () => window.clearTimeout(timer);
    }
  }, [activeIndex, phase, reduced, targetIndex]);

  function navigate(index: number) {
    if (phase !== 'idle' || index === activeIndex) return;
    setTargetIndex(index);
    // The next stage mounts at once and the previous one exits over it inside
    // the same box. Blanking the stage first was what collapsed the row.
    setVisibleIndex(index);
    setPhase('exiting');
  }

  function finishExit() {
    if (phase !== 'exiting' || targetIndex === null) return;
    if (reduced) {
      setLitSegmentCount(targetIndex);
      setActiveIndex(targetIndex);
      setVisibleIndex(targetIndex);
      setTargetIndex(null);
      setPhase('idle');
      return;
    }
    setPhase('resolving');
  }

  useEffect(() => {
    onStageChange?.(activeIndex);
  }, [activeIndex, onStageChange]);

  return (
    <section className="onboarding" id="the-flow" aria-label="How DocMatch+ works, stage by stage" data-stage={stage.id}>
      <div className="onboarding__frame">
        <nav className="onboarding__rail" aria-label="Introduction stages" data-phase={phase}>
          <ol>
            {STAGES.map((item, index) => {
              const resolving = (phase === 'resolving' || phase === 'filling') && targetIndex !== null;
              const state = resolving
                ? index < targetIndex ? 'complete' : 'upcoming'
                : index === activeIndex ? 'active' : index < activeIndex ? 'complete' : 'upcoming';
              return (
                <li key={item.id} data-state={state}>
                  {index < STAGES.length - 1 ? (
                    <span className="onboarding__segment" data-state={index < litSegmentCount ? 'complete' : 'upcoming'} aria-hidden="true">
                      <motion.span
                        className="onboarding__segment-fill"
                        initial={false}
                        animate={{ scaleX: index < litSegmentCount ? 1 : 0 }}
                        transition={{
                          duration: reduced ? 0 : 0.28,
                          ease: EASE,
                          delay: reduced || index < activeIndex ? 0 : (index - activeIndex) * 0.07,
                        }}
                      />
                    </span>
                  ) : null}
                  <button
                    className="onboarding__stop"
                    type="button"
                    aria-current={state === 'active' ? 'step' : undefined}
                    disabled={phase !== 'idle'}
                    onClick={() => navigate(index)}
                  >
                    <span className="onboarding__stop-node" aria-hidden="true" />
                    <span className="type-caption onboarding__stop-name">{item.name}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>

        {/* The figure and the copy are separate layers, each crossfading in its
            own slot, so the copy and its action form one column that is
            vertically centred beside the figure. The action sits outside the
            layers: a crossfade never shows two of them and focus stays on it. */}
        <div className="onboarding__stage">
          <div className="onboarding__visual-slot">
            <AnimatePresence mode="sync" initial={false}>
              {visibleStage ? (
                <motion.div className="onboarding__layer" key={visibleStage.id} {...stageLayer(reduced)}>
                  <OnboardingVisual stage={visibleStage.id} layerIndex={layerIndex} />
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>

          <div className="onboarding__copy-column">
            <div className="onboarding__copy-slot">
              <AnimatePresence mode="sync" initial={false} onExitComplete={finishExit}>
                {visibleStage ? (
                  <motion.div
                    className="onboarding__stage-content"
                    key={visibleStage.id}
                    {...stageLayer(reduced)}
                  >
                    <StageCopy stage={visibleStage} reduced={reduced} />
                  </motion.div>
                ) : null}
              </AnimatePresence>
              {/* One invisible copy of every stage in the same cell, so the frame
                  is always as tall as the tallest stage and the copy column and
                  its action never move between stages. */}
              {STAGES.map((item) => (
                <div key={item.id} className="onboarding__copy-sizer" aria-hidden="true" inert>
                  <StageCopy stage={item} reduced sizer />
                </div>
              ))}
            </div>

            <div className="onboarding__actions">
              {atEnd ? (
                <button className="ghost-button onboarding__top" type="button" onClick={onReturnToTop}>
                  <span className="type-control">Return to top ↑</span>
                </button>
              ) : (
                <button className="cta cta--quiet onboarding__next" type="button" disabled={phase !== 'idle'} onClick={() => navigate(Math.min(activeIndex + 1, STAGES.length - 1))}>
                  <span className="type-control">Next</span>
                  <span className="cta__mark" aria-hidden="true">
                    <Pictogram name="routing" size={20} />
                  </span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * One stage's copy. The live copy staggers in; the sizer copies render the same
 * text statically, with the headline as a paragraph so the page keeps a single
 * heading.
 */
function StageCopy({ stage, reduced, sizer = false }: { stage: Stage; reduced: boolean; sizer?: boolean }) {
  const line = (index: number) => (sizer ? {} : copyLine(reduced, index));
  const Headline = sizer ? motion.p : motion.h2;
  return (
    <div className="onboarding__copy">
      <motion.p className="dm-stage-label onboarding__index" {...line(0)}>
        {stage.index} / {stage.name}
      </motion.p>
      <Headline className="type-display onboarding__headline" {...line(2)}>{stage.headline}</Headline>
      <motion.p className="type-body onboarding__body" {...line(3)}>{stage.body}</motion.p>
      {stage.decisions ? (
        <motion.div className="onboarding__decisions" {...line(4)}>
          <p className="type-caption onboarding__decisions-title">The care team decides</p>
          <ul aria-label="Decisions that stay with the care team">
            {stage.decisions.map((decision) => (
              <li key={decision.label}>
                <Pictogram name={decision.mark} size={20} />
                <span className="type-label">{decision.label}</span>
              </li>
            ))}
          </ul>
        </motion.div>
      ) : null}
    </div>
  );
}
