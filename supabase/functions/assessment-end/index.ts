/**
 * POST /functions/v1/assessment-end
 * Body: { assessmentId, clientEventId }
 *
 * The patient's local session ended. An unfinished assessment is cancelled; one
 * that reached a priority screen or a prepared handoff is closed. A clinical
 * handoff is left exactly as it is, and nothing is deleted.
 */
import { serveTrusted } from '../_shared/http.ts';
import { handleAssessmentEnd } from '../_shared/trusted/operations.ts';
import { parseAssessmentOperation } from '../_shared/trusted/request.ts';

Deno.serve(serveTrusted('assessment-end', parseAssessmentOperation, handleAssessmentEnd));
