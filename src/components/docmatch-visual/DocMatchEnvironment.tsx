import { useReducedMotion } from 'framer-motion';
import type { ReactNode } from 'react';
import type { EnvironmentIntensity } from './config.ts';
import { SignalField } from './SignalField.tsx';
import './environment.css';

export interface DocMatchEnvironmentProps {
  intensity: EnvironmentIntensity;
  /** Extra travel along the DNA, so moving between stages moves the strand on. */
  offset?: number;
  children: ReactNode;
}

/**
 * The page-level DocMatch+ environment: the ambient canvas behind, the page
 * content in front. Mount it once per page so there is only ever one canvas.
 *
 * Intensity follows the context: strong on the landing, quieter behind the
 * Body Explorer, faint behind forms and questions, medium on the result.
 */
export function DocMatchEnvironment({ intensity, offset = 0, children }: DocMatchEnvironmentProps) {
  const reducedMotion = Boolean(useReducedMotion());
  return (
    <div className="docmatch-environment" data-intensity={intensity}>
      <SignalField intensity={intensity} offset={offset} reducedMotion={reducedMotion} />
      <div className="docmatch-environment__content">{children}</div>
    </div>
  );
}
