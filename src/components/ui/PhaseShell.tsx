import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import type { Phase } from '@stores/useAppStore';

const ANIM = {
  'slide-up': {
    initial: { y: 64, opacity: 0 },
    animate: { y: 0, opacity: 1 },
    exit:    { y: -32, opacity: 0 },
  },
  fade: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit:    { opacity: 0 },
  },
  'slide-left': {
    initial: { x: 60, opacity: 0 },
    animate: { x: 0, opacity: 1 },
    exit:    { x: -40, opacity: 0 },
  },
  'slide-right': {
    initial: { x: -60, opacity: 0 },
    animate: { x: 0, opacity: 1 },
    exit:    { x: 40, opacity: 0 },
  },
  // Emergency takeover: zooms in on entry (urgency), zooms out on exit (relief)
  'zoom-in': {
    initial: { scale: 0.80, opacity: 0 },
    animate: { scale: 1.00, opacity: 1 },
    exit:    { scale: 1.06, opacity: 0 },
  },
} as const;

type PhaseShellVariant = keyof typeof ANIM;

export interface PhaseShellProps {
  phaseId: Phase;
  variant?: PhaseShellVariant;
  children: ReactNode;
}

export function PhaseShell({
  phaseId: _,        // reserved for 2B context / keying
  variant = 'slide-up',
  children,
}: PhaseShellProps) {
  const v = ANIM[variant];
  return (
    <motion.div
      style={{ position: 'absolute', inset: 0 }}
      initial={v.initial}
      animate={v.animate}
      exit={v.exit}
      transition={{ duration: 0.45, ease: [0.25, 0.1, 0.25, 1] }}
    >
      {children}
    </motion.div>
  );
}
