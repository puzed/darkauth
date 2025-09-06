import { useBranding } from "../hooks/useBranding";
import Login from "./Login";
import styles from "./LoginView.module.css";
import ThemeToggle from "./ThemeToggle";

type SessionData = { sub: string; name?: string; email?: string; passwordResetRequired?: boolean };

export default function LoginView(props?: {
  options?: unknown;
  onSwitchToRegister?: () => void;
  onLogin?: (session: SessionData) => void;
}) {
  const branding = useBranding();

  return (
    <div className={styles.app}>
      <div className={styles.container}>
        <div className={styles.authHeader}>
          <div className={styles.headerTop}>
            <div className={styles.brand}>
              <span className={styles.brandIcon}>
                <img
                  src={branding.getLogoUrl()}
                  alt={branding.getTitle()}
                  className={branding.getLogoUrl() === "/favicon.svg" ? styles.defaultLogo : ""}
                />
              </span>
              <h1 className={styles.brandTitle}>{branding.getTitle()}</h1>
            </div>
            <ThemeToggle />
          </div>
          <p className={styles.tagline}>{branding.getTagline()}</p>
        </div>
        <Login
          onLogin={props?.onLogin || (() => {})}
          onSwitchToRegister={props?.onSwitchToRegister || (() => {})}
        />
      </div>
    </div>
  );
}
