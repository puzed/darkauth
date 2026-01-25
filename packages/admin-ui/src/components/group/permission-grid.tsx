import MutedText from "@/components/text/muted-text";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import type { Permission } from "@/services/api";
import styles from "./permission-grid.module.css";

export default function PermissionGrid({
  permissions,
  selected,
  onToggle,
  disabled = false,
  loading = false,
}: {
  permissions: Permission[];
  selected: string[];
  onToggle: (key: string, next: boolean) => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  if (loading) return <div>Loading permissions...</div>;

  if (permissions.length === 0) {
    return <div className={styles.empty}>No permissions available</div>;
  }

  return (
    <div>
      <div className={styles.grid}>
        {permissions.map((permission) => {
          const isSelected = selected.includes(permission.key);
          return (
            <div
              key={permission.key}
              className={`${styles.card} ${isSelected ? styles.cardSelected : ""}`}
            >
              <Checkbox
                id={`permission-${permission.key}`}
                checked={isSelected}
                onCheckedChange={(checked) => onToggle(permission.key, checked === true)}
                disabled={disabled}
              />
              <div className={styles.cardBody}>
                <Label htmlFor={`permission-${permission.key}`} className={styles.label}>
                  {permission.key}
                </Label>
                {permission.description ? (
                  <MutedText size="sm" spacing="xs">
                    {permission.description}
                  </MutedText>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {selected.length > 0 ? (
        <div className={styles.summary}>
          <MutedText size="sm" weight="medium" spacing="none">
            Selected permissions ({selected.length}):
          </MutedText>
          <MutedText size="sm" spacing="xs">
            {selected.join(", ")}
          </MutedText>
        </div>
      ) : null}
    </div>
  );
}
