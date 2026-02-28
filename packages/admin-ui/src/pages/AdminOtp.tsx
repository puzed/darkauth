import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import AuthFrame from "@/components/auth/AuthFrame";
import styles from "@/components/Login.module.css";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import adminApiService from "@/services/api";

type OtpStatus = {
  enabled: boolean;
  pending: boolean;
  verified: boolean;
  created_at?: string | null;
  last_used_at?: string | null;
};

type View = "manage" | "setup" | "verify" | "disable" | "reset" | "backup";
type SetupData = { secret: string; provisioningUri: string };

function formatDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString();
}

export default function AdminOtp() {
  const location = useLocation();
  const manageRequested = new URLSearchParams(location.search).get("manage") === "1";
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<OtpStatus | null>(null);
  const [view, setView] = useState<View>(manageRequested ? "manage" : "verify");
  const [setupData, setSetupData] = useState<SetupData | null>(null);
  const [showSecret, setShowSecret] = useState(false);
  const [setupCode, setSetupCode] = useState("");
  const [verifyCode, setVerifyCode] = useState("");
  const [disableCode, setDisableCode] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const qrCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const setupSubmittingRef = useRef(false);
  const verifySubmittingRef = useRef(false);
  const disableSubmittingRef = useRef(false);
  const resetSubmittingRef = useRef(false);

  const load = useCallback(
    async (requestedView?: View) => {
      try {
        setLoading(true);
        setError(null);
        setSetupData(null);
        setShowSecret(false);
        setBackupCodes(null);
        setSetupCode("");
        setVerifyCode("");
        setDisableCode("");
        setResetCode("");
        const current = await adminApiService.getOwnOtpStatus();
        setStatus(current);
        const nextView: View = requestedView
          ? requestedView
          : current.pending
            ? "setup"
            : current.enabled
              ? manageRequested
                ? "manage"
                : "verify"
              : manageRequested
                ? "manage"
                : "setup";
        setView(nextView);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load OTP status");
      } finally {
        setLoading(false);
      }
    },
    [manageRequested]
  );

  useEffect(() => {
    load();
  }, [load]);

  const startSetup = useCallback(async () => {
    try {
      setError(null);
      const init = await adminApiService.ownOtpSetupInit();
      setSetupData({ secret: init.secret, provisioningUri: init.provisioning_uri });
      setStatus((prev) =>
        prev
          ? { ...prev, enabled: false, pending: true, verified: false }
          : { enabled: false, pending: true, verified: false }
      );
      setView("setup");
      setSetupCode("");
      setShowSecret(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start OTP setup");
    }
  }, []);

  useEffect(() => {
    (async () => {
      if (setupData?.provisioningUri && qrCanvasRef.current) {
        try {
          const QRCode = (await import("qrcode")).default;
          await QRCode.toCanvas(qrCanvasRef.current, setupData.provisioningUri, {
            width: 192,
            margin: 1,
          });
        } catch {}
      }
    })();
  }, [setupData?.provisioningUri]);

  useEffect(() => {
    if (!loading && view === "setup" && !setupData) {
      if (status?.pending || (!manageRequested && !status?.enabled)) {
        startSetup();
      }
    }
  }, [loading, status, view, setupData, startSetup, manageRequested]);

  const doSetupVerify = async (input?: string) => {
    const nextCode = (input ?? setupCode).replace(/[^0-9]/g, "").slice(0, 6);
    if (nextCode.length !== 6) return;
    if (setupSubmittingRef.current) return;
    setupSubmittingRef.current = true;
    try {
      setError(null);
      const res = await adminApiService.ownOtpSetupVerify(nextCode);
      setBackupCodes(res.backup_codes || []);
      setStatus((prev) =>
        prev
          ? { ...prev, enabled: true, pending: false, verified: true }
          : { enabled: true, pending: false, verified: true }
      );
      setView("backup");
      setSetupCode("");
      setSetupData(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Verification failed");
    } finally {
      setupSubmittingRef.current = false;
    }
  };

  const doVerify = async (input?: string) => {
    const nextCode = (input ?? verifyCode).replace(/[^0-9A-Za-z-]/g, "").toUpperCase();
    const raw = nextCode.replace(/[^0-9A-Z-]/g, "");
    if (raw.replace(/-/g, "").length < 6) return;
    if (verifySubmittingRef.current) return;
    verifySubmittingRef.current = true;
    try {
      setError(null);
      await adminApiService.ownOtpVerify(nextCode);
      window.location.replace("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Verification failed");
    } finally {
      verifySubmittingRef.current = false;
    }
  };

  const doDisable = async () => {
    const raw = disableCode.replace(/\s+/g, "");
    if (raw.length < 6) return;
    if (disableSubmittingRef.current) return;
    disableSubmittingRef.current = true;
    try {
      setError(null);
      await adminApiService.ownOtpDisable(disableCode);
      setDisableCode("");
      await load("manage");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to disable OTP");
    } finally {
      disableSubmittingRef.current = false;
    }
  };

  const doReset = async () => {
    const raw = resetCode.replace(/\s+/g, "");
    if (raw.length < 6) return;
    if (resetSubmittingRef.current) return;
    resetSubmittingRef.current = true;
    try {
      setError(null);
      const init = await adminApiService.ownOtpReset(resetCode);
      setSetupData({ secret: init.secret, provisioningUri: init.provisioning_uri });
      setStatus((prev) =>
        prev
          ? { ...prev, enabled: false, pending: true, verified: false }
          : { enabled: false, pending: true, verified: false }
      );
      setView("setup");
      setResetCode("");
      setShowSecret(false);
      setBackupCodes(null);
      setSetupCode("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to reset OTP");
    } finally {
      resetSubmittingRef.current = false;
    }
  };

  if (loading) return null;

  const setupCodeInputId = "admin-otp-setup-code";
  const verifyCodeInputId = "admin-otp-verify-code";
  const disableCodeInputId = "admin-otp-disable-code";
  const resetCodeInputId = "admin-otp-reset-code";

  const renderSetup = () => {
    if (!setupData) {
      return (
        <div className={styles.formGroup}>
          <p className={styles.label} style={{ textAlign: "center" }}>
            Generate a setup QR code to enable OTP
          </p>
          <div className={styles.actions} style={{ justifyContent: "center" }}>
            <Button type="button" onClick={startSetup}>
              Generate QR Code
            </Button>
            {manageRequested && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setView("manage");
                  setError(null);
                }}
              >
                Cancel
              </Button>
            )}
          </div>
        </div>
      );
    }

    return (
      <form
        onSubmit={(event) => {
          event.preventDefault();
          doSetupVerify();
        }}
      >
        <p className={styles.label} style={{ textAlign: "center" }}>
          Scan the QR code with your authenticator app
        </p>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 16,
            marginBottom: 16,
          }}
        >
          <canvas
            ref={qrCanvasRef}
            width={192}
            height={192}
            style={{ background: "#fff", borderRadius: 12 }}
          />
          <button
            type="button"
            onClick={() => setShowSecret((v) => !v)}
            className={styles.manualToggle}
          >
            {showSecret ? "Hide manual secret" : "Cannot scan? Show manual secret"}
          </button>
          {showSecret && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
                alignItems: "center",
                width: "100%",
              }}
            >
              <div
                style={{
                  background: "hsl(var(--muted))",
                  padding: 12,
                  borderRadius: 8,
                  fontFamily: "monospace",
                  textAlign: "center",
                  minWidth: 220,
                }}
              >
                {setupData.secret}
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(setupData.secret);
                  } catch {}
                }}
              >
                Copy secret
              </Button>
            </div>
          )}
        </div>
        <div className={styles.formGroup}>
          <label className={styles.label} htmlFor={setupCodeInputId}>
            Enter the 6-digit code
          </label>
          <Input
            id={setupCodeInputId}
            value={setupCode}
            onChange={(event) => {
              const raw = event.target.value.replace(/[^0-9]/g, "");
              const nextValue = raw.slice(0, 6);
              setSetupCode(nextValue);
              if (!setupSubmittingRef.current && nextValue.length === 6) {
                void doSetupVerify(nextValue);
              }
            }}
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            placeholder="123456"
            style={{ fontSize: 24, textAlign: "center", letterSpacing: 6 }}
          />
        </div>
        <div className={styles.actions}>
          <Button type="submit" disabled={setupCode.length !== 6} style={{ width: "100%" }}>
            Verify
          </Button>
        </div>
      </form>
    );
  };

  const renderVerify = () => (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        doVerify();
      }}
    >
      <div className={styles.formGroup}>
        <label className={styles.label} htmlFor={verifyCodeInputId}>
          Enter your OTP code or backup code
        </label>
        <Input
          id={verifyCodeInputId}
          value={verifyCode}
          onChange={(event) => {
            const cleaned = event.target.value.replace(/[^0-9A-Za-z-]/g, "").toUpperCase();
            const nextValue = cleaned.slice(0, 14);
            setVerifyCode(nextValue);
            if (!verifySubmittingRef.current && /^[0-9]{6}$/.test(nextValue)) {
              void doVerify(nextValue);
            }
          }}
          inputMode="text"
          autoComplete="one-time-code"
          autoFocus
          placeholder="123456"
          style={{ fontSize: 24, textAlign: "center", letterSpacing: 6 }}
        />
        <p style={{ marginTop: 8, fontSize: 14, textAlign: "center" }}>
          You can also use a backup code.
        </p>
      </div>
      <div className={styles.actions}>
        <Button
          type="submit"
          disabled={verifyCode.replace(/-/g, "").length < 6}
          style={{ width: "100%" }}
        >
          Verify
        </Button>
      </div>
    </form>
  );

  const renderManage = () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div className={styles.formGroup}>
        <p className={styles.label}>Status</p>
        <p style={{ fontSize: 16, marginBottom: 8 }}>
          {status?.enabled
            ? "Two-factor authentication is enabled"
            : status?.pending
              ? "Two-factor authentication setup is pending verification"
              : "Two-factor authentication is not configured"}
        </p>
        {status?.enabled && (
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 4 }}>
            {formatDate(status.created_at) && (
              <li style={{ fontSize: 14 }}>Created: {formatDate(status.created_at)}</li>
            )}
            {formatDate(status.last_used_at) && (
              <li style={{ fontSize: 14 }}>Last used: {formatDate(status.last_used_at)}</li>
            )}
          </ul>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {!status?.enabled && !status?.pending && (
          <Button type="button" onClick={startSetup}>
            Start OTP Setup
          </Button>
        )}
        {(status?.enabled || status?.pending) && (
          <Button
            type="button"
            onClick={() => {
              setView("reset");
              setResetCode("");
              setError(null);
            }}
          >
            Resetup OTP
          </Button>
        )}
        {status?.enabled && (
          <Button
            type="button"
            variant="destructive"
            onClick={() => {
              setView("disable");
              setDisableCode("");
              setError(null);
            }}
          >
            Disable OTP
          </Button>
        )}
      </div>
    </div>
  );

  const renderDisable = () => (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        doDisable();
      }}
    >
      <div className={styles.formGroup}>
        <p className={styles.label}>Confirm removal</p>
        <p style={{ marginBottom: 12 }}>
          Enter a valid OTP or backup code to disable two-factor authentication.
        </p>
        <Input
          id={disableCodeInputId}
          value={disableCode}
          onChange={(event) => {
            const cleaned = event.target.value.replace(/[^0-9A-Za-z-]/g, "").toUpperCase();
            setDisableCode(cleaned.slice(0, 14));
          }}
          inputMode="text"
          autoComplete="one-time-code"
          placeholder="123456 or BACKUP-CODE"
          style={{ fontSize: 20, textAlign: "center", letterSpacing: 4 }}
        />
      </div>
      <div className={styles.actions}>
        <Button
          type="submit"
          variant="destructive"
          disabled={disableCode.replace(/-/g, "").length < 6}
        >
          Disable
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setView("manage");
            setDisableCode("");
            setError(null);
          }}
        >
          Cancel
        </Button>
      </div>
    </form>
  );

  const renderReset = () => (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        doReset();
      }}
    >
      <div className={styles.formGroup}>
        <p className={styles.label}>Resetup two-factor authentication</p>
        <p style={{ marginBottom: 12 }}>
          Verify ownership with an OTP or backup code to generate a new secret.
        </p>
        <Input
          id={resetCodeInputId}
          value={resetCode}
          onChange={(event) => {
            const cleaned = event.target.value.replace(/[^0-9A-Za-z-]/g, "").toUpperCase();
            setResetCode(cleaned.slice(0, 14));
          }}
          inputMode="text"
          autoComplete="one-time-code"
          placeholder="123456 or BACKUP-CODE"
          style={{ fontSize: 20, textAlign: "center", letterSpacing: 4 }}
        />
      </div>
      <div className={styles.actions}>
        <Button type="submit" disabled={resetCode.replace(/-/g, "").length < 6}>
          Continue
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setView("manage");
            setResetCode("");
            setError(null);
          }}
        >
          Cancel
        </Button>
      </div>
    </form>
  );

  const renderBackupCodes = () => (
    <>
      <div className={styles.formGroup}>
        <p className={styles.label}>Backup codes</p>
        <p style={{ marginBottom: 12 }}>
          Store these codes securely. Each code can be used once when you cannot access your
          authenticator app.
        </p>
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
          {backupCodes?.map((item) => (
            <li
              key={item}
              style={{
                fontFamily: "monospace",
                background: "hsl(var(--muted))",
                padding: 10,
                borderRadius: 6,
                textAlign: "center",
              }}
            >
              {item}
            </li>
          ))}
        </ul>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 12 }}>
        <Button
          type="button"
          variant="outline"
          onClick={async () => {
            if (!backupCodes) return;
            try {
              await navigator.clipboard.writeText(backupCodes.join("\n"));
            } catch {}
          }}
        >
          Copy codes
        </Button>
        <Button
          type="button"
          onClick={async () => {
            if (manageRequested) {
              setBackupCodes(null);
              await load("manage");
            } else {
              window.location.replace("/");
            }
          }}
        >
          Continue
        </Button>
      </div>
    </>
  );

  let content: JSX.Element;
  if (view === "setup") content = renderSetup();
  else if (view === "verify") content = renderVerify();
  else if (view === "disable") content = renderDisable();
  else if (view === "reset") content = renderReset();
  else if (view === "backup") content = renderBackupCodes();
  else content = renderManage();

  return (
    <AuthFrame
      title="Two-Factor Authentication"
      description="Manage your admin panel multi-factor security"
    >
      {error && <div className={styles.alert}>{error}</div>}
      {content}
    </AuthFrame>
  );
}
