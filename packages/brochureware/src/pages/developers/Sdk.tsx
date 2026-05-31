import Layout from "../../components/Layout";
import PageHero from "../../components/PageHero";
import CodeBlock from "../../components/CodeBlock";
import RelatedLinks from "../../components/RelatedLinks";
import styles from "../../pages/Developers.module.css";

const SETUP = `import { setConfig, initiateLogin, handleCallback, getCurrentUser, refreshSession, logout } from "@darkauth/client";

// 1. Configure
setConfig({
  issuer: "https://auth.example.com",
  clientId: "my-app",
  redirectUri: "https://app.example.com/callback",
});`;

const BASIC_FLOW = `// 2. Start login
await initiateLogin();
// → redirects user to DarkAuth authorization endpoint

// 3. Handle callback (in your /callback route)
const session = await handleCallback();
// session = { user: { sub, email, ... }, idToken, ... }

// 4. Get current user
const user = await getCurrentUser();

// 5. Refresh session
await refreshSession();

// 6. Logout
await logout();`;

const ZK_FLOW = `// For ZK-enabled clients, handleCallback also returns the DRK:
const session = await handleCallback();
// session.drk = Uint8Array(32)  — the Data Root Key

// Derive a per-note Data Encryption Key from the DRK
const dek = await deriveDek(session.drk, noteId);

// Encrypt / decrypt data
const ciphertext = await aeadEncrypt(dek, plaintext);
const plaintext  = await aeadDecrypt(dek, ciphertext);

// DarkNotes pattern: encrypt a note
const encryptedNote = await encryptNote(session.drk, noteId, noteContent);
const noteContent   = await decryptNote(session.drk, noteId, encryptedNote);`;

const WRAP_EXAMPLE = `// Wrap DRK for storage (so reload doesn't require re-login)
// This is a lower-security convenience mode — not a cryptographic boundary
const wrappedDrk = await wrapDrk(session.drk, userPassphrase);
// Store wrappedDrk; later:
const drk = await unwrapDrk(wrappedDrk, userPassphrase);`;

export default function Sdk() {
  return (
    <Layout>
      <PageHero
        eyebrow="Developers"
        title="@darkauth/client SDK"
        sub="OIDC integration shape and optional ZK crypto helpers. Non-ZK apps don't need any of the crypto."
      />
      <div className="container">
        <div style={{ padding: "3rem 0 4rem" }}>

          <section className={styles.section}>
            <h2>Installation</h2>
            <CodeBlock code="npm install @darkauth/client" lang="bash" />
            <p>License: MIT. No peer dependencies on the crypto layer — uses the Web Crypto API (<code>crypto.subtle</code>) directly.</p>
          </section>

          <section className={styles.section}>
            <h2>Basic OIDC integration</h2>
            <p>For non-ZK apps, the SDK is a thin wrapper over the standard OIDC Authorization Code + PKCE flow. Any OIDC library works instead.</p>
            <CodeBlock code={SETUP} lang="JavaScript" />
            <CodeBlock code={BASIC_FLOW} lang="JavaScript" />
          </section>

          <section className={styles.section}>
            <h2>ZK crypto layer</h2>
            <p>For ZK-enabled clients (<code>zk_delivery="fragment-jwe"</code>), <code>handleCallback</code> additionally returns the DRK. The crypto helpers operate on that key:</p>
            <CodeBlock code={ZK_FLOW} lang="JavaScript" />
            <p>
              <strong>Non-ZK apps:</strong> If you haven't configured <code>zk_delivery</code>, <code>session.drk</code> is undefined and all the crypto helpers are simply unused. No configuration change needed.
            </p>
          </section>

          <section className={styles.section}>
            <h2>Key custody</h2>
            <p>The default and recommended profile is memory-only DRK custody. The DRK lives in browser memory during the session; page reload triggers a fresh ZK authorization.</p>
            <CodeBlock code={WRAP_EXAMPLE} lang="JavaScript" />
            <div style={{ background: "var(--secondary-dim)", border: "1px solid rgba(242,177,13,0.25)", borderRadius: "var(--radius)", padding: "1rem 1.25rem", marginTop: "0.75rem" }}>
              <strong style={{ color: "var(--secondary)", fontSize: "0.8rem", textTransform: "uppercase", letterSpacing: "0.08em" }}>Warning</strong>
              <p style={{ marginTop: "0.5rem", fontSize: "0.875rem" }}>
                Persistent plaintext DRK storage in localStorage, sessionStorage, or JS-readable cookies must not be treated as a cryptographic boundary. Wrapping with a user passphrase is a convenience mode for UX — it does not provide the same security guarantees as memory-only custody.
              </p>
            </div>
          </section>

          <section className={styles.section}>
            <h2>Full API surface</h2>
            <ul style={{ paddingLeft: "1.5rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              <li style={{ fontSize: "0.9rem", color: "var(--text-muted)" }}><code>setConfig(config)</code> — Set issuer, clientId, redirectUri, and ZK options</li>
              <li style={{ fontSize: "0.9rem", color: "var(--text-muted)" }}><code>initiateLogin(options?)</code> — Start the authorization flow</li>
              <li style={{ fontSize: "0.9rem", color: "var(--text-muted)" }}><code>handleCallback()</code> — Process the redirect callback, return session + DRK (if ZK)</li>
              <li style={{ fontSize: "0.9rem", color: "var(--text-muted)" }}><code>getCurrentUser()</code> — Return the current session user</li>
              <li style={{ fontSize: "0.9rem", color: "var(--text-muted)" }}><code>refreshSession()</code> — Refresh the session using the refresh token grant</li>
              <li style={{ fontSize: "0.9rem", color: "var(--text-muted)" }}><code>logout()</code> — Revoke tokens and clear session state</li>
              <li style={{ fontSize: "0.9rem", color: "var(--text-muted)" }}><code>deriveDek(drk, id)</code> — Derive a per-item Data Encryption Key from the DRK</li>
              <li style={{ fontSize: "0.9rem", color: "var(--text-muted)" }}><code>resolveDek(drk, id)</code> — Resolve or derive a DEK (with caching)</li>
              <li style={{ fontSize: "0.9rem", color: "var(--text-muted)" }}><code>aeadEncrypt(dek, plaintext)</code> — AES-256-GCM encrypt</li>
              <li style={{ fontSize: "0.9rem", color: "var(--text-muted)" }}><code>aeadDecrypt(dek, ciphertext)</code> — AES-256-GCM decrypt</li>
              <li style={{ fontSize: "0.9rem", color: "var(--text-muted)" }}><code>encryptNote(drk, noteId, content)</code> — DarkNotes pattern: encrypt a note</li>
              <li style={{ fontSize: "0.9rem", color: "var(--text-muted)" }}><code>decryptNote(drk, noteId, ciphertext)</code> — DarkNotes pattern: decrypt a note</li>
              <li style={{ fontSize: "0.9rem", color: "var(--text-muted)" }}><code>wrapDrk(drk, passphrase)</code> — Wrap DRK for convenience storage</li>
              <li style={{ fontSize: "0.9rem", color: "var(--text-muted)" }}><code>unwrapDrk(wrapped, passphrase)</code> — Unwrap a convenience-stored DRK</li>
            </ul>
          </section>

          <RelatedLinks links={[
            { label: "OIDC endpoints", to: "/developers/oidc" },
            { label: "Quickstart", to: "/developers/quickstart" },
            { label: "ZK key delivery", to: "/features/zero-knowledge-keys" },
            { label: "Demo app source", href: "https://github.com/puzed/darkauth/tree/main/packages/demo-app" },
          ]} />
        </div>
      </div>
    </Layout>
  );
}
