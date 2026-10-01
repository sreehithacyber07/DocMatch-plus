// Plain TypeScript smoke test — no test runner required.
// To run manually: import { runEngineSmokeTest } from this file and call it,
// OR open the browser console and type: window.__engineSmokeTest__?.()
// (QuestionStage exposes it on window in DEV mode via a dynamic import.)
//
// To run via CLI (if tsx is available): npx tsx src/utils/__tests__/questionEngine.test.ts

import { getQuestionSequence, calculateRouting, getNodeById } from '../questionEngine';

function assert(condition: boolean, label: string): void {
  if (condition) {
    console.log(`  ✓ PASS  ${label}`);
  } else {
    console.error(`  ✗ FAIL  ${label}`);
  }
}

export function runEngineSmokeTest(): void {
  console.group('🔬 Engine smoke tests');

  // ── Test 1: basic chest sequence ──────────────────────────────────────────
  const seq1 = getQuestionSequence(['chest'], {});
  assert(seq1.length >= 3, `getQuestionSequence(['chest'],{}) returns ≥3 ids — got ${seq1.length}`);
  assert(seq1.length <= 8, `getQuestionSequence(['chest'],{}) returns ≤8 ids — got ${seq1.length}`);
  assert(seq1.every((id) => typeof getNodeById(id) !== 'undefined'), 'All returned ids resolve to a DecisionNode');

  // ── Test 2: high-severity chest triggers emergency screening ──────────────
  const seq2 = getQuestionSequence(['chest'], { pain_character: 'pressure', severity: '9' });
  const hasEmergency = seq2.some((id) => getNodeById(id)?.category === 'emergency');
  assert(hasEmergency, `High-severity chest sequence contains an emergency-category node — sequence: [${seq2.join(', ')}]`);

  // ── Test 3: cardiac routing ────────────────────────────────────────────────
  const routing1 = calculateRouting(
    { pain_character: 'pressure', severity: '9', breathless: 'yes' },
    ['chest']
  );
  assert(
    routing1.recommendedSpecialist === 'Cardiologist',
    `Cardiac case → Cardiologist (got: ${routing1.recommendedSpecialist})`
  );
  assert(
    routing1.confidence > 50,
    `Cardiac case confidence > 50 (got: ${routing1.confidence})`
  );

  // ── Test 4: dermatology routing ───────────────────────────────────────────
  const routing2 = calculateRouting({ skin_rash: 'yes' }, ['left_arm']);
  assert(
    routing2.recommendedSpecialist === 'Dermatologist',
    `Skin rash + arm → Dermatologist (got: ${routing2.recommendedSpecialist})`
  );

  // ── Test 5: getNodeById round-trip ────────────────────────────────────────
  const node = getNodeById('emergency_screening');
  assert(node !== undefined, 'getNodeById("emergency_screening") returns a node');
  assert(node?.category === 'emergency', 'emergency_screening has category=emergency');

  console.groupEnd();
}

// Auto-run when executed directly via tsx / ts-node.
// The `process` check is guarded behind typeof to avoid errors in browser builds.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
if (typeof (globalThis as any).process !== 'undefined' &&
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).process.argv?.[1]?.includes('questionEngine.test')) {
  runEngineSmokeTest();
}
