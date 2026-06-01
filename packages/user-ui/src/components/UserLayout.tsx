import { AppWindow, ShieldCheck, UserRound } from "lucide-react";
import type { ReactNode } from "react";
import { Link, NavLink } from "react-router-dom";
import { useBranding } from "../hooks/useBranding";
import ThemeToggle from "./ThemeToggle";
import styles from "./UserLayout.module.css";

interface UserLayoutProps {
  userName?: string | null;
  userEmail?: string | null;
  organizationLabel?: string | null;
  onChangePassword?: () => void;
  onManageSecurity?: () => void;
  onLogout?: () => void;
  children: ReactNode;
}

export default function UserLayout({
  userName,
  userEmail,
  organizationLabel,
  children,
}: UserLayoutProps) {
  const branding = useBranding();
  const logoUrl = branding.getLogoUrl();
  const isDefaultLogo = branding.isDefaultLogoUrl(logoUrl);
  const displayName = userName || userEmail || "Account";
  const navItems = [
    { to: "/apps", label: "Apps", Icon: AppWindow },
    { to: "/security", label: "Security", Icon: ShieldCheck },
    { to: "/profile", label: "Profile", Icon: UserRound },
  ];
  const renderNav = (className: string) => (
    <nav className={className} aria-label="User portal">
      {navItems.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) => (isActive ? styles.navItemActive : styles.navItem)}
        >
          <span className={styles.navGlyph} aria-hidden="true">
            <item.Icon size={18} strokeWidth={2.2} />
          </span>
          <span>{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <div className={styles.headerContent}>
          <Link to="/apps" className={styles.brand}>
            <img
              src={logoUrl}
              alt={branding.getTitle()}
              className={isDefaultLogo ? styles.defaultLogo : ""}
            />
            <h1>{branding.getTitle()}</h1>
          </Link>
          {renderNav(styles.desktopNav)}
          <div className={styles.headerActions}>
            {organizationLabel ? (
              <Link
                to="/profile"
                className={styles.orgIndicator}
                aria-label={`Active organization: ${organizationLabel}`}
              >
                <span>Active org</span>
                <strong>{organizationLabel}</strong>
              </Link>
            ) : null}
            <ThemeToggle />
            {(userName || userEmail) && (
              <Link to="/profile" className={styles.userButton}>
                <span className={styles.avatar} aria-hidden="true">
                  {displayName.slice(0, 1).toUpperCase()}
                </span>
                <span className={styles.userCopy}>
                  <span className={styles.userPrimary}>{displayName}</span>
                  {userName && userEmail && (
                    <span className={styles.userSecondary}>{userEmail}</span>
                  )}
                </span>
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className={styles.main}>
        <div className={styles.container}>{children}</div>
      </main>
      {renderNav(styles.mobileNav)}
    </div>
  );
}
