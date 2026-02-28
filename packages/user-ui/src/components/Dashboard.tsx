import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import apiService from "../services/api";
import { logger } from "../services/logger";
import styles from "./Dashboard.module.css";
import UserLayout from "./UserLayout";

interface SessionData {
  sub: string;
  name?: string;
  email?: string;
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

export default function Dashboard({ sessionData, onLogout }: DashboardProps) {
  const navigate = useNavigate();
  const [apps, setApps] = useState<App[]>([]);
  const [loading, setLoading] = useState(true);

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

  return (
    <UserLayout
      userName={sessionData.name || null}
      userEmail={sessionData.email || null}
      onChangePassword={() => navigate("/change-password")}
      onManageSecurity={() => navigate("/settings")}
      onLogout={onLogout}
    >
      <div className={styles.container}>
        <div className={styles.mainGrid}>
          <section className={styles.appsSection}>
            <h3>Your Applications</h3>
            {loading ? (
              <div className={styles.loadingState}>
                <div className={styles.spinner} />
                <p>Loading applications...</p>
              </div>
            ) : apps.length > 0 ? (
              <div className={styles.appsGrid}>
                {apps.map((app) =>
                  app.url ? (
                    <a
                      key={app.id}
                      href={app.url}
                      className={styles.appCard}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <div className={styles.appIcon}>
                        {app.iconMode === "upload" && app.iconUrl ? (
                          <img src={app.iconUrl} alt={app.name} />
                        ) : app.logoUrl ? (
                          <img src={app.logoUrl} alt={app.name} />
                        ) : app.iconMode === "emoji" && app.iconEmoji ? (
                          <div className={styles.appInitial}>{app.iconEmoji}</div>
                        ) : app.iconMode === "letter" && app.iconLetter ? (
                          <div className={styles.appInitial}>
                            {app.iconLetter.slice(0, 1).toUpperCase()}
                          </div>
                        ) : (
                          <div className={styles.appInitial}>{app.name[0].toUpperCase()}</div>
                        )}
                      </div>
                      <div className={styles.appInfo}>
                        <h4>{app.name}</h4>
                        {app.description && <p>{app.description}</p>}
                      </div>
                      <div className={styles.appArrow}>
                        <svg
                          width="20"
                          height="20"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <title>Open application</title>
                          <path d="M7 17L17 7M17 7H7M17 7V17" />
                        </svg>
                      </div>
                    </a>
                  ) : (
                    <div key={app.id} className={styles.appCard}>
                      <div className={styles.appIcon}>
                        {app.iconMode === "upload" && app.iconUrl ? (
                          <img src={app.iconUrl} alt={app.name} />
                        ) : app.logoUrl ? (
                          <img src={app.logoUrl} alt={app.name} />
                        ) : app.iconMode === "emoji" && app.iconEmoji ? (
                          <div className={styles.appInitial}>{app.iconEmoji}</div>
                        ) : app.iconMode === "letter" && app.iconLetter ? (
                          <div className={styles.appInitial}>
                            {app.iconLetter.slice(0, 1).toUpperCase()}
                          </div>
                        ) : (
                          <div className={styles.appInitial}>{app.name[0].toUpperCase()}</div>
                        )}
                      </div>
                      <div className={styles.appInfo}>
                        <h4>{app.name}</h4>
                        {app.description && <p>{app.description}</p>}
                      </div>
                      <div className={styles.appArrow}>
                        <svg
                          width="20"
                          height="20"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <title>Open application</title>
                          <path d="M7 17L17 7M17 7H7M17 7V17" />
                        </svg>
                      </div>
                    </div>
                  )
                )}
              </div>
            ) : (
              <div className={styles.emptyState}>
                <svg
                  width="48"
                  height="48"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <title>No applications</title>
                  <rect x="3" y="3" width="7" height="7" rx="1" />
                  <rect x="14" y="3" width="7" height="7" rx="1" />
                  <rect x="3" y="14" width="7" height="7" rx="1" />
                  <rect x="14" y="14" width="7" height="7" rx="1" />
                </svg>
                <p>No applications available</p>
                <span>Applications you have access to will appear here</span>
              </div>
            )}
            <div className={styles.appsActions}>
              <button
                type="button"
                className={styles.appsActionButton}
                onClick={() => navigate("/change-password")}
              >
                Change Password
              </button>
              <button
                type="button"
                className={styles.appsActionButton}
                onClick={() => navigate("/settings")}
              >
                Reset OTP
              </button>
            </div>
          </section>

          <section className={styles.accountSection}>
            <h3>Account Information</h3>
            <div className={styles.accountInfo}>
              <div className={styles.infoRow}>
                <span className={styles.label}>Name</span>
                <span className={styles.value}>{sessionData.name || "Not provided"}</span>
              </div>
              <div className={styles.infoRow}>
                <span className={styles.label}>Email</span>
                <span className={styles.value}>{sessionData.email || "Not provided"}</span>
              </div>
              <div className={styles.infoRow}>
                <span className={styles.label}>User ID</span>
                <code className={styles.userId}>{sessionData.sub}</code>
              </div>
            </div>
          </section>
        </div>
      </div>
    </UserLayout>
  );
}
