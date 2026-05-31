import { Link } from "react-router-dom";
import Layout from "../components/Layout";
import PageHero from "../components/PageHero";
import styles from "./Features.module.css";

const FEATURES = [
  {
    title: "Zero-knowledge passwords",
    sub: "OPAQUE",
    desc: "Passwords are verified without ever being sent to the server. Database breaches can't expose what was never stored.",
    to: "/features/zero-knowledge-passwords",
  },
  {
    title: "Zero-knowledge key delivery",
    sub: "DRK / fragment JWE",
    desc: "Give your app an encryption key the server can't read. Build genuinely end-to-end encrypted apps on top of a normal-feeling login.",
    to: "/features/zero-knowledge-keys",
  },
  {
    title: "OpenID Connect",
    sub: "OAuth 2.0 / PKCE / EdDSA",
    desc: "Standard OAuth 2.0 / OIDC with PKCE, discovery, JWKS, and EdDSA-signed ID tokens. No proprietary SDK required.",
    to: "/features/oidc",
  },
  {
    title: "Multi-factor auth",
    sub: "TOTP",
    desc: "Authenticator-app MFA with backup codes, anti-replay, per-org enforcement, and encrypted secrets at rest.",
    to: "/features/mfa",
  },
  {
    title: "Organizations & RBAC",
    sub: "Multi-org / roles / permissions",
    desc: "Multi-org membership, roles, and fine-grained permissions resolved in org context and surfaced in ID tokens.",
    to: "/features/organizations-rbac",
  },
  {
    title: "Federation",
    sub: "Upstream OIDC / SAML 2.0",
    desc: "Let users sign in through upstream OIDC or SAML 2.0 providers with claim mapping and account linking.",
    to: "/features/federation",
  },
  {
    title: "SCIM 2.0 provisioning",
    sub: "Users / Groups",
    desc: "Provision and deprovision users and groups from your identity provider. Deactivation revokes sessions automatically.",
    to: "/features/scim",
  },
  {
    title: "White-label branding",
    sub: "Colors / logo / copy / CSS",
    desc: "Match the login and user portal to your brand — colors, logo, typography, all copy, and sanitized custom CSS.",
    to: "/features/branding",
  },
  {
    title: "Admin console & audit",
    sub: "Dashboard / logs / key management",
    desc: "One console to manage users, clients, keys, and a full audit trail with export. Config lives in Postgres.",
    to: "/features/admin",
  },
];

export default function Features() {
  return (
    <Layout>
      <PageHero
        eyebrow="Features"
        title="Everything you need to authenticate users — and protect their data."
        sub="Each card is a doorway to a deep-dive. Pick the feature you care about."
      />
      <div className="container">
        <div className={styles.grid}>
          {FEATURES.map((f) => (
            <Link key={f.to} to={f.to} className={styles.card}>
              <div className={styles.cardHeader}>
                <h3 className={styles.cardTitle}>{f.title}</h3>
                <span className={styles.cardSub}>{f.sub}</span>
              </div>
              <p className={styles.cardDesc}>{f.desc}</p>
              <span className={styles.cardArrow}>Learn more →</span>
            </Link>
          ))}
        </div>
      </div>
    </Layout>
  );
}
