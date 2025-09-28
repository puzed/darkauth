import {
  Edit,
  Filter,
  KeyRound,
  RefreshCcw,
  RotateCcw,
  Trash2,
  UserPlus,
  Users as UsersIcon,
} from "lucide-react";
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
import UserCell from "@/components/user/user-cell";
import adminApiService, { type Group, type User } from "@/services/api";
import { sha256Base64Url } from "@/services/hash";
import { logger } from "@/services/logger";
import adminOpaqueService from "@/services/opaque-cloudflare";

interface UserWithDetails extends User {
  groups?: string[];
  permissions?: string[];
  otp?: { enabled: boolean; pending: boolean; verified: boolean };
}

export default function Users() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [users, setUsers] = useState<UserWithDetails[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const loadUsers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await adminApiService.getUsersPaged(currentPage, 20, debouncedSearch);
      const base = response.users as UserWithDetails[];
      const enriched = await Promise.all(
        base.map(async (u) => {
          try {
            const s = await adminApiService.getUserOtpStatus(u.sub);
            return {
              ...u,
              otp: { enabled: !!s.enabled, pending: !!s.pending, verified: !!s.verified },
            };
          } catch {
            return { ...u };
          }
        })
      );
      setUsers(enriched);
      setTotalPages(response.pagination.totalPages);
      setTotalCount(response.pagination.total);
    } catch (error) {
      logger.error(error, "Failed to load users");
      setError(error instanceof Error ? error.message : "Failed to load users");
    } finally {
      setLoading(false);
    }
  }, [currentPage, debouncedSearch]);

  const loadGroupsAndPermissions = useCallback(async () => {
    try {
      const [groupsData] = await Promise.all([adminApiService.getGroups()]);
      setGroups(groupsData);
    } catch (error) {
      logger.error(error, "Failed to load groups");
    }
  }, []);

  useEffect(() => {
    loadUsers();
    loadGroupsAndPermissions();
  }, [loadUsers, loadGroupsAndPermissions]);

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(handle);
  }, [searchQuery]);

  const handleDeleteUser = async (user: User) => {
    if (!confirm(`Delete user ${user.email || user.sub}?`)) return;
    try {
      setError(null);
      await adminApiService.deleteUser(user.sub);
      setUsers((prev) => prev.filter((u) => u.sub !== user.sub));
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to delete user");
    }
  };

  const requirePasswordReset = async (user: User) => {
    try {
      await adminApiService.requireUserPasswordReset(user.sub);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to mark reset");
    }
  };

  const setTemporaryPassword = async (user: User) => {
    const pwd = window.prompt(`Set temporary password for ${user.email}`);
    if (!pwd) return;
    try {
      const start = await adminOpaqueService.startRegistration(pwd);
      const startResp = await adminApiService.userPasswordSetStart(user.sub, start.request);
      const finish = await adminOpaqueService.finishRegistration(
        startResp.message,
        startResp.serverPublicKey,
        start.state,
        startResp.identityU
      );
      const hash = await sha256Base64Url(finish.passwordKey);
      await adminApiService.userPasswordSetFinish(user.sub, finish.request, hash);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to set password");
    }
  };

  const removeOtp = async (user: User) => {
    try {
      await adminApiService.deleteUserOtp(user.sub);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to remove OTP");
    }
  };

  const unlockOtp = async (user: User) => {
    try {
      await adminApiService.unlockUserOtp(user.sub);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to unlock OTP");
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  if (loading && users.length === 0) return null;

  return (
    <div>
      <PageHeader
        title="Users"
        subtitle="Manage user accounts and permissions"
        actions={
          <>
            <Button variant="outline" onClick={loadUsers}>
              <RefreshCcw />
              Refresh
            </Button>
            <Button onClick={() => navigate("/users/new")}>
              <UserPlus />
              Add User
            </Button>
          </>
        }
      />

      {error && <div>{error}</div>}

      <StatsGrid>
        <StatsCard
          title="Total Users"
          icon={<UsersIcon size={16} />}
          value={totalCount}
          description="Registered users"
        />
        <StatsCard title="Groups" value={groups.length} description="Total groups" />
      </StatsGrid>

      {/* Users Table */}
      <ListCard
        title="User Management"
        description="View and manage all user accounts"
        search={{ placeholder: "Search users...", value: searchQuery, onChange: setSearchQuery }}
        rightActions={
          <Button variant="outline" size="icon">
            <Filter size={16} />
          </Button>
        }
      >
        {users.length === 0 ? (
          <EmptyState
            icon={<UsersIcon />}
            title="No Users Found"
            description={
              searchQuery ? "Try adjusting your search" : "No users have been registered yet"
            }
          />
        ) : (
          <table className={tableStyles.table}>
            <thead className={tableStyles.header}>
              <tr>
                <th className={tableStyles.head}>User</th>
                <th className={tableStyles.head}>Email</th>
                <th className={tableStyles.head}>Groups</th>
                <th className={tableStyles.head}>Security</th>
                <th className={tableStyles.head}>Created</th>
                <th className={`${tableStyles.head} ${tableStyles.actionCell}`}></th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.sub} className={tableStyles.row}>
                  <td className={tableStyles.cell}>
                    <UserCell name={user.name} email={user.email} sub={user.sub} />
                  </td>
                  <td className={tableStyles.cell}>{user.email}</td>
                  <td className={tableStyles.cell}>
                    {user.groups && user.groups.length > 0 ? (
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                        {user.groups.slice(0, 2).map((groupKey) => (
                          <Badge key={groupKey}>
                            {groups.find((g) => g.key === groupKey)?.name || groupKey}
                          </Badge>
                        ))}
                        {user.groups.length > 2 && <Badge>+{user.groups.length - 2}</Badge>}
                      </div>
                    ) : (
                      <span style={{ color: "hsl(var(--muted-foreground))" }}>No groups</span>
                    )}
                  </td>
                  <td className={tableStyles.cell}>
                    {user.otp?.enabled ? (
                      <Badge>OTP</Badge>
                    ) : user.otp?.pending ? (
                      <Badge variant="secondary">OTP Pending</Badge>
                    ) : (
                      <span style={{ color: "hsl(var(--muted-foreground))" }}>None</span>
                    )}
                  </td>
                  <td className={tableStyles.cell}>{formatDate(user.createdAt)}</td>
                  <td className={tableStyles.cell}>
                    <RowActions
                      items={[
                        {
                          key: "edit",
                          label: "Edit User",
                          icon: <Edit className="h-4 w-4" />,
                          onClick: () => navigate(`/users/${user.sub}`),
                        },
                        {
                          key: "reset",
                          label: "Reset Password",
                          icon: <KeyRound className="h-4 w-4" />,
                          onClick: () => {},
                          children: [
                            {
                              key: "set-temp",
                              label: "Set Temporary Password",
                              icon: <KeyRound className="h-4 w-4" />,
                              onClick: () => setTemporaryPassword(user),
                            },
                            {
                              key: "require",
                              label: "Require Reset",
                              icon: <RotateCcw className="h-4 w-4" />,
                              onClick: () => requirePasswordReset(user),
                            },
                          ],
                        },
                        {
                          key: "otp",
                          label: "OTP",
                          icon: <KeyRound className="h-4 w-4" />,
                          onClick: () => {},
                          children: [
                            {
                              key: "otp-remove",
                              label: "Remove OTP",
                              icon: <RotateCcw className="h-4 w-4" />,
                              onClick: () => removeOtp(user),
                            },
                            {
                              key: "otp-unlock",
                              label: "Unlock OTP",
                              icon: <RefreshCcw className="h-4 w-4" />,
                              onClick: () => unlockOtp(user),
                            },
                          ],
                        },
                        {
                          key: "delete",
                          label: "Delete User",
                          icon: <Trash2 className="h-4 w-4" />,
                          destructive: true,
                          onClick: () => handleDeleteUser(user),
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
