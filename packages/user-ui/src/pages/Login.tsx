import { useId, useState } from "react";
import { apiService } from "../services/api";
import { opaqueService } from "../services/opaque";

interface LoginProps {
  onLoginSuccess: (sessionId: string, sub: string) => void;
  onSwitchToRegister: () => void;
}

export default function Login({ onLoginSuccess, onSwitchToRegister }: LoginProps) {
  const uid = useId();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      // Step 1: Start OPAQUE login
      const loginStart = await opaqueService.startLogin(email, password);
      const startResponse = await apiService.opaqueLoginStart({
        email,
        request: loginStart.request,
      });

      // Step 2: Finish OPAQUE login
      const finishResult = await opaqueService.finishLogin(startResponse.message, loginStart.state);

      const finishResponse = await apiService.opaqueLoginFinish({
        sub: startResponse.sub,
        finish: finishResult.request,
        sessionId: startResponse.sessionId,
      });

      onLoginSuccess(finishResponse.sessionId, finishResponse.sub);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-form">
      <h2>Login to DarkAuth</h2>

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor={`${uid}-email`}>Email</label>
          <input
            type="email"
            id={`${uid}-email`}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
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
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={loading}
            placeholder="Enter your password"
          />
        </div>

        {error && (
          <div className="error-message">
            <strong>Error:</strong> {error}
          </div>
        )}

        <button type="submit" disabled={loading} className="primary-button">
          {loading ? "Logging in..." : "Login"}
        </button>
      </form>

      <div className="form-footer">
        <p>
          Don't have an account?{" "}
          <button
            type="button"
            className="link-button"
            onClick={onSwitchToRegister}
            disabled={loading}
          >
            Register here
          </button>
        </p>
      </div>
    </div>
  );
}
