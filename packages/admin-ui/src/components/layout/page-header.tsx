import type { ReactNode } from "react";
import styles from "./page-header.module.css";

export default function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className={styles.header}>
      <div className={styles.titleBlock}>
        <h1>{title}</h1>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      <div className={styles.actions}>{actions}</div>
    </div>
  );
}
