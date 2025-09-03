import React from "react";
import { NavLink } from "react-router-dom";
import { 
  FileText, 
  Clock, 
  Star, 
  Users, 
  FolderOpen,
  Hash,
  Plus,
  ChevronDown,
  ChevronRight
} from "lucide-react";
import clsx from "clsx";

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
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  return (
    <aside
      className={clsx(
        "bg-gray-50 dark:bg-dark-900 border-r border-gray-200 dark:border-dark-700 h-full overflow-y-auto transition-all duration-300",
        "fixed lg:static inset-y-0 left-0 z-40",
        isOpen ? "w-64 translate-x-0" : "w-64 -translate-x-full lg:translate-x-0"
      )}
    >
      <div className="p-4">
        {/* Personal Section */}
        <div className="mb-6">
          <button
            onClick={() => toggleSection("personal")}
            className="flex items-center justify-between w-full text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 hover:text-gray-700 dark:hover:text-gray-300"
          >
            <span>Personal</span>
            {expandedSections.personal ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </button>
          
          {expandedSections.personal && (
            <div className="space-y-1">
              <NavLink
                to="/"
                className={({ isActive }) =>
                  clsx(
                    "flex items-center gap-3 px-3 py-2 rounded-lg",
                    isActive
                      ? "bg-primary-100 dark:bg-primary-900/20 text-primary-700 dark:text-primary-400"
                      : "hover:bg-gray-100 dark:hover:bg-dark-800 text-gray-700 dark:text-gray-300"
                  )
                }
              >
                <FileText className="w-4 h-4" />
                <span>All Notes</span>
              </NavLink>
              
              <NavLink
                to="/recent"
                className={({ isActive }) =>
                  clsx(
                    "flex items-center gap-3 px-3 py-2 rounded-lg",
                    isActive
                      ? "bg-primary-100 dark:bg-primary-900/20 text-primary-700 dark:text-primary-400"
                      : "hover:bg-gray-100 dark:hover:bg-dark-800 text-gray-700 dark:text-gray-300"
                  )
                }
              >
                <Clock className="w-4 h-4" />
                <span>Recent</span>
              </NavLink>
              
              <NavLink
                to="/starred"
                className={({ isActive }) =>
                  clsx(
                    "flex items-center gap-3 px-3 py-2 rounded-lg",
                    isActive
                      ? "bg-primary-100 dark:bg-primary-900/20 text-primary-700 dark:text-primary-400"
                      : "hover:bg-gray-100 dark:hover:bg-dark-800 text-gray-700 dark:text-gray-300"
                  )
                }
              >
                <Star className="w-4 h-4" />
                <span>Starred</span>
              </NavLink>
            </div>
          )}
        </div>

        {/* Shared Section */}
        <div className="mb-6">
          <button
            onClick={() => toggleSection("shared")}
            className="flex items-center justify-between w-full text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 hover:text-gray-700 dark:hover:text-gray-300"
          >
            <span>Shared</span>
            {expandedSections.shared ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </button>
          
          {expandedSections.shared && (
            <div className="space-y-1">
              <NavLink
                to="/shared/with-me"
                className={({ isActive }) =>
                  clsx(
                    "flex items-center gap-3 px-3 py-2 rounded-lg",
                    isActive
                      ? "bg-primary-100 dark:bg-primary-900/20 text-primary-700 dark:text-primary-400"
                      : "hover:bg-gray-100 dark:hover:bg-dark-800 text-gray-700 dark:text-gray-300"
                  )
                }
              >
                <Users className="w-4 h-4" />
                <span>Shared with Me</span>
              </NavLink>
              
              <button className="flex items-center gap-3 px-3 py-2 rounded-lg transition-colors hover:bg-gray-100 dark:hover:bg-dark-800 text-gray-700 dark:text-gray-300 w-full text-left">
                <FolderOpen className="w-4 h-4" />
                <span>Team Notes</span>
              </button>
              
              <button className="flex items-center gap-3 px-3 py-2 rounded-lg transition-colors hover:bg-gray-100 dark:hover:bg-dark-800 text-gray-700 dark:text-gray-300 w-full text-left">
                <Plus className="w-4 h-4" />
                <span>Create Collection</span>
              </button>
            </div>
          )}
        </div>

        {/* Tags Section */}
        <div className="mb-6">
          <button
            onClick={() => toggleSection("tags")}
            className="flex items-center justify-between w-full text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 hover:text-gray-700 dark:hover:text-gray-300"
          >
            <span>Tags</span>
            {expandedSections.tags ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </button>
          
          {expandedSections.tags && (
            <div className="space-y-1">
              <button className="flex items-center gap-3 px-3 py-2 rounded-lg transition-colors hover:bg-gray-100 dark:hover:bg-dark-800 text-gray-700 dark:text-gray-300 w-full text-left">
                <Hash className="w-4 h-4 text-blue-500" />
                <span>work</span>
                <span className="ml-auto text-xs text-gray-500">12</span>
              </button>
              
              <button className="flex items-center gap-3 px-3 py-2 rounded-lg transition-colors hover:bg-gray-100 dark:hover:bg-dark-800 text-gray-700 dark:text-gray-300 w-full text-left">
                <Hash className="w-4 h-4 text-green-500" />
                <span>ideas</span>
                <span className="ml-auto text-xs text-gray-500">8</span>
              </button>
              
              <button className="flex items-center gap-3 px-3 py-2 rounded-lg transition-colors hover:bg-gray-100 dark:hover:bg-dark-800 text-gray-700 dark:text-gray-300 w-full text-left">
                <Hash className="w-4 h-4 text-purple-500" />
                <span>personal</span>
                <span className="ml-auto text-xs text-gray-500">5</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
