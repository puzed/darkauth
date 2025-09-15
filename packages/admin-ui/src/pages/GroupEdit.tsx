import { ArrowLeft, Trash2, UserPlus } from "lucide-react";
import { useCallback, useEffect, useId, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { FormField, FormGrid } from "@/components/layout/form-grid";
import PageHeader from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import adminApiService, { type Group, type Permission } from "@/services/api";

export default function GroupEdit() {
  const { key: groupKey } = useParams<{ key: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [group, setGroup] = useState<Group | null>(null);
  const [name, setName] = useState("");
  const [enableLogin, setEnableLogin] = useState(true);
  const [requireOtp, setRequireOtp] = useState(false);
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [groupUsers, setGroupUsers] = useState<
    Array<{ sub: string; email: string; name?: string }>
  >([]);
  const [availableUsers, setAvailableUsers] = useState<
    Array<{ sub: string; email: string; name?: string }>
  >([]);
  const [addingOpen, setAddingOpen] = useState(false);
  const enableLoginId = useId();

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [groupsData, permissionsData] = await Promise.all([
        adminApiService.getGroups(),
        adminApiService.getPermissions(),
      ]);

      const foundGroup = groupsData.find((g) => g.key === groupKey);
      if (!foundGroup) {
        setError("Group not found");
        setLoading(false);
        return;
      }

      setGroup(foundGroup);
      setName(foundGroup.name);
      setEnableLogin(foundGroup.enableLogin !== false);
      setRequireOtp(foundGroup.requireOtp === true);
      setPermissions(permissionsData);

      // Since the API doesn't return permissions in the group object yet,
      // we'll start with an empty array. When the backend is fully implemented,
      // this should be: setSelectedPermissions(foundGroup.permissions || []);
      setSelectedPermissions([]);

      if (foundGroup) {
        const usersData = await adminApiService.getGroupUsers(foundGroup.key);
        setGroupUsers(usersData.users);
        setAvailableUsers(usersData.availableUsers);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load group");
    } finally {
      setLoading(false);
    }
  }, [groupKey]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handlePermissionToggle = (permissionKey: string, checked: boolean) => {
    setSelectedPermissions((prev) =>
      checked ? [...prev, permissionKey] : prev.filter((p) => p !== permissionKey)
    );
  };

  const save = async () => {
    if (!group) return;

    try {
      setSubmitting(true);
      setError(null);

      await adminApiService.updateGroup(group.key, {
        name,
        enableLogin,
        requireOtp,
        permissionKeys: selectedPermissions,
      });

      navigate("/groups");
    } catch (e) {
      // Handle the "Not yet implemented" error gracefully
      if (e instanceof Error && e.message.includes("Not yet implemented")) {
        setError(
          "Group editing functionality is not yet fully implemented in the backend. Only group creation is currently supported."
        );
      } else {
        setError(e instanceof Error ? e.message : "Failed to save group");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const saveUsers = async () => {
    if (!group) return;
    try {
      setSubmitting(true);
      setError(null);
      await adminApiService.updateGroupUsers(
        group.key,
        groupUsers.map((u) => u.sub)
      );
      const refreshed = await adminApiService.getGroupUsers(group.key);
      setGroupUsers(refreshed.users);
      setAvailableUsers(refreshed.availableUsers);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save users");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div>Loading group...</div>;

  if (error && !group) {
    return (
      <div>
        <div style={{ color: "hsl(var(--destructive))", padding: 16 }}>{error}</div>
        <Button onClick={() => navigate("/groups")}>Back to Groups</Button>
      </div>
    );
  }

  if (!group) return null;

  const isFormValid = name.trim();

  return (
    <div>
      <PageHeader
        title="Edit Group"
        subtitle={`Group: ${group.name}`}
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
              <FormField label={<Label>Group Key</Label>}>
                <Input value={group.key} readOnly />
                <div
                  style={{
                    fontSize: "0.875rem",
                    color: "hsl(var(--muted-foreground))",
                    marginTop: 4,
                  }}
                >
                  Group key cannot be changed
                </div>
              </FormField>
              <FormField label={<Label>Group Name *</Label>}>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={submitting}
                  placeholder="Administrators"
                />
              </FormField>
              <FormField label={<Label>Users in Group</Label>}>
                <Input
                  value={`${group.userCount || 0} user${(group.userCount || 0) !== 1 ? "s" : ""}`}
                  readOnly
                />
              </FormField>
              <FormField label={<Label>Current Permissions</Label>}>
                <Input
                  value={`${group.permissionCount || 0} permission${(group.permissionCount || 0) !== 1 ? "s" : ""}`}
                  readOnly
                />
              </FormField>
              <FormField label={<Label>Enable Login</Label>}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <Checkbox
                    id={enableLoginId}
                    checked={enableLogin}
                    onCheckedChange={(v) => setEnableLogin(v === true)}
                    disabled={submitting}
                  />
                  <Label htmlFor={enableLoginId} style={{ fontWeight: 400 }}>
                    Members of this group are permitted to sign in
                  </Label>
                </div>
              </FormField>
              <FormField label={<Label>Require OTP</Label>}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <Checkbox
                    id={`${enableLoginId}-require-otp`}
                    checked={requireOtp}
                    onCheckedChange={(v) => setRequireOtp(v === true)}
                    disabled={submitting}
                  />
                  <Label htmlFor={`${enableLoginId}-require-otp`} style={{ fontWeight: 400 }}>
                    Members must complete OTP when this group permits login
                  </Label>
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
            <div
              style={{
                fontSize: "0.875rem",
                color: "hsl(var(--orange-600))",
                backgroundColor: "hsl(var(--orange-100))",
                padding: 8,
                borderRadius: 4,
                marginTop: 8,
              }}
            >
              Note: Permission editing is currently being implemented. Changes may not be saved
              until the backend is fully updated.
            </div>
          </CardHeader>
          <CardContent>
            {permissions.length === 0 ? (
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

        <Card>
          <CardHeader>
            <CardTitle>Users</CardTitle>
            <div style={{ fontSize: "0.875rem", color: "hsl(var(--muted-foreground))" }}>
              Add or remove users in this group
            </div>
          </CardHeader>
          <CardContent>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
              <Popover open={addingOpen} onOpenChange={setAddingOpen}>
                <PopoverTrigger asChild>
                  <Button size="sm" variant="outline">
                    <UserPlus size={16} />
                    Add User
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" style={{ width: 360, padding: 0 }}>
                  <Command>
                    <CommandInput placeholder="Search users..." />
                    <CommandList>
                      <CommandEmpty>No users found</CommandEmpty>
                      <CommandGroup>
                        {availableUsers
                          .filter((u) => !groupUsers.find((g) => g.sub === u.sub))
                          .map((u) => (
                            <CommandItem
                              key={u.sub}
                              onSelect={() => {
                                setGroupUsers([...groupUsers, u]);
                                setAddingOpen(false);
                              }}
                            >
                              {u.email} {u.name ? `(${u.name})` : ""}
                            </CommandItem>
                          ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              <div style={{ flex: 1 }} />
              <Button onClick={saveUsers} disabled={submitting || !group}>
                Save Users
              </Button>
            </div>

            {groupUsers.length === 0 ? (
              <div style={{ color: "hsl(var(--muted-foreground))", padding: 16 }}>
                No users in this group
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groupUsers.map((u) => (
                    <TableRow key={u.sub}>
                      <TableCell>{u.email}</TableCell>
                      <TableCell>{u.name || "-"}</TableCell>
                      <TableCell style={{ display: "flex", justifyContent: "flex-end" }}>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setGroupUsers(groupUsers.filter((x) => x.sub !== u.sub))}
                          disabled={submitting}
                          aria-label="Remove user"
                        >
                          <Trash2 size={16} />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 24 }}>
        <Button variant="outline" onClick={() => navigate("/groups")} disabled={submitting}>
          Cancel
        </Button>
        <Button onClick={save} disabled={submitting || !isFormValid}>
          {submitting ? "Saving..." : "Save Changes"}
        </Button>
      </div>
    </div>
  );
}
