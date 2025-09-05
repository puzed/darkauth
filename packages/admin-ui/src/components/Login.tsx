import { CheckCircle2, Loader2, Lock, Moon, Shield, Sun, X } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { setTheme as applyThemeSetting, getTheme } from "@/lib/theme";
import adminApiService from "@/services/api";
import authService from "@/services/auth";
import adminOpaqueService, { type AdminOpaqueLoginState } from "@/services/opaque";
import styles from "./Login.module.css";

interface AdminLoginProps {
  onLogin: (adminData: {
    adminId: string;
    name?: string;
    email?: string;
    role: "read" | "write";
    sessionKey?: string;
    exportKey?: string;
    passwordResetRequired?: boolean;
  }) => void;
}

interface FormData {
  email: string;
  password: string;
}

interface FormErrors {
  email?: string;
  password?: string;
  general?: string;
}

export default function AdminLogin({ onLogin }: AdminLoginProps) {
  const emailId = useId();
  const passwordId = useId();
  const [formData, setFormData] = useState<FormData>({
    email: "",
    password: "",
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [loading, setLoading] = useState(false);
  const [opaqueState, setOpaqueState] = useState<AdminOpaqueLoginState | null>(null);
  const [showInstallSuccess, setShowInstallSuccess] = useState<boolean>(() => {
    try {
      return localStorage.getItem("da_install_success") === "1";
    } catch {
      return false;
    }
  });
  const [mode, setMode] = useState<"light" | "dark">(() => {
    const t = getTheme();
    if (t === "system") {
      const d = window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ?? false;
      return d ? "dark" : "light";
    }
    return t;
  });
  useEffect(() => {
    if (getTheme() !== "system") return;
    const m = window.matchMedia?.("(prefers-color-scheme: dark)");
    const onChange = () => {
      const t = getTheme();
      if (t === "system") {
        const d = window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ?? false;
        setMode(d ? "dark" : "light");
      }
    };
    m?.addEventListener?.("change", onChange);
    return () => m?.removeEventListener?.("change", onChange);
  }, []);

  useEffect(() => {
    // Pre-fill email from stored login info
    const loginInfo = authService.getStoredLoginInfo();
    if (loginInfo?.email) {
      setFormData((prev) => ({ ...prev, email: loginInfo.email }));
    }
  }, []);

  const validateForm = (): FormErrors => {
    const newErrors: FormErrors = {};

    if (!formData.email) {
      newErrors.email = "Email is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = "Please enter a valid email address";
    }

    if (!formData.password) {
      newErrors.password = "Password is required";
    } else if (formData.password.length < 3) {
      newErrors.password = "Password must be at least 3 characters";
    }

    return newErrors;
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));

    // Clear specific field error when user starts typing
    if (errors[name as keyof FormErrors]) {
      setErrors((prev) => ({ ...prev, [name]: undefined }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const formErrors = validateForm();
    if (Object.keys(formErrors).length > 0) {
      setErrors(formErrors);
      return;
    }

    setLoading(true);
    setErrors({});

    try {
      console.debug("[admin-ui] login: start", { email: formData.email });
      // Start OPAQUE admin login
      const loginStart = await adminOpaqueService.startLogin(formData.email, formData.password);
      setOpaqueState(loginStart.state);

      console.debug("[admin-ui] login: sending /opaque/login/start", {
        reqLen: loginStart.request.length,
      });
      const loginStartResponse = await adminApiService.adminOpaqueLoginStart({
        email: formData.email,
        request: loginStart.request,
      });
      console.debug("[admin-ui] login: start response", loginStartResponse);

      // Finish OPAQUE login
      const loginFinish = await adminOpaqueService.finishLogin(
        loginStartResponse.message,
        loginStart.state
      );
      console.debug("[admin-ui] login: finish ke3 len", { len: loginFinish.request.length });

      // Send login finish request to server
      const loginFinishResponse = await adminApiService.adminOpaqueLoginFinish({
        adminId: loginStartResponse.adminId,
        finish: loginFinish.request,
        sessionId: loginStartResponse.sessionId,
      });
      console.debug("[admin-ui] login: finish response", loginFinishResponse);

      const name = loginFinishResponse.admin.name;
      const email = loginFinishResponse.admin.email;
      const role = loginFinishResponse.admin.role;
      const passwordResetRequired = false;

      // Save login email for future convenience
      authService.saveLoginInfo(formData.email);

      // Clear sensitive data
      adminOpaqueService.clearState(loginStart.state);
      loginFinish.sessionKey.fill(0);

      // Optimistically update UI
      onLogin({
        adminId: loginFinishResponse.admin.id,
        name,
        email,
        role,
        passwordResetRequired,
        sessionKey: loginFinishResponse.sessionKey,
        exportKey: loginFinishResponse.exportKey,
      });

      // Best-effort hydrate session details
      try {
        const sessionData = await adminApiService.getAdminSession();
        onLogin({
          adminId: sessionData.adminId ?? loginFinishResponse.admin.id,
          name: sessionData.name,
          email: sessionData.email,
          role: sessionData.role || ("read" as const),
          passwordResetRequired: !!sessionData.passwordResetRequired,
          sessionKey: loginFinishResponse.sessionKey,
          exportKey: loginFinishResponse.exportKey,
        });
      } catch {}
    } catch (error) {
      console.error("Admin login failed:", error);

      // Clear sensitive data on error
      if (opaqueState) {
        adminOpaqueService.clearState(opaqueState);
      }

      let errorMessage = "Login failed. Please try again.";
      if (error instanceof Error) {
        if (error.message.includes("not found")) {
          errorMessage = "No admin account found with this email address.";
        } else if (
          error.message.includes("authentication") ||
          error.message.includes("Unauthorized")
        ) {
          errorMessage = "Invalid email or password.";
        } else if (error.message.includes("network") || error.message.includes("fetch")) {
          errorMessage = "Network error. Please check your connection and try again.";
        } else if (error.message.includes("403") || error.message.includes("Forbidden")) {
          errorMessage = "Access denied. Admin privileges required.";
        } else {
          errorMessage = error.message;
        }
      }

      setErrors({ general: errorMessage });
    } finally {
      setLoading(false);
      setOpaqueState(null);
    }
  };

  return (
    <div className={styles.container}>
      {showInstallSuccess && (
        <div className={styles.noticeWrap}>
          <div className={styles.notice}>
            <CheckCircle2 size={18} color="hsl(var(--primary))" />
            <div>
              <div className={styles.noticeTitle}>Installation complete</div>
              <div className={styles.noticeDesc}>You can now log in as your admin user</div>
            </div>
            <button
              type="button"
              aria-label="Dismiss"
              className={styles.noticeClose}
              onClick={() => {
                setShowInstallSuccess(false);
                try {
                  localStorage.removeItem("da_install_success");
                } catch {}
              }}
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}
      <div className={styles.card}>
        <div className={styles.themeToggle}>
          <button
            type="button"
            aria-label="Toggle theme"
            className={styles.themeToggleBtn}
            onClick={() => {
              const next = mode === "dark" ? "light" : "dark";
              setMode(next);
              applyThemeSetting(next);
            }}
            title={mode === "dark" ? "Dark" : "Light"}
          >
            {mode === "dark" ? <Moon size={16} /> : <Sun size={16} />}
          </button>
        </div>
        <div className={styles.header}>
          <div className={styles.brandWrap}>
            <div className={styles.brand}>
              <img src="/favicon.svg" alt="DarkAuth" />
            </div>
          </div>
          <div className={styles.title}>DarkAuth Admin</div>
          <p className={styles.description}>Secure Administration Panel</p>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <div className={styles.content}>
            <div className={styles.formGroup}>
              <label className={styles.label} htmlFor={emailId}>
                Admin Email
              </label>
              <input
                className={`${styles.input} ${errors.email ? styles.error : ""}`}
                type="email"
                id={emailId}
                name="email"
                value={formData.email}
                onChange={handleInputChange}
                placeholder="admin@yourcompany.com"
                disabled={loading}
                autoComplete="email"
                required
              />
              {errors.email && <p className={styles.errorText}>{errors.email}</p>}
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label} htmlFor={passwordId}>
                Password
              </label>
              <input
                className={`${styles.input} ${errors.password ? styles.error : ""}`}
                type="password"
                id={passwordId}
                name="password"
                value={formData.password}
                onChange={handleInputChange}
                placeholder="Your admin password"
                disabled={loading}
                autoComplete="current-password"
                required
              />
              {errors.password && <p className={styles.errorText}>{errors.password}</p>}
            </div>

            {errors.general && <div className={styles.alert}>{errors.general}</div>}

            <div className={styles.actions}>
              <Button type="submit" size="lg" disabled={loading} style={{ width: "100%" }}>
                {loading ? (
                  <>
                    <Loader2
                      size={16}
                      style={{ marginRight: 8, animation: "spin 1s linear infinite" }}
                    />
                    Authenticating...
                  </>
                ) : (
                  <>
                    <Lock size={16} style={{ marginRight: 8 }} />
                    Sign In
                  </>
                )}
              </Button>
            </div>
          </div>
        </form>

        <div className={styles.footer}>
          <div>
            <Shield size={16} style={{ marginRight: 6, verticalAlign: "text-bottom" }} />
            Protected with zero-knowledge OPAQUE authentication
          </div>
          <p className={styles.footerSmall}>
            Sessions last 15 minutes and will refresh automatically while active
          </p>
        </div>
      </div>
    </div>
  );
}
