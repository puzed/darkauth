import { useId, useState } from "react";
import apiService from "../services/api";
import cryptoService, { sha256Base64Url, toBase64Url } from "../services/crypto";
import opaqueService from "../services/opaque";
import { saveExportKey } from "../services/sessionKey";
import Button from "./Button";

interface ResetPasswordProps {
  onSuccess?: () => void;
  title?: string;
  description?: string;
}

export default function ResetPassword({ onSuccess, title, description }: ResetPasswordProps) {
  const uid = useId();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || password.length < 12) {
      setError("Password must be at least 12 characters");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const start = await opaqueService.startRegistration(password, "");
      const startResp = await apiService.passwordChangeStart(start.request);
      const finish = await opaqueService.finishRegistration(
        startResp.message,
        startResp.serverPublicKey,
        start.state,
        startResp.identityU
      );
      const exportKeyHash = await sha256Base64Url(finish.passwordKey);
      await apiService.passwordChangeFinish(finish.request, exportKeyHash);
      const sessionData = await apiService.getSession();
      const userSub = sessionData.sub as string;

      // Store export key securely and clear from memory
      await saveExportKey(userSub, finish.passwordKey);

      try {
        const keys = await cryptoService.deriveKeysFromExportKey(finish.passwordKey, userSub);
        const drk = await cryptoService.generateDRK();
        const wrappedDrk = await cryptoService.wrapDRK(drk, keys.wrapKey, userSub);
        await apiService.putWrappedDrk(toBase64Url(wrappedDrk));
        const accountKey = await apiService.createAccountKey({ version: "v2" });
        const wrappingAlg = "OPAQUE-HKDF-SHA256+A256GCM/v2";
        const envelopeId = `env_${crypto.randomUUID()}`;
        const aad = cryptoService.envelopeAad({
          sub: userSub,
          keyId: accountKey.key_id,
          envelopeId,
          type: "password",
          wrappingAlg,
        });
        const wrappedEnvelopeDrk = await cryptoService.wrapKeyMaterial(drk, keys.wrapKey, aad);
        await apiService.createKeyEnvelope({
          envelopeId,
          keyId: accountKey.key_id,
          type: "password",
          label: "Password",
          wrappingAlg,
          wrappedKey: toBase64Url(wrappedEnvelopeDrk),
          aad: toBase64Url(aad),
          metadata: { version: "v2" },
        });

        // Clear sensitive data immediately after use
        cryptoService.clearSensitiveData(drk, keys.masterKey, keys.wrapKey, keys.deriveKey);
        try {
          const kp = await cryptoService.generateECDHKeyPair();
          const pub = await cryptoService.exportPublicKeyJWK(kp.publicKey);
          await apiService.putEncPublicJwk(pub);
          const privJwk = await crypto.subtle.exportKey("jwk", kp.privateKey);
          const wrappedPriv = await cryptoService.wrapEncPrivateJwkWithDrk(privJwk, drk);
          await apiService.putWrappedEncPrivateJwk(wrappedPriv);
          cryptoService.clearSensitiveData(drk);
        } catch {}
      } catch {}
      if (onSuccess) onSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to change password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-form">
      <h2>{title || "Password Reset Required"}</h2>
      <form onSubmit={handleSubmit} noValidate>
        <div className="form-group">
          <label htmlFor={`${uid}-password`}>New Password</label>
          <input
            type="password"
            id={`${uid}-password`}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter a new password"
            className={error ? "error" : ""}
            disabled={loading}
            autoComplete="new-password"
            required
          />
        </div>
        <div className="form-group">
          <label htmlFor={`${uid}-confirm`}>Confirm Password</label>
          <input
            type="password"
            id={`${uid}-confirm`}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Re-enter your new password"
            className={error ? "error" : ""}
            disabled={loading}
            autoComplete="new-password"
            required
          />
          {error && <div className="error-text">{error}</div>}
        </div>
        <Button type="submit" variant="primary" fullWidth disabled={loading}>
          {loading ? (
            <>
              <span className="loading-spinner" />
              Updating...
            </>
          ) : (
            "Update Password"
          )}
        </Button>
      </form>
      <div className="form-footer">
        <p>{description || "Set a new password to continue."}</p>
      </div>
    </div>
  );
}
