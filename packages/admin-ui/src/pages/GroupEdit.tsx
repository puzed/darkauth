import { ArrowLeft, Trash2, UserPlus } from "lucide-react";
import { useCallback, useEffect, useId, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import ErrorBanner from "@/components/feedback/error-banner";
import CheckboxRow from "@/components/form/checkbox-row";
import PermissionGrid from "@/components/group/permission-grid";
import FormActions from "@/components/layout/form-actions";
import { FormField, FormGrid } from "@/components/layout/form-grid";
import PageHeader from "@/components/layout/page-header";
import Stack from "@/components/layout/stack";
import RowActions from "@/components/row-actions";
import MutedText from "@/components/text/muted-text";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import tableStyles from "@/components/ui/table.module.css";
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
    if (!groupKey) {
      setError("Group key is required");
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const [foundGroup, permissionsData] = await Promise.all([
        adminApiService.getGroup(groupKey),
        adminApiService.getPermissions(),
      ]);

      setGroup(foundGroup);
      setName(foundGroup.name);
      setEnableLogin(foundGroup.enableLogin !== false);
      setRequireOtp(foundGroup.requireOtp === true);
      setPermissions(permissionsData);
      setSelectedPermissions(foundGroup.permissions?.map((p) => p.key) || []);

      const usersData = await adminApiService.getGroupUsers(foundGroup.key);
      setGroupUsers(usersData.users);
      setAvailableUsers(usersData.availableUsers);
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
      setError(e instanceof Error ? e.message : "Failed to save group");
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
        <ErrorBanner withMargin>{error}</ErrorBanner>
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

      {error && <ErrorBanner withMargin>{error}</ErrorBanner>}

      <Stack>
        <Card>
          <CardHeader>
            <CardTitle>Group Information</CardTitle>
          </CardHeader>
          <CardContent>
            <FormGrid columns={2}>
              <FormField label={<Label>Group Key</Label>}>
                <Input value={group.key} readOnly />
                <MutedText size="sm" spacing="xs">
                  Group key cannot be changed
                </MutedText>
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
                <CheckboxRow
                  id={enableLoginId}
                  checked={enableLogin}
                  onCheckedChange={(value) => setEnableLogin(value)}
                  disabled={submitting}
                  label="Members of this group are permitted to sign in"
                />
              </FormField>
              <FormField label={<Label>Require OTP</Label>}>
                <CheckboxRow
                  id={`${enableLoginId}-require-otp`}
                  checked={requireOtp}
                  onCheckedChange={(value) => setRequireOtp(value)}
                  disabled={submitting}
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
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Users</CardTitle>
            <MutedText size="sm">Add or remove users in this group</MutedText>
          </CardHeader>
          <CardContent>
            <FormActions align="between" withBottomMargin>
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
              <Button onClick={saveUsers} disabled={submitting || !group}>
                Save Users
              </Button>
            </FormActions>

            {groupUsers.length === 0 ? (
              <MutedText size="sm" spacing="sm">
                No users in this group
              </MutedText>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead className={tableStyles.actionCell}></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groupUsers.map((u) => (
                    <TableRow key={u.sub}>
                      <TableCell>{u.email}</TableCell>
                      <TableCell>{u.name || "-"}</TableCell>
                      <TableCell>
                        <RowActions
                          items={[
                            {
                              key: "remove",
                              label: "Remove user",
                              icon: <Trash2 size={16} />,
                              destructive: true,
                              disabled: submitting,
                              onClick: () =>
                                setGroupUsers(groupUsers.filter((x) => x.sub !== u.sub)),
                            },
                          ]}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </Stack>

      <FormActions withMargin>
        <Button variant="outline" onClick={() => navigate("/groups")} disabled={submitting}>
          Cancel
        </Button>
        <Button onClick={save} disabled={submitting || !isFormValid}>
          {submitting ? "Saving..." : "Save Changes"}
        </Button>
      </FormActions>
    </div>
  );
}
