import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../../services/api";
import { 
  Search, 
  Plus, 
  Share2, 
  User, 
  LogOut, 
  Moon, 
  Sun,
  Menu
} from "lucide-react";
import { useAuthStore } from "../../stores/authStore";
import { logout } from "@DarkAuth/client";

interface HeaderProps {
  onMenuToggle: () => void;
  isSidebarOpen: boolean;
}

export function Header({ onMenuToggle, isSidebarOpen }: HeaderProps) {
  const navigate = useNavigate();
  const { user, clearSession } = useAuthStore();
  const [isDark, setIsDark] = React.useState(
    document.documentElement.classList.contains("dark")
  );
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
    <header className="bg-white dark:bg-dark-800 border-b border-gray-200 dark:border-dark-700 px-4 py-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={onMenuToggle}
            className="lg:hidden p-2 hover:bg-gray-100 dark:hover:bg-dark-700 rounded-lg"
            aria-label="Toggle menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          
          <Link to="/" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-primary-500 to-primary-700 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-lg">D</span>
            </div>
            <span className="text-xl font-bold dark:text-white">DarkNotes</span>
          </Link>
        </div>

        <div className="flex-1 max-w-xl mx-8 hidden md:block">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Search notes..."
              className="input pl-10 w-full"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button className="btn-primary flex items-center gap-2" onClick={handleCreateNote}>
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">New Note</span>
          </button>

          <button
            onClick={toggleTheme}
            className="p-2 hover:bg-gray-100 dark:hover:bg-dark-700 rounded-lg"
            aria-label="Toggle theme"
          >
            {isDark ? (
              <Sun className="w-5 h-5" />
            ) : (
              <Moon className="w-5 h-5" />
            )}
          </button>

          <div className="relative">
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="p-2 hover:bg-gray-100 dark:hover:bg-dark-700 rounded-lg flex items-center gap-2"
            >
              <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center">
                <span className="text-white font-medium">
                  {user?.name?.[0] || user?.email?.[0] || "U"}
                </span>
              </div>
            </button>

            {showUserMenu && (
              <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-dark-800 rounded-lg shadow-lg border border-gray-200 dark:border-dark-700 py-2 z-50">
                <div className="px-4 py-2 border-b border-gray-200 dark:border-dark-700">
                  <p className="font-medium dark:text-white">{user?.name || "User"}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{user?.email}</p>
                </div>
                
                <Link
                  to="/profile"
                  className="flex items-center gap-3 px-4 py-2 hover:bg-gray-100 dark:hover:bg-dark-700"
                  onClick={() => setShowUserMenu(false)}
                >
                  <User className="w-4 h-4" />
                  <span>Profile Settings</span>
                </Link>
                
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-3 px-4 py-2 hover:bg-gray-100 dark:hover:bg-dark-700 w-full text-left text-red-600 dark:text-red-400"
                >
                  <LogOut className="w-4 h-4" />
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
