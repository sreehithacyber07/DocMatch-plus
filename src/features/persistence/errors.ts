/**
 * Persistence error classification.
 *
 * Retrying is only ever right for a transient failure. An RLS denial, an
 * authentication failure, a validation or constraint rejection, and an
 * idempotency conflict are all answers, not accidents, and repeating the same
 * request cannot change them.
 */
export type PersistenceErrorKind =
  | 'transient'
  | 'rls-denied'
  | 'auth'
  | 'duplicate'
  | 'rejected'
  | 'idempotency-conflict'
  | 'lineage-conflict'
  | 'validation'
  | 'dependency-failed'
  | 'aborted';

export interface PersistenceError {
  kind: PersistenceErrorKind;
  /** Diagnostic only. Never contains tokens or patient answers. */
  code: string;
  status: number | null;
}

export interface RawBackendError {
  status?: number | null;
  code?: string | null;
  message?: string | null;
  name?: string | null;
}

const TRANSIENT_STATUS = new Set([0, 408, 425, 429, 500, 502, 503, 504]);
const TRANSIENT_CODES = new Set(['57014', 'PGRST000', 'PGRST001', 'PGRST002', 'PGRST003', '08000', '08003', '08006']);
const JWT_CODES = new Set(['PGRST300', 'PGRST301', 'PGRST302', 'PGRST303']);

export function classifyBackendError(error: RawBackendError): PersistenceError {
  const status = typeof error.status === 'number' ? error.status : null;
  const code = typeof error.code === 'string' ? error.code : '';
  const message = typeof error.message === 'string' ? error.message : '';
  const name = typeof error.name === 'string' ? error.name : '';
  const make = (kind: PersistenceErrorKind): PersistenceError => ({ kind, code, status });

  if (name === 'AbortError' || code === 'ABORT_ERR' || message.startsWith('AbortError')) return make('aborted');
  if (code === '23505') return make('duplicate');
  if (JWT_CODES.has(code)) return make('auth');
  if (code === '42501' || status === 403) return make('rls-denied');
  if (status === 401) return make('auth');
  if (TRANSIENT_CODES.has(code)) return make('transient');
  if (code.startsWith('22') || code.startsWith('23')) return make('rejected');
  if (status !== null && TRANSIENT_STATUS.has(status)) return make('transient');
  return make('rejected');
}

/** auth-js errors: a retryable fetch error is transient; everything else is an auth answer. */
export function classifyAuthError(error: RawBackendError): PersistenceError {
  const status = typeof error.status === 'number' ? error.status : null;
  const name = typeof error.name === 'string' ? error.name : '';
  const code = typeof error.code === 'string' ? error.code : name;
  if (name === 'AuthRetryableFetchError' || (status !== null && (status === 0 || status >= 500))) {
    return { kind: 'transient', code, status };
  }
  return { kind: 'auth', code, status };
}

export function isRetryable(error: PersistenceError): boolean {
  return error.kind === 'transient';
}
