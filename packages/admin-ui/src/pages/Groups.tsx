import { Edit, Filter, Plus, RefreshCcw, Shield, Trash2, Users as UsersIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
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
import adminApiService, { type Group } from "@/services/api";
import { logger } from "@/services/logger";

export default function Groups() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const loadGroups = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await adminApiService.getGroupsPaged(currentPage, 20, debouncedSearch);
      setGroups(response.groups);
      setTotalPages(response.pagination.totalPages);
      setTotalCount(response.pagination.total);
    } catch (error) {
      logger.error(error, "Failed to load groups");
      setError(error instanceof Error ? error.message : "Failed to load groups");
    } finally {
      setLoading(false);
    }
  }, [currentPage, debouncedSearch]);

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(handle);
  }, [searchQuery]);

  const handleDeleteGroup = async (group: Group) => {
    if (!confirm(`Delete group "${group.name}"? This action cannot be undone.`)) return;
    try {
      setError(null);
      await adminApiService.deleteGroup(group.key);
      setGroups((prev) => prev.filter((g) => g.key !== group.key));
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to delete group");
    }
  };

  const totalPermissions = groups.reduce((total, group) => total + (group.permissionCount || 0), 0);
  const totalUsers = groups.reduce((total, group) => total + (group.userCount || 0), 0);

  if (loading && groups.length === 0) return null;

  return (
    <div>
      <PageHeader
        title="Groups"
        subtitle="Manage user groups and their permissions"
        actions={
          <>
            <Button variant="outline" onClick={loadGroups}>
              <RefreshCcw />
              Refresh
            </Button>
            <Button onClick={() => navigate("/groups/new")}>
              <Plus />
              Create Group
            </Button>
          </>
        }
      />

      {error && <ErrorBanner>{error}</ErrorBanner>}

      <StatsGrid>
        <StatsCard
          title="Total Groups"
          icon={<Shield size={16} />}
          value={totalCount}
          description="User groups"
        />
        <StatsCard
          title="Total Users"
          icon={<UsersIcon size={16} />}
          value={totalUsers}
          description="Users in groups"
        />
        <StatsCard
          title="Total Permissions"
          value={totalPermissions}
          description="Permissions assigned"
        />
      </StatsGrid>

      <ListCard
        title="Group Management"
        description="View and manage all user groups"
        search={{ placeholder: "Search groups...", value: searchQuery, onChange: setSearchQuery }}
        rightActions={
          <Button variant="outline" size="icon">
            <Filter size={16} />
          </Button>
        }
      >
        {groups.length === 0 ? (
          <EmptyState
            icon={<Shield />}
            title="No Groups Found"
            description={
              searchQuery ? "Try adjusting your search" : "No groups have been created yet"
            }
          />
        ) : (
          <table className={tableStyles.table}>
            <thead className={tableStyles.header}>
              <tr>
                <th className={tableStyles.head}>Group</th>
                <th className={tableStyles.head}>Key</th>
                <th className={tableStyles.head}>Permissions</th>
                <th className={tableStyles.head}>Users</th>
                <th className={`${tableStyles.head} ${tableStyles.actionCell}`}></th>
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => (
                <tr key={group.key} className={tableStyles.row}>
                  <td className={tableStyles.cell}>
                    <div style={{ display: "flex", flexDirection: "column" }}>
                      <span style={{ fontWeight: 500 }}>{group.name}</span>
                    </div>
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
                      {group.key}
                    </code>
                  </td>
                  <td className={tableStyles.cell}>
                    <Badge variant="secondary">
                      {group.permissionCount || 0} permission
                      {(group.permissionCount || 0) !== 1 ? "s" : ""}
                    </Badge>
                  </td>
                  <td className={tableStyles.cell}>
                    <Badge variant="outline">
                      {group.userCount || 0} user{(group.userCount || 0) !== 1 ? "s" : ""}
                    </Badge>
                  </td>
                  <td className={tableStyles.cell}>
                    <RowActions
                      items={[
                        {
                          key: "edit",
                          label: "Edit Group",
                          icon: <Edit className="h-4 w-4" />,
                          onClick: () => navigate(`/groups/${group.key}`),
                        },
                        {
                          key: "delete",
                          label: "Delete Group",
                          icon: <Trash2 className="h-4 w-4" />,
                          destructive: true,
                          onClick: () => handleDeleteGroup(group),
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
