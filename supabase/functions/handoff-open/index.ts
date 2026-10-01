/**
 * POST /functions/v1/handoff-open
 * Body: { handoffId, clientEventId }
 *
 * Records that an authorized clinician opened a prepared handoff in their own
 * facility. Opening is not acknowledgement.
 */
import { serveTrustedStaff } from '../_shared/http.ts';
import { handleHandoffOpen } from '../_shared/trusted/staff-operations.ts';
import { parseHandoffOperation } from '../_shared/trusted/request.ts';

Deno.serve(serveTrustedStaff('handoff-open', parseHandoffOperation, handleHandoffOpen));
