import { Edit, Plus, RefreshCcw, Shield, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import tableStyles from "@/components/ui/table.module.css";
import adminApiService, { type Role, type SortOrder } from "@/services/api";
import { logger } from "@/services/logger";

export default function Roles() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sortBy, setSortBy] = useState("name");
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

  const loadRoles = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await adminApiService.getRolesPaged({
        page: currentPage,
        limit: 20,
        search: debouncedSearch,
        sortBy,
        sortOrder,
      });
      setRoles(response.roles);
      setTotalPages(response.pagination.totalPages);
      setTotalCount(response.pagination.total);
    } catch (loadError) {
      logger.error(loadError, "Failed to load roles");
      setError(loadError instanceof Error ? loadError.message : "Failed to load roles");
    } finally {
      setLoading(false);
    }
  }, [currentPage, debouncedSearch, sortBy, sortOrder]);

  useEffect(() => {
    loadRoles();
  }, [loadRoles]);

  useEffect(() => {
    const handle = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(handle);
  }, [searchQuery]);

  const handleDeleteRole = async (role: Role) => {
    if (!confirm(`Delete role "${role.name}"? This action cannot be undone.`)) return;
    try {
      setError(null);
      await adminApiService.deleteRole(role.id);
      setRoles((prev) => prev.filter((r) => r.id !== role.id));
      setTotalCount((prev) => Math.max(prev - 1, 0));
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Failed to delete role");
    }
  };

  const openRole = (role: Role) => {
    navigate(`/roles/${encodeURIComponent(role.id)}`);
  };

  const totalPermissions = useMemo(
    () => roles.reduce((total, role) => total + (role.permissionCount || 0), 0),
    [roles]
  );

  if (loading && roles.length === 0) return null;

  return (
    <div>
      <PageHeader
        title="Roles"
        subtitle="Manage roles and permission mapping"
        actions={
          <>
            <Button variant="outline" onClick={loadRoles}>
              <RefreshCcw />
              Refresh
            </Button>
            <Button onClick={() => navigate("/roles/new")}>
              <Plus />
              Create Role
            </Button>
          </>
        }
      />

      {error && <ErrorBanner>{error}</ErrorBanner>}

      <StatsGrid>
        <StatsCard
          title="Total Roles"
          icon={<Shield size={16} />}
          value={totalCount}
          description="Role templates"
        />
        <StatsCard
          title="Permission Mappings"
          value={totalPermissions}
          description="Assigned permissions"
        />
      </StatsGrid>

      <ListCard
        title="Role Management"
        description="View and manage all roles"
        search={{ placeholder: "Search roles...", value: searchQuery, onChange: setSearchQuery }}
      >
        {roles.length === 0 ? (
          <EmptyState
            icon={<Shield />}
            title="No Roles Found"
            description={
              searchQuery ? "Try adjusting your search" : "No roles have been created yet"
            }
          />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHead
                    label="Role"
                    isActive={sortBy === "name"}
                    sortOrder={sortOrder}
                    onToggle={() => toggleSort("name")}
                  />
                  <SortableTableHead
                    label="Key"
                    isActive={sortBy === "key"}
                    sortOrder={sortOrder}
                    onToggle={() => toggleSort("key")}
                  />
                  <TableHead>Permissions</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {roles.map((role) => (
                  <TableRow key={role.id}>
                    <TableCell>
                      <button
                        type="button"
                        className={tableStyles.primaryActionButton}
                        onClick={() => openRole(role)}
                      >
                        <span className={tableStyles.primaryActionText}>{role.name}</span>
                      </button>
                    </TableCell>
                    <TableCell>
                      <code
                        style={{
                          backgroundColor: "hsl(var(--muted))",
                          padding: "2px 6px",
                          borderRadius: 4,
                          fontSize: "0.875rem",
                        }}
                      >
                        {role.key}
                      </code>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {role.permissionCount || role.permissionKeys?.length || 0}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={role.system ? "outline" : "default"}>
                        {role.system ? "System" : "Custom"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <RowActions
                        items={[
                          {
                            key: "edit",
                            label: "Edit Role",
                            icon: <Edit className="h-4 w-4" />,
                            onClick: () => openRole(role),
                          },
                          {
                            key: "delete",
                            label: "Delete Role",
                            icon: <Trash2 className="h-4 w-4" />,
                            destructive: true,
                            onClick: () => handleDeleteRole(role),
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
    </div>
  );
}
