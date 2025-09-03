import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { Check } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";
import styles from "./checkbox.module.css";

const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, disabled, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(styles.root, disabled ? styles.disabled : "", className)}
    disabled={disabled}
    {...props}
  >
    <CheckboxPrimitive.Indicator className={styles.indicator}>
      <Check width={14} height={14} />
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
));
Checkbox.displayName = CheckboxPrimitive.Root.displayName;

export { Checkbox };
