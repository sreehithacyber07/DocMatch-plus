/**
 * POST /functions/v1/staff-session
 *
 * Answers one question about the verified caller: may this account use the
 * clinical workspace, and at which facility. A successful Supabase login is not
 * an answer to that; an enabled clinical_staff profile in an enabled facility
 * is. Every refusal is the same code, so nothing is revealed about why.
 */
import { serveTrustedStaff } from '../_shared/http.ts';
import { handleStaffWorkspace } from '../_shared/trusted/staff-operations.ts';
import { parseNoFields } from '../_shared/trusted/request.ts';

Deno.serve(serveTrustedStaff('staff-session', parseNoFields, (store, caller) => handleStaffWorkspace(store, caller)));
