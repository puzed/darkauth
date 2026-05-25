import { useId, useState } from "react";
import { Link } from "react-router-dom";
import { useBranding } from "../hooks/useBranding";
import apiService from "../services/api";
import AuthViewFrame from "./AuthViewFrame";
import viewStyles from "./LoginView.module.css";
import styles from "./Register.module.css";

const genericMessage = "If an account exists, we sent reset instructions.";

export default function ForgotPasswordView() {
  const uid = useId();
  const branding = useBranding();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!email.trim()) {
      setError("Email is required");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Please enter a valid email address");
      return;
    }
    try {
      setLoading(true);
      setError(null);
      await apiService.requestPasswordReset(email);
      setSent(true);
    } catch {
      setSent(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthViewFrame>
      <div className={styles.authContainer}>
        <h2 className={styles.formTitle}>
          {branding.getText("forgotPassword", "Forgot your password?")}
        </h2>
        {sent ? (
          <>
            <output className={viewStyles.successAlert} aria-live="polite">
              <span className={viewStyles.successTitle}>Check your email</span>
              <span className={viewStyles.successText}>{genericMessage}</span>
            </output>
            <div className={styles.stageActions}>
              <Link className={styles.linkButton} to="/login">
                Back to sign in
              </Link>
            </div>
          </>
        ) : (
          <form className={styles.form} onSubmit={submit} noValidate>
            <div className={styles.formGroup}>
              <label className={styles.formLabel} htmlFor={`${uid}-email`}>
                {branding.getText("email", "Email")}
              </label>
              <input
                type="email"
                id={`${uid}-email`}
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setError(null);
                }}
                placeholder={branding.getText("emailPlaceholder", "Enter your email")}
                className={`${styles.formInput} ${error ? styles.error : ""}`}
                disabled={loading}
                autoComplete="email"
                required
              />
              {error ? <div className={styles.errorText}>{error}</div> : null}
            </div>
            <button type="submit" className={styles.primaryButton} disabled={loading}>
              {loading ? (
                <>
                  <span className={styles.loadingSpinner} />
                  Sending...
                </>
              ) : (
                "Send reset instructions"
              )}
            </button>
          </form>
        )}
        {!sent ? (
          <div className={styles.formFooter}>
            <p>
              Remember your password?{" "}
              <Link className={styles.linkButton} to="/login">
                {branding.getText("signin", "Continue")}
              </Link>
            </p>
          </div>
        ) : null}
      </div>
    </AuthViewFrame>
  );
}
