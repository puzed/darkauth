# Embedded PGLite Option – Plan

## Goals
- Offer two install choices: Remote Postgres or Embedded PGLite.
- Reuse current schema, migrations, services, and context pattern.
- Keep code simple, minimal deps, and non-invasive across the codebase.

## Dependencies
- Add: `@electric-sql/pglite`
- Keep: `pg` for remote Postgres

## Config Model
- Add `dbMode: 'remote' | 'pglite'` (default `remote`)
- Keep `postgresUri` for `remote`
- Add `pgliteDir` (filesystem path for persistence) for `pglite` (default `./data/pglite`)
- Persist via existing saveConfig helper

## Context Integration
- Create `src/db/pglite.ts` with:
  - `createPglite({ dir }: { dir: string })`
  - Returns `{ db, client, close }`
  - Uses `@electric-sql/pglite` + `drizzle-orm/pglite`
- Update `src/context/createContext.ts`:
  - If `config.dbMode === 'pglite'`: use `createPglite(config.pgliteDir)`
  - Else: use `pg` Pool + `drizzle-orm/node-postgres`
  - Push `close` into `cleanupFunctions`

## Migrations
- Use Drizzle migrator for PGLite (`drizzle-orm/pglite/migrator`).
- Use existing Drizzle migrator for remote Postgres.

## Install Flow – API
- `GET /install` remains minimal; admin UI contains the selector.
- `POST /install/opaque/start` and `POST /install` logic:
  - When `dbMode === 'pglite'` with `pgliteDir`:
    - Start PGLite at `pgliteDir` (ensure dir)
    - Run migrations via `drizzle-orm/pglite/migrator`
    - Set `context.services.install.tempDb` and `tempDbClose`
  - When `dbMode === 'remote'` with `postgresUri`:
    - Use Pool + Drizzle migrator (unchanged)
- Remove all temporary container logic

## Install UI – Admin
- Add selector: `Database: Remote Postgres | Embedded PGLite`
- If Remote: show Postgres URI input
- If PGLite: show Directory path input (default `./data/pglite`), browse button, validation
- Send `dbMode`, `postgresUri` or `pgliteDir` to API

## CLI Script (scripts/install.ts)
- Mirror the same choice and prompts:
  - 1) Remote Postgres → ask for URI
  - 2) Embedded PGLite → ask for directory (default `./data/pglite`)
- Start PGLite immediately for testing path (optional), then stop
- Write `dbMode`, `postgresUri` or `pgliteDir` into config

## Types
- Update `Config`:
  - Add `dbMode: 'remote' | 'pglite'`
  - Add `pgliteDir?: string`
- Update `Services.install`:
  - Replace container references with `tempDbClose?: () => Promise<void> | void`
  - Keep `tempDb` for shared usage in install path

## Cleanup & Removal
- Update package.json(s)

## Validation
- Typecheck
- Run install UI with `pglite` path, confirm migrations and default seed succeed
- Run install UI with remote Postgres, confirm unchanged
- Basic CRUD sanity using existing endpoints

## Rollout Steps
- Implement `pglite.ts` helper and context plumbing
- Switch install controllers to branch by `dbMode`
- Update Admin Install UI to include the selector and inputs
- Update CLI installer prompts and write config

## Acceptance Criteria
- Fresh setup: selecting PGLite with a valid directory completes install end-to-end
- Existing remote Postgres installs remain functional
- No Docker usage, no external Postgres requirement for demo/dev
- No comments added to code; changes follow context pattern and existing style
