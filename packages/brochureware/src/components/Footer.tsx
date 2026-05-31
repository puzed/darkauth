import { Link } from "react-router-dom";
import styles from "./Footer.module.css";

export default function Footer() {
  return (
    <footer className={styles.footer}>
      <div className="container">
        <div className={styles.grid}>
          <div className={styles.col}>
            <h4 className={styles.colHead}>Product</h4>
            <nav>
              <Link to="/features" className={styles.footLink}>Features</Link>
              <Link to="/how-it-works" className={styles.footLink}>How it works</Link>
              <Link to="/security" className={styles.footLink}>Security</Link>
              <Link to="/use-cases" className={styles.footLink}>Use cases</Link>
              <Link to="/self-host" className={styles.footLink}>Self-host</Link>
            </nav>
          </div>
          <div className={styles.col}>
            <h4 className={styles.colHead}>Developers</h4>
            <nav>
              <Link to="/developers/quickstart" className={styles.footLink}>Quickstart</Link>
              <Link to="/developers/sdk" className={styles.footLink}>SDK</Link>
              <Link to="/developers/oidc" className={styles.footLink}>OIDC reference</Link>
              <a href="https://github.com/puzed/darkauth/tree/main/packages/demo-app" className={styles.footLink} target="_blank" rel="noopener noreferrer">Demo app</a>
            </nav>
          </div>
          <div className={styles.col}>
            <h4 className={styles.colHead}>Project</h4>
            <nav>
              <Link to="/open-source" className={styles.footLink}>Open source</Link>
              <a href="https://github.com/puzed/darkauth/blob/main/LICENSE" className={styles.footLink} target="_blank" rel="noopener noreferrer">License (AGPL-3.0)</a>
              <a href="https://release.darkauth.com/changelog.json" className={styles.footLink} target="_blank" rel="noopener noreferrer">Changelog</a>
              <a href="https://github.com/puzed/darkauth" className={styles.footLink} target="_blank" rel="noopener noreferrer">GitHub</a>
            </nav>
          </div>
          <div className={styles.col}>
            <h4 className={styles.colHead}>Resources</h4>
            <nav>
              <Link to="/security/whitepaper" className={styles.footLink}>Security whitepaper</Link>
              <Link to="/security/zero-knowledge" className={styles.footLink}>ZK extension</Link>
              <a href="https://github.com/puzed/darkauth/tree/main/docs" className={styles.footLink} target="_blank" rel="noopener noreferrer">Docs</a>
              <a href="https://github.com/puzed/darkauth/security" className={styles.footLink} target="_blank" rel="noopener noreferrer">Security contact</a>
            </nav>
          </div>
        </div>
        <div className={styles.bottom}>
          <p className={styles.bottomText}>
            DarkAuth is open source under <strong>AGPL-3.0</strong>. Self-host it forever, free.
          </p>
          <code className={styles.dockerPull}>
            docker pull ghcr.io/puzed/darkauth:latest
          </code>
        </div>
      </div>
    </footer>
  );
}
