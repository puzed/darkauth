import { Link } from "react-router-dom";
import Layout from "../components/Layout";
import PageHero from "../components/PageHero";
import CTABlock from "../components/CTABlock";
import styles from "./UseCases.module.css";

const USE_CASES = [
  {
    id: "e2ee",
    title: "End-to-end encrypted apps",
    tagline: "A notes app where the server can't read the notes.",
    body: `The DarkAuth ZK extension gives you identity and an encryption key in a single login. Your app receives a Data Root Key — derived from the user's password, never transmitted to the server — that you can use to encrypt user data client-side.

DarkNotes, the bundled demo app, is a full worked example: OPAQUE login, per-note data encryption keys (DEKs) derived from the DRK, ECDH-based note sharing between users. The server stores only ciphertext.`,
    links: [
      { label: "ZK key delivery", to: "/features/zero-knowledge-keys" },
      { label: "Developer SDK", to: "/developers/sdk" },
      { label: "How it works", to: "/how-it-works" },
    ],
  },
  {
    id: "self-hosted",
    title: "Self-hosted identity for your product",
    tagline: "Replace a SaaS IdP. Keep user data on infrastructure you control.",
    body: `SaaS authentication means sending every login event to a third party. Self-hosting with DarkAuth means your users' identities stay in your Postgres database — or in an embedded PGLite instance if you want zero external dependencies.

No per-MAU pricing. No seat limits. No data-processing agreements with a vendor you didn't choose. Run it on your own servers or in your own cloud account. OIDC means your apps just need to point at a different discovery URL.`,
    links: [
      { label: "Self-host guide", to: "/self-host" },
      { label: "OpenID Connect", to: "/features/oidc" },
      { label: "Quickstart", to: "/developers/quickstart" },
    ],
  },
  {
    id: "security-orgs",
    title: "Security-conscious organizations",
    tagline: "Documented threat model, not just 'we hash with bcrypt, trust us.'",
    body: `DarkAuth's security model is fully documented and the source is public. The threat model table is explicit about what is and isn't protected. OPAQUE means you can tell your security team that passwords are provably not stored. TOTP MFA, audit logs, encryption at rest for private keys and client secrets, and per-org MFA enforcement give you the controls you need.

Auditing is community-driven — the specs and code are the audit artifact.`,
    links: [
      { label: "Security overview", to: "/security" },
      { label: "Security whitepaper", to: "/security/whitepaper" },
      { label: "TOTP MFA", to: "/features/mfa" },
      { label: "Admin & audit", to: "/features/admin" },
    ],
  },
  {
    id: "just-oidc",
    title: '"Just give me clean OIDC"',
    tagline: "Standards-compliant. SDK optional. Running in minutes.",
    body: `You don't have to use any of the ZK features. DarkAuth is a perfectly good OIDC provider without them. One Docker command, visit the installer, register a client, and any library that speaks OIDC works against it.

EdDSA-signed ID tokens. Discovery. JWKS. PKCE. Refresh tokens. UserInfo. Introspection. Revocation. All the standard stuff, without the SaaS pricing or the vendor lock-in.`,
    links: [
      { label: "Quickstart", to: "/developers/quickstart" },
      { label: "OIDC endpoint reference", to: "/developers/oidc" },
      { label: "Open source", to: "/open-source" },
    ],
  },
];

export default function UseCases() {
  return (
    <Layout>
      <PageHero
        eyebrow="Use cases"
        title="Built for apps where privacy isn't optional."
        sub="Four segments, four concrete scenarios. Find the one that fits your situation."
      />
      <div className="container">
        <div className={styles.page}>
          {USE_CASES.map((uc) => (
            <section key={uc.id} id={uc.id} className={styles.section}>
              <h2 className={styles.title}>{uc.title}</h2>
              <p className={styles.tagline}>{uc.tagline}</p>
              {uc.body.split("\n\n").map((para, i) => (
                <p key={i} className={styles.body}>{para}</p>
              ))}
              <div className={styles.links}>
                {uc.links.map((link) => (
                  <Link key={link.to} to={link.to} className={styles.chip}>
                    {link.label} →
                  </Link>
                ))}
              </div>
            </section>
          ))}

          <CTABlock
            title="Start building"
            desc="One Docker command. The installer walks you through the rest."
            primaryLabel="Read the quickstart"
            primaryTo="/developers/quickstart"
            secondaryLabel="Browse the source"
            secondaryHref="https://github.com/puzed/darkauth"
          />
        </div>
      </div>
    </Layout>
  );
}
