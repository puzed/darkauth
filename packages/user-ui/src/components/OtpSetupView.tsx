import { Link, useLocation, useNavigate } from "react-router-dom";
import { useBranding } from "../hooks/useBranding";
import ThemeToggle from "./ThemeToggle";
import UserLayout from "./UserLayout";
import OtpFlow from "./OtpFlow";
import styles from "./ChangePasswordView.module.css";
import authStyles from "./LoginView.module.css";
import btnStyles from "./Login.module.css";

export default function OtpSetupView({
  sessionData,
  onLogout,
}: {
  sessionData: { sub: string; name?: string; email?: string };
  onLogout: () => void;
}) {
  const branding = useBranding();
  const navigate = useNavigate();
  const location = useLocation();
  const forced = new URLSearchParams(location.search).get("forced") === "1";

  if (forced) {
    return (
      <div className={authStyles.app}>
        <div className={authStyles.container}>
          <div className={authStyles.authHeader}>
            <div className={authStyles.headerTop}>
              <Link to="/" className={authStyles.brand}>
                <span className={authStyles.brandIcon}>
                  <img
                    src={branding.getLogoUrl()}
                    alt={branding.getTitle()}
                    className={branding.getLogoUrl() === "/favicon.svg" ? authStyles.defaultLogo : ""}
                  />
                </span>
                <h1 className={authStyles.brandTitle}>{branding.getTitle()}</h1>
              </Link>
              <ThemeToggle />
            </div>
            <p className={authStyles.tagline}>{branding.getTagline()}</p>
          </div>

          <div className={btnStyles.authContainer}>
            <h2 className={btnStyles.formTitle}>Set up Two-Factor Authentication</h2>
            <p className={btnStyles.formDescription}>Scan the QR, then enter the 6-digit code to verify</p>
            <div className={btnStyles.form}>
              <OtpFlow fullWidth />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <UserLayout
      userName={sessionData.name}
      userEmail={sessionData.email}
      onChangePassword={() => navigate("/change-password")}
      onManageSecurity={() => navigate("/settings")}
      onLogout={onLogout}
    >
      <div className={styles.content}>
        <div className={styles.formHeader}>
          <h2>Set up Two-Factor Authentication</h2>
          <p className={styles.subtitle}>Scan the QR, then enter the 6-digit code to verify</p>
        </div>
        <div className={styles.formWrapper}>
          <OtpFlow />
        </div>
      </div>
    </UserLayout>
  );
}
