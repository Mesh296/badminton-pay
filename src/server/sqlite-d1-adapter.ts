import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";

// The API code talks to its database through Cloudflare's D1 interface
// (prepare / bind / first / run / all / batch). On a plain server the data
// lives in one SQLite file instead; this wraps Node's built-in SQLite so the
// same API code runs unchanged. Only the parts of D1 the app uses are covered.

class Statement {
  private readonly db: DatabaseSync;
  private readonly sql: string;
  private readonly params: SQLInputValue[];

  constructor(db: DatabaseSync, sql: string, params: SQLInputValue[] = []) {
    this.db = db;
    this.sql = sql;
    this.params = params;
  }

  bind(...params: SQLInputValue[]) {
    return new Statement(this.db, this.sql, params);
  }

  /** First row, or null. Also runs writes that end in RETURNING. */
  async first() {
    return this.db.prepare(this.sql).get(...this.params) ?? null;
  }

  async run() {
    const result = this.db.prepare(this.sql).run(...this.params);
    return { success: true, meta: { changes: Number(result.changes) } };
  }

  async all() {
    return this.execute();
  }

  /** Runs the statement now; reads return their rows, writes return none. */
  execute() {
    return { success: true, results: this.db.prepare(this.sql).all(...this.params), meta: {} };
  }
}

/** Applies each migrations/*.sql file once, in name order, each in its own transaction. */
function migrate(db: DatabaseSync, migrationsDir: string) {
  db.exec("CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY)");
  // A database imported from a Cloudflare D1 export already has the schema,
  // and D1's own record of which files were applied. Take that record over so
  // those files are not run a second time.
  if (db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'd1_migrations'").get()) {
    db.exec("INSERT OR IGNORE INTO _migrations (name) SELECT name FROM d1_migrations");
  }
  const files = readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort();
  for (const file of files) {
    if (db.prepare("SELECT 1 FROM _migrations WHERE name = ?").get(file)) continue;
    db.exec("BEGIN");
    try {
      db.exec(readFileSync(path.join(migrationsDir, file), "utf8"));
      db.prepare("INSERT INTO _migrations (name) VALUES (?)").run(file);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
}

/**
 * Opens (creating if needed) the SQLite file, brings its schema up to date and
 * returns it behind the D1 interface. Foreign keys are enforced, as on D1.
 */
export function openDatabase(file: string, migrationsDir: string): D1Database {
  mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file, { enableForeignKeyConstraints: true });
  migrate(db, migrationsDir);

  const d1 = {
    prepare: (sql: string) => new Statement(db, sql),
    /** All statements succeed or none do. SQLite calls here are synchronous, so nothing can interleave. */
    async batch(statements: Statement[]) {
      db.exec("BEGIN");
      try {
        const results = statements.map((statement) => statement.execute());
        db.exec("COMMIT");
        return results;
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
  };
  return d1 as unknown as D1Database;
}
