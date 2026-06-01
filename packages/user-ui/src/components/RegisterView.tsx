import AuthViewFrame from "./AuthViewFrame";
import Register from "./Register";

type SessionData = {
  sub: string;
  name?: string;
  email?: string;
  passwordResetRequired?: boolean;
  keyState?: "locked" | "unlocked" | "setup_required";
  organizationId?: string;
  organizationSlug?: string;
};

export default function RegisterView(props?: {
  options?: unknown;
  onSwitchToLogin?: () => void;
  onRegister?: (session: SessionData) => void;
}) {
  return (
    <AuthViewFrame>
      <Register
        onRegister={props?.onRegister || (() => {})}
        onSwitchToLogin={props?.onSwitchToLogin || (() => {})}
      />
    </AuthViewFrame>
  );
}
