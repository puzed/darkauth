import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import adminApiService from "@/services/api";

export default function AdminOtp() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<{ enabled: boolean; verified: boolean } | null>(null);
  const [provisioningUri, setProvisioningUri] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const qrCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      setLoading(true);
      const s = await adminApiService.getOwnOtpStatus();
      setStatus({ enabled: s.enabled, verified: s.verified });
      if (!s.enabled) {
        const init = await adminApiService.ownOtpSetupInit();
        setProvisioningUri(init.provisioning_uri);
      }
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
      try {
        if (provisioningUri && qrCanvasRef.current) {
          const QRCode = (await import("qrcode")).default;
          await QRCode.toCanvas(qrCanvasRef.current, provisioningUri, { width: 192, margin: 1 });
        }
      } catch {}
    })();
  }, [provisioningUri]);

  const doSetupVerify = async () => {
    try {
      setError(null);
      const res = await adminApiService.ownOtpSetupVerify(code);
      setBackupCodes(res.backup_codes || []);
      window.location.replace("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Verification failed");
    }
  };

  const doVerify = async () => {
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
      setProvisioningUri(null);
      setCode("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Disable failed");
    }
  };

  const doRegenerate = async () => {
    try {
      setError(null);
      await adminApiService.ownOtpBackupCodesRegenerate();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Regenerate failed");
    }
  };

  if (loading) return null;

  return (
    <div style={{ padding: 24 }}>
      <Card>
        <CardHeader>
          <CardTitle>Two-Factor Authentication</CardTitle>
        </CardHeader>
        <CardContent>
          {error && (
            <div style={{ color: "hsl(var(--destructive))", marginBottom: 12 }}>{error}</div>
          )}
          {!status?.enabled && (
            <div>
              <div style={{ marginBottom: 12 }}>
                Scan the provisioning URI with your authenticator app:
              </div>
              <div
                style={{
                  display: "flex",
                  gap: 16,
                  alignItems: "center",
                  flexWrap: "wrap",
                  marginBottom: 12,
                }}
              >
                <canvas
                  ref={qrCanvasRef}
                  width={192}
                  height={192}
                  style={{ background: "#fff", borderRadius: 8 }}
                />
                <div
                  style={{
                    wordBreak: "break-all",
                    background: "hsl(var(--muted))",
                    padding: 8,
                    borderRadius: 6,
                    maxWidth: 380,
                  }}
                >
                  {provisioningUri}
                </div>
              </div>
              <div style={{ marginBottom: 8 }}>Enter the 6-digit code:</div>
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
              <div style={{ marginTop: 12 }}>
                <Button onClick={doSetupVerify} disabled={code.length !== 6}>
                  Verify
                </Button>
              </div>
            </div>
          )}
          {status?.enabled && !status.verified && (
            <div>
              <div style={{ marginBottom: 8 }}>Enter your OTP or backup code:</div>
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
              <div style={{ marginTop: 12 }}>
                <Button onClick={doVerify} disabled={code.length < 6}>
                  Verify
                </Button>
              </div>
            </div>
          )}
          {status?.enabled && status.verified && (
            <div style={{ display: "flex", gap: 12 }}>
              <Button variant="secondary" onClick={doRegenerate}>
                Regenerate Backup Codes
              </Button>
              <Button variant="destructive" onClick={doDisable}>
                Disable
              </Button>
            </div>
          )}
          {backupCodes && backupCodes.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <h4>Backup Codes</h4>
              <ul>
                {backupCodes.map((c) => (
                  <li key={c} style={{ fontFamily: "monospace" }}>
                    {c}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
