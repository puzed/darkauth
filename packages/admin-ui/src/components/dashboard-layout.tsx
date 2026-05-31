import { Menu } from "lucide-react";
import { useState } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { getBrandLogoUrl, getBrandTitle } from "@/lib/branding";
import styles from "./dashboard-layout.module.css";

interface AdminSessionData {
  adminId: string;
  name?: string;
  email?: string;
  role: "read" | "write";
}

interface DashboardLayoutProps {
  children: React.ReactNode;
  adminSession: AdminSessionData;
  onLogout: () => void;
}

export function DashboardLayout({ children, adminSession, onLogout }: DashboardLayoutProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  return (
    <div className={styles.container}>
      <div className={`${styles.sidebar} ${isSidebarOpen ? styles.open : ""}`}>
        <AppSidebar
          onClose={() => setIsSidebarOpen(false)}
          adminSession={adminSession}
          onLogout={onLogout}
        />
      </div>
      <div className={styles.main}>
        <header className={styles.header}>
          <div className={styles.headerLeft}>
            <button
              type="button"
              className={styles.menuButton}
              onClick={() => setIsSidebarOpen(true)}
            >
              <Menu className={styles.menuIcon} />
            </button>
            <div className={styles.headerBrand}>
              <img
                src={getBrandLogoUrl()}
                alt={getBrandTitle()}
                className={styles.headerLogoIcon}
              />
              <span className={styles.headerBrandText}>{getBrandTitle()}</span>
            </div>
          </div>
          <div className={styles.headerRight} />
        </header>
        {isSidebarOpen && (
          <button
            type="button"
            aria-label="Close menu"
            className={styles.menuOverlay}
            onClick={() => setIsSidebarOpen(false)}
          />
        )}
        <main className={styles.content}>{children}</main>
      </div>
    </div>
  );
}
