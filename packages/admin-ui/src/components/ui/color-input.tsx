import type * as React from "react";
import { cn } from "@/lib/utils";
import styles from "./color-input.module.css";

type Props = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
};

export function ColorInput({ value, onChange, disabled, className, ...rest }: Props) {
  return (
    <span
      className={cn(styles.root, disabled ? styles.disabled : "", className)}
      style={{ "--swatch-color": value } as React.CSSProperties}
    >
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={styles.picker}
        disabled={disabled}
        {...rest}
      />
    </span>
  );
}
