import { useEffect, useState } from "react";
import AuthViewFrame from "./AuthViewFrame";
import Login from "./Login";

type SessionData = {
  sub: string;
  name?: string;
  email?: string;
  passwordResetRequired?: boolean;
  keyState?: "locked" | "unlocked" | "setup_required";
};

export default function LoginView(props?: {
  options?: unknown;
  onSwitchToRegister?: () => void;
  onLogin?: (session: SessionData) => void;
}) {
  const [brandingReady, setBrandingReady] = useState(() =>
    Boolean(window.__APP_CONFIG__?.branding)
  );
  const [clientCheckReady, setClientCheckReady] = useState(false);
  const showView = brandingReady && clientCheckReady;

  useEffect(() => {
    if (brandingReady) {
      return;
    }
    let cancelled = false;
    const check = () => {
      if (cancelled) return;
      if (window.__APP_CONFIG__?.branding) {
        setBrandingReady(true);
        return;
      }
      setTimeout(check, 50);
    };
    check();
    return () => {
      cancelled = true;
    };
  }, [brandingReady]);

  if (!showView) {
    return (
      <Login
        onLogin={props?.onLogin || (() => {})}
        onSwitchToRegister={props?.onSwitchToRegister || (() => {})}
        preloadClientCheckOnly
        onClientCheckResolved={() => setClientCheckReady(true)}
      />
    );
  }

  return (
    <AuthViewFrame>
      <Login
        onLogin={props?.onLogin || (() => {})}
        onSwitchToRegister={props?.onSwitchToRegister || (() => {})}
        skipClientCheck
      />
    </AuthViewFrame>
  );
}
