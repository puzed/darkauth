import { X } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "./badge";
import { Button } from "./button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "./command";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import styles from "./tag-multi-select.module.css";

export interface OptionItem {
  value: string;
  label: string;
}

interface TagMultiSelectProps {
  value: string[];
  options: OptionItem[];
  placeholder?: string;
  onChange: (values: string[]) => void;
  disabled?: boolean;
}

export function TagMultiSelect({
  value,
  options,
  placeholder,
  onChange,
  disabled,
}: TagMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const selectedSet = useMemo(() => new Set(value), [value]);
  const optionsMap = useMemo(() => new Map(options.map((o) => [o.value, o.label])), [options]);
  const available = options.filter((o) => !selectedSet.has(o.value));

  const add = (val: string) => {
    if (selectedSet.has(val)) return;
    onChange([...value, val]);
    setOpen(false);
  };

  const remove = (val: string) => {
    onChange(value.filter((v) => v !== val));
  };

  return (
    <div className={styles.wrapper}>
      <div className={styles.field}>
        {value.length === 0 && (
          <div className={styles.placeholder}>{placeholder || "Select..."}</div>
        )}
        {value.map((v) => (
          <Badge
            key={v}
            variant="secondary"
            style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
          >
            {optionsMap.get(v) || v}
            <button
              type="button"
              onClick={() => remove(v)}
              disabled={disabled}
              aria-label="Remove"
              className={styles.removeButton}
            >
              <X size={14} />
            </button>
          </Badge>
        ))}
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" disabled={disabled}>
              Add
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className={styles.popoverContent}>
            <Command>
              <CommandInput placeholder="Search..." />
              <CommandList>
                <CommandEmpty>No results</CommandEmpty>
                <CommandGroup>
                  {available.map((opt) => (
                    <CommandItem key={opt.value} onSelect={() => add(opt.value)}>
                      {opt.label}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}

export default TagMultiSelect;
