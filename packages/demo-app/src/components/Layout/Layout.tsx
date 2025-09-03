import React from "react";
import { Outlet } from "react-router-dom";
import { Header } from "./Header";
import { useAuthStore } from "../../stores/authStore";
import { Sidebar } from "./Sidebar";
import clsx from "clsx";

export function Layout() {
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(false);
  const { session } = useAuthStore();

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-dark-900">
      <Header 
        onMenuToggle={() => setIsSidebarOpen(!isSidebarOpen)} 
        isSidebarOpen={isSidebarOpen}
      />
      
      <div className="flex-1 flex overflow-hidden">
        <Sidebar isOpen={isSidebarOpen} />
        
        {/* Mobile sidebar overlay */}
        {isSidebarOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-30 lg:hidden"
            onClick={() => setIsSidebarOpen(false)}
          />
        )}
        
        <main className="flex-1 overflow-y-auto bg-white dark:bg-dark-900">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
