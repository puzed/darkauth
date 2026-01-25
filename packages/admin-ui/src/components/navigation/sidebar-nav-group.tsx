import type { ComponentType } from "react";
import { NavLink } from "react-router-dom";
import styles from "@/components/app-sidebar.module.css";

export interface SidebarNavItem {
  title: string;
  url: string;
  icon: ComponentType<{ className?: string }>;
}

export default function SidebarNavGroup({
  label,
  items,
  isActive,
  onNavigate,
}: {
  label: string;
  items: SidebarNavItem[];
  isActive: (path: string) => boolean;
  onNavigate: () => void;
}) {
  return (
    <div className={styles.navGroup}>
      <div className={styles.navGroupLabel}>{label}</div>
      <div className={styles.navMenu}>
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.title}
              to={item.url}
              className={`${styles.navItem} ${isActive(item.url) ? styles.active : ""}`}
              onClick={onNavigate}
            >
              <Icon className={styles.navIcon} />
              <span>{item.title}</span>
            </NavLink>
          );
        })}
      </div>
    </div>
  );
}
