import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Navigate,
  Route,
  BrowserRouter as Router,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import Authorize from "./components/Authorize";
import ChangePasswordView from "./components/ChangePasswordView";
import Dashboard from "./components/Dashboard";
import LoginView from "./components/LoginView";
import OtpSetupView from "./components/OtpSetupView";
import OtpVerifyView from "./components/OtpVerifyView";
import RegisterView from "./components/RegisterView";
import SettingsSecurityView from "./components/SettingsSecurityView";
import apiService from "./services/api";
import { clearAllDrk } from "./services/drkStorage";
import { clearAllExportKeys } from "./services/sessionKey";
import "./App.css";
import ThemeToggle from "./components/ThemeToggle";
import { useBranding } from "./hooks/useBranding";
import { logger } from "./services/logger";

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
  scopeDescriptions?: Record<string, string>;
  hasZk: boolean;
  clientId?: string;
  redirectUri?: string;
  state?: string;
  zkPub?: string;
}

function decodeBase64Url(value: string): string {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = (4 - (base64.length % 4)) % 4;
  return atob(`${base64}${"=".repeat(padding)}`);
}

function AppContent() {
  const branding = useBranding();
  const navigate = useNavigate();
  const location = useLocation();
  const [sessionData, setSessionData] = useState<SessionData | null>(null);
  const [authRequest, setAuthRequest] = useState<AuthRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [authRequestSearch, setAuthRequestSearch] = useState<string | null>(null);
  const selfRegistrationEnabled = !!window.__APP_CONFIG__?.features?.selfRegistrationEnabled;

  const normalizedSearch = authRequestSearch ?? location.search;
  const pendingRequestId = useMemo(() => {
    if (!normalizedSearch) return null;
    try {
      const params = new URLSearchParams(normalizedSearch);
      return params.get("request_id");
    } catch {
      return null;
    }
  }, [normalizedSearch]);
  const hasPendingRequest = !!pendingRequestId;

  const appendSearch = useCallback(
    (path: string) =>
      normalizedSearch && normalizedSearch.length > 0 ? `${path}${normalizedSearch}` : path,
    [normalizedSearch]
  );

  const initializeApp = useCallback(async () => {
    try {
      const session = await apiService.getSession();
      if (session.authenticated) {
        setSessionData({
          sub: session.sub as string,
          name: session.name,
          email: session.email,
          passwordResetRequired: !!session.passwordResetRequired,
        });
        try {
          await apiService.getOtpStatus();
        } catch {}
      }
    } catch (_error) {
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const search = location.search;
    const params = new URLSearchParams(search);
    const reqId = params.get("request_id");
    if (!reqId) {
      setAuthRequest(null);
      setAuthRequestSearch(null);
      return;
    }
    const clientName = params.get("client_name") || "Application";
    const scopes = (params.get("scopes") || "").split(/\s+/).filter(Boolean);
    const scopeDescriptionsParam = params.get("scope_descriptions");
    let scopeDescriptions: Record<string, string> | undefined;
    if (scopeDescriptionsParam) {
      try {
        const decoded = decodeBase64Url(scopeDescriptionsParam);
        const parsed = JSON.parse(decoded) as Record<string, unknown>;
        scopeDescriptions = Object.fromEntries(
          Object.entries(parsed).filter(
            (entry): entry is [string, string] =>
              typeof entry[0] === "string" && typeof entry[1] === "string"
          )
        );
      } catch {}
    }
    for (const [key, value] of params.entries()) {
      if (!key.startsWith("scope_desc_")) continue;
      const scopeKey = key.slice("scope_desc_".length).trim();
      const description = value.trim();
      if (!scopeKey || !description) continue;
      scopeDescriptions = scopeDescriptions || {};
      scopeDescriptions[scopeKey] = description;
    }
    const hasZk = params.get("has_zk") === "1";
    const clientId = params.get("client_id") || undefined;
    const redirectUri = params.get("redirect_uri") || undefined;
    const state = params.get("state") || undefined;
    const zkPub = params.get("zk_pub") || undefined;
    setAuthRequest((current) => {
      if (
        current &&
        current.requestId === reqId &&
        current.clientName === clientName &&
        JSON.stringify(current.scopeDescriptions || {}) ===
          JSON.stringify(scopeDescriptions || {}) &&
        current.hasZk === hasZk &&
        current.clientId === clientId &&
        current.redirectUri === redirectUri &&
        current.state === state &&
        current.zkPub === zkPub &&
        current.scopes.join(" ") === scopes.join(" ")
      ) {
        return current;
      }
      return {
        requestId: reqId,
        clientName,
        scopes,
        scopeDescriptions,
        hasZk,
        clientId,
        redirectUri,
        state,
        zkPub,
      };
    });
    setAuthRequestSearch(search);
  }, [location.search]);

  useEffect(() => {
    initializeApp();
  }, [initializeApp]);

  useEffect(() => {
    const handleSessionExpired = () => {
      setSessionData(null);
      clearAllExportKeys();
      clearAllDrk();
    };

    apiService.setSessionExpiredCallback(handleSessionExpired);
  }, []);

  const authRequestId = authRequest?.requestId || "";
  const authClientId = authRequest?.clientId || "";
  const authScopesValue = authRequest?.scopes.join(" ") || "";

  useEffect(() => {
    if (!authRequestId || !authClientId || !authScopesValue) {
      return;
    }
    let cancelled = false;
    const scopes = authScopesValue.split(/\s+/).filter(Boolean);
    apiService
      .getClientScopeDescriptions(authClientId, scopes)
      .then((descriptions) => {
        if (cancelled || Object.keys(descriptions).length === 0) {
          return;
        }
        setAuthRequest((current) => {
          if (!current || current.requestId !== authRequestId) {
            return current;
          }
          const nextDescriptions = { ...(current.scopeDescriptions || {}), ...descriptions };
          if (
            JSON.stringify(nextDescriptions) === JSON.stringify(current.scopeDescriptions || {})
          ) {
            return current;
          }
          return { ...current, scopeDescriptions: nextDescriptions };
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [authClientId, authRequestId, authScopesValue]);

  const handleLogin = (userData: SessionData) => {
    setSessionData(userData);
    if (hasPendingRequest || authRequest) {
      navigate(appendSearch("/authorize"));
    } else {
      navigate("/dashboard");
    }
  };

  const handleRegister = (userData: SessionData) => {
    setSessionData(userData);
    if (hasPendingRequest || authRequest) {
      navigate(appendSearch("/authorize"));
    } else {
      navigate("/dashboard");
    }
  };

  const handleLogout = async () => {
    try {
      await apiService.logout();
      clearAllExportKeys();
      clearAllDrk();
      setSessionData(null);
      setAuthRequest(null);
      setAuthRequestSearch(null);
      navigate("/login");
    } catch (error) {
      logger.error(error, "Logout failed");
    }
  };
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
            hasPendingRequest || authRequest ? (
              <Navigate to={appendSearch("/authorize")} replace />
            ) : (
              <Navigate to="/dashboard" replace />
            )
          ) : (
            <Navigate to={appendSearch("/login")} replace />
          )
        }
      />
      <Route
        path="/login"
        element={
          sessionData ? (
            <Navigate
              to={hasPendingRequest || authRequest ? appendSearch("/authorize") : "/dashboard"}
              replace
            />
          ) : (
            <LoginView
              onLogin={handleLogin}
              onSwitchToRegister={() => navigate(appendSearch("/signup"))}
            />
          )
        }
      />
      <Route
        path="/signup"
        element={
          sessionData ? (
            <Navigate
              to={hasPendingRequest || authRequest ? appendSearch("/authorize") : "/dashboard"}
              replace
            />
          ) : selfRegistrationEnabled ? (
            <RegisterView
              onRegister={handleRegister}
              onSwitchToLogin={() => navigate(appendSearch("/login"))}
            />
          ) : (
            <Navigate to={appendSearch("/login")} replace />
          )
        }
      />
      <Route
        path="/otp/setup"
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
            <OtpSetupView sessionData={sessionData} onLogout={handleLogout} />
          )
        }
      />
      <Route path="/otp-setup" element={<Navigate to="/otp/setup" replace />} />
      <Route path="/otp" element={<Navigate to="/otp/verify" replace />} />
      <Route path="/otp/verify" element={<OtpVerifyView />} />
      <Route
        path="/authorize"
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
            <Navigate to={appendSearch("/login")} replace />
          ) : !authRequest && hasPendingRequest ? (
            <div className="loading-container">
              <div className="loading-spinner" />
              <p>Loading...</p>
            </div>
          ) : !authRequest ? (
            <Navigate to="/dashboard" replace />
          ) : sessionData.passwordResetRequired ? (
            <Navigate to="/change-password" replace />
          ) : (
            <div className="app da-app">
              <div className="container da-container">
                <div className="header da-header authorize-page-header">
                  <div className="brand da-brand">
                    <span className="brand-icon da-brand-icon">
                      <img src={branding.getLogoUrl()} alt={branding.getTitle()} />
                    </span>
                    <h1 className="da-brand-title">{branding.getTitle()}</h1>
                  </div>
                  <div className="user-info da-user-info authorize-page-actions">
                    <ThemeToggle />
                  </div>
                </div>
                <Authorize authRequest={authRequest} sessionData={sessionData} />
              </div>
            </div>
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
          ) : hasPendingRequest || authRequest ? (
            <Navigate to={appendSearch("/authorize")} replace />
          ) : (
            <OtpGate>
              <Dashboard sessionData={sessionData} onLogout={handleLogout} />
            </OtpGate>
          )
        }
      />
      <Route
        path="/settings"
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
            <OtpGate>
              <SettingsSecurityView sessionData={sessionData} onLogout={handleLogout} />
            </OtpGate>
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
            <OtpGate>
              <ChangePasswordView sessionData={sessionData} onLogout={handleLogout} />
            </OtpGate>
          )
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function OtpGate({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [redirect, setRedirect] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      try {
        const session = await apiService.getSession();
        const otpReq = !!session.otpRequired;
        const otpVer = !!session.otpVerified;
        if (otpReq && !otpVer) {
          try {
            const s = await apiService.getOtpStatus();
            setRedirect(s.enabled ? "/otp/verify" : "/otp/setup?forced=1");
          } catch {
            setRedirect("/otp/verify");
          }
        }
      } catch {
      } finally {
        setReady(true);
      }
    })();
  }, []);
  if (!ready)
    return (
      <div className="loading-container">
        <div className="loading-spinner" />
        <p>Loading...</p>
      </div>
    );
  if (redirect) return <Navigate to={redirect} replace />;
  return <>{children}</>;
}

function App() {
  return (
    <Router>
      <AppContent />
    </Router>
  );
}

export default App;
