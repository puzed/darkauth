import QRCode from "qrcode";
import { useCallback, useEffect, useRef, useState } from "react";
import api from "../services/api";
import Button from "./Button";

export default function SettingsSecurity() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<{
    enabled: boolean;
    verified: boolean;
    created_at?: string | null;
    last_used_at?: string | null;
    backup_codes_remaining?: number;
    required?: boolean;
  } | null>(null);
  const [provisioningUri, setProvisioningUri] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const qrCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [showManual, setShowManual] = useState(false);

  const reload = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setBackupCodes(null);
      const s = await api.getOtpStatus();
      setStatus(s);
      setProvisioningUri(null);
      setSecret(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load OTP status");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    (async () => {
      try {
        if (provisioningUri && qrCanvasRef.current) {
          await QRCode.toCanvas(qrCanvasRef.current, provisioningUri, { width: 192, margin: 1 });
        }
      } catch {}
    })();
  }, [provisioningUri]);

  const doSetupVerify = async () => {
    try {
      setError(null);
      const res = await api.otpSetupVerify(code);
      setBackupCodes(res.backup_codes);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Verification failed");
    }
  };

  const doResetup = async () => {
    try {
      setError(null);
      const init = await api.otpSetupInit();
      setProvisioningUri(init.provisioning_uri);
      setSecret(init.secret);
      setStatus((prev) => (prev ? { ...prev, verified: false } : prev));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Resetup failed");
    }
  };

  if (loading)
    return (
      <div className="loading-container">
        <div className="loading-spinner" />
        <p>Loading...</p>
      </div>
    );

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", textAlign: "center" }}>
      {error && <div className="error-message">{error}</div>}
      {!status?.enabled && (
        <div className="form-group">
          <h3>Enable Two-Factor Authentication</h3>
          {!provisioningUri ? (
            <div style={{ display: "flex", justifyContent: "center", marginTop: 12 }}>
              <Button type="button" variant="primary" onClick={doResetup}>
                Start Setup
              </Button>
            </div>
          ) : (
            <>
              <div className="help-text">Scan the QR or use the URI below.</div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 16,
                  marginTop: 16,
                  marginBottom: 20,
                }}
              >
                <canvas
                  ref={qrCanvasRef}
                  width={192}
                  height={192}
                  style={{ background: "#fff", borderRadius: 8 }}
                />
                <Button type="button" variant="secondary" onClick={() => setShowManual((v) => !v)}>
                  {showManual ? "Hide secret" : "Can't scan? Show secret"}
                </Button>
                {showManual && secret && (
                  <div style={{ maxWidth: 420, width: "100%" }}>
                    <div
                      style={{
                        wordBreak: "break-all",
                        background: "hsl(var(--muted))",
                        padding: 8,
                        borderRadius: 6,
                        textAlign: "center",
                        fontFamily: "monospace",
                      }}
                    >
                      {secret}
                    </div>
                    <div style={{ display: "flex", justifyContent: "center", marginTop: 8 }}>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(secret);
                          } catch {}
                        }}
                      >
                        Copy secret
                      </Button>
                    </div>
                  </div>
                )}
              </div>
              <div className="help-text">Enter the 6-digit code to verify:</div>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="123456"
                className="form-input"
                style={{ width: 192, margin: "8px auto 10px" }}
                maxLength={6}
                inputMode="numeric"
                pattern="[0-9]*"
              />
              <div style={{ width: 192, margin: "0 auto" }}>
                <Button
                  type="button"
                  variant="primary"
                  fullWidth
                  onClick={doSetupVerify}
                  disabled={code.length !== 6}
                >
                  Verify
                </Button>
              </div>
            </>
          )}
        </div>
      )}
      {status?.enabled && !status.verified && (
        <div className="form-group">
          <h3>Complete Verification</h3>
          <div className="help-text">
            Scan the QR or enter a code from your app or a backup code.
          </div>
          {provisioningUri && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 16,
                marginTop: 16,
                marginBottom: 20,
              }}
            >
              <canvas
                ref={qrCanvasRef}
                width={192}
                height={192}
                style={{ background: "#fff", borderRadius: 8 }}
              />
              <Button type="button" variant="secondary" onClick={() => setShowManual((v) => !v)}>
                {showManual ? "Hide secret" : "Can't scan? Show secret"}
              </Button>
              {showManual && secret && (
                <div style={{ maxWidth: 420, width: "100%" }}>
                  <div
                    style={{
                      wordBreak: "break-all",
                      background: "hsl(var(--muted))",
                      padding: 8,
                      borderRadius: 6,
                      textAlign: "center",
                      fontFamily: "monospace",
                    }}
                  >
                    {secret}
                  </div>
                  <div style={{ display: "flex", justifyContent: "center", marginTop: 8 }}>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(secret);
                        } catch {}
                      }}
                    >
                      Copy secret
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
          {!provisioningUri && (
            <div style={{ display: "flex", justifyContent: "center", marginTop: 12 }}>
              <Button type="button" variant="secondary" onClick={doResetup}>
                Generate new QR
              </Button>
            </div>
          )}
          <div className="help-text" style={{ textAlign: "center" }}>
            You can enter either the one time token from your authenticator or a backup code.
          </div>
          <input
            value={code}
            onChange={(event) => {
              const cleaned = event.target.value.replace(/[^0-9A-Za-z-]/g, "").toUpperCase();
              setCode(cleaned.slice(0, 14));
            }}
            placeholder="Enter One Time Code"
            className="form-input"
            style={{
              width: 240,
              margin: "8px auto 10px",
              textAlign: "center",
              fontSize: 24,
              letterSpacing: 6,
            }}
            maxLength={14}
          />
          <div style={{ width: 192, margin: "0 auto" }}>
            <Button
              type="button"
              variant="primary"
              fullWidth
              onClick={doSetupVerify}
              disabled={code.replace(/-/g, "").length !== 6}
            >
              Verify
            </Button>
          </div>
        </div>
      )}
      {status?.enabled && status.verified && (
        <div className="form-footer">
          <div className="actions">
            <Button type="button" variant="primary" onClick={doResetup}>
              Resetup OTP
            </Button>
          </div>
        </div>
      )}
      {backupCodes && backupCodes.length > 0 && (
        <div className="form-group">
          <h3>Your Backup Codes</h3>
          <div className="help-text">Store these codes securely. Each can be used once.</div>
          <ul>
            {backupCodes.map((c) => (
              <li key={c} style={{ fontFamily: "monospace" }}>
                {c}
              </li>
            ))}
          </ul>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <Button
              type="button"
              variant="secondary"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(backupCodes.join("\n"));
                } catch {}
              }}
            >
              Copy
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                const blob = new Blob([backupCodes.join("\n")], { type: "text/plain" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = "backup-codes.txt";
                document.body.appendChild(a);
                a.click();
                URL.revokeObjectURL(url);
                a.remove();
              }}
            >
              Download
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                const content = backupCodes.join("\n");
                const w = window.open("", "_blank");
                if (w) {
                  w.document.write(
                    `<pre>${content.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</pre>`
                  );
                  w.document.close();
                  w.focus();
                  w.print();
                }
              }}
            >
              Print
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
