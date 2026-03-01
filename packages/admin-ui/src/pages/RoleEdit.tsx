import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
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
import adminApiService, { type Permission, type Role } from "@/services/api";

export default function RoleEdit() {
  const { roleId } = useParams<{ roleId: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);

  const loadData = useCallback(async () => {
    if (!roleId) {
      setError("Role ID is required");
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const [foundRole, permissionsData] = await Promise.all([
        adminApiService.getRole(roleId),
        adminApiService.getPermissions(),
      ]);
      setRole(foundRole);
      setName(foundRole.name);
      setDescription(foundRole.description || "");
      setSelectedPermissions(
        foundRole.permissionKeys || foundRole.permissions?.map((p) => p.key) || []
      );
      setPermissions(permissionsData);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load role");
    } finally {
      setLoading(false);
    }
  }, [roleId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const save = async () => {
    if (!role) return;
    try {
      setSubmitting(true);
      setError(null);
      await adminApiService.updateRole(role.id, {
        name,
        description: description.trim() || undefined,
      });
      await adminApiService.updateRolePermissions(role.id, selectedPermissions);
      navigate("/roles");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save role");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div>Loading role...</div>;

  if (error && !role) {
    return (
      <div>
        <ErrorBanner withMargin>{error}</ErrorBanner>
      </div>
    );
  }

  if (!role) return null;

  const isFormValid = name.trim();

  return (
    <div>
      <PageHeader title="Edit Role" subtitle={`Role: ${role.name}`} />

      {error && <ErrorBanner withMargin>{error}</ErrorBanner>}

      <Stack>
        <Card>
          <CardHeader>
            <CardTitle>Role Details</CardTitle>
          </CardHeader>
          <CardContent>
            <FormGrid columns={2}>
              <FormField label={<Label>Role ID</Label>}>
                <Input value={role.id} readOnly />
              </FormField>
              <FormField label={<Label>Role Key</Label>}>
                <Input value={role.key} readOnly />
                <MutedText size="sm" spacing="xs">
                  Role key cannot be changed
                </MutedText>
              </FormField>
              <FormField label={<Label>Role Name *</Label>}>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={submitting}
                />
              </FormField>
              <FormField label={<Label>Description</Label>}>
                <Input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={submitting}
                />
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
            />
          </CardContent>
        </Card>
      </Stack>

      <FormActions withMargin>
        <Button variant="outline" onClick={() => navigate("/roles")} disabled={submitting}>
          Cancel
        </Button>
        <Button onClick={save} disabled={submitting || !isFormValid}>
          {submitting ? "Saving..." : "Save Changes"}
        </Button>
      </FormActions>
    </div>
  );
}
