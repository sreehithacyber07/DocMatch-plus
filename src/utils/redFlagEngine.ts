// Pure TypeScript — no React imports.
// No module-level mutable state. O(N) where N = rule count.
// All functions are referentially transparent given the same inputs.

import { redFlagRules } from '../data/redFlags.ts';
import type {
  RedFlagContext,
  RedFlagResult,
  RedFlagRule,
  RedFlagSeverity,
  RedFlag,
} from '../types/index.ts';

// Severity sort order (critical fires first in the triggered array)
const SEVERITY_ORDER: Record<RedFlagSeverity, number> = {
  critical: 0,
  urgent:   1,
  warning:  2,
};

// ── evaluateRedFlags ──────────────────────────────────────────────────────────
// Runs every rule against the provided context.
// Each rule.check is wrapped in try/catch — a faulty predicate logs an error
// but NEVER crashes the evaluation (resilience > drama).
// Completes in < 5 ms for ≤100 rules on a modern laptop (O(N) scan).

export function evaluateRedFlags(context: RedFlagContext): RedFlagResult {
  const triggered: RedFlagRule[] = [];

  for (const rule of redFlagRules) {
    try {
      if (rule.check(context)) {
        triggered.push(rule);
      }
    } catch (err) {
      console.error(`[redFlagEngine] rule "${rule.id}" threw during check:`, err);
      // treat as not-fired
    }
  }

  // Sort: critical → urgent → warning
  triggered.sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
  );

  const first = triggered[0] ?? null;
  const highestSeverity  = first?.severity ?? null;
  const overrideAction   = first?.overrideAction ?? null;
  const shouldOverride   =
    highestSeverity === 'critical' || highestSeverity === 'urgent';

  return {
    triggered,
    highestSeverity,
    overrideAction,
    shouldOverride,
    detectedAt: Date.now(),
  };
}

// ── shouldOverrideFlow ────────────────────────────────────────────────────────
// Convenience selector — true if the result demands an immediate flow override.

export function shouldOverrideFlow(result: RedFlagResult): boolean {
  return result.shouldOverride;
}

// ── ruleById ──────────────────────────────────────────────────────────────────

export function ruleById(id: string): RedFlagRule | undefined {
  return redFlagRules.find((r) => r.id === id);
}

// ── toPersistedRedFlag ────────────────────────────────────────────────────────
// Strips the non-serialisable `check` function and returns the persisted shape
// stored in Zustand state.redFlags[].

export function toPersistedRedFlag(rule: RedFlagRule, detectedAt: number): RedFlag {
  return {
    id:              rule.id,
    name:            rule.name,
    severity:        rule.severity,
    immediateAction: rule.immediateAction,
    detectedAt,
  };
}
