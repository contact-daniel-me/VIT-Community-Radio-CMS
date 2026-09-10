import type { PostgrestError } from '@supabase/supabase-js';
import { AppError, toAppError } from './errors';

/**
 * Supabase responses are a discriminated union of a success shape and an error
 * shape, so the whole response object is inferred and the payload type is read
 * off it. Inferring `T` from `data` directly would collapse to `never`.
 */
type AnyResult = { data: unknown; error: PostgrestError | null };

/**
 * Await a Supabase query and return its data, or throw a translated AppError.
 * A `null` row (maybeSingle, or a row filtered out by RLS) becomes NOT_FOUND,
 * so callers never have to null-check.
 */
export async function unwrap<R extends AnyResult>(
  query: PromiseLike<R>,
): Promise<NonNullable<R['data']>> {
  const { data, error } = await query;
  if (error) throw toAppError(error);
  if (data === null || data === undefined) {
    throw new AppError('NOT_FOUND', 'We could not find that item.');
  }
  return data as NonNullable<R['data']>;
}

/** Same, but a missing row is a valid `null` answer rather than an error. */
export async function unwrapMaybe<R extends AnyResult>(
  query: PromiseLike<R>,
): Promise<R['data'] | null> {
  const { data, error } = await query;
  if (error) throw toAppError(error);
  return data ?? null;
}
