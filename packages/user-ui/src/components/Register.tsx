import { useId, useState } from "react";
import { useBranding } from "../hooks/useBranding";
import apiService from "../services/api";
import cryptoService, { toBase64Url } from "../services/crypto";
import opaqueService, { type OpaqueRegistrationState } from "../services/opaque";
import { saveExportKey } from "../services/sessionKey";

interface RegisterProps {
  onRegister: (sessionData: {
    sub: string;
    name?: string;
    email?: string;
    passwordResetRequired?: boolean;
  }) => void;
  onSwitchToLogin: () => void;
}

interface FormData {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
}

interface FormErrors {
  name?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
  general?: string;
}

export default function Register({ onRegister, onSwitchToLogin }: RegisterProps) {
  const uid = useId();
  const branding = useBranding();
  const [formData, setFormData] = useState<FormData>({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [loading, setLoading] = useState(false);
  const [opaqueState, setOpaqueState] = useState<OpaqueRegistrationState | null>(null);

  const validateForm = (): FormErrors => {
    const newErrors: FormErrors = {};

    if (!formData.name.trim()) {
      newErrors.name = "Full name is required";
    } else if (formData.name.trim().length < 2) {
      newErrors.name = "Name must be at least 2 characters";
    }

    if (!formData.email) {
      newErrors.email = "Email is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = "Please enter a valid email address";
    }

    if (!formData.password) {
      newErrors.password = "Password is required";
    } else if (formData.password.length < 12) {
      newErrors.password = "Password must be at least 12 characters";
    }

    if (!formData.confirmPassword) {
      newErrors.confirmPassword = "Please confirm your password";
    } else if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = "Passwords do not match";
    }

    return newErrors;
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));

    // Clear specific field error when user starts typing
    if (errors[name as keyof FormErrors]) {
      setErrors((prev) => ({ ...prev, [name]: undefined }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const formErrors = validateForm();
    if (Object.keys(formErrors).length > 0) {
      setErrors(formErrors);
      return;
    }

    setLoading(true);
    setErrors({});

    try {
      // Start OPAQUE registration
      const registrationStart = await opaqueService.startRegistration(
        formData.password,
        formData.email
      );
      setOpaqueState(registrationStart.state);

      // Send registration start request to server
      const registrationStartResponse = await apiService.opaqueRegisterStart({
        request: registrationStart.request,
        email: formData.email,
      });

      // Finish OPAQUE registration
      const registrationFinish = await opaqueService.finishRegistration(
        registrationStartResponse.message,
        registrationStartResponse.serverPublicKey,
        registrationStart.state,
        formData.email
      );

      // Send registration finish request to server
      const registrationFinishResponse = await apiService.opaqueRegisterFinish({
        email: formData.email,
        name: formData.name.trim(),
        message: registrationFinish.request,
        serverPublicKey: registrationStartResponse.serverPublicKey,
      });

      const keys = await cryptoService.deriveKeysFromExportKey(
        registrationFinish.passwordKey,
        registrationFinishResponse.sub
      );
      const drk = await cryptoService.generateDRK();
      const wrappedDrk = await cryptoService.wrapDRK(
        drk,
        keys.wrapKey,
        registrationFinishResponse.sub
      );

      try {
        await apiService.putWrappedDrk(toBase64Url(wrappedDrk));
      } catch (error) {
        console.warn("Failed to store wrapped DRK:", error);
        // Continue with registration even if DRK storage fails
      }

      const sessionData = await apiService.getSession();

      try {
        const kp = await cryptoService.generateECDHKeyPair();
        const pub = await cryptoService.exportPublicKeyJWK(kp.publicKey);
        await apiService.putEncPublicJwk(pub);
        try {
          const privJwk = await crypto.subtle.exportKey("jwk", kp.privateKey);
          const wrappedPriv = await cryptoService.wrapEncPrivateJwkWithDrk(privJwk, drk);
          await apiService.putWrappedEncPrivateJwk(wrappedPriv);
        } catch (e) {
          console.warn("Failed to store wrapped private key:", e);
        }
      } catch (e) {
        console.warn("Failed to set up encryption keys", e);
      }

      // Clear sensitive data
      opaqueService.clearState(registrationStart.state);
      saveExportKey(registrationFinishResponse.sub, registrationFinish.passwordKey);
      cryptoService.clearSensitiveData(registrationFinish.passwordKey, drk);

      onRegister({
        sub: registrationFinishResponse.sub,
        name: sessionData.name,
        email: sessionData.email,
        passwordResetRequired: !!sessionData.passwordResetRequired,
      });
    } catch (error) {
      console.error("Registration failed:", error);

      // Clear sensitive data on error
      if (opaqueState) {
        opaqueService.clearState(opaqueState);
      }

      let errorMessage = "Registration failed. Please try again.";
      if (error instanceof Error) {
        if (error.message.includes("already exists") || error.message.includes("duplicate")) {
          errorMessage = "An account with this email address already exists.";
        } else if (error.message.includes("validation")) {
          errorMessage = "Please check your information and try again.";
        } else if (error.message.includes("network") || error.message.includes("fetch")) {
          errorMessage = "Network error. Please check your connection and try again.";
        } else {
          errorMessage = error.message;
        }
      }

      setErrors({ general: errorMessage });
    } finally {
      setLoading(false);
      setOpaqueState(null);
    }
  };

  const getPasswordStrength = (password: string): { level: string; text: string } => {
    if (!password) return { level: "", text: "" };

    let score = 0;
    if (password.length >= 12) score += 25;
    if (/[a-z]/.test(password)) score += 25;
    if (/[A-Z]/.test(password)) score += 25;
    if (/\d/.test(password)) score += 25;
    if (/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) score += 25;
    score = Math.min(100, score);

    if (score >= 75) return { level: "strong", text: "Strong" };
    if (score >= 50) return { level: "good", text: "Good" };
    if (score >= 25) return { level: "fair", text: "Fair" };
    return { level: "weak", text: "Weak" };
  };

  const passwordStrength = getPasswordStrength(formData.password);

  return (
    <div className="auth-container da-auth-container">
      <h2 className="form-title da-auth-title">
        {branding.getText("createAccount", "Create your account")}
      </h2>

      <form className="form da-form" onSubmit={handleSubmit} noValidate>
        <div className="form-group da-form-group">
          <label className="da-form-label" htmlFor={`${uid}-name`}>
            Name
          </label>
          <input
            type="text"
            id={`${uid}-name`}
            name="name"
            value={formData.name}
            onChange={handleInputChange}
            placeholder="Enter your full name"
            className={`da-form-input ${errors.name ? "error da-form-input-error" : ""}`}
            disabled={loading}
            autoComplete="name"
            required
          />
          {errors.name && <div className="error-text da-form-error">{errors.name}</div>}
        </div>

        <div className="form-group da-form-group">
          <label className="da-form-label" htmlFor={`${uid}-email`}>
            {branding.getText("email", "Email")}
          </label>
          <input
            type="email"
            id={`${uid}-email`}
            name="email"
            value={formData.email}
            onChange={handleInputChange}
            placeholder={branding.getText("emailPlaceholder", "Enter your email")}
            className={`da-form-input ${errors.email ? "error da-form-input-error" : ""}`}
            disabled={loading}
            autoComplete="email"
            required
          />
          {errors.email && <div className="error-text da-form-error">{errors.email}</div>}
        </div>

        <div className="form-group da-form-group">
          <label className="da-form-label" htmlFor={`${uid}-password`}>
            {branding.getText("password", "Password")}
          </label>
          <input
            type="password"
            id={`${uid}-password`}
            name="password"
            value={formData.password}
            onChange={handleInputChange}
            placeholder="Create a strong password"
            className={`da-form-input ${errors.password ? "error da-form-input-error" : ""}`}
            disabled={loading}
            autoComplete="new-password"
            required
          />
          {formData.password && (
            <div className="password-strength">
              <div className="strength-bar">
                <div className={`strength-fill ${passwordStrength.level}`} />
              </div>
              <span className={`strength-text ${passwordStrength.level}`}>
                {passwordStrength.text}
              </span>
            </div>
          )}
          {errors.password && <div className="error-text da-form-error">{errors.password}</div>}
          {!errors.password && (
            <div className="help-text da-form-helper">Must be at least 12 characters</div>
          )}
        </div>

        <div className="form-group da-form-group">
          <label className="da-form-label" htmlFor={`${uid}-confirmPassword`}>
            {branding.getText("confirmPassword", "Confirm Password")}
          </label>
          <input
            type="password"
            id={`${uid}-confirmPassword`}
            name="confirmPassword"
            value={formData.confirmPassword}
            onChange={handleInputChange}
            placeholder={branding.getText("confirmPasswordPlaceholder", "Re-enter your password")}
            className={`da-form-input ${errors.confirmPassword ? "error da-form-input-error" : ""}`}
            disabled={loading}
            autoComplete="new-password"
            required
          />
          {errors.confirmPassword && (
            <div className="error-text da-form-error">{errors.confirmPassword}</div>
          )}
        </div>

        {errors.general && <div className="error-message da-error-message">{errors.general}</div>}

        <button
          type="submit"
          className="primary-button da-button da-button-primary da-form-submit"
          disabled={loading}
        >
          {loading ? (
            <>
              <span className="loading-spinner" />
              {branding.getText("signingUp", "Creating account...")}
            </>
          ) : (
            branding.getText("signin", "Continue")
          )}
        </button>
      </form>

      <div className="form-footer da-form-footer">
        <p>
          {branding.getText("hasAccount", "Already have an account?")}{" "}
          <button
            type="button"
            className="link-button da-button-link da-form-link"
            onClick={onSwitchToLogin}
            disabled={loading}
          >
            {branding.getText("signin", "Sign in")}
          </button>
        </p>
      </div>
    </div>
  );
}
