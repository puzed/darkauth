import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AdminLayout } from "@/components/AdminLayout";
import { DashboardLayout } from "@/components/dashboard-layout";
import AdminLogin from "@/components/Login";
import { Toaster } from "@/components/ui/toaster";
import adminApiService from "@/services/api";
import authService from "@/services/auth";
import { logger } from "@/services/logger";
import AdminOtp from "./pages/AdminOtp";
import AdminUserCreate from "./pages/AdminUserCreate";
import AdminUserEdit from "./pages/AdminUserEdit";
import AdminUsers from "./pages/AdminUsers";
import Analytics from "./pages/Analytics";
import AuditLogDetail from "./pages/AuditLogDetail";
import AuditLogs from "./pages/AuditLogs";
import Branding from "./pages/Branding";
import Changelog from "./pages/Changelog";
import ClientCreate from "./pages/ClientCreate";
import ClientEdit from "./pages/ClientEdit";
import Clients from "./pages/Clients";
import Dashboard from "./pages/Dashboard";
import ErrorPage from "./pages/Error";
import Install from "./pages/Install";
import Keys from "./pages/Keys";
import NotFound from "./pages/NotFound";
import OrganizationCreate from "./pages/OrganizationCreate";
import OrganizationEdit from "./pages/OrganizationEdit";
import Organizations from "./pages/Organizations";
import Permissions from "./pages/Permissions";
import Preview from "./pages/Preview";
import ResetPassword from "./pages/ResetPassword";
import RoleCreate from "./pages/RoleCreate";
import RoleEdit from "./pages/RoleEdit";
import Roles from "./pages/Roles";
import Settings from "./pages/Settings";
import UserCreate from "./pages/UserCreate";
import UserEdit from "./pages/UserEdit";
import Users from "./pages/Users";

const queryClient = new QueryClient();

interface AdminSessionData {
  adminId: string;
  name?: string;
  email?: string;
  role: "read" | "write";
  sessionKey?: string;
  exportKey?: string;
  passwordResetRequired?: boolean;
  otpRequired?: boolean;
  otpVerified?: boolean;
}

const App = () => {
  const [adminSession, setAdminSession] = useState<AdminSessionData | null>(null);
  const [loading, setLoading] = useState(true);

  const checkAdminSession = useCallback(async () => {
    try {
      const session = await adminApiService.getAdminSession();

      if (session.authenticated && session.adminId) {
        const sessionData: AdminSessionData = {
          adminId: session.adminId,
          name: session.name,
          email: session.email,
          role: session.role || "read",
          passwordResetRequired: !!session.passwordResetRequired,
          otpRequired: !!session.otpRequired,
          otpVerified: !!session.otpVerified,
        };

        setAdminSession(sessionData);
        authService.saveSession(sessionData);

        authService.startSessionRefresh(async () => {
          try {
            await adminApiService.getAdminSession();
          } catch (error) {
            logger.error(error, "Session refresh failed");
            setAdminSession(null);
            authService.clearSession();
          }
        });
      } else {
        authService.clearSession();
      }
    } catch (_error) {
      authService.clearSession();
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    adminApiService.setSessionExpiredCallback(() => {
      setAdminSession(null);
    });
    adminApiService.setServerErrorCallback(() => {
      if (window.location.pathname !== "/error") {
        window.location.href = "/error";
      }
    });

    checkAdminSession();
    return () => {
      authService.stopSessionRefresh();
    };
  }, [checkAdminSession]);

  const handleLogin = (adminData: AdminSessionData) => {
    setAdminSession(adminData);
    authService.saveSession(adminData);
    authService.startSessionRefresh(async () => {
      try {
        await adminApiService.getAdminSession();
      } catch (error) {
        logger.error(error, "Session refresh failed");
        setAdminSession(null);
        authService.clearSession();
      }
    });
  };

  const handleLogout = async () => {
    try {
      await adminApiService.logout();
      setAdminSession(null);
      authService.clearSession();
      window.location.assign("/");
    } catch (error) {
      logger.error(error, "Logout failed");
    }
  };

  if (loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "hsl(var(--background))",
        }}
      >
        <div style={{ textAlign: "center", color: "#555" }}>
          <div
            style={{
              width: 64,
              height: 64,
              border: "4px solid #e2e2e2",
              borderTopColor: "hsl(var(--primary))",
              borderRadius: "50%",
              margin: "0 auto 16px",
              animation: "spin 1s linear infinite",
            }}
          />
          <p>Loading admin panel...</p>
        </div>
      </div>
    );
  }

  if (!adminSession) {
    return (
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <Routes>
            <Route path="/otp" element={<Navigate to="/" replace />} />
            <Route path="/preview" element={<Preview />} />
            <Route
              path="/install"
              element={
                <AdminLayout>
                  <Install />
                </AdminLayout>
              }
            />
            <Route
              path="/error"
              element={
                <AdminLayout>
                  <ErrorPage />
                </AdminLayout>
              }
            />
            <Route
              path="/"
              element={
                <AdminLayout>
                  <AdminLogin onLogin={handleLogin} />
                </AdminLayout>
              }
            />
            <Route
              path="*"
              element={
                <AdminLayout>
                  <Navigate to="/" replace />
                </AdminLayout>
              }
            />
          </Routes>
          <AdminLayout>
            <Toaster />
          </AdminLayout>
        </BrowserRouter>
      </QueryClientProvider>
    );
  }

  if (adminSession.passwordResetRequired) {
    return (
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AdminLayout>
            <Routes>
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/error" element={<ErrorPage />} />
              <Route path="*" element={<Navigate to="/reset-password" replace />} />
            </Routes>
            <Toaster />
          </AdminLayout>
        </BrowserRouter>
      </QueryClientProvider>
    );
  }

  if (adminSession.otpRequired && !adminSession.otpVerified) {
    return (
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AdminLayout>
            <Routes>
              <Route path="/otp" element={<AdminOtp />} />
              <Route path="/error" element={<ErrorPage />} />
              <Route path="*" element={<Navigate to="/otp" replace />} />
            </Routes>
            <Toaster />
          </AdminLayout>
        </BrowserRouter>
      </QueryClientProvider>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AdminLayout>
          <Routes>
            <Route path="/preview" element={<Preview />} />
            <Route
              path="/"
              element={
                <DashboardLayout adminSession={adminSession} onLogout={handleLogout}>
                  <Dashboard />
                </DashboardLayout>
              }
            />
            <Route
              path="/otp"
              element={
                <DashboardLayout adminSession={adminSession} onLogout={handleLogout}>
                  <AdminOtp />
                </DashboardLayout>
              }
            />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/error" element={<ErrorPage />} />
            <Route
              path="/users"
              element={
                <DashboardLayout adminSession={adminSession} onLogout={handleLogout}>
                  <Users />
                </DashboardLayout>
              }
            />
            <Route
              path="/users/new"
              element={
                <DashboardLayout adminSession={adminSession} onLogout={handleLogout}>
                  <UserCreate />
                </DashboardLayout>
              }
            />
            <Route
              path="/users/:sub"
              element={
                <DashboardLayout adminSession={adminSession} onLogout={handleLogout}>
                  <UserEdit />
                </DashboardLayout>
              }
            />
            <Route
              path="/organizations"
              element={
                <DashboardLayout adminSession={adminSession} onLogout={handleLogout}>
                  <Organizations />
                </DashboardLayout>
              }
            />
            <Route
              path="/organizations/new"
              element={
                <DashboardLayout adminSession={adminSession} onLogout={handleLogout}>
                  <OrganizationCreate />
                </DashboardLayout>
              }
            />
            <Route
              path="/organizations/:organizationId"
              element={
                <DashboardLayout adminSession={adminSession} onLogout={handleLogout}>
                  <OrganizationEdit />
                </DashboardLayout>
              }
            />
            <Route
              path="/roles"
              element={
                <DashboardLayout adminSession={adminSession} onLogout={handleLogout}>
                  <Roles />
                </DashboardLayout>
              }
            />
            <Route
              path="/roles/new"
              element={
                <DashboardLayout adminSession={adminSession} onLogout={handleLogout}>
                  <RoleCreate />
                </DashboardLayout>
              }
            />
            <Route
              path="/roles/:roleId"
              element={
                <DashboardLayout adminSession={adminSession} onLogout={handleLogout}>
                  <RoleEdit />
                </DashboardLayout>
              }
            />
            <Route
              path="/permissions"
              element={
                <DashboardLayout adminSession={adminSession} onLogout={handleLogout}>
                  <Permissions />
                </DashboardLayout>
              }
            />
            <Route
              path="/clients"
              element={
                <DashboardLayout adminSession={adminSession} onLogout={handleLogout}>
                  <Clients />
                </DashboardLayout>
              }
            />
            <Route
              path="/clients/new"
              element={
                <DashboardLayout adminSession={adminSession} onLogout={handleLogout}>
                  <ClientCreate />
                </DashboardLayout>
              }
            />
            <Route
              path="/clients/:clientId"
              element={
                <DashboardLayout adminSession={adminSession} onLogout={handleLogout}>
                  <ClientEdit />
                </DashboardLayout>
              }
            />
            <Route
              path="/analytics"
              element={
                <DashboardLayout adminSession={adminSession} onLogout={handleLogout}>
                  <Analytics />
                </DashboardLayout>
              }
            />
            <Route
              path="/keys"
              element={
                <DashboardLayout adminSession={adminSession} onLogout={handleLogout}>
                  <Keys />
                </DashboardLayout>
              }
            />
            <Route
              path="/changelog"
              element={
                <DashboardLayout adminSession={adminSession} onLogout={handleLogout}>
                  <Changelog />
                </DashboardLayout>
              }
            />
            <Route
              path="/audit"
              element={
                <DashboardLayout adminSession={adminSession} onLogout={handleLogout}>
                  <AuditLogs />
                </DashboardLayout>
              }
            />
            <Route
              path="/audit/:id"
              element={
                <DashboardLayout adminSession={adminSession} onLogout={handleLogout}>
                  <AuditLogDetail />
                </DashboardLayout>
              }
            />
            <Route
              path="/notifications"
              element={
                <DashboardLayout adminSession={adminSession} onLogout={handleLogout}>
                  <div
                    style={{
                      padding: 32,
                      textAlign: "center",
                      color: "hsl(var(--muted-foreground, 220 8% 46%))",
                    }}
                  >
                    Notifications page coming soon...
                  </div>
                </DashboardLayout>
              }
            />
            <Route
              path="/settings"
              element={
                <DashboardLayout adminSession={adminSession} onLogout={handleLogout}>
                  <Settings />
                </DashboardLayout>
              }
            />
            <Route
              path="/branding"
              element={
                <DashboardLayout adminSession={adminSession} onLogout={handleLogout}>
                  <Branding />
                </DashboardLayout>
              }
            />
            <Route
              path="/settings/admin-users"
              element={
                <DashboardLayout adminSession={adminSession} onLogout={handleLogout}>
                  <AdminUsers />
                </DashboardLayout>
              }
            />
            <Route
              path="/settings/admin-users/new"
              element={
                <DashboardLayout adminSession={adminSession} onLogout={handleLogout}>
                  <AdminUserCreate />
                </DashboardLayout>
              }
            />
            <Route
              path="/settings/admin-users/:id/edit"
              element={
                <DashboardLayout adminSession={adminSession} onLogout={handleLogout}>
                  <AdminUserEdit />
                </DashboardLayout>
              }
            />
            <Route path="*" element={<NotFound />} />
          </Routes>
          <Toaster />
        </AdminLayout>
      </BrowserRouter>
    </QueryClientProvider>
  );
};

export default App;
