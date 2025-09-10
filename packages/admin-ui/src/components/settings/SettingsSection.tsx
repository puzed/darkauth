import type { ReactNode } from "react";
import { AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import styles from "./SettingsAccordion.module.css";

export default function SettingsSection({
  value,
  title,
  children,
}: {
  value: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <AccordionItem value={value} className={styles.item}>
      <AccordionTrigger className={styles.trigger}>{title}</AccordionTrigger>
      <AccordionContent className={styles.content}>{children}</AccordionContent>
    </AccordionItem>
  );
}
