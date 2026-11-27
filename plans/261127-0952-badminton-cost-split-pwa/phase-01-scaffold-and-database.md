---
phase: 1
title: Scaffold and Database
status: completed
effort: 1h
priority: P1
dependencies: []
---

# Phase 1: Scaffold and Database

## Overview

Stand up one Cloudflare Worker that serves a React SPA and a Hono API, backed by a local D1 database with the full schema. Ends with a health endpoint that reads the DB.

## Requirements

- Functional: SPA served at `/`; `/api/*` handled by the Worker; D1 has 4 tables; `GET /api/health` queries D1.
- Non-functional: TypeScript strict; works fully offline from Cloudflare (local D1), no account needed yet.

## Architecture

- Static assets binding with SPA fallback; Worker runs first only for `/api/*`.
- D1 binding name `DB`; migrations in `migrations/`.
- Money stored as integer VND. Dates stored as `YYYY-MM-DD` text chosen on the client.
- `sessions.id` is a UUID generated in the Worker so a session and its attendee rows can be written in one `DB.batch()` without reading back an auto-increment id.

## Related Code Files

- Create: `package.json`, `wrangler.jsonc`, `vite.config.ts`, `tsconfig*.json`, `index.html`
- Create: `src/client/main.tsx`, `src/client/app.tsx`
- Create: `src/worker/index.ts`
- Create: `migrations/0001_init.sql`
- Create: `.gitignore`, `.dev.vars.example`
- Modify: `README.md` (dev commands only; full docs in phase 4)

## Implementation Steps

1. Check the current React-on-Workers guide before scaffolding: https://developers.cloudflare.com/workers/framework-guides/web-apps/react/
2. Scaffold with `npm create cloudflare@latest` using the React framework option. The repo is not empty (`README.md`, `plans/`), so scaffold into a temp directory and move the files in.
3. Rename the template's client folder to `src/client` and keep the Worker entry at `src/worker/index.ts`; fix `index.html` and tsconfig includes. Do this once here so later phases have stable paths.
4. Install `hono` and `zod`. Dev: `vitest`, `@cloudflare/vitest-pool-workers`.
5. Configure `wrangler.jsonc`:
   ```jsonc
   {
     "name": "badminton-pay",
     "main": "src/worker/index.ts",
     "compatibility_date": "<today>",
     "assets": {
       "not_found_handling": "single-page-application",
       "run_worker_first": ["/api/*"]
     },
     "d1_databases": [
       { "binding": "DB", "database_name": "badminton-pay",
         "database_id": "local-placeholder", "migrations_dir": "migrations" }
     ]
   }
   ```
6. Write `migrations/0001_init.sql`:
   ```sql
   CREATE TABLE members (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     name TEXT NOT NULL,
     bank_code TEXT,          -- NAPAS BIN used by VietQR
     account_no TEXT,
     account_name TEXT,
     active INTEGER NOT NULL DEFAULT 1
   );
   CREATE TABLE sessions (
     id TEXT PRIMARY KEY,     -- UUID from the Worker
     date TEXT NOT NULL,
     payer_id INTEGER NOT NULL REFERENCES members(id),
     court_amount INTEGER NOT NULL CHECK (court_amount >= 0),
     drink_amount INTEGER NOT NULL DEFAULT 0 CHECK (drink_amount >= 0),
     note TEXT
   );
   CREATE TABLE session_attendees (
     session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
     member_id INTEGER NOT NULL REFERENCES members(id),
     drank INTEGER NOT NULL DEFAULT 0,
     share INTEGER NOT NULL CHECK (share >= 0),
     PRIMARY KEY (session_id, member_id)
   );
   CREATE TABLE transfers (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     date TEXT NOT NULL,
     from_id INTEGER NOT NULL REFERENCES members(id),
     to_id INTEGER NOT NULL REFERENCES members(id),
     amount INTEGER NOT NULL CHECK (amount > 0),
     note TEXT,
     CHECK (from_id <> to_id)
   );
   CREATE INDEX idx_sessions_date ON sessions(date);
   ```
7. Apply locally: `wrangler d1 migrations apply badminton-pay --local`.
8. Hono app in `src/worker/index.ts` with `GET /api/health` returning `{ ok: true, members: <count> }`, and a JSON 404 for unknown `/api/*` paths.
9. Add `.dev.vars` with `EDIT_PIN=dev-pin-123` (gitignored) and commit `.dev.vars.example`.
10. npm scripts: `dev`, `build`, `typecheck`, `test`, `deploy`, `db:migrate:local`, `db:migrate:remote`.

## Success Criteria

- [x] `npm run dev` serves the React page
- [x] `GET /api/health` returns `{ "ok": true, "members": 0 }`
- [x] `GET /some/unknown/path` returns the SPA `index.html`; `GET /api/nope` returns JSON 404
- [x] `npm run typecheck` and `npm run build` pass
- [x] `.dev.vars` is not tracked by git

## Risk Assessment

- Template layout or config keys changed since this plan: follow the linked guide, keep the target folder layout.
- D1 enforces foreign keys by default; confirm with a deliberate bad insert during step 7.
