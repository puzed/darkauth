import type { ReactNode } from "react";
import { Accordion } from "@/components/ui/accordion";
import styles from "./SettingsAccordion.module.css";

export default function SettingsAccordion({
  children,
  defaultValue,
}: {
  children: ReactNode;
  defaultValue?: string;
}) {
  return (
    <Accordion
      type="multiple"
      defaultValue={defaultValue ? [defaultValue] : undefined}
      className={styles.wrap}
    >
      {children}
    </Accordion>
  );
}
