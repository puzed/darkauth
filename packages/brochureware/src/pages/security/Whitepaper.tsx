import Layout from "../../components/Layout";
import PageHero from "../../components/PageHero";
import KeyScheduleDiagram from "../../components/KeyScheduleDiagram";
import RelatedLinks from "../../components/RelatedLinks";
import styles from "./Whitepaper.module.css";

const standardFlow = [
  { from: "RP App (Browser)", to: "DarkAuth (User Port)", detail: "GET /api/authorize with PKCE S256" },
  { from: "DarkAuth", to: "RP App (Browser)", detail: "Login UI using OPAQUE" },
  { from: "RP App (Browser)", to: "DarkAuth", detail: "OPAQUE finish creates the user session" },
  { from: "RP App (Browser)", to: "DarkAuth", detail: "POST /api/authorize/finalize" },
  { from: "DarkAuth", to: "RP App (Browser)", detail: "{ code, state?, redirect_uri }" },
  { from: "RP App (Browser)", to: "DarkAuth", detail: "POST /api/token with code, verifier, and client credentials" },
  { from: "DarkAuth", to: "RP App (Browser)", detail: "{ id_token, expires_in, refresh_token? }" },
];

const zkFlow = [
  { from: "RP App (Browser)", to: "DarkAuth", detail: "GET /api/authorize with zk_pub" },
  { from: "DarkAuth", to: "RP App (Browser)", detail: "Login UI using OPAQUE" },
  { from: "RP App (Browser)", to: "DarkAuth", detail: "OPAQUE finish creates the user session" },
  { from: "Browser", to: "Browser", detail: "Derive KW and unwrap DRK" },
  { from: "Browser", to: "Browser", detail: "Build drk_jwe with ECDH-ES + A256GCM" },
  { from: "RP App (Browser)", to: "DarkAuth", detail: "POST /api/authorize/finalize with request_id and drk_hash" },
  { from: "DarkAuth", to: "RP App (Browser)", detail: "{ code, state?, redirect_uri }" },
  { from: "Browser", to: "Browser", detail: "Redirect to redirect_uri#drk_jwe=<compact JWE>" },
  { from: "RP App (Browser)", to: "DarkAuth", detail: "POST /api/token with code and verifier" },
  { from: "DarkAuth", to: "RP App (Browser)", detail: "{ id_token, zk_drk_hash, ... }" },
  { from: "Browser", to: "Browser", detail: "Verify sha256(fragment drk_jwe) == zk_drk_hash" },
];

const TOC = [
  { id: "exec-summary", label: "1. Executive Summary" },
  { id: "system-overview", label: "2. System Overview" },
  { id: "crypto-primitives", label: "3. Cryptographic Primitives" },
  { id: "protocol-flows", label: "4. Protocol Flows" },
  { id: "data-state", label: "5. Data and State" },
  { id: "endpoints", label: "6. Endpoints" },
  { id: "properties", label: "7. Security Properties" },
  { id: "threat-model", label: "8. Threat Model" },
  { id: "password-change", label: "9. Password Change Without Key Loss" },
  { id: "opsec", label: "10. Operational Security" },
  { id: "privacy", label: "11. Privacy and Compliance" },
  { id: "limitations", label: "12. Limitations" },
  { id: "checklist", label: "13. Auditor Checklist" },
  { id: "glossary", label: "14. Glossary" },
];

export default function Whitepaper() {
  const renderFlow = (items: typeof standardFlow) => (
    <div className={styles.flow}>
      {items.map((item) => (
        <div key={`${item.from}-${item.to}-${item.detail}`} className={styles.flowStep}>
          <span className={styles.flowActor}>{item.from}</span>
          <span className={styles.flowArrow}>→</span>
          <span className={styles.flowActor}>{item.to}</span>
          <span className={styles.flowNote}>{item.detail}</span>
        </div>
      ))}
    </div>
  );

  return (
    <Layout>
      <PageHero
        eyebrow="Security"
        title="DarkAuth v1 Security Whitepaper"
        sub="Date: 2025-09-11. This document explains primitives, flows, state, properties, threats, and verification guidance strictly for the current v1 implementation and hosted-web trust boundary."
      />
      <div className="container">
        <div className={styles.layout}>
          <aside className={styles.toc}>
            <p className={styles.tocHead}>Table of Contents</p>
            <nav>
              {TOC.map((item) => (
                <a key={item.id} href={`#${item.id}`} className={styles.tocLink}>
                  {item.label}
                </a>
              ))}
            </nav>
          </aside>

          <article className={styles.article}>
            <div className={styles.abstract}>
              <strong>Abstract:</strong> DarkAuth is an OpenID Connect (OIDC) provider that integrates a zero-knowledge (ZK) extension for client-side key delivery. Users authenticate with OPAQUE (RFC 9380), so passwords are not sent to the server in the OPAQUE flow. A per-user Data Root Key (DRK) is wrapped under a device-derived key and persisted server-side only as ciphertext. ZK-enabled relying parties (clients) receive the DRK via a compact JWE placed in the URL fragment; the authorization server stores and returns only its hash for verification.
            </div>

            <section id="exec-summary" className={styles.section}>
              <h2>1. Executive Summary</h2>
              <p>DarkAuth provides OIDC with a hosted-web zero-knowledge security posture during honest frontend operation:</p>
              <ul>
                <li><strong>Password secrecy:</strong> OPAQUE keeps passwords out of server requests.</li>
                <li><strong>Client-side key control:</strong> A deterministic device-derived key wraps a per-user DRK; only wrapped DRK is stored.</li>
                <li><strong>Fragment-only key delivery:</strong> ZK clients receive DRK via a compact JWE in the URL fragment rather than AS token responses. The token response includes a hash for integrity binding.</li>
              </ul>
              <div className={styles.eli5}>
                <strong>ELI5:</strong>
                <ul>
                  <li>You prove your password without revealing it.</li>
                  <li>Your device makes a secret key and uses it to lock your data key.</li>
                  <li>The server keeps only the locked box, not the key inside.</li>
                  <li>Apps get the key in a sealed envelope that is not routed through the authorization server.</li>
                </ul>
              </div>
            </section>

            <section id="system-overview" className={styles.section}>
              <h2>2. System Overview</h2>
              <p><strong>Components (v1):</strong></p>
              <ul>
                <li><strong>User UI + OIDC (port 9080):</strong> OIDC discovery, authorization, token, OPAQUE endpoints, DRK endpoints, directory.</li>
                <li><strong>Admin UI/API (port 9081):</strong> Admin OPAQUE, clients, settings, JWKS, audit, RBAC.</li>
                <li><strong>Relying Parties (apps):</strong> Use Authorization Code + PKCE; ZK-enabled clients opt into fragment JWE DRK delivery.</li>
              </ul>
              <p><strong>Runtime configuration:</strong> All shared/runtime settings are stored in Postgres (<code>settings</code> table). <code>config.yaml</code> contains only instance-specific settings like ports, database URI, and the KEK passphrase. KEK is derived at boot from the passphrase; private JWKs and client secrets are stored encrypted when KEK is available.</p>
              <p><strong>Tenant model:</strong> v1 assumes single-tenant; key derivation salts use TENANT="default".</p>
            </section>

            <section id="crypto-primitives" className={styles.section}>
              <h2>3. Cryptographic Primitives and Key Schedule</h2>
              <h3>OPAQUE (RFC 9380)</h3>
              <p>Password-authenticated key exchange. Server stores an opaque verifier and cannot recover the password from that verifier alone. Client obtains an <code>export_key</code> deterministically per (user, password). P-256 OPAQUE ciphersuite.</p>

              <h3>Key schedule (client)</h3>
              <KeyScheduleDiagram />

              <h3>Data Root Key (DRK)</h3>
              <p>32-byte random, generated client-side on first login. Server only stores <code>WRAPPED_DRK = AEAD_Encrypt(KW, DRK, aad=sub)</code>.</p>

              <h3>JWE for DRK handoff</h3>
              <p>ECDH-ES (P-256) with A256GCM, compact serialization. Recipient key: RP app's ephemeral <code>zk_pub</code> JWK. AAD includes <code>{"{"}sub, client_id{"}"}</code>. Binding: <code>drk_hash = base64url(SHA-256(drk_jwe))</code> stored with the authorization code; token response includes <code>zk_drk_hash</code>.</p>

              <h3>ID Token signing</h3>
              <p>EdDSA (Ed25519) per generated JWKS.</p>

              <h3>PKCE</h3>
              <p>S256 is required for public clients and when configured.</p>
            </section>

            <section id="protocol-flows" className={styles.section}>
              <h2>4. Protocol Flows</h2>

              <h3>Standard Authorization Code + PKCE</h3>
              {renderFlow(standardFlow)}

              <h3>ZK Fragment JWE Delivery</h3>
              {renderFlow(zkFlow)}

              <p><strong>Implementation note:</strong> Code TTL is ≤ 60s and codes are single-use. Code redemption is consumed atomically at the token endpoint using a compare-and-set update.</p>
              <p><strong>ZK delivery:</strong> The server stores and returns only the DRK JWE hash, not the JWE. The fragment is available to browser/app code on the redirect origin per HTTP spec.</p>
            </section>

            <section id="data-state" className={styles.section}>
              <h2>5. Data and State</h2>
              <h3>Server stores</h3>
              <ul>
                <li>OPAQUE verifier/envelope (no passwords)</li>
                <li>WRAPPED_DRK ciphertext (AAD=sub), not DRK/KW</li>
                <li>Pending authorization requests; authorization codes with <code>has_zk</code>, <code>zk_pub_kid</code>, and <code>drk_hash</code></li>
                <li>JWKS (public JWKs; private JWKs encrypted at rest when KEK is available)</li>
                <li>Clients, settings (runtime flags for OIDC/PKCE, ID token TTLs, etc.)</li>
                <li>Sessions and refresh tokens (hashed at rest, single-use rotation, client-bound)</li>
                <li>Audit logs (admin actions)</li>
              </ul>
              <h3>Server-side state excludes</h3>
              <ul>
                <li>Plaintext passwords or export_key</li>
                <li>Plaintext DRK or DRK JWE ciphertext</li>
                <li>Derived keys MK/KW/KDerive</li>
              </ul>
            </section>

            <section id="endpoints" className={styles.section}>
              <h2>6. Endpoints</h2>
              <h3>User/OIDC (port 9080)</h3>
              <ul>
                <li><code>GET /api/.well-known/openid-configuration</code></li>
                <li><code>GET /api/.well-known/jwks.json</code></li>
                <li><code>GET /api/authorize</code> (supports <code>zk_pub</code> when client is ZK-enabled)</li>
                <li><code>POST /api/authorize/finalize</code>: <code>{"{"} request_id, drk_hash? {"}"}</code></li>
                <li><code>POST /api/token</code>: authorization_code; returns <code>zk_drk_hash</code> when applicable</li>
                <li><code>POST /opaque/login/start</code>, <code>POST /opaque/login/finish</code></li>
                <li><code>POST /opaque/register/start</code>, <code>POST /opaque/register/finish</code></li>
                <li>Password reset: request, token, start, finish</li>
                <li>Password change: verify start/finish, change start/finish</li>
                <li><code>GET /crypto/wrapped-drk</code>, <code>PUT /crypto/wrapped-drk</code></li>
                <li><code>GET /session</code>, <code>POST /logout</code></li>
              </ul>
              <h3>Admin (port 9081) — highlights</h3>
              <ul>
                <li><code>POST /admin/opaque/login/start</code>, <code>POST /admin/opaque/login/finish</code></li>
                <li>JWKS list and rotation; clients, settings, users, groups, permissions management</li>
                <li>Audit logs (list, detail, export)</li>
              </ul>
            </section>

            <section id="properties" className={styles.section}>
              <h2>7. Security Properties and Assurances</h2>
              <h3>Password secrecy (OPAQUE)</h3>
              <p>Passwords are not sent to the server in the OPAQUE flow; verifiers do not allow offline recovery by themselves. Enumeration resistance and rate limits are applied.</p>

              <h3>Email reset safety</h3>
              <p>SMTP-gated, generic request responses to avoid enumeration. Reset tokens are high-entropy, single-use, short-lived, hashed at rest. Successful reset replaces the OPAQUE record and revokes active sessions.</p>
              <p><strong>Important:</strong> Email reset restores account access, not encrypted data. If DRK-wrapped material was derived from the previous password export_key, users must use old-password recovery or generate new keys after signing in with the new password.</p>

              <h3>DRK secrecy</h3>
              <p>Only wrapped DRK is stored. Without KW (derived from export_key on the device), the server cannot decrypt DRK from stored state during honest frontend operation. Default hosted-web DRK custody is memory-only in the RP app after callback handling.</p>

              <h3>Fragment-only DRK delivery</h3>
              <p>The AS stores and returns <code>zk_drk_hash</code> for integrity binding to the fragment; it does not return the DRK JWE in the token response.</p>

              <h3>Hosted-web trust boundary</h3>
              <p>Security claims assume trusted user devices and browsers, trusted Auth UI and RP frontend origins, and no XSS or malicious same-origin JavaScript while keys/plaintext are usable. During honest operation, DarkAuth and app backends cannot decrypt app data from server-side state alone.</p>
            </section>

            <section id="threat-model" className={styles.section}>
              <h2>8. Threat Model</h2>
              <h3>Assumptions</h3>
              <ul>
                <li>TLS for all transports.</li>
                <li>RP applications correctly handle fragments and verify <code>zk_drk_hash</code>.</li>
                <li>User devices and browsers are not fully compromised.</li>
                <li>The Auth UI and RP frontend origins are trusted and do not execute malicious same-origin JavaScript.</li>
              </ul>
              <h3>Attacks and mitigations</h3>
              <ul>
                <li><strong>Database exfiltration:</strong> OPAQUE verifiers and wrapped DRK do not reveal passwords or DRK.</li>
                <li><strong>Insider reads:</strong> No plaintext passwords/DRK stored; KEK encrypts private JWKs and client secrets.</li>
                <li><strong>Redirect tampering:</strong> Clients verify <code>zk_drk_hash</code> before using <code>drk_jwe</code>.</li>
                <li><strong>Weak key injection:</strong> Strict zk_pub validation and rejection policy.</li>
                <li><strong>Token endpoint abuse:</strong> PKCE S256 for public clients; codes are short-lived and single-use with atomic consume semantics.</li>
              </ul>
              <h3>Out of scope</h3>
              <ul>
                <li>Malicious Auth UI or RP frontend code served from trusted origins.</li>
                <li>XSS in the Auth UI or RP app.</li>
                <li>Compromised user devices, browsers, browser extensions, or RP apps mishandling decrypted DRK.</li>
                <li>Broken TLS.</li>
              </ul>
            </section>

            <section id="password-change" className={styles.section}>
              <h2>9. Password Change Without Key Loss</h2>
              <p><strong>Goal:</strong> Allow password change while preserving the DRK so apps continue to decrypt data without re-encryption.</p>
              <ol>
                <li>Verify current password using OPAQUE verify endpoints.</li>
                <li>Re-register new password (OPAQUE registration).</li>
                <li>Derive a new KW from the new export_key.</li>
                <li>Rewrap the same DRK under the new KW and upload the updated ciphertext.</li>
              </ol>
              <p><strong>What apps observe:</strong> DRK remains the same; fragment JWE is new per authorization but decrypts to the same DRK. No data re-encryption is required.</p>
            </section>

            <section id="opsec" className={styles.section}>
              <h2>10. Operational Security</h2>
              <ul>
                <li><strong>Rate limiting:</strong> OPAQUE login and finalize endpoints are rate-limited per implementation.</li>
                <li><strong>Logging policy:</strong> Prohibit logging of zk_pub, export_key, MK/KW/KDerive, DRK, DRK JWE, wrapped private keys, and token secrets. Retain only metadata needed for security operations.</li>
                <li><strong>Key management:</strong> JWKS rotation available via admin API; private JWKs encrypted with KEK at rest when available.</li>
                <li><strong>Install and KEK:</strong> First-run install on admin port; single-use token gating; seeds settings and keys. KEK derived from passphrase in <code>config.yaml</code>.</li>
                <li><strong>Deployment guidance:</strong> Enforce HTTPS; set secure cookies (Secure, HttpOnly, SameSite=Lax or stricter). Configure trusted frontend origins explicitly. On suspected frontend compromise: disable affected ZK clients, revoke sessions, redeploy clean assets, notify affected users.</li>
              </ul>
            </section>

            <section id="privacy" className={styles.section}>
              <h2>11. Privacy and Compliance Posture</h2>
              <p>Server-side protocol state avoids plaintext secrets: no passwords, no plaintext DRK, no DRK JWE. Hosted-web frontend code can still access keys while performing client-side cryptography.</p>
              <p>This document describes technical design and alignment to security best practices; it does not assert formal certifications. DarkAuth is open source (AGPL). Auditing is community-driven: read the code and specs in this repository.</p>
            </section>

            <section id="limitations" className={styles.section}>
              <h2>12. Limitations and Future Work</h2>
              <ul>
                <li>v1 is single-tenant; multi-tenant key separation is future work.</li>
                <li>Additional grants and token types may be added.</li>
                <li>Hardware-backed key storage on clients is outside current scope.</li>
                <li>Changes that make DRK custody memory-only affect reload behavior. Operators and app developers must warn users that page reloads may require a fresh ZK authorization and, if <code>export_key</code> is not session-cached, OPAQUE step-up.</li>
              </ul>
            </section>

            <section id="checklist" className={styles.section}>
              <h2>13. Auditor Verification Checklist</h2>
              <ul>
                <li>Fetch <code>/api/.well-known/openid-configuration</code> and <code>/api/.well-known/jwks.json</code>.</li>
                <li>Start <code>GET /api/authorize</code> with PKCE S256; complete OPAQUE; call <code>POST /api/authorize/finalize</code> and confirm code TTL≤60s.</li>
                <li>Provide a valid P-256 <code>zk_pub</code> in <code>GET /api/authorize</code>. After login, confirm the browser constructs <code>drk_jwe</code> client-side and calls finalize with <code>drk_hash</code>. Inspect network: the token response does not include the JWE; only the hash appears as <code>zk_drk_hash</code>.</li>
                <li>Verify client computes <code>base64url(sha256(fragment drk_jwe)) === zk_drk_hash</code> before use.</li>
                <li>With a valid session, <code>GET /crypto/wrapped-drk</code> returns only ciphertext; plaintext DRK is not exposed.</li>
                <li>Use verify endpoints, re-register, then confirm wrapped DRK is reuploaded without rotating the underlying DRK (password change without key loss).</li>
                <li>Send malformed <code>zk_pub</code> values and confirm <code>invalid_request</code> errors.</li>
                <li>Confirm logs exclude prohibited materials under normal and error conditions.</li>
              </ul>
            </section>

            <section id="glossary" className={styles.section}>
              <h2>14. Glossary and References</h2>
              <dl className={styles.dl}>
                <dt>OPAQUE</dt>
                <dd>Asymmetric password-authenticated key exchange where the server stores an opaque record and the password is not sent to the server.</dd>
                <dt>DRK</dt>
                <dd>Data Root Key, a per-user symmetric key for application encryption. 32 bytes, random, generated client-side.</dd>
                <dt>JWE</dt>
                <dd>JSON Web Encryption; here, compact form with ECDH-ES (P-256) and A256GCM.</dd>
                <dt>PKCE</dt>
                <dd>Proof Key for Code Exchange; S256 is the required code challenge method for public clients.</dd>
                <dt>MK/KW/KDerive</dt>
                <dd>Keys derived from <code>export_key</code> via HKDF; KW wraps DRK.</dd>
                <dt>KEK</dt>
                <dd>Key Encryption Key, derived from the config passphrase via Argon2id. Encrypts private JWKs and client secrets at rest.</dd>
              </dl>
              <h3>References</h3>
              <ul>
                <li>DarkAuth v1 Technical Spec (specs/2_CORE.md)</li>
                <li>DarkAuth OIDC ZK Extension (specs/0_OIDC_ZK_EXTENSION.md)</li>
                <li>RFC 9380: OPAQUE</li>
                <li>JOSE / JWE standards (RFC 7516, RFC 7518)</li>
              </ul>
            </section>

            <RelatedLinks links={[
              { label: "ZK extension spec", to: "/security/zero-knowledge" },
              { label: "How it works", to: "/how-it-works" },
              { label: "Source on GitHub", href: "https://github.com/puzed/darkauth" },
            ]} />
          </article>
        </div>
      </div>
    </Layout>
  );
}
