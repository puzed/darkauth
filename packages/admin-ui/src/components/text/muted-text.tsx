import type { ElementType, ReactNode } from "react";
import styles from "./muted-text.module.css";

type Size = "sm" | "xs";
type Weight = "regular" | "medium";
type Spacing = "none" | "xs" | "sm";

export default function MutedText({
  as: Component = "div",
  size = "sm",
  weight = "regular",
  spacing = "none",
  children,
  className,
}: {
  as?: ElementType;
  size?: Size;
  weight?: Weight;
  spacing?: Spacing;
  children: ReactNode;
  className?: string;
}) {
  const classes = [
    styles.text,
    size === "xs" ? styles.sizeXs : styles.sizeSm,
    weight === "medium" ? styles.weightMedium : "",
    spacing === "xs" ? styles.spacingXs : spacing === "sm" ? styles.spacingSm : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return <Component className={classes}>{children}</Component>;
}
