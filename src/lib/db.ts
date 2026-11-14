import { pendingMigrations } from "../../scripts/migration-plan.mjs";

/** Which database backend is active. */
export type DbSource = "neon" | "pglite";

// An empty/whitespace DATABASE_URL (an easy misconfig in deploy UIs) must mean
// "unset" — otherwise production would silently run on the PGLite fallback.
const rawDatabaseUrl = typeof process !== "undefined" ? process.env.DATABASE_URL : undefined;
const databaseUrl = rawDatabaseUrl && rawDatabaseUrl.trim() ? rawDatabaseUrl : undefined;

/**
 * Active backend: real **Neon** when `DATABASE_URL` is set (deployed / configured
 * sandbox), otherwise a local embedded **PGLite** (Postgres compiled to WASM) so
 * the app has a working database even with nothing configured — the live preview
 * included. Swap in Neon later by just setting `DATABASE_URL`; no code changes.
 */
export const dbSource: DbSource = databaseUrl ? "neon" : "pglite";

/**
 * Minimal shared SQL surface, satisfied by both Neon and PGLite. Both the
 * tagged-template and `.query()` forms resolve to an array of row objects:
 *
 *   const sql = await getSql();
 *   const rows = await sql`select * from todos where id = ${id}`; // parameterized
 *   const rows2 = await sql.query("select * from todos where id = $1", [id]);
 */
export interface Sql {
  <T = Record<string, unknown>>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T[]>;
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
  /** One row, or `null`. Never throws on "not found". */
  one<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T | null>;
  /** Rows affected by a write. `-1` when the driver does not report a count. */
  count(text: string, params?: unknown[]): Promise<number>;
  /**
   * Run `body` inside a single database transaction, on one dedicated
   * connection. Commits on resolve, rolls back on throw.
   *
   * Every multi-statement write in this codebase that must not be observed
   * half-applied (ledger + balance, audit chain head, approval claim) goes
   * through here. Nested calls reuse the outer transaction rather than opening
   * a second one, which Postgres does not support and PGLite does not nest.
   */
  transaction<T>(body: (tx: Sql) => Promise<T>): Promise<T>;
  /**
   * Run `body` while holding a named Postgres advisory lock. Used to serialise
   * read-modify-write sequences (the audit hash head) across processes, which a
   * row lock alone cannot cover when the row does not exist yet.
   */
  advisory<T>(key: string, body: (tx: Sql) => Promise<T>): Promise<T>;
}

/** 64-bit advisory-lock key derived from a stable string (signed Postgres bigint). */
export function advisoryKey(name: string): bigint {
  // FNV-1a 64-bit. Deterministic across processes and restarts.
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  for (const byte of Buffer.from(name, "utf8")) {
    hash = ((hash ^ BigInt(byte)) * prime) & mask;
  }
  // Postgres bigint is signed: interpret the 64-bit hash as signed
  // (`vantage-ars:audit-chain` hashes above 2^63 and would otherwise overflow).
  return hash === 0n ? 1n : BigInt.asIntN(64, hash);
}

/**
 * Init state lives on globalThis as promises: dev HMR creates new instances of
 * this module, and two instances racing module-level state would open a second
 * pool or run two concurrent PGLite migration passes (whose duplicate
 * `_migrations` insert rejects — and would get memoized, poisoning every later
 * `getSql()`). A failed init clears its slot so the next call retries.
 */
const globalRef = globalThis as typeof globalThis & {
  __pgSqlPromise__?: Promise<Sql>;
  __pgPoolPromise__?: Promise<import("pg").Pool>;
  __pgliteInstance__?: Promise<import("@electric-sql/pglite").PGlite>;
  __pgliteMigrateChain__?: Promise<void>;
};

/**
 * Result-type parity: Postgres sends every value as text plus a type OID — the
 * JS value is the DRIVER's parsing choice, and pg and PGLite disagree (pg:
 * int8 -> string, date -> local-midnight Date; PGLite: int8 -> BigInt, which
 * JSON.stringify rejects, date -> UTC Date). Normalize both so preview and
 * production return identical, JSON-safe shapes:
 *   int8/bigint (incl. count(*)) -> number (past 2^53 loses precision — cast
 *                                   `::text` if you ever need huge integers)
 *   date                         -> 'YYYY-MM-DD' string
 *   interval                     -> Postgres interval text
 * numeric already comes back as a string on both (arbitrary precision).
 */
const OID_INT8 = 20;
const OID_DATE = 1082;
const OID_INTERVAL = 1186;
const identity = (v: string) => v;

type Run = <T>(text: string, params: unknown[]) => Promise<T[]>;

/** Wrap a query runner in the tagged-template + `.query()` `Sql` surface. */
function toSql(run: Run): Sql {
  const sql = (async <T = Record<string, unknown>>(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<T[]> => {
    // Rebuild with $1, $2, … placeholders so values stay parameterized.
    let text = strings[0] ?? "";
    for (let i = 0; i < values.length; i += 1) text += `$${i + 1}${strings[i + 1]}`;
    return run<T>(text, values);
  }) as unknown as Sql;

  sql.query = <T = Record<string, unknown>>(text: string, params: unknown[] = []) =>
    run<T>(text, params);

  sql.one = async <T = Record<string, unknown>>(
    text: string,
    params: unknown[] = [],
  ): Promise<T | null> => {
    const rows = await run<T>(text, params);
    return rows[0] ?? null;
  };

  sql.count = async (text: string, params: unknown[] = []): Promise<number> => {
    const rows = await run<{ affected: number }>(text, params);
    const value = rows[0]?.affected;
    return typeof value === "number" ? value : rows.length;
  };

  // Safe defaults so a plain `Sql` is a complete implementation even on a
  // backend without transaction support. Neon and PGLite both override these.
  sql.transaction = async <T>(body: (tx: Sql) => Promise<T>): Promise<T> => body(sql);
  sql.advisory = async <T>(_key: string, body: (tx: Sql) => Promise<T>): Promise<T> => body(sql);

  return sql;
}

/**
 * Wrap a `pg` client so it is itself a complete `Sql`. Nested `transaction()`
 * reuses the live transaction (Postgres has no nested transactions and PGLite
 * does not support them either); `advisory()` uses `pg_advisory_xact_lock`,
 * which is released automatically when the transaction ends.
 */
function fromClient(tx: Sql): Sql {
  const wrap = ((strings: TemplateStringsArray, ...values: unknown[]) =>
    tx(strings, ...values)) as unknown as Sql;
  wrap.query = (text, params) => tx.query(text, params ?? []);
  wrap.one = (text, params) => tx.one(text, params ?? []);
  wrap.count = (text, params) => tx.count(text, params ?? []);
  wrap.transaction = (body) => body(wrap);
  wrap.advisory = async (key, body) => {
    await tx.query("select pg_advisory_xact_lock($1)", [advisoryKey(key).toString()]);
    return body(wrap);
  };
  return wrap;
}

function createNeonSql(): Promise<Sql> {
  globalRef.__pgSqlPromise__ ??= (async () => {
    // Regular Postgres driver: node-postgres (`pg`) — works directly with Neon's
    // pooled endpoint. One pool per process; warm serverless instances reuse it.
    const { Pool, types } = await import("pg");
    types.setTypeParser(OID_INT8, Number);
    types.setTypeParser(OID_DATE, identity);
    types.setTypeParser(OID_INTERVAL, identity);
    const pool = new Pool({
      connectionString: databaseUrl,
      // Neon serves many concurrent serverless instances. Keep the per-instance
      // pool small so the project stays inside its connection budget; a
      // transaction below pins one connection for its duration.
      max: Math.max(1, Number(process.env.DATABASE_POOL_MAX ?? 4) || 4),
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 10_000,
      statement_timeout: 20_000,
      application_name: "vantage-ars",
      // Neon is always TLS. Never silently downgrade: an explicit
      // `sslmode=disable` in the URL is honoured, anything else is required.
      ssl: databaseUrl?.includes("sslmode=disable") ? false : { rejectUnauthorized: false },
    });
    globalRef.__pgPoolPromise__ = Promise.resolve(pool);

    const run: Run = async <T>(text: string, params: unknown[]) => {
      const res = await pool.query(text, params);
      return res.rows as T[];
    };

    const sql = toSql(run);

    sql.transaction = async <T>(body: (tx: Sql) => Promise<T>): Promise<T> => {
      const client = await pool.connect();
      try {
        await client.query("begin");
        const onClient = toSql(async <R>(text: string, params: unknown[]) => {
          const res = await client.query(text, params);
          return res.rows as R[];
        });
        const result = await body(fromClient(onClient));
        await client.query("commit");
        return result;
      } catch (err) {
        await client.query("rollback").catch(() => undefined);
        throw err;
      } finally {
        client.release();
      }
    };

    sql.advisory = async <T>(key: string, body: (tx: Sql) => Promise<T>): Promise<T> =>
      sql.transaction(async (tx) => {
        await tx.query("select pg_advisory_xact_lock($1)", [advisoryKey(key).toString()]);
        return body(tx);
      });

    return sql;
  })().catch((err) => {
    globalRef.__pgSqlPromise__ = undefined;
    throw err;
  });
  return globalRef.__pgSqlPromise__;
}

/**
 * Migration sources as `path -> sql`, whichever runtime we are on.
 *
 * The glob is non-recursive, so `migrations/auth/` (the opt-in copy) is never
 * applied — the same file lives at `migrations/0001_auth.sql` and is.
 */
async function loadMigrationSources(): Promise<Record<string, string>> {
  if (typeof import.meta.glob === "function") {
    return import.meta.glob<string>("/migrations/*.sql", {
      query: "?raw",
      import: "default",
      eager: true,
    });
  }

  const { readdirSync, readFileSync } = await import("node:fs");
  const { join: joinPath } = await import("node:path");
  const directory = joinPath(process.cwd(), "migrations");
  const sources: Record<string, string> = {};
  let names: string[];
  try {
    names = readdirSync(directory);
  } catch {
    return sources;
  }
  for (const name of names) {
    if (!isMigrationFileName(name)) continue;
    sources[`/migrations/${name}`] = readFileSync(joinPath(directory, name), "utf8");
  }
  return sources;
}

function isMigrationFileName(name: string): boolean {
  return name.endsWith(".sql") && !name.startsWith(".");
}

async function createPgliteSql(): Promise<Sql> {
  // Embedded Postgres, imported on demand so it never loads on the Neon path.
  // One in-memory instance per process, shared across HMR module instances, so
  // data survives source edits (it resets on dev-server restart).
  globalRef.__pgliteInstance__ ??= (async () => {
    const { PGlite } = await import("@electric-sql/pglite");
    // PGLITE_DATA_DIR keeps the embedded database on disk (self-hosted
    // single-server installs). Unset = in-memory, reset on restart.
    const dataDir = process.env.PGLITE_DATA_DIR?.trim() || undefined;
    if (dataDir) {
      const { mkdirSync } = await import("node:fs");
      mkdirSync(dataDir, { recursive: true, mode: 0o700 });
    }
    const pg = new PGlite(dataDir, {
      parsers: {
        [OID_INT8]: Number,
        [OID_DATE]: identity,
        [OID_INTERVAL]: identity,
      },
    });
    await pg.waitReady;
    await pg.exec(
      "create table if not exists _migrations (name text primary key, applied_at timestamptz not null default now())",
    );
    return pg;
  })().catch((err) => {
    globalRef.__pgliteInstance__ = undefined;
    throw err;
  });
  const pg = await globalRef.__pgliteInstance__;

  // Apply migrations/ (the single schema source) so preview matches production.
  // Runs once per module instance — so an HMR reload after adding a migration
  // file applies it live — with passes serialized on a global chain so
  // concurrent callers never double-apply.
  //
  // Vite gives us `import.meta.glob`, which inlines the SQL into the bundle so
  // there is no runtime filesystem read. Plain Node (migrations CLI, the office
  // verification harness, a one-off script) has no `import.meta.glob`, so read
  // the directory instead. Both paths feed the same `pendingMigrations`
  // ordering, so the schema is identical either way.
  const migrations = await loadMigrationSources();
  const migrate = async (): Promise<void> => {
    const doneRows = await pg.query<{ name: string }>("select name from _migrations");
    const done = doneRows.rows.map((r) => r.name);
    for (const { name, path } of pendingMigrations(Object.keys(migrations), done)) {
      // Apply + record atomically (parity with scripts/migrate.mjs) so a failed
      // statement can't leave a file half-applied but untracked.
      await pg.transaction(async (tx) => {
        const file = migrations[path];
        if (!file) return;
        await tx.exec(file);
        await tx.query("insert into _migrations (name) values ($1)", [name]);
      });
    }
  };
  const pass = (globalRef.__pgliteMigrateChain__ ?? Promise.resolve())
    .catch(() => undefined) // an earlier failed pass must not wedge the chain
    .then(migrate);
  globalRef.__pgliteMigrateChain__ = pass;
  await pass;

  const run: Run = async <T>(text: string, params: unknown[]) => {
    const result = await pg.query<T>(text, params);
    return result.rows;
  };
  const sql = toSql(run);

  // PGLite is a single embedded connection, so `pg.transaction` is the real
  // thing here. Same nesting contract as the pg path.
  sql.transaction = async <T>(body: (tx: Sql) => Promise<T>): Promise<T> =>
    pg.transaction(async (pgliteTx) => {
      const onTx = toSql(async <R>(text: string, params: unknown[]) => {
        const result = await pgliteTx.query<R>(text, params);
        return result.rows;
      });
      return body(fromClient(onTx));
    });

  // Single connection means the whole process is already serialised; the
  // transaction itself provides the mutual exclusion the advisory lock buys on
  // a pooled Postgres server.
  sql.advisory = async <T>(_key: string, body: (tx: Sql) => Promise<T>): Promise<T> =>
    sql.transaction(body);

  return sql;
}

let sqlPromise: Promise<Sql> | null = null;

async function createSql(): Promise<Sql> {
  if (typeof window !== "undefined") {
    throw new Error(
      "@/lib/db is server-only — call getSql() from a createServerFn handler " +
        "or a server route loader, never from client code.",
    );
  }
  return dbSource === "neon" ? createNeonSql() : createPgliteSql();
}

/**
 * Get the shared, **server-only** SQL client. Neon when `DATABASE_URL` is set,
 * otherwise the local PGLite fallback. Memoized — safe to call per request.
 *
 * Schema comes from `migrations/*.sql`, auto-applied before the first query on
 * both backends — define tables there, never inline in server functions.
 */
export function getSql(): Promise<Sql> {
  sqlPromise ??= createSql().catch((err) => {
    sqlPromise = null; // don't memoize failures — let the next call retry
    throw err;
  });
  return sqlPromise;
}

/**
 * The shared PGLite instance (preview only), with `migrations/*.sql` applied.
 * Lets Better Auth persist to the SAME embedded DB as app data in preview (via a
 * Kysely dialect). Throws when `DATABASE_URL` is set (that path uses Neon).
 */
export async function getPglite(): Promise<import("@electric-sql/pglite").PGlite> {
  if (dbSource !== "pglite") {
    throw new Error("getPglite() is only available on the PGLite fallback (no DATABASE_URL)");
  }
  await getSql();
  const pg = await globalRef.__pgliteInstance__;
  if (!pg) throw new Error("PGLite instance failed to initialize");
  return pg;
}

/**
 * Finish DB bootstrap before the server handles traffic.
 *
 * - **PGLite** (preview / no `DATABASE_URL`): open the embedded DB and apply
 *   `migrations/*.sql`. Idempotent — concurrent callers share one promise.
 * - **Neon**: verify the schema is actually there. Migrations are applied by
 *   `npm run build` / `scripts/migrate.mjs`, so there is nothing to do here —
 *   but silently running against a database with no `company_state` table turns
 *   a deployment mistake into a wall of "relation does not exist" errors deep
 *   inside a request. Fail loudly, once, at boot instead.
 *
 * Vite `configureServer` awaits this at dev startup; production imports of this
 * module kick it off immediately (see bottom of file).
 */
export function ensureDbReady(): Promise<void> {
  if (dbSource === "pglite") return getSql().then(() => undefined);
  return (async () => {
    try {
      const sql = await getSql();
      await sql`select 1 from company_state limit 1`;
    } catch (err) {
      throw new Error(
        "DATABASE_URL is set but the schema is missing or unreachable. " +
          "Run `npm run db:migrate` against that database (it runs automatically " +
          "during `npm run build` and on container start). Cause: " +
          (err instanceof Error ? err.message : String(err)),
        { cause: err },
      );
    }
  })();
}

/**
 * Liveness probe for the office: can we reach the database, and does it hold
 * the tables the office needs? Used by `/api/health` and by the autonomy
 * scheduler to refuse to run blind.
 */
export async function databaseHealth(): Promise<{
  ok: boolean;
  source: DbSource;
  latencyMs: number;
  detail: string;
}> {
  const startedAt = Date.now();
  try {
    const sql = await getSql();
    const rows = await sql<{ present: number }>`
      select count(*)::int as present
      from information_schema.tables
      where table_schema = 'public'
        and table_name in (
          'company_state','constitution_provisions','agents','inbound_items','leads',
          'opportunities','campaigns','ledger_entries','tickets','documents',
          'approvals','decisions','audit_events','founder_notices','chat_threads',
          'chat_messages','rate_hits','quote_links','work_items','agent_runs','office_state',
          'delegations','delegation_usage','subscriptions','billing_cycles'
        )
    `;
    const present = Number(rows[0]?.present ?? 0);
    const ok = present >= 25;
    return {
      ok,
      source: dbSource,
      latencyMs: Date.now() - startedAt,
      detail: ok
        ? `Schema present (${present} office tables).`
        : `Only ${present} of 25 office tables exist. Run migrations.`,
    };
  } catch (err) {
    return {
      ok: false,
      source: dbSource,
      latencyMs: Date.now() - startedAt,
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

// Server-only eager start: kick DB bootstrap as soon as this module loads in
// Node. Client bundles never hit this path (`getSql` throws in the browser).
//
// Unit tests that import a pure helper from this module do not need a database,
// and booting embedded Postgres under the parallel test runner is both slow and
// needlessly fragile. `VANTAGE_SKIP_DB_BOOTSTRAP=1` skips only the eager start;
// any code that actually calls `getSql()` still initialises normally.
const globalBoot = globalThis as typeof globalThis & {
  __pgBootstrapPromise__?: Promise<void>;
};
const skipEagerBootstrap =
  typeof process !== "undefined" && process.env.VANTAGE_SKIP_DB_BOOTSTRAP === "1";
if (typeof window === "undefined" && !skipEagerBootstrap) {
  globalBoot.__pgBootstrapPromise__ ??= ensureDbReady().catch((err) => {
    globalBoot.__pgBootstrapPromise__ = undefined;
    console.error("[db] bootstrap failed:", err);
    throw err;
  });
}
