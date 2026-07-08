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
  const colorValue = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value) ? value : "#000000";
  return (
    <span
      className={cn(styles.root, disabled ? styles.disabled : "", className)}
      style={{ "--swatch-color": colorValue } as React.CSSProperties}
    >
      <input
        type="color"
        value={colorValue}
        onChange={(e) => onChange(e.target.value)}
        className={styles.picker}
        disabled={disabled}
        {...rest}
      />
    </span>
  );
}
