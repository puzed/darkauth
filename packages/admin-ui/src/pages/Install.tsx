import { useCallback, useEffect, useId, useState } from "react";
import { FormGrid, FormField as GridField } from "@/components/layout/form-grid";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import adminOpaqueService, { type AdminOpaqueRegistrationState } from "@/services/opaque";

interface InstallData {
  adminEmail: string;
  adminName: string;
  adminPassword: string;
}

interface InstallResultData {
  success: boolean;
  message: string;
  adminId?: string;
  clients?: Array<{ id: string; name: string; type: string; secret?: string }>;
}

export default function Install() {
  const uid = useId();
  const [stage, setStage] = useState<"checking" | "form" | "installing" | "success" | "error">(
    "checking"
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<InstallResultData | null>(null);
  const [formData, setFormData] = useState<InstallData>({
    adminEmail: "",
    adminName: "",
    adminPassword: "",
  });
  const [opaqueState, setOpaqueState] = useState<AdminOpaqueRegistrationState | null>(null);

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
          token,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
      setResult(data);
      setStage("success");
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
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div>Checking installation status…</div>
      </div>
    );
  }

  if (stage === "error") {
    return (
      <div className="page-container">
        <div className="page-header">
          <h1 className="page-title">Install Link Invalid</h1>
          <p className="page-subtitle">
            The one-time install token is missing, invalid, or expired. Use the link printed in the
            server console and try again.
          </p>
        </div>
      </div>
    );
  }

  if (stage === "success" && result) {
    return (
      <div className="page-container">
        <div className="page-header">
          <div style={{ fontSize: 48 }}>✅</div>
          <h1>Installation Complete</h1>
          <p>{result.message}</p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Next steps</CardTitle>
          </CardHeader>
          <CardContent>
            <ol style={{ margin: 0, paddingLeft: 18 }}>
              <li>Open the admin panel at http://localhost:9081</li>
            </ol>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <img
          src="/favicon.svg"
          alt="DarkAuth"
          width={120}
          height={120}
          style={{ marginBottom: 8 }}
        />
        <h1 className="page-title">DarkAuth Installation</h1>
        <p className="page-subtitle">Complete the setup to initialize your DarkAuth server</p>
      </div>
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {error && (
          <div
            style={{
              background: "#fef2f2",
              border: "1px solid #fecaca",
              color: "#991b1b",
              padding: 12,
              borderRadius: 8,
            }}
          >
            {error}
          </div>
        )}
        <Card>
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

        <Button size="lg" disabled={loading} style={{ width: "100%" }}>
          {loading ? "Installing…" : "Complete Installation"}
        </Button>
      </form>
    </div>
  );
}
