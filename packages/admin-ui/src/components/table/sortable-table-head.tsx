import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { TableHead } from "@/components/ui/table";
import styles from "@/components/ui/table.module.css";
import { cn } from "@/lib/utils";
import type { SortOrder } from "@/services/api";

export default function SortableTableHead({
  label,
  isActive,
  sortOrder,
  onToggle,
  className,
}: {
  label: string;
  isActive: boolean;
  sortOrder: SortOrder;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <TableHead className={className}>
      <button
        type="button"
        className={cn(styles.headButton, isActive && styles.headButtonActive)}
        onClick={onToggle}
      >
        <span>{label}</span>
        {isActive ? (
          sortOrder === "asc" ? (
            <ArrowUp size={14} />
          ) : (
            <ArrowDown size={14} />
          )
        ) : (
          <ArrowUpDown size={14} />
        )}
      </button>
    </TableHead>
  );
}
