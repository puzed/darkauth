import { ArrowLeft } from "lucide-react";
import { useCallback, useEffect, useId, useState } from "react";
import { useNavigate } from "react-router-dom";
import ErrorBanner from "@/components/feedback/error-banner";
import CheckboxRow from "@/components/form/checkbox-row";
import PermissionGrid from "@/components/group/permission-grid";
import FormActions from "@/components/layout/form-actions";
import { FormField, FormGrid } from "@/components/layout/form-grid";
import PageHeader from "@/components/layout/page-header";
import Stack from "@/components/layout/stack";
import MutedText from "@/components/text/muted-text";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import adminApiService, { type Permission } from "@/services/api";
import { logger } from "@/services/logger";

export default function GroupCreate() {
  const navigate = useNavigate();
  const [key, setKey] = useState("");
  const [name, setName] = useState("");
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [enableLogin, setEnableLogin] = useState(true);
  const [requireOtp, setRequireOtp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loadingPermissions, setLoadingPermissions] = useState(true);
  const enableLoginId = useId();

  const loadPermissions = useCallback(async () => {
    try {
      setLoadingPermissions(true);
      const permissionsData = await adminApiService.getPermissions();
      setPermissions(permissionsData);
    } catch (error) {
      logger.error(error, "Failed to load permissions");
      setError(error instanceof Error ? error.message : "Failed to load permissions");
    } finally {
      setLoadingPermissions(false);
    }
  }, []);

  useEffect(() => {
    loadPermissions();
  }, [loadPermissions]);

  const handleKeyChange = (value: string) => {
    // Auto-generate key from name, but allow manual editing
    setKey(value);
  };

  const handleNameChange = (value: string) => {
    setName(value);
    // Auto-generate key if key field is empty or matches the previous name
    if (!key || key === name.toLowerCase().replace(/[^a-zA-Z0-9]/g, "_")) {
      setKey(
        value
          .toLowerCase()
          .replace(/[^a-zA-Z0-9]/g, "_")
          .replace(/_{2,}/g, "_")
          .replace(/^_|_$/g, "")
      );
    }
  };

  const handlePermissionToggle = (permissionKey: string, checked: boolean) => {
    setSelectedPermissions((prev) =>
      checked ? [...prev, permissionKey] : prev.filter((p) => p !== permissionKey)
    );
  };

  const create = async () => {
    try {
      setSubmitting(true);
      setError(null);

      await adminApiService.createGroup({
        key,
        name,
        enableLogin,
        requireOtp,
        permissionKeys: selectedPermissions,
      });

      navigate("/groups");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create group");
    } finally {
      setSubmitting(false);
    }
  };

  const isFormValid = key.trim() && name.trim();

  return (
    <div>
      <PageHeader
        title="Create Group"
        subtitle="Create a new user group with permissions"
        actions={
          <Button variant="outline" onClick={() => navigate("/groups")}>
            <ArrowLeft />
            Back
          </Button>
        }
      />

      {error && <ErrorBanner withMargin>{error}</ErrorBanner>}

      <Stack>
        <Card>
          <CardHeader>
            <CardTitle>Group Information</CardTitle>
          </CardHeader>
          <CardContent>
            <FormGrid columns={2}>
              <FormField label={<Label>Group Name *</Label>}>
                <Input
                  value={name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  disabled={submitting}
                  placeholder="Administrators"
                />
              </FormField>
              <FormField label={<Label>Group Key *</Label>}>
                <Input
                  value={key}
                  onChange={(e) => handleKeyChange(e.target.value)}
                  disabled={submitting}
                  placeholder="administrators"
                />
                <MutedText size="sm" spacing="xs">
                  Alphanumeric characters, underscores, and hyphens only
                </MutedText>
              </FormField>
              <FormField label={<Label>Enable Login</Label>}>
                <CheckboxRow
                  id={enableLoginId}
                  checked={enableLogin}
                  onCheckedChange={(value) => setEnableLogin(value)}
                  label="Members of this group are permitted to sign in"
                />
              </FormField>
              <FormField label={<Label>Require OTP</Label>}>
                <CheckboxRow
                  id={`${enableLoginId}-require-otp`}
                  checked={requireOtp}
                  onCheckedChange={(value) => setRequireOtp(value)}
                  label="Members must complete OTP when this group permits login"
                />
              </FormField>
            </FormGrid>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Permissions</CardTitle>
            <MutedText size="sm">
              Select the permissions that members of this group should have
            </MutedText>
          </CardHeader>
          <CardContent>
            <PermissionGrid
              permissions={permissions}
              selected={selectedPermissions}
              onToggle={(key, next) => handlePermissionToggle(key, next)}
              disabled={submitting}
              loading={loadingPermissions}
            />
          </CardContent>
        </Card>
      </Stack>

      <FormActions withMargin>
        <Button variant="outline" onClick={() => navigate("/groups")} disabled={submitting}>
          Cancel
        </Button>
        <Button onClick={create} disabled={submitting || !isFormValid}>
          {submitting ? "Creating..." : "Create Group"}
        </Button>
      </FormActions>
    </div>
  );
}
