/**
 * The privileged Supabase client. Edge runtime only.
 *
 * The service credential is read from the runtime-provided environment and is
 * never returned, logged or placed in an error. This file is the only place in
 * the repository that names the variable (a test enforces that).
 */
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.116.0';
import { TrustedError } from './trusted/contract.ts';
import { rateLimitKey, type HmacKey } from './trusted/rate-limit.ts';

let cached: SupabaseClient | null = null;

function serviceCredential(): string {
  // Newer projects expose named secret keys as JSON; older ones the legacy JWT.
  const named = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (named) {
    try {
      const parsed: unknown = JSON.parse(named);
      if (parsed && typeof parsed === 'object' && 'default' in parsed) {
        const value = (parsed as { default: unknown }).default;
        if (typeof value === 'string' && value.length > 0) return value;
      }
    } catch {
      // Fall through to the legacy variable.
    }
  }
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (legacy) return legacy;
  throw new TrustedError('SERVICE_UNAVAILABLE');
}

let cachedRateLimitKey: Promise<HmacKey> | null = null;

/**
 * Non-extractable HMAC key for R9H bucket digests. A dedicated
 * DOCMATCH_RATE_LIMIT_KEY secret is used when set; otherwise the key is
 * derived from the service credential, which never leaves this module.
 */
export function serverRateLimitKey(): Promise<HmacKey> {
  if (!cachedRateLimitKey) {
    const dedicated = Deno.env.get('DOCMATCH_RATE_LIMIT_KEY');
    cachedRateLimitKey = rateLimitKey(dedicated && dedicated.length >= 32 ? dedicated : serviceCredential());
    cachedRateLimitKey.catch(() => { cachedRateLimitKey = null; });
  }
  return cachedRateLimitKey;
}

export function adminClient(): SupabaseClient {
  if (cached) return cached;
  const url = Deno.env.get('SUPABASE_URL');
  if (!url) throw new TrustedError('SERVICE_UNAVAILABLE');
  cached = createClient(url, serviceCredential(), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { 'x-docmatch-trusted-operation': 'r9g-a' } },
  });
  return cached;
}
