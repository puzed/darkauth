-- Decision: the legacy account_linking_policy value 'email' (link/create on any
-- matching email, even when unverified) is unsafe and is already rejected by the
-- model/controller validation. Rather than drop the enum value (which would be a
-- breaking, non-idempotent enum mutation), we normalise any existing rows that
-- still carry 'email' to the nearest safe behaviour, 'email_verified'. This keeps
-- runtime behaviour consistent with validation while preserving stored data.
-- Idempotent: re-running only affects rows that are still 'email'.
UPDATE "federation_connections"
SET "account_linking_policy" = 'email_verified'
WHERE "account_linking_policy" = 'email';
