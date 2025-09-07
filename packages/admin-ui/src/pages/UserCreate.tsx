import { ArrowLeft, Copy, KeyRound } from "lucide-react";
import { useId, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FormField, FormGrid } from "@/components/layout/form-grid";
import PageHeader from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import adminApiService from "@/services/api";
import { sha256Base64Url } from "@/services/hash";
import adminOpaqueService from "@/services/opaque-cloudflare";

export default function UserCreate() {
  const navigate = useNavigate();
  const emailId = useId();
  const nameId = useId();
  const subId = useId();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [sub, setSub] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [generatedPassword, setGeneratedPassword] = useState("");

  const generatePassword = (length = 16) => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*";
    const bytes = new Uint32Array(length);
    crypto.getRandomValues(bytes);
    let out = "";
    for (let i = 0; i < length; i++) out += chars[bytes[i] % chars.length];
    return out;
  };

  const create = async () => {
    try {
      setSubmitting(true);
      setError(null);
      const created = await adminApiService.createUser({ email, name, sub: sub || undefined });
      const pwd = generatePassword(20);
      const start = await adminOpaqueService.startRegistration(pwd);
      const startResp = await adminApiService.userPasswordSetStart(created.sub, start.request);
      const finish = await adminOpaqueService.finishRegistration(
        startResp.message,
        startResp.serverPublicKey,
        start.state,
        startResp.identityU
      );
      const hash = await sha256Base64Url(finish.passwordKey);
      await adminApiService.userPasswordSetFinish(created.sub, finish.request, hash);
      setGeneratedPassword(pwd);
      setShowPassword(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create user");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Create User"
        subtitle="Add a new user to the system"
        actions={
          <Button variant="outline" onClick={() => navigate("/users")}>
            <ArrowLeft />
            Back
          </Button>
        }
      />
      {error && <div>{error}</div>}
      <Card>
        <CardHeader>
          <CardTitle>User Information</CardTitle>
        </CardHeader>
        <CardContent>
          <FormGrid columns={2}>
            <FormField label={<Label htmlFor={emailId}>Email</Label>}>
              <Input
                id={emailId}
                name="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={submitting}
                placeholder="admin@example.com"
                required
              />
            </FormField>
            <FormField label={<Label htmlFor={nameId}>Name</Label>}>
              <Input
                id={nameId}
                name="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={submitting}
                placeholder="Jane Doe"
              />
            </FormField>
            <FormField label={<Label htmlFor={subId}>Subject ID (optional)</Label>}>
              <Input
                id={subId}
                name="sub"
                value={sub}
                onChange={(e) => setSub(e.target.value)}
                disabled={submitting}
                placeholder="auto-generated if empty"
              />
            </FormField>
          </FormGrid>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
            <Button variant="outline" onClick={() => navigate("/users")}>
              Back
            </Button>
            <Button onClick={create} disabled={submitting || !email.trim()}>
              Create
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={showPassword}
        onOpenChange={(open) => {
          setShowPassword(open);
          if (!open) navigate("/users");
        }}
      >
        <DialogContent style={{ maxWidth: 520 }}>
          <DialogHeader>
            <DialogTitle>Temporary Password</DialogTitle>
            <DialogDescription>Share this with the user. It is shown once.</DialogDescription>
          </DialogHeader>
          <div style={{ display: "grid", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <KeyRound size={16} />
              <div style={{ fontSize: 14, color: "hsl(var(--muted-foreground))" }}>
                They must change it on first login.
              </div>
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: 12,
                border: "1px solid hsl(var(--border))",
                borderRadius: 6,
                background: "hsl(var(--muted) / 0.2)",
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                fontSize: 14,
                wordBreak: "break-all",
              }}
            >
              <span style={{ flex: 1 }}>{generatedPassword}</span>
              <Button
                variant="outline"
                onClick={() => navigator.clipboard.writeText(generatedPassword)}
              >
                <Copy size={14} />
                Copy
              </Button>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <Button
                onClick={() => {
                  setShowPassword(false);
                }}
              >
                Done
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
