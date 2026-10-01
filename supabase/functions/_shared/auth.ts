/**
 * Caller authentication.
 *
 * Supabase Auth verifies the bearer signature and user. A separate database
 * check confirms that its signed session_id still exists: an otherwise valid
 * access JWT can outlive sign-out until token expiry.
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.116.0';
import { TrustedError } from './trusted/contract.ts';
import type { VerifiedCaller } from './trusted/operations.ts';

const BEARER = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Called only after Auth has verified the token signature. */
function verifiedSessionId(token: string, userId: string): string {
  try {
    const encoded = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const claim = JSON.parse(atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, '='))) as Record<string, unknown>;
    if (claim.sub !== userId || typeof claim.session_id !== 'string' || !UUID.test(claim.session_id)) {
      throw new TrustedError('AUTH_INVALID');
    }
    return claim.session_id;
  } catch {
    throw new TrustedError('AUTH_INVALID');
  }
}

export async function verifyCaller(request: Request, admin: SupabaseClient): Promise<VerifiedCaller> {
  const header = request.headers.get('authorization');
  if (!header) throw new TrustedError('AUTH_REQUIRED');
  const match = BEARER.exec(header.trim());
  if (!match) throw new TrustedError('AUTH_INVALID');
  return verifyAccessToken(admin, match[1]);
}

/**
 * Verifies any access token through Supabase Auth. Used for the bearer and,
 * in R9G-B admission, for the second (patient) principal. The token is never
 * logged or returned; only the verified id and anonymity leave this function.
 */
export async function verifyAccessToken(admin: SupabaseClient, token: string): Promise<VerifiedCaller> {
  let result;
  try {
    result = await admin.auth.getUser(token);
  } catch {
    throw new TrustedError('SERVICE_UNAVAILABLE');
  }
  const { data, error } = result;
  if (error) {
    if (typeof error.status === 'number' && error.status >= 500) throw new TrustedError('SERVICE_UNAVAILABLE');
    throw new TrustedError('AUTH_INVALID');
  }
  const user = data.user;
  if (!user?.id) throw new TrustedError('AUTH_INVALID');
  const sessionId = verifiedSessionId(token, user.id);
  let active;
  try {
    active = await admin.rpc('trusted_session_active', {
      p_auth_user_id: user.id,
      p_session_id: sessionId,
    });
  } catch {
    throw new TrustedError('SERVICE_UNAVAILABLE');
  }
  if (active.error) throw new TrustedError('SERVICE_UNAVAILABLE');
  if (active.data !== true) throw new TrustedError('AUTH_INVALID');
  return { userId: user.id, isAnonymous: user.is_anonymous === true };
}
