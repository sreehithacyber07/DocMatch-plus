/**
 * R9H application-level abuse limits for the trusted Edge operations.
 *
 * Pure: no Deno, no Node-only API, no network. WebCrypto is global in both
 * runtimes, so the Edge Functions and the Node test suite share these rules.
 *
 * Two stages run on every request:
 *  1. before authentication, a per-address ceiling for the operation group, so
 *     floods cannot spend Auth and database work;
 *  2. after Supabase Auth has verified the caller, a per-subject ceiling for the
 *     single operation.
 *
 * Bucket keys are HMAC-SHA-256 digests under a server-only key. No address,
 * user id, token, answer or other request content is stored, returned or
 * logged. Nothing the browser names (body fields, client-chosen ids) is part of
 * a key: the subject is the Auth-verified user, the address comes from the
 * platform edge.
 *
 * The figures below are initial engineering ceilings sized well above one
 * patient's or one clinician's legitimate use, including the browser's two
 * transient retries. They are not a clinical or governance decision.
 */
import { TrustedError } from './contract.ts';

export type RateLimitedOperation =
  | 'assessment-start'
  | 'safety-evaluate'
  | 'routing-finalize'
  | 'soap-prepare'
  | 'assessment-end'
  | 'assessment-admit'
  | 'staff-session'
  | 'handoff-open'
  | 'handoff-acknowledge';

/**
 * Hard-stop persistence has its own address bucket so that patient-flow
 * exhaustion on a shared hospital address can never block it. The browser's
 * local R3 interruption never waits for any of these calls.
 */
export type OperationGroup = 'patient' | 'safety' | 'staff';

export const RATE_LIMIT_WINDOW_SECONDS = 600;

export const RATE_LIMIT_POLICY: Readonly<Record<RateLimitedOperation, { group: OperationGroup; perSubject: number }>> = {
  'assessment-start': { group: 'patient', perSubject: 20 },
  'routing-finalize': { group: 'patient', perSubject: 20 },
  'soap-prepare': { group: 'patient', perSubject: 20 },
  'assessment-end': { group: 'patient', perSubject: 20 },
  'safety-evaluate': { group: 'safety', perSubject: 60 },
  'assessment-admit': { group: 'staff', perSubject: 60 },
  'staff-session': { group: 'staff', perSubject: 120 },
  'handoff-open': { group: 'staff', perSubject: 240 },
  'handoff-acknowledge': { group: 'staff', perSubject: 240 },
};

/** Per address, per group. Sized for many patients behind one facility NAT. */
export const ADDRESS_LIMITS: Readonly<Record<OperationGroup, number>> = {
  patient: 600,
  safety: 1200,
  staff: 1200,
};

export const RATE_LIMITED_OPERATIONS = Object.keys(RATE_LIMIT_POLICY) as readonly RateLimitedOperation[];

export function isRateLimitedOperation(value: string): value is RateLimitedOperation {
  return (RATE_LIMITED_OPERATIONS as readonly string[]).includes(value);
}

export interface RateLimitBucket {
  /** 64 lowercase hex characters; never a raw identifier. */
  digest: string;
  windowSeconds: number;
  limit: number;
}

export interface RateLimitDecision {
  allowed: boolean;
  retryAfterSeconds: number;
}

/** Counts one hit against every bucket and reports whether all stayed within limit. */
export interface RateLimitStore {
  hit(buckets: readonly RateLimitBucket[]): Promise<RateLimitDecision>;
}

export class RateLimitedError extends TrustedError {
  readonly retryAfterSeconds: number;
  constructor(retryAfterSeconds: number) {
    super('RATE_LIMITED');
    this.retryAfterSeconds = Math.max(1, Math.min(RATE_LIMIT_WINDOW_SECONDS, Math.ceil(retryAfterSeconds)));
  }
}

/* --- Keys ----------------------------------------------------------------- */

/** WebCrypto key type in both runtimes, without depending on DOM typings. */
export type HmacKey = Awaited<ReturnType<typeof crypto.subtle.importKey>>;

const HEX = /^[0-9a-f]{64}$/;
const encoder = new TextEncoder();

/** Imports server-only key material. Callers never pass browser input here. */
export async function rateLimitKey(material: string): Promise<HmacKey> {
  if (material.length < 16) throw new TrustedError('SERVICE_UNAVAILABLE');
  return crypto.subtle.importKey('raw', encoder.encode(`docmatch-r9h-v1\u0000${material}`),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
}

export async function bucketDigest(key: HmacKey, parts: readonly string[]): Promise<string> {
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(parts.join('\u0000')));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

const IPV4 = /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)$/;
const IPV6 = /^[0-9a-f:.]{2,45}$/i;

function normalizedAddress(value: string | null): string | null {
  if (!value) return null;
  const candidate = value.trim().replace(/^\[|\]$/g, '').toLowerCase();
  if (IPV4.test(candidate)) return candidate;
  if (candidate.includes(':') && IPV6.test(candidate)) {
    // One IPv6 client can hold a whole /64, so the bucket is the /64 prefix.
    const groups = candidate.split('::');
    const head = groups[0] ? groups[0].split(':') : [];
    const tail = groups.length > 1 && groups[1] ? groups[1].split(':') : [];
    const fill = groups.length > 1 ? Array(Math.max(0, 8 - head.length - tail.length)).fill('0') : [];
    const full = [...head, ...fill, ...tail];
    if (full.length !== 8) return null;
    return `${full.slice(0, 4).map((group) => group.replace(/^0+(?=.)/, '')).join(':')}::/64`;
  }
  return null;
}

/**
 * The client address as reported by the platform edge. Preference is the
 * edge-set single-value headers, then the first X-Forwarded-For hop. A spoofed
 * header can at worst move a caller into another address bucket; the
 * Auth-verified per-subject bucket still applies. Unparseable values share one
 * "unknown" bucket rather than escaping the limit.
 */
export function clientAddress(headers: Headers): string {
  return normalizedAddress(headers.get('cf-connecting-ip'))
    ?? normalizedAddress(headers.get('x-real-ip'))
    ?? normalizedAddress((headers.get('x-forwarded-for') ?? '').split(',')[0] ?? null)
    ?? 'unknown';
}

export async function addressBucket(key: HmacKey, operation: RateLimitedOperation, headers: Headers): Promise<RateLimitBucket> {
  const group = RATE_LIMIT_POLICY[operation].group;
  return {
    digest: await bucketDigest(key, ['address', group, clientAddress(headers)]),
    windowSeconds: RATE_LIMIT_WINDOW_SECONDS,
    limit: ADDRESS_LIMITS[group],
  };
}

/** `verifiedUserId` must come from Supabase Auth, never from the request body. */
export async function subjectBucket(key: HmacKey, operation: RateLimitedOperation, verifiedUserId: string): Promise<RateLimitBucket> {
  return {
    digest: await bucketDigest(key, ['subject', operation, verifiedUserId]),
    windowSeconds: RATE_LIMIT_WINDOW_SECONDS,
    limit: RATE_LIMIT_POLICY[operation].perSubject,
  };
}

/* --- Enforcement ---------------------------------------------------------- */

/**
 * Fixed-window counter held in this isolate only. It is the fallback while the
 * durable store is unreachable, so an outage degrades to per-isolate limits
 * instead of no limits or refusing patients. Bounded in size.
 */
export class MemoryRateLimitStore implements RateLimitStore {
  private readonly windows = new Map<string, { start: number; hits: number }>();
  private readonly now: () => number;
  private readonly maxEntries: number;
  constructor(now: () => number = Date.now, maxEntries = 10_000) {
    this.now = now;
    this.maxEntries = maxEntries;
  }

  hit(buckets: readonly RateLimitBucket[]): Promise<RateLimitDecision> {
    const now = this.now();
    let allowed = true;
    let retry = 0;
    for (const bucket of buckets) {
      const size = bucket.windowSeconds * 1000;
      const start = Math.floor(now / size) * size;
      const id = `${bucket.digest}:${bucket.windowSeconds}`;
      let entry = this.windows.get(id);
      if (!entry || entry.start !== start) {
        if (!entry && this.windows.size >= this.maxEntries) this.prune(now);
        entry = { start, hits: 0 };
        this.windows.set(id, entry);
      }
      entry.hits += 1;
      if (entry.hits > bucket.limit) {
        allowed = false;
        retry = Math.max(retry, Math.ceil((start + size - now) / 1000));
      }
    }
    return Promise.resolve({ allowed, retryAfterSeconds: allowed ? 0 : Math.max(1, retry) });
  }

  private prune(now: number) {
    for (const [id, entry] of this.windows) {
      if (entry.start + RATE_LIMIT_WINDOW_SECONDS * 1000 <= now) this.windows.delete(id);
    }
    // Still full: drop the oldest insertions rather than grow without bound.
    for (const id of this.windows.keys()) {
      if (this.windows.size < this.maxEntries) break;
      this.windows.delete(id);
    }
  }
}

export interface RateLimiter {
  durable: RateLimitStore;
  fallback: RateLimitStore;
  /** Receives only a fixed reason; never a key, address, user or request content. */
  onDurableFailure?: (reason: 'store_unavailable') => void;
}

function validBucket(bucket: RateLimitBucket): boolean {
  return HEX.test(bucket.digest) && Number.isInteger(bucket.windowSeconds) && bucket.windowSeconds > 0
    && Number.isInteger(bucket.limit) && bucket.limit > 0;
}

/** Throws RateLimitedError when any bucket is over its limit. */
export async function enforceRateLimit(limiter: RateLimiter, buckets: readonly RateLimitBucket[]): Promise<void> {
  if (buckets.length === 0 || !buckets.every(validBucket)) throw new TrustedError('INTERNAL');
  let decision: RateLimitDecision;
  try {
    decision = await limiter.durable.hit(buckets);
  } catch {
    limiter.onDurableFailure?.('store_unavailable');
    decision = await limiter.fallback.hit(buckets);
  }
  if (!decision.allowed) throw new RateLimitedError(decision.retryAfterSeconds);
}
