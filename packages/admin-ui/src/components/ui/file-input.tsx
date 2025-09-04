import * as React from "react";
import { cn } from "@/lib/utils";
import styles from "./file-input.module.css";

type Props = React.ComponentProps<"input">;

const FileInput = React.forwardRef<HTMLInputElement, Props>(
  ({ className, disabled, ...props }, ref) => {
    return (
      <input
        type="file"
        className={cn(styles.root, disabled ? styles.disabled : "", className)}
        disabled={disabled}
        ref={ref}
        {...props}
      />
    );
  }
);

FileInput.displayName = "FileInput";

export { FileInput };
