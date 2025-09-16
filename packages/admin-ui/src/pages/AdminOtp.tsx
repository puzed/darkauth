import { useCallback, useEffect, useRef, useState } from "react";
import AuthFrame from "@/components/auth/AuthFrame";
import styles from "@/components/Login.module.css";
import { Button } from "@/components/ui/button";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
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
    try {
      setError(null);
      const res = await adminApiService.ownOtpSetupVerify(code);
      setBackupCodes(res.backup_codes || []);
      setStatus((prev) => (prev ? { ...prev, enabled: true, pending: false, verified: true } : prev));
      setCode("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Verification failed");
    }
  };

  const doVerify = async () => {
    if (code.length < 6) return;
    try {
      setError(null);
      await adminApiService.ownOtpVerify(code);
      window.location.replace("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Verification failed");
    }
  };

  const doDisable = async () => {
    try {
      setError(null);
      await adminApiService.ownOtpDisable();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Disable failed");
    }
  };

  const doRegenerate = async () => {
    try {
      setError(null);
      const res = await adminApiService.ownOtpBackupCodesRegenerate();
      setBackupCodes(res.backup_codes || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Regenerate failed");
    }
  };

  if (loading) return null;

  const renderSetup = () => (
    <>
      {provisioningUri ? (
        <>
          <p className={styles.label}>Scan the QR code with your authenticator app</p>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 20,
              justifyContent: "center",
              marginBottom: 16,
            }}
          >
            <canvas
              ref={qrCanvasRef}
              width={192}
              height={192}
              style={{ background: "#fff", borderRadius: 12 }}
            />
            <div style={{ maxWidth: 320, display: "flex", flexDirection: "column", gap: 12 }}>
              <div
                style={{
                  background: "hsl(var(--muted))",
                  padding: 12,
                  borderRadius: 8,
                  fontSize: 13,
                  wordBreak: "break-all",
                }}
              >
                {provisioningUri}
              </div>
              <Button
                variant="outline"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(provisioningUri);
                  } catch {}
                }}
              >
                Copy setup URI
              </Button>
              <button
                type="button"
                onClick={() => setShowSecret((v) => !v)}
                style={{
                  alignSelf: "flex-start",
                  color: "hsl(var(--primary))",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  textDecoration: "underline",
                  padding: 0,
                  fontSize: 13,
                }}
              >
                {showSecret ? "Hide secret" : "Can't scan? Show secret"}
              </button>
              {showSecret && secret && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div
                    style={{
                      background: "hsl(var(--muted))",
                      padding: 12,
                      borderRadius: 8,
                      fontFamily: "monospace",
                      textAlign: "center",
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
          </div>
        </>
      ) : (
        <p className={styles.label}>Generating setup details...</p>
      )}
      <div className={styles.formGroup}>
        <label className={styles.label}>Enter the 6-digit code</label>
        <InputOTP maxLength={6} value={code} onChange={setCode}>
          <InputOTPGroup>
            <InputOTPSlot index={0} />
            <InputOTPSlot index={1} />
            <InputOTPSlot index={2} />
            <InputOTPSlot index={3} />
            <InputOTPSlot index={4} />
            <InputOTPSlot index={5} />
          </InputOTPGroup>
        </InputOTP>
      </div>
      <div className={styles.actions}>
        <Button onClick={doSetupVerify} disabled={code.length !== 6} style={{ width: "100%" }}>
          Verify
        </Button>
      </div>
    </>
  );

  const renderVerify = () => (
    <>
      <div className={styles.formGroup}>
        <label className={styles.label}>Enter your OTP code</label>
        <InputOTP maxLength={6} value={code} onChange={setCode}>
          <InputOTPGroup>
            <InputOTPSlot index={0} />
            <InputOTPSlot index={1} />
            <InputOTPSlot index={2} />
            <InputOTPSlot index={3} />
            <InputOTPSlot index={4} />
            <InputOTPSlot index={5} />
          </InputOTPGroup>
        </InputOTP>
      </div>
      <div className={styles.actions}>
        <Button onClick={doVerify} disabled={code.length < 6} style={{ width: "100%" }}>
          Verify
        </Button>
      </div>
    </>
  );

  const renderBackupCodes = () => (
    <>
      <div className={styles.formGroup}>
        <label className={styles.label}>Backup codes</label>
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

  const footerContent = status?.enabled && status.verified && !backupCodes && (
    <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
      <Button variant="secondary" onClick={doRegenerate}>
        Regenerate Backup Codes
      </Button>
      <Button variant="destructive" onClick={doDisable}>
        Disable
      </Button>
    </div>
  );

  return (
    <AuthFrame
      title="Two-Factor Authentication"
      description="Add an extra layer of protection to the admin panel"
      footer={footerContent}
    >
      {error && <div className={styles.alert}>{error}</div>}
      {backupCodes
        ? renderBackupCodes()
        : status?.enabled
          ? renderVerify()
          : renderSetup()}
    </AuthFrame>
  );
}
