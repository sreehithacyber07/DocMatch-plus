/**
 * POST /functions/v1/assessment-admit
 * Bearer: a permanent clinical staff session on a staffed tablet.
 * Body: { patientAccessToken, clientEventId, complaintId, complaintSource }
 *
 * Binds a fresh anonymous patient principal to a new facility-bound
 * staffed-tablet assessment. Facility, staff profile, mode and owner are
 * derived on the server; the patient remains the owner of its evidence.
 */
import { serveTrustedAdmission } from '../_shared/http.ts';
import { handleStaffedAdmission } from '../_shared/trusted/admission-operations.ts';
import { parseStaffedAdmission } from '../_shared/trusted/request.ts';

Deno.serve(serveTrustedAdmission('assessment-admit', parseStaffedAdmission, handleStaffedAdmission));
