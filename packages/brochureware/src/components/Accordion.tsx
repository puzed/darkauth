import { useState } from "react";
import type { ReactNode } from "react";
import styles from "./Accordion.module.css";

interface AccordionProps {
  label: string;
  badge?: string;
  children: ReactNode;
  defaultOpen?: boolean;
}

export default function Accordion({ label, badge, children, defaultOpen = false }: AccordionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={styles.accordion}>
      <button
        className={styles.header}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className={styles.label}>{label}</span>
        {badge && <span className={styles.badge}>{badge}</span>}
        <svg
          className={`${styles.chevron}${open ? ` ${styles.open}` : ""}`}
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <path d="M4 6l4 4 4-4" />
        </svg>
      </button>
      {open && <div className={styles.content}>{children}</div>}
    </div>
  );
}
