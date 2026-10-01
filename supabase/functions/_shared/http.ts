/**
 * HTTP boundary shared by the trusted functions: method, content type, body
 * size, CORS and the error envelope.
 *
 * CORS is not authorization. It only decides which browser origins may read a
 * response; every request is still authenticated and ownership-checked.
 * Allowed origins come from DOCMATCH_ALLOWED_ORIGINS (comma-separated, set as a
 * function secret) and default to the local development servers.
 */
import { ERROR_STATUS, TrustedError, type TrustedErrorCode } from './trusted/contract.ts';
import { MAX_BODY_BYTES, parseJsonBody } from './trusted/request.ts';
import type { TrustedStore, VerifiedCaller } from './trusted/operations.ts';
import {
  MemoryRateLimitStore,
  RateLimitedError,
  addressBucket,
  enforceRateLimit,
  subjectBucket,
  type RateLimitedOperation,
  type RateLimiter,
} from './trusted/rate-limit.ts';
import { adminClient, serverRateLimitKey } from './admin-client.ts';
import { verifyCaller } from './auth.ts';
import { admissionStore, clinicalStore, rateLimitStore, staffStore, supabaseStore } from './store.ts';
import type { ClinicalStore } from './trusted/clinical-outcome.ts';
import type { StaffStore } from './trusted/staff-operations.ts';
import type { AdmissionStore } from './trusted/admission-operations.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.116.0';

const DEFAULT_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:4173'];

function allowedOrigins(): string[] {
  const configured = Deno.env.get('DOCMATCH_ALLOWED_ORIGINS');
  if (!configured) return DEFAULT_ORIGINS;
  return configured
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => /^https?:\/\/[^\s/]+$/.test(origin));
}

function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('origin');
  if (!origin || !allowedOrigins().includes(origin)) return { vary: 'Origin' };
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
    'access-control-max-age': '600',
    vary: 'Origin',
  };
}

const BASE_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
};

export function json(request: Request, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...BASE_HEADERS, ...corsHeaders(request) } });
}

export function errorResponse(request: Request, code: TrustedErrorCode): Response {
  return json(request, ERROR_STATUS[code], { error: { code } });
}

/** 429 with the same generic envelope as every other refusal, plus Retry-After. */
function rateLimitedResponse(request: Request, error: RateLimitedError): Response {
  const response = errorResponse(request, error.code);
  response.headers.set('retry-after', String(error.retryAfterSeconds));
  return response;
}

// Survives across requests in one isolate; used only while the durable
// counter is unreachable.
const fallbackLimits = new MemoryRateLimitStore();

function limiterFor(operation: RateLimitedOperation, admin: SupabaseClient): RateLimiter {
  return {
    durable: rateLimitStore(admin),
    fallback: fallbackLimits,
    onDurableFailure: (reason) => console.error(JSON.stringify({ operation, rateLimit: reason })),
  };
}

/** Reads a small JSON body without trusting Content-Length. */
async function readBody(request: Request): Promise<unknown> {
  const contentType = request.headers.get('content-type') ?? '';
  if (!/^application\/json(\s*;.*)?$/i.test(contentType)) throw new TrustedError('UNSUPPORTED_MEDIA_TYPE');
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) throw new TrustedError('PAYLOAD_TOO_LARGE');
  const reader = request.body?.getReader();
  if (!reader) throw new TrustedError('INVALID_REQUEST');
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new TrustedError('PAYLOAD_TOO_LARGE');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new TrustedError('INVALID_REQUEST');
  }
  return parseJsonBody(text);
}

/**
 * Wraps one trusted operation. Order: method, per-address limit, caller
 * authentication, per-subject limit, body, operation. Only a TrustedError code
 * ever reaches the client; any other failure becomes INTERNAL with no detail.
 */
export function serveTrusted<T>(
  operation: RateLimitedOperation,
  parse: (body: unknown) => T,
  handle: (store: TrustedStore, caller: VerifiedCaller, request: T) => Promise<unknown>,
): (request: Request) => Promise<Response> {
  return serveWithStore(operation, parse, handle, supabaseStore);
}

/** Canonical routing and hard-stop finalization share one persisted resolver. */
export function serveTrustedClinical<T>(
  operation: RateLimitedOperation,
  parse: (body: unknown) => T,
  handle: (store: ClinicalStore, caller: VerifiedCaller, request: T) => Promise<unknown>,
): (request: Request) => Promise<Response> {
  return serveWithStore(operation, parse, handle, clinicalStore);
}

/** The R9F staff operations run the same pipeline with the staff store. */
export function serveTrustedStaff<T>(
  operation: RateLimitedOperation,
  parse: (body: unknown) => T,
  handle: (store: StaffStore, caller: VerifiedCaller, request: T) => Promise<unknown>,
): (request: Request) => Promise<Response> {
  return serveWithStore(operation, parse, handle, staffStore);
}

/** R9G-B staffed-tablet admission: staff bearer plus a verified patient principal. */
export function serveTrustedAdmission<T>(
  operation: RateLimitedOperation,
  parse: (body: unknown) => T,
  handle: (store: AdmissionStore, caller: VerifiedCaller, request: T) => Promise<unknown>,
): (request: Request) => Promise<Response> {
  return serveWithStore(operation, parse, handle, admissionStore);
}

function serveWithStore<T, S>(
  operation: RateLimitedOperation,
  parse: (body: unknown) => T,
  handle: (store: S, caller: VerifiedCaller, request: T) => Promise<unknown>,
  createStore: (admin: SupabaseClient) => S,
): (request: Request) => Promise<Response> {
  return async (request) => {
    if (request.method === 'OPTIONS') {
      const headers = corsHeaders(request);
      return new Response(null, { status: 'access-control-allow-origin' in headers ? 204 : 403, headers });
    }
    try {
      if (request.method !== 'POST') throw new TrustedError('METHOD_NOT_ALLOWED');
      const admin = adminClient();
      const limiter = limiterFor(operation, admin);
      const key = await serverRateLimitKey();
      await enforceRateLimit(limiter, [await addressBucket(key, operation, request.headers)]);
      const caller = await verifyCaller(request, admin);
      await enforceRateLimit(limiter, [await subjectBucket(key, operation, caller.userId)]);
      const body = parse(await readBody(request));
      const result = await handle(createStore(admin), caller, body);
      return json(request, 200, { data: result });
    } catch (error) {
      if (error instanceof RateLimitedError) return rateLimitedResponse(request, error);
      if (error instanceof TrustedError) return errorResponse(request, error.code);
      // Record only the operation and the error class, never its message.
      console.error(JSON.stringify({ operation, failure: error instanceof Error ? error.name : 'unknown' }));
      return errorResponse(request, 'INTERNAL');
    }
  };
}
