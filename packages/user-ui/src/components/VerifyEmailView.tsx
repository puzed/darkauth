import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useBranding } from "../hooks/useBranding";
import apiService from "../services/api";
import Button from "./Button";
import styles from "./LoginView.module.css";
import ThemeToggle from "./ThemeToggle";

export default function VerifyEmailView() {
  const branding = useBranding();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("Verifying your email...");
  const [success, setSuccess] = useState(false);

  const logoUrl = branding.getLogoUrl();
  const isDefaultLogo = branding.isDefaultLogoUrl(logoUrl);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token") || "";
    if (!token) {
      setLoading(false);
      setSuccess(false);
      setMessage("Verification link is invalid or expired");
      return;
    }

    apiService
      .verifyEmailToken(token)
      .then(() => {
        setSuccess(true);
        setMessage("Your email is verified. You can now sign in.");
      })
      .catch((error) => {
        setSuccess(false);
        setMessage(
          error instanceof Error ? error.message : "Verification link is invalid or expired"
        );
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  return (
    <div className={styles.app}>
      <div className={styles.container}>
        <div className={styles.authHeader}>
          <div className={styles.headerTop}>
            <Link to="/" className={styles.brand}>
              <span className={styles.brandIcon}>
                <img
                  src={logoUrl}
                  alt={branding.getTitle()}
                  className={isDefaultLogo ? styles.defaultLogo : ""}
                />
              </span>
              <h1 className={styles.brandTitle}>{branding.getTitle()}</h1>
            </Link>
            <ThemeToggle />
          </div>
          <p className={styles.tagline}>{branding.getTagline()}</p>
        </div>

        <div style={{ padding: "0 2rem 2rem" }}>
          <output className={success ? styles.successAlert : styles.infoAlert} aria-live="polite">
            <span className={success ? styles.successTitle : styles.infoTitle}>
              {success ? "Email verified" : "Verification notice"}
            </span>
            <span className={success ? styles.successText : styles.infoText}>{message}</span>
          </output>

          {!loading ? (
            <Button
              type="button"
              variant={success ? "primary" : "secondary"}
              fullWidth
              onClick={() => navigate("/login")}
            >
              {success ? "Continue to sign in" : "Back to sign in"}
            </Button>
          ) : (
            <div style={{ display: "flex", justifyContent: "center", padding: "1rem" }}>
              <div className="loading-spinner" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
