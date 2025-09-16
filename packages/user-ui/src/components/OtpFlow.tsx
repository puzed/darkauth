import QRCode from "qrcode";
import { useEffect, useRef, useState } from "react";
import api from "../services/api";
import Button from "./Button";

export default function OtpFlow({ fullWidth = false }: { fullWidth?: boolean }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [provisioningUri, setProvisioningUri] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [secret, setSecret] = useState<string | null>(null);
  const [showManual, setShowManual] = useState(false);
  const [step, setStep] = useState<"status" | "setup" | "verify">("status");
  const qrCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const setupCodeInputRef = useRef<HTMLInputElement | null>(null);
  const verifyCodeInputRef = useRef<HTMLInputElement | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const s = await api.getOtpStatus();
        if (s.enabled && !s.verified) {
          window.location.replace("/otp/verify");
          return;
        }
        if (!s.enabled) {
          const init = await api.otpSetupInit();
          setProvisioningUri(init.provisioning_uri);
          setSecret(init.secret);
          setStep("setup");
          return;
        }
        window.location.replace("/dashboard");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load OTP status");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        if (provisioningUri && qrCanvasRef.current) {
          await QRCode.toCanvas(qrCanvasRef.current, provisioningUri, { width: 192, margin: 1 });
        }
      } catch {}
    })();
  }, [provisioningUri]);

  useEffect(() => {
    if (step === "setup" && !backupCodes) {
      setupCodeInputRef.current?.focus();
    }
    if (step === "verify" && !backupCodes) {
      verifyCodeInputRef.current?.focus();
    }
  }, [step, backupCodes]);

  const doSetupVerify = async () => {
    try {
      setError(null);
      const res = await api.otpSetupVerify(code);
      setBackupCodes(res.backup_codes || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Verification failed");
    }
  };

  const doVerify = async () => {
    try {
      setError(null);
      await api.otpVerify(code);
      window.location.replace("/dashboard");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Verification failed");
    }
  };

  if (loading)
    return (
      <div className="loading-container">
        <div className="loading-spinner" />
        <p>Loading...</p>
      </div>
    );
  if (error) return <div style={{ color: "hsl(var(--destructive))" }}>{error}</div>;

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", textAlign: "center" }}>
      {step === "setup" && (
        <div>
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
            <button
              type="button"
              onClick={() => setShowManual((v) => !v)}
              style={{
                background: "none",
                border: "none",
                color: "var(--primary-500)",
                textDecoration: "underline",
                cursor: "pointer",
                padding: 0,
              }}
            >
              {showManual ? "Hide secret" : "Can't scan? Show secret"}
            </button>
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
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={async () => {
                      try {
                        if (secret) await navigator.clipboard.writeText(secret);
                      } catch {}
                    }}
                  >
                    Copy secret
                  </button>
                </div>
              </div>
            )}
          </div>
          <div className="help-text" style={{ textAlign: "center" }}>
            Enter the 6-digit code to verify:
          </div>
          <input
            ref={setupCodeInputRef}
            value={code}
            onChange={(event) => {
              const raw = event.target.value.replace(/[^0-9]/g, "");
              setCode(raw.slice(0, 6));
            }}
            placeholder="123456"
            style={{
              width: fullWidth ? "100%" : 240,
              padding: "12px 16px",
              margin: fullWidth ? "8px 0 10px" : "8px auto 10px",
              display: "block",
              textAlign: "center",
              fontSize: 28,
              letterSpacing: 8,
            }}
            maxLength={6}
            inputMode="numeric"
            pattern="[0-9]*"
          />
          {!backupCodes && (
            <div style={{ width: fullWidth ? "100%" : 192, margin: fullWidth ? "0" : "0 auto" }}>
              <Button onClick={doSetupVerify} fullWidth={true} disabled={code.length !== 6}>
                Verify
              </Button>
            </div>
          )}
          {backupCodes && (
            <div style={{ marginTop: 20 }}>
              <h3>Backup Codes</h3>
              <div className="help-text">
                Write these down and store them securely. Each can be used once.
              </div>
              <ul style={{ listStyle: "none", padding: 0, marginTop: 10 }}>
                {backupCodes.map((c) => (
                  <li key={c} style={{ fontFamily: "monospace", margin: "4px 0" }}>
                    {c}
                  </li>
                ))}
              </ul>
              <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 8 }}>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(backupCodes.join("\n"));
                    } catch {}
                  }}
                >
                  Copy
                </button>
                <button
                  type="button"
                  className="secondary-button"
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
                </button>
                <button
                  type="button"
                  className="secondary-button"
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
                </button>
              </div>
              <div
                style={{
                  width: fullWidth ? "100%" : 192,
                  margin: fullWidth ? "16px 0 0" : "16px auto 0",
                }}
              >
                <Button onClick={() => window.location.replace("/dashboard")} fullWidth={true}>
                  Continue
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
      {step === "verify" && (
        <div>
          <input
            ref={verifyCodeInputRef}
            value={code}
            onChange={(event) => {
              const raw = event.target.value.replace(/[^0-9A-Za-z-]/g, "").toUpperCase();
              setCode(raw.slice(0, 14));
            }}
            placeholder="123456 or BACKUP-CODE"
            style={{
              width: fullWidth ? "100%" : 240,
              padding: "12px 16px",
              margin: fullWidth ? "8px 0 10px" : "8px auto 10px",
              display: "block",
              textAlign: "center",
              fontSize: 24,
              letterSpacing: 4,
            }}
            maxLength={14}
          />
          <div style={{ width: fullWidth ? "100%" : 192, margin: fullWidth ? "0" : "0 auto" }}>
            <Button
              onClick={doVerify}
              fullWidth={true}
              disabled={code.replace(/-/g, "").length < 6}
            >
              Verify
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
