# Security Review (2026-02-15)

Scope: Generic review of the entire DarkAuth repository with focus on OAuth/OIDC, OPAQUE, token lifecycle, and session management. Severities follow conventional risk ratings for authentication systems.

## Findings

1. **Missing OIDC nonce handling (Critical)**  
   - Evidence: `packages/api/src/controllers/user/authorize.ts` accepts `nonce` but never stores it in pending auth; `packages/api/src/controllers/user/token.ts` never includes or validates a nonce when issuing ID tokens.  
   - Impact: ID tokens can be replayed across authorization code replays or mixed-up responses, violating OIDC Core nonce binding.  
   - Remediation: Persist nonce with the authorization request and require exact match when redeeming the code before minting the ID token.

2. **Authorization codes can be redeemed multiple times (High)**  
   - Evidence: `packages/api/src/controllers/user/token.ts` loads an authorization code, issues tokens, then marks `consumed` afterward with no transaction. Concurrent requests can race past the consumed check and each mint tokens.  
   - Impact: Attackers who obtain an authorization code can create multiple refresh tokens and sessions, defeating single-use guarantees.  
   - Remediation: Consume (or delete) the code inside a transaction before issuing any tokens.

3. **Refresh token rotation is non-atomic and stored in plaintext (High)**  
   - Evidence: `packages/api/src/services/sessions.ts` selects by `refreshToken`, inserts a new session, then deletes the old one without locking; tokens are stored unhashed in `sessions.refresh_token`.  
   - Impact: Parallel refresh requests allow token reuse and session cloning; database compromise yields usable refresh tokens.  
   - Remediation: Rotate inside a transaction with row-level locking and a consumed flag, and store refresh token hashes instead of plaintext.

4. **Refresh tokens are not bound to client identity (High)**  
   - Evidence: `sessions` table lacks `client_id`; `packages/api/src/controllers/user/token.ts` refresh flow authenticates any client and uses the supplied `client_id` without checking it matches the issuing client.  
   - Impact: A stolen refresh token issued to one client can be replayed by any other valid client, enabling cross-client token swapping.  
   - Remediation: Persist the authorized `client_id` with the session/refresh token and enforce equality during refresh.

5. **PKCE verification uses non-constant-time compare (Low)**  
   - Evidence: `packages/api/src/utils/pkce.ts` compares derived challenge with `===`.  
   - Impact: Minor timing side channel; unlikely critical but avoidable.  
   - Remediation: Use `crypto.timingSafeEqual` on normalized buffers.
