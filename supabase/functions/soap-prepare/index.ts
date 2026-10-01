/** POST /functions/v1/soap-prepare: only IDs and a stable operation key. */
import { serveTrusted } from '../_shared/http.ts';
import { handleSoapPrepare } from '../_shared/trusted/operations.ts';
import { parseAssessmentOperation } from '../_shared/trusted/request.ts';

Deno.serve(serveTrusted('soap-prepare', parseAssessmentOperation, handleSoapPrepare));
