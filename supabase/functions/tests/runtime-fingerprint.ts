/**
 * Prints a fingerprint of server-derived state for a fixed set of interviews.
 * Run under Node (tsx) and under Deno; identical output shows the trusted
 * derivation behaves the same in the Edge runtime as in the test runtime.
 */
import { R2B_DEMONSTRATION_COMPLAINTS } from '../../../src/engine/data/index.ts';
import { deriveInterviewState, deriveRoutingResult, deriveSafetyEvent } from '../_shared/trusted/derive.ts';
import { randomWalk } from './browser-mirror.ts';

const lines: string[] = [];
for (const complaint of R2B_DEMONSTRATION_COMPLAINTS) {
  for (let seed = 1; seed <= 100; seed += 1) {
    const walk = randomWalk(complaint.id, seed * 104729);
    const state = deriveInterviewState({
      complaintId: complaint.id,
      routingRows: walk.recorder.streams.routing,
      safetyRows: walk.recorder.streams.safety,
      intakeRows: walk.recorder.streams.intake,
    });
    const safety = deriveSafetyEvent(state);
    const routing = state.step.kind === 'result' ? deriveRoutingResult(state) : null;
    lines.push(JSON.stringify([complaint.id, seed, state.session.belief, state.controller.status, safety, routing]));
  }
}
const bytes = new TextEncoder().encode(lines.join('\n'));
const digest = await crypto.subtle.digest('SHA-256', bytes);
console.log(lines.length, Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join(''));
