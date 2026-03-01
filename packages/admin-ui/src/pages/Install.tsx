import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useId, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FormGrid, FormField as GridField } from "@/components/layout/form-grid";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
// no toast; we'll show a persistent banner on login screen instead
import adminOpaqueService, { type AdminOpaqueRegistrationState } from "@/services/opaque";
import styles from "./Install.module.css";

interface InstallData {
  adminEmail: string;
  adminName: string;
  adminPassword: string;
  selfRegistrationEnabled: boolean;
}

interface InstallEmailData {
  from: string;
  transport: string;
  smtpHost: string;
  smtpPort: string;
  smtpUser: string;
  smtpPassword: string;
}

export default function Install() {
  const uid = useId();
  const [stage, setStage] = useState<"checking" | "form" | "installing" | "restarting" | "error">(
    "checking"
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const [formData, setFormData] = useState<InstallData>({
    adminEmail: "",
    adminName: "",
    adminPassword: "",
    selfRegistrationEnabled: false,
  });
  const [emailData, setEmailData] = useState<InstallEmailData>({
    from: "",
    transport: "smtp",
    smtpHost: "",
    smtpPort: "587",
    smtpUser: "",
    smtpPassword: "",
  });
  const [opaqueState, setOpaqueState] = useState<AdminOpaqueRegistrationState | null>(null);
  const [dbMode, setDbMode] = useState<"remote" | "pglite">("remote");
  const [postgresUri, setPostgresUri] = useState<string>("");
  const [pgliteDir, setPgliteDir] = useState<string>("./data/pglite");

  const check = useCallback(async () => {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const token = urlParams.get("token");
      if (!token) {
        setError("Installation token is missing from URL");
        setStage("error");
        return;
      }
      const r = await fetch(`/api/install?token=${encodeURIComponent(token)}`);
      if (r.status === 403) {
        setError("Invalid or expired installation token");
        setStage("error");
        return;
      }
      if (r.ok) {
        const data = await r.json();
        const prefillEmail = data?.prefill?.email || {};
        const prefillPort =
          typeof prefillEmail.smtpPort === "number" && prefillEmail.smtpPort > 0
            ? String(prefillEmail.smtpPort)
            : "587";
        setEmailData({
          from: typeof prefillEmail.from === "string" ? prefillEmail.from : "",
          transport: typeof prefillEmail.transport === "string" ? prefillEmail.transport : "smtp",
          smtpHost: typeof prefillEmail.smtpHost === "string" ? prefillEmail.smtpHost : "",
          smtpPort: prefillPort,
          smtpUser: typeof prefillEmail.smtpUser === "string" ? prefillEmail.smtpUser : "",
          smtpPassword:
            typeof prefillEmail.smtpPassword === "string" ? prefillEmail.smtpPassword : "",
        });
        setStage("form");
      } else setStage("error");
    } catch {
      setError("Failed to connect to admin server");
      setStage("error");
    }
  }, []);

  useEffect(() => {
    check();
  }, [check]);

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({ ...prev, [name]: type === "checkbox" ? checked : value }));
  };

  const onEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setEmailData((prev) => ({ ...prev, [name]: type === "checkbox" ? checked : value }));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const token = urlParams.get("token") || "";
      if (!formData.adminEmail || !formData.adminName || !formData.adminPassword) {
        throw new Error("Name, email and password are required");
      }

      if (dbMode === "remote" && !postgresUri) throw new Error("Enter Postgres URI");
      const regStart = await adminOpaqueService.startRegistration(formData.adminPassword);
      setOpaqueState(regStart.state);

      const startRes = await fetch("/api/install/opaque/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          email: formData.adminEmail,
          name: formData.adminName,
          request: regStart.request,
          dbMode,
          postgresUri: dbMode === "remote" ? postgresUri : undefined,
          pgliteDir: dbMode === "pglite" ? pgliteDir : undefined,
        }),
      });
      const startJson = await startRes.json();
      if (!startRes.ok) throw new Error(startJson.error || `HTTP ${startRes.status}`);

      const regFinish = await adminOpaqueService.finishRegistration(
        startJson.message,
        startJson.serverPublicKey,
        regStart.state,
        formData.adminEmail
      );

      const finRes = await fetch("/api/install/opaque/finish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          email: formData.adminEmail,
          name: formData.adminName,
          record: regFinish.request,
        }),
      });
      const finJson = await finRes.json();
      if (!finRes.ok) throw new Error(finJson.error || `HTTP ${finRes.status}`);

      const r = await fetch("/api/install/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          adminEmail: formData.adminEmail,
          adminName: formData.adminName,
          selfRegistrationEnabled: formData.selfRegistrationEnabled,
          email: {
            from: emailData.from.trim(),
            transport: emailData.transport.trim() || "smtp",
            smtpHost: emailData.smtpHost.trim(),
            smtpPort: Number(emailData.smtpPort) || undefined,
            smtpUser: emailData.smtpUser.trim(),
            smtpPassword: emailData.smtpPassword,
          },
          token,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);

      // Store success flag
      try {
        localStorage.setItem("da_install_success", "1");
      } catch {}

      // Show success message and handle server restart
      if (data.serverWillRestart) {
        setStage("restarting");

        // Wait a bit then start polling for server to come back online
        setTimeout(() => {
          const checkServer = async () => {
            try {
              const healthRes = await fetch("/api/health", { method: "HEAD" });
              if (healthRes.ok) {
                // Server is back online
                await new Promise((r) => setTimeout(r, 1000));
                navigate("/");
              } else {
                // Keep checking
                setTimeout(checkServer, 1000);
              }
            } catch {
              // Server not ready yet, keep checking
              setTimeout(checkServer, 1000);
            }
          };
          checkServer();
        }, 3000); // Wait 3 seconds before starting to check
      } else {
        navigate("/");
      }
      return;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Installation failed");
    } finally {
      if (opaqueState) {
        adminOpaqueService.clearState(opaqueState);
      }
      setLoading(false);
    }
  };

  if (stage === "checking") {
    return (
      <div className={styles.centerWrap}>
        <div>Checking installation status…</div>
      </div>
    );
  }

  if (stage === "restarting") {
    return (
      <div className={styles.centerWrap}>
        <div className={styles.restartWrap}>
          <div className={styles.success}>Installed successfully</div>
          <div className={styles.restartLine}>
            <Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} />
            <span>Server is restarting with new configuration...</span>
          </div>
          <p className={styles.help}>You will be redirected automatically.</p>
        </div>
      </div>
    );
  }

  if (stage === "error") {
    return (
      <div className={styles.container}>
        <div className={styles.inner}>
          <div className={styles.header}>
            <h1>Install Link Invalid</h1>
            <p>
              The one-time install token is missing, invalid, or expired. Use the link printed in
              the server console and try again.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.inner}>
        <div className={styles.header}>
          <div className={styles.logoContainer}>
            <img src="/favicon.svg" alt="DarkAuth" className={styles.logo} />
          </div>
          <h1 className={styles.title}>DarkAuth Installation</h1>
          <p className={styles.subtitle}>Complete the setup to initialize your DarkAuth server</p>
        </div>

        <form onSubmit={submit} className={styles.form}>
          {error && (
            <div className={styles.errorBanner}>
              <div className={styles.errorIcon}>⚠️</div>
              <div className={styles.errorMessage}>{error}</div>
            </div>
          )}

          <div className={styles.gridContainer}>
            <div className={styles.mainColumn}>
              <Card className={styles.sectionCard}>
                <CardHeader>
                  <CardTitle>Admin User</CardTitle>
                </CardHeader>
                <CardContent>
                  <FormGrid columns={1}>
                    <GridField label={<Label htmlFor={`${uid}-name`}>Admin Name</Label>}>
                      <Input
                        id={`${uid}-name`}
                        name="adminName"
                        value={formData.adminName}
                        onChange={onChange}
                        placeholder="Your full name"
                        disabled={loading}
                        required
                      />
                    </GridField>
                    <GridField label={<Label htmlFor={`${uid}-email`}>Admin Email</Label>}>
                      <Input
                        id={`${uid}-email`}
                        name="adminEmail"
                        type="email"
                        value={formData.adminEmail}
                        onChange={onChange}
                        placeholder="admin@yourcompany.com"
                        disabled={loading}
                        required
                      />
                    </GridField>
                    <GridField label={<Label htmlFor={`${uid}-pass`}>Admin Password</Label>}>
                      <Input
                        id={`${uid}-pass`}
                        name="adminPassword"
                        type="password"
                        value={formData.adminPassword}
                        onChange={onChange}
                        placeholder="Choose a strong password"
                        minLength={8}
                        disabled={loading}
                        required
                      />
                    </GridField>
                  </FormGrid>
                </CardContent>
              </Card>

              <Card className={styles.sectionCard}>
                <CardHeader>
                  <CardTitle>Database Configuration</CardTitle>
                </CardHeader>
                <CardContent>
                  <FormGrid columns={1}>
                    <GridField label={<Label>Storage Engine</Label>}>
                      <div className={styles.radioGroup}>
                        <label
                          className={
                            dbMode === "remote" ? styles.radioLabelActive : styles.radioLabel
                          }
                        >
                          <input
                            type="radio"
                            name="dbMode"
                            checked={dbMode === "remote"}
                            onChange={() => setDbMode("remote")}
                            className={styles.radioInput}
                          />
                          <div className={styles.radioContent}>
                            <div className={styles.radioTitle}>Remote Postgres</div>
                            <div className={styles.radioDesc}>External PostgreSQL instance</div>
                          </div>
                        </label>
                        <label
                          className={
                            dbMode === "pglite" ? styles.radioLabelActive : styles.radioLabel
                          }
                        >
                          <input
                            type="radio"
                            name="dbMode"
                            checked={dbMode === "pglite"}
                            onChange={() => setDbMode("pglite")}
                            className={styles.radioInput}
                          />
                          <div className={styles.radioContent}>
                            <div className={styles.radioTitle}>Embedded PGLite</div>
                            <div className={styles.radioDesc}>Local file-based storage</div>
                          </div>
                        </label>
                      </div>
                    </GridField>
                    {dbMode === "remote" && (
                      <GridField label={<Label htmlFor={`${uid}-pg`}>Postgres URI</Label>}>
                        <Input
                          id={`${uid}-pg`}
                          value={postgresUri}
                          onChange={(e) => setPostgresUri(e.target.value)}
                          placeholder="postgresql://user:pass@host:5432/dbname"
                          disabled={loading}
                        />
                      </GridField>
                    )}
                    {dbMode === "pglite" && (
                      <GridField label={<Label htmlFor={`${uid}-pglite`}>PGLite Directory</Label>}>
                        <Input
                          id={`${uid}-pglite`}
                          value={pgliteDir}
                          onChange={(e) => setPgliteDir(e.target.value)}
                          placeholder="./data/pglite"
                          disabled={loading}
                        />
                      </GridField>
                    )}
                  </FormGrid>
                </CardContent>
              </Card>
            </div>

            <div className={styles.sideColumn}>
              <Card className={styles.sectionCard}>
                <CardHeader>
                  <CardTitle>Email (SMTP)</CardTitle>
                </CardHeader>
                <CardContent>
                  <FormGrid columns={1}>
                    <GridField label={<Label htmlFor={`${uid}-email-from`}>From Address</Label>}>
                      <Input
                        id={`${uid}-email-from`}
                        name="from"
                        value={emailData.from}
                        onChange={onEmailChange}
                        placeholder="no-reply@example.com"
                        disabled={loading}
                      />
                    </GridField>
                    <GridField label={<Label htmlFor={`${uid}-smtp-host`}>SMTP Host</Label>}>
                      <Input
                        id={`${uid}-smtp-host`}
                        name="smtpHost"
                        value={emailData.smtpHost}
                        onChange={onEmailChange}
                        placeholder="smtp.example.com"
                        disabled={loading}
                      />
                    </GridField>
                    <GridField label={<Label htmlFor={`${uid}-smtp-port`}>Port</Label>}>
                      <Input
                        id={`${uid}-smtp-port`}
                        name="smtpPort"
                        value={emailData.smtpPort}
                        onChange={onEmailChange}
                        placeholder="587"
                        disabled={loading}
                      />
                    </GridField>
                    <GridField label={<Label htmlFor={`${uid}-smtp-user`}>User</Label>}>
                      <Input
                        id={`${uid}-smtp-user`}
                        name="smtpUser"
                        value={emailData.smtpUser}
                        onChange={onEmailChange}
                        placeholder="smtp-user"
                        disabled={loading}
                      />
                    </GridField>
                    <GridField label={<Label htmlFor={`${uid}-smtp-password`}>Password</Label>}>
                      <Input
                        id={`${uid}-smtp-password`}
                        name="smtpPassword"
                        type="password"
                        value={emailData.smtpPassword}
                        onChange={onEmailChange}
                        placeholder="SMTP password"
                        disabled={loading}
                      />
                    </GridField>
                  </FormGrid>
                </CardContent>
              </Card>

              <Card className={styles.sectionCard}>
                <CardHeader>
                  <CardTitle>Features</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className={styles.checkboxField}>
                    <label className={styles.checkboxLabel}>
                      <input
                        id={`${uid}-self-registration`}
                        name="selfRegistrationEnabled"
                        type="checkbox"
                        checked={formData.selfRegistrationEnabled}
                        onChange={onChange}
                        disabled={loading}
                        className={styles.checkboxInput}
                      />
                      <div className={styles.checkboxContent}>
                        <div className={styles.checkboxTitle}>Self-registration</div>
                        <div className={styles.checkboxDesc}>
                          Allow users to sign up on login page
                        </div>
                      </div>
                    </label>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          <div className={styles.formActions}>
            <Button size="lg" disabled={loading} className={styles.submitButton}>
              {loading ? (
                <>
                  <Loader2 size={18} className={styles.spinner} />
                  <span>Installing…</span>
                </>
              ) : (
                "Complete Installation"
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
