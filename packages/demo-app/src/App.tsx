import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Layout } from "./components/Layout/Layout";
import { Dashboard } from "./components/Dashboard/Dashboard";
import { NoteEditor } from "./components/Editor/NoteEditor";
import { LoginCallback } from "./components/Auth/LoginCallback";
import { useAuthStore } from "./stores/authStore";
import {
  getStoredSession,
  refreshSession,
  initiateLogin,
  handleCallback,
} from "@DarkAuth/client";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 1,
    },
  },
});

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, setSession } = useAuthStore();
  const [isLoading, setIsLoading] = React.useState(true);
  const [isRedirecting, setIsRedirecting] = React.useState(false);

  React.useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    // Don't process callback here - let the /callback route handle it
    if (location.search.includes("code=")) {
      // We're on the wrong route with a code, redirect to callback
      window.location.href = `/callback${location.search}`;
      return;
    }

    // Check for stored session
    let session = getStoredSession();
    
    if (!session) {
      // Try to refresh the session
      session = await refreshSession();
    }
    
    if (session) {
      setSession(session);
      setIsLoading(false);
    } else if (!isRedirecting) {
      // No valid session, redirect to login
      setIsRedirecting(true);
      setIsLoading(false);
      await initiateLogin();
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-dark-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated && !isRedirecting) {
    // This shouldn't happen but just in case
    setIsRedirecting(true);
    initiateLogin();
    return null;
  }
  
  if (isRedirecting) {
    return null; // Redirecting to login
  }

  return <>{children}</>;
}

export function App() {
  React.useEffect(() => {
    // Apply saved theme preference
    const savedTheme = localStorage.getItem("theme");
    if (savedTheme === "dark") {
      document.documentElement.classList.add("dark");
    } else if (savedTheme === "light") {
      document.documentElement.classList.remove("dark");
    } else {
      // Default to system preference
      if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
        document.documentElement.classList.add("dark");
      }
    }
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/callback" element={<LoginCallback />} />
          <Route
            path="/"
            element={
              <AuthGuard>
                <Layout />
              </AuthGuard>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="notes/:noteId" element={<NoteEditor />} />
            <Route path="recent" element={<Dashboard />} />
            <Route path="starred" element={<Dashboard />} />
            <Route path="shared/with-me" element={<Dashboard />} />
            <Route path="profile" element={<div className="p-6">Profile Settings (Coming Soon)</div>} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
