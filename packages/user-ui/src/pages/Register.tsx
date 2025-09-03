import { useId, useState } from "react";
import { apiService } from "../services/api";
import { opaqueService } from "../services/opaque";

interface RegisterProps {
  onRegisterSuccess: (sessionId: string, sub: string) => void;
  onSwitchToLogin: () => void;
}

export default function Register({ onRegisterSuccess, onSwitchToLogin }: RegisterProps) {
  const uid = useId();
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [passwordStrength, setPasswordStrength] = useState(0);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));

    if (name === "password") {
      setPasswordStrength(calculatePasswordStrength(value));
    }
  };

  const calculatePasswordStrength = (password: string): number => {
    let score = 0;
    if (password.length >= 12) score += 25;
    if (/[a-z]/.test(password)) score += 25;
    if (/[A-Z]/.test(password)) score += 25;
    if (/[0-9]/.test(password)) score += 25;
    if (/[^A-Za-z0-9]/.test(password)) score += 25;
    return Math.min(100, score);
  };

  const getPasswordStrengthLabel = (strength: number): string => {
    if (strength < 25) return "Weak";
    if (strength < 50) return "Fair";
    if (strength < 75) return "Good";
    return "Strong";
  };

  const getPasswordStrengthColor = (strength: number): string => {
    if (strength < 25) return "#ff4444";
    if (strength < 50) return "#ff8800";
    if (strength < 75) return "#ffbb00";
    return "#16a34a";
  };

  const validateForm = (): string | null => {
    if (!formData.name.trim()) return "Name is required";
    if (!formData.email.trim()) return "Email is required";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      return "Please enter a valid email address";
    }
    if (formData.password.length < 12) {
      return "Password must be at least 12 characters long";
    }
    if (formData.password !== formData.confirmPassword) {
      return "Passwords do not match";
    }

    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);

    try {
      // Step 1: Start OPAQUE registration
      const registrationStart = await opaqueService.startRegistration(
        formData.password,
        formData.email
      );
      const startResponse = await apiService.opaqueRegisterStart({
        request: registrationStart.request,
        email: formData.email,
      });

      // Step 2: Finish OPAQUE registration
      const finishResult = await opaqueService.finishRegistration(
        startResponse.message,
        startResponse.serverPublicKey,
        registrationStart.state,
        formData.email
      );

      const finishResponse = await apiService.opaqueRegisterFinish({
        email: formData.email,
        name: formData.name,
        message: finishResult.request,
        serverPublicKey: startResponse.serverPublicKey,
      });

      onRegisterSuccess(finishResponse.sessionId, finishResponse.sub);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-form">
      <h2>Register for DarkAuth</h2>

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor={`${uid}-name`}>Full Name</label>
          <input
            type="text"
            id={`${uid}-name`}
            name="name"
            value={formData.name}
            onChange={handleInputChange}
            required
            disabled={loading}
            placeholder="Enter your full name"
          />
        </div>

        <div className="form-group">
          <label htmlFor={`${uid}-email`}>Email</label>
          <input
            type="email"
            id={`${uid}-email`}
            name="email"
            value={formData.email}
            onChange={handleInputChange}
            required
            disabled={loading}
            placeholder="Enter your email"
          />
        </div>

        <div className="form-group">
          <label htmlFor={`${uid}-password`}>Password</label>
          <input
            type="password"
            id={`${uid}-password`}
            name="password"
            value={formData.password}
            onChange={handleInputChange}
            required
            disabled={loading}
            placeholder="Enter a secure password"
            minLength={12}
          />
          {formData.password && (
            <div className="password-strength">
              <div className="strength-bar">
                <div
                  className="strength-fill"
                  style={{
                    width: `${passwordStrength}%`,
                    backgroundColor: getPasswordStrengthColor(passwordStrength),
                  }}
                />
              </div>
              <span
                className="strength-label"
                style={{ color: getPasswordStrengthColor(passwordStrength) }}
              >
                {getPasswordStrengthLabel(passwordStrength)}
              </span>
            </div>
          )}
        </div>

        <div className="form-group">
          <label htmlFor={`${uid}-confirmPassword`}>Confirm Password</label>
          <input
            type="password"
            id={`${uid}-confirmPassword`}
            name="confirmPassword"
            value={formData.confirmPassword}
            onChange={handleInputChange}
            required
            disabled={loading}
            placeholder="Confirm your password"
          />
        </div>

        {error && (
          <div className="error-message">
            <strong>Error:</strong> {error}
          </div>
        )}

        <button type="submit" disabled={loading} className="primary-button">
          {loading ? "Creating Account..." : "Create Account"}
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
            Login here
          </button>
        </p>
      </div>
    </div>
  );
}
