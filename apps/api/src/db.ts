import { readdirSync, readFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export type Row = Record<string, unknown>;

/** Minimal SQL surface shared by node-postgres and PGlite. */
export interface Db {
  query<T extends Row = Row>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
  close(): Promise<void>;
  kind: "postgres" | "pglite";
}

export async function openDb(opts: { databaseUrl?: string; pgliteDir?: string; memory?: boolean }): Promise<Db> {
  if (opts.databaseUrl) {
    const { default: pg } = await import("pg");
    const pool = new pg.Pool({ connectionString: opts.databaseUrl, max: 10 });
    return {
      kind: "postgres",
      query: async <T extends Row>(text: string, params?: unknown[]) => {
        const r = await pool.query(text, params as unknown[]);
        return { rows: r.rows as T[] };
      },
      close: () => pool.end(),
    };
  }
  const { PGlite } = await import("@electric-sql/pglite");
  let pglite;
  if (opts.memory) {
    pglite = new PGlite();
  } else {
    mkdirSync(opts.pgliteDir!, { recursive: true });
    pglite = new PGlite(opts.pgliteDir!);
  }
  return {
    kind: "pglite",
    query: async <T extends Row>(text: string, params?: unknown[]) => {
      const r = await pglite.query<T>(text, params as unknown[]);
      return { rows: r.rows };
    },
    close: () => pglite.close(),
  };
}

export async function migrate(db: Db): Promise<string[]> {
  await db.query(`CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  const dir = join(dirname(fileURLToPath(import.meta.url)), "migrations");
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  const applied: string[] = [];
  for (const f of files) {
    const done = await db.query("SELECT 1 FROM schema_migrations WHERE name = $1", [f]);
    if (done.rows.length) continue;
    const sql = readFileSync(join(dir, f), "utf8");
    for (const stmt of sql.split(/;\s*$/m).map((s) => s.trim()).filter(Boolean)) {
      await db.query(stmt);
    }
    await db.query("INSERT INTO schema_migrations (name) VALUES ($1)", [f]);
    applied.push(f);
  }
  return applied;
}

export async function recordJob(db: Db, job: string, err?: unknown) {
  if (err) {
    await db.query(
      `INSERT INTO job_runs (job, last_error_at, last_error, consecutive_errors) VALUES ($1, now(), $2, 1)
       ON CONFLICT (job) DO UPDATE SET last_error_at = now(), last_error = $2, consecutive_errors = job_runs.consecutive_errors + 1`,
      [job, String((err as Error)?.message ?? err).slice(0, 500)],
    );
  } else {
    await db.query(
      `INSERT INTO job_runs (job, last_ok_at, consecutive_errors) VALUES ($1, now(), 0)
       ON CONFLICT (job) DO UPDATE SET last_ok_at = now(), consecutive_errors = 0`,
      [job],
    );
  }
}
