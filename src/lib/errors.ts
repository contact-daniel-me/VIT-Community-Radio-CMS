/**
 * Error translation.
 *
 * Users see a sentence they can act on. Stack traces, SQL constraint names and
 * PostgREST internals stay in the console.
 */
import type { PostgrestError } from '@supabase/supabase-js';

export type AppErrorKind =
  | 'AUTH'
  | 'PERMISSION'
  | 'VALIDATION'
  | 'CONFLICT'
  | 'NOT_FOUND'
  | 'NETWORK'
  | 'UNKNOWN';

export class AppError extends Error {
  readonly kind: AppErrorKind;
  readonly cause?: unknown;

  constructor(kind: AppErrorKind, message: string, cause?: unknown) {
    super(message);
    this.name = 'AppError';
    this.kind = kind;
    this.cause = cause;
  }
}

const FRIENDLY_BY_KIND: Record<AppErrorKind, string> = {
  AUTH: 'Your session has expired. Please sign in again.',
  PERMISSION: 'You do not have permission to do that.',
  VALIDATION: 'Some of the details are not valid. Please check and try again.',
  CONFLICT: 'That change clashes with something already saved.',
  NOT_FOUND: 'We could not find that item.',
  NETWORK: 'Cannot reach the server. Check your connection and try again.',
  UNKNOWN: 'Something went wrong. Please try again.',
};

function isPostgrestError(value: unknown): value is PostgrestError {
  return (
    typeof value === 'object' &&
    value !== null &&
    'message' in value &&
    ('code' in value || 'details' in value)
  );
}

/**
 * Messages raised by our own `raise exception` calls are written for users and
 * are passed through. Anything Postgres generates itself is replaced.
 */
function isAuthoredMessage(message: string): boolean {
  if (!message) return false;
  const machineNoise =
    /violates|constraint|relation |column |syntax error|duplicate key|permission denied|function .*does not exist|invalid input/i;
  return !machineNoise.test(message);
}

export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;

  if (error instanceof TypeError && /fetch|network/i.test(error.message)) {
    return new AppError('NETWORK', FRIENDLY_BY_KIND.NETWORK, error);
  }

  if (isPostgrestError(error)) {
    const code = error.code ?? '';
    const kind: AppErrorKind =
      code === '42501'
        ? 'PERMISSION'
        : code === '23505' || code === '23P01'
          ? 'CONFLICT'
          : code === '23514' || code === '23503' || code === '22P02'
            ? 'VALIDATION'
            : code === 'PGRST116'
              ? 'NOT_FOUND'
              : code === 'PGRST301' || code === '401'
                ? 'AUTH'
                : 'UNKNOWN';

    if (import.meta.env.DEV) {
      console.error('[supabase]', code, error.message, error.details);
    }

    return new AppError(
      kind,
      isAuthoredMessage(error.message) ? error.message : FRIENDLY_BY_KIND[kind],
      error,
    );
  }

  if (error instanceof Error) {
    if (import.meta.env.DEV) console.error('[app]', error);
    return new AppError('UNKNOWN', FRIENDLY_BY_KIND.UNKNOWN, error);
  }

  return new AppError('UNKNOWN', FRIENDLY_BY_KIND.UNKNOWN, error);
}

/** Message for a user, for any thrown value. */
export function errorMessage(error: unknown): string {
  return toAppError(error).message;
}

/**
 * RLS filters rows out of an UPDATE instead of failing, so a write that returns
 * nothing means "you were not allowed to touch that row".
 */
export function assertWritten<T>(rows: T[] | null, what: string): T {
  if (!rows || rows.length === 0) {
    throw new AppError(
      'PERMISSION',
      `You do not have permission to change this ${what}, or it is locked in its current state.`,
    );
  }
  return rows[0];
}
