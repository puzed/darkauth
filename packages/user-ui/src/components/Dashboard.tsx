import { useCallback, useEffect, useMemo, useState } from "react";
import apiService from "../services/api";
import { logger } from "../services/logger";
import { loadUnlockedArk } from "../services/unlockedArk";
import styles from "./Dashboard.module.css";
import KeyUnlockPanel from "./KeyUnlockPanel";
import { EmptyState, PortalHeader, PortalPage } from "./Portal";
import UserLayout from "./UserLayout";

type KeyState = "locked" | "unlocked" | "setup_required";

interface SessionData {
  sub: string;
  name?: string;
  email?: string;
  keyState?: KeyState;
}

interface App {
  id: string;
  name: string;
  description?: string;
  url?: string;
  logoUrl?: string;
  iconMode?: "letter" | "emoji" | "upload";
  iconEmoji?: string;
  iconLetter?: string;
  iconUrl?: string;
}

interface DashboardProps {
  sessionData: SessionData;
  onLogout: () => void;
}

function resolveKeyState(sessionData: SessionData): KeyState {
  return sessionData.keyState === "unlocked" || loadUnlockedArk(sessionData.sub)
    ? "unlocked"
    : sessionData.keyState || "locked";
}

function appInitial(app: App) {
  if (app.iconMode === "letter" && app.iconLetter) return app.iconLetter.slice(0, 1).toUpperCase();
  return app.name.slice(0, 1).toUpperCase();
}

function AppIcon({ app }: { app: App }) {
  if (app.iconMode === "upload" && app.iconUrl) {
    return <img src={app.iconUrl} alt="" />;
  }
  if (app.logoUrl) {
    return <img src={app.logoUrl} alt="" />;
  }
  if (app.iconMode === "emoji" && app.iconEmoji) {
    return <span>{app.iconEmoji}</span>;
  }
  return <span>{appInitial(app)}</span>;
}

export default function Dashboard({ sessionData }: DashboardProps) {
  const [apps, setApps] = useState<App[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [keyState, setKeyState] = useState<KeyState>(resolveKeyState(sessionData));

  const loadUserApps = useCallback(async () => {
    try {
      const response = await apiService.getUserApps();
      setApps(response.apps || []);
    } catch (error) {
      logger.error(error, "Failed to load apps");
      setApps([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUserApps();
  }, [loadUserApps]);

  useEffect(() => {
    setKeyState(resolveKeyState(sessionData));
  }, [sessionData]);

  const filteredApps = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return apps;
    return apps.filter((app) =>
      `${app.name} ${app.description || ""}`.toLowerCase().includes(normalized)
    );
  }, [apps, query]);

  const showSearch = apps.length >= 7;

  return (
    <UserLayout userName={sessionData.name || null} userEmail={sessionData.email || null}>
      <PortalPage>
        <PortalHeader
          eyebrow="Apps"
          title="Your apps"
          description={
            apps.length === 1
              ? "1 app is available for this account."
              : `${apps.length} apps are available for this account.`
          }
        />

        {keyState !== "unlocked" ? (
          <section className={styles.unlockBanner} aria-label="Encrypted app access">
            <KeyUnlockPanel
              sub={sessionData.sub}
              email={sessionData.email}
              inline
              onUnlocked={(session) => setKeyState(session?.keyState || "unlocked")}
            />
          </section>
        ) : null}

        {showSearch ? (
          <label className={styles.search}>
            <span>Search apps</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by name or description"
              type="search"
            />
          </label>
        ) : null}

        {loading ? (
          <div className={styles.loadingState}>
            <div className={styles.spinner} />
            <p>Loading apps...</p>
          </div>
        ) : filteredApps.length > 0 ? (
          <section className={styles.appGrid} aria-label="Available apps">
            {filteredApps.map((app) => {
              const content = (
                <>
                  <span className={styles.appIcon} aria-hidden="true">
                    <AppIcon app={app} />
                  </span>
                  <span className={styles.appCopy}>
                    <strong>{app.name}</strong>
                    {app.description ? <small>{app.description}</small> : null}
                  </span>
                  <span className={styles.openIndicator} aria-hidden="true">
                    Open
                  </span>
                </>
              );
              return app.url ? (
                <a
                  key={app.id}
                  href={app.url}
                  className={styles.appTile}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {content}
                </a>
              ) : (
                <div key={app.id} className={styles.appTileDisabled}>
                  {content}
                </div>
              );
            })}
          </section>
        ) : (
          <EmptyState
            title={query ? "No apps match your search" : "No apps available"}
            text={
              query
                ? "Try a different search term."
                : "Apps assigned to this account will appear here."
            }
          />
        )}
      </PortalPage>
    </UserLayout>
  );
}
