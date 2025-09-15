import { useNavigate } from "react-router-dom";
import styles from "./ChangePasswordView.module.css";
import SettingsSecurity from "./SettingsSecurity";
import UserLayout from "./UserLayout";

export default function SettingsSecurityView({
  sessionData,
  onLogout,
}: {
  sessionData: { sub: string; name?: string; email?: string };
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
          <p className={styles.subtitle}>Manage two-factor authentication and backup codes</p>
        </div>
        <div className={styles.formWrapper}>
          <SettingsSecurity />
        </div>
      </div>
    </UserLayout>
  );
}
