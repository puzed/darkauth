import { Key, Plus, Shield, Trash2, Users as UsersIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import EmptyState from "@/components/empty-state";
import ErrorBanner from "@/components/feedback/error-banner";
import PageHeader from "@/components/layout/page-header";
import ListCard from "@/components/list/list-card";
import RowActions from "@/components/row-actions";
import StatsCard, { StatsGrid } from "@/components/stats-card";
import ListPagination from "@/components/table/list-pagination";
import SortableTableHead from "@/components/table/sortable-table-head";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import adminApiService, { type Permission, type SortOrder } from "@/services/api";
import { logger } from "@/services/logger";

export default function Permissions() {
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [sortBy, setSortBy] = useState("key");
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");

  const toggleSort = (field: string) => {
    setCurrentPage(1);
    if (sortBy === field) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortBy(field);
    setSortOrder("asc");
  };

  const loadPermissions = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await adminApiService.getPermissionsPaged({
        page: currentPage,
        limit: 20,
        search: debouncedSearch,
        sortBy,
        sortOrder,
      });
      setPermissions(data.permissions);
      setTotalPages(data.pagination.totalPages);
      setTotalCount(data.pagination.total);
    } catch (loadError) {
      logger.error(loadError, "Failed to load permissions");
      setError(loadError instanceof Error ? loadError.message : "Failed to load permissions");
    } finally {
      setLoading(false);
    }
  }, [currentPage, debouncedSearch, sortBy, sortOrder]);

  useEffect(() => {
    loadPermissions();
  }, [loadPermissions]);

  useEffect(() => {
    const handle = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(handle);
  }, [searchQuery]);

  const handleCreatePermission = async () => {
    if (!newKey.trim()) return;
    try {
      setCreating(true);
      setError(null);
      await adminApiService.createPermission({
        key: newKey.trim(),
        description: newDescription.trim(),
      });
      setCreateDialogOpen(false);
      setNewKey("");
      setNewDescription("");
      loadPermissions();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Failed to create permission");
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
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Failed to delete permission");
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
          <Button onClick={() => setCreateDialogOpen(true)}>
            <Plus />
            Create Permission
          </Button>
        }
      />

      {error && <ErrorBanner>{error}</ErrorBanner>}

      <StatsGrid>
        <StatsCard
          title="Total Permissions"
          icon={<Key size={16} />}
          value={totalCount}
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
        search={{
          placeholder: "Search permissions...",
          value: searchQuery,
          onChange: setSearchQuery,
        }}
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
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHead
                    label="Permission Key"
                    isActive={sortBy === "key"}
                    sortOrder={sortOrder}
                    onToggle={() => toggleSort("key")}
                  />
                  <SortableTableHead
                    label="Description"
                    isActive={sortBy === "description"}
                    sortOrder={sortOrder}
                    onToggle={() => toggleSort("description")}
                  />
                  <TableHead>Groups</TableHead>
                  <TableHead>Direct Users</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {permissions.map((permission) => (
                  <TableRow key={permission.key}>
                    <TableCell>
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
                    </TableCell>
                    <TableCell>
                      <span style={{ color: "hsl(var(--muted-foreground))" }}>
                        {permission.description || "-"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {permission.groupCount || 0} group
                        {(permission.groupCount || 0) !== 1 ? "s" : ""}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {permission.directUserCount || 0} user
                        {(permission.directUserCount || 0) !== 1 ? "s" : ""}
                      </Badge>
                    </TableCell>
                    <TableCell>
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
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div style={{ marginTop: 20 }}>
              <ListPagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
              />
            </div>
          </>
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
