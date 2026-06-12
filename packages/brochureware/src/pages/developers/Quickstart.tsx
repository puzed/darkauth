import Layout from "../../components/Layout";
import PageHero from "../../components/PageHero";
import CodeBlock from "../../components/CodeBlock";
import RelatedLinks from "../../components/RelatedLinks";
import styles from "./Quickstart.module.css";

const DOCKER_CMD = "docker run -d -p 9080:9080 -p 9081:9081 ghcr.io/puzed/darkauth:latest";
const DOCKER_POSTGRES = `docker run -d -p 9080:9080 -p 9081:9081 \\
  -e DATABASE_URL=postgresql://user:pass@host:5432/darkauth \\
  ghcr.io/puzed/darkauth:latest`;

const DEV_MODE = `# Clone the repository
git clone https://github.com/puzed/darkauth.git
cd darkauth

# Install dependencies
pnpm install

# Run all services (API + user UI + admin UI)
pnpm dev`;

const OIDC_CONFIG = `// Use any OIDC library — this example uses generic OAuth 2.0 / OIDC
const issuer = "http://localhost:9080";
const clientId = "demo-public";  // pre-configured public client
const redirectUri = "http://localhost:3000/callback";

// Discovery URL:
// GET http://localhost:9080/api/.well-known/openid-configuration`;

const STEPS = [
  {
    num: "1",
    title: "Run the Docker image",
    body: "One command starts DarkAuth with an embedded PGLite database — no Postgres setup needed for a trial.",
    code: DOCKER_CMD,
    lang: "bash",
    note: "For production, connect to a PostgreSQL 15+ database:",
    code2: DOCKER_POSTGRES,
    lang2: "bash (with Postgres)",
  },
  {
    num: "2",
    title: "Open the installer at :9081",
    body: "Visit http://localhost:9081 in your browser. The first-run installer (gated by a single-use token printed in the container logs) walks you through:",
    bullets: [
      "Database choice: embedded PGLite or external Postgres",
      "KEK passphrase: encrypts private signing keys and client secrets at rest",
      "Admin user: creates your first admin account via OPAQUE",
    ],
    code: null,
    lang: null,
  },
  {
    num: "3",
    title: "Register a client",
    body: 'In the admin console → Clients → New Client. For a standard SPA: type "public", PKCE required, add your redirect URI. A demo public client is pre-configured (client_id: "demo-public").',
    code: OIDC_CONFIG,
    lang: "JavaScript",
  },
  {
    num: "4",
    title: "Point your app at discovery",
    body: "Use your OIDC library's discovery-based configuration. DarkAuth's discovery endpoint returns all URLs — you only need the issuer.",
    bullets: [
      "Discovery: GET /api/.well-known/openid-configuration",
      "JWKS: GET /api/.well-known/jwks.json",
      "Authorize: GET /api/authorize",
      "Token: POST /api/token",
      "UserInfo: GET /api/userinfo",
    ],
    code: null,
    lang: null,
  },
  {
    num: "5",
    title: "Done",
    body: "Users can now register and log in. The user portal is at :9080. The admin console is at :9081. No further configuration required for basic OIDC.",
    code: null,
    lang: null,
  },
];

export default function Quickstart() {
  return (
    <Layout>
      <PageHero
        eyebrow="Quickstart"
        title="Running in 5 minutes."
        sub="One Docker command, a browser-based installer, and you have a working OIDC provider."
      />
      <div className="container">
        <div className={styles.page}>
          {STEPS.map((step) => (
            <section key={step.num} className={styles.step}>
              <div className={styles.stepNum}>{step.num}</div>
              <div className={styles.stepBody}>
                <h2 className={styles.stepTitle}>{step.title}</h2>
                <p className={styles.stepDesc}>{step.body}</p>
                {"bullets" in step && step.bullets && (
                  <ul className={styles.bullets}>
                    {step.bullets.map((b) => <li key={b}>{b}</li>)}
                  </ul>
                )}
                {step.code && <CodeBlock code={step.code} lang={step.lang ?? undefined} />}
                {"note" in step && step.note && <p className={styles.note}>{step.note}</p>}
                {"code2" in step && step.code2 && <CodeBlock code={step.code2} lang={step.lang2 ?? undefined} />}
              </div>
            </section>
          ))}

          <section className={styles.devMode}>
            <h2>Dev mode (monorepo)</h2>
            <p>If you're working on DarkAuth itself or the demo app:</p>
            <CodeBlock code={DEV_MODE} lang="bash" />
            <p>This starts Vite for the user UI (port 5173), admin UI (port 5174), and the API (port 9080/9081) concurrently.</p>
          </section>

          <RelatedLinks links={[
            { label: "SDK reference", to: "/developers/sdk" },
            { label: "OIDC endpoint reference", to: "/developers/oidc" },
            { label: "Self-host guide", to: "/self-host" },
          ]} />
        </div>
      </div>
    </Layout>
  );
}
