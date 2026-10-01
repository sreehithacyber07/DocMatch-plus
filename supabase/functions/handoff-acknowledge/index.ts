/**
 * POST /functions/v1/handoff-acknowledge
 * Body: { handoffId, clientEventId }
 *
 * Records that an authorized clinician explicitly acknowledged the prepared
 * handoff. It means only that: no diagnosis, assignment, appointment,
 * notification or treatment is implied or performed.
 */
import { serveTrustedStaff } from '../_shared/http.ts';
import { handleHandoffAcknowledge } from '../_shared/trusted/staff-operations.ts';
import { parseHandoffOperation } from '../_shared/trusted/request.ts';

Deno.serve(serveTrustedStaff('handoff-acknowledge', parseHandoffOperation, handleHandoffAcknowledge));
