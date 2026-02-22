import React from "react";
import { Outlet } from "react-router-dom";
import { useAuthStore } from "../../stores/authStore";
import { Header } from "./Header";
import styles from "./Layout.module.css";
import { Sidebar } from "./Sidebar";

export function Layout() {
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(false);
  useAuthStore();

  return (
    <div className={styles.root}>
      <Header onMenuToggle={() => setIsSidebarOpen((previous) => !previous)} />
      <div className={styles.contentRow}>
        <Sidebar isOpen={isSidebarOpen} />
        {isSidebarOpen && (
          <button
            type="button"
            aria-label="Close sidebar"
            className={styles.overlay}
            onClick={() => setIsSidebarOpen(false)}
          />
        )}
        <main className={styles.main}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
