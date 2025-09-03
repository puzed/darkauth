import { Edit, KeyRound, RefreshCcw, RotateCcw, Trash2, UserPlus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import EmptyState from "@/components/empty-state";
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
import { useToast } from "@/hooks/use-toast";
import adminApiService, { type AdminUser } from "@/services/api";
import { sha256Base64Url } from "@/services/hash";
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

  const loadAdminUsers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await adminApiService.getAdminUsers(currentPage, 20, debouncedSearch);
      setAdminUsers(response.adminUsers);
      setTotalPages(response.pagination.totalPages);
      setTotalCount(response.pagination.total);
    } catch (error) {
      console.error("Failed to load admin users:", error);
      setError(error instanceof Error ? error.message : "Failed to load admin users");
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to load admin users",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [currentPage, debouncedSearch, toast]);

  useEffect(() => {
    loadAdminUsers();
  }, [loadAdminUsers]);

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedSearch(searchQuery), 300);
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
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to delete admin user");
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to delete admin user",
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
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed",
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
        startResp.identityU
      );
      const hash = await sha256Base64Url(finish.passwordKey);
      await adminApiService.adminUserPasswordSetFinish(adminUser.id, finish.request, hash);
      toast({ title: "Password set", description: "User must change on next login" });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed",
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

      {error && <div style={{ color: "red", marginBottom: 16 }}>{error}</div>}

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
          <table className={tableStyles.table}>
            <thead className={tableStyles.header}>
              <tr>
                <th className={tableStyles.head}>Name</th>
                <th className={tableStyles.head}>Email</th>
                <th className={tableStyles.head}>Role</th>
                <th className={tableStyles.head}>Created</th>
                <th className={`${tableStyles.head} ${tableStyles.actionCell}`}></th>
              </tr>
            </thead>
            <tbody>
              {adminUsers.map((adminUser) => (
                <tr key={adminUser.id} className={tableStyles.row}>
                  <td className={tableStyles.cell}>{adminUser.name}</td>
                  <td className={tableStyles.cell}>{adminUser.email}</td>
                  <td className={tableStyles.cell}>
                    <Badge variant={getRoleBadgeVariant(adminUser.role)}>{adminUser.role}</Badge>
                  </td>
                  <td className={tableStyles.cell}>{formatDate(adminUser.createdAt)}</td>
                  <td className={tableStyles.cell}>
                    <RowActions
                      items={[
                        {
                          key: "edit",
                          label: "Edit",
                          icon: <Edit />,
                          onClick: () => navigate(`/settings/admin-users/${adminUser.id}/edit`),
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
