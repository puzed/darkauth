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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import adminApiService, { type AdminSetting } from "@/services/api";

const PASSWORD_RESET_SETTINGS: AdminSetting[] = [
  {
    key: "users.password_reset_email_enabled",
    name: "Enable email password reset",
    type: "boolean",
    category: "Users / Password Reset",
    description: "Allow users to request password reset emails when SMTP sending is available.",
    tags: ["users", "password-reset"],
    defaultValue: false,
    value: false,
    secure: false,
    updatedAt: "",
  },
  {
    key: "users.password_reset_show_login_link",
    name: "Show forgot-password link",
    type: "boolean",
    category: "Users / Password Reset",
    description:
      "Show the forgot-password link on the user sign-in page when password reset is enabled.",
    tags: ["users", "password-reset"],
    defaultValue: true,
    value: true,
    secure: false,
    updatedAt: "",
  },
  {
    key: "users.password_reset_token_ttl_minutes",
    name: "Token TTL minutes",
    type: "number",
    category: "Users / Password Reset",
    description: "How long password reset links remain valid, from 5 to 1440 minutes.",
    tags: ["users", "password-reset"],
    defaultValue: 30,
    value: 30,
    secure: false,
    updatedAt: "",
  },
  {
    key: "users.password_reset_request_cooldown_minutes",
    name: "Request cooldown minutes",
    type: "number",
    category: "Users / Password Reset",
    description: "Minimum time between reset emails for the same account, from 1 to 60 minutes.",
    tags: ["users", "password-reset"],
    defaultValue: 5,
    value: 5,
    secure: false,
    updatedAt: "",
  },
  {
    key: "users.password_reset_max_requests_per_hour",
    name: "Max requests per hour",
    type: "number",
    category: "Users / Password Reset",
    description: "Maximum reset email requests per account each hour, from 1 to 20.",
    tags: ["users", "password-reset"],
    defaultValue: 3,
    value: 3,
    secure: false,
    updatedAt: "",
  },
];

const SCIM_SETTINGS: AdminSetting[] = [
  {
    key: "users.scim.only_provisioned_sign_in",
    name: "Only SCIM users may sign in",
    type: "boolean",
    category: "Users / SCIM Policy",
    description: "Allow sign-in only for users provisioned by SCIM.",
    tags: ["users", "scim", "policy"],
    defaultValue: false,
    value: false,
    secure: false,
    updatedAt: "",
  },
  {
    key: "users.scim.require_key_unlock_for_zk",
    name: "Require key unlock for ZK clients",
    type: "boolean",
    category: "Users / SCIM Policy",
    description: "Require SCIM-managed users to set up an encryption unlock method for ZK clients.",
    tags: ["users", "scim", "policy"],
    defaultValue: true,
    value: true,
    secure: false,
    updatedAt: "",
  },
  {
    key: "users.scim.allow_password_envelopes",
    name: "Allow password unlock envelopes",
    type: "boolean",
    category: "Users / SCIM Policy",
    description: "Let SCIM-managed users create password-based encryption unlock envelopes.",
    tags: ["users", "scim", "key-management"],
    defaultValue: true,
    value: true,
    secure: false,
    updatedAt: "",
  },
  {
    key: "users.scim.allow_passkey_prf_envelopes",
    name: "Allow PRF passkey unlock",
    type: "boolean",
    category: "Users / SCIM Policy",
    description: "Let SCIM-managed users create passkey PRF encryption unlock envelopes.",
    tags: ["users", "scim", "key-management", "passkeys"],
    defaultValue: true,
    value: true,
    secure: false,
    updatedAt: "",
  },
  {
    key: "users.scim.allow_trusted_device_approval",
    name: "Allow trusted-device approval",
    type: "boolean",
    category: "Users / SCIM Policy",
    description: "Let unlocked trusted devices approve encrypted key access on new browsers.",
    tags: ["users", "scim", "key-management", "devices"],
    defaultValue: true,
    value: true,
    secure: false,
    updatedAt: "",
  },
  {
    key: "users.scim.deprovision_action",
    name: "Deprovision action",
    type: "string",
    category: "Users / SCIM Policy",
    description: "Choose how SCIM delete or active=false affects DarkAuth users.",
    tags: ["users", "scim", "deprovisioning"],
    defaultValue: "suspend",
    value: "suspend",
    secure: false,
    updatedAt: "",
  },
  {
    key: "users.scim.unknown_group_policy",
    name: "Unknown group policy",
    type: "string",
    category: "Users / SCIM Mapping",
    description: "Choose what happens when SCIM sends a group without a mapping.",
    tags: ["users", "scim", "mapping"],
    defaultValue: "ignore",
    value: "ignore",
    secure: false,
    updatedAt: "",
  },
  {
    key: "users.scim.group_role_mappings",
    name: "Group and role mappings",
    type: "object",
    category: "Users / SCIM Mapping",
    description:
      "Map SCIM group display names or external IDs to DarkAuth groups, roles, or organizations.",
    tags: ["users", "scim", "mapping"],
    defaultValue: { mappings: [] },
    value: { mappings: [] },
    secure: false,
    updatedAt: "",
  },
];

const LOCAL_SETTINGS: AdminSetting[] = [...PASSWORD_RESET_SETTINGS, ...SCIM_SETTINGS];

const NUMBER_LIMITS: Record<string, { min: number; max: number }> = {
  "users.password_reset_token_ttl_minutes": { min: 5, max: 1440 },
  "users.password_reset_request_cooldown_minutes": { min: 1, max: 60 },
  "users.password_reset_max_requests_per_hour": { min: 1, max: 20 },
};

const ENUM_OPTIONS: Record<string, Array<{ value: string; label: string }>> = {
  "users.scim.deprovision_action": [
    { value: "suspend", label: "Suspend user" },
    { value: "delete", label: "Delete user" },
  ],
  "users.scim.unknown_group_policy": [
    { value: "ignore", label: "Ignore group" },
    { value: "create", label: "Create group" },
    { value: "reject", label: "Reject update" },
  ],
};

function withLocalSettings(settings: AdminSetting[]): AdminSetting[] {
  const byKey = new Map(settings.map((setting) => [setting.key, setting]));
  return [
    ...settings.map((setting) => {
      const fallback = LOCAL_SETTINGS.find((item) => item.key === setting.key);
      return fallback
        ? {
            ...fallback,
            ...setting,
            name: setting.name || fallback.name,
            type: setting.type || fallback.type,
            category: setting.category || fallback.category,
            description: setting.description || fallback.description,
            tags: setting.tags || fallback.tags,
            defaultValue: setting.defaultValue ?? fallback.defaultValue,
          }
        : setting;
    }),
    ...LOCAL_SETTINGS.filter((setting) => !byKey.has(setting.key)),
  ];
}

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
  const [adminRole, setAdminRole] = useState<"read" | "write">("read");
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
      const [settingsResponse, sessionResponse] = await Promise.all([
        adminApiService.getSettings(),
        adminApiService.getAdminSession(),
      ]);
      const settings = withLocalSettings(settingsResponse.settings);
      setAdminRole(sessionResponse.role || "read");
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

  const smtpUnavailable = useMemo(() => {
    const readString = (key: string) => {
      const v = drafts[key];
      return typeof v === "string" ? v.trim() : "";
    };
    const portRaw = drafts["email.smtp.port"];
    const port =
      typeof portRaw === "number" ? portRaw : typeof portRaw === "string" ? Number(portRaw) : 0;
    const values = {
      from: readString("email.from"),
      transport: readString("email.transport"),
      host: readString("email.smtp.host"),
      user: readString("email.smtp.user"),
      password: readString("email.smtp.password"),
      port,
    };
    return (
      drafts["email.smtp.enabled"] !== true ||
      !values.from ||
      values.transport !== "smtp" ||
      !values.host ||
      !values.user ||
      !values.password ||
      !Number.isInteger(values.port) ||
      values.port < 1 ||
      values.port > 65535
    );
  }, [drafts]);

  const sendTestEmail = async () => {
    try {
      await adminApiService.sendSettingsTestEmail();
      toast({ title: "Sent", description: "Test email sent to your admin address" });
    } catch (e) {
      toast({
        title: "Error",
        description: e instanceof Error ? e.message : "Failed to send test email",
        variant: "destructive",
      });
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
                {top === "Email" && (
                  <div className={settingsStyles.rows}>
                    <SettingRow
                      label="Email verification flow"
                      description="Send a test email to check if your SMTP settings are working"
                      right={
                        <Button
                          onClick={sendTestEmail}
                          disabled={adminRole === "read" || smtpUnavailable}
                        >
                          Send test email
                        </Button>
                      }
                    />
                  </div>
                )}
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
                          const enablePasswordResetBlocked =
                            s.key === "users.password_reset_email_enabled" &&
                            smtpUnavailable &&
                            !drafts[s.key];
                          const disabled =
                            adminRole === "read" ||
                            savingKey === s.key ||
                            (s.secure && s.value === "[REDACTED]") ||
                            enablePasswordResetBlocked;
                          const isObject = t === "object";
                          const enumOptions = ENUM_OPTIONS[s.key];
                          const atDefault = isObject
                            ? JSON.stringify(s.value) === JSON.stringify(s.defaultValue)
                            : false;
                          return (
                            <SettingRow
                              key={s.key}
                              label={label}
                              description={
                                enablePasswordResetBlocked
                                  ? "Complete and enable SMTP settings before enabling email password reset."
                                  : s.description || undefined
                              }
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
                                        .catch((e) => {
                                          setDrafts((d) => ({ ...d, [s.key]: s.value }));
                                          toast({
                                            title: "Error",
                                            description:
                                              e instanceof Error ? e.message : "Failed to save",
                                            variant: "destructive",
                                          });
                                        });
                                    }}
                                    disabled={disabled}
                                  />
                                ) : t === "number" ? (
                                  <Input
                                    type="number"
                                    min={NUMBER_LIMITS[s.key]?.min}
                                    max={NUMBER_LIMITS[s.key]?.max}
                                    value={String(drafts[s.key] ?? "")}
                                    onChange={(e) =>
                                      setDrafts((d) => ({ ...d, [s.key]: e.target.value }))
                                    }
                                    onBlur={() => save(s)}
                                    disabled={disabled}
                                  />
                                ) : enumOptions ? (
                                  <Select
                                    value={String(drafts[s.key] ?? s.defaultValue ?? "")}
                                    onValueChange={(value) => {
                                      setDrafts((d) => ({ ...d, [s.key]: value }));
                                      adminApiService
                                        .updateSetting(s.key, value)
                                        .then(() => toast({ title: "Saved", description: s.key }))
                                        .catch((e) => {
                                          setDrafts((d) => ({ ...d, [s.key]: s.value }));
                                          toast({
                                            title: "Error",
                                            description:
                                              e instanceof Error ? e.message : "Failed to save",
                                            variant: "destructive",
                                          });
                                        });
                                    }}
                                    disabled={disabled}
                                  >
                                    <SelectTrigger>
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {enumOptions.map((option) => (
                                        <SelectItem key={option.value} value={option.value}>
                                          {option.label}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
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
