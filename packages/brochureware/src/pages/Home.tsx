import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Layout from "../components/Layout";
import CodeBlock from "../components/CodeBlock";
import { useBrochureTheme } from "../hooks/useBrochureTheme";
import {
  cleanShotTitle,
  findAdminDashboardShot,
  getFeaturedShots,
  getScreenshotUrl,
  SCREENSHOT_MANIFEST_URL,
  type ScreenshotManifest,
  type Shot,
} from "../lib/screenshots";
import styles from "./Home.module.css";

const DOCKER_CMD = "docker run -d -p 9080:9080 -p 9081:9081 ghcr.io/puzed/darkauth:latest";

const PILLARS = [
  {
    title: "Your server can't leak what it never had",
    body: "OPAQUE means passwords never hit the wire or the database. Optional DRK delivery means data-encryption keys never do either.",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <rect x="3" y="11" width="18" height="11" rx="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
    ),
  },
  {
    title: "Works with everything that speaks OIDC",
    body: "Standard OAuth 2.0 / OpenID Connect. PKCE, refresh tokens, discovery, JWKS. No proprietary SDK required to log a user in.",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <circle cx="12" cy="12" r="10" />
        <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
      </svg>
    ),
  },
  {
    title: "Open source, self-hosted, no SaaS",
    body: "One Docker image. Postgres or zero-dependency embedded database. No seats, no per-MAU pricing, no vendor lock-in. AGPL-3.0.",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M12 2L2 7l10 5 10-5-10-5z" />
        <path d="M2 17l10 5 10-5" />
        <path d="M2 12l10 5 10-5" />
      </svg>
    ),
  },
];

const FEATURE_TEASERS = [
  { title: "Zero-knowledge passwords", desc: "OPAQUE — passwords never reach the server.", to: "/features/zero-knowledge-passwords" },
  { title: "Zero-knowledge key delivery", desc: "Your app gets an encryption key the server can't read.", to: "/features/zero-knowledge-keys" },
  { title: "OpenID Connect", desc: "Standard PKCE, discovery, JWKS, EdDSA tokens.", to: "/features/oidc" },
  { title: "TOTP MFA", desc: "Authenticator app MFA with backup codes and per-org enforcement.", to: "/features/mfa" },
  { title: "Organizations & RBAC", desc: "Multi-org membership with roles and fine-grained permissions in tokens.", to: "/features/organizations-rbac" },
  { title: "White-label branding", desc: "Match the login portal to your product — colors, logo, all copy.", to: "/features/branding" },
];

const USE_CASE_TEASERS = [
  { title: "E2EE apps", desc: "A notes app where the server can't read the notes. Identity and key custody in one login flow." },
  { title: "Self-hosted identity", desc: "Replace a SaaS IdP. Keep user data on infrastructure you control. No per-MAU bill." },
  { title: "Security-first orgs", desc: "Documented threat model, OPAQUE, TOTP MFA, full audit logs, encryption at rest." },
  { title: "Just OIDC, fast", desc: "A clean, standards-compliant provider you can run in minutes. Any library that speaks OIDC works." },
];

const HOW_STEPS = [
  { num: "1", title: "Prove the password — without sending it", body: "OPAQUE authenticates the user without the password ever reaching the server. The client derives a stable export_key per (user, password)." },
  { num: "2", title: "Keys stay on the device", body: "The client derives a wrapping key from export_key and wraps a random Data Root Key. The server stores only the ciphertext — never the key inside." },
  { num: "3", title: "App receives a sealed key", body: "For ZK-enabled clients, the key is delivered in a JWE in the URL fragment. It never routes through the server. The app verifies a hash for integrity." },
];

export default function Home() {
  const theme = useBrochureTheme();
  const [shots, setShots] = useState<Shot[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const response = await fetch(SCREENSHOT_MANIFEST_URL, { cache: "no-store" });
      const payload: ScreenshotManifest = response.ok ? await response.json() : {};
      const nextShots = payload.themes?.[theme] ?? [];
      if (!cancelled) {
        setShots(Array.isArray(nextShots) ? nextShots : []);
      }
    };
    load().catch(() => {
      if (!cancelled) setShots([]);
    });
    return () => {
      cancelled = true;
    };
  }, [theme]);

  const adminShot = useMemo(() => findAdminDashboardShot(shots), [shots]);
  const featuredShots = useMemo(() => getFeaturedShots(shots), [shots]);
  const previewShots = featuredShots.length > 0 ? featuredShots : adminShot ? [adminShot] : [];

  return (
    <Layout>
      <section className={styles.hero}>
        <div className="container">
          <div className={styles.heroContent}>
            <span className={styles.heroEyebrow}>Open source · Self-hosted · AGPL-3.0</span>
            <h1 className={styles.heroTitle}>Authentication that can't leak what it never had.</h1>
            <p className={styles.heroSub}>
              Drop-in OpenID Connect for your apps, with a zero-knowledge core. Passwords are verified using OPAQUE, so they never reach the server. And with optional zero-knowledge key delivery, your app can offer true end-to-end encryption — keys are derived on the user's device and never touch the database.
            </p>
            <div className={styles.heroCtas}>
              <Link to="/developers/quickstart" className={styles.btnPrimary}>Run it with Docker</Link>
              <Link to="/how-it-works" className={styles.btnSecondary}>How it works →</Link>
            </div>
          </div>
          {adminShot && (
            <div className={styles.heroShot}>
              <div className={styles.browserBar}>
                <span />
                <span />
                <span />
                <strong>Admin dashboard</strong>
              </div>
              <img src={getScreenshotUrl(theme, adminShot.file)} alt="DarkAuth admin dashboard" />
            </div>
          )}
        </div>
      </section>

      <section className={styles.section}>
        <div className="container">
          <div className={styles.sectionHead}>
            <h2>Three ideas. One authentication server.</h2>
          </div>
          <div className={styles.pillars}>
            {PILLARS.map((p) => (
              <div key={p.title} className={styles.pillarCard}>
                <div className={styles.pillarIcon}>{p.icon}</div>
                <h3>{p.title}</h3>
                <p>{p.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className="container">
          <div className={styles.sectionHead}>
            <h2>Real screens from the automated test suite.</h2>
            <p>Admin, user, and demo flows captured from the release build.</p>
          </div>
          <div className={styles.screenshotGrid}>
            {previewShots.map((shot) => (
              <Link key={shot.file} to="/screenshots" className={styles.screenshotCard}>
                <div className={styles.browserBar}>
                  <span />
                  <span />
                  <span />
                  <strong>{cleanShotTitle(shot.title)}</strong>
                </div>
                <img src={getScreenshotUrl(theme, shot.file)} alt={cleanShotTitle(shot.title)} loading="lazy" />
              </Link>
            ))}
          </div>
          <div className={styles.centerAction}>
            <Link to="/screenshots" className={styles.btnSecondary}>Open screenshot library →</Link>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className="container">
          <div className={styles.sectionHead}>
            <h2>Everything you need to authenticate users — and protect their data.</h2>
            <p>Each feature is a deep-dive. Pick a thread and pull it.</p>
          </div>
          <div className={styles.featureGrid}>
            {FEATURE_TEASERS.map((f) => (
              <Link key={f.to} to={f.to} className={styles.featureCard}>
                <h4>{f.title}</h4>
                <p>{f.desc}</p>
                <span className={styles.arrow}>Learn more →</span>
              </Link>
            ))}
          </div>
          <div className={styles.centerAction}>
            <Link to="/features" className={styles.btnSecondary}>See all features →</Link>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className="container">
          <div className={styles.sectionHead}>
            <h2>What you can build</h2>
            <p>DarkAuth is designed for apps where privacy isn't optional.</p>
          </div>
          <div className={styles.useCaseGrid}>
            {USE_CASE_TEASERS.map((u) => (
              <div key={u.title} className={styles.useCaseCard}>
                <h3>{u.title}</h3>
                <p>{u.desc}</p>
              </div>
            ))}
          </div>
          <div className={styles.centerAction}>
            <Link to="/use-cases" className={styles.btnSecondary}>Explore use cases →</Link>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className="container">
          <div className={styles.sectionHead}>
            <h2>One login. Verified identity, and an encryption key the server can't read.</h2>
          </div>
          <div className={styles.steps}>
            {HOW_STEPS.map((s) => (
              <div key={s.num} className={styles.step}>
                <div className={styles.stepNum}>{s.num}</div>
                <div className={styles.stepBody}>
                  <h3>{s.title}</h3>
                  <p>{s.body}</p>
                </div>
              </div>
            ))}
          </div>
          <div className={styles.stepsCta}>
            <Link to="/how-it-works" className={styles.btnSecondary}>Full walkthrough →</Link>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className="container">
          <div className={styles.devStrip}>
            <div>
              <h2>OIDC-compatible. SDK optional.</h2>
              <p className={styles.devCopy}>
                Any library that speaks OIDC works out of the box. The <code>@darkauth/client</code> SDK adds optional ZK crypto helpers for apps that need key delivery.
              </p>
              <div className={styles.inlineActions}>
                <Link to="/developers/quickstart" className={styles.btnPrimary}>Quickstart</Link>
                <Link to="/developers/sdk" className={styles.btnSecondary}>SDK docs →</Link>
              </div>
            </div>
            <div>
              <CodeBlock code={DOCKER_CMD} lang="bash" />
              <p className={styles.portNote}>
                Port 9080: users + OIDC. Port 9081: admin console. First-run web installer at <code>:9081</code>.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className="container">
          <div className={styles.trustStrip}>
            <div className={styles.trustText}>
              <h2>We tell you exactly what we can — and can't — protect.</h2>
              <p>
                Security people are a core audience. Overclaiming destroys credibility. The threat model is documented, the caveats are explicit, and the source is public.
              </p>
              <Link to="/security" className={styles.trustBtn}>Read the security model →</Link>
            </div>
            <ul className={styles.trustList}>
              <li>Passwords never leave the device (OPAQUE, RFC 9380)</li>
              <li>Data keys never touch the server in plaintext</li>
              <li>Threat model table with out-of-scope items stated plainly</li>
              <li>Full security whitepaper published</li>
              <li>No certifications claimed — auditing is community-driven</li>
            </ul>
          </div>
        </div>
      </section>

      <section className={styles.osBand}>
        <div className="container">
          <h2>Free, forever. Because it's yours.</h2>
          <p>No paid plan. No subscription. No cloud service. No seats. No per-MAU pricing. AGPL-3.0 core, MIT SDK and demo app.</p>
          <div className={styles.osActions}>
            <a href="https://github.com/puzed/darkauth" className={styles.btnPrimary} target="_blank" rel="noopener noreferrer">
              View on GitHub
            </a>
            <Link to="/open-source" className={styles.btnSecondary}>License details →</Link>
          </div>
        </div>
      </section>

      <section className={styles.finalCta}>
        <div className="container">
          <h2>Ready to run it?</h2>
          <p>One Docker command. Installer walks you through the rest.</p>
          <code className={styles.dockerCmd}>{DOCKER_CMD}</code>
          <div className={styles.finalActions}>
            <Link to="/developers/quickstart" className={styles.btnPrimary}>Read the quickstart</Link>
            <a href="https://github.com/puzed/darkauth" className={styles.btnSecondary} target="_blank" rel="noopener noreferrer">
              Browse the source →
            </a>
          </div>
        </div>
      </section>
    </Layout>
  );
}
