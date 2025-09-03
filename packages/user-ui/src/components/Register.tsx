import { useId, useState } from "react";
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

  const getPasswordStrength = (
    password: string
  ): { strength: number; text: string; color: string } => {
    if (!password) return { strength: 0, text: "", color: "" };

    let score = 0;
    if (password.length >= 12) score += 25;
    if (/[a-z]/.test(password)) score += 25;
    if (/[A-Z]/.test(password)) score += 25;
    if (/\d/.test(password)) score += 25;
    if (/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) score += 25;
    score = Math.min(100, score);

    let text = "Weak";
    let color = "#dc2626";
    if (score >= 75) {
      text = "Strong";
      color = "#16a34a";
    } else if (score >= 50) {
      text = "Good";
      color = "#65a30d";
    } else if (score >= 25) {
      text = "Fair";
      color = "#ea580c";
    }

    return { strength: score, text, color };
  };

  const passwordStrength = getPasswordStrength(formData.password);

  return (
    <div className="register-form">
      <h2>Create Account</h2>

      <form onSubmit={handleSubmit} noValidate>
        <div className="form-group">
          <label htmlFor={`${uid}-name`}>Full Name</label>
          <input
            type="text"
            id={`${uid}-name`}
            name="name"
            value={formData.name}
            onChange={handleInputChange}
            placeholder="John Doe"
            className={errors.name ? "error" : ""}
            disabled={loading}
            autoComplete="name"
            required
          />
          {errors.name && <div className="error-text">{errors.name}</div>}
        </div>

        <div className="form-group">
          <label htmlFor={`${uid}-email`}>Email Address</label>
          <input
            type="email"
            id={`${uid}-email`}
            name="email"
            value={formData.email}
            onChange={handleInputChange}
            placeholder="your@email.com"
            className={errors.email ? "error" : ""}
            disabled={loading}
            autoComplete="email"
            required
          />
          {errors.email && <div className="error-text">{errors.email}</div>}
        </div>

        <div className="form-group">
          <label htmlFor={`${uid}-password`}>Password</label>
          <input
            type="password"
            id={`${uid}-password`}
            name="password"
            value={formData.password}
            onChange={handleInputChange}
            placeholder="Create a strong password"
            className={errors.password ? "error" : ""}
            disabled={loading}
            autoComplete="new-password"
            required
          />
          {formData.password && (
            <div className="password-strength">
              <div className="strength-bar">
                <div
                  className="strength-fill"
                  style={{
                    width: `${passwordStrength.strength}%`,
                    backgroundColor: passwordStrength.color,
                  }}
                />
              </div>
              <span style={{ color: passwordStrength.color }}>{passwordStrength.text}</span>
            </div>
          )}
          {errors.password && <div className="error-text">{errors.password}</div>}
          <div className="help-text">Must be at least 12 characters</div>
        </div>

        <div className="form-group">
          <label htmlFor={`${uid}-confirmPassword`}>Confirm Password</label>
          <input
            type="password"
            id={`${uid}-confirmPassword`}
            name="confirmPassword"
            value={formData.confirmPassword}
            onChange={handleInputChange}
            placeholder="Confirm your password"
            className={errors.confirmPassword ? "error" : ""}
            disabled={loading}
            autoComplete="new-password"
            required
          />
          {errors.confirmPassword && <div className="error-text">{errors.confirmPassword}</div>}
        </div>

        {errors.general && <div className="error-message">{errors.general}</div>}

        <button type="submit" className="primary-button" disabled={loading}>
          {loading ? (
            <>
              <span className="loading-spinner" />
              Creating Account...
            </>
          ) : (
            "Create Account"
          )}
        </button>
      </form>

      <div className="form-footer">
        <p>
          Already have an account?{" "}
          <button
            type="button"
            className="link-button"
            onClick={onSwitchToLogin}
            disabled={loading}
          >
            Sign in
          </button>
        </p>
      </div>
    </div>
  );
}
