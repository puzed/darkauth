import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
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
  const [brandingReady, setBrandingReady] = useState(() =>
    Boolean(window.__APP_CONFIG__?.branding)
  );
  const [clientCheckReady, setClientCheckReady] = useState(false);
  const logoUrl = branding.getLogoUrl();
  const isDefaultLogo = branding.isDefaultLogoUrl(logoUrl);
  const showView = brandingReady && clientCheckReady;

  useEffect(() => {
    if (brandingReady) {
      return;
    }
    let cancelled = false;
    const check = () => {
      if (cancelled) return;
      if (window.__APP_CONFIG__?.branding) {
        setBrandingReady(true);
        return;
      }
      setTimeout(check, 50);
    };
    check();
    return () => {
      cancelled = true;
    };
  }, [brandingReady]);

  if (!showView) {
    return (
      <Login
        onLogin={props?.onLogin || (() => {})}
        onSwitchToRegister={props?.onSwitchToRegister || (() => {})}
        preloadClientCheckOnly
        onClientCheckResolved={() => setClientCheckReady(true)}
      />
    );
  }

  return (
    <div className={styles.app}>
      <div className={styles.container}>
        <div className={styles.authHeader}>
          <div className={styles.headerTop}>
            <Link to="/" className={styles.brand}>
              <span className={styles.brandIcon}>
                <img
                  src={logoUrl}
                  alt={branding.getTitle()}
                  className={isDefaultLogo ? styles.defaultLogo : ""}
                />
              </span>
              <h1 className={styles.brandTitle}>{branding.getTitle()}</h1>
            </Link>
            <ThemeToggle />
          </div>
          <p className={styles.tagline}>{branding.getTagline()}</p>
        </div>
        <Login
          onLogin={props?.onLogin || (() => {})}
          onSwitchToRegister={props?.onSwitchToRegister || (() => {})}
          skipClientCheck
        />
      </div>
    </div>
  );
}
