import { useId, useState } from "react";
import apiService from "../services/api";
import cryptoService, { fromBase64Url, sha256Base64Url, toBase64Url } from "../services/crypto";
import opaqueService from "../services/opaque";
import { saveExportKey } from "../services/sessionKey";
import Button from "./Button";

interface ChangePasswordProps {
  sub: string;
  email?: string | null;
  onSuccess?: () => void;
}

export default function ChangePassword({ sub, email, onSuccess }: ChangePasswordProps) {
  const uid = useId();
  const [oldPassword, setOldPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [needsKeyRegen, setNeedsKeyRegen] = useState(false);
  const [pendingNewExportKey, setPendingNewExportKey] = useState<Uint8Array | null>(null);

  const tryGenerateNewKeys = async (newExportKey: Uint8Array) => {
    const keys = await cryptoService.deriveKeysFromExportKey(newExportKey, sub);
    const drk = await cryptoService.generateDRK();
    const wrappedDrk = await cryptoService.wrapDRK(drk, keys.wrapKey, sub);
    try {
      await apiService.putWrappedDrk(toBase64Url(wrappedDrk));
    } catch {}
    try {
      const kp = await cryptoService.generateECDHKeyPair();
      const pub = await cryptoService.exportPublicKeyJWK(kp.publicKey);
      await apiService.putEncPublicJwk(pub);
      const privJwk = await crypto.subtle.exportKey("jwk", kp.privateKey);
      const wrappedPriv = await cryptoService.wrapEncPrivateJwkWithDrk(privJwk, drk);
      await apiService.putWrappedEncPrivateJwk(wrappedPriv);
      cryptoService.clearSensitiveData(drk);
    } catch {}
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setNeedsKeyRegen(false);

    if (!password || password.length < 12) {
      setError("Password must be at least 12 characters");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    if (!oldPassword) {
      setError("Current password is required");
      return;
    }

    setLoading(true);
    try {
      if (!email) throw new Error("Missing email for verification");
      const loginStart = await opaqueService.startLogin(email, oldPassword);
      const verifyStart = await apiService.passwordVerifyStart(loginStart.request);
      const verifyFinish = await opaqueService.finishLogin(verifyStart.message, loginStart.state);
      const verifyResult = await apiService.passwordVerifyFinish(
        verifyFinish.request,
        verifyStart.sessionId
      );
      const reauthToken = verifyResult.reauth_token;
      opaqueService.clearState(loginStart.state);

      let recoveredDrk: Uint8Array | null = null;
      try {
        const wrappedB64 = await apiService.getWrappedDrk();
        const wrapped = fromBase64Url(wrappedB64);
        const keysOld = await cryptoService.deriveKeysFromExportKey(verifyFinish.exportKey, sub);
        recoveredDrk = await cryptoService.unwrapDRK(wrapped, keysOld.wrapKey, sub);
      } catch {
        recoveredDrk = null;
      }

      const regStart = await opaqueService.startRegistration(password, email || "");
      const startResp = await apiService.passwordChangeStart(regStart.request);
      const regFinish = await opaqueService.finishRegistration(
        startResp.message,
        startResp.serverPublicKey,
        regStart.state,
        startResp.identityU
      );
      const exportKeyHash = await sha256Base64Url(regFinish.passwordKey);
      await apiService.passwordChangeFinish(regFinish.request, exportKeyHash, reauthToken);

      saveExportKey(sub, regFinish.passwordKey);

      if (recoveredDrk) {
        const keysNew = await cryptoService.deriveKeysFromExportKey(regFinish.passwordKey, sub);
        const wrappedDrk = await cryptoService.wrapDRK(recoveredDrk, keysNew.wrapKey, sub);
        await apiService.putWrappedDrk(toBase64Url(wrappedDrk));
        cryptoService.clearSensitiveData(regFinish.passwordKey, recoveredDrk);
        setInfo("Password changed and keys preserved.");
        if (onSuccess) onSuccess();
        return;
      }

      setPendingNewExportKey(regFinish.passwordKey);
      setNeedsKeyRegen(true);
      setInfo(
        "Password changed, but your encryption key could not be recovered. You can generate a new key to continue."
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to change password";
      if (msg.toLowerCase().includes("opaque") || msg.toLowerCase().includes("auth")) {
        setError("Current password is incorrect");
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateNew = async () => {
    if (!pendingNewExportKey) return;
    setLoading(true);
    setError(null);
    try {
      await tryGenerateNewKeys(pendingNewExportKey);
      setNeedsKeyRegen(false);
      setInfo("New encryption keys generated.");
      if (onSuccess) onSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate new keys");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <h2 className="form-title">Change your password</h2>

      <form onSubmit={handleSubmit} noValidate>
        <div className="form-group">
          <label htmlFor={`${uid}-old`}>Current password</label>
          <input
            type="password"
            id={`${uid}-old`}
            value={oldPassword}
            onChange={(e) => setOldPassword(e.target.value)}
            placeholder="Enter your current password"
            className={error?.includes("Current password") ? "error" : ""}
            disabled={loading}
            autoComplete="current-password"
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor={`${uid}-new`}>New password</label>
          <input
            type="password"
            id={`${uid}-new`}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Create a new password"
            className={error?.includes("Password must") ? "error" : ""}
            disabled={loading}
            autoComplete="new-password"
            required
          />
          <div className="help-text">Must be at least 12 characters</div>
        </div>

        <div className="form-group">
          <label htmlFor={`${uid}-confirm`}>Confirm new password</label>
          <input
            type="password"
            id={`${uid}-confirm`}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Re-enter your new password"
            className={error?.includes("match") ? "error" : ""}
            disabled={loading}
            autoComplete="new-password"
            required
          />
        </div>

        {error && <div className="error-message">{error}</div>}
        {info && !needsKeyRegen && (
          <div
            style={{
              padding: "0.875rem",
              background: "var(--success-50)",
              border: "1px solid var(--success-500)",
              borderRadius: "var(--radius-md)",
              marginBottom: "1.25rem",
              fontSize: "0.875rem",
              color: "var(--success-700)",
            }}
          >
            {info}
          </div>
        )}

        <Button type="submit" variant="primary" fullWidth disabled={loading}>
          {loading ? (
            <>
              <span className="loading-spinner" />
              Updating password...
            </>
          ) : (
            "Update password"
          )}
        </Button>
      </form>

      {needsKeyRegen && (
        <div className="form-footer" style={{ borderTop: "1px solid var(--gray-200)" }}>
          <p style={{ marginBottom: "1rem" }}>
            Your encryption key could not be recovered. You can generate new keys to continue.
          </p>
          <div className="actions">
            <button
              type="button"
              className="secondary-button"
              onClick={() => setNeedsKeyRegen(false)}
            >
              Try Again
            </button>
            <button
              type="button"
              className="primary-button"
              onClick={handleGenerateNew}
              style={{ background: "var(--success-600)" }}
            >
              Generate New Keys
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
