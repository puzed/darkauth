import { logout } from "@DarkAuth/client";
import { LogOut, Menu, Moon, Plus, Search, Sun, User } from "lucide-react";
import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../../services/api";
import { useAuthStore } from "../../stores/authStore";
import styles from "./Header.module.css";

interface HeaderProps {
  onMenuToggle: () => void;
}

export function Header({ onMenuToggle }: HeaderProps) {
  const navigate = useNavigate();
  const { user, clearSession } = useAuthStore();
  const [isDark, setIsDark] = React.useState(document.documentElement.classList.contains("dark"));
  const [showUserMenu, setShowUserMenu] = React.useState(false);

  const toggleTheme = () => {
    if (isDark) {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
      setIsDark(false);
    } else {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
      setIsDark(true);
    }
  };

  const handleLogout = () => {
    logout();
    clearSession();
    window.location.href = "/";
  };

  const handleCreateNote = async () => {
    try {
      const noteId = await api.createNote();
      navigate(`/notes/${noteId}`);
    } catch {}
  };

  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <div className={styles.left}>
          <button
            type="button"
            onClick={onMenuToggle}
            className={styles.menuButton}
            aria-label="Toggle menu"
          >
            <Menu width={20} height={20} />
          </button>

          <Link to="/" className={styles.brand}>
            <div className={styles.logoBox}>
              <span>D</span>
            </div>
            <span className={styles.logoText}>DarkNotes</span>
          </Link>
        </div>

        <div className={styles.search}>
          <div className={styles.searchInner}>
            <Search
              style={{
                position: "absolute",
                left: 12,
                top: "50%",
                transform: "translateY(-50%)",
                color: "#9CA3AF",
              }}
              width={20}
              height={20}
            />
            <input
              type="text"
              placeholder="Search notes..."
              className={`input ${styles.searchInput}`}
            />
          </div>
        </div>

        <div className={styles.actions}>
          <button type="button" className="btn-primary" onClick={handleCreateNote}>
            <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
              <Plus width={16} height={16} />
              <span>New Note</span>
            </span>
          </button>

          <button
            type="button"
            onClick={toggleTheme}
            className={styles.iconButton}
            aria-label="Toggle theme"
          >
            {isDark ? <Sun width={20} height={20} /> : <Moon width={20} height={20} />}
          </button>

          <div style={{ position: "relative" }}>
            <button
              type="button"
              onClick={() => setShowUserMenu(!showUserMenu)}
              className={styles.avatarButton}
            >
              <div className={styles.avatar}>
                <span>{user?.name?.[0] || user?.email?.[0] || "U"}</span>
              </div>
            </button>

            {showUserMenu && (
              <div className={styles.userMenu}>
                <div className={styles.userMenuHeader}>
                  <p style={{ fontWeight: 600 }}>{user?.name || "User"}</p>
                  <p style={{ fontSize: 12, opacity: 0.7 }}>{user?.email}</p>
                </div>

                <Link
                  to="/profile"
                  className={styles.menuItem}
                  onClick={() => setShowUserMenu(false)}
                >
                  <User width={16} height={16} />
                  <span>Profile Settings</span>
                </Link>

                <button
                  type="button"
                  onClick={handleLogout}
                  className={`${styles.menuItem} ${styles.danger}`}
                >
                  <LogOut width={16} height={16} />
                  <span>Logout</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
