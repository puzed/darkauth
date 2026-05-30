import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { loadUnlockedArk } from "../services/unlockedArk";
import styles from "./ChangePasswordView.module.css";
import KeyUnlockPanel from "./KeyUnlockPanel";
import SettingsSecurity from "./SettingsSecurity";
import UserLayout from "./UserLayout";

type KeyState = "locked" | "unlocked" | "setup_required";

type SettingsSessionData = {
  sub: string;
  name?: string;
  email?: string;
  keyState?: KeyState;
};

function resolveKeyState(sessionData: SettingsSessionData): KeyState {
  return sessionData.keyState === "unlocked" || loadUnlockedArk(sessionData.sub)
    ? "unlocked"
    : sessionData.keyState || "locked";
}

export default function SettingsSecurityView({
  sessionData,
  onLogout,
}: {
  sessionData: SettingsSessionData;
  onLogout: () => void;
}) {
  const navigate = useNavigate();
  const [keyState, setKeyState] = useState<KeyState>(() => resolveKeyState(sessionData));

  useEffect(() => {
    setKeyState(resolveKeyState(sessionData));
  }, [sessionData]);

  const effectiveSessionData = { ...sessionData, keyState };

  return (
    <UserLayout
      userName={sessionData.name}
      userEmail={sessionData.email}
      onChangePassword={() => navigate("/change-password")}
      onManageSecurity={() => navigate("/settings")}
      onLogout={onLogout}
    >
      <div className={styles.content}>
        <div className={`${styles.formHeader} ${styles.securityHeader}`}>
          <h2>Security Settings</h2>
          <p className={styles.subtitle}>
            {keyState !== "unlocked"
              ? "You are signed in, but encryption keys are locked for zero-knowledge clients."
              : "Manage two-factor authentication, passkeys, recovery keys, and trusted devices"}
          </p>
        </div>
        <div className={`${styles.formWrapper} ${styles.securityWrapper}`}>
          {keyState !== "unlocked" ? (
            <KeyUnlockPanel
              sub={sessionData.sub}
              email={sessionData.email}
              onUnlocked={(session) => setKeyState(session?.keyState || "unlocked")}
            />
          ) : null}
          <SettingsSecurity sessionData={effectiveSessionData} />
        </div>
      </div>
    </UserLayout>
  );
}
