import { MoreVertical } from "lucide-react";
import type { ReactNode } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import tableStyles from "@/components/ui/table.module.css";
import { cn } from "@/lib/utils";
import styles from "./row-actions.module.css";

export type RowAction = {
  key: string;
  label: string;
  icon?: ReactNode;
  destructive?: boolean;
  onClick: () => void;
  disabled?: boolean;
  children?: Array<Omit<RowAction, "children">>;
};

export default function RowActions({
  label = "Actions",
  items,
  open,
  onOpenChange,
}: {
  label?: string;
  items: RowAction[];
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const renderIcon = (icon?: ReactNode) => {
    if (!icon) {
      return null;
    }

    return (
      <>
        <span className={styles.actionIcon}>{icon}</span>
        <span className={styles.iconSpacer} />
      </>
    );
  };

  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(tableStyles.actionTrigger, open && styles.triggerOpen)}
          aria-label={label}
        >
          <MoreVertical className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className={styles.menuContent}>
        <DropdownMenuLabel className={styles.menuLabel}>{label}</DropdownMenuLabel>
        {items.map((it, idx) => (
          <div key={it.key}>
            {idx > 0 && <DropdownMenuSeparator className={styles.menuSeparator} />}
            {it.children && it.children.length > 0 ? (
              <DropdownMenuSub>
                <DropdownMenuSubTrigger className={styles.subTrigger}>
                  {renderIcon(it.icon)}
                  {it.label}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className={styles.menuSubContent}>
                  {it.children.map((child) => (
                    <DropdownMenuItem
                      key={child.key}
                      className={child.destructive ? "text-destructive" : undefined}
                      onClick={child.onClick}
                      disabled={child.disabled}
                    >
                      {renderIcon(child.icon)}
                      {child.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            ) : (
              <DropdownMenuItem
                className={it.destructive ? "text-destructive" : undefined}
                onClick={it.onClick}
                disabled={it.disabled}
              >
                {renderIcon(it.icon)}
                {it.label}
              </DropdownMenuItem>
            )}
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
