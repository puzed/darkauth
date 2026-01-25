import type { ReactNode } from "react";
import styles from "./stack.module.css";

type Gap = "sm" | "md" | "lg";

export default function Stack({
  gap = "lg",
  children,
  className,
}: {
  gap?: Gap;
  children: ReactNode;
  className?: string;
}) {
  const gapClass = gap === "sm" ? styles.gapSm : gap === "md" ? styles.gapMd : styles.gapLg;
  const classes = [styles.stack, gapClass, className].filter(Boolean).join(" ");
  return <div className={classes}>{children}</div>;
}
