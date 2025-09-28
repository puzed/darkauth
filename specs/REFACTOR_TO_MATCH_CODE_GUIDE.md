# Refactor Plan: Align API and Demo App With Code Guide

This document outlines the ordered, grouped checklists to bring `packages/api` and `packages/demo-app` in line with `specs/1_CODE_GUIDE.md`. Each group is sequenced to minimize risk and reduce churn. External protocol field names (OIDC/JWT/JWK/etc.) remain unchanged on the wire; internal variables and identifiers use full names.

## Global Conventions

- [x] Adopt “no abbreviations” for identifiers in code (request, response, configuration). Keep standard protocol field names in JSON payloads (e.g., `sub`, `jwk`, `jwt`), but prefer full names for local variables and function names.
- [x] Ensure ESM across packages and consistent TypeScript targets/resolution per guide.
- [x] Unify project scripts: ensure each package has `tidy`, `check`, `lint`, `format`, `build` scripts that integrate with the root workspace commands. (demo-app updated)
- [x] Standardize logging on a single logger interface (pino in Node), remove `console.log` from runtime code.

## API: Structure And Lifecycle

1) Server lifecycle
- [ ] Confirm a single server factory that returns `start()`, `stop()`, and `restart()` and that tests and production share the same lifecycle surface.
- [x] Ensure no global state; everything flows through `createContext` and lifecycle hooks.
- [ ] Verify ports/bindings come only from `Config`, never inline literals.

2) Context pattern
- [x] Ensure `createContext` fully initializes `db`, `services`, `logger`, and `destroy` in one place.
- [x] Guarantee all services are injected via context and not imported as singletons.
- [x] Remove ad‑hoc resource creation from controllers; delegate to models/services via context.

3) Folder layout
- [ ] Confirm top-level files: `main.ts`, `createServer.ts`, `context/createContext.ts`, `types.ts`, `errors.ts` match the guide’s intent.
- [ ] Ensure `controllers/`, `models/`, `services/`, `utils/`, `db/` directories follow usage boundaries per guide.

## API: HTTP Layer And Routing

- [x] Centralize error handling in HTTP layer: map `AppError` kinds to HTTP responses; avoid try/catch in controllers except to normalize errors to `AppError`. (updated user token, password verify start/finish, opaque login finish, wrappedDrk get/put)
- [x] Replace any `req`/`res` local identifiers with `request`/`response` within handlers.
- [ ] Ensure all controllers validate input with Zod; keep schemas colocated or under a `schemas/` namespace when reused.
- [ ] Confirm routing layout and naming are consistent and predictable; avoid ad‑hoc path parsing in controllers.
- [ ] Keep response helpers in a single utility (e.g., `sendJson`, `sendError`) and use consistently.

## API: Validation, Types, And Errors

- [ ] Align `types.ts` with guide: `Context`, `Config`, service interfaces, and DTOs are explicit and minimal.
- [ ] Use Zod for external types and Drizzle types for database; do not duplicate type sources.
- [ ] Implement and use `AppError`, `ValidationError`, `NotFoundError`, `ConflictError` in services/controllers.
- [ ] Bubble all non‑AppError exceptions up to HTTP layer; ensure proper logging and 500 fallback.

## API: Models, Services, And Database

- [ ] Keep data access in `models/` using Drizzle queries; remove direct SQL from controllers.
- [ ] Ensure services are pure where possible and receive context explicitly.
- [ ] Review schema names and relations in `db/schema.ts` match the guide’s conventions.
- [ ] Ensure migrations are current; verify `drizzle.config.ts` outputs are correct.

## API: Security, Config, And Logging

- [ ] Enforce CSRF/CORS/rate limits where required; ensure helpers are in `utils/` or `middleware/` and added consistently.
- [ ] Move all configuration (ports, origins, flags) into `Config`; no literals in code.
- [x] Replace `console.*` with `context.logger` calls; ensure structured logging.
- [ ] Ensure `jwks`/signing key handling honors KEK availability and secure mode defaults per guide.

## API: Naming And Cleanups

- [x] Rename local identifiers: `req`→`request`, `res`→`response`, `cfg`→`configuration`, `resp`→`responseData`.
- [ ] Keep external protocol names (`sub`, `jwk`, etc.) in payloads but use descriptive local variable names.
- [ ] Remove unused utilities and consolidate duplicative helpers.

## Demo App: Architecture And Styling

1) Styling migration
- [x] Introduce CSS Modules to align with UI packages; create `*.module.css` for key components. (Header, Layout, Sidebar, Dashboard, NoteCard, EditorToolbar, RichTextEditor)
- [ ] Replace Tailwind utility classes with CSS Modules styles for core views/components. (migrated Header, Layout, Sidebar, Dashboard, NoteCard, EditorToolbar, RichTextEditor, NoteEditor)
- [ ] Remove Tailwind where feasible or retain only as a transient step; prefer a single styling approach.

2) Folder and component structure
- [ ] Group `components/`, `stores/`, `services/`, and `types/` under `src/`.
- [ ] Add `types/` for DTOs and Zod schemas where responses are validated.
- [ ] Ensure Vite config remains simple; avoid server‑side rendering frameworks.

3) API client and naming
- [x] Rename local identifiers to full names: `cfg`→`configuration`, `resp`→`response`, `dek`→`dataEncryptionKey`, `aad`→`additionalAuthenticatedData` (in variable names only).
- [ ] Keep wire field names unchanged: `note_id`, `recipient_sub`, `dek_jwe`, etc.; provide mapping types if internal names differ (e.g., `noteId`).
- [x] Centralize fetch logic: consistent headers, error handling, and JSON parsing with Zod validation. (Expanded Zod on profile, search, metadata/update, share/revoke, access list, collections)

4) App configuration
- [x] Normalize runtime configuration injection via `/config.js`; rename `appCfg`→`appConfiguration` and `runtimeCfg`→`runtimeConfiguration`.
- [ ] Ensure `setConfig` types align with client library and guide.

5) State and routing
- [ ] Align store/state naming with full words (`selectedNoteId`, `isLoading`, `setError`).
- [ ] Prefer selector helpers and typed actions in Zustand store.
- [ ] Keep React Router usage minimal and explicit; avoid abbreviations in route params and variables.

6) Demo server alignment
- [x] Extract a small `createDemoServer` with `start()`/`stop()` and use full identifier names for request/response.
- [x] Replace `console.log` with a minimal logger; avoid ad‑hoc string parsing of URLs where `URL` suffices.
- [x] Remove inline SQL from server where possible; encapsulate database queries in a tiny `models/` folder for the demo server or keep them isolated and clearly named.

## Tooling And Quality Gates

- [x] Add Biome to `packages/demo-app` with `tidy`, `check`, `lint`, and `format` scripts consistent with other packages.
- [x] Ensure TypeScript strictness matches the guide (no implicit anys, strict null checks, etc.).
- [x] Run `npm run tidy` at the root and fix any issues flagged by Biome.
- [x] Run `npm run build` for all workspaces to ensure type and build correctness.

## Execution Order Summary

1) Global setup
- [x] Add/align `tidy`, `check`, `lint`, `format`, `build` scripts in `demo-app`.
- [x] Add Biome config to `demo-app`.

2) API refactor
- [x] Naming fixes (`request`/`response`) and centralized error handling.
- [x] Ensure controllers validate with Zod and bubble errors.
- [ ] Confirm context/services boundaries; remove direct SQL from controllers.
- [x] Replace `console.*` with `context.logger`; config values only from `Config`.

3) Demo app refactor
- [x] Introduce CSS Modules and migrate priority components. (Header, Layout, Sidebar)
- [x] API client: rename identifiers, centralize request flow, add Zod validation.
- [x] Normalize runtime configuration naming and consumption.
- [x] Extract `createDemoServer` and align lifecycle/naming.
- [ ] Resolve remaining Biome issues (button types, unused imports, no-any) incrementally.

4) Finalize
- [ ] Remove unused code/dependencies.
- [ ] Run `npm run tidy` and `npm run build` and address findings.
