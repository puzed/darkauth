import { AlertTriangle, KeyRound, ShieldCheck, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import FormActions from "@/components/layout/form-actions";
import { FormField, FormGrid } from "@/components/layout/form-grid";
import PageHeader from "@/components/layout/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import adminApiService, { type User, type UserKeyStatus } from "@/services/api";

export default function UserEdit() {
  const { sub } = useParams<{ sub: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [otpStatus, setOtpStatus] = useState<{
    enabled: boolean;
    verified: boolean;
    created_at?: string | null;
    last_used_at?: string | null;
  } | null>(null);
  const [keyStatus, setKeyStatus] = useState<UserKeyStatus | null>(null);
  const [keyStatusUnavailable, setKeyStatusUnavailable] = useState(false);
  const [resetEmailSending, setResetEmailSending] = useState(false);
  const [resetEmailMessage, setResetEmailMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const users = await adminApiService.getUsers();
      const u = users.find((x) => x.sub === sub);
      if (!u) {
        setError("User not found");
        setLoading(false);
        return;
      }
      setUser(u);
      setEmail(u.email);
      setName(u.name || "");
      try {
        const s = await adminApiService.getUserOtpStatus(u.sub);
        setOtpStatus(s);
      } catch {}
      try {
        const status = await adminApiService.getUserKeyStatus(u.sub);
        setKeyStatus(status);
        setKeyStatusUnavailable(false);
      } catch {
        setKeyStatus(null);
        setKeyStatusUnavailable(true);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load user");
    } finally {
      setLoading(false);
    }
  }, [sub]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    if (!user) return;
    try {
      setSubmitting(true);
      setError(null);
      await adminApiService.updateUser(user.sub, { email, name: name || null });
      navigate("/users");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save user");
    } finally {
      setSubmitting(false);
    }
  };

  const sendPasswordResetEmail = async () => {
    if (!user) return;
    try {
      setResetEmailSending(true);
      setError(null);
      setResetEmailMessage(null);
      await adminApiService.sendUserPasswordResetEmail(user.sub);
      setResetEmailMessage("Password reset email sent");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send password reset email");
    } finally {
      setResetEmailSending(false);
    }
  };

  const revokeEnvelope = async (envelopeId: string) => {
    if (!user) return;
    if (!confirm(`Revoke key envelope ${envelopeId}?`)) return;
    try {
      setError(null);
      await adminApiService.revokeUserKeyEnvelope(user.sub, envelopeId);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to revoke key envelope");
    }
  };

  const revokeTrustedDevice = async (deviceId: string) => {
    if (!user) return;
    if (!confirm(`Revoke trusted device ${deviceId}?`)) return;
    try {
      setError(null);
      await adminApiService.revokeUserTrustedDevice(user.sub, deviceId);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to revoke trusted device");
    }
  };

  if (loading) return <div>Loading user...</div>;

  if (error)
    return (
      <div>
        <div>{error}</div>
      </div>
    );

  if (!user) return null;

  return (
    <div>
      <PageHeader title="Edit User" subtitle={`User ID: ${sub || ""}`} />
      <Card>
        <CardHeader>
          <CardTitle>User Details</CardTitle>
          {otpStatus && (
            <CardDescription>
              OTP:{" "}
              {otpStatus.enabled
                ? otpStatus.verified
                  ? "Enabled (Verified)"
                  : "Enabled (Unverified)"
                : "Disabled"}
            </CardDescription>
          )}
        </CardHeader>
        <CardContent>
          {user?.passwordResetRequired && (
            <Alert variant="warning" style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
                <AlertTriangle size={18} />
                <AlertTitle>Password Reset Required</AlertTitle>
              </div>
              <AlertDescription>
                The user is required to reset their password on next login
              </AlertDescription>
            </Alert>
          )}
          {resetEmailMessage && (
            <Alert style={{ marginBottom: 16 }}>
              <AlertTitle>{resetEmailMessage}</AlertTitle>
            </Alert>
          )}
          <FormGrid columns={2}>
            <FormField label={<Label>Subject ID</Label>}>
              <Input value={user.sub} readOnly />
            </FormField>
            <FormField label={<Label>Email</Label>}>
              <Input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={submitting}
              />
            </FormField>
            <FormField label={<Label>Name</Label>}>
              <Input value={name} onChange={(e) => setName(e.target.value)} disabled={submitting} />
            </FormField>
            <FormField label={<Label>Created</Label>}>
              <Input value={new Date(user.createdAt).toLocaleString()} readOnly />
            </FormField>
            <FormField label={<Label>Last Activity</Label>}>
              <Input
                value={
                  user.lastActivityAt ? new Date(user.lastActivityAt).toLocaleString() : "Never"
                }
                readOnly
              />
            </FormField>
          </FormGrid>
          <FormActions withMargin>
            {user && (
              <>
                <Button
                  variant="outline"
                  disabled={resetEmailSending}
                  onClick={sendPasswordResetEmail}
                >
                  {resetEmailSending ? "Sending..." : "Send Reset Email"}
                </Button>
                <Button
                  variant="outline"
                  onClick={async () => {
                    await adminApiService.unlockUserOtp(user.sub);
                    load();
                  }}
                >
                  Unlock OTP
                </Button>
                <Button
                  variant="outline"
                  onClick={async () => {
                    await adminApiService.deleteUserOtp(user.sub);
                    load();
                  }}
                >
                  Remove OTP
                </Button>
              </>
            )}
            <Button onClick={save} disabled={submitting}>
              Save
            </Button>
          </FormActions>
        </CardContent>
      </Card>
      <Card style={{ marginTop: 24 }}>
        <CardHeader>
          <CardTitle>Key Status</CardTitle>
          <CardDescription>
            Account key setup, envelope inventory, and trusted device visibility.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {keyStatusUnavailable ? (
            <Alert>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
                <KeyRound size={18} />
                <AlertTitle>Admin key status API unavailable</AlertTitle>
              </div>
              <AlertDescription>
                This panel will populate when the admin user key-status endpoint is available.
              </AlertDescription>
            </Alert>
          ) : keyStatus ? (
            <>
              <FormGrid columns={2}>
                <FormField label={<Label>Key State</Label>}>
                  <Input value={keyStatus.keyState} readOnly />
                </FormField>
                <FormField label={<Label>Account Keys</Label>}>
                  <Input value={String(keyStatus.accountKeys.length)} readOnly />
                </FormField>
                <FormField label={<Label>Active Envelopes</Label>}>
                  <Input
                    value={String(
                      keyStatus.envelopes.filter((envelope) => !envelope.revokedAt).length
                    )}
                    readOnly
                  />
                </FormField>
                <FormField label={<Label>Trusted Devices</Label>}>
                  <Input
                    value={String(
                      keyStatus.trustedDevices.filter((device) => !device.revokedAt).length
                    )}
                    readOnly
                  />
                </FormField>
              </FormGrid>
              <div style={{ marginTop: 24 }}>
                <h3 style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <KeyRound size={18} />
                  Key Envelopes
                </h3>
                {keyStatus.envelopes.length === 0 ? (
                  <p style={{ color: "hsl(var(--muted-foreground))" }}>No key envelopes found.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Type</TableHead>
                        <TableHead>Version</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead>Last Used</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {keyStatus.envelopes.map((envelope) => (
                        <TableRow key={envelope.envelopeId}>
                          <TableCell>{envelope.type}</TableCell>
                          <TableCell>{envelope.version}</TableCell>
                          <TableCell>{new Date(envelope.createdAt).toLocaleString()}</TableCell>
                          <TableCell>
                            {envelope.lastUsedAt
                              ? new Date(envelope.lastUsedAt).toLocaleString()
                              : "Never"}
                          </TableCell>
                          <TableCell>{envelope.revokedAt ? "Revoked" : "Active"}</TableCell>
                          <TableCell>
                            <Button
                              variant="outline"
                              disabled={!!envelope.revokedAt}
                              onClick={() => revokeEnvelope(envelope.envelopeId)}
                            >
                              <Trash2 size={16} />
                              Revoke
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
              <div style={{ marginTop: 24 }}>
                <h3 style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <ShieldCheck size={18} />
                  Trusted Devices
                </h3>
                {keyStatus.trustedDevices.length === 0 ? (
                  <p style={{ color: "hsl(var(--muted-foreground))" }}>No trusted devices found.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead>Last Used</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {keyStatus.trustedDevices.map((device) => (
                        <TableRow key={device.deviceId}>
                          <TableCell>{device.name || device.deviceId}</TableCell>
                          <TableCell>{new Date(device.createdAt).toLocaleString()}</TableCell>
                          <TableCell>
                            {device.lastUsedAt
                              ? new Date(device.lastUsedAt).toLocaleString()
                              : "Never"}
                          </TableCell>
                          <TableCell>{device.revokedAt ? "Revoked" : "Active"}</TableCell>
                          <TableCell>
                            <Button
                              variant="outline"
                              disabled={!!device.revokedAt}
                              onClick={() => revokeTrustedDevice(device.deviceId)}
                            >
                              <Trash2 size={16} />
                              Revoke
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            </>
          ) : (
            <div>Loading key status...</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
