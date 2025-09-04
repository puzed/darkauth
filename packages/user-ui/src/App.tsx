import { useCallback, useEffect, useState } from "react";
import { Navigate, Route, BrowserRouter as Router, Routes } from "react-router-dom";
import Authorize from "./components/Authorize";
import ChangePassword from "./components/ChangePassword";
import LoginView from "./components/LoginView";
import Register from "./components/Register";
import apiService from "./services/api";
import { clearExportKey } from "./services/sessionKey";
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

function App() {
  const branding = useBranding();
  const [sessionData, setSessionData] = useState<SessionData | null>(null);
  const [authRequest, setAuthRequest] = useState<AuthRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState<"login" | "register">("login");
  const [changingPassword, setChangingPassword] = useState(false);

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
      clearExportKey(sessionData?.sub || "");
      // Clear any auth request from window
      if (window.authRequest) {
        window.authRequest = undefined;
      }
    });

    initializeApp();
  }, [initializeApp, sessionData?.sub]);

  const handleRegister = (userData: SessionData) => {
    setSessionData(userData);
  };

  const handleLogout = async () => {
    try {
      await apiService.logout();
      if (sessionData?.sub) clearExportKey(sessionData.sub);
      setSessionData(null);
      setAuthRequest(null);
      // Clear any auth request from window
      if (window.authRequest) {
        window.authRequest = undefined;
      }
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  const switchPage = (newPage: "login" | "register") => {
    setPage(newPage);
  };

  if (loading) {
    return (
      <div className="app da-app">
        <div className="container da-container">
          <div className="loading-container">
            <div className="loading-spinner" />
            <p>Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  // Force password reset before anything else
  if (sessionData?.passwordResetRequired) {
    return (
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
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <ThemeToggle />
            </div>
          </div>
          <ChangePassword
            sub={sessionData.sub}
            email={sessionData.email}
            onSuccess={async () => {
              const s = await apiService.getSession();
              setSessionData({
                sub: s.sub as string,
                name: s.name,
                email: s.email,
                passwordResetRequired: !!s.passwordResetRequired,
              });
            }}
          />
          <div className="actions" style={{ justifyContent: "flex-end" }}>
            <button type="button" className="logout-button" onClick={handleLogout}>
              {branding.getText("signout", "Sign Out")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // If user is authenticated and there's an auth request, show either change-password or authorize
  if (sessionData && authRequest) {
    if (changingPassword) {
      return (
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
              <div className="user-info da-user-info" style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <ThemeToggle />
              </div>
            </div>
            <ChangePassword
              sub={sessionData.sub}
              email={sessionData.email}
              onSuccess={async () => {
                const s = await apiService.getSession();
                setSessionData({
                  sub: s.sub as string,
                  name: s.name,
                  email: s.email,
                  passwordResetRequired: !!s.passwordResetRequired,
                });
                setChangingPassword(false);
              }}
            />
          </div>
        </div>
      );
    }
    return (
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
            <div className="user-info da-user-info" style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <ThemeToggle />
            </div>
          </div>
          <Authorize authRequest={authRequest} sessionData={sessionData} />
        </div>
      </div>
    );
  }

  // If user is authenticated but no auth request, show success message
  if (sessionData) {
    if (changingPassword) {
      return (
        <div className="app da-app">
          <div className="container da-container">
            <div className="header da-header">
              <div className="brand da-brand">
                <span className="brand-icon da-brand-icon">
                  <img src={branding.getLogoUrl()} alt={branding.getTitle()} />
                </span>
                <h1 className="da-brand-title">{branding.getTitle()}</h1>
              </div>
              <div className="user-info da-user-info"></div>
            </div>
            <ChangePassword
              sub={sessionData.sub}
              email={sessionData.email}
              onSuccess={async () => {
                const s = await apiService.getSession();
                setSessionData({
                  sub: s.sub as string,
                  name: s.name,
                  email: s.email,
                  passwordResetRequired: !!s.passwordResetRequired,
                });
                setChangingPassword(false);
              }}
            />
          </div>
        </div>
      );
    }
    return (
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
              <button
                type="button"
                className="link-button da-button-link"
                onClick={() => setChangingPassword(true)}
              >
                {branding.getText("changePassword", "Change Password")}
              </button>
              <button
                type="button"
                className="logout-button da-button da-button-secondary"
                onClick={handleLogout}
              >
                {branding.getText("signout", "Sign Out")}
              </button>
            </div>
          </div>
          <div className="authenticated-state">
            <div className="success-icon">
              <svg
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <title>Successfully authenticated</title>
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            </div>
            <h2 className="da-success-title">
              {branding.getText("successAuth", "Successfully authenticated")}
            </h2>
            <div className="user-details">
              <p>
                <strong>Name</strong>
                <span>{sessionData.name || "Not provided"}</span>
              </p>
              <p>
                <strong>Email</strong>
                <span>{sessionData.email}</span>
              </p>
              <p>
                <strong>User ID</strong>
                <code>{sessionData.sub}</code>
              </p>
            </div>
            <p className="info-text">
              You are securely logged in to {branding.getTitle()}. If you accessed this page through
              an application's login flow, you can now return to that application.
            </p>
            <div className="actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setChangingPassword(true)}
              >
                {branding.getText("changePassword", "Change Password")}
              </button>
              <button type="button" className="logout-button" onClick={handleLogout}>
                {branding.getText("signout", "Sign Out")}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // User not authenticated, show unified LoginView used by admin preview
  return (
    <Router>
      <Routes>
        <Route
          path="/"
          element={
            page === "login" ? (
              <LoginView
                onLogin={setSessionData}
                onSwitchToRegister={() => switchPage("register")}
              />
            ) : (
              <Register onRegister={handleRegister} onSwitchToLogin={() => switchPage("login")} />
            )
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
