import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { loadUnlockedArk } from "../services/unlockedArk";
import KeyUnlockPanel from "./KeyUnlockPanel";
import { PortalHeader, PortalPage, PortalSection } from "./Portal";
import SettingsSecurity, { type SettingsSecurityPreviewData } from "./SettingsSecurity";
import UserLayout from "./UserLayout";

type KeyState = "locked" | "unlocked" | "setup_required";

type SettingsSessionData = {
  sub: string;
  name?: string;
  email?: string;
  keyState?: KeyState;
  organizationSlug?: string;
};

function resolveKeyState(sessionData: SettingsSessionData): KeyState {
  return sessionData.keyState === "unlocked" || loadUnlockedArk(sessionData.sub)
    ? "unlocked"
    : sessionData.keyState || "locked";
}

export default function SettingsSecurityView({
  sessionData,
  onLogout,
  previewData,
}: {
  sessionData: SettingsSessionData;
  onLogout: () => void;
  previewData?: SettingsSecurityPreviewData;
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
      onChangePassword={() => navigate("/security/password")}
      onManageSecurity={() => navigate("/security")}
      onLogout={onLogout}
    >
      <PortalPage>
        <PortalHeader
          eyebrow="Security"
          title="Security"
          description={
            keyState !== "unlocked"
              ? "You are signed in, but encrypted app access is locked for zero-knowledge clients."
              : "Manage sign-in, encrypted app access, recovery, trusted browsers, and two-factor authentication."
          }
        />
        {keyState !== "unlocked" ? (
          <PortalSection
            title="Encrypted app access is locked"
            description="Unlock this browser before setting up trusted browsers, recovery, or passkey encryption unlock."
          >
            <KeyUnlockPanel
              sub={sessionData.sub}
              email={sessionData.email}
              onUnlocked={(session) => setKeyState(session?.keyState || "unlocked")}
            />
          </PortalSection>
        ) : null}
        <SettingsSecurity sessionData={effectiveSessionData} previewData={previewData} />
      </PortalPage>
    </UserLayout>
  );
}
