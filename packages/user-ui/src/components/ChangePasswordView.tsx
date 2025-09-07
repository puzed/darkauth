import { useNavigate } from "react-router-dom";
import ChangePassword from "./ChangePassword";
import styles from "./ChangePasswordView.module.css";
import UserLayout from "./UserLayout";

interface ChangePasswordViewProps {
  sessionData: {
    sub: string;
    email?: string | null;
    name?: string | null;
  };
  onLogout: () => void;
}

export default function ChangePasswordView({ sessionData, onLogout }: ChangePasswordViewProps) {
  const navigate = useNavigate();

  const handleSuccess = () => {
    navigate("/dashboard");
  };

  return (
    <UserLayout
      userName={sessionData.name || null}
      userEmail={sessionData.email || null}
      onChangePassword={() => navigate("/change-password")}
      onLogout={onLogout}
    >
      <div className={styles.content}>
        <div className={styles.formHeader}>
          <h2>Change Your Password</h2>
          <p className={styles.subtitle}>Update your password to keep your account secure</p>
        </div>

        <div className={styles.formWrapper}>
          <ChangePassword
            sub={sessionData.sub}
            email={sessionData.email}
            onSuccess={handleSuccess}
          />
        </div>
      </div>
    </UserLayout>
  );
}
