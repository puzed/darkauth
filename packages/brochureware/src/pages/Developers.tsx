import { Link } from "react-router-dom";
import Layout from "../components/Layout";
import PageHero from "../components/PageHero";
import CodeBlock from "../components/CodeBlock";
import styles from "./Developers.module.css";

const DOCKER_CMD = "docker run -d -p 9080:9080 -p 9081:9081 ghcr.io/puzed/darkauth:latest";

const DEV_SECTIONS = [
  {
    title: "Quickstart",
    desc: "Running in 5 minutes. Docker one-liner, installer, register a client.",
    to: "/developers/quickstart",
    icon: "⚡",
  },
  {
    title: "SDK reference",
    desc: "@darkauth/client — OIDC integration and optional ZK crypto helpers.",
    to: "/developers/sdk",
    icon: "📦",
  },
  {
    title: "OIDC endpoints",
    desc: "Discovery, JWKS, authorize, token, userinfo, introspect, revoke, OPAQUE, DRK.",
    to: "/developers/oidc",
    icon: "🔌",
  },
];

export default function Developers() {
  return (
    <Layout>
      <PageHero
        eyebrow="Developers"
        title="Standards-first. SDK optional."
        sub="Any library that speaks OIDC works. The SDK adds optional ZK crypto helpers for apps that need client-side key delivery."
      />
      <div className="container">
        <div className={styles.page}>
          <div className={styles.cards}>
            {DEV_SECTIONS.map((s) => (
              <Link key={s.to} to={s.to} className={styles.card}>
                <span className={styles.cardIcon}>{s.icon}</span>
                <h3 className={styles.cardTitle}>{s.title}</h3>
                <p className={styles.cardDesc}>{s.desc}</p>
                <span className={styles.cardArrow}>Go →</span>
              </Link>
            ))}
          </div>

          <section className={styles.section}>
            <h2>Start with one command</h2>
            <p>Run DarkAuth locally in seconds. Visit <code>:9081</code> for the installer.</p>
            <CodeBlock code={DOCKER_CMD} lang="bash" />
            <p>Port 9080: users + OIDC endpoints. Port 9081: admin console + installer.</p>
          </section>

          <section className={styles.section}>
            <h2>Integration options</h2>
            <div className={styles.integGrid}>
              <div className={styles.integCard}>
                <h3>Any OIDC library</h3>
                <p>DarkAuth's discovery endpoint (<code>/.well-known/openid-configuration</code>) makes it compatible with any OIDC client library. You need the issuer URL, a client ID, and a redirect URI. That's it.</p>
              </div>
              <div className={styles.integCard}>
                <h3>@darkauth/client</h3>
                <p>The client SDK wraps the OIDC flow and adds ZK crypto helpers — key derivation, AEAD encryption/decryption, note encryption for the DarkNotes demo pattern. Non-ZK apps can ignore the crypto layer entirely.</p>
              </div>
              <div className={styles.integCard}>
                <h3>DarkNotes demo</h3>
                <p>A fully working E2EE notes app built on DarkAuth. Shows how to integrate OPAQUE login, derive per-note encryption keys from the DRK, and implement ECDH-based note sharing between users.</p>
              </div>
            </div>
          </section>

          <section className={styles.section}>
            <h2>Demo clients (pre-configured)</h2>
            <p>DarkAuth ships with two pre-configured demo clients:</p>
            <ul className={styles.list}>
              <li><strong>Public PKCE client:</strong> Standard Authorization Code + PKCE flow. No client secret. Use this for SPAs and mobile apps that don't use ZK delivery.</li>
              <li><strong>ZK-enabled public client:</strong> Same as above, but configured with <code>zk_delivery="fragment-jwe"</code>. Accepts <code>zk_pub</code> in the authorization request and returns <code>zk_drk_hash</code> in the token response.</li>
            </ul>
          </section>

          <div className={styles.nextRow}>
            <Link to="/developers/quickstart" className={styles.btnPrimary}>Quickstart guide</Link>
            <Link to="/developers/sdk" className={styles.btnSecondary}>SDK reference →</Link>
            <Link to="/developers/oidc" className={styles.btnSecondary}>OIDC endpoints →</Link>
          </div>
        </div>
      </div>
    </Layout>
  );
}
