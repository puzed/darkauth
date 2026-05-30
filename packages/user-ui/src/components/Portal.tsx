import type { ReactNode } from "react";
import styles from "./Portal.module.css";

export function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function PortalPage({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx(styles.page, className)}>{children}</div>;
}

export function PortalHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className={styles.header}>
      <div>
        <p className={styles.eyebrow}>{eyebrow}</p>
        <h2 className={styles.title}>{title}</h2>
        {description ? <p className={styles.description}>{description}</p> : null}
      </div>
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </header>
  );
}

export function PortalSection({
  id,
  title,
  description,
  actions,
  children,
  className,
}: {
  id?: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cx(styles.section, className)} aria-labelledby={id}>
      <div className={styles.sectionHeader}>
        <div>
          <h3 className={styles.sectionTitle} id={id}>
            {title}
          </h3>
          {description ? <p className={styles.sectionDescription}>{description}</p> : null}
        </div>
        {actions ? <div className={styles.actions}>{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function EmptyState({ title, text }: { title: ReactNode; text: ReactNode }) {
  return (
    <section className={styles.empty}>
      <h3 className={styles.emptyTitle}>{title}</h3>
      <p className={styles.emptyText}>{text}</p>
    </section>
  );
}

export function StatusPill({
  tone,
  children,
}: {
  tone: "ready" | "action" | "neutral";
  children: ReactNode;
}) {
  return <span className={cx(styles.pill, styles[tone])}>{children}</span>;
}

export { styles as portalStyles };
