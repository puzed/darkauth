import { ArrowLeft } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FormField, FormGrid } from "@/components/layout/form-grid";
import PageHeader from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import adminApiService, { type Permission } from "@/services/api";

export default function GroupCreate() {
  const navigate = useNavigate();
  const [key, setKey] = useState("");
  const [name, setName] = useState("");
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
      console.error("Failed to load permissions:", error);
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

      {error && (
        <div
          style={{
            color: "hsl(var(--destructive))",
            padding: 16,
            marginBottom: 16,
            backgroundColor: "hsl(var(--destructive) / 0.1)",
            border: "1px solid hsl(var(--destructive) / 0.2)",
            borderRadius: 6,
          }}
        >
          {error}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
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
                <div
                  style={{
                    fontSize: "0.875rem",
                    color: "hsl(var(--muted-foreground))",
                    marginTop: 4,
                  }}
                >
                  Alphanumeric characters, underscores, and hyphens only
                </div>
              </FormField>
            </FormGrid>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Permissions</CardTitle>
            <div style={{ fontSize: "0.875rem", color: "hsl(var(--muted-foreground))" }}>
              Select the permissions that members of this group should have
            </div>
          </CardHeader>
          <CardContent>
            {loadingPermissions ? (
              <div>Loading permissions...</div>
            ) : permissions.length === 0 ? (
              <div
                style={{ color: "hsl(var(--muted-foreground))", padding: 32, textAlign: "center" }}
              >
                No permissions available
              </div>
            ) : (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
                  gap: 12,
                }}
              >
                {permissions.map((permission) => (
                  <div
                    key={permission.key}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 8,
                      padding: 12,
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 6,
                      backgroundColor: selectedPermissions.includes(permission.key)
                        ? "hsl(var(--accent))"
                        : "transparent",
                    }}
                  >
                    <Checkbox
                      id={`permission-${permission.key}`}
                      checked={selectedPermissions.includes(permission.key)}
                      onCheckedChange={(checked) =>
                        handlePermissionToggle(permission.key, checked === true)
                      }
                      disabled={submitting}
                    />
                    <div style={{ flex: 1 }}>
                      <Label
                        htmlFor={`permission-${permission.key}`}
                        style={{ fontWeight: 500, cursor: "pointer" }}
                      >
                        {permission.key}
                      </Label>
                      {permission.description && (
                        <div
                          style={{
                            fontSize: "0.875rem",
                            color: "hsl(var(--muted-foreground))",
                            marginTop: 2,
                          }}
                        >
                          {permission.description}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {selectedPermissions.length > 0 && (
              <div
                style={{
                  marginTop: 16,
                  padding: 12,
                  backgroundColor: "hsl(var(--muted))",
                  borderRadius: 6,
                }}
              >
                <div style={{ fontSize: "0.875rem", fontWeight: 500, marginBottom: 8 }}>
                  Selected permissions ({selectedPermissions.length}):
                </div>
                <div style={{ fontSize: "0.875rem", color: "hsl(var(--muted-foreground))" }}>
                  {selectedPermissions.join(", ")}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 24 }}>
        <Button variant="outline" onClick={() => navigate("/groups")} disabled={submitting}>
          Cancel
        </Button>
        <Button onClick={create} disabled={submitting || !isFormValid}>
          {submitting ? "Creating..." : "Create Group"}
        </Button>
      </div>
    </div>
  );
}
