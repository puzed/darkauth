import Layout from "../components/Layout";
import PageHero from "../components/PageHero";
import CodeBlock from "../components/CodeBlock";
import CTABlock from "../components/CTABlock";
import RelatedLinks from "../components/RelatedLinks";
import styles from "./SelfHost.module.css";

const DOCKER_RUN = "docker run -d -p 9080:9080 -p 9081:9081 ghcr.io/puzed/darkauth:latest";
const DOCKER_POSTGRES = `docker run -d \\
  -p 9080:9080 \\
  -p 9081:9081 \\
  -v /path/to/config.yaml:/app/config.yaml:ro \\
  ghcr.io/puzed/darkauth:latest`;

const CONFIG_YAML = `# config.yaml — instance-specific settings only
port: 9080
adminPort: 9081
publicOrigin: "https://auth.example.com"
adminOrigin: "https://admin.auth.example.com"
databaseUrl: "postgresql://user:pass@host:5432/darkauth"

# KEK passphrase: encrypts private signing keys and client secrets at rest.
# Use a strong passphrase. Store it securely (e.g., a secrets manager).
kekPassphrase: "your-strong-passphrase-here"

# Optional: restrict ZK delivery to these origins
# allowedZkOrigins:
#   - "https://app.example.com"`;

export default function SelfHost() {
  return (
    <Layout>
      <PageHero
        eyebrow="Self-host"
        title="One image. Your infrastructure. No external dependencies required."
        sub="DarkAuth ships as a single Docker image. Postgres for production, embedded PGLite for zero-dependency trials."
      />
      <div className="container">
        <div className={styles.page}>

          <section className={styles.section}>
            <h2>Docker</h2>
            <p>One command starts a fully functional DarkAuth instance with an embedded PGLite database:</p>
            <CodeBlock code={DOCKER_RUN} lang="bash" />
            <ul className={styles.list}>
              <li><strong>Port 9080</strong> — User-facing: login, user portal, OIDC endpoints</li>
              <li><strong>Port 9081</strong> — Admin-facing: admin console, installer, admin API</li>
              <li>First-run: visit <code>:9081</code> — a single-use token in the container logs gates the installer</li>
              <li>The installer walks you through: DB choice, KEK passphrase, first admin user</li>
            </ul>
            <p>For production with an external config file:</p>
            <CodeBlock code={DOCKER_POSTGRES} lang="bash (with config mount)" />
          </section>

          <section className={styles.section}>
            <h2>Database: Postgres or PGLite</h2>
            <div className={styles.dbGrid}>
              <div className={styles.dbCard}>
                <h3 className={styles.dbTitle}>PGLite (embedded)</h3>
                <ul className={styles.list}>
                  <li>Zero external dependencies — runs inside the Docker container</li>
                  <li>Persists to a local file (mount a volume for durability)</li>
                  <li>Good for: local dev, trials, single-node low-traffic deployments</li>
                  <li>Not recommended for production with multiple replicas or high traffic</li>
                </ul>
              </div>
              <div className={styles.dbCard}>
                <h3 className={styles.dbTitle}>PostgreSQL 15+</h3>
                <ul className={styles.list}>
                  <li>Set <code>databaseUrl</code> in <code>config.yaml</code></li>
                  <li>Recommended for all production deployments</li>
                  <li>Supports all standard Postgres hosting (RDS, Supabase, Neon, etc.)</li>
                  <li>Multiple replicas supported (stateless API layer)</li>
                </ul>
              </div>
            </div>
          </section>

          <section className={styles.section}>
            <h2>Configuration</h2>
            <p><code>config.yaml</code> holds only instance-specific values. Everything else (OIDC settings, clients, branding, email templates, users) lives in the database and is editable in the admin UI without a container restart.</p>
            <CodeBlock code={CONFIG_YAML} lang="config.yaml" />
            <p>The <code>publicOrigin</code> / <code>adminOrigin</code> values are the canonical issuer URLs. Set these to match your actual domain before going to production.</p>
          </section>

          <section className={styles.section}>
            <h2>Security at rest — KEK</h2>
            <p>The Key Encryption Key (KEK) is derived from the <code>kekPassphrase</code> in <code>config.yaml</code> using Argon2id at startup. It encrypts:</p>
            <ul className={styles.list}>
              <li>Private signing JWKs (used to sign ID tokens)</li>
              <li>OAuth client secrets</li>
              <li>TOTP secrets</li>
            </ul>
            <p>Without the correct passphrase, the server cannot start (cannot decrypt keys). Use a strong passphrase and store it in a secrets manager — not version control.</p>
            <div className={styles.guidance}>
              <strong>Deployment guidance:</strong>
              <ul className={styles.list} style={{ marginTop: "0.5rem" }}>
                <li>Enforce HTTPS for both user (<code>:9080</code>) and admin (<code>:9081</code>) ports</li>
                <li>Restrict admin port to internal network or VPN if possible</li>
                <li>Set <code>allowedZkOrigins</code> to your exact RP origins in production</li>
                <li>Use SameSite=Strict or Lax for session cookies</li>
                <li>Rotate signing keys periodically via the admin console</li>
              </ul>
            </div>
          </section>

          <section className={styles.section}>
            <h2>Two-port architecture</h2>
            <p>
              User-facing traffic (login, user portal, OIDC endpoints) runs on port 9080. Admin traffic (admin console, management API) runs on port 9081. This separation means:
            </p>
            <ul className={styles.list}>
              <li>Admin console can be firewalled from the internet entirely</li>
              <li>User-facing and admin-facing traffic can be routed independently</li>
              <li>Admin authentication is a completely separate OPAQUE flow from user authentication</li>
            </ul>
          </section>

          <section className={styles.section}>
            <h2>Changelog and updates</h2>
            <p>
              DarkAuth publishes a changelog at <a href="https://release.darkauth.com/changelog.json" target="_blank" rel="noopener noreferrer">release.darkauth.com/changelog.json</a>. The admin dashboard fetches it on load to show recent releases. Update by pulling the latest Docker image tag.
            </p>
          </section>

          <CTABlock
            title="Ready to run it?"
            desc="Full setup takes about 5 minutes. See the quickstart for a step-by-step walkthrough."
            primaryLabel="Quickstart guide"
            primaryTo="/developers/quickstart"
            secondaryLabel="Admin console & audit"
            secondaryTo="/features/admin"
          />

          <RelatedLinks links={[
            { label: "Quickstart", to: "/developers/quickstart" },
            { label: "Admin console", to: "/features/admin" },
            { label: "Security overview", to: "/security" },
            { label: "Open source", to: "/open-source" },
          ]} />
        </div>
      </div>
    </Layout>
  );
}
