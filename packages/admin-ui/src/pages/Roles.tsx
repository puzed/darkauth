import { Edit, Filter, Plus, RefreshCcw, Shield, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
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
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import adminApiService, { type Role } from "@/services/api";
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

  const loadRoles = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await adminApiService.getRolesPaged(currentPage, 20, debouncedSearch);
      setRoles(response.roles);
      setTotalPages(response.pagination.totalPages);
      setTotalCount(response.pagination.total);
    } catch (error) {
      logger.error(error, "Failed to load roles");
      setError(error instanceof Error ? error.message : "Failed to load roles");
    } finally {
      setLoading(false);
    }
  }, [currentPage, debouncedSearch]);

  useEffect(() => {
    loadRoles();
  }, [loadRoles]);

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(handle);
  }, [searchQuery]);

  const handleDeleteRole = async (role: Role) => {
    if (!confirm(`Delete role "${role.name}"? This action cannot be undone.`)) return;
    try {
      setError(null);
      await adminApiService.deleteRole(role.id);
      setRoles((prev) => prev.filter((r) => r.id !== role.id));
      setTotalCount((prev) => Math.max(prev - 1, 0));
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to delete role");
    }
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
        rightActions={
          <Button variant="outline" size="icon">
            <Filter size={16} />
          </Button>
        }
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
          <table className={tableStyles.table}>
            <thead className={tableStyles.header}>
              <tr>
                <th className={tableStyles.head}>Role</th>
                <th className={tableStyles.head}>Key</th>
                <th className={tableStyles.head}>Permissions</th>
                <th className={tableStyles.head}>Type</th>
                <th className={`${tableStyles.head} ${tableStyles.actionCell}`}></th>
              </tr>
            </thead>
            <tbody>
              {roles.map((role) => (
                <tr key={role.id} className={tableStyles.row}>
                  <td className={tableStyles.cell} style={{ fontWeight: 500 }}>
                    {role.name}
                  </td>
                  <td className={tableStyles.cell}>
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
                  </td>
                  <td className={tableStyles.cell}>
                    <Badge variant="secondary">
                      {role.permissionCount || role.permissionKeys?.length || 0}
                    </Badge>
                  </td>
                  <td className={tableStyles.cell}>
                    <Badge variant={role.system ? "outline" : "default"}>
                      {role.system ? "System" : "Custom"}
                    </Badge>
                  </td>
                  <td className={tableStyles.cell}>
                    <RowActions
                      items={[
                        {
                          key: "edit",
                          label: "Edit Role",
                          icon: <Edit className="h-4 w-4" />,
                          onClick: () => navigate(`/roles/${role.id}`),
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
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </ListCard>

      {totalPages > 1 && (
        <div style={{ marginTop: 20 }}>
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                />
              </PaginationItem>
              <PaginationItem>
                <PaginationLink isActive>{currentPage}</PaginationLink>
              </PaginationItem>
              <PaginationItem>
                <PaginationNext
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      )}
    </div>
  );
}
