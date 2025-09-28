import { useState } from "react";
import { apiService } from "../services/api";
import { logger } from "../services/logger";

// import { cryptoService } from '../services/crypto';

interface AuthorizeProps {
  authRequest: {
    requestId: string;
    clientName: string;
    scopes: string[];
    hasZk: boolean;
  };
  sessionId: string;
  sub: string;
}

export default function Authorize({ authRequest }: AuthorizeProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleApprove = async () => {
    setLoading(true);
    setError(null);

    try {
      let drkJwe: string | undefined;

      if (authRequest.hasZk) {
        logger.info({ requestId: authRequest.requestId }, "ZK delivery requested");

        // This would normally:
        // 1. Get the wrapped DRK from server
        // 2. Unwrap it using the export_key from OPAQUE login
        // 3. Create JWE for the client's ephemeral public key
        // For now, we'll simulate this process

        // In a real ZK implementation, this would:
        // 1. Get wrapped DRK from server
        // 2. Unwrap it using session key
        // 3. Create JWE for client's ephemeral key
        // For now, we'll just indicate ZK delivery is available
        logger.debug({ requestId: authRequest.requestId }, "ZK delivery placeholder execution");
        drkJwe = "placeholder-jwe";
      }

      const response = await apiService.authorize({
        requestId: authRequest.requestId,
        approve: true,
      });

      // Handle the redirect
      if (response.redirectUrl) {
        let redirectUrl = response.redirectUrl;

        // If ZK delivery, append the JWE to the fragment
        if (drkJwe && authRequest.hasZk) {
          redirectUrl += `#drk_jwe=${encodeURIComponent(drkJwe)}`;
        }

        window.location.href = redirectUrl;
      } else {
        setError("No redirect URL received from server");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authorization failed");
    } finally {
      setLoading(false);
    }
  };

  const handleDeny = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await apiService.authorize({
        requestId: authRequest.requestId,
        approve: false,
      });

      if (response.redirectUrl) {
        window.location.href = `${response.redirectUrl}&error=access_denied`;
      } else {
        setError("No redirect URL received from server");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authorization failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="authorize-container">
      <div className="authorize-card">
        <div className="authorize-header">
          <div className="client-icon">🔐</div>
          <h2>Authorization Request</h2>
        </div>

        <div className="client-info">
          <h3>{authRequest.clientName}</h3>
          <p>is requesting access to your account</p>
        </div>

        <div className="scopes-section">
          <h4>Permissions requested:</h4>
          <ul className="scopes-list">
            {authRequest.scopes.map((scope) => (
              <li key={scope} className="scope-item">
                <span className="scope-icon">✓</span>
                <span className="scope-name">{scope}</span>
                <span className="scope-description">{getScopeDescription(scope)}</span>
              </li>
            ))}
          </ul>
        </div>

        {authRequest.hasZk && (
          <div className="zk-info">
            <div className="zk-icon">🔒</div>
            <div className="zk-content">
              <h4>Zero-Knowledge Delivery</h4>
              <p>
                This application supports zero-knowledge authentication. Your encryption keys will
                be securely delivered without the server being able to access them.
              </p>
            </div>
          </div>
        )}

        {error && (
          <div className="error-message">
            <strong>Error:</strong> {error}
          </div>
        )}

        <div className="authorize-actions">
          <button
            type="button"
            onClick={handleApprove}
            disabled={loading}
            className="approve-button"
          >
            {loading ? "Processing..." : "Allow Access"}
          </button>

          <button type="button" onClick={handleDeny} disabled={loading} className="deny-button">
            {loading ? "Processing..." : "Deny"}
          </button>
        </div>

        <div className="authorize-footer">
          <p className="security-note">
            🛡️ Your password never leaves your device. DarkAuth uses OPAQUE protocol for
            zero-knowledge authentication.
          </p>
        </div>
      </div>
    </div>
  );
}

function getScopeDescription(scope: string): string {
  switch (scope) {
    case "openid":
      return "Authenticate your identity";
    case "profile":
      return "Access your basic profile information";
    case "email":
      return "Access your email address";
    case "groups":
      return "Access your group memberships";
    case "permissions":
      return "Access your permissions";
    default:
      return `Access your ${scope} information`;
  }
}
