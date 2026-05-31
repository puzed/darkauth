import { Link } from "react-router-dom";
import styles from "./RelatedLinks.module.css";

interface RelatedLink {
  label: string;
  to?: string;
  href?: string;
}

interface RelatedLinksProps {
  links: RelatedLink[];
}

export default function RelatedLinks({ links }: RelatedLinksProps) {
  return (
    <div className={styles.block}>
      <p className={styles.title}>Related</p>
      <div className={styles.links}>
        {links.map((link) =>
          link.href ? (
            <a key={link.href} href={link.href} className={styles.link} target="_blank" rel="noopener noreferrer">
              {link.label} →
            </a>
          ) : (
            <Link key={link.to} to={link.to ?? "/"} className={styles.link}>
              {link.label} →
            </Link>
          )
        )}
      </div>
    </div>
  );
}
