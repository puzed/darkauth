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
import EmailResetPasswordView from "./components/EmailResetPasswordView";
import ForgotPasswordView from "./components/ForgotPasswordView";
import LoginView from "./components/LoginView";
import OrganizationDetail from "./components/OrganizationDetail";
import OtpSetupView from "./components/OtpSetupView";
import OtpVerifyView from "./components/OtpVerifyView";
import Profile from "./components/Profile";
import RegisterView from "./components/RegisterView";
import SettingsSecurityView from "./components/SettingsSecurityView";
import SwitchOrg from "./components/SwitchOrg";
import { UserPortalProvider } from "./components/UserPortalContext";
import VerifyEmailView from "./components/VerifyEmailView";
import apiService, { type UserOrganization } from "./services/api";
import { clearAllDrk } from "./services/drkStorage";
import { clearAllExportKeys } from "./services/sessionKey";
import { clearAllUnlockedArks } from "./services/unlockedArk";
import "./App.css";
import ThemeToggle from "./components/ThemeToggle";
import { useBranding } from "./hooks/useBranding";
import { logger } from "./services/logger";

interface SessionData {
  sub: string;
  name?: string;
  email?: string;
  signInEmail?: string | null;
  emailVerified?: boolean;
  emailVerifiedAt?: string | null;
  pendingEmail?: string | null;
  pendingEmailSetAt?: string | null;
  passwordResetRequired?: boolean;
  keyState?: "locked" | "unlocked" | "setup_required";
  organizationId?: string;
  organizationSlug?: string;
}

interface AuthRequest {
  requestId: string;
  clientName: string;
  scopes: string[];
  scopeDescriptions?: Record<string, string>;
  hasZk: boolean;
  keyDeliveryVersion?: "v1-drk" | "v2";
  deliveredKeyKind?: "root_key" | "client_app_key";
  clientKeyScope?: "account" | "organization";
  clientId?: string;
  redirectUri?: string;
  state?: string;
  zkPub?: string;
  organizationId?: string;
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
  const [organizations, setOrganizations] = useState<UserOrganization[]>([]);
  const [organizationsLoading, setOrganizationsLoading] = useState(false);
  const [activeOrganizationLabel, setActiveOrganizationLabel] = useState<string | null>(null);
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
          keyState: session.keyState || "locked",
          organizationId: session.organizationId,
          organizationSlug: session.organizationSlug,
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
    const keyDeliveryVersion = params.get("key_delivery_version") === "v1-drk" ? "v1-drk" : "v2";
    const deliveredKeyKind =
      params.get("delivered_key_kind") === "root_key" ? "root_key" : "client_app_key";
    const clientKeyScope =
      params.get("client_key_scope") === "account" ? "account" : "organization";
    const clientId = params.get("client_id") || undefined;
    const redirectUri = params.get("redirect_uri") || undefined;
    const state = params.get("state") || undefined;
    const zkPub = params.get("zk_pub") || undefined;
    const organizationId = params.get("organization_id") || undefined;
    setAuthRequest((current) => {
      if (
        current &&
        current.requestId === reqId &&
        current.clientName === clientName &&
        JSON.stringify(current.scopeDescriptions || {}) ===
          JSON.stringify(scopeDescriptions || {}) &&
        current.hasZk === hasZk &&
        current.keyDeliveryVersion === keyDeliveryVersion &&
        current.deliveredKeyKind === deliveredKeyKind &&
        current.clientKeyScope === clientKeyScope &&
        current.clientId === clientId &&
        current.redirectUri === redirectUri &&
        current.state === state &&
        current.zkPub === zkPub &&
        current.organizationId === organizationId &&
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
        keyDeliveryVersion,
        deliveredKeyKind,
        clientKeyScope,
        clientId,
        redirectUri,
        state,
        zkPub,
        organizationId,
      };
    });
    setAuthRequestSearch(search);
  }, [location.search]);

  useEffect(() => {
    initializeApp();
  }, [initializeApp]);

  const refreshOrganizations = useCallback(async () => {
    try {
      setOrganizationsLoading(true);
      const response = await apiService.getOrganizations();
      setOrganizations(response.organizations || []);
      return response.organizations || [];
    } finally {
      setOrganizationsLoading(false);
    }
  }, []);

  const sessionSub = sessionData?.sub || "";
  const activeOrganizationId = sessionData?.organizationId || "";
  const isOtpRoute = location.pathname === "/otp/setup" || location.pathname === "/otp/verify";

  useEffect(() => {
    if (!sessionSub || isOtpRoute) {
      setOrganizations([]);
      setOrganizationsLoading(false);
      setActiveOrganizationLabel(null);
      return;
    }
    let cancelled = false;
    setOrganizationsLoading(true);
    apiService
      .getOrganizations()
      .then((response) => {
        if (!cancelled) setOrganizations(response.organizations || []);
      })
      .catch(() => {
        if (!cancelled) setOrganizations([]);
      })
      .finally(() => {
        if (!cancelled) setOrganizationsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOtpRoute, sessionSub]);

  useEffect(() => {
    const handleSessionExpired = () => {
      setSessionData(null);
      clearAllExportKeys();
      clearAllDrk();
      clearAllUnlockedArks();
    };

    apiService.setSessionExpiredCallback(handleSessionExpired);
  }, []);

  const authRequestId = authRequest?.requestId || "";
  const authClientId = authRequest?.clientId || "";
  const authScopesValue = authRequest?.scopes.join(" ") || "";
  const activeOrganizations = useMemo(
    () =>
      organizations.filter((organization) =>
        organization.status ? organization.status === "active" : true
      ),
    [organizations]
  );
  const currentOrganization = useMemo(() => {
    if (!sessionSub) return null;
    return (
      activeOrganizations.find(
        (organization) => organization.organizationId === activeOrganizationId
      ) ||
      (!activeOrganizationId && activeOrganizations.length === 1 ? activeOrganizations[0] : null)
    );
  }, [activeOrganizationId, activeOrganizations, sessionSub]);
  const organizationLabel = activeOrganizationLabel;

  useEffect(() => {
    if (currentOrganization?.name) {
      setActiveOrganizationLabel(currentOrganization.name);
      return;
    }
    if (!sessionData?.organizationId && sessionData?.organizationSlug) {
      setActiveOrganizationLabel(sessionData.organizationSlug);
    }
  }, [currentOrganization, sessionData?.organizationId, sessionData?.organizationSlug]);

  useEffect(() => {
    if (!sessionSub || !currentOrganization || activeOrganizationId) return;
    setSessionData((current) =>
      current
        ? {
            ...current,
            organizationId: currentOrganization.organizationId,
            organizationSlug: currentOrganization.slug,
          }
        : current
    );
  }, [activeOrganizationId, currentOrganization, sessionSub]);

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

  const updateSessionOrganization = (organization: {
    organizationId: string;
    organizationSlug?: string;
  }) => {
    const matchingOrganization = activeOrganizations.find(
      (item) => item.organizationId === organization.organizationId
    );
    if (matchingOrganization) setActiveOrganizationLabel(matchingOrganization.name);
    setSessionData((current) =>
      current
        ? {
            ...current,
            organizationId: organization.organizationId,
            organizationSlug: organization.organizationSlug,
          }
        : current
    );
    refreshOrganizations().catch(() => {});
  };

  const addCreatedOrganization = useCallback((organization: UserOrganization) => {
    setOrganizations((current) => [
      ...current.filter((item) => item.organizationId !== organization.organizationId),
      organization,
    ]);
    setActiveOrganizationLabel(organization.name);
  }, []);

  const switchOrganization = useCallback(
    async (organizationId: string) => {
      const matchingOrganization = activeOrganizations.find(
        (organization) => organization.organizationId === organizationId
      );
      if (matchingOrganization) setActiveOrganizationLabel(matchingOrganization.name);
      const response = await apiService.setSessionOrganization(organizationId);
      setSessionData((current) =>
        current
          ? {
              ...current,
              organizationId: response.organizationId,
              organizationSlug: response.organizationSlug,
            }
          : current
      );
      await refreshOrganizations();
    },
    [activeOrganizations, refreshOrganizations]
  );

  const userPortalContext = useMemo(
    () => ({
      organizations,
      organizationsLoading,
      activeOrganizationId: sessionData?.organizationId,
      activeOrganizationLabel: organizationLabel,
      switchOrganization,
      refreshOrganizations,
      addCreatedOrganization,
    }),
    [
      addCreatedOrganization,
      organizations,
      organizationsLoading,
      organizationLabel,
      refreshOrganizations,
      sessionData?.organizationId,
      switchOrganization,
    ]
  );

  const updateSessionProfile = (profile: {
    name?: string | null;
    email?: string | null;
    signInEmail?: string | null;
  }) => {
    setSessionData((current) =>
      current
        ? {
            ...current,
            name: profile.name ?? undefined,
            email: profile.email ?? undefined,
            signInEmail: profile.signInEmail ?? current.signInEmail,
          }
        : current
    );
  };

  const handleLogin = (userData: SessionData) => {
    setSessionData(userData);
    if (hasPendingRequest || authRequest) {
      navigate(appendSearch("/authorize"));
    } else {
      navigate("/apps");
    }
  };

  const handleRegister = (userData: SessionData) => {
    setSessionData(userData);
    if (hasPendingRequest || authRequest) {
      navigate(appendSearch("/authorize"));
    } else {
      navigate("/apps");
    }
  };

  const handleLogout = async () => {
    try {
      await apiService.logout();
      clearAllExportKeys();
      clearAllDrk();
      clearAllUnlockedArks();
      setSessionData(null);
      setAuthRequest(null);
      setAuthRequestSearch(null);
      navigate("/login");
    } catch (error) {
      logger.error(error, "Logout failed");
    }
  };
  return (
    <UserPortalProvider value={userPortalContext}>
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
                <Navigate to="/apps" replace />
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
                to={hasPendingRequest || authRequest ? appendSearch("/authorize") : "/apps"}
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
        <Route path="/forgot-password" element={<ForgotPasswordView />} />
        <Route path="/reset-password" element={<EmailResetPasswordView />} />
        <Route
          path="/signup"
          element={
            sessionData ? (
              <Navigate
                to={hasPendingRequest || authRequest ? appendSearch("/authorize") : "/apps"}
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
        <Route path="/verify-email" element={<VerifyEmailView />} />
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
              <Navigate to="/apps" replace />
            ) : sessionData.passwordResetRequired ? (
              <Navigate to="/security/password" replace />
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
          path="/switch-org"
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
              <Navigate to={`/login${location.search}`} replace />
            ) : sessionData.passwordResetRequired ? (
              <Navigate to="/security/password" replace />
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
                  <SwitchOrg
                    sessionData={sessionData}
                    onOrganizationChanged={updateSessionOrganization}
                  />
                </div>
              </div>
            )
          }
        />
        <Route
          path="/apps"
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
              <Navigate to="/security/password" replace />
            ) : hasPendingRequest || authRequest ? (
              <Navigate to={appendSearch("/authorize")} replace />
            ) : (
              <OtpGate>
                <Dashboard sessionData={sessionData} onLogout={handleLogout} />
              </OtpGate>
            )
          }
        />
        <Route path="/dashboard" element={<Navigate to="/apps" replace />} />
        <Route
          path="/security"
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
        <Route path="/settings" element={<Navigate to="/security" replace />} />
        <Route
          path="/profile"
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
                <Profile
                  sessionData={sessionData}
                  onLogout={handleLogout}
                  onProfileChanged={updateSessionProfile}
                />
              </OtpGate>
            )
          }
        />
        <Route
          path="/organizations/:organizationId"
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
                <OrganizationDetail
                  sessionData={sessionData}
                  onLogout={handleLogout}
                  onOrganizationChanged={updateSessionOrganization}
                />
              </OtpGate>
            )
          }
        />
        <Route
          path="/security/password"
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
        <Route path="/change-password" element={<Navigate to="/security/password" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </UserPortalProvider>
  );
}

function OtpGate({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [redirect, setRedirect] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let session: Awaited<ReturnType<typeof apiService.getSession>> | null = null;
      let status: Awaited<ReturnType<typeof apiService.getOtpStatus>> | null = null;
      try {
        session = await apiService.getSession();
      } catch {}
      try {
        status = await apiService.getOtpStatus();
      } catch {}
      const otpRequired = !!session?.otpRequired || !!status?.required;
      const otpVerified = !!session?.otpVerified;
      if (!cancelled && otpRequired && !otpVerified) {
        setRedirect(status && !status.enabled ? "/otp/setup?forced=1" : "/otp/verify");
      }
      if (!cancelled) {
        setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
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
