import { useCallback, useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
    <div>
      <PageHeader
        title="Settings"
        subtitle="Edit system settings grouped by category"
        actions={
          <Button variant="outline" onClick={load}>
            Reload
          </Button>
        }
      />

      {error && <div style={{ color: "red", margin: "16px 0" }}>{error}</div>}

      {loading ? (
        <div>Loading settings...</div>
      ) : (
        <div style={{ display: "grid", gap: 24 }}>
          {groups.map(([top, inner]) => (
            <Card key={top}>
              <CardHeader>
                <CardTitle>{top}</CardTitle>
              </CardHeader>
              <CardContent>
                <div style={{ display: "grid", gap: 24 }}>
                  {inner.map(([sub, items]) => (
                    <div key={sub}>
                      {sub !== "General" && (
                        <div style={{ fontWeight: 600, marginBottom: 8 }}>{sub}</div>
                      )}
                      <div
                        style={{
                          display: "grid",
                          gap: 16,
                          gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
                        }}
                      >
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
                            return (
                              <div key={s.key}>
                                <Label>{label}</Label>
                                {t === "boolean" ? (
                                  <div
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      gap: 8,
                                      marginTop: 8,
                                    }}
                                  >
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
                                  </div>
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
                                  <Textarea
                                    rows={8}
                                    value={String(drafts[s.key] ?? "")}
                                    onChange={(e) =>
                                      setDrafts((d) => ({ ...d, [s.key]: e.target.value }))
                                    }
                                    onBlur={() => save(s)}
                                    disabled={disabled}
                                  />
                                )}
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
