import type { ReactNode } from "react";
import styles from "./stats-card.module.css";

export function StatsGrid({ children }: { children: ReactNode }) {
  return <div className={styles.grid}>{children}</div>;
}

export default function StatsCard({
  title,
  icon,
  value,
  description,
}: {
  title: string;
  icon?: ReactNode;
  value: ReactNode;
  description?: string;
}) {
  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <h3 className={styles.title}>{title}</h3>
        {icon ? <div className={styles.icon}>{icon}</div> : null}
      </div>
      <div className={styles.content}>
        <div className={styles.number}>{value}</div>
        {description ? <p className={styles.desc}>{description}</p> : null}
      </div>
    </div>
  );
}
