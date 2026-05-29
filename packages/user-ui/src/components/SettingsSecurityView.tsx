import { useNavigate } from "react-router-dom";
import styles from "./ChangePasswordView.module.css";
import SettingsSecurity from "./SettingsSecurity";
import UserLayout from "./UserLayout";

export default function SettingsSecurityView({
  sessionData,
  onLogout,
}: {
  sessionData: {
    sub: string;
    name?: string;
    email?: string;
    keyState?: "locked" | "unlocked" | "setup_required";
  };
  onLogout: () => void;
}) {
  const navigate = useNavigate();
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
          <h2>Security Settings</h2>
          <p className={styles.subtitle}>
            {sessionData.keyState && sessionData.keyState !== "unlocked"
              ? "You are signed in, but encryption keys are locked for zero-knowledge clients."
              : "Manage two-factor authentication, passkeys, recovery keys, and trusted devices"}
          </p>
        </div>
        <div className={styles.formWrapper}>
          <SettingsSecurity sessionData={sessionData} />
        </div>
      </div>
    </UserLayout>
  );
}
