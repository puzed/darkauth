import { useCallback, useEffect, useRef, useState } from "react";
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

export default function AdminOtp() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<OtpStatus | null>(null);
  const [provisioningUri, setProvisioningUri] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [showSecret, setShowSecret] = useState(false);
  const [code, setCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const qrCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const submittingRef = useRef(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      setLoading(true);
      setBackupCodes(null);
      setCode("");
      setShowSecret(false);
      const current = await adminApiService.getOwnOtpStatus();
      let nextStatus = current;
      if (!current.enabled) {
        const init = await adminApiService.ownOtpSetupInit();
        setProvisioningUri(init.provisioning_uri);
        setSecret(init.secret);
        nextStatus = { ...current, pending: true, enabled: false, verified: false };
      } else {
        setProvisioningUri(null);
        setSecret(null);
      }
      setStatus(nextStatus);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load OTP status");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    (async () => {
      if (provisioningUri && qrCanvasRef.current) {
        try {
          const QRCode = (await import("qrcode")).default;
          await QRCode.toCanvas(qrCanvasRef.current, provisioningUri, { width: 192, margin: 1 });
        } catch {}
      }
    })();
  }, [provisioningUri]);

  const doSetupVerify = async () => {
    if (code.length !== 6) return;
    if (submittingRef.current) return;
    submittingRef.current = true;
    try {
      setError(null);
      const res = await adminApiService.ownOtpSetupVerify(code);
      setBackupCodes(res.backup_codes || []);
      setStatus((prev) =>
        prev ? { ...prev, enabled: true, pending: false, verified: true } : prev
      );
      setCode("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Verification failed");
    } finally {
      submittingRef.current = false;
    }
  };

  const doVerify = async () => {
    if (code.length < 6) return;
    if (submittingRef.current) return;
    submittingRef.current = true;
    try {
      setError(null);
      await adminApiService.ownOtpVerify(code);
      window.location.replace("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Verification failed");
    } finally {
      submittingRef.current = false;
    }
  };

  if (loading) return null;

  const setupCodeInputId = "admin-otp-setup-code";
  const verifyCodeInputId = "admin-otp-verify-code";

  const renderSetup = () => (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        doSetupVerify();
      }}
    >
      {provisioningUri ? (
        <>
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
              style={{
                color: "hsl(var(--primary))",
                background: "none",
                border: "none",
                cursor: "pointer",
                textDecoration: "underline",
                padding: 0,
                fontSize: 13,
              }}
            >
              {showSecret ? "Hide manual secret" : "Cannot scan? Show manual secret"}
            </button>
            {showSecret && secret && (
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
                  {secret}
                </div>
                <Button
                  variant="outline"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(secret);
                    } catch {}
                  }}
                >
                  Copy secret
                </Button>
              </div>
            )}
          </div>
        </>
      ) : (
        <p className={styles.label}>Generating setup details...</p>
      )}
      <div className={styles.formGroup}>
        <label className={styles.label} htmlFor={setupCodeInputId}>
          Enter the 6-digit code
        </label>
        <Input
          id={setupCodeInputId}
          value={code}
          onChange={(event) => {
            const raw = event.target.value.replace(/[^0-9]/g, "");
            setCode(raw.slice(0, 6));
          }}
          onKeyUp={(event) => {
            if (event.key === "Enter") return;
            if (submittingRef.current) return;
            const value = event.currentTarget.value.replace(/[^0-9]/g, "");
            if (value.length === 6) {
              event.currentTarget.form?.requestSubmit();
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
        <Button type="submit" disabled={code.length !== 6} style={{ width: "100%" }}>
          Verify
        </Button>
      </div>
    </form>
  );

  const renderVerify = () => (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        doVerify();
      }}
    >
      <div className={styles.formGroup}>
        <label className={styles.label} htmlFor={verifyCodeInputId}>
          Enter your OTP code
        </label>
        <Input
          id={verifyCodeInputId}
          value={code}
          onChange={(event) => {
            const raw = event.target.value.replace(/[^0-9]/g, "");
            setCode(raw.slice(0, 6));
          }}
          onKeyUp={(event) => {
            if (event.key === "Enter") return;
            if (submittingRef.current) return;
            const value = event.currentTarget.value.replace(/[^0-9]/g, "");
            if (value.length === 6) {
              event.currentTarget.form?.requestSubmit();
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
        <Button type="submit" disabled={code.length < 6} style={{ width: "100%" }}>
          Verify
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
        <Button onClick={() => window.location.replace("/")}>Continue</Button>
      </div>
    </>
  );

  return (
    <AuthFrame
      title="Two-Factor Authentication"
      description="Add an extra layer of protection to the admin panel"
    >
      {error && <div className={styles.alert}>{error}</div>}
      {backupCodes ? renderBackupCodes() : status?.enabled ? renderVerify() : renderSetup()}
    </AuthFrame>
  );
}
