import { Slot } from "@radix-ui/react-slot";
import * as React from "react";

import { cn } from "@/lib/utils";
import styles from "./button.module.css";

type Variant = "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
type Size = "default" | "sm" | "lg" | "icon";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean;
  variant?: Variant;
  size?: Size;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant = "default", size = "default", asChild = false, disabled, ...props },
    ref
  ) => {
    const Comp = asChild ? Slot : "button";
    const classes = cn(
      styles.base,
      styles[variant],
      size === "default"
        ? styles.sizeDefault
        : size === "sm"
          ? styles.sizeSm
          : size === "lg"
            ? styles.sizeLg
            : styles.sizeIcon,
      disabled && styles.disabled,
      className
    );
    return <Comp className={classes} ref={ref} disabled={disabled} {...props} />;
  }
);
Button.displayName = "Button";

export { Button };
