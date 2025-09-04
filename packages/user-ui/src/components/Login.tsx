import { useId, useState } from "react";
import { useBranding } from "../hooks/useBranding";
import apiService from "../services/api";
import cryptoService, { toBase64Url } from "../services/crypto";
import opaqueService, { type OpaqueLoginState } from "../services/opaque";
import { saveExportKey } from "../services/sessionKey";
import styles from "./Login.module.css";

interface LoginProps {
  onLogin: (sessionData: {
    sub: string;
    name?: string;
    email?: string;
    passwordResetRequired?: boolean;
  }) => void;
  onSwitchToRegister: () => void;
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

export default function Login({ onLogin, onSwitchToRegister }: LoginProps) {
  const uid = useId();
  const branding = useBranding();
  const [formData, setFormData] = useState<FormData>({
    email: "",
    password: "",
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [loading, setLoading] = useState(false);
  const [opaqueState, setOpaqueState] = useState<OpaqueLoginState | null>(null);

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
      console.debug("[user-ui] login: start", { email: formData.email });
      // Start OPAQUE login
      const loginStart = await opaqueService.startLogin(formData.email, formData.password);
      setOpaqueState(loginStart.state);

      console.debug("[user-ui] login: sending /opaque/login/start", {
        reqLen: loginStart.request.length,
      });
      // Send login start request to server
      const loginStartResponse = await apiService.opaqueLoginStart({
        email: formData.email,
        request: loginStart.request,
      });
      console.debug("[user-ui] login: start response", loginStartResponse);

      // Finish OPAQUE login
      const loginFinish = await opaqueService.finishLogin(
        loginStartResponse.message,
        loginStart.state
      );
      console.debug("[user-ui] login: finish ke3 len", { len: loginFinish.request.length });

      // Send login finish request to server
      const loginFinishResponse = await apiService.opaqueLoginFinish({
        sub: loginStartResponse.sub,
        finish: loginFinish.request,
        sessionId: loginStartResponse.sessionId,
      });
      console.debug("[user-ui] login: finish response", loginFinishResponse);

      const keys = await cryptoService.deriveKeysFromExportKey(
        loginFinish.exportKey,
        loginFinishResponse.sub
      );

      try {
        await apiService.getWrappedDrk();
      } catch (_err) {
        try {
          const drk = await cryptoService.generateDRK();
          const wrappedDrk = await cryptoService.wrapDRK(
            drk,
            keys.wrapKey,
            loginFinishResponse.sub
          );
          await apiService.putWrappedDrk(toBase64Url(wrappedDrk));
          cryptoService.clearSensitiveData(loginFinish.sessionKey, drk);
        } catch (e) {
          console.warn("Failed to initialize DRK:", e);
        }
      }

      let name: string | undefined = loginFinishResponse.user?.name || undefined;
      let email: string | undefined = loginFinishResponse.user?.email || formData.email;
      let passwordResetRequired = false;
      try {
        const sessionData = await apiService.getSession();
        name = sessionData.name || name;
        email = (sessionData.email as string | undefined) || email;
        passwordResetRequired = !!sessionData.passwordResetRequired;
      } catch {}

      opaqueService.clearState(loginStart.state);
      saveExportKey(loginFinishResponse.sub, loginFinish.exportKey);
      cryptoService.clearSensitiveData(loginFinish.sessionKey);

      onLogin({
        sub: loginFinishResponse.sub,
        name,
        email,
        passwordResetRequired,
      });
    } catch (error) {
      console.error("Login failed:", error);

      // Clear sensitive data on error
      if (opaqueState) {
        opaqueService.clearState(opaqueState);
      }

      let errorMessage = "Login failed. Please try again.";
      if (error instanceof Error) {
        if (error.message.includes("not found")) {
          errorMessage = "No account found with this email address.";
        } else if (error.message.includes("authentication")) {
          errorMessage = "Invalid email or password.";
        } else if (error.message.includes("network") || error.message.includes("fetch")) {
          errorMessage = "Network error. Please check your connection and try again.";
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
    <div className={styles.authContainer}>
      <h2 className={styles.formTitle}>{branding.getText("welcomeBack", "Welcome back")}</h2>

      <form className={styles.form} onSubmit={handleSubmit} noValidate>
        <div className={styles.formGroup}>
          <label className={styles.formLabel} htmlFor={`${uid}-email`}>
            {branding.getText("email", "Email")}
          </label>
          <input
            type="email"
            id={`${uid}-email`}
            name="email"
            value={formData.email}
            onChange={handleInputChange}
            placeholder={branding.getText("emailPlaceholder", "Enter your email")}
            className={`${styles.formInput} ${errors.email ? styles.error : ""}`}
            disabled={loading}
            autoComplete="email"
            required
          />
          {errors.email && <div className={styles.errorText}>{errors.email}</div>}
        </div>

        <div className={styles.formGroup}>
          <label className={styles.formLabel} htmlFor={`${uid}-password`}>
            {branding.getText("password", "Password")}
          </label>
          <input
            type="password"
            id={`${uid}-password`}
            name="password"
            value={formData.password}
            onChange={handleInputChange}
            placeholder={branding.getText("passwordPlaceholder", "Enter your password")}
            className={`${styles.formInput} ${errors.password ? styles.error : ""}`}
            disabled={loading}
            autoComplete="current-password"
            required
          />
          {errors.password && <div className={styles.errorText}>{errors.password}</div>}
        </div>

        {errors.general && <div className={styles.errorMessage}>{errors.general}</div>}

        <button type="submit" className={styles.primaryButton} disabled={loading}>
          {loading ? (
            <>
              <span className={styles.loadingSpinner} />
              {branding.getText("signingIn", "Signing in...")}
            </>
          ) : (
            branding.getText("signin", "Continue")
          )}
        </button>
      </form>

      <div className={styles.formFooter}>
        <p>
          {branding.getText("noAccount", "Don't have an account?")}{" "}
          <button
            type="button"
            className={styles.linkButton}
            onClick={onSwitchToRegister}
            disabled={loading}
          >
            {branding.getText("signup", "Sign up")}
          </button>
        </p>
      </div>
    </div>
  );
}
