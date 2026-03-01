import { Edit, Plus, Shield, Trash2, Users as UsersIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
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
import adminApiService, { type Group, type SortOrder } from "@/services/api";
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

  const loadGroups = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await adminApiService.getGroupsPaged({
        page: currentPage,
        limit: 20,
        search: debouncedSearch,
        sortBy,
        sortOrder,
      });
      setGroups(response.groups);
      setTotalPages(response.pagination.totalPages);
      setTotalCount(response.pagination.total);
    } catch (loadError) {
      logger.error(loadError, "Failed to load groups");
      setError(loadError instanceof Error ? loadError.message : "Failed to load groups");
    } finally {
      setLoading(false);
    }
  }, [currentPage, debouncedSearch, sortBy, sortOrder]);

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  useEffect(() => {
    const handle = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(handle);
  }, [searchQuery]);

  const handleDeleteGroup = async (group: Group) => {
    if (!confirm(`Delete group "${group.name}"? This action cannot be undone.`)) return;
    try {
      setError(null);
      await adminApiService.deleteGroup(group.key);
      setGroups((prev) => prev.filter((g) => g.key !== group.key));
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Failed to delete group");
    }
  };

  const openGroup = (group: Group) => {
    navigate(`/groups/${encodeURIComponent(group.key)}`);
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
          <Button onClick={() => navigate("/groups/new")}>
            <Plus />
            Create Group
          </Button>
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
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHead
                    label="Group"
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
                  <TableHead>Users</TableHead>
                  <TableHead className={tableStyles.actionCell}></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groups.map((group) => (
                  <TableRow key={group.key}>
                    <TableCell>
                      <button
                        type="button"
                        className={tableStyles.primaryActionButton}
                        onClick={() => openGroup(group)}
                      >
                        <span className={tableStyles.primaryActionText}>{group.name}</span>
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
                        {group.key}
                      </code>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {group.permissionCount || 0} permission
                        {(group.permissionCount || 0) !== 1 ? "s" : ""}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {group.userCount || 0} user{(group.userCount || 0) !== 1 ? "s" : ""}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <RowActions
                        items={[
                          {
                            key: "edit",
                            label: "Edit Group",
                            icon: <Edit className="h-4 w-4" />,
                            onClick: () => openGroup(group),
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
