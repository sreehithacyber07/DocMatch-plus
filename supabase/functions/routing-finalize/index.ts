/**
 * POST /functions/v1/routing-finalize
 * Body: { assessmentId, clientEventId }
 *
 * Recomputes R1/R2 from the caller's persisted routing answers and records the
 * server-derived routing result. No specialty, belief or supporting answer is
 * accepted from the browser.
 */
import { serveTrustedClinical } from '../_shared/http.ts';
import { handleClinicalFinalize } from '../_shared/trusted/clinical-outcome.ts';
import { parseAssessmentOperation } from '../_shared/trusted/request.ts';

Deno.serve(serveTrustedClinical('routing-finalize', parseAssessmentOperation, async (store, caller, request) => {
  const result = await handleClinicalFinalize(store, caller, request, 'route');
  if (result.outcome !== 'route') throw new Error('unexpected clinical outcome');
  return { outcome: result.persistenceOutcome, status: result.status,
    routingResultId: result.routingResultId, soapHandoffId: result.soapHandoffId,
    trusted: result.trusted };
}));
