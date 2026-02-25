import { ArrowLeft } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import ErrorBanner from "@/components/feedback/error-banner";
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

export default function RoleCreate() {
  const navigate = useNavigate();
  const [key, setKey] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loadingPermissions, setLoadingPermissions] = useState(true);

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

  const handleNameChange = (value: string) => {
    setName(value);
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

  const create = async () => {
    try {
      setSubmitting(true);
      setError(null);
      await adminApiService.createRole({
        key,
        name,
        description: description.trim() || undefined,
        permissionKeys: selectedPermissions,
      });
      navigate("/roles");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create role");
    } finally {
      setSubmitting(false);
    }
  };

  const isFormValid = key.trim() && name.trim();

  return (
    <div>
      <PageHeader
        title="Create Role"
        subtitle="Create a role and map permissions"
        actions={
          <Button variant="outline" onClick={() => navigate("/roles")}>
            <ArrowLeft />
            Back
          </Button>
        }
      />

      {error && <ErrorBanner withMargin>{error}</ErrorBanner>}

      <Stack>
        <Card>
          <CardHeader>
            <CardTitle>Role Details</CardTitle>
          </CardHeader>
          <CardContent>
            <FormGrid columns={2}>
              <FormField label={<Label>Role Name *</Label>}>
                <Input
                  value={name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  disabled={submitting}
                  placeholder="Organization Admin"
                />
              </FormField>
              <FormField label={<Label>Role Key *</Label>}>
                <Input
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  disabled={submitting}
                  placeholder="org_admin"
                />
              </FormField>
              <FormField label={<Label>Description</Label>}>
                <Input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={submitting}
                  placeholder="Manages members and access"
                />
                <MutedText size="sm" spacing="xs">
                  Optional description for admins
                </MutedText>
              </FormField>
            </FormGrid>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Permissions</CardTitle>
            <MutedText size="sm">Select the permissions this role grants</MutedText>
          </CardHeader>
          <CardContent>
            <PermissionGrid
              permissions={permissions}
              selected={selectedPermissions}
              onToggle={(permissionKey, checked) =>
                setSelectedPermissions((prev) =>
                  checked ? [...prev, permissionKey] : prev.filter((p) => p !== permissionKey)
                )
              }
              disabled={submitting}
              loading={loadingPermissions}
            />
          </CardContent>
        </Card>
      </Stack>

      <FormActions withMargin>
        <Button variant="outline" onClick={() => navigate("/roles")} disabled={submitting}>
          Cancel
        </Button>
        <Button onClick={create} disabled={submitting || !isFormValid}>
          {submitting ? "Creating..." : "Create Role"}
        </Button>
      </FormActions>
    </div>
  );
}
