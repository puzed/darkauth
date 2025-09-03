import { Loader2, Lock, Shield } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { useNavigate } from "react-router-dom";
import styles from "@/components/Login.module.css";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import adminApiService from "@/services/api";
import { sha256Base64Url } from "@/services/hash";
import adminOpaqueService from "@/services/opaque";

export default function ResetPassword() {
  const passwordId = useId();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [email, setEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [forced, setForced] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      try {
        const s = await adminApiService.getAdminSession();
        if (s?.email) setEmail(s.email);
        setForced(!!s?.passwordResetRequired);
      } catch {}
    })();
  }, []);

  const submit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!password || password.length < 3) {
      setError("Password must be at least 3 characters");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    try {
      setSubmitting(true);
      if (email) {
        try {
          const loginStart = await adminOpaqueService.startLogin(email, password);
          const serverStart = await adminApiService.adminOpaqueLoginStart({
            email,
            request: loginStart.request,
          });
          try {
            await adminOpaqueService.finishLogin(serverStart.message, loginStart.state);
            setError("New password cannot be your current password");
            setSubmitting(false);
            return;
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            if (
              !msg.toLowerCase().includes("incorrect") &&
              !msg.toLowerCase().includes("password")
            ) {
              throw e;
            }
          }
        } catch (_e) {}
      }
      const start = await adminOpaqueService.startRegistration(password);
      const startResp = await adminApiService.adminPasswordChangeStart(start.request);
      const finish = await adminOpaqueService.finishRegistration(
        startResp.message,
        startResp.serverPublicKey,
        start.state,
        startResp.identityU
      );
      const exportKeyHash = await sha256Base64Url(finish.passwordKey);
      await adminApiService.adminPasswordChangeFinish(finish.request, exportKeyHash);
      toast({ title: "Password updated" });
      await adminApiService.getAdminSession();
      window.location.href = "/";
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to change password");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.header}>
          <div className={styles.brandWrap}>
            <div className={styles.brand}>
              <img src="/favicon.svg" alt="DarkAuth" />
            </div>
          </div>
          <div className={styles.title}>
            {forced ? "Password Reset Required" : "Change Password"}
          </div>
          <p className={styles.description}>
            {forced ? "Set a new password to continue" : "Update your password"}
          </p>
        </div>

        <form onSubmit={submit} noValidate>
          <div className={styles.content}>
            <div className={styles.formGroup}>
              <label className={styles.label} htmlFor={passwordId}>
                New Password
              </label>
              <input
                className={`${styles.input} ${error ? styles.error : ""}`}
                type="password"
                id={passwordId}
                name="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="Enter a new password"
                disabled={submitting}
                autoComplete="new-password"
                required
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label} htmlFor={`${passwordId}-confirm`}>
                Confirm Password
              </label>
              <input
                className={`${styles.input} ${error ? styles.error : ""}`}
                type="password"
                id={`${passwordId}-confirm`}
                name="confirmPassword"
                value={confirm}
                onChange={(e) => {
                  setConfirm(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="Re-enter your new password"
                disabled={submitting}
                autoComplete="new-password"
                required
              />
              {error && <p className={styles.errorText}>{error}</p>}
            </div>

            <div
              className={styles.actions}
              style={forced ? undefined : { display: "flex", gap: 8 }}
            >
              {!forced && (
                <Button
                  type="button"
                  size="lg"
                  variant="outline"
                  disabled={submitting}
                  onClick={() => {
                    if (window.history.length > 1) navigate(-1);
                    else navigate("/");
                  }}
                  style={{ flex: "0 0 auto" }}
                >
                  Cancel
                </Button>
              )}
              <Button
                type="submit"
                size="lg"
                disabled={submitting}
                style={forced ? { width: "100%" } : { flex: 1, minWidth: 0 }}
              >
                {submitting ? (
                  <>
                    <Loader2
                      size={16}
                      style={{ marginRight: 8, animation: "spin 1s linear infinite" }}
                    />
                    Updating...
                  </>
                ) : (
                  <>
                    <Lock size={16} style={{ marginRight: 8 }} />
                    Update Password
                  </>
                )}
              </Button>
            </div>
          </div>
        </form>

        <div className={styles.footer}>
          <div>
            <Shield size={16} style={{ marginRight: 6, verticalAlign: "text-bottom" }} />
            Protected with zero-knowledge OPAQUE authentication
          </div>
        </div>
      </div>
    </div>
  );
}
