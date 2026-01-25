import { Key, Plus, RefreshCcw, Shield, Trash2, Users as UsersIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import EmptyState from "@/components/empty-state";
import ErrorBanner from "@/components/feedback/error-banner";
import PageHeader from "@/components/layout/page-header";
import ListCard from "@/components/list/list-card";
import RowActions from "@/components/row-actions";
import StatsCard, { StatsGrid } from "@/components/stats-card";
import tableStyles from "@/components/table.module.css";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import adminApiService, { type Permission } from "@/services/api";
import { logger } from "@/services/logger";

export default function Permissions() {
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [creating, setCreating] = useState(false);

  const loadPermissions = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await adminApiService.getPermissions();
      setPermissions(data);
    } catch (error) {
      logger.error(error, "Failed to load permissions");
      setError(error instanceof Error ? error.message : "Failed to load permissions");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPermissions();
  }, [loadPermissions]);

  const handleCreatePermission = async () => {
    if (!newKey.trim()) return;
    try {
      setCreating(true);
      setError(null);
      const created = await adminApiService.createPermission({
        key: newKey.trim(),
        description: newDescription.trim(),
      });
      setPermissions((prev) => [...prev, created]);
      setCreateDialogOpen(false);
      setNewKey("");
      setNewDescription("");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to create permission");
    } finally {
      setCreating(false);
    }
  };

  const handleDeletePermission = async (permission: Permission) => {
    if (!confirm(`Delete permission "${permission.key}"? This will remove it from all groups.`))
      return;
    try {
      setError(null);
      await adminApiService.deletePermission(permission.key);
      setPermissions((prev) => prev.filter((p) => p.key !== permission.key));
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to delete permission");
    }
  };

  const totalGroups = permissions.reduce((total, p) => total + (p.groupCount || 0), 0);
  const totalUsers = permissions.reduce((total, p) => total + (p.directUserCount || 0), 0);

  if (loading && permissions.length === 0) return null;

  return (
    <div>
      <PageHeader
        title="Permissions"
        subtitle="Manage permissions that can be assigned to groups"
        actions={
          <>
            <Button variant="outline" onClick={loadPermissions}>
              <RefreshCcw />
              Refresh
            </Button>
            <Button onClick={() => setCreateDialogOpen(true)}>
              <Plus />
              Create Permission
            </Button>
          </>
        }
      />

      {error && <ErrorBanner>{error}</ErrorBanner>}

      <StatsGrid>
        <StatsCard
          title="Total Permissions"
          icon={<Key size={16} />}
          value={permissions.length}
          description="Defined permissions"
        />
        <StatsCard
          title="Group Assignments"
          icon={<Shield size={16} />}
          value={totalGroups}
          description="Times assigned to groups"
        />
        <StatsCard
          title="Direct User Assignments"
          icon={<UsersIcon size={16} />}
          value={totalUsers}
          description="Direct user assignments"
        />
      </StatsGrid>

      <ListCard
        title="Permission Management"
        description="Define permissions that can be assigned to groups. Users inherit permissions from their groups."
      >
        {permissions.length === 0 ? (
          <EmptyState
            icon={<Key />}
            title="No Permissions Defined"
            description="Create permissions to assign to groups. Users will inherit permissions from their groups."
            action={
              <Button onClick={() => setCreateDialogOpen(true)}>
                <Plus size={16} />
                Create Permission
              </Button>
            }
          />
        ) : (
          <table className={tableStyles.table}>
            <thead className={tableStyles.header}>
              <tr>
                <th className={tableStyles.head}>Permission Key</th>
                <th className={tableStyles.head}>Description</th>
                <th className={tableStyles.head}>Groups</th>
                <th className={tableStyles.head}>Direct Users</th>
                <th className={`${tableStyles.head} ${tableStyles.actionCell}`}></th>
              </tr>
            </thead>
            <tbody>
              {permissions.map((permission) => (
                <tr key={permission.key} className={tableStyles.row}>
                  <td className={tableStyles.cell}>
                    <code
                      style={{
                        backgroundColor: "hsl(var(--muted))",
                        padding: "2px 6px",
                        borderRadius: 4,
                        fontSize: "0.875rem",
                        fontWeight: 500,
                      }}
                    >
                      {permission.key}
                    </code>
                  </td>
                  <td className={tableStyles.cell}>
                    <span style={{ color: "hsl(var(--muted-foreground))" }}>
                      {permission.description || "-"}
                    </span>
                  </td>
                  <td className={tableStyles.cell}>
                    <Badge variant="secondary">
                      {permission.groupCount || 0} group
                      {(permission.groupCount || 0) !== 1 ? "s" : ""}
                    </Badge>
                  </td>
                  <td className={tableStyles.cell}>
                    <Badge variant="outline">
                      {permission.directUserCount || 0} user
                      {(permission.directUserCount || 0) !== 1 ? "s" : ""}
                    </Badge>
                  </td>
                  <td className={tableStyles.cell}>
                    <RowActions
                      items={[
                        {
                          key: "delete",
                          label: "Delete Permission",
                          icon: <Trash2 className="h-4 w-4" />,
                          destructive: true,
                          onClick: () => handleDeletePermission(permission),
                        },
                      ]}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </ListCard>

      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Permission</DialogTitle>
            <DialogDescription>
              Define a new permission that can be assigned to groups.
            </DialogDescription>
          </DialogHeader>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <Label htmlFor="permission-key">Permission Key *</Label>
              <Input
                id="permission-key"
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                placeholder="e.g., users:read, admin:access"
                disabled={creating}
              />
              <p
                style={{
                  fontSize: "0.875rem",
                  color: "hsl(var(--muted-foreground))",
                  marginTop: 4,
                }}
              >
                Use a consistent format like resource:action
              </p>
            </div>
            <div>
              <Label htmlFor="permission-description">Description</Label>
              <Input
                id="permission-description"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="e.g., Can view user profiles"
                disabled={creating}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCreateDialogOpen(false)}
              disabled={creating}
            >
              Cancel
            </Button>
            <Button onClick={handleCreatePermission} disabled={creating || !newKey.trim()}>
              {creating ? "Creating..." : "Create Permission"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
