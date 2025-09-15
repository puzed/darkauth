import { useEffect, useId, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useBranding } from "../hooks/useBranding";
import api from "../services/api";
import styles from "./LoginView.module.css";
import btnStyles from "./Login.module.css";
import ThemeToggle from "./ThemeToggle";

export default function OtpVerifyView() {
  const branding = useBranding();
  const navigate = useNavigate();
  const uid = useId();
  const [code, setCode] = useState("");
  const [useBackup, setUseBackup] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const s = await api.getOtpStatus();
        if (!s.enabled) {
          window.location.replace("/otp/setup?forced=1");
          return;
        }
      } catch {}
      try {
        const session = await api.getSession();
        if (!session.otpRequired) navigate("/dashboard");
      } catch {}
    })();
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!useBackup && code.length < 6) return;
    if (useBackup && code.length < 14) return;
    setLoading(true);
    setError(null);
    try {
      await api.otpVerify(code);
      window.location.replace("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.app}>
      <div className={styles.container}>
        <div className={styles.authHeader}>
          <div className={styles.headerTop}>
            <Link to="/" className={styles.brand}>
              <span className={styles.brandIcon}>
                <img
                  src={branding.getLogoUrl()}
                  alt={branding.getTitle()}
                  className={branding.getLogoUrl() === "/favicon.svg" ? styles.defaultLogo : ""}
                />
              </span>
              <h1 className={styles.brandTitle}>{branding.getTitle()}</h1>
            </Link>
            <ThemeToggle />
          </div>
          <p className={styles.tagline}>{branding.getTagline()}</p>
        </div>

        <div className={btnStyles.authContainer}>
          <h2 className={btnStyles.formTitle}>Two-Factor Verification</h2>
          <form className={btnStyles.form} onSubmit={handleSubmit}>
            <div className={btnStyles.formGroup}>
              <label className={btnStyles.formLabel} htmlFor={`${uid}-otp`}>
                {useBackup ? "Enter backup code" : "Enter the code from your authentication app"}
              </label>
              <input
                id={`${uid}-otp`}
                className={btnStyles.formInput}
                value={code}
                onChange={(e) => {
                  const v = e.target.value;
                  if (useBackup) {
                    const raw = v.replace(/[^0-9a-zA-Z]/g, "").toUpperCase().slice(0, 12);
                    const formatted = raw.length <= 4
                      ? raw
                      : raw.length <= 8
                      ? `${raw.slice(0, 4)}-${raw.slice(4)}`
                      : `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8)}`;
                    setCode(formatted);
                  } else {
                    setCode(v);
                  }
                }}
                placeholder={useBackup ? "1234-5678-9ABC" : "123456"}
                maxLength={useBackup ? 14 : 12}
              />
            </div>
            <div className={btnStyles.formFooter}>
              <button
                type="button"
                className={btnStyles.linkButton}
                onClick={() => {
                  setCode("");
                  setUseBackup((v) => !v);
                }}
              >
                {useBackup ? "Use a 6-digit code" : "Use a backup code"}
              </button>
            </div>
            {error && <div className={btnStyles.errorMessage}>{error}</div>}
            <button
              type="submit"
              className={btnStyles.primaryButton}
              disabled={loading || (!useBackup && code.length < 6) || (useBackup && code.length < 14)}
              style={{ width: "100%" }}
            >
              Verify
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
