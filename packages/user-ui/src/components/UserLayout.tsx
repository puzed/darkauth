import { AppWindow, Check, ChevronDown, ShieldCheck, UserRound } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { useBranding } from "../hooks/useBranding";
import ThemeToggle from "./ThemeToggle";
import styles from "./UserLayout.module.css";
import { useUserPortal } from "./UserPortalContext";

interface UserLayoutProps {
  userName?: string | null;
  userEmail?: string | null;
  onChangePassword?: () => void;
  onManageSecurity?: () => void;
  onLogout?: () => void;
  children: ReactNode;
}

export default function UserLayout({ userName, userEmail, children }: UserLayoutProps) {
  const branding = useBranding();
  const portal = useUserPortal();
  const logoUrl = branding.getLogoUrl();
  const isDefaultLogo = branding.isDefaultLogoUrl(logoUrl);
  const displayName = userName || userEmail || "Account";
  const [accountOpen, setAccountOpen] = useState(false);
  const [switchingOrganizationId, setSwitchingOrganizationId] = useState<string | null>(null);
  const accountRef = useRef<HTMLDivElement | null>(null);
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
  const activeOrganizations =
    portal?.organizations.filter((organization) =>
      organization.status ? organization.status === "active" : true
    ) || [];
  const organizationLabel = portal?.activeOrganizationLabel || null;

  useEffect(() => {
    if (!accountOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && accountRef.current && !accountRef.current.contains(target)) {
        setAccountOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setAccountOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [accountOpen]);

  const switchOrganization = async (organizationId: string) => {
    if (!portal || organizationId === portal.activeOrganizationId) {
      setAccountOpen(false);
      return;
    }
    try {
      setSwitchingOrganizationId(organizationId);
      await portal.switchOrganization(organizationId);
      setAccountOpen(false);
    } finally {
      setSwitchingOrganizationId(null);
    }
  };

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
            <ThemeToggle />
            {(userName || userEmail) && (
              <div className={styles.accountMenu} ref={accountRef}>
                <button
                  type="button"
                  className={styles.userButton}
                  aria-haspopup="menu"
                  aria-expanded={accountOpen}
                  onClick={() => setAccountOpen((open) => !open)}
                >
                  <span className={styles.avatar} aria-hidden="true">
                    {displayName.slice(0, 1).toUpperCase()}
                  </span>
                  <span className={styles.userCopy}>
                    <span className={styles.userPrimary}>{displayName}</span>
                    <span className={styles.userSecondary}>
                      {organizationLabel || userEmail || "No active organization"}
                    </span>
                  </span>
                  <ChevronDown className={styles.userChevron} size={16} aria-hidden="true" />
                </button>
                {accountOpen ? (
                  <div className={styles.accountPopover} role="menu">
                    <div className={styles.accountSummary}>
                      <strong>{displayName}</strong>
                      {userEmail ? <span>{userEmail}</span> : null}
                    </div>
                    <div className={styles.accountGroup}>
                      <span className={styles.accountGroupLabel}>Organizations</span>
                      {portal?.organizationsLoading ? (
                        <span className={styles.accountEmpty}>Loading organizations...</span>
                      ) : activeOrganizations.length === 0 ? (
                        <span className={styles.accountEmpty}>No active organizations</span>
                      ) : (
                        activeOrganizations.map((organization) => {
                          const active =
                            organization.organizationId === portal?.activeOrganizationId;
                          const switching = switchingOrganizationId === organization.organizationId;
                          return (
                            <button
                              type="button"
                              key={organization.organizationId}
                              className={
                                active ? styles.organizationItemActive : styles.organizationItem
                              }
                              disabled={switchingOrganizationId !== null}
                              role="menuitem"
                              onClick={() => switchOrganization(organization.organizationId)}
                            >
                              <span>
                                <strong>{organization.name}</strong>
                                {organization.slug ? <small>{organization.slug}</small> : null}
                              </span>
                              {active ? <Check size={16} /> : switching ? "Switching..." : null}
                            </button>
                          );
                        })
                      )}
                    </div>
                    <Link to="/profile" className={styles.accountProfileLink} role="menuitem">
                      Profile
                    </Link>
                  </div>
                ) : null}
              </div>
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
