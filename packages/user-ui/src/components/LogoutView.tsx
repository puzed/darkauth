import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import apiService from "../services/api";
import { logger } from "../services/logger";
import AuthViewFrame from "./AuthViewFrame";
import viewStyles from "./LoginView.module.css";
import styles from "./Register.module.css";

export default function LogoutView() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [signedOut, setSignedOut] = useState(searchParams.get("signed_out") === "1");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const params = useMemo(
    () => ({
      post_logout_redirect_uri: searchParams.get("post_logout_redirect_uri") || undefined,
      client_id: searchParams.get("client_id") || undefined,
      state: searchParams.get("state") || undefined,
    }),
    [searchParams]
  );

  const signOut = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await apiService.endSession(params);
      if (response.redirect_uri) {
        window.location.assign(response.redirect_uri);
        return;
      }
      setSignedOut(true);
    } catch (eventError) {
      logger.error(eventError, "Logout failed");
      setError(eventError instanceof Error ? eventError.message : "Failed to sign out");
      setLoading(false);
    }
  };

  return (
    <AuthViewFrame>
      <div className={styles.authContainer}>
        {signedOut ? (
          <>
            <h2 className={styles.formTitle}>Signed out</h2>
            <output className={viewStyles.successAlert} aria-live="polite">
              <span className={viewStyles.successText}>You have been signed out.</span>
            </output>
            <div className={styles.stageActions}>
              <Link className={styles.linkButton} to="/login">
                Sign in again
              </Link>
            </div>
          </>
        ) : (
          <>
            <h2 className={styles.formTitle}>Sign out?</h2>
            <p className={styles.formFooter}>Do you want to sign out of DarkAuth?</p>
            {error ? <div className={styles.errorText}>{error}</div> : null}
            <button
              type="button"
              className={styles.primaryButton}
              onClick={signOut}
              disabled={loading}
            >
              {loading ? (
                <>
                  <span className={styles.loadingSpinner} />
                  Signing out...
                </>
              ) : (
                "Sign out"
              )}
            </button>
            <div className={styles.stageActions}>
              <button
                type="button"
                className={styles.linkButton}
                onClick={() => navigate("/apps")}
                disabled={loading}
              >
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </AuthViewFrame>
  );
}
