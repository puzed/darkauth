import {
  CheckCircle,
  FileText,
  KeyRound,
  Plus,
  Shield,
  Sparkles,
  Users as UsersIcon,
} from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useState } from "react";
import changelogStyles from "@/components/changelog.module.css";
import PageHeader from "@/components/layout/page-header";
import StatsCard, { StatsGrid } from "@/components/stats-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import styles from "@/pages/Dashboard.module.css";
import adminApiService, {
  type AuditLog,
  type Client,
  type JwksInfo,
  type SystemSettings,
  type User,
} from "@/services/api";

type ChangelogEntry = {
  date: string;
  title: string;
  changes: string[];
  filename: string;
};

const CURRENT_APP_VERSION = (import.meta.env.VITE_APP_VERSION || "").trim();

function normalizeVersionTag(value: string): string {
  return value.trim().replace(/^v/i, "");
}

function parseVersion(value: string): {
  major: number;
  minor: number;
  patch: number;
  prerelease: string;
} | null {
  const match = value
    .trim()
    .match(/^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/);
  if (!match) return null;
  return {
    major: Number.parseInt(match[1], 10),
    minor: Number.parseInt(match[2] || "0", 10),
    patch: Number.parseInt(match[3] || "0", 10),
    prerelease: match[4] || "",
  };
}

function compareVersions(a: string, b: string): number {
  const parsedA = parseVersion(a);
  const parsedB = parseVersion(b);
  if (!parsedA || !parsedB) return 0;
  if (parsedA.major !== parsedB.major) return parsedA.major > parsedB.major ? 1 : -1;
  if (parsedA.minor !== parsedB.minor) return parsedA.minor > parsedB.minor ? 1 : -1;
  if (parsedA.patch !== parsedB.patch) return parsedA.patch > parsedB.patch ? 1 : -1;
  if (!parsedA.prerelease && parsedB.prerelease) return 1;
  if (parsedA.prerelease && !parsedB.prerelease) return -1;
  return parsedA.prerelease.localeCompare(parsedB.prerelease);
}

export default function Dashboard() {
  const [users, setUsers] = useState<User[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [jwks, setJwks] = useState<JwksInfo | null>(null);
  const [_settings, setSettings] = useState<SystemSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [_error, setError] = useState<string | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [changelogEntry, setChangelogEntry] = useState<ChangelogEntry | null>(null);
  const [newerVersion, setNewerVersion] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [u, c, s, k, a] = await Promise.all([
        adminApiService.getUsers(),
        adminApiService.getClients(),
        adminApiService.getSettings(),
        adminApiService.getJwks(),
        adminApiService.getAuditLogs({ page: 1, limit: 5 }),
      ]);
      setUsers(u);
      setClients(c);
      setSettings(s);
      setJwks(k);
      setAuditLogs(a.auditLogs || []);

      try {
        const res = await fetch("https://release.darkauth.com/changelog.json");
        if (res.ok) {
          const data = await res.json();
          const entries = (data.entries || []) as ChangelogEntry[];
          const selectedEntry = entries.find(
            (entry) => normalizeVersionTag(entry.title) === normalizeVersionTag(CURRENT_APP_VERSION)
          );
          setChangelogEntry(selectedEntry || null);

          if (!CURRENT_APP_VERSION) {
            setNewerVersion(null);
          } else {
            const latestKnownVersion = entries[0]?.title || "";
            setNewerVersion(
              latestKnownVersion && compareVersions(latestKnownVersion, CURRENT_APP_VERSION) > 0
                ? latestKnownVersion
                : null
            );
          }
        }
      } catch {}
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load dashboard data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const zkEnabledClients = clients.filter((c) => c.zkDelivery !== "none").length;
  const activeSigningKeys = jwks?.keys.filter((key) => !key.rotatedAt).length || 0;

  const formatEventType = (eventType: string | undefined) => {
    if (!eventType) return "Unknown";
    return eventType
      .split("_")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  };

  const getActor = (log: AuditLog) => {
    const type = log.actorType || (log.adminId ? "Admin" : log.userId ? "User" : "System");
    const id =
      log.actorEmail || log.actorName || log.actorId || log.adminId || log.userId || "system";
    return { type, id };
  };

  function parseInlineMarkdown(text: string): React.ReactNode[] {
    const parts: React.ReactNode[] = [];
    let current = text;
    let keyIndex = 0;
    while (current.length > 0) {
      const boldMatch = current.match(/\*\*([^*]+)\*\*/);
      if (boldMatch) {
        const beforeBold = current.substring(0, boldMatch.index);
        if (beforeBold) parts.push(beforeBold);
        parts.push(<strong key={`bold-${keyIndex++}`}>{boldMatch[1]}</strong>);
        current = current.substring((boldMatch.index || 0) + boldMatch[0].length);
        continue;
      }
      const codeMatch = current.match(/`([^`]+)`/);
      if (codeMatch) {
        const beforeCode = current.substring(0, codeMatch.index);
        if (beforeCode) parts.push(beforeCode);
        parts.push(<code key={`code-${keyIndex++}`}>{codeMatch[1]}</code>);
        current = current.substring((codeMatch.index || 0) + codeMatch[0].length);
        continue;
      }
      parts.push(current);
      break;
    }
    return parts;
  }

  function convertMarkdownToComponents(markdown: string, index: number): JSX.Element {
    const lines = markdown.split("\n");
    const elements: JSX.Element[] = [];
    let currentUlItems: string[] = [];
    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];
      const line = raw.replace(/^\u00A0+/, "").trim();
      const liMatch = line.match(/^(?:[-*\u2022\u2013\u2014])\s+(.*)$/);
      if (!line) {
        if (currentUlItems.length > 0) {
          elements.push(
            <ul key={`ul-${index}-${i}`}>
              {currentUlItems.map((item) => (
                <li key={`${index}-${item.substring(0, 20)}`}>{parseInlineMarkdown(item)}</li>
              ))}
            </ul>
          );
          currentUlItems = [];
        }
        continue;
      }
      if (line.startsWith("## ") || line.startsWith("### ")) {
        if (currentUlItems.length > 0) {
          elements.push(
            <ul key={`ul-${index}-${i}`}>
              {currentUlItems.map((item) => (
                <li key={`${index}-${item.substring(0, 20)}`}>{parseInlineMarkdown(item)}</li>
              ))}
            </ul>
          );
          currentUlItems = [];
        }
        const headerText = line.replace(/^###?\s+/, "");
        elements.push(<h3 key={`h3-${index}-${i}`}>{parseInlineMarkdown(headerText)}</h3>);
      } else if (liMatch) {
        currentUlItems.push(liMatch[1]);
      } else if (line && currentUlItems.length === 0) {
        elements.push(<p key={`p-${index}-${i}`}>{parseInlineMarkdown(line)}</p>);
      }
    }
    if (currentUlItems.length > 0) {
      elements.push(
        <ul key={`ul-${index}-final`}>
          {currentUlItems.map((item) => (
            <li key={`final-${index}-${item.substring(0, 20)}`}>{parseInlineMarkdown(item)}</li>
          ))}
        </ul>
      );
    }
    return <div className={changelogStyles.changelog}>{elements}</div>;
  }

  return (
    <div>
      <PageHeader title="Admin Dashboard" subtitle="Overview of activity and system health" />

      <StatsGrid>
        <StatsCard
          title="Total Users"
          icon={<UsersIcon size={16} />}
          value={users.length}
          description="Registered users"
        />
        <StatsCard
          title="OAuth Clients"
          icon={<Shield size={16} />}
          value={clients.length}
          description="Configured clients"
        />
        <StatsCard
          title="ZK-Enabled Clients"
          icon={<Sparkles size={16} />}
          value={zkEnabledClients}
          description="Using ZK delivery"
        />
        <StatsCard
          title="Active Keys"
          icon={<KeyRound size={16} />}
          value={activeSigningKeys}
          description="Current signing keys"
        />
      </StatsGrid>

      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "2fr 1fr" }}>
        <Card>
          <CardHeader>
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto", alignItems: "center" }}>
              <CardTitle>Changelog</CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  window.location.href = "/changelog";
                }}
              >
                View
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div>Loading...</div>
            ) : changelogEntry ? (
              <div style={{ display: "grid", gap: 12 }}>
                {newerVersion ? (
                  <button
                    type="button"
                    className={styles.updateBanner}
                    onClick={() => window.open("https://darkauth.com/changelog", "_blank")}
                  >
                    New version available: {newerVersion}
                  </button>
                ) : null}
                <div
                  style={{ display: "grid", gridTemplateColumns: "1fr auto", alignItems: "center" }}
                >
                  <div style={{ fontWeight: 600 }}>{changelogEntry.title}</div>
                  <div style={{ color: "hsl(var(--muted-foreground))", fontSize: 12 }}>
                    {changelogEntry.date}
                  </div>
                </div>
                <div className={changelogStyles.changelog}>
                  {changelogEntry.changes.map((change) => (
                    <div key={`cl-${change.substring(0, 40)}`}>
                      {convertMarkdownToComponents(change, 0)}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div style={{ color: "hsl(var(--muted-foreground))" }}>
                No changelog entry for version {CURRENT_APP_VERSION || "unknown"}
              </div>
            )}
          </CardContent>
        </Card>

        <div style={{ display: "grid", gap: 16 }}>
          <Card>
            <CardHeader>
              <div
                style={{ display: "grid", gridTemplateColumns: "1fr auto", alignItems: "center" }}
              >
                <CardTitle>Recent Activity</CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    window.location.href = "/audit";
                  }}
                >
                  View All
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div>Loading...</div>
              ) : (
                <div className={styles.activityList}>
                  {auditLogs.length === 0 ? (
                    <div style={{ color: "hsl(var(--muted-foreground))" }}>
                      No recent audit events
                    </div>
                  ) : (
                    auditLogs.map((log) => {
                      const actor = getActor(log);
                      const metaItems: { value: string; className?: string }[] = [
                        { value: actor.type, className: styles.activityMetaType },
                        { value: actor.id },
                      ];

                      if (log.resource) {
                        metaItems.push({
                          value: log.resourceId
                            ? `${log.resource}: ${log.resourceId}`
                            : log.resource,
                        });
                      }

                      return (
                        <button
                          key={log.id}
                          type="button"
                          onClick={() => {
                            window.location.href = `/audit/${log.id}`;
                          }}
                          className={styles.activityItem}
                        >
                          <div
                            className={styles.activityIcon}
                            data-status={log.success ? "success" : "fail"}
                          >
                            <FileText size={16} />
                          </div>
                          <div className={styles.activityBody}>
                            <div className={styles.activityHeader}>
                              <span className={styles.activityTitle}>
                                {formatEventType(log.eventType)}
                              </span>
                              <time
                                className={styles.activityTime}
                                dateTime={new Date(log.timestamp).toISOString()}
                              >
                                {new Date(log.timestamp).toLocaleString()}
                              </time>
                            </div>
                            <div className={styles.activityMeta}>
                              {metaItems.map((item) => (
                                <span
                                  key={`${log.id}-${item.value}`}
                                  className={`${styles.activityMetaItem} ${
                                    item.className ?? ""
                                  }`.trim()}
                                >
                                  {item.value}
                                </span>
                              ))}
                            </div>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>System Health</CardTitle>
            </CardHeader>
            <CardContent>
              <div style={{ display: "grid", gap: 10 }}>
                {["Auth Service", "ZK Processor", "Database"].map((service) => (
                  <div
                    key={service}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <CheckCircle size={16} color="hsl(142 70% 45%)" />
                      <span>{service}</span>
                    </div>
                    <span
                      style={{
                        fontSize: 12,
                        color: "hsl(var(--success))",
                        background: "hsl(var(--success) / 0.12)",
                        border: "1px solid hsl(var(--success) / 0.3)",
                        padding: "4px 8px",
                        borderRadius: 999,
                      }}
                    >
                      Online
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
            </CardHeader>
            <CardContent>
              <div style={{ display: "grid", gap: 8 }}>
                <Button
                  onClick={() => {
                    window.location.href = "/users/new";
                  }}
                >
                  {" "}
                  <Plus size={16} /> New User
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    window.location.href = "/clients/new";
                  }}
                >
                  {" "}
                  <Plus size={16} /> New Client
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    window.location.href = "/keys";
                  }}
                >
                  {" "}
                  <KeyRound size={16} /> Manage Keys
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
