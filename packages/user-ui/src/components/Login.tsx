import { useEffect, useId, useMemo, useState } from "react";
import { useBranding } from "../hooks/useBranding";
import apiService from "../services/api";
import cryptoService, { sha256Base64Url, toBase64Url } from "../services/crypto";
import { saveDrk } from "../services/drkStorage";
import { logger } from "../services/logger";
import opaqueService, { type OpaqueLoginState } from "../services/opaque";
import { saveExportKey } from "../services/sessionKey";
import Button from "./Button";
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
  const [clientCheckLoading, setClientCheckLoading] = useState(true);
  const [clientCheckError, setClientCheckError] = useState<string | null>(null);

  const activeClientId = useMemo(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const queryClientId = searchParams.get("client_id");
    const appConfig = window as Window & {
      __APP_CONFIG__?: { clientId?: string; auth?: { clientId?: string } };
    };
    return (
      queryClientId ||
      appConfig.__APP_CONFIG__?.clientId ||
      appConfig.__APP_CONFIG__?.auth?.clientId ||
      "user"
    );
  }, []);

  useEffect(() => {
    let cancelled = false;
    const checkClient = async () => {
      setClientCheckLoading(true);
      setClientCheckError(null);
      try {
        await apiService.getClientScopeDescriptions(activeClientId, ["openid"]);
        if (!cancelled) {
          setClientCheckError(null);
        }
      } catch (error) {
        if (!cancelled) {
          const message =
            error instanceof Error && error.message.toLowerCase().includes("unknown client")
              ? "Sign-in is unavailable because the configured client does not exist."
              : "Sign-in is unavailable due to client configuration.";
          setClientCheckError(message);
        }
      } finally {
        if (!cancelled) {
          setClientCheckLoading(false);
        }
      }
    };
    checkClient();
    return () => {
      cancelled = true;
    };
  }, [activeClientId]);

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
      logger.debug({ email: formData.email }, "[user-ui] login start");
      // Start OPAQUE login
      const loginStart = await opaqueService.startLogin(formData.email, formData.password);
      setOpaqueState(loginStart.state);

      logger.debug({ requestLength: loginStart.request.length }, "[user-ui] login start request");
      // Send login start request to server
      const loginStartResponse = await apiService.opaqueLoginStart({
        email: formData.email,
        request: loginStart.request,
      });
      logger.debug({ response: loginStartResponse }, "[user-ui] login start response");

      // Finish OPAQUE login
      const loginFinish = await opaqueService.finishLogin(
        loginStartResponse.message,
        loginStart.state
      );
      logger.debug({ requestLength: loginFinish.request.length }, "[user-ui] login finish payload");

      // Send login finish request to server
      const loginFinishResponse = await apiService.opaqueLoginFinish({
        sub: loginStartResponse.sub,
        finish: loginFinish.request,
        sessionId: loginStartResponse.sessionId,
      });
      logger.debug({ response: loginFinishResponse }, "[user-ui] login finish response");

      if (loginFinishResponse.otpRequired) {
        opaqueService.clearState(loginStart.state);
        await saveExportKey(loginFinishResponse.sub, loginFinish.exportKey);
        cryptoService.clearSensitiveData(loginFinish.sessionKey, loginFinish.exportKey);
        try {
          const s = await apiService.getOtpStatus();
          if (s.enabled) {
            window.location.replace("/otp/verify");
          } else {
            window.location.replace("/otp/setup?forced=1");
          }
        } catch {
          window.location.replace("/otp/setup?forced=1");
        }
        return;
      }

      await saveExportKey(loginFinishResponse.sub, loginFinish.exportKey);

      onLogin({
        sub: loginFinishResponse.sub,
        name: loginFinishResponse.user?.name || undefined,
        email: loginFinishResponse.user?.email || formData.email,
        passwordResetRequired: false,
      });

      try {
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
            const wrappedDrkHash = await sha256Base64Url(wrappedDrk);
            saveDrk(loginFinishResponse.sub, drk, wrappedDrkHash);
            cryptoService.clearSensitiveData(loginFinish.sessionKey, drk);
          } catch (e) {
            logger.warn(
              e instanceof Error
                ? { name: e.name, message: e.message, stack: e.stack }
                : { detail: String(e) },
              "Failed to initialize DRK"
            );
          }
        }
      } catch (e) {
        logger.warn(
          e instanceof Error
            ? { name: e.name, message: e.message, stack: e.stack }
            : { detail: String(e) },
          "Post-login key setup failed"
        );
      } finally {
        opaqueService.clearState(loginStart.state);
        cryptoService.clearSensitiveData(loginFinish.sessionKey, loginFinish.exportKey);
      }
    } catch (error) {
      logger.error(error, "Login failed");

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
      {clientCheckLoading ? (
        <div className={styles.errorMessage}>Checking sign-in configuration...</div>
      ) : null}
      {clientCheckError ? <div className={styles.errorMessage}>{clientCheckError}</div> : null}

      {!clientCheckLoading && !clientCheckError ? (
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

          <Button type="submit" variant="primary" fullWidth disabled={loading}>
            {loading ? (
              <>
                <span className={styles.loadingSpinner} />
                {branding.getText("signingIn", "Signing in...")}
              </>
            ) : (
              branding.getText("signin", "Continue")
            )}
          </Button>
        </form>
      ) : null}

      {window.__APP_CONFIG__?.features?.selfRegistrationEnabled &&
      !clientCheckLoading &&
      !clientCheckError ? (
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
      ) : null}
    </div>
  );
}
