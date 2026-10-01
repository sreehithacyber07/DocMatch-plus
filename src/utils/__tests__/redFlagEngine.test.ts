// Plain TypeScript smoke test — no test runner required.
// Invoke via: window.__redFlagSmokeTest__?.() in browser console (DEV only).
// Or: npx tsx src/utils/__tests__/redFlagEngine.test.ts

import { evaluateRedFlags, shouldOverrideFlow } from '../redFlagEngine';
import type { RedFlagContext, PatientProfile } from '../../types/index.ts';

// ── Helpers ───────────────────────────────────────────────────────────────────

const DEFAULT_PATIENT: PatientProfile = {
  age: 35,
  gender: 'male',
  height: 175,
  weight: 75,
  mobility: 'full',
  language: 'en',
};

const FEMALE_PATIENT: PatientProfile = {
  ...DEFAULT_PATIENT,
  gender: 'female',
};

const ELDERLY_PATIENT: PatientProfile = {
  ...DEFAULT_PATIENT,
  age: 70,
};

function ctx(
  answers: Record<string, string>,
  regions: string[] = [],
  patient: PatientProfile = DEFAULT_PATIENT
): RedFlagContext {
  return { answers, regions, patient };
}

// ── Test runner ───────────────────────────────────────────────────────────────

type TestCase = {
  label:       string;
  context:     RedFlagContext;
  expectedIds: string[];          // rule ids that MUST fire (exact match)
  extraChecks?: (ids: string[], result: ReturnType<typeof evaluateRedFlags>) => string | null;
};

export function runRedFlagSmokeTest(): { passed: number; failed: number; failures: string[] } {
  const cases: TestCase[] = [

    // ── 12 POSITIVE: every rule must fire for its canonical scenario ───────

    {
      label: 'CRITICAL_CHEST_PAIN — chest + breathless',
      context: ctx({ breathless: 'yes' }, ['chest']),
      expectedIds: ['CRITICAL_CHEST_PAIN'],
    },
    {
      label: 'CRITICAL_CHEST_PAIN — chest + arm radiation',
      context: ctx({ pain_radiates: 'arm' }, ['chest']),
      expectedIds: ['CRITICAL_CHEST_PAIN'],
    },
    {
      label: 'CRITICAL_STROKE — sudden weakness + slurred speech',
      context: ctx({ sudden_weakness: 'yes', speech_difficulty: 'yes' }),
      expectedIds: ['CRITICAL_STROKE'],
    },
    {
      label: 'CRITICAL_STROKE — facial droop alone',
      context: ctx({ facial_droop: 'yes' }),
      expectedIds: ['CRITICAL_STROKE'],
    },
    {
      label: 'CRITICAL_BLEEDING — vomiting blood',
      context: ctx({ vomiting_blood: 'yes' }),
      expectedIds: ['CRITICAL_BLEEDING'],
    },
    {
      label: 'CRITICAL_BLEEDING — severe bleeding',
      context: ctx({ severe_bleeding: 'yes' }),
      expectedIds: ['CRITICAL_BLEEDING'],
    },
    {
      label: 'CRITICAL_BREATHING — breathless=severe',
      context: ctx({ breathless: 'severe' }),
      expectedIds: ['CRITICAL_BREATHING'],
    },
    {
      label: 'CRITICAL_BREATHING — breathless=yes + cannot speak full sentences',
      context: ctx({ breathless: 'yes', cannot_speak_full_sentences: 'yes' }),
      expectedIds: ['CRITICAL_BREATHING'],
    },
    {
      label: 'CRITICAL_ANAPHYLAXIS — throat swelling',
      context: ctx({ throat_swelling: 'yes' }),
      expectedIds: ['CRITICAL_ANAPHYLAXIS'],
    },
    {
      label: 'CRITICAL_ANAPHYLAXIS — sudden rash + breathless',
      context: ctx({ skin_rash: 'sudden', breathless: 'yes' }),
      expectedIds: ['CRITICAL_ANAPHYLAXIS'],
    },
    {
      label: 'URGENT_HEAD_INJURY — head trauma + confusion',
      context: ctx({ recent_head_trauma: 'yes', confusion: 'yes' }),
      expectedIds: ['URGENT_HEAD_INJURY'],
    },
    {
      label: 'URGENT_HEAD_INJURY — head trauma + vomiting',
      context: ctx({ recent_head_trauma: 'yes', vomiting: 'yes' }),
      expectedIds: ['URGENT_HEAD_INJURY'],
    },
    {
      label: 'URGENT_SEVERE_PAIN — severity 10 sudden onset',
      context: ctx({ severity: '10', onset: 'sudden' }),
      expectedIds: ['URGENT_SEVERE_PAIN'],
    },
    {
      label: 'URGENT_MENINGITIS_SCREEN — high fever + stiff neck',
      context: ctx({ fever: 'high', stiff_neck: 'yes' }),
      expectedIds: ['URGENT_MENINGITIS_SCREEN'],
    },
    {
      label: 'URGENT_MENINGITIS_SCREEN — high fever + light sensitivity',
      context: ctx({ fever: 'high', light_sensitivity: 'yes' }),
      expectedIds: ['URGENT_MENINGITIS_SCREEN'],
    },
    {
      label: 'URGENT_PREGNANCY_BLEEDING — pregnant female + abdomen + bleed',
      context: ctx(
        { pregnant: 'yes', vaginal_bleeding: 'yes' },
        ['abdomen'],
        FEMALE_PATIENT
      ),
      expectedIds: ['URGENT_PREGNANCY_BLEEDING'],
    },
    {
      label: 'WARNING_PERSISTENT_WORSENING — duration months + worsening',
      context: ctx({ duration: 'months', worsening: 'yes' }),
      expectedIds: ['WARNING_PERSISTENT_WORSENING'],
    },
    {
      label: 'WARNING_UNEXPLAINED_WEIGHT_LOSS — weight_loss + fatigue',
      context: ctx({ weight_loss: 'yes', fatigue: 'yes' }),
      expectedIds: ['WARNING_UNEXPLAINED_WEIGHT_LOSS'],
    },
    {
      label: 'WARNING_ELDERLY_FALL — age 65+, recent fall, severity ≥5',
      context: ctx({ recent_fall: 'yes', severity: '7' }, [], ELDERLY_PATIENT),
      expectedIds: ['WARNING_ELDERLY_FALL'],
    },

    // ── 6 NEGATIVE: must NOT fire on benign symptoms ──────────────────────

    {
      label: 'NEGATIVE — mild chest tightness only (no breathless/radiates)',
      context: ctx({ pain_character: 'dull', severity: '3' }, ['chest']),
      expectedIds: [],
    },
    {
      label: 'NEGATIVE — headache severity 4 (no fever, no trauma)',
      context: ctx({ pain_character: 'throbbing', severity: '4' }, ['head']),
      expectedIds: [],
    },
    {
      label: 'NEGATIVE — cough, no breathing difficulty',
      context: ctx({ pain_character: 'dull', fever: 'low', onset: 'gradual' }),
      expectedIds: [],
    },
    {
      label: 'NEGATIVE — minor cut, no severe bleeding',
      context: ctx({ recent_injury: 'yes', severity: '2' }),
      expectedIds: [],
    },
    {
      label: 'NEGATIVE — fatigue alone (no weight loss)',
      context: ctx({ fatigue: 'yes' }),
      expectedIds: [],
    },
    {
      label: 'NEGATIVE — mild abdomen pain, female non-pregnant',
      context: ctx({ pain_character: 'cramping', severity: '3' }, ['abdomen'], FEMALE_PATIENT),
      expectedIds: [],
    },

    // ── COMBINATION: multiple rules fire, sorted critical-first ───────────

    {
      label: 'COMBINATION — chest + breathless + severity 10 sudden → critical + urgent, shouldOverride',
      context: ctx(
        { breathless: 'yes', severity: '10', onset: 'sudden' },
        ['chest']
      ),
      expectedIds: ['CRITICAL_CHEST_PAIN', 'URGENT_SEVERE_PAIN'],
      extraChecks: (_ids, result) => {
        if (!shouldOverrideFlow(result)) return 'shouldOverride must be true';
        if (result.triggered[0].severity !== 'critical') return 'First triggered rule must be critical';
        return null;
      },
    },

    // ── RESILIENCE: must not throw ─────────────────────────────────────────

    {
      label: 'RESILIENCE — completely empty context',
      context: ctx({}, [], { age: null, gender: null, height: null, weight: null, mobility: 'full', language: 'en' }),
      expectedIds: [],
    },
    {
      label: 'RESILIENCE — null patient age (WARNING_ELDERLY_FALL must not fire)',
      context: ctx({ recent_fall: 'yes', severity: '7' }, [], { ...DEFAULT_PATIENT, age: null }),
      expectedIds: [],
    },
    {
      label: 'RESILIENCE — malformed severity value (string "yes" where number expected)',
      context: ctx({ severity: 'yes', onset: 'sudden' }),
      expectedIds: [],
    },
  ];

  // ── Run ────────────────────────────────────────────────────────────────────

  let passed  = 0;
  let failed  = 0;
  const failures: string[] = [];

  console.group('🚨 Red-flag engine smoke tests');

  for (const tc of cases) {
    let result: ReturnType<typeof evaluateRedFlags>;
    try {
      result = evaluateRedFlags(tc.context);
    } catch (err) {
      const msg = `evaluateRedFlags threw: ${String(err)}`;
      console.error(`  ✗ FAIL  ${tc.label} — ${msg}`);
      failures.push(`${tc.label}: ${msg}`);
      failed++;
      continue;
    }

    const firedIds    = result.triggered.map((r) => r.id).sort();
    const expectedSorted = [...tc.expectedIds].sort();
    const idsMatch = JSON.stringify(firedIds) === JSON.stringify(expectedSorted);

    let extraFailure: string | null = null;
    if (idsMatch && tc.extraChecks) {
      extraFailure = tc.extraChecks(firedIds, result);
    }

    if (idsMatch && extraFailure === null) {
      console.log(`  ✓ PASS  ${tc.label}`);
      passed++;
    } else {
      const reason = !idsMatch
        ? `expected [${expectedSorted.join(', ')}] got [${firedIds.join(', ')}]`
        : (extraFailure ?? 'extra check failed');
      console.error(`  ✗ FAIL  ${tc.label} — ${reason}`);
      failures.push(`${tc.label}: ${reason}`);
      failed++;
    }
  }

  console.log(`\n  Result: ${passed} passed, ${failed} failed`);
  console.groupEnd();

  return { passed, failed, failures };
}

// Auto-run via tsx / ts-node when executed directly
// eslint-disable-next-line @typescript-eslint/no-explicit-any
if (typeof (globalThis as any).process !== 'undefined' &&
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).process.argv?.[1]?.includes('redFlagEngine.test')) {
  runRedFlagSmokeTest();
}
