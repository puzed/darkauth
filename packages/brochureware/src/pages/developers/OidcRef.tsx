import Layout from "../../components/Layout";
import PageHero from "../../components/PageHero";
import CodeBlock from "../../components/CodeBlock";
import RelatedLinks from "../../components/RelatedLinks";
import styles from "../../pages/Developers.module.css";

const DISCOVERY_RESPONSE = `{
  "issuer": "https://auth.example.com",
  "authorization_endpoint": "https://auth.example.com/api/authorize",
  "token_endpoint": "https://auth.example.com/api/token",
  "userinfo_endpoint": "https://auth.example.com/api/userinfo",
  "jwks_uri": "https://auth.example.com/api/.well-known/jwks.json",
  "introspection_endpoint": "https://auth.example.com/api/introspect",
  "revocation_endpoint": "https://auth.example.com/api/revoke",
  "response_types_supported": ["code"],
  "subject_types_supported": ["public"],
  "id_token_signing_alg_values_supported": ["EdDSA"],
  "code_challenge_methods_supported": ["S256"],
  "grant_types_supported": ["authorization_code", "refresh_token"],
  "scopes_supported": ["openid", "email", "profile"]
}`;

const AUTHORIZE_PARAMS = `GET /api/authorize
  ?client_id=<client_id>           required
  &response_type=code              required
  &redirect_uri=<uri>              required
  &scope=openid                    required (openid, email, profile)
  &code_challenge=<S256_hash>      required for public clients
  &code_challenge_method=S256      required for public clients
  &state=<random_string>           recommended
  &nonce=<random_string>           recommended
  &zk_pub=<base64url(JWK)>         optional: ZK-enabled clients only`;

const TOKEN_REQUEST = `POST /api/token
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code
&code=<auth_code>
&redirect_uri=<uri>
&client_id=<client_id>
&code_verifier=<pkce_verifier>

# For confidential clients, use HTTP Basic auth:
# Authorization: Basic base64(client_id:client_secret)`;

const TOKEN_RESPONSE = `{
  "access_token": "...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "id_token": "eyJ...",
  "refresh_token": "...",

  // ZK-only fields (when client has zk_delivery="fragment-jwe"):
  "zk_drk_hash": "<base64url(SHA-256(drk_jwe))>"
}`;

const REFRESH_REQUEST = `POST /api/token
Content-Type: application/x-www-form-urlencoded

grant_type=refresh_token
&refresh_token=<token>
&client_id=<client_id>`;

const ENDPOINTS = [
  { path: "GET /api/.well-known/openid-configuration", desc: "OpenID Connect discovery document" },
  { path: "GET /api/.well-known/jwks.json", desc: "JSON Web Key Set for token verification" },
  { path: "GET /api/authorize", desc: "Authorization endpoint (PKCE S256 required for public clients)" },
  { path: "POST /api/authorize/finalize", desc: "Finalize authorization (called by auth UI, not by RP directly)" },
  { path: "POST /api/token", desc: "Token endpoint: authorization_code and refresh_token grants" },
  { path: "GET /api/userinfo", desc: "UserInfo endpoint (Bearer token required)" },
  { path: "POST /api/introspect", desc: "Token introspection" },
  { path: "POST /api/revoke", desc: "Token revocation" },
  { path: "POST /opaque/login/start", desc: "OPAQUE login: start sub-protocol" },
  { path: "POST /opaque/login/finish", desc: "OPAQUE login: finish sub-protocol" },
  { path: "POST /opaque/register/start", desc: "OPAQUE registration: start sub-protocol" },
  { path: "POST /opaque/register/finish", desc: "OPAQUE registration: finish sub-protocol" },
  { path: "GET /crypto/wrapped-drk", desc: "Fetch user's WRAPPED_DRK (authenticated session required)" },
  { path: "PUT /crypto/wrapped-drk", desc: "Update user's WRAPPED_DRK (authenticated session required)" },
  { path: "GET /session", desc: "Check current session state" },
  { path: "POST /logout", desc: "Revoke session and tokens" },
];

export default function OidcRef() {
  return (
    <Layout>
      <PageHero
        eyebrow="Developers"
        title="OIDC endpoint reference"
        sub="Discovery, JWKS, authorization, token, userinfo, introspection, revocation, OPAQUE, and DRK endpoints."
      />
      <div className="container">
        <div style={{ padding: "3rem 0 4rem" }}>

          <section className={styles.section}>
            <h2>Discovery</h2>
            <p>
              Use discovery rather than hard-coding endpoint URLs. The discovery document contains all authoritative absolute URLs.
            </p>
            <CodeBlock code="GET https://auth.example.com/api/.well-known/openid-configuration" lang="Request" />
            <CodeBlock code={DISCOVERY_RESPONSE} lang="Response" />
          </section>

          <section className={styles.section}>
            <h2>Authorization endpoint</h2>
            <p>Initiates the Authorization Code + PKCE flow. PKCE S256 is required for public clients and when configured.</p>
            <CodeBlock code={AUTHORIZE_PARAMS} lang="Parameters" />
            <p><strong>Constraints:</strong></p>
            <ul style={{ paddingLeft: "1.5rem", display: "flex", flexDirection: "column", gap: "0.375rem", marginTop: "0.5rem" }}>
              <li style={{ fontSize: "0.9rem", color: "var(--text-muted)" }}>Authorization codes: TTL ≤ 60s, single-use, atomic consume at token endpoint</li>
              <li style={{ fontSize: "0.9rem", color: "var(--text-muted)" }}>PKCE S256 required for all public clients</li>
              <li style={{ fontSize: "0.9rem", color: "var(--text-muted)" }}>ZK: <code>zk_pub</code> accepted only when <code>zk_delivery="fragment-jwe"</code> is set on the client</li>
            </ul>
          </section>

          <section className={styles.section}>
            <h2>Token endpoint</h2>
            <p>Exchanges an authorization code for tokens, or rotates a refresh token.</p>
            <CodeBlock code={TOKEN_REQUEST} lang="Request" />
            <CodeBlock code={TOKEN_RESPONSE} lang="Response" />
            <h3 style={{ marginTop: "1.5rem", marginBottom: "0.75rem" }}>Refresh token grant</h3>
            <CodeBlock code={REFRESH_REQUEST} lang="Refresh request" />
            <p><strong>Refresh token behavior:</strong> Hashed at rest, single-use rotation, client-bound. Concurrent reuse is rejected. Cross-client reuse is rejected.</p>
          </section>

          <section className={styles.section}>
            <h2>All endpoints (port 9080)</h2>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: "0.5rem 0.75rem", fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", borderBottom: "1px solid var(--border)", background: "var(--card)" }}>Endpoint</th>
                  <th style={{ textAlign: "left", padding: "0.5rem 0.75rem", fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", borderBottom: "1px solid var(--border)", background: "var(--card)" }}>Description</th>
                </tr>
              </thead>
              <tbody>
                {ENDPOINTS.map((e) => (
                  <tr key={e.path}>
                    <td style={{ padding: "0.625rem 0.75rem", borderBottom: "1px solid var(--border)", fontFamily: "var(--font-mono)", fontSize: "0.8rem", color: "var(--secondary)", whiteSpace: "nowrap" }}>{e.path}</td>
                    <td style={{ padding: "0.625rem 0.75rem", borderBottom: "1px solid var(--border)", color: "var(--text-muted)" }}>{e.desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <RelatedLinks links={[
            { label: "Quickstart", to: "/developers/quickstart" },
            { label: "SDK reference", to: "/developers/sdk" },
            { label: "ZK extension", to: "/security/zero-knowledge" },
          ]} />
        </div>
      </div>
    </Layout>
  );
}
