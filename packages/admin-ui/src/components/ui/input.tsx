import * as React from "react";
import { cn } from "@/lib/utils";
import styles from "./input.module.css";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, disabled, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(styles.input, disabled ? styles.disabled : "", className)}
        disabled={disabled}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };
