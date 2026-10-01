/**
 * POST /functions/v1/assessment-start
 * Body: { assessmentId, clientEventId, complaintId, complaintSource }
 *
 * Sets the service-owned complaint fields on the caller's own assessment and
 * moves it from created to in_progress. See docs/backend/r9g-a-trusted-backend.md.
 */
import { serveTrusted } from '../_shared/http.ts';
import { handleAssessmentStart } from '../_shared/trusted/operations.ts';
import { parseAssessmentStart } from '../_shared/trusted/request.ts';

Deno.serve(serveTrusted('assessment-start', parseAssessmentStart, handleAssessmentStart));
