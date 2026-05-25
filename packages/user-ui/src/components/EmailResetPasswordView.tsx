import { useEffect, useId, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useBranding } from "../hooks/useBranding";
import apiService from "../services/api";
import { sha256Base64Url } from "../services/crypto";
import opaqueService, { type OpaqueRegistrationState } from "../services/opaque";
import AuthViewFrame from "./AuthViewFrame";
import viewStyles from "./LoginView.module.css";
import styles from "./Register.module.css";

const minimumPasswordLength = 12;

export default function EmailResetPasswordView() {
  const uid = useId();
  const branding = useBranding();
  const [searchParams] = useSearchParams();
  const token = useMemo(() => searchParams.get("token") || "", [searchParams]);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [tokenState, setTokenState] = useState<"checking" | "valid" | "invalid">(
    token ? "checking" : "invalid"
  );
  const [maskedEmail, setMaskedEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token) {
      setTokenState("invalid");
      return;
    }
    setTokenState("checking");
    setMaskedEmail(null);
    setSuccess(false);
    setError(null);
    let cancelled = false;
    apiService
      .getPasswordResetToken(token)
      .then((response) => {
        if (cancelled) return;
        setTokenState(response.valid ? "valid" : "invalid");
        setMaskedEmail(response.email || null);
      })
      .catch(() => {
        if (!cancelled) setTokenState("invalid");
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (password.length < minimumPasswordLength) {
      setError(`Password must be at least ${minimumPasswordLength} characters`);
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    let opaqueState: OpaqueRegistrationState | null = null;
    let passwordKey: Uint8Array | null = null;
    let exportKey: Uint8Array | null = null;
    try {
      setLoading(true);
      setError(null);
      const start = await opaqueService.startRegistration(password, "");
      opaqueState = start.state;
      const startResponse = await apiService.passwordResetStart(token, start.request);
      const finish = await opaqueService.finishRegistration(
        startResponse.message,
        startResponse.serverPublicKey,
        start.state,
        startResponse.identityU
      );
      passwordKey = finish.passwordKey;
      exportKey = finish.exportKey;
      const exportKeyHash = await sha256Base64Url(finish.passwordKey);
      await apiService.passwordResetFinish(token, finish.request, exportKeyHash);
      setSuccess(true);
      setPassword("");
      setConfirmPassword("");
    } catch (eventError) {
      setPassword("");
      setConfirmPassword("");
      setError(eventError instanceof Error ? eventError.message : "Failed to reset password");
    } finally {
      if (opaqueState) opaqueService.clearState(opaqueState);
      if (passwordKey) passwordKey.fill(0);
      if (exportKey) exportKey.fill(0);
      setLoading(false);
    }
  };

  return (
    <AuthViewFrame>
      <div className={styles.authContainer}>
        <h2 className={styles.formTitle}>Reset your password</h2>
        {tokenState === "checking" ? (
          <div className={viewStyles.infoAlert}>
            <span className={viewStyles.infoText}>Checking reset link...</span>
          </div>
        ) : tokenState === "invalid" ? (
          <>
            <div className={styles.errorMessage}>This reset link is invalid or expired.</div>
            <div className={styles.stageActions}>
              <Link className={styles.linkButton} to="/forgot-password">
                Request a new reset link
              </Link>
            </div>
          </>
        ) : success ? (
          <>
            <output className={viewStyles.successAlert} aria-live="polite">
              <span className={viewStyles.successTitle}>Password updated</span>
              <span className={viewStyles.successText}>
                Your password has been reset. Sign in with your new password to continue.
              </span>
            </output>
            <div className={styles.stageActions}>
              <Link className={styles.linkButton} to="/login">
                Back to sign in
              </Link>
            </div>
          </>
        ) : (
          <form className={styles.form} onSubmit={submit} noValidate>
            {maskedEmail ? (
              <div className={viewStyles.infoAlert}>
                <span className={viewStyles.infoText}>Resetting password for {maskedEmail}</span>
              </div>
            ) : null}
            <div className={styles.formGroup}>
              <label className={styles.formLabel} htmlFor={`${uid}-password`}>
                {branding.getText("password", "Password")}
              </label>
              <input
                type="password"
                id={`${uid}-password`}
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  setError(null);
                }}
                placeholder={branding.getText(
                  "createPasswordPlaceholder",
                  "Create a strong password"
                )}
                className={`${styles.formInput} ${error ? styles.error : ""}`}
                disabled={loading}
                autoComplete="new-password"
                required
              />
              <div className={styles.helpText}>Must be at least 12 characters</div>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel} htmlFor={`${uid}-confirmPassword`}>
                {branding.getText("confirmPassword", "Confirm Password")}
              </label>
              <input
                type="password"
                id={`${uid}-confirmPassword`}
                value={confirmPassword}
                onChange={(event) => {
                  setConfirmPassword(event.target.value);
                  setError(null);
                }}
                placeholder={branding.getText(
                  "confirmPasswordPlaceholder",
                  "Confirm your password"
                )}
                className={`${styles.formInput} ${error ? styles.error : ""}`}
                disabled={loading}
                autoComplete="new-password"
                required
              />
              {error ? <div className={styles.errorText}>{error}</div> : null}
            </div>
            <button type="submit" className={styles.primaryButton} disabled={loading}>
              {loading ? (
                <>
                  <span className={styles.loadingSpinner} />
                  Updating...
                </>
              ) : (
                "Update Password"
              )}
            </button>
          </form>
        )}
        {!success ? (
          <div className={styles.formFooter}>
            <p>
              <Link className={styles.linkButton} to="/login">
                Back to sign in
              </Link>
            </p>
          </div>
        ) : null}
      </div>
    </AuthViewFrame>
  );
}
