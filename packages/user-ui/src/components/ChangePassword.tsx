import { useId, useState } from "react";
import apiService from "../services/api";
import cryptoService, { fromBase64Url, sha256Base64Url, toBase64Url } from "../services/crypto";
import opaqueService from "../services/opaque";
import { saveExportKey } from "../services/sessionKey";
import Button from "./Button";
import styles from "./ChangePassword.module.css";

interface ChangePasswordProps {
  sub: string;
  email?: string | null;
  signInEmail?: string | null;
  onSuccess?: () => void;
}

export default function ChangePassword({
  sub,
  email,
  signInEmail,
  onSuccess,
}: ChangePasswordProps) {
  const uid = useId();
  const [oldPassword, setOldPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [needsKeyRegen, setNeedsKeyRegen] = useState(false);
  const [pendingNewExportKey, setPendingNewExportKey] = useState<Uint8Array | null>(null);
  const [showOldPassword, setShowOldPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);

  const getOrCreateAccountKeyId = async () => {
    try {
      const keybag = await apiService.getKeybag();
      const active = keybag.account_keys.find((key) => key.status === "active");
      if (active) return active.key_id;
    } catch {}
    const accountKey = await apiService.createAccountKey({ version: "v2" });
    return accountKey.key_id;
  };

  const storePasswordEnvelope = async (drk: Uint8Array, wrapKey: Uint8Array) => {
    const keyId = await getOrCreateAccountKeyId();
    const wrappingAlg = "OPAQUE-HKDF-SHA256+A256GCM/v2";
    const envelopeId = `env_${crypto.randomUUID()}`;
    const aad = cryptoService.envelopeAad({
      sub,
      keyId,
      envelopeId,
      type: "password",
      wrappingAlg,
    });
    const wrappedDrk = await cryptoService.wrapKeyMaterial(drk, wrapKey, aad);
    await apiService.createKeyEnvelope({
      envelopeId,
      keyId,
      type: "password",
      label: "Password",
      wrappingAlg,
      wrappedKey: toBase64Url(wrappedDrk),
      aad: toBase64Url(aad),
      metadata: { version: "v2" },
    });
  };

  const tryGenerateNewKeys = async (newExportKey: Uint8Array) => {
    const keys = await cryptoService.deriveKeysFromExportKey(newExportKey, sub);
    const drk = await cryptoService.generateDRK();
    const wrappedDrk = await cryptoService.wrapDRK(drk, keys.wrapKey, sub);
    try {
      await apiService.putWrappedDrk(toBase64Url(wrappedDrk));
      await storePasswordEnvelope(drk, keys.wrapKey);
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
      const currentSignInEmail = signInEmail || email;
      if (!currentSignInEmail) throw new Error("Missing email for verification");
      const loginStart = await opaqueService.startLogin(currentSignInEmail, oldPassword);
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

      // Store export key securely and clear from memory immediately
      await saveExportKey(sub, regFinish.passwordKey);

      if (recoveredDrk) {
        const keysNew = await cryptoService.deriveKeysFromExportKey(regFinish.passwordKey, sub);
        const wrappedDrk = await cryptoService.wrapDRK(recoveredDrk, keysNew.wrapKey, sub);
        await apiService.putWrappedDrk(toBase64Url(wrappedDrk));
        await storePasswordEnvelope(recoveredDrk, keysNew.wrapKey);

        // Clear all sensitive data from memory
        cryptoService.clearSensitiveData(
          regFinish.passwordKey,
          recoveredDrk,
          keysNew.masterKey,
          keysNew.wrapKey,
          keysNew.deriveKey
        );
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
    <div className={styles.passwordPanel}>
      <div className={styles.intro}>
        <h3>Change password</h3>
        <p>
          DarkAuth will update your sign-in password and preserve encrypted app access when your
          current password can unlock it.
        </p>
      </div>

      <form className={styles.form} onSubmit={handleSubmit} noValidate>
        <div className={styles.formGroup}>
          <label htmlFor={`${uid}-old`}>Current password</label>
          <div className={styles.passwordField}>
            <input
              type={showOldPassword ? "text" : "password"}
              id={`${uid}-old`}
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              placeholder="Enter your current password"
              className={error?.includes("Current password") ? styles.inputError : ""}
              disabled={loading}
              autoComplete="current-password"
              required
            />
            <button
              type="button"
              className={styles.toggle}
              onClick={() => setShowOldPassword((value) => !value)}
            >
              {showOldPassword ? "Hide" : "Show"}
            </button>
          </div>
        </div>

        <div className={styles.formGroup}>
          <label htmlFor={`${uid}-new`}>New password</label>
          <div className={styles.passwordField}>
            <input
              type={showNewPassword ? "text" : "password"}
              id={`${uid}-new`}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Create a new password"
              className={error?.includes("Password must") ? styles.inputError : ""}
              disabled={loading}
              autoComplete="new-password"
              required
            />
            <button
              type="button"
              className={styles.toggle}
              onClick={() => setShowNewPassword((value) => !value)}
            >
              {showNewPassword ? "Hide" : "Show"}
            </button>
          </div>
          <div className={styles.helpText}>Must be at least 12 characters</div>
        </div>

        <div className={styles.formGroup}>
          <label htmlFor={`${uid}-confirm`}>Confirm new password</label>
          <input
            type={showNewPassword ? "text" : "password"}
            id={`${uid}-confirm`}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Re-enter your new password"
            className={error?.includes("match") ? styles.inputError : ""}
            disabled={loading}
            autoComplete="new-password"
            required
          />
        </div>

        {error && <div className={styles.errorMessage}>{error}</div>}
        {info && !needsKeyRegen && <div className={styles.successMessage}>{info}</div>}

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
        <div className={styles.recoveryChoice}>
          <p>Your encryption key could not be recovered. You can generate new keys to continue.</p>
          <div className={styles.actions}>
            <Button type="button" variant="secondary" onClick={() => setNeedsKeyRegen(false)}>
              Try again
            </Button>
            <Button type="button" variant="success" onClick={handleGenerateNew}>
              Generate new keys
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
