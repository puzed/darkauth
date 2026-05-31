import FeatureDeepDive from "../../components/FeatureDeepDive";

export default function Mfa() {
  return (
    <FeatureDeepDive
      eyebrow="Feature"
      title="Multi-factor authentication"
      sub="Authenticator-app two-factor for users and admins."
      definition="TOTP-based MFA using the standard 6-digit authenticator app flow, with backup codes, per-organization enforcement, and anti-replay protection."
      whyItMatters={
        <p>
          A stolen password is not enough to log in when MFA is active. TOTP adds a second factor that requires access to the user's device, not just their password. For organizations with strict access policies, <code>force_otp</code> enforces MFA for all members — users without MFA set up cannot access org-scoped resources.
        </p>
      }
      howItWorksEli5={
        <p>
          After entering your password, you open your authenticator app (Google Authenticator, Authy, 1Password, etc.) and enter the 6-digit code it shows. The code changes every 30 seconds. DarkAuth checks that the code is valid for your account — if yes, you're in. If you lose your device, backup codes let you recover.
        </p>
      }
      howItWorksPrecise={
        <p>
          TOTP is defined in RFC 6238. DarkAuth generates a QR code for provisioning; the user scans it with their authenticator app, which stores the TOTP secret. Each login, the server computes valid codes for the current 30-second window (±1 window for clock skew tolerance) and compares the submitted code. To prevent replay, the last-used timestep is tracked — a code already used in a window cannot be reused. TOTP secrets are encrypted at rest using the system KEK.
        </p>
      }
      details={[
        "6-digit TOTP over 30-second windows (RFC 6238)",
        "QR code provisioning for authenticator apps",
        "8 Argon2-hashed backup codes issued at enrollment",
        "Anti-replay: last-used timestep tracked per user",
        "±1 window clock skew tolerance",
        "Rate limiting and lockout on TOTP verification failures",
        "Per-organization force_otp enforcement: all org members must have MFA active",
        "TOTP secrets encrypted at rest using the system KEK",
        "MFA state reflected in ID token amr (Authentication Methods References) and acr claims",
        "MFA applies to both end users and admin users (separate enforcement)",
      ]}
      related={[
        { label: "Organizations & RBAC", to: "/features/organizations-rbac" },
        { label: "Security overview", to: "/security" },
      ]}
    />
  );
}
