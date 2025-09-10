import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import styles from "./SettingsAccordion.module.css";

export default function SettingRow({
  label,
  description,
  right,
  className,
}: {
  label: string;
  description?: string;
  right: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn(styles.row, className)}>
      <div className={styles.left}>
        <div className={styles.label}>
          <Label>{label}</Label>
        </div>
        {description ? <div className={styles.desc}>{description}</div> : null}
      </div>
      <div className={styles.right}>{right}</div>
    </div>
  );
}
