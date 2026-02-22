import { getStoredSession, initiateLogin, refreshSession } from "@DarkAuth/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { LoginCallback } from "./components/Auth/LoginCallback";
import { Dashboard } from "./components/Dashboard/Dashboard";
import { NoteEditor } from "./components/Editor/NoteEditor";
import { Layout } from "./components/Layout/Layout";
import { useAuthStore } from "./stores/authStore";

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
  const [oauthError, setOauthError] = React.useState<string | null>(null);

  const startLogin = React.useCallback(async () => {
    await initiateLogin();
  }, []);

  const checkAuth = React.useCallback(async () => {
    const params = new URLSearchParams(window.location.search);
    const error = params.get("error");
    const errorDescription = params.get("error_description");
    if (error === "access_denied") {
      setOauthError(errorDescription || "Authorization request was denied.");
    } else {
      setOauthError(null);
    }

    if (location.search.includes("code=")) {
      window.location.href = `/callback${location.search}${location.hash}`;
      return;
    }

    let session = getStoredSession();

    if (!session) {
      session = await refreshSession();
    }

    if (session) {
      setSession(session);
    }
    setIsLoading(false);
  }, [setSession]);

  React.useEffect(() => {
    void checkAuth();
  }, [checkAuth]);

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

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-dark-900">
        <div className="max-w-md w-full p-8 bg-white dark:bg-dark-800 rounded-xl shadow-lg">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              Login to access the app
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              You need to authorize with DarkAuth before viewing your notes.
            </p>
            {oauthError ? (
              <p className="text-sm text-amber-500 dark:text-amber-400 mb-4">{oauthError}</p>
            ) : null}
            <button type="button" onClick={() => void startLogin()} className="btn-primary w-full">
              Login
            </button>
          </div>
        </div>
      </div>
    );
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
            <Route
              path="profile"
              element={<div className="p-6">Profile Settings (Coming Soon)</div>}
            />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
