import type { ReactNode } from "react";
import styles from "./form-grid.module.css";

export function FormGrid({ columns = 2, children }: { columns?: 1 | 2; children: ReactNode }) {
  return (
    <div className={`${styles.grid} ${columns === 2 ? styles.cols2 : styles.cols1}`}>
      {children}
    </div>
  );
}

export function FormField({ label, children }: { label?: ReactNode; children: ReactNode }) {
  return (
    <div className={styles.field}>
      {label}
      {children}
    </div>
  );
}
