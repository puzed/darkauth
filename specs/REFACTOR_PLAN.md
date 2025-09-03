# API Refactor Plan (CODE_GUIDE.md Alignment)

## Phase 1 — Quick Wins
- [x] Consolidate security headers (single `setSecurityHeaders` in `src/utils/security.ts`)
- [x] Remove duplicate `setSecurityHeaders` from `src/utils/http.ts` and update imports
- [x] Replace ad-hoc `JSON.parse` with `parseJsonSafely` across controllers
- [x] Remove generic try/catch in controllers; let errors bubble to router/server
- [x] Keep only specific error-to-AppError translations where needed

Converted controllers (bubbling errors):
- [x] All major admin controllers including:
  - `admin/adminUserCreate.ts`, `admin/adminUserUpdate.ts`, `admin/adminUserDelete.ts`
  - `admin/users.ts`, `admin/clients.ts`, `admin/adminUsers.ts`
  - `admin/userCreate.ts`, `admin/userDelete.ts`, `admin/userUpdate.ts`
  - `admin/userGroups.ts`, `admin/userPermissions.ts`, `admin/userPermissionsUpdate.ts`
  - `admin/userGroupsUpdate.ts`, `admin/groupUsers.ts`, `admin/groupUsersUpdate.ts`
  - `admin/userPasswordReset.ts`, `admin/passwordChangeStart.ts`
  - `admin/auditLogDetail.ts`, `admin/auditLogs.ts`, `admin/auditLogExport.ts`
  - `admin/adminUserPasswordSetStart.ts`, `admin/adminUserPasswordSetFinish.ts`
  - `admin/groups.ts`, `admin/permissions.ts`, `admin/refreshToken.ts`
  - `admin/opaqueRegisterStart.ts`, `admin/settings.ts`, `admin/session.ts`
- [x] Key user controllers including:
  - `user/refreshToken.ts`, `user/opaqueLoginStart.ts`, `user/opaqueRegisterStart.ts`
  - `user/passwordChangeStart.ts`, `user/passwordChangeFinish.ts`
  - `user/session.ts`, `user/wellKnownJwks.ts`, `user/wellKnownOpenid.ts`, `user/logout.ts`

**Note**: Some controllers still retain specific try/catch blocks for library operations (base64 decoding, crypto operations, etc.) as intended, but all generic error handling has been removed to allow proper error bubbling.

## Phase 2 — Schemas and Validation
- [x] Co-locate Zod schemas in controllers (handler + schema export)
- [x] Remove centralized `src/schemas` folder and imports
- [x] Wire controllers to validate via Zod `safeParse` and throw `ValidationError` with details
- [x] Ensure controllers serialize responses using co-located output schemas

## Phase 3 — OpenAPI
- [x] Central generator collects controller-registered routes (OpenAPIRegistry)
- [x] `/openapi` enabled in `http/createServer.ts` returning OpenAPI 3.0 JSON
- [x] Register core admin endpoints (session, admin-users CRUD, users list, groups list, clients list, permissions list)
- [ ] Register remaining endpoints and enrich with params/examples

## Phase 4 — Naming and Consistency
- [x] Audit internal names for abbreviations; prefer full names (keep protocol field names at boundaries)
- [x] Add small `utils/pagination.ts` and replace duplicated pagination logic
- [x] Let TypeScript infer return types where practical; remove redundant types
- [x] Remove unused imports and dead code
- [ ] Consolidate cookie/session helpers into a single module and remove duplicates
- [ ] Extract CORS handling into a helper for consistent policy

## Phase 5 — Context and State
- [x] Remove globals from `src/main.ts` (install token, server refs)
- [x] Store install token in DB/settings or attach ephemeral store to `context.services`
- [x] Keep server handles in local scope; shutdown via process signals without globals

## Phase 6 — OPAQUE Wrapper
- [x] Encapsulate class-based opaque wrapper behind a functional service interface
- [x] Trim comments to explain "why", not "what"
- [x] Keep deterministic behavior and existing storage format stable

## Phase 7 — Security and Rate Limiting
- [x] Use a single source for security headers everywhere
- [x] Confirm CSP parity with guide; no inline scripts/styles in prod
- [ ] Ensure rate limit headers are set consistently across all rate limited endpoints
- [ ] Apply rate limiting middleware to admin endpoints where appropriate

## Phase 8 — Tests and Tooling
- [x] Update/add tests for schema validation paths and error details
- [x] Add tests for `/openapi` endpoint
- [ ] Make `/openapi` tests pass by re‑enabling endpoint and wiring schemas
- [ ] Add tests for rate limiting headers and blocking
- [ ] Add tests asserting CSP/security headers on representative routes
- [ ] Run Biome tidy pass after refactor

## Phase 9 — Documentation
- [x] Document schema conventions (inputs/outputs, transformation) in `/docs`
- [x] Document OpenAPI contribution pattern (how to export `openApiSchema`)
- [x] Note naming policy (no abbreviations internally; protocol fields preserved at boundaries)
- [ ] Update OpenAPI docs for `zod-to-openapi` v8 and final endpoint wiring

## Rollout Plan
- [x] Ship Phases 1–2 behind minimal change footprint
- [x] Add `/openapi` and initial schemas for top endpoints
- [x] Incrementally migrate remaining controllers and models
- [x] Track progress with this checklist and PRs per phase

## Status
 - OpenAPI endpoint is enabled via a centralized generator that converts Zod schemas to JSON Schema and wraps them in an OpenAPI 3.0 document. Extend with remaining endpoints and standardized error responses.
 - Rate limiting middleware exists and sets headers; applied to user OPAQUE/authorize/token routes. Apply to admin routes and add tests as tracked in Phase 7 and Phase 8.
 - Cookie/session helper consolidation and CORS extraction are outstanding (Phase 4).
