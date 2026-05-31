import { Link } from "react-router-dom";
import styles from "./CTABlock.module.css";

interface CTABlockProps {
  title?: string;
  desc?: string;
  showDocker?: boolean;
  primaryLabel?: string;
  primaryTo?: string;
  primaryHref?: string;
  secondaryLabel?: string;
  secondaryTo?: string;
  secondaryHref?: string;
}

const DOCKER_CMD = "docker run -d -p 9080:9080 -p 9081:9081 ghcr.io/puzed/darkauth:latest";

export default function CTABlock({
  title = "Run it with Docker",
  desc = "One command. Postgres or embedded database. Full OIDC in minutes.",
  showDocker = true,
  primaryLabel = "Read the quickstart",
  primaryTo = "/developers/quickstart",
  primaryHref,
  secondaryLabel = "Browse the source",
  secondaryTo,
  secondaryHref = "https://github.com/puzed/darkauth",
}: CTABlockProps) {
  return (
    <div className={styles.block}>
      <h3 className={styles.title}>{title}</h3>
      <p className={styles.desc}>{desc}</p>
      {showDocker && <code className={styles.code}>{DOCKER_CMD}</code>}
      <div className={styles.actions}>
        {primaryHref ? (
          <a href={primaryHref} className={styles.btnPrimary} target="_blank" rel="noopener noreferrer">
            {primaryLabel}
          </a>
        ) : (
          <Link to={primaryTo ?? "/developers/quickstart"} className={styles.btnPrimary}>
            {primaryLabel}
          </Link>
        )}
        {secondaryHref ? (
          <a href={secondaryHref} className={styles.btnGhost} target="_blank" rel="noopener noreferrer">
            {secondaryLabel}
          </a>
        ) : secondaryTo ? (
          <Link to={secondaryTo} className={styles.btnGhost}>
            {secondaryLabel}
          </Link>
        ) : null}
      </div>
    </div>
  );
}
