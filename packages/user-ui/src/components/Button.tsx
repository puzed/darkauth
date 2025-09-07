import type { ButtonHTMLAttributes, ReactNode } from "react";
import styles from "./Button.module.css";

type Variant = "primary" | "secondary" | "danger";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  fullWidth?: boolean;
  children: ReactNode;
}

export default function Button({
  variant = "primary",
  fullWidth,
  className,
  children,
  ...rest
}: ButtonProps) {
  const cls = [styles.button, styles[variant], fullWidth ? styles.fullWidth : "", className || ""]
    .filter(Boolean)
    .join(" ");
  return (
    <button {...rest} className={cls}>
      {children}
    </button>
  );
}
