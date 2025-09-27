import clsx from "clsx";
import {
  ChevronDown,
  ChevronRight,
  Clock,
  FileText,
  FolderOpen,
  Hash,
  Plus,
  Star,
  Users,
} from "lucide-react";
import React from "react";
import { NavLink } from "react-router-dom";
import styles from "./Sidebar.module.css";

interface SidebarProps {
  isOpen: boolean;
}

export function Sidebar({ isOpen }: SidebarProps) {
  const [expandedSections, setExpandedSections] = React.useState({
    personal: true,
    shared: true,
    tags: false,
  });

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  return (
    <aside className={clsx(styles.aside, isOpen ? styles.asideOpen : styles.asideClosed)}>
      <div className={styles.section}>
        {/* Personal Section */}
        <div className="mb-6">
          <button
            type="button"
            onClick={() => toggleSection("personal")}
            className={styles.sectionTitle}
          >
            <span>Personal</span>
            {expandedSections.personal ? (
              <ChevronDown width={16} height={16} />
            ) : (
              <ChevronRight width={16} height={16} />
            )}
          </button>

          {expandedSections.personal && (
            <div>
              <NavLink
                to="/"
                className={({ isActive }) => clsx(styles.navLink, isActive && styles.navLinkActive)}
              >
                <FileText width={16} height={16} />
                <span>All Notes</span>
              </NavLink>

              <NavLink
                to="/recent"
                className={({ isActive }) => clsx(styles.navLink, isActive && styles.navLinkActive)}
              >
                <Clock width={16} height={16} />
                <span>Recent</span>
              </NavLink>

              <NavLink
                to="/starred"
                className={({ isActive }) => clsx(styles.navLink, isActive && styles.navLinkActive)}
              >
                <Star width={16} height={16} />
                <span>Starred</span>
              </NavLink>
            </div>
          )}
        </div>

        {/* Shared Section */}
        <div className="mb-6">
          <button
            type="button"
            onClick={() => toggleSection("shared")}
            className={styles.sectionTitle}
          >
            <span>Shared</span>
            {expandedSections.shared ? (
              <ChevronDown width={16} height={16} />
            ) : (
              <ChevronRight width={16} height={16} />
            )}
          </button>

          {expandedSections.shared && (
            <div>
              <NavLink
                to="/shared/with-me"
                className={({ isActive }) => clsx(styles.navLink, isActive && styles.navLinkActive)}
              >
                <Users width={16} height={16} />
                <span>Shared with Me</span>
              </NavLink>

              <button type="button" className={styles.buttonLikeLink}>
                <FolderOpen width={16} height={16} />
                <span>Team Notes</span>
              </button>

              <button type="button" className={styles.buttonLikeLink}>
                <Plus width={16} height={16} />
                <span>Create Collection</span>
              </button>
            </div>
          )}
        </div>

        {/* Tags Section */}
        <div className="mb-6">
          <button
            type="button"
            onClick={() => toggleSection("tags")}
            className={styles.sectionTitle}
          >
            <span>Tags</span>
            {expandedSections.tags ? (
              <ChevronDown width={16} height={16} />
            ) : (
              <ChevronRight width={16} height={16} />
            )}
          </button>

          {expandedSections.tags && (
            <div>
              <button type="button" className={styles.buttonLikeLink}>
                <Hash width={16} height={16} />
                <span>work</span>
                <span className={styles.count}>12</span>
              </button>

              <button type="button" className={styles.buttonLikeLink}>
                <Hash width={16} height={16} />
                <span>ideas</span>
                <span className={styles.count}>8</span>
              </button>

              <button type="button" className={styles.buttonLikeLink}>
                <Hash width={16} height={16} />
                <span>personal</span>
                <span className={styles.count}>5</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
