# Specification maintenance

These rules apply to work in `specs/`.

## Source of truth

- Verify implemented claims against current code and tests.
- Use `CORE.md`, `ARCHITECTURE.md`, and `DATA_MODEL.md` for repository-wide contracts; do not duplicate their long-form content in feature specs.
- Treat unindexed legacy files as historical context, not current requirements.
- Describe deliberately retained requirements as the final product state and track known implementation drift in `tasks/`.

## File types

- Feature specs are durable and describe behavior, constraints, security properties, and important implementation references.
- Task specs in `tasks/` are temporary and describe one delivery effort, including scope, non-goals, dependencies, acceptance checks, and a checklist.
- Completed summaries in `tasks_completed/` retain only delivered scope and useful evidence; they are historical, not active requirements.
- Architecture decisions belong in the narrowest durable spec affected by the decision.

## Workflow

1. Read `README.md` and the relevant core documents.
2. Inspect implementation paths and tests before changing an `Implemented` claim.
3. Update the feature or core contract before or alongside implementation changes.
4. Add or update the appropriate index entry in `README.md`.
5. Reconcile status after delivery.
6. Replace completed task specs with concise summaries in `tasks_completed/` after durable information has moved to feature/core docs.
7. Run `pnpm tidy` and `pnpm build` for a completed repository change.

## Style

- Keep sections short, concrete, and bullet-driven.
- Prefer exact paths, endpoints, table names, and commands.
- Use `user`, `admin`, `client`, `session`, `DRK`, `OPAQUE`, and `ZK` consistently.
- State invariants and boundaries instead of implementation aspirations.
- Link instead of repeating shared material.
- Remove stale text rather than appending contradictory corrections.
- Avoid release promises, marketing language, and unexplained future tense.

## Review checklist

- Known differences between the feature contract and implementation have a linked active task.
- Public protocol and security claims have code/test references.
- Data ownership and deletion behavior match `packages/api/src/db/schema.ts`.
- Package and layer names match the repository.
- Feature and task indexes are current.
- Completed tasks leave no active checklist in `tasks/`.
