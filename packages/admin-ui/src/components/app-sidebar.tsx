import {
  ChevronDown,
  FileText,
  Home,
  Key,
  KeyRound,
  Lock,
  LogOut,
  Monitor,
  Moon,
  Settings,
  Shield,
  Sun,
  Users,
} from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import SidebarNavGroup, { type SidebarNavItem } from "@/components/navigation/sidebar-nav-group";
import { getTheme, setTheme } from "@/lib/theme";
import styles from "./app-sidebar.module.css";

const mainItems: SidebarNavItem[] = [
  { title: "Dashboard", url: "/", icon: Home },
  { title: "Users", url: "/users", icon: Users },
  { title: "Groups", url: "/groups", icon: Shield },
  { title: "Clients", url: "/clients", icon: Lock },
  { title: "Branding", url: "/branding", icon: Monitor },
];

const securityItems: SidebarNavItem[] = [
  { title: "Permissions", url: "/permissions", icon: KeyRound },
  { title: "Keys", url: "/keys", icon: Key },
  { title: "Audit Logs", url: "/audit", icon: Lock },
];

const systemItems: SidebarNavItem[] = [
  { title: "Changelog", url: "/changelog", icon: FileText },
  { title: "Settings", url: "/settings", icon: Settings },
  { title: "Admin Users", url: "/settings/admin-users", icon: Users },
];

interface AdminSessionData {
  adminId: string;
  name?: string;
  email?: string;
  role: "read" | "write";
}

interface AppSidebarProps {
  onClose?: () => void;
  adminSession?: AdminSessionData;
  onLogout?: () => void;
}

export function AppSidebar({ onClose, adminSession, onLogout }: AppSidebarProps) {
  const location = useLocation();

  const isActive = (path: string) => {
    if (path === "/" && location.pathname === "/") return true;
    if (path !== "/" && location.pathname.startsWith(path)) return true;
    return false;
  };

  const handleNavClick = () => {
    if (onClose) {
      onClose();
    }
  };

  const getInitials = () => {
    if (adminSession?.name) return adminSession.name.charAt(0).toUpperCase();
    return adminSession?.email?.charAt(0).toUpperCase() || "A";
  };

  const [open, setOpen] = useState(false);
  const [theme, setThemeState] = useState(getTheme());

  useEffect(() => {
    setThemeState(getTheme());
  }, []);

  const onSet = (t: "system" | "light" | "dark") => {
    setTheme(t);
    setThemeState(t);
  };

  return (
    <div className={styles.sidebar}>
      <div className={styles.header}>
        <div className={styles.brand}>
          <div className={styles.logo}>
            <img src="/favicon.svg" alt="DarkAuth" className={styles.logoIcon} />
          </div>
          <div className={styles.brandText}>
            <h2>DarkAuth</h2>
            <p>Admin Portal</p>
          </div>
        </div>
      </div>

      <div className={styles.navigation}>
        <SidebarNavGroup
          label="Main"
          items={mainItems}
          isActive={isActive}
          onNavigate={handleNavClick}
        />
        <SidebarNavGroup
          label="Security"
          items={securityItems}
          isActive={isActive}
          onNavigate={handleNavClick}
        />
        <SidebarNavGroup
          label="System"
          items={systemItems}
          isActive={(path) =>
            path === "/settings" ? location.pathname === "/settings" : isActive(path)
          }
          onNavigate={handleNavClick}
        />
      </div>
      <div className={styles.userSection}>
        <div className={styles.userMenuContainer}>
          {open && (
            <div className={styles.userMenu}>
              <div className={styles.userMenuHeader}>
                <p className={styles.userName}>{adminSession?.name || "Admin User"}</p>
                <p className={styles.userEmail}>{adminSession?.email}</p>
                {adminSession?.role && <p className={styles.userRole}>Role: {adminSession.role}</p>}
              </div>
              <NavLink
                to="/otp?manage=1"
                className={styles.userMenuItem}
                onClick={() => {
                  if (onClose) onClose();
                  setOpen(false);
                }}
              >
                Two-Factor Authentication
              </NavLink>
              <div className={styles.appearanceRow}>
                <span className={styles.appearanceLabel}>Appearance</span>
                <div className={styles.appearanceControls}>
                  <button
                    type="button"
                    aria-label="Use system appearance"
                    className={`${styles.iconBtn} ${theme === "system" ? styles.iconBtnActive : ""}`}
                    onClick={() => onSet("system")}
                    title="System"
                  >
                    <Monitor className={styles.appearanceIcon} />
                  </button>
                  <button
                    type="button"
                    aria-label="Use light appearance"
                    className={`${styles.iconBtn} ${theme === "light" ? styles.iconBtnActive : ""}`}
                    onClick={() => onSet("light")}
                    title="Light"
                  >
                    <Sun className={styles.appearanceIcon} />
                  </button>
                  <button
                    type="button"
                    aria-label="Use dark appearance"
                    className={`${styles.iconBtn} ${theme === "dark" ? styles.iconBtnActive : ""}`}
                    onClick={() => onSet("dark")}
                    title="Dark"
                  >
                    <Moon className={styles.appearanceIcon} />
                  </button>
                </div>
              </div>
              <NavLink
                to="/reset-password"
                className={styles.userMenuItem}
                onClick={() => {
                  handleNavClick();
                  setOpen(false);
                }}
              >
                Change Password
              </NavLink>
              <button
                type="button"
                className={`${styles.userMenuItem} ${styles.danger}`}
                onClick={onLogout}
              >
                <LogOut className={styles.userMenuIcon} />
                Log out
              </button>
            </div>
          )}
          <button type="button" className={styles.userMenuButton} onClick={() => setOpen(!open)}>
            <div className={styles.userAvatar}>{getInitials()}</div>
            <div className={styles.userMeta}>
              <div className={styles.userName}>{adminSession?.name || "Admin User"}</div>
              <div className={styles.userEmail}>{adminSession?.email}</div>
            </div>
            <ChevronDown
              className={`${styles.userChevron} ${open ? styles.userChevronOpen : ""}`}
            />
          </button>
        </div>
      </div>
    </div>
  );
}
