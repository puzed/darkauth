import { Edit, KeyRound, RefreshCcw, RotateCcw, Trash2, UserPlus } from "lucide-react";
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
import { useToast } from "@/hooks/use-toast";
import adminApiService, { type AdminUser, type SortOrder } from "@/services/api";
import { sha256Base64Url } from "@/services/hash";
import { logger } from "@/services/logger";
import adminOpaqueService from "@/services/opaque-cloudflare";

export default function AdminUsers() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [sortBy, setSortBy] = useState("createdAt");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

  const toggleSort = (field: string) => {
    setCurrentPage(1);
    if (sortBy === field) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortBy(field);
    setSortOrder("asc");
  };

  const loadAdminUsers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await adminApiService.getAdminUsers({
        page: currentPage,
        limit: 20,
        search: debouncedSearch,
        sortBy,
        sortOrder,
      });
      setAdminUsers(response.adminUsers);
      setTotalPages(response.pagination.totalPages);
      setTotalCount(response.pagination.total);
    } catch (loadError) {
      logger.error(loadError, "Failed to load admin users");
      setError(loadError instanceof Error ? loadError.message : "Failed to load admin users");
      toast({
        title: "Error",
        description: loadError instanceof Error ? loadError.message : "Failed to load admin users",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [currentPage, debouncedSearch, sortBy, sortOrder, toast]);

  useEffect(() => {
    loadAdminUsers();
  }, [loadAdminUsers]);

  useEffect(() => {
    const handle = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(handle);
  }, [searchQuery]);

  const handleDeleteAdminUser = async (adminUser: AdminUser) => {
    if (!confirm(`Delete admin user ${adminUser.email}?`)) return;
    try {
      setError(null);
      await adminApiService.deleteAdminUser(adminUser.id);
      toast({
        title: "Success",
        description: `Admin user ${adminUser.email} deleted successfully`,
      });
      loadAdminUsers();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Failed to delete admin user");
      toast({
        title: "Error",
        description:
          deleteError instanceof Error ? deleteError.message : "Failed to delete admin user",
        variant: "destructive",
      });
    }
  };

  const requirePasswordReset = async (adminUser: AdminUser) => {
    try {
      await adminApiService.requireAdminPasswordReset(adminUser.id);
      toast({
        title: "Reset required",
        description: `Password reset required for ${adminUser.email}`,
      });
    } catch (resetError) {
      toast({
        title: "Error",
        description: resetError instanceof Error ? resetError.message : "Failed",
        variant: "destructive",
      });
    }
  };

  const setTemporaryPassword = async (adminUser: AdminUser) => {
    const pwd = window.prompt(`Set temporary password for ${adminUser.email}`);
    if (!pwd) return;
    try {
      const start = await adminOpaqueService.startRegistration(pwd);
      const startResp = await adminApiService.adminUserPasswordSetStart(
        adminUser.id,
        start.request
      );
      const finish = await adminOpaqueService.finishRegistration(
        startResp.message,
        startResp.serverPublicKey,
        start.state,
        adminUser.id
      );
      const hash = await sha256Base64Url(finish.passwordKey);
      await adminApiService.adminUserPasswordSetFinish(adminUser.id, finish.request, hash);
      toast({ title: "Password set", description: "User must change on next login" });
    } catch (tempError) {
      toast({
        title: "Error",
        description: tempError instanceof Error ? tempError.message : "Failed",
        variant: "destructive",
      });
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const openAdminUser = (adminUser: AdminUser) => {
    navigate(`/settings/admin-users/${encodeURIComponent(adminUser.id)}/edit`);
  };

  const getRoleBadgeVariant = (role: string) => {
    return role === "write" ? "default" : "secondary";
  };

  return (
    <div>
      <PageHeader
        title="Admin Users"
        actions={
          <>
            <Button variant="outline" onClick={loadAdminUsers}>
              <RefreshCcw />
              Refresh
            </Button>
            <Button onClick={() => navigate("/settings/admin-users/new")}>
              <UserPlus />
              Add Admin User
            </Button>
          </>
        }
      />

      {error && <ErrorBanner withMargin>{error}</ErrorBanner>}

      <StatsGrid>
        <StatsCard
          title="Total Admin Users"
          value={totalCount.toString()}
          description="Active administrator accounts"
        />
        <StatsCard
          title="Write Access"
          value={adminUsers.filter((u) => u.role === "write").length.toString()}
          description="Admins with write permissions"
        />
        <StatsCard
          title="Read Only"
          value={adminUsers.filter((u) => u.role === "read").length.toString()}
          description="Admins with read-only access"
        />
      </StatsGrid>

      <ListCard
        title="Admin Users"
        description="Manage administrator accounts and their permissions"
        search={{
          placeholder: "Search admin users...",
          value: searchQuery,
          onChange: setSearchQuery,
        }}
      >
        {adminUsers.length === 0 ? (
          loading ? null : (
            <EmptyState
              icon={<UserPlus />}
              title="No admin users found"
              description={
                searchQuery
                  ? "Try adjusting your search query"
                  : "Add your first admin user to get started"
              }
            />
          )
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHead
                    label="Name"
                    isActive={sortBy === "name"}
                    sortOrder={sortOrder}
                    onToggle={() => toggleSort("name")}
                  />
                  <SortableTableHead
                    label="Email"
                    isActive={sortBy === "email"}
                    sortOrder={sortOrder}
                    onToggle={() => toggleSort("email")}
                  />
                  <SortableTableHead
                    label="Role"
                    isActive={sortBy === "role"}
                    sortOrder={sortOrder}
                    onToggle={() => toggleSort("role")}
                  />
                  <SortableTableHead
                    label="Created"
                    isActive={sortBy === "createdAt"}
                    sortOrder={sortOrder}
                    onToggle={() => toggleSort("createdAt")}
                  />
                  <TableHead className={tableStyles.actionCell}></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {adminUsers.map((adminUser) => (
                  <TableRow key={adminUser.id}>
                    <TableCell>
                      <button
                        type="button"
                        className={tableStyles.primaryActionButton}
                        onClick={() => openAdminUser(adminUser)}
                      >
                        <span className={tableStyles.primaryActionText}>{adminUser.name}</span>
                      </button>
                    </TableCell>
                    <TableCell>{adminUser.email}</TableCell>
                    <TableCell>
                      <Badge variant={getRoleBadgeVariant(adminUser.role)}>{adminUser.role}</Badge>
                    </TableCell>
                    <TableCell>{formatDate(adminUser.createdAt)}</TableCell>
                    <TableCell>
                      <RowActions
                        items={[
                          {
                            key: "edit",
                            label: "Edit",
                            icon: <Edit />,
                            onClick: () => openAdminUser(adminUser),
                          },
                          {
                            key: "reset",
                            label: "Reset Password",
                            icon: <KeyRound />,
                            onClick: () => {},
                            children: [
                              {
                                key: "set-temp",
                                label: "Set Temporary Password",
                                icon: <KeyRound />,
                                onClick: () => setTemporaryPassword(adminUser),
                              },
                              {
                                key: "require",
                                label: "Require Reset",
                                icon: <RotateCcw />,
                                onClick: () => requirePasswordReset(adminUser),
                              },
                            ],
                          },
                          {
                            key: "delete",
                            label: "Delete",
                            icon: <Trash2 />,
                            onClick: () => handleDeleteAdminUser(adminUser),
                            destructive: true,
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
