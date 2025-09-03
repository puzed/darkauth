import { MoreHorizontal } from "lucide-react";
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
import tableStyles from "./table.module.css";

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
}: {
  label?: string;
  items: RowAction[];
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className={tableStyles.actionTrigger} aria-label={label}>
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        {items.map((it, idx) => (
          <div key={it.key}>
            {idx > 0 && <DropdownMenuSeparator />}
            {it.children && it.children.length > 0 ? (
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  {it.icon}
                  {it.icon ? <span style={{ width: 8 }} /> : null}
                  {it.label}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  {it.children.map((child) => (
                    <DropdownMenuItem
                      key={child.key}
                      className={child.destructive ? "text-destructive" : undefined}
                      onClick={child.onClick}
                      disabled={child.disabled}
                    >
                      {child.icon}
                      {child.icon ? <span style={{ width: 8 }} /> : null}
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
                {it.icon}
                {it.icon ? <span style={{ width: 8 }} /> : null}
                {it.label}
              </DropdownMenuItem>
            )}
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
