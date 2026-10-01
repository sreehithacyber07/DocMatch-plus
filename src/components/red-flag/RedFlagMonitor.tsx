// Invisible side-effect component. Renders null.
// Always mounted at App root so it monitors every phase transition.

import { useRef, useMemo, useEffect } from 'react';
import useAppStore from '@stores/useAppStore';
import { evaluateRedFlags, toPersistedRedFlag } from '@utils/redFlagEngine';
import type { RedFlagContext, RedFlagResult } from '@/types/index';

export function RedFlagMonitor() {
  // ── Clinical fields that affect red-flag evaluation ───────────────────────
  const answers             = useAppStore((s) => s.answers);
  const selectedBodyRegions = useAppStore((s) => s.selectedBodyRegions);
  const age                 = useAppStore((s) => s.age);
  const gender              = useAppStore((s) => s.gender);
  const height              = useAppStore((s) => s.height);
  const weight              = useAppStore((s) => s.weight);
  const mobility            = useAppStore((s) => s.mobility);
  const language            = useAppStore((s) => s.language);

  // ── Stable store action refs ──────────────────────────────────────────────
  const recordRedFlags    = useAppStore((s) => s.recordRedFlags);
  const triggerEmergency  = useAppStore((s) => s.triggerEmergency);
  const setUrgentWarnings = useAppStore((s) => s.setUrgentWarnings);

  // Build context — only recomputes when clinical state changes
  const context = useMemo<RedFlagContext>(
    () => ({
      answers,
      regions: selectedBodyRegions,
      patient: { age, gender, height, weight, mobility, language },
    }),
    [answers, selectedBodyRegions, age, gender, height, weight, mobility, language]
  );

  // Track last-processed triggered key to prevent duplicate calls
  const lastKeyRef = useRef('');

  useEffect(() => {
    let result: RedFlagResult;
    try {
      result = evaluateRedFlags(context);
    } catch (err) {
      console.error('[RedFlagMonitor] evaluateRedFlags threw unexpectedly:', err);
      return;
    }

    const triggeredKey = result.triggered.map((r) => r.id).join('|');

    // Nothing triggered — reset so future triggers can fire again
    if (result.triggered.length === 0) {
      lastKeyRef.current = '';
      return;
    }

    // Same rule set already handled — skip to avoid duplicate audit entries
    if (triggeredKey === lastKeyRef.current) return;
    lastKeyRef.current = triggeredKey;

    // Persist to audit trail (never throws — recordRedFlags is safe)
    recordRedFlags(result);

    if (result.shouldOverride) {
      // Critical or urgent: take over the flow immediately
      triggerEmergency(
        result.triggered.map((r) => toPersistedRedFlag(r, result.detectedAt))
      );
    } else {
      // Warning only: show non-blocking banner
      setUrgentWarnings(
        result.triggered
          .filter((r) => r.severity === 'warning')
          .map((r) => toPersistedRedFlag(r, result.detectedAt))
      );
    }
  }, [context, recordRedFlags, triggerEmergency, setUrgentWarnings]);

  return null;
}
