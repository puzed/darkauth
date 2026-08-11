# Audit and logging

## Runtime logs

The API uses Pino structured logging. Configure verbosity with `DARKAUTH_LOG_LEVEL` or `LOG_LEVEL`. Request and service log helpers sanitize error values before recording them; callers must not deliberately log credentials, OPAQUE messages, tokens, DRK material, or private keys.

## Audit events

Security and administration controllers use `packages/api/src/services/audit.ts` to persist audit events in `audit_logs`.

Stored context can include:

- event type, timestamp, method, path, cohort, result, status, error code, and response time;
- user, admin, client, organization, enterprise connection, and resource identifiers;
- IP address and user agent;
- sanitized request details and resource changes.

Audit sanitization recursively redacts recognized credentials, passwords, tokens, OPAQUE/PKCE payloads, session values, KEK/private-key values, and DRK/ZK delivery material. Unknown fields are not automatically safe; new secret-bearing fields must be added to the sanitizer or omitted.

## Admin access

The admin UI exposes audit list and detail views under `/audit` and `/audit/:id`. The API supports filtering by time range, event type, actor, client, organization, enterprise connection, resource, outcome, and text search, plus deterministic sorting and pagination. CSV export applies the same filters.

Audit records are append-only through the application service. The repository does not implement automatic retention, archival, or tamper-evident signing; deployments must set database retention and access controls externally when required.
