import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { ERROR_STATUS, TrustedError } from '../_shared/trusted/contract.ts';
import {
  ADDRESS_LIMITS,
  MemoryRateLimitStore,
  RATE_LIMIT_POLICY,
  RATE_LIMIT_WINDOW_SECONDS,
  RATE_LIMITED_OPERATIONS,
  RateLimitedError,
  addressBucket,
  bucketDigest,
  clientAddress,
  enforceRateLimit,
  rateLimitKey,
  subjectBucket,
  type RateLimitBucket,
  type RateLimitStore,
  type RateLimiter,
} from '../_shared/trusted/rate-limit.ts';
import { classifyBackendError, isRetryable } from '../../../src/features/persistence/errors.ts';

const ROOT = process.cwd();
const source = (relativePath: string) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
const USER = '6f1c1d1e-3c55-4c39-9a52-0b7d4d1a2f10';
const OTHER_USER = '0b6c8f8e-7a7d-4b0e-8d5e-2f1d3c4b5a69';

function clock(start = Date.UTC(2026, 9, 1, 10, 0, 0)) {
  let now = start;
  return { now: () => now, advance: (ms: number) => { now += ms; } };
}

function limiterWith(durable: RateLimitStore, fallback: RateLimitStore = new MemoryRateLimitStore()): RateLimiter {
  return { durable, fallback };
}

async function key() {
  return rateLimitKey('fixture-server-secret-not-a-real-credential');
}

async function hitUntilRefused(limiter: RateLimiter, bucket: RateLimitBucket): Promise<number> {
  for (let accepted = 0; accepted < bucket.limit + 5; accepted += 1) {
    try {
      await enforceRateLimit(limiter, [bucket]);
    } catch (error) {
      assert.ok(error instanceof RateLimitedError);
      return accepted;
    }
  }
  throw new Error('never throttled');
}

test('R9H: RATE_LIMITED is a generic 429 the browser treats as transient', () => {
  assert.equal(ERROR_STATUS.RATE_LIMITED, 429);
  const error = new RateLimitedError(37.2);
  assert.ok(error instanceof TrustedError);
  assert.equal(error.code, 'RATE_LIMITED');
  assert.equal(error.message, 'RATE_LIMITED');
  assert.equal(error.retryAfterSeconds, 38);
  assert.equal(new RateLimitedError(0).retryAfterSeconds, 1);
  assert.equal(new RateLimitedError(99_999).retryAfterSeconds, RATE_LIMIT_WINDOW_SECONDS);
  // The existing gateway retries a 429 at most twice, then reports a failed
  // write without touching the interview or the local priority screen.
  assert.equal(isRetryable(classifyBackendError({ code: 'RATE_LIMITED', status: 429 })), true);
});

test('R9H: allowed up to the limit, throttled after, reset at the next window', async () => {
  const time = clock();
  const limiter = limiterWith(new MemoryRateLimitStore(time.now));
  const bucket = await subjectBucket(await key(), 'routing-finalize', USER);
  assert.equal(bucket.limit, RATE_LIMIT_POLICY['routing-finalize'].perSubject);

  assert.equal(await hitUntilRefused(limiter, bucket), bucket.limit);
  await assert.rejects(enforceRateLimit(limiter, [bucket]), (error: unknown) =>
    error instanceof RateLimitedError && error.retryAfterSeconds >= 1 && error.retryAfterSeconds <= RATE_LIMIT_WINDOW_SECONDS);

  time.advance(RATE_LIMIT_WINDOW_SECONDS * 1000);
  await enforceRateLimit(limiter, [bucket]);
  assert.equal(await hitUntilRefused(limiter, bucket), bucket.limit - 1);
});

test('R9H: Retry-After counts down to the window boundary', async () => {
  const time = clock(Date.UTC(2026, 9, 1, 10, 0, 0));
  const store = new MemoryRateLimitStore(time.now);
  const bucket: RateLimitBucket = { digest: 'a'.repeat(64), windowSeconds: 600, limit: 1 };
  assert.deepEqual(await store.hit([bucket]), { allowed: true, retryAfterSeconds: 0 });
  time.advance(450_000);
  assert.deepEqual(await store.hit([bucket]), { allowed: false, retryAfterSeconds: 150 });
});

test('R9H: one subject throttled never throttles another subject or operation', async () => {
  const k = await key();
  const limiter = limiterWith(new MemoryRateLimitStore(clock().now));
  const mine = await subjectBucket(k, 'assessment-start', USER);
  await hitUntilRefused(limiter, mine);
  await enforceRateLimit(limiter, [await subjectBucket(k, 'assessment-start', OTHER_USER)]);
  await enforceRateLimit(limiter, [await subjectBucket(k, 'routing-finalize', USER)]);
  await enforceRateLimit(limiter, [await subjectBucket(k, 'safety-evaluate', USER)]);
});

test('R9H: hard-stop persistence has its own address bucket and a higher ceiling', async () => {
  const k = await key();
  const headers = new Headers({ 'x-forwarded-for': '203.0.113.7' });
  const limiter = limiterWith(new MemoryRateLimitStore(clock().now));
  const patient = await addressBucket(k, 'routing-finalize', headers);
  assert.equal(await hitUntilRefused(limiter, patient), ADDRESS_LIMITS.patient);
  // Every patient operation shares the exhausted address bucket...
  assert.equal((await addressBucket(k, 'assessment-start', headers)).digest, patient.digest);
  // ...but safety-evaluate and staff operations do not.
  await enforceRateLimit(limiter, [await addressBucket(k, 'safety-evaluate', headers)]);
  await enforceRateLimit(limiter, [await addressBucket(k, 'handoff-open', headers)]);
  assert.ok(ADDRESS_LIMITS.safety >= ADDRESS_LIMITS.patient);
  assert.ok(RATE_LIMIT_POLICY['safety-evaluate'].perSubject >= RATE_LIMIT_POLICY['routing-finalize'].perSubject);
});

test('R9H: legitimate use, including two retries per call, stays far below every ceiling', () => {
  // One patient session calls each patient operation once, plus at most two
  // transient retries (gateway: 400 ms then 1200 ms).
  const attemptsPerCall = 3;
  for (const operation of RATE_LIMITED_OPERATIONS) {
    assert.ok(RATE_LIMIT_POLICY[operation].perSubject >= attemptsPerCall * 4, operation);
  }
  assert.ok(ADDRESS_LIMITS.patient / (5 * attemptsPerCall) >= 40, 'room for dozens of patients behind one address');
});

test('R9H: keys are server-keyed digests that contain no identifier', async () => {
  const k = await key();
  const headers = new Headers({ 'x-forwarded-for': '198.51.100.23' });
  const subject = await subjectBucket(k, 'soap-prepare', USER);
  const address = await addressBucket(k, 'soap-prepare', headers);
  for (const bucket of [subject, address]) {
    assert.match(bucket.digest, /^[0-9a-f]{64}$/);
    assert.ok(!bucket.digest.includes(USER.replace(/-/g, '')));
    assert.ok(!JSON.stringify(bucket).includes('198.51.100.23'));
    assert.ok(!JSON.stringify(bucket).includes(USER));
  }
  assert.equal((await subjectBucket(k, 'soap-prepare', USER)).digest, subject.digest, 'deterministic');
  const otherKey = await rateLimitKey('another-server-secret-value-entirely');
  assert.notEqual((await subjectBucket(otherKey, 'soap-prepare', USER)).digest, subject.digest);
  assert.notEqual(await bucketDigest(k, ['subject', 'soap-prepare', USER]), await bucketDigest(k, ['address', 'soap-prepare', USER]));
  await assert.rejects(rateLimitKey('short'), (error: unknown) => error instanceof TrustedError);
});

test('R9H: client address comes from edge headers, normalized, never from the body', () => {
  assert.equal(clientAddress(new Headers({ 'cf-connecting-ip': '203.0.113.9', 'x-forwarded-for': '10.0.0.1' })), '203.0.113.9');
  assert.equal(clientAddress(new Headers({ 'x-real-ip': '203.0.113.10' })), '203.0.113.10');
  assert.equal(clientAddress(new Headers({ 'x-forwarded-for': ' 203.0.113.11 , 10.1.1.1' })), '203.0.113.11');
  // One IPv6 client holds a /64, so the whole prefix shares a bucket.
  assert.equal(clientAddress(new Headers({ 'x-forwarded-for': '2001:db8:abcd:12::1' })), '2001:db8:abcd:12::/64');
  assert.equal(clientAddress(new Headers({ 'x-forwarded-for': '2001:0db8:abcd:0012:ffff:1:2:3' })), '2001:db8:abcd:12::/64');
  // Garbage cannot escape the limit; it shares one bucket.
  assert.equal(clientAddress(new Headers({ 'x-forwarded-for': 'not-an-ip' })), 'unknown');
  assert.equal(clientAddress(new Headers()), 'unknown');
  assert.equal(clientAddress(new Headers({ 'x-forwarded-for': '999.1.1.1' })), 'unknown');
});

test('R9H: a durable-store outage falls back to the isolate counter and logs no detail', async () => {
  const reasons: unknown[] = [];
  const failing: RateLimitStore = { hit: () => Promise.reject(new Error('connection refused 203.0.113.1')) };
  const limiter: RateLimiter = {
    durable: failing,
    fallback: new MemoryRateLimitStore(clock().now),
    onDurableFailure: (reason) => reasons.push(reason),
  };
  const bucket = await subjectBucket(await key(), 'assessment-end', USER);
  await enforceRateLimit(limiter, [bucket]);
  assert.deepEqual(reasons, ['store_unavailable']);
  // Still limited, not open.
  assert.equal(await hitUntilRefused(limiter, bucket), bucket.limit - 1);
});

test('R9H: a durable refusal is honored without consulting the fallback', async () => {
  let fallbackCalls = 0;
  const limiter = limiterWith(
    { hit: () => Promise.resolve({ allowed: false, retryAfterSeconds: 42 }) },
    { hit: () => { fallbackCalls += 1; return Promise.resolve({ allowed: true, retryAfterSeconds: 0 }); } },
  );
  await assert.rejects(enforceRateLimit(limiter, [await subjectBucket(await key(), 'staff-session', USER)]),
    (error: unknown) => error instanceof RateLimitedError && error.retryAfterSeconds === 42);
  assert.equal(fallbackCalls, 0);
});

test('R9H: malformed buckets are an internal error, never silently unlimited', async () => {
  const limiter = limiterWith(new MemoryRateLimitStore());
  for (const bad of [[], [{ digest: 'USER-ID', windowSeconds: 600, limit: 1 }], [{ digest: 'a'.repeat(64), windowSeconds: 0, limit: 1 }]]) {
    await assert.rejects(enforceRateLimit(limiter, bad as RateLimitBucket[]),
      (error: unknown) => error instanceof TrustedError && error.code === 'INTERNAL');
  }
});

test('R9H: the isolate fallback stays bounded in memory', async () => {
  const time = clock();
  const store = new MemoryRateLimitStore(time.now, 50);
  for (let i = 0; i < 500; i += 1) {
    await store.hit([{ digest: i.toString(16).padStart(64, '0'), windowSeconds: 600, limit: 5 }]);
  }
  const size = (store as unknown as { windows: Map<string, unknown> }).windows.size;
  assert.ok(size <= 50, `size ${size}`);
});

test('R9H: every trusted Edge entrypoint is covered by a policy and the shared wrapper', () => {
  const functionsDir = path.join(ROOT, 'supabase/functions');
  const entrypoints = fs.readdirSync(functionsDir)
    .filter((name) => !name.startsWith('_') && name !== 'tests' && fs.existsSync(path.join(functionsDir, name, 'index.ts')));
  assert.deepEqual([...entrypoints].sort(), [...RATE_LIMITED_OPERATIONS].sort());
  for (const name of entrypoints) {
    const text = source(`supabase/functions/${name}/index.ts`);
    assert.match(text, new RegExp(`serveTrusted(?:Clinical|Staff|Admission)?\\('${name}'`), name);
    assert.doesNotMatch(text, /Deno\.serve\(\s*async/, `${name} must not bypass the wrapper`);
  }
});

test('R9H: the wrapper limits by address before Auth and by verified subject before the body', () => {
  const http = source('supabase/functions/_shared/http.ts');
  const address = http.indexOf('addressBucket(key, operation, request.headers)');
  const verify = http.indexOf('verifyCaller(request, admin)');
  const subject = http.indexOf('subjectBucket(key, operation, caller.userId)');
  const body = http.indexOf('readBody(request)', verify);
  assert.ok(address > 0 && address < verify && verify < subject && subject < body);
  // The rate-limit log line carries the operation and a fixed reason only.
  assert.match(http, /console\.error\(JSON\.stringify\(\{ operation, rateLimit: reason \}\)\)/);
  assert.match(http, /'retry-after'/);
  // No request header value, user id or key is ever logged by the limiter.
  const limiterSource = source('supabase/functions/_shared/trusted/rate-limit.ts');
  assert.doesNotMatch(limiterSource, /console\./);
});

test('R9H: the migration stores digests only and is callable by the service role alone', () => {
  const sql = source('supabase/migrations/20261001090000_r9h_edge_rate_limits.sql');
  assert.match(sql, /bucket_digest text not null check \(bucket_digest ~ '\^\[0-9a-f\]\{64\}\$'\)/);
  assert.match(sql, /security definer\s+set search_path = ''/);
  assert.match(sql, /revoke all on function public\.trusted_rate_limit_hit\(text\[\], integer\[\], integer\[\]\) from public, anon, authenticated;/);
  assert.match(sql, /grant execute on function public\.trusted_rate_limit_hit\(text\[\], integer\[\], integer\[\]\) to service_role;/);
  assert.match(sql, /revoke all on table private\.edge_rate_limit_windows from public, anon, authenticated, service_role;/);
  assert.doesNotMatch(sql, /\b(ip|address|user_id|auth_user_id|token)\b\s+(text|inet|uuid)/i);
});
