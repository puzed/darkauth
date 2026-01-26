import type { ReactNode } from "react";
import styles from "./form-actions.module.css";

type Align = "start" | "end" | "between";

export default function FormActions({
  align = "end",
  withMargin = false,
  withBottomMargin = false,
  children,
  className,
}: {
  align?: Align;
  withMargin?: boolean;
  withBottomMargin?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const alignment =
    align === "start"
      ? styles.alignStart
      : align === "between"
        ? styles.alignBetween
        : styles.alignEnd;
  const classes = [
    styles.actions,
    alignment,
    withMargin ? styles.withMargin : "",
    withBottomMargin ? styles.withBottomMargin : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return <div className={classes}>{children}</div>;
}
