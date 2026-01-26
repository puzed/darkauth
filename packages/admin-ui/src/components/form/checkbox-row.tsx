import type { ReactNode } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import styles from "./checkbox-row.module.css";

export default function CheckboxRow({
  id,
  label,
  checked,
  disabled,
  onCheckedChange,
  className,
}: {
  id: string;
  label: ReactNode;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (checked: boolean) => void;
  className?: string;
}) {
  const classes = [styles.row, className].filter(Boolean).join(" ");
  return (
    <div className={classes}>
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(value) => onCheckedChange(value === true)}
        disabled={disabled}
      />
      <Label htmlFor={id} className={styles.label}>
        {label}
      </Label>
    </div>
  );
}
