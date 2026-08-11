# Testing

## Test layers

- Package tests use Node's test runner for pure logic and focused service/controller behavior. Examples live beside source as `*.test.ts` or in a package `tests/` directory.
- `packages/test-suite` uses Playwright against real DarkAuth user and admin servers and an isolated database.
- Browser helpers in `packages/test-suite/setup/helpers` hide OPAQUE and setup ceremony while continuing to use real endpoints.
- External systems may be replaced at their boundary. DarkAuth models, controllers, database operations, and authentication flows are not mocked.

## Commands

```bash
pnpm test
pnpm --filter @DarkAuth/test-suite test
pnpm test:screenshots
pnpm tidy
pnpm build
```

- Install Playwright browsers with `pnpm test:install`.
- Test-suite database and environment requirements are documented in `packages/test-suite/README.md` and `.env.example`.
- `test:screenshots` runs the Playwright suite once with a light color scheme and once with a dark color scheme, then collects enabled artifacts for brochureware.

## Integration-test lifecycle

1. `createTestServers` creates isolated runtime and database state.
2. `installDarkAuth` completes the real bootstrap flow.
3. Tests create users, admins, clients, and organizations through supported flows.
4. Playwright drives the user or admin UI when browser behavior is the subject.
5. `destroyTestServers` stops servers and removes test state.

Avoid fixed sleeps, cookie injection, and hand-written OPAQUE transcripts in scenario tests. Prefer visible state, response assertions, and the shared helpers.

## Coverage tracking

Only confirmed gaps belong in `specs/tasks/test-coverage-gaps.md`. Completed suites are described by their test files rather than retained as roadmap items.
