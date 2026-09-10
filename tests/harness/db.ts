/**
 * Backend test harness.
 *
 * Runs the REAL migrations from supabase/migrations against PGlite (PostgreSQL
 * compiled to WebAssembly, running in-process). Constraints, triggers, RPCs and
 * RLS policies are therefore executed exactly as they will be on Supabase.
 *
 * Impersonation is done the same way PostgREST does it: switch to the
 * `authenticated` role and set the `request.jwt.claims` GUC, which is what
 * auth.uid() reads.
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');
const migrationsDir = join(repoRoot, 'supabase', 'migrations');

export type Row = Record<string, unknown>;

export interface TestDb {
  raw: PGlite;
  /** Run SQL as the current session role. */
  sql<T extends Row = Row>(query: string, params?: unknown[]): Promise<T[]>;
  /** Run SQL as an end user: role `authenticated` with a JWT for `userId`. */
  asUser<T extends Row = Row>(userId: string, query: string, params?: unknown[]): Promise<T[]>;
  /** Run SQL as an unauthenticated visitor (role `anon`, no JWT). */
  asAnon<T extends Row = Row>(query: string, params?: unknown[]): Promise<T[]>;
  /** Create an auth user + profile and return its id. */
  createUser(opts: { email: string; fullName: string; role: AppRole }): Promise<string>;
  close(): Promise<void>;
}

export type AppRole = 'ADMIN' | 'PRODUCER' | 'RJ' | 'QC' | 'EDITOR' | 'SECTION_HEAD';

function migrationFiles(): string[] {
  return readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
}

export async function createTestDb(options: { seed?: boolean } = {}): Promise<TestDb> {
  const pg = new PGlite();
  await pg.waitReady;

  await pg.exec(readFileSync(join(here, 'bootstrap.sql'), 'utf8'));

  for (const file of migrationFiles()) {
    try {
      await pg.exec(readFileSync(join(migrationsDir, file), 'utf8'));
    } catch (error) {
      throw new Error(`Migration ${file} failed: ${(error as Error).message}`);
    }
  }

  if (options.seed) {
    await pg.exec(readFileSync(join(repoRoot, 'supabase', 'seed.sql'), 'utf8'));
  }

  const resetSession = async () => {
    await pg.exec(`reset role; select set_config('request.jwt.claims', '', false);`);
  };

  const run = async <T extends Row>(query: string, params?: unknown[]): Promise<T[]> => {
    const result = await pg.query<T>(query, params);
    return result.rows;
  };

  const db: TestDb = {
    raw: pg,

    sql: run,

    async asUser<T extends Row>(userId: string, query: string, params?: unknown[]) {
      await pg.exec(
        `set role authenticated;
         select set_config('request.jwt.claims',
           '${JSON.stringify({ sub: userId, role: 'authenticated' })}', false);`,
      );
      try {
        return await run<T>(query, params);
      } finally {
        await resetSession();
      }
    },

    async asAnon<T extends Row>(query: string, params?: unknown[]) {
      await pg.exec(`set role anon; select set_config('request.jwt.claims', '', false);`);
      try {
        return await run<T>(query, params);
      } finally {
        await resetSession();
      }
    },

    async createUser({ email, fullName, role }) {
      const rows = await run<{ id: string }>(
        `insert into auth.users (email, raw_user_meta_data, raw_app_meta_data)
         values ($1, jsonb_build_object('full_name', $2::text),
                     jsonb_build_object('role', $3::text))
         returning id`,
        [email, fullName, role],
      );
      return rows[0].id;
    },

    async close() {
      await pg.close();
    },
  };

  return db;
}

/** Assert that a query fails, and that the message matches. */
export async function expectFailure(
  action: () => Promise<unknown>,
  matcher: RegExp,
): Promise<string> {
  let message: string | null = null;
  try {
    await action();
  } catch (error) {
    message = (error as Error).message;
  }
  if (message === null) {
    throw new Error(`Expected a failure matching ${matcher}, but the statement succeeded`);
  }
  if (!matcher.test(message)) {
    throw new Error(`Expected a failure matching ${matcher}, got: ${message}`);
  }
  return message;
}

/** ISO timestamp `minutes` from now, for building schedule slots in tests. */
export function minutesFromNow(minutes: number): string {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}
