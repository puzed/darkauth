import { AlertTriangle, ArrowLeft } from "lucide-react";
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
import TagMultiSelect from "@/components/ui/tag-multi-select";
import adminApiService, { type Group, type User } from "@/services/api";

export default function UserEdit() {
  const { sub } = useParams<{ sub: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [allGroups, setAllGroups] = useState<Group[]>([]);
  const [groupKeys, setGroupKeys] = useState<string[]>([]);
  const [otpStatus, setOtpStatus] = useState<{
    enabled: boolean;
    verified: boolean;
    created_at?: string | null;
    last_used_at?: string | null;
  } | null>(null);

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
      const [groups, userGroupKeys] = await Promise.all([
        adminApiService.getGroups(),
        adminApiService.getUserGroups(u.sub),
      ]);
      try {
        const s = await adminApiService.getUserOtpStatus(u.sub);
        setOtpStatus(s);
      } catch {}
      setAllGroups(groups);
      setGroupKeys(userGroupKeys);
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
      await adminApiService.updateUserGroups(user.sub, groupKeys);
      navigate("/users");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save user");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div>Loading user...</div>;

  if (error)
    return (
      <div>
        <div>{error}</div>
        <button type="button" onClick={() => navigate("/users")}>
          Back
        </button>
      </div>
    );

  if (!user) return null;

  return (
    <div>
      <PageHeader
        title="Edit User"
        subtitle={`User ID: ${sub || ""}`}
        actions={
          <Button variant="outline" onClick={() => navigate("/users")}>
            <ArrowLeft />
            Back
          </Button>
        }
      />
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
            <FormField label={<Label>Groups</Label>}>
              <TagMultiSelect
                value={groupKeys}
                options={allGroups.map((g) => ({ value: g.key, label: `${g.name} (${g.key})` }))}
                placeholder="Add groups"
                onChange={setGroupKeys}
                disabled={submitting}
              />
            </FormField>
          </FormGrid>
          <FormActions>
            {user && (
              <>
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
            <Button variant="outline" onClick={() => navigate("/users")}>
              Back
            </Button>
            <Button onClick={save} disabled={submitting}>
              Save
            </Button>
          </FormActions>
        </CardContent>
      </Card>
    </div>
  );
}
