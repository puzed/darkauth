import FeatureDeepDive from "../../components/FeatureDeepDive";

export default function Oidc() {
  return (
    <FeatureDeepDive
      eyebrow="Feature"
      title="OpenID Connect"
      sub="A standards-compliant OAuth 2.0 / OpenID Connect provider."
      definition="DarkAuth is a fully spec-compliant OIDC provider. Any app or library that speaks OAuth 2.0 / OpenID Connect can integrate — no proprietary SDK required."
      whyItMatters={
        <p>
          The whole point of a standard is interoperability. If DarkAuth speaks OIDC correctly, you can use any OAuth 2.0 / OIDC client library — in any language — and it will work. Discovery, JWKS, token introspection, revocation, refresh tokens: all standard. You're not locked into a proprietary authentication SDK or a specific vendor's client library.
        </p>
      }
      howItWorksEli5={
        <p>
          Your app sends users to DarkAuth's authorization URL, the user logs in, DarkAuth sends back a code, your app exchanges the code for a signed ID token that proves who the user is. Standard OAuth 2.0 Authorization Code flow with PKCE, exactly as defined by the specs.
        </p>
      }
      howItWorksPrecise={
        <div>
          <p>Authorization Code + PKCE flow:</p>
          <ol style={{ paddingLeft: "1.5rem", marginTop: "0.75rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <li>Client initiates <code>GET /api/authorize</code> with <code>client_id, redirect_uri, response_type=code, scope, state, code_challenge, code_challenge_method=S256</code></li>
            <li>User authenticates via OPAQUE. Server issues a code via <code>POST /api/authorize/finalize</code></li>
            <li>Client calls <code>POST /api/token</code> with <code>grant_type=authorization_code, code, redirect_uri, client_id, code_verifier</code></li>
            <li>Server validates PKCE, returns <code>id_token</code> (EdDSA/Ed25519), <code>token_type</code>, <code>expires_in</code>, optionally <code>refresh_token</code></li>
          </ol>
          <p style={{ marginTop: "0.75rem" }}>
            Authorization codes are single-use, ≤60s TTL, and consumed atomically at the token endpoint to prevent double-redemption. PKCE S256 is required for all public clients.
          </p>
        </div>
      }
      details={[
        "Discovery: GET /api/.well-known/openid-configuration",
        "JWKS: GET /api/.well-known/jwks.json",
        "Authorization Code + PKCE (S256 required for public clients)",
        "Confidential clients: client_secret_basic authentication",
        "ID tokens signed with EdDSA (Ed25519)",
        "Refresh tokens: hashed at rest, single-use rotation, client-bound",
        "Endpoints: userinfo, introspect, revoke",
        "Auth codes: ≤60s TTL, single-use, atomic consume at token endpoint",
        "Optional claims in ID tokens: permissions, groups, org_id, org_slug, roles",
        "Two demo clients pre-configured: public PKCE and ZK-enabled, confidential",
      ]}
      related={[
        { label: "Organizations & RBAC", to: "/features/organizations-rbac" },
        { label: "OIDC endpoint reference", to: "/developers/oidc" },
        { label: "Quickstart", to: "/developers/quickstart" },
      ]}
    />
  );
}
