import { useCallback, useEffect, useState } from "react";
import { Navigate, Route, BrowserRouter as Router, Routes, useNavigate } from "react-router-dom";
import Authorize from "./components/Authorize";
import ChangePasswordView from "./components/ChangePasswordView";
import Dashboard from "./components/Dashboard";
import LoginView from "./components/LoginView";
import RegisterView from "./components/RegisterView";
import apiService from "./services/api";
import { clearAllExportKeys } from "./services/sessionKey";
import "./App.css";
import ThemeToggle from "./components/ThemeToggle";
import { useBranding } from "./hooks/useBranding";

declare global {
  interface Window {
    authRequest?: AuthRequest;
  }
}

interface SessionData {
  sub: string;
  name?: string;
  email?: string;
  passwordResetRequired?: boolean;
}

interface AuthRequest {
  requestId: string;
  clientName: string;
  scopes: string[];
  hasZk: boolean;
}

function AppContent() {
  const branding = useBranding();
  const navigate = useNavigate();
  const [sessionData, setSessionData] = useState<SessionData | null>(null);
  const [authRequest, setAuthRequest] = useState<AuthRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const selfRegistrationEnabled = !!window.__APP_CONFIG__?.features?.selfRegistrationEnabled;

  const initializeApp = useCallback(async () => {
    try {
      const url = new URL(window.location.href);
      const reqId = url.searchParams.get("request_id");
      if (reqId) {
        const clientName = url.searchParams.get("client_name") || "Application";
        const scopes = (url.searchParams.get("scopes") || "").split(/\s+/).filter(Boolean);
        const hasZk = url.searchParams.get("has_zk") === "1";
        setAuthRequest({ requestId: reqId, clientName, scopes, hasZk });
      }

      // Check existing session
      const session = await apiService.getSession();
      if (session.authenticated) {
        setSessionData({
          sub: session.sub as string,
          name: session.name,
          email: session.email,
          passwordResetRequired: !!session.passwordResetRequired,
        });
      }
    } catch (_error) {
      console.log("No existing session or auth request");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Set up session expiration callback
    apiService.setSessionExpiredCallback(() => {
      setSessionData(null);
      setAuthRequest(null);
      // Clear all export keys when session expires
      clearAllExportKeys();
      // Clear any auth request from window
      if (window.authRequest) {
        window.authRequest = undefined;
      }
    });

    initializeApp();
  }, [initializeApp]);

  const handleLogin = (userData: SessionData) => {
    setSessionData(userData);
    if (authRequest) {
      // Stay on current page to handle auth request
    } else {
      navigate("/dashboard");
    }
  };

  const handleRegister = (userData: SessionData) => {
    setSessionData(userData);
    if (authRequest) {
      // Stay on current page to handle auth request
    } else {
      navigate("/dashboard");
    }
  };

  const handleLogout = async () => {
    try {
      await apiService.logout();
      // Clear all export keys for comprehensive cleanup
      clearAllExportKeys();
      setSessionData(null);
      setAuthRequest(null);
      // Clear any auth request from window
      if (window.authRequest) {
        window.authRequest = undefined;
      }
      navigate("/login");
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  // Handle routing
  return (
    <Routes>
      <Route
        path="/"
        element={
          loading ? (
            <div className="app da-app">
              <div className="container da-container">
                <div className="loading-container">
                  <div className="loading-spinner" />
                  <p>Loading...</p>
                </div>
              </div>
            </div>
          ) : sessionData ? (
            <Navigate to="/dashboard" replace />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
      <Route
        path="/login"
        element={
          sessionData && !authRequest ? (
            <Navigate to="/dashboard" replace />
          ) : (
            <LoginView onLogin={handleLogin} onSwitchToRegister={() => navigate("/signup")} />
          )
        }
      />
      <Route
        path="/signup"
        element={
          sessionData && !authRequest ? (
            <Navigate to="/dashboard" replace />
          ) : selfRegistrationEnabled ? (
            <RegisterView onRegister={handleRegister} onSwitchToLogin={() => navigate("/login")} />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
      <Route
        path="/dashboard"
        element={
          loading ? (
            <div className="app da-app">
              <div className="container da-container">
                <div className="loading-container">
                  <div className="loading-spinner" />
                  <p>Loading...</p>
                </div>
              </div>
            </div>
          ) : !sessionData ? (
            <Navigate to="/login" replace />
          ) : sessionData.passwordResetRequired ? (
            <Navigate to="/change-password" replace />
          ) : authRequest ? (
            <div className="app da-app">
              <div className="container da-container">
                <div
                  className="header da-header"
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
                >
                  <div className="brand da-brand">
                    <span className="brand-icon da-brand-icon">
                      <img src={branding.getLogoUrl()} alt={branding.getTitle()} />
                    </span>
                    <h1 className="da-brand-title">{branding.getTitle()}</h1>
                  </div>
                  <div
                    className="user-info da-user-info"
                    style={{ display: "flex", alignItems: "center", gap: 12 }}
                  >
                    <ThemeToggle />
                  </div>
                </div>
                <Authorize authRequest={authRequest} sessionData={sessionData} />
              </div>
            </div>
          ) : (
            <Dashboard sessionData={sessionData} onLogout={handleLogout} />
          )
        }
      />
      <Route
        path="/change-password"
        element={
          loading ? (
            <div className="app da-app">
              <div className="container da-container">
                <div className="loading-container">
                  <div className="loading-spinner" />
                  <p>Loading...</p>
                </div>
              </div>
            </div>
          ) : !sessionData ? (
            <Navigate to="/login" replace />
          ) : (
            <ChangePasswordView sessionData={sessionData} onLogout={handleLogout} />
          )
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <Router>
      <AppContent />
    </Router>
  );
}

export default App;
