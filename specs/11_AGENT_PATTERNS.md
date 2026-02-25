# DarkAuth Agent Patterns

Reference patterns for task-specific agents in this repository.

Primary references:
- `specs/1_CODE_GUIDE.md`
- `specs/2_CORE.md`

Repository shape:
- Monorepo managed with npm workspaces.
- Core packages: `packages/api`, `packages/user-ui`, `packages/admin-ui`, `packages/test-suite`.

Backend patterns:
- Context pattern with explicit dependency passing.
- Server lifecycle supports `start`, `stop`, and `restart`.
- Two HTTP surfaces: user/OIDC and admin.
- Controllers handle HTTP concerns and auth checks.
- Models own data access and business rules.
- Services handle protocol/external workflows.
- Validation uses `zod/v4`.
- Persistence uses Drizzle ORM + SQL migrations.

Frontend patterns:
- React + TypeScript + CSS Modules.
- API interactions go through service modules.
- Auth flows integrate OPAQUE, session handling, and DRK workflows.
- Branding/theme behavior is driven by shared hooks and CSS variables.

Testing patterns:
- Playwright-driven integration and API-flow tests.
- Shared test setup/teardown helpers manage server lifecycle.
- Auth/security tests assert protocol behavior, not only status codes.
- Use dot reporter for the test suite.

Documentation patterns:
- Specs are implementation-oriented and detailed.
- README and docs should stay aligned with actual endpoints and runtime behavior.
- Prefer concise, actionable, file-path-driven updates.

Execution standards:
- Keep implementations simple and reusable.
- Prefer removing unnecessary complexity over adding abstraction.
- Avoid comments unless they are essential.
- Run `npm run tidy` and `npm run build` after changes.
