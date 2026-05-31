import { Link } from "react-router-dom";
import Layout from "../components/Layout";
import PageHero from "../components/PageHero";
import RelatedLinks from "../components/RelatedLinks";
import styles from "./Security.module.css";

const NEVER_STORED = [
  "Plaintext passwords (or any equivalent)",
  "OPAQUE export_key, MK, KW, or KDerive",
  "Plaintext Data Root Key (DRK)",
  "DRK JWE ciphertext",
];

const IS_STORED = [
  "Opaque OPAQUE verifier (cannot be reversed to recover password alone)",
  "WRAPPED_DRK = AEAD_Encrypt(KW, DRK, aad=sub) — ciphertext only",
  "zk_drk_hash = base64url(SHA-256(drk_jwe)) — hash for integrity, not the JWE",
  "OPAQUE verifier for admin users (separate from user verifiers)",
];

const PRIMITIVES = [
  { name: "OPAQUE (RFC 9380, P-256)", use: "Password authentication. Server stores opaque verifier; client obtains export_key." },
  { name: "HKDF-SHA256", use: "Key derivation from export_key to MK, KW, KDerive." },
  { name: "AES-256-GCM (AEAD)", use: "Wrapping the DRK: WRAPPED_DRK = AEAD_Encrypt(KW, DRK, aad=sub)." },
  { name: "ECDH-ES + A256GCM (JWE)", use: "ZK fragment delivery: seals DRK for the app's ephemeral zk_pub." },
  { name: "EdDSA (Ed25519)", use: "ID token signing. JWKS rotatable via admin API." },
  { name: "Argon2id", use: "KEK derivation from config passphrase; backup code hashing." },
  { name: "PKCE (S256)", use: "Required for public clients and ZK clients to prevent code interception." },
];

const THREATS = [
  {
    attack: "Database exfiltration",
    mitigation: "OPAQUE verifiers don't reveal passwords. WRAPPED_DRK without KW is useless. Private JWKs and client secrets encrypted at rest with KEK.",
    scope: "in-scope",
  },
  {
    attack: "Server-side insider reads",
    mitigation: "No plaintext passwords or DRK stored. KEK encrypts private keys. Logging policy prohibits logging cryptographic material.",
    scope: "in-scope",
  },
  {
    attack: "Redirect tampering / fragment injection",
    mitigation: "Clients verify sha256(fragment drk_jwe) === zk_drk_hash before using DRK. PKCE S256 prevents code interception.",
    scope: "in-scope",
  },
  {
    attack: "Weak zk_pub injection",
    mitigation: "Strict P-256 public key validation. Server returns invalid_request for malformed, invalid, or private-component-bearing keys.",
    scope: "in-scope",
  },
  {
    attack: "Token endpoint abuse / code replay",
    mitigation: "Auth codes: ≤60s TTL, single-use, atomic consume at token endpoint. PKCE S256 required. Refresh tokens: hashed, single-use, client-bound.",
    scope: "in-scope",
  },
  {
    attack: "Malicious Auth UI or RP frontend (XSS / supply-chain)",
    mitigation: "Not protected by design. Hosted-web ZK requires trust in the JavaScript served by trusted origins.",
    scope: "out-of-scope",
  },
  {
    attack: "Compromised browser / extensions / device",
    mitigation: "Not protected. A fully compromised device can read DRK from browser memory.",
    scope: "out-of-scope",
  },
  {
    attack: "Broken TLS",
    mitigation: "Not protected. TLS is a deployment prerequisite.",
    scope: "out-of-scope",
  },
];

export default function Security() {
  return (
    <Layout>
      <PageHero
        eyebrow="Security"
        title="We tell you exactly what we can — and can't — protect."
        sub="Security people are a core audience. Overclaiming destroys credibility. The threat model is documented, the caveats are explicit, and the source is public."
      />
      <div className="container">
        <div className={styles.page}>
          <section className={styles.section}>
            <h2>What the server never stores</h2>
            <div className={styles.storeGrid}>
              <div className={styles.storeBox}>
                <h3 className={styles.neverHead}>Never stored</h3>
                <ul className={styles.storeList}>
                  {NEVER_STORED.map((item) => (
                    <li key={item} className={styles.neverItem}>{item}</li>
                  ))}
                </ul>
              </div>
              <div className={styles.storeBox}>
                <h3 className={styles.isHead}>What is stored</h3>
                <ul className={styles.storeList}>
                  {IS_STORED.map((item) => (
                    <li key={item} className={styles.isItem}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>
          </section>

          <section className={styles.section}>
            <h2>Cryptographic primitives</h2>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Primitive</th>
                  <th>Use</th>
                </tr>
              </thead>
              <tbody>
                {PRIMITIVES.map((p) => (
                  <tr key={p.name}>
                    <td><code>{p.name}</code></td>
                    <td>{p.use}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className={styles.section}>
            <h2>Threat model</h2>
            <p className={styles.assumption}>
              Assumptions: TLS for all transports. Trusted user device and browser. Auth UI and RP frontend origins serving trusted JavaScript. RP applications correctly verifying <code>zk_drk_hash</code>.
            </p>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Attack</th>
                  <th>Mitigation / status</th>
                  <th>Scope</th>
                </tr>
              </thead>
              <tbody>
                {THREATS.map((t) => (
                  <tr key={t.attack}>
                    <td>{t.attack}</td>
                    <td>{t.mitigation}</td>
                    <td>
                      <span className={t.scope === "in-scope" ? styles.inScope : styles.outScope}>
                        {t.scope === "in-scope" ? "Mitigated" : "Out of scope"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className={styles.section}>
            <h2>Operational security</h2>
            <ul className={styles.bulletList}>
              <li>KEK derived from config passphrase via Argon2id; encrypts private JWKs and client secrets at rest when available</li>
              <li>OPAQUE login and finalize endpoints are rate-limited</li>
              <li>Logging policy: passwords, export_key, MK/KW/KDerive, DRK, DRK JWE, zk_pub, and token secrets must never appear in logs</li>
              <li>Signing keys (JWKS) rotatable via admin API; retired keys retained for validation</li>
              <li>First-run admin installer on port 9081; single-use token gates setup</li>
              <li>Session cookies: HttpOnly, SameSite=Lax, Secure in production</li>
              <li>All runtime configuration stored in Postgres; config.yaml holds only instance-specific values</li>
            </ul>
          </section>

          <section className={styles.section}>
            <h2>Privacy posture</h2>
            <ul className={styles.bulletList}>
              <li>Server-side protocol state avoids plaintext secrets by design</li>
              <li>No certifications are claimed — auditing is community-driven</li>
              <li>The code and security specs are public; that is the audit story</li>
              <li>v1 is single-tenant at the key derivation layer; per-org key separation is future work</li>
            </ul>
          </section>

          <div className={styles.ctaRow}>
            <Link to="/security/whitepaper" className={styles.btnPrimary}>Read the full whitepaper</Link>
            <Link to="/security/zero-knowledge" className={styles.btnSecondary}>ZK extension explained →</Link>
            <a href="https://github.com/puzed/darkauth" className={styles.btnSecondary} target="_blank" rel="noopener noreferrer">Read the source →</a>
          </div>

          <RelatedLinks links={[
            { label: "Security whitepaper", to: "/security/whitepaper" },
            { label: "ZK extension", to: "/security/zero-knowledge" },
            { label: "How it works", to: "/how-it-works" },
            { label: "Self-host guide", to: "/self-host" },
          ]} />
        </div>
      </div>
    </Layout>
  );
}
