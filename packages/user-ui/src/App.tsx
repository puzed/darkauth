import { useCallback, useEffect, useState } from "react";
import { Navigate, Route, BrowserRouter as Router, Routes } from "react-router-dom";
import Authorize from "./components/Authorize";
import ChangePassword from "./components/ChangePassword";
import Login from "./components/Login";
import Register from "./components/Register";
import apiService from "./services/api";
import { clearExportKey } from "./services/sessionKey";
import "./App.css";

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

  const handleLogin = (userData: SessionData) => {
    setSessionData(userData);
  };

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
      <div className="app">
        <div className="container">
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
      <div className="app">
        <div className="container">
          <div className="header">
            <div className="brand">
              <span className="brand-icon">
                <img src="/favicon.svg" alt="DarkAuth" />
              </span>
              <h1>DarkAuth</h1>
            </div>
            <button type="button" className="logout-button" onClick={handleLogout}>
              Sign Out
            </button>
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
        </div>
      </div>
    );
  }

  // If user is authenticated and there's an auth request, show either change-password or authorize
  if (sessionData && authRequest) {
    if (changingPassword) {
      return (
        <div className="app">
          <div className="container">
            <div className="header">
              <div className="brand">
                <span className="brand-icon">
                  <img src="/favicon.svg" alt="DarkAuth" />
                </span>
                <h1>DarkAuth</h1>
              </div>
              <div className="user-info">
                <button
                  type="button"
                  className="link-button"
                  onClick={() => setChangingPassword(false)}
                >
                  Cancel
                </button>
                <button type="button" className="logout-button" onClick={handleLogout}>
                  Sign Out
                </button>
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
      <div className="app">
        <div className="container">
          <div className="header">
            <div className="brand">
              <span className="brand-icon">
                <img src="/favicon.svg" alt="DarkAuth" />
              </span>
              <h1>DarkAuth</h1>
            </div>
            <div className="user-info">
              <span>Signed in as {sessionData.name || sessionData.email}</span>
              <button type="button" className="logout-button" onClick={handleLogout}>
                Sign Out
              </button>
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
        <div className="app">
          <div className="container">
            <div className="header">
              <div className="brand">
                <span className="brand-icon">
                  <img src="/favicon.svg" alt="DarkAuth" />
                </span>
                <h1>DarkAuth</h1>
              </div>
              <div className="user-info">
                <button
                  type="button"
                  className="link-button"
                  onClick={() => setChangingPassword(false)}
                >
                  Cancel
                </button>
                <button type="button" className="logout-button" onClick={handleLogout}>
                  Sign Out
                </button>
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
      <div className="app">
        <div className="container">
          <div className="header">
            <div className="brand">
              <span className="brand-icon">
                <img src="/favicon.svg" alt="DarkAuth" />
              </span>
              <h1>DarkAuth</h1>
            </div>
            <div className="user-info">
              <button
                type="button"
                className="link-button"
                onClick={() => setChangingPassword(true)}
              >
                Change Password
              </button>
              <button type="button" className="logout-button" onClick={handleLogout}>
                Sign Out
              </button>
            </div>
          </div>
          <div className="authenticated-state">
            <div className="success-icon">✅</div>
            <h2>Successfully Authenticated</h2>
            <div className="user-details">
              <p>
                <strong>Name:</strong> {sessionData.name || "Not provided"}
              </p>
              <p>
                <strong>Email:</strong> {sessionData.email}
              </p>
              <p>
                <strong>Subject:</strong> <code>{sessionData.sub}</code>
              </p>
            </div>
            <p className="info-text">
              You are now logged in to DarkAuth. If you arrived here through an application's login
              flow, you can now return to that application.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // User not authenticated, show login/register forms
  return (
    <Router>
      <div className="app">
        <div className="container">
          <div className="auth-header">
            <div className="brand">
              <span className="brand-icon">
                <img src="/favicon.svg" alt="DarkAuth" />
              </span>
              <h1>DarkAuth</h1>
            </div>
            <p className="tagline">Secure Zero-Knowledge Authentication</p>
          </div>

          <Routes>
            <Route
              path="/"
              element={
                page === "login" ? (
                  <Login onLogin={handleLogin} onSwitchToRegister={() => switchPage("register")} />
                ) : (
                  <Register
                    onRegister={handleRegister}
                    onSwitchToLogin={() => switchPage("login")}
                  />
                )
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </div>
    </Router>
  );
}

export default App;
