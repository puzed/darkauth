import type { ReactNode } from "react";
import styles from "./error-banner.module.css";

export default function ErrorBanner({
  children,
  withMargin = false,
  className,
}: {
  children: ReactNode;
  withMargin?: boolean;
  className?: string;
}) {
  const classes = [styles.banner, withMargin ? styles.withMargin : "", className]
    .filter(Boolean)
    .join(" ");
  return <div className={classes}>{children}</div>;
}
