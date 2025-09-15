import { type ReactNode, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useBranding } from "../hooks/useBranding";
import ThemeToggle from "./ThemeToggle";
import styles from "./UserLayout.module.css";

interface UserLayoutProps {
  userName?: string | null;
  userEmail?: string | null;
  onChangePassword?: () => void;
  onManageSecurity?: () => void;
  onLogout?: () => void;
  children: ReactNode;
}

export default function UserLayout({
  userName,
  userEmail,
  onChangePassword,
  onManageSecurity,
  onLogout,
  children,
}: UserLayoutProps) {
  const branding = useBranding();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, []);

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <div className={styles.headerContent}>
          <Link to="/" className={styles.brand}>
            <img
              src={branding.getLogoUrl()}
              alt={branding.getTitle()}
              className={branding.getLogoUrl() === "/favicon.svg" ? styles.defaultLogo : ""}
            />
            <h1>{branding.getTitle()}</h1>
          </Link>
          <div className={styles.headerActions}>
            <ThemeToggle />
            {(userName || userEmail) && (
              <div className={styles.userMenu} ref={menuRef}>
                <button
                  type="button"
                  className={styles.userButton}
                  onClick={() => setOpen((v) => !v)}
                >
                  <span className={styles.userPrimary}>{userName || userEmail}</span>
                  {userName && userEmail && (
                    <span className={styles.userSecondary}>{userEmail}</span>
                  )}
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <title>User menu</title>
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </button>
                {open && (
                  <div className={styles.dropdown}>
                    <button
                      type="button"
                      className={styles.dropdownItem}
                      onClick={() => {
                        setOpen(false);
                        onChangePassword?.();
                      }}
                    >
                      Change Password
                    </button>
                    <button
                      type="button"
                      className={styles.dropdownItem}
                      onClick={() => {
                        setOpen(false);
                        onManageSecurity?.();
                      }}
                    >
                      Resetup OTP
                    </button>
                    <button
                      type="button"
                      className={styles.dropdownItemDanger}
                      onClick={() => {
                        setOpen(false);
                        onLogout?.();
                      }}
                    >
                      Logout
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      <main className={styles.main}>
        <div className={styles.container}>{children}</div>
      </main>
    </div>
  );
}
