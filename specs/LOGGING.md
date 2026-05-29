# Logging

DarkAuth logs must help operators investigate production behavior without creating another secret store.

## Requirements

- Runtime API logs must go through the context logger created in `packages/api/src/context/createContext.ts`.
- Audit records must go through `withAudit` and `logAuditEvent` so request bodies, changes, details, errors, paths, and raw strings are sanitized before persistence.
- Frontend logs must go through the app logger wrappers, not direct `console` calls in product code.
- Logs must contain metadata, state transitions, stable identifiers, durations, and failure classes.
- Logs must not contain passwords, passphrases, authorization headers, cookies, bearer tokens, OAuth codes, PKCE verifiers, refresh tokens, access tokens, ID tokens, client secrets, KEK material, OPAQUE messages, OPAQUE records, OPAQUE finish payloads, session keys, export keys, DRK/ARK/CAK material, private keys, recovery secrets, wrapped private key payloads, JWE payloads, or raw database connection URIs.
- Redaction must be centralized. A new sensitive field name must be added to both runtime logger redaction and audit sanitization before any feature logs data with that name.
- Errors logged with `err` must be sanitized at the logger boundary. Error messages that include URLs or third-party payloads must not be assumed safe.
- Installer logs must never include submitted database URIs, SMTP credentials, bootstrap tokens, OPAQUE payloads, KEK passphrases, or generated client secrets.

## Current State

- Runtime API logs use Pino with redaction paths in `packages/api/src/context/createContext.ts`.
- Audit logging has a deeper sanitizer in `packages/api/src/services/audit.ts`, including structured body parsing, sensitive field-name matching, bearer-token redaction, long-token redaction, and path sanitization.
- `packages/api/src/services/loggerSafety.test.ts` already scans API source for obvious sensitive logger object keys.
- `packages/user-ui/src/services/logger.ts` provides the browser logger wrapper.
- Some repository scripts and documentation examples use direct `console` output. Those are not runtime product logging, but release/deployment scripts should still avoid printing credential values.

## Implementation Plan

1. Export a shared sensitive-field vocabulary used by runtime redaction, audit sanitization, and logger safety tests.
2. Add a runtime logger helper that accepts only structured metadata and applies URL/query redaction before calling Pino.
3. Replace direct API `context.logger.*` calls that pass request-derived objects with the helper.
4. Extend logger safety tests to reject raw `postgresUri`, generic `uri` fields containing credentials, `smtpPassword`, `cookie`, and `authorization` keys.
5. Add test fixtures for common secret shapes: Postgres URLs, SMTP URLs, bearer headers, OPAQUE payloads, OAuth form bodies, nested JSON, and error messages containing query strings.
6. Keep audit events semantically useful by storing booleans such as `hasPostgresUri`, hostnames without credentials, and selected configuration modes instead of raw secret-bearing values.

## Review Checklist

- Does the log event help an operator without exposing replayable material?
- Are all field names covered by centralized redaction?
- Could a URL contain credentials, bearer tokens, codes, or session IDs?
- Could an error message contain the original request body or third-party response body?
- Does the test suite fail if the new field is logged directly?
