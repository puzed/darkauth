import { Link } from "react-router-dom";
import Layout from "../components/Layout";
import PageHero from "../components/PageHero";
import CodeBlock from "../components/CodeBlock";
import RelatedLinks from "../components/RelatedLinks";
import styles from "./OpenSource.module.css";

const DOCKER_CMD = "docker run -d -p 9080:9080 -p 9081:9081 ghcr.io/puzed/darkauth:latest";

const LICENSES = [
  {
    package: "DarkAuth core (auth server, admin UI, user UI)",
    license: "AGPL-3.0",
    note: "If you modify the core and distribute it (including as a service), you must release the source under the same license.",
  },
  {
    package: "@darkauth/client (SDK)",
    license: "MIT",
    note: "Use freely in your applications, open or closed source.",
  },
  {
    package: "Demo app (DarkNotes)",
    license: "MIT",
    note: "A reference implementation you can copy and adapt.",
  },
  {
    package: "opaque-ts",
    license: "BSD-3-Clause",
    note: "The OPAQUE protocol implementation used by DarkAuth.",
  },
];

export default function OpenSource() {
  return (
    <Layout>
      <PageHero
        eyebrow="Open source"
        title="Free, forever. Because it's yours."
        sub="No paid plan. No subscription. No cloud service. No seats. No per-MAU pricing. Self-host it, forever, for free."
      />
      <div className="container">
        <div className={styles.page}>

          <section className={styles.section}>
            <h2>No SaaS. No lock-in.</h2>
            <p>
              DarkAuth will never have a cloud offering that charges you to run authentication for your users. The business model — to the extent there is one — is the open-source ecosystem it enables, not metered access to a hosted version.
            </p>
            <p>
              This matters for a security product. You can read the code. You can audit the cryptographic protocol implementations. You can run it on hardware you control, in a jurisdiction you choose, behind a firewall only you can reach.
            </p>
            <p>
              That's the point.
            </p>
          </section>

          <section className={styles.section}>
            <h2>Licenses</h2>
            <p>DarkAuth is a monorepo with components under different licenses. Here's what you need to know:</p>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Package</th>
                  <th>License</th>
                  <th>What it means</th>
                </tr>
              </thead>
              <tbody>
                {LICENSES.map((l) => (
                  <tr key={l.package}>
                    <td>{l.package}</td>
                    <td><span className={styles.licBadge}>{l.license}</span></td>
                    <td>{l.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className={styles.licenseNote}>
              For most users — running DarkAuth for their own users, integrating the client SDK, or building an app on top of the demo — the licenses create no friction. The AGPL-3.0 requirement on the core only applies if you're distributing modified versions.
            </p>
          </section>

          <section className={styles.section}>
            <h2>Audit it yourself</h2>
            <p>
              The code and security specs are public. That is the audit story. No certifications are claimed; community-driven review of the source and specs is the mechanism.
            </p>
            <p>
              The security whitepaper documents the protocol, the threat model, and an auditor verification checklist. The specs directory contains the normative OIDC ZK extension specification. Cryptographic protocol implementations (OPAQUE via opaque-ts, HKDF via the Web Crypto API) are dependencies you can read independently.
            </p>
            <div className={styles.auditLinks}>
              <a href="https://github.com/puzed/darkauth" className={styles.btnPrimary} target="_blank" rel="noopener noreferrer">Browse the source</a>
              <Link to="/security/whitepaper" className={styles.btnSecondary}>Security whitepaper →</Link>
              <Link to="/security/zero-knowledge" className={styles.btnSecondary}>ZK extension spec →</Link>
            </div>
          </section>

          <section className={styles.section}>
            <h2>Contributing</h2>
            <p>Pull requests, bug reports, and security disclosures are all welcome.</p>
            <ul className={styles.list}>
              <li><strong>Bug reports:</strong> Open an issue on GitHub with reproduction steps</li>
              <li><strong>Feature requests:</strong> Open an issue describing the use case before submitting a PR</li>
              <li><strong>Security issues:</strong> Use GitHub's private security reporting — don't open a public issue for vulnerabilities</li>
              <li><strong>Code:</strong> Fork, branch, PR. Follow the existing style. Tests required for changes to auth flows or cryptographic code</li>
            </ul>
          </section>

          <section className={styles.section}>
            <h2>Run it now</h2>
            <p>One command. No account needed.</p>
            <CodeBlock code={DOCKER_CMD} lang="bash" />
            <p>Visit <code>:9081</code> for the installer. Working OIDC in about 5 minutes.</p>
            <div className={styles.ctaRow}>
              <Link to="/developers/quickstart" className={styles.btnPrimary}>Quickstart guide</Link>
              <a href="https://github.com/puzed/darkauth" className={styles.btnSecondary} target="_blank" rel="noopener noreferrer">GitHub →</a>
            </div>
          </section>

          <RelatedLinks links={[
            { label: "Security whitepaper", to: "/security/whitepaper" },
            { label: "Self-host guide", to: "/self-host" },
            { label: "Quickstart", to: "/developers/quickstart" },
          ]} />
        </div>
      </div>
    </Layout>
  );
}
