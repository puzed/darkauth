import { useCallback, useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/layout/page-header";
import SettingRow from "@/components/settings/SettingRow";
import SettingsAccordion from "@/components/settings/SettingsAccordion";
import settingsStyles from "@/components/settings/SettingsAccordion.module.css";
import SettingsSection from "@/components/settings/SettingsSection";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import adminApiService, { type AdminSetting } from "@/services/api";

function toLabel(key: string, name?: string | null) {
  if (name?.trim()) return name;
  return key.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
}

function inferType(s: AdminSetting): "string" | "number" | "boolean" | "object" {
  if (s.type) {
    const t = s.type.toLowerCase();
    if (t === "string") return "string";
    if (t === "number") return "number";
    if (t === "boolean") return "boolean";
    if (t === "object") return "object";
  }
  const v = s.value;
  if (typeof v === "boolean") return "boolean";
  if (typeof v === "number") return "number";
  if (typeof v === "string") return "string";
  return "object";
}

export default function Settings() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [settings, setSettings] = useState<AdminSetting[]>([]);
  const [drafts, setDrafts] = useState<Record<string, unknown>>({});
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<AdminSetting | null>(null);
  const [editJson, setEditJson] = useState<string>("");
  const [editSaving, setEditSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const { settings } = await adminApiService.getSettings();
      setSettings(settings);
      const d: Record<string, unknown> = {};
      for (const s of settings) {
        const t = inferType(s);
        if (t === "object") d[s.key] = JSON.stringify(s.value, null, 2);
        else d[s.key] = s.value as unknown;
      }
      setDrafts(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const groups = useMemo(() => {
    const outer = new Map<string, Map<string, AdminSetting[]>>();
    for (const s of settings) {
      const cat = s.category || "Other";
      const parts = cat.split("/").map((p) => p.trim());
      const top = parts[0] || "Other";
      const sub = parts.slice(1).join(" / ") || "General";
      if (!outer.has(top)) outer.set(top, new Map());
      let inner = outer.get(top);
      if (!inner) {
        inner = new Map();
        outer.set(top, inner);
      }
      const list = inner.get(sub) ?? [];
      list.push(s);
      inner.set(sub, list);
    }
    return Array.from(outer.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(
        ([top, inner]) =>
          [top, Array.from(inner.entries()).sort((a, b) => a[0].localeCompare(b[0]))] as const
      );
  }, [settings]);

  const save = async (s: AdminSetting) => {
    const t = inferType(s);
    try {
      setSavingKey(s.key);
      let val: unknown = drafts[s.key];
      if (t === "number") {
        const num = typeof val === "string" ? Number(val) : (val as number);
        if (Number.isNaN(num)) throw new Error("Invalid number");
        val = num;
      } else if (t === "boolean") {
        val = Boolean(val);
      } else if (t === "object") {
        if (typeof val !== "string") val = JSON.stringify(val);
        val = JSON.parse(val as string);
      } else if (t === "string") {
        val = String(val ?? "");
      }
      await adminApiService.updateSetting(s.key, val);
      toast({ title: "Saved", description: s.key });
    } catch (e) {
      toast({
        title: "Error",
        description: e instanceof Error ? e.message : "Failed to save",
        variant: "destructive",
      });
      return;
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <div className={settingsStyles.pageContainer}>
      <PageHeader
        title="Settings"
        subtitle="Configure your application settings organized by category"
      />

      {error && (
        <div className={settingsStyles.errorAlert}>
          <div className={settingsStyles.errorIcon}>⚠️</div>
          <div>{error}</div>
        </div>
      )}

      {loading ? (
        <div className={settingsStyles.loadingContainer}>
          <div className={settingsStyles.loadingSpinner}></div>
          <div>Loading settings...</div>
        </div>
      ) : (
        <SettingsAccordion defaultValue={groups[0]?.[0]}>
          {groups.map(([top, inner]) => (
            <SettingsSection key={top} value={top} title={top}>
              <div className={settingsStyles.inner}>
                {inner.map(([sub, items]) => (
                  <div key={sub}>
                    {sub !== "General" && <div className={settingsStyles.subHeading}>{sub}</div>}
                    <div className={settingsStyles.rows}>
                      {items
                        .slice()
                        .sort((a, b) =>
                          toLabel(a.key, a.name).localeCompare(toLabel(b.key, b.name))
                        )
                        .map((s) => {
                          const t = inferType(s);
                          const label = toLabel(s.key, s.name);
                          const disabled =
                            savingKey === s.key || (s.secure && s.value === "[REDACTED]");
                          const isObject = t === "object";
                          const atDefault = isObject
                            ? JSON.stringify(s.value) === JSON.stringify(s.defaultValue)
                            : false;
                          return (
                            <SettingRow
                              key={s.key}
                              label={label}
                              description={s.description || undefined}
                              className={savingKey === s.key ? settingsStyles.saving : undefined}
                              right={
                                t === "boolean" ? (
                                  <Checkbox
                                    checked={Boolean(drafts[s.key])}
                                    onCheckedChange={(v) => {
                                      setDrafts((d) => ({ ...d, [s.key]: !!v }));
                                      adminApiService
                                        .updateSetting(s.key, !!v)
                                        .then(() => toast({ title: "Saved", description: s.key }))
                                        .catch((e) =>
                                          toast({
                                            title: "Error",
                                            description:
                                              e instanceof Error ? e.message : "Failed to save",
                                            variant: "destructive",
                                          })
                                        );
                                    }}
                                    disabled={disabled}
                                  />
                                ) : t === "number" ? (
                                  <Input
                                    type="number"
                                    value={String(drafts[s.key] ?? "")}
                                    onChange={(e) =>
                                      setDrafts((d) => ({ ...d, [s.key]: e.target.value }))
                                    }
                                    onBlur={() => save(s)}
                                    disabled={disabled}
                                  />
                                ) : t === "string" ? (
                                  <Input
                                    value={String(drafts[s.key] ?? "")}
                                    onChange={(e) =>
                                      setDrafts((d) => ({ ...d, [s.key]: e.target.value }))
                                    }
                                    onBlur={() => save(s)}
                                    disabled={disabled}
                                  />
                                ) : (
                                  <div className={settingsStyles.actions}>
                                    <Button
                                      variant="outline"
                                      onClick={() => {
                                        setEditing(s);
                                        setEditJson(JSON.stringify(s.value, null, 2));
                                        setEditOpen(true);
                                      }}
                                      disabled={disabled}
                                    >
                                      Edit
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      onClick={async () => {
                                        try {
                                          setSavingKey(s.key);
                                          await adminApiService.updateSetting(
                                            s.key,
                                            s.defaultValue
                                          );
                                          toast({ title: "Reset", description: s.key });
                                          await load();
                                        } catch (e) {
                                          toast({
                                            title: "Error",
                                            description:
                                              e instanceof Error ? e.message : "Failed to reset",
                                            variant: "destructive",
                                          });
                                        } finally {
                                          setSavingKey(null);
                                        }
                                      }}
                                      disabled={disabled || atDefault}
                                    >
                                      Reset
                                    </Button>
                                  </div>
                                )
                              }
                            />
                          );
                        })}
                    </div>
                  </div>
                ))}
              </div>
            </SettingsSection>
          ))}
        </SettingsAccordion>
      )}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className={settingsStyles.dialogContent}>
          <DialogHeader>
            <DialogTitle>Edit JSON</DialogTitle>
            <DialogDescription>{editing?.key}</DialogDescription>
          </DialogHeader>
          <Textarea
            rows={16}
            value={editJson}
            onChange={(e) => setEditJson(e.target.value)}
            disabled={editSaving}
          />
          <div className={settingsStyles.dialogActions}>
            <Button variant="outline" onClick={() => setEditOpen(false)} disabled={editSaving}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                if (!editing) return;
                try {
                  setEditSaving(true);
                  const parsed = JSON.parse(editJson);
                  await adminApiService.updateSetting(editing.key, parsed);
                  setEditOpen(false);
                  toast({ title: "Saved", description: editing.key });
                  await load();
                } catch (e) {
                  toast({
                    title: "Error",
                    description: e instanceof Error ? e.message : "Invalid JSON",
                    variant: "destructive",
                  });
                } finally {
                  setEditSaving(false);
                }
              }}
              disabled={editSaving}
            >
              Save
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
