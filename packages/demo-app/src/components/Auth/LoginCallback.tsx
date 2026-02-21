import { handleCallback } from "@DarkAuth/client";
import React from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../../stores/authStore";

export function LoginCallback() {
  const navigate = useNavigate();
  const { clearSession, setSession } = useAuthStore();
  const [error, setError] = React.useState<string | null>(null);

  const processCallback = React.useCallback(async () => {
    try {
      const params = new URLSearchParams(window.location.search);
      const callbackError = params.get("error");
      if (callbackError === "access_denied") {
        clearSession();
        navigate(`/${window.location.search}`, { replace: true });
        return;
      }
      const session = await handleCallback();
      if (session) {
        setSession(session);
        navigate("/", { replace: true });
      } else {
        clearSession();
        navigate("/", { replace: true });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    }
  }, [clearSession, navigate, setSession]);

  React.useEffect(() => {
    void processCallback();
  }, [processCallback]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-dark-900">
        <div className="max-w-md w-full p-8 bg-white dark:bg-dark-800 rounded-xl shadow-lg">
          <div className="text-center">
            <div className="w-16 h-16 bg-red-100 dark:bg-red-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl">❌</span>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              Authentication Failed
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mb-6">{error}</p>
            <button
              type="button"
              onClick={() => {
                window.location.href = "/";
              }}
              className="btn-primary w-full"
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-dark-900">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
        <p className="text-gray-600 dark:text-gray-400">Processing authentication...</p>
      </div>
    </div>
  );
}
