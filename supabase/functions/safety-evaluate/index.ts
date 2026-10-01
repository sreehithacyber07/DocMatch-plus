/**
 * POST /functions/v1/safety-evaluate
 * Body: { assessmentId, clientEventId }
 *
 * Independently evaluates R3 over the caller's persisted answers and records a
 * safety event only when the server itself reaches a fired rule. The browser's
 * local interruption never waits for this call.
 */
import { serveTrustedClinical } from '../_shared/http.ts';
import { handleClinicalFinalize } from '../_shared/trusted/clinical-outcome.ts';
import { parseAssessmentOperation } from '../_shared/trusted/request.ts';

Deno.serve(serveTrustedClinical('safety-evaluate', parseAssessmentOperation, async (store, caller, request) => {
  const result = await handleClinicalFinalize(store, caller, request, 'hard-stop');
  if (result.outcome !== 'hard-stop') throw new Error('unexpected clinical outcome');
  return { outcome: result.persistenceOutcome, status: result.status,
    safetyEventId: result.safetyEventId, trusted: result.trusted };
}));
