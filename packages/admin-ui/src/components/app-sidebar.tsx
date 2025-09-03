import {
  ChevronDown,
  ChevronRight,
  FileText,
  Home,
  Key,
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
import { getTheme, setTheme } from "@/lib/theme";
import styles from "./app-sidebar.module.css";

const mainItems = [
  { title: "Dashboard", url: "/", icon: Home },
  { title: "Users", url: "/users", icon: Users },
  { title: "Groups", url: "/groups", icon: Shield },
  { title: "Clients", url: "/clients", icon: Lock },
];

const securityItems = [
  { title: "Keys", url: "/keys", icon: Key },
  { title: "Audit Logs", url: "/audit", icon: Lock },
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
  const [settingsOpen, setSettingsOpen] = useState(location.pathname.startsWith("/settings"));
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
        <div className={styles.navGroup}>
          <div className={styles.navGroupLabel}>Main</div>
          <div className={styles.navMenu}>
            {mainItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.title}
                  to={item.url}
                  className={`${styles.navItem} ${isActive(item.url) ? styles.active : ""}`}
                  onClick={handleNavClick}
                >
                  <Icon className={styles.navIcon} />
                  <span>{item.title}</span>
                </NavLink>
              );
            })}
          </div>
        </div>

        <div className={styles.navGroup}>
          <div className={styles.navGroupLabel}>Security</div>
          <div className={styles.navMenu}>
            {securityItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.title}
                  to={item.url}
                  className={`${styles.navItem} ${isActive(item.url) ? styles.active : ""}`}
                  onClick={handleNavClick}
                >
                  <Icon className={styles.navIcon} />
                  <span>{item.title}</span>
                </NavLink>
              );
            })}
          </div>
        </div>

        <div className={styles.navGroup}>
          <div className={styles.navGroupLabel}>System</div>
          <div className={styles.navMenu}>
            <NavLink
              to="/changelog"
              className={`${styles.navItem} ${isActive("/changelog") ? styles.active : ""}`}
              onClick={handleNavClick}
            >
              <FileText className={styles.navIcon} />
              <span>Changelog</span>
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
            <button
              type="button"
              className={styles.navItem}
              onClick={() => setSettingsOpen((v) => !v)}
            >
              <Settings className={styles.navIcon} />
              <span>Settings</span>
              {settingsOpen ? (
                <ChevronDown className={styles.chevron} />
              ) : (
                <ChevronRight className={styles.chevron} />
              )}
            </button>
            {settingsOpen && (
              <div className={styles.subMenu}>
                <NavLink
                  to="/settings"
                  className={`${styles.navItem} ${isActive("/settings") && location.pathname === "/settings" ? styles.active : ""}`}
                  onClick={handleNavClick}
                >
                  <Settings className={styles.navIcon} />
                  <span>Core</span>
                </NavLink>
                <NavLink
                  to="/settings/admin-users"
                  className={`${styles.navItem} ${isActive("/settings/admin-users") ? styles.active : ""}`}
                  onClick={handleNavClick}
                >
                  <Users className={styles.navIcon} />
                  <span>Admin Users</span>
                </NavLink>
              </div>
            )}
          </div>
        </div>
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
              <button type="button" className={styles.userMenuItem}>
                Profile
              </button>
              <button type="button" className={styles.userMenuItem}>
                Settings
              </button>
              <NavLink
                to="/reset-password"
                className={styles.userMenuItem}
                onClick={handleNavClick}
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
