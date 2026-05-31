import { Link } from "react-router-dom";
import Layout from "../components/Layout";
import PageHero from "../components/PageHero";
import CodeBlock from "../components/CodeBlock";
import styles from "./HowItWorks.module.css";

const keySchedule = `export_key  ←  OPAQUE (never sent to the server)
    │
    │  HKDF-SHA256(salt=H("DarkAuth|v1|tenant=default|user="+sub), info="mk")
    ▼
    MK
    │
    ├─ HKDF-SHA256(info="wrap-key")    ──▶  KW  ──▶  AEAD-Encrypt(DRK) ──▶  WRAPPED_DRK
    │                                                                        (server stores only this)
    └─ HKDF-SHA256(info="data-derive") ──▶  KDerive  (app data encryption)`;

const standardFlow = `RP App (Browser)                    DarkAuth (User Port)
       │                                       │
       │──── GET /api/authorize (PKCE S256) ───▶│
       │◀─── Login UI (OPAQUE) ─────────────────│
       │──── OPAQUE finish (user session) ──────▶│
       │──── POST /api/authorize/finalize ───────▶│
       │◀─── { code, state?, redirect_uri } ────│
       │──── POST /api/token { code, verifier } ▶│
       │◀─── { id_token, expires_in, refresh? } │`;

const zkFlow = `RP App (Browser)                    DarkAuth (User Port)
       │                                       │
       │── GET /api/authorize?zk_pub=... ──────▶│
       │◀─ Login UI (OPAQUE) ──────────────────│
       │── OPAQUE finish ───────────────────────▶│
       │   [Browser derives KW, unwraps DRK]    │
       │   [Browser builds drk_jwe = ECDH-ES+A256GCM(DRK, zk_pub)]
       │   [Browser computes drk_hash = sha256(drk_jwe)]
       │── POST /api/authorize/finalize { request_id, drk_hash } ──▶│
       │◀─ { code, state?, redirect_uri } ────│
       │   [Browser redirects to redirect_uri#drk_jwe=...]
       │── POST /api/token { code, verifier } ─▶│
       │◀─ { id_token, zk_drk_hash, ... } ────│
       │   [Verify sha256(fragment drk_jwe) == zk_drk_hash]
       │   [Decrypt JWE with zk_priv → DRK]    │`;

const STEPS = [
  {
    num: "01",
    title: "Prove the password — without sending it",
    eli5: "You answer a mathematical challenge that proves you know your password, without handing the password over. Think of it like proving you know the combination to a safe by opening it, not by reading out the numbers.",
    precise: "OPAQUE (RFC 9380, P-256) is a password-authenticated key exchange. The client and server run a protocol where the server verifies the client knows the password, without the password or any equivalent being transmitted. On successful login, the client obtains a stable export_key that is deterministic per (user, password). The server stores only an opaque verifier — not the password, not something that can be reversed to recover it.",
    code: null,
  },
  {
    num: "02",
    title: "Keep the keys on the device",
    eli5: "Your device takes that secret it got from the password challenge and uses it to make an encryption key. Then it locks your data key using that encryption key, and gives the locked box to the server. The server holds the box but can't open it.",
    precise: "The client derives a key schedule from export_key using HKDF-SHA256. The key wrapping key (KW) is used to AEAD-encrypt the Data Root Key (DRK) — a random 32-byte symmetric key. The server stores only WRAPPED_DRK. It cannot reconstruct KW (which requires export_key) and therefore cannot decrypt DRK from stored state alone.",
    code: keySchedule,
  },
  {
    num: "03",
    title: "Hand the app a sealed key",
    eli5: "When your app needs your encryption key, your browser takes the key, puts it in a sealed envelope addressed specifically to your app, and drops it through the URL fragment — a part of the address bar the server never reads. Your app picks it up and checks a receipt to make sure it wasn't tampered with.",
    precise: "For ZK-enabled clients, the app supplies an ephemeral P-256 keypair. After OPAQUE, the browser derives KW, unwraps DRK locally, and constructs a JWE: ECDH-ES + A256GCM(DRK, zk_pub) with AAD={sub, client_id}. The browser computes drk_hash = base64url(SHA-256(JWE)) and sends only the hash in the authorize/finalize call. The JWE is placed in the URL fragment (#drk_jwe=...) — HTTP spec: fragments are not sent to the server. The token endpoint returns zk_drk_hash; the app verifies the hash before decrypting.",
    code: null,
  },
  {
    num: "04",
    title: "Use standard OIDC for everything else",
    eli5: "From your app's perspective, this is just a normal OAuth 2.0 login. Your app gets a signed ID token that proves who the user is. Everything that speaks OIDC — any client library in any language — just works.",
    precise: "The token endpoint returns a standard OIDC ID token signed with EdDSA (Ed25519). Claims include standard OIDC fields plus optional org_id, org_slug, roles, permissions. Refresh tokens are hashed at rest, single-use, client-bound. Discovery and JWKS endpoints let clients verify tokens without hard-coding any secrets.",
    code: null,
  },
  {
    num: "05",
    title: "Where the trust boundary is",
    eli5: "DarkAuth protects against an attacker who gets a copy of the database, or an insider who reads server logs. It does not protect against someone who takes over your browser, injects malicious JavaScript into the page, or compromises the device itself.",
    precise: "The security model assumes: TLS for all transports, trusted user device and browser, trusted Auth UI and RP frontend origins, no malicious same-origin JavaScript. Threats within scope: database exfiltration, insider reads, redirect tampering, weak key injection, token endpoint abuse. Explicitly out of scope: XSS in the auth UI or RP app, compromised browser/extensions/device, broken TLS, malicious RP app that intentionally exfiltrates keys.",
    code: null,
  },
];

export default function HowItWorks() {
  return (
    <Layout>
      <PageHero
        eyebrow="How it works"
        title="One login. Verified identity, and an encryption key the server can't read."
        sub="Five steps. Start with the plain explanation; expand into the cryptographic detail when you're ready."
      />
      <div className="container">
        <div className={styles.page}>
          <div className={styles.steps}>
            {STEPS.map((s) => (
              <section key={s.num} className={styles.step}>
                <div className={styles.stepNum}>{s.num}</div>
                <div className={styles.stepBody}>
                  <h2 className={styles.stepTitle}>{s.title}</h2>
                  <div className={styles.explanations}>
                    <div className={styles.eli5Box}>
                      <span className={styles.eli5Badge}>Plain English</span>
                      <p>{s.eli5}</p>
                    </div>
                    <div className={styles.preciseBox}>
                      <span className={styles.precBadge}>Technical</span>
                      <p>{s.precise}</p>
                    </div>
                  </div>
                  {s.code && (
                    <div style={{ marginTop: "1rem" }}>
                      <CodeBlock code={s.code} lang="Key schedule diagram" />
                    </div>
                  )}
                </div>
              </section>
            ))}
          </div>

          <section className={styles.diagrams}>
            <h2>Sequence diagrams</h2>
            <p className={styles.diagSub}>The two authorization flows, shown as text sequence diagrams.</p>

            <h3 style={{ marginTop: "1.5rem", marginBottom: "0.75rem" }}>Standard Authorization Code + PKCE</h3>
            <CodeBlock code={standardFlow} lang="Standard OIDC flow" />

            <h3 style={{ marginTop: "2rem", marginBottom: "0.75rem" }}>ZK Fragment JWE Delivery</h3>
            <CodeBlock code={zkFlow} lang="ZK key delivery flow" />
          </section>

          <div className={styles.nextStep}>
            <p>Ready to understand the full security model?</p>
            <div className={styles.nextActions}>
              <Link to="/security" className={styles.btnPrimary}>Security overview</Link>
              <Link to="/security/whitepaper" className={styles.btnSecondary}>Read the whitepaper →</Link>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
