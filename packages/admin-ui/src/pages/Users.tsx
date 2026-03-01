import { Edit, KeyRound, RotateCcw, Trash2, UserPlus, Users as UsersIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import EmptyState from "@/components/empty-state";
import ErrorBanner from "@/components/feedback/error-banner";
import PageHeader from "@/components/layout/page-header";
import ListCard from "@/components/list/list-card";
import RowActions from "@/components/row-actions";
import rowActionsStyles from "@/components/row-actions.module.css";
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
import UserCell from "@/components/user/user-cell";
import { cn } from "@/lib/utils";
import adminApiService, { type Group, type SortOrder, type User } from "@/services/api";
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
  const [sortBy, setSortBy] = useState("createdAt");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [openActionsRowSub, setOpenActionsRowSub] = useState<string | null>(null);
  const [rowActionsInFlight, setRowActionsInFlight] = useState<Record<string, boolean>>({});
  const rowActionsInFlightRef = useRef(new Set<string>());

  const toggleSort = (field: string) => {
    setCurrentPage(1);
    if (sortBy === field) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortBy(field);
    setSortOrder("asc");
  };

  const loadUsers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await adminApiService.getUsersPaged({
        page: currentPage,
        limit: 20,
        search: debouncedSearch,
        sortBy,
        sortOrder,
      });
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
    } catch (loadError) {
      logger.error(loadError, "Failed to load users");
      setError(loadError instanceof Error ? loadError.message : "Failed to load users");
    } finally {
      setLoading(false);
    }
  }, [currentPage, debouncedSearch, sortBy, sortOrder]);

  const loadGroupsAndPermissions = useCallback(async () => {
    try {
      const [groupsData] = await Promise.all([adminApiService.getGroups()]);
      setGroups(groupsData);
    } catch (loadError) {
      logger.error(loadError, "Failed to load groups");
    }
  }, []);

  useEffect(() => {
    loadUsers();
    loadGroupsAndPermissions();
  }, [loadUsers, loadGroupsAndPermissions]);

  useEffect(() => {
    const handle = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(handle);
  }, [searchQuery]);

  const runUserRowAction = useCallback(async (sub: string, action: () => Promise<void>) => {
    if (rowActionsInFlightRef.current.has(sub)) return;
    rowActionsInFlightRef.current.add(sub);
    setRowActionsInFlight((prev) => ({ ...prev, [sub]: true }));
    try {
      await action();
    } finally {
      rowActionsInFlightRef.current.delete(sub);
      setRowActionsInFlight((prev) => {
        if (!prev[sub]) return prev;
        const { [sub]: _removed, ...rest } = prev;
        return rest;
      });
    }
  }, []);

  const handleDeleteUser = async (user: User) => {
    if (!confirm(`Delete user ${user.email || user.sub}?`)) return;
    await runUserRowAction(user.sub, async () => {
      try {
        setError(null);
        await adminApiService.deleteUser(user.sub);
        setUsers((prev) => prev.filter((u) => u.sub !== user.sub));
      } catch (deleteError) {
        setError(deleteError instanceof Error ? deleteError.message : "Failed to delete user");
      }
    });
  };

  const requirePasswordReset = async (user: User) => {
    await runUserRowAction(user.sub, async () => {
      try {
        await adminApiService.requireUserPasswordReset(user.sub);
      } catch (resetError) {
        setError(resetError instanceof Error ? resetError.message : "Failed to mark reset");
      }
    });
  };

  const setTemporaryPassword = async (user: User) => {
    await runUserRowAction(user.sub, async () => {
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
      } catch (setError) {
        setError(setError instanceof Error ? setError.message : "Failed to set password");
      }
    });
  };

  const removeOtp = async (user: User) => {
    await runUserRowAction(user.sub, async () => {
      try {
        await adminApiService.deleteUserOtp(user.sub);
      } catch (otpError) {
        setError(otpError instanceof Error ? otpError.message : "Failed to remove OTP");
      }
    });
  };

  const unlockOtp = async (user: User) => {
    await runUserRowAction(user.sub, async () => {
      try {
        await adminApiService.unlockUserOtp(user.sub);
      } catch (otpError) {
        setError(otpError instanceof Error ? otpError.message : "Failed to unlock OTP");
      }
    });
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const openUser = (user: User) => {
    navigate(`/users/${encodeURIComponent(user.sub)}`);
  };

  if (loading && users.length === 0) return null;

  return (
    <div>
      <PageHeader
        title="Users"
        subtitle="Manage user accounts and permissions"
        actions={
          <Button onClick={() => navigate("/users/new")}>
            <UserPlus />
            Add User
          </Button>
        }
      />

      {error && <ErrorBanner>{error}</ErrorBanner>}

      <StatsGrid>
        <StatsCard
          title="Total Users"
          icon={<UsersIcon size={16} />}
          value={totalCount}
          description="Registered users"
        />
        <StatsCard title="Groups" value={groups.length} description="Total groups" />
      </StatsGrid>

      <ListCard
        title="User Management"
        description="View and manage all user accounts"
        search={{ placeholder: "Search users...", value: searchQuery, onChange: setSearchQuery }}
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
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHead
                    label="User"
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
                  <TableHead>Groups</TableHead>
                  <TableHead>Security</TableHead>
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
                {users.map((user) => {
                  const isRowActionInFlight = !!rowActionsInFlight[user.sub];
                  return (
                    <TableRow
                      key={user.sub}
                      className={cn(openActionsRowSub === user.sub && rowActionsStyles.rowActive)}
                    >
                      <TableCell>
                        <button
                          type="button"
                          className={tableStyles.primaryActionButton}
                          onClick={() => openUser(user)}
                        >
                          <UserCell name={user.name} email={user.email} sub={user.sub} />
                        </button>
                      </TableCell>
                      <TableCell>{user.email}</TableCell>
                      <TableCell>
                        {user.groups && user.groups.length > 0 ? (
                          <div style={{ display: "inline-flex", gap: 4 }}>
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
                      </TableCell>
                      <TableCell>
                        {user.otp?.enabled ? (
                          <Badge>OTP</Badge>
                        ) : user.otp?.pending ? (
                          <Badge variant="secondary">OTP Pending</Badge>
                        ) : (
                          <span style={{ color: "hsl(var(--muted-foreground))" }}>None</span>
                        )}
                      </TableCell>
                      <TableCell>{formatDate(user.createdAt)}</TableCell>
                      <TableCell>
                        <RowActions
                          open={openActionsRowSub === user.sub}
                          onOpenChange={(open) => setOpenActionsRowSub(open ? user.sub : null)}
                          items={[
                            {
                              key: "edit",
                              label: "Edit User",
                              icon: <Edit className="h-4 w-4" />,
                              disabled: isRowActionInFlight,
                              onClick: () => openUser(user),
                            },
                            {
                              key: "reset",
                              label: "Reset Password",
                              icon: <KeyRound className="h-4 w-4" />,
                              disabled: isRowActionInFlight,
                              onClick: () => {},
                              children: [
                                {
                                  key: "set-temp",
                                  label: "Set Temporary Password",
                                  icon: <KeyRound className="h-4 w-4" />,
                                  disabled: isRowActionInFlight,
                                  onClick: () => setTemporaryPassword(user),
                                },
                                {
                                  key: "require",
                                  label: "Require Reset",
                                  icon: <RotateCcw className="h-4 w-4" />,
                                  disabled: isRowActionInFlight,
                                  onClick: () => requirePasswordReset(user),
                                },
                              ],
                            },
                            {
                              key: "otp",
                              label: "OTP",
                              icon: <KeyRound className="h-4 w-4" />,
                              disabled: isRowActionInFlight,
                              onClick: () => {},
                              children: [
                                {
                                  key: "otp-remove",
                                  label: "Remove OTP",
                                  icon: <RotateCcw className="h-4 w-4" />,
                                  disabled: isRowActionInFlight,
                                  onClick: () => removeOtp(user),
                                },
                                {
                                  key: "otp-unlock",
                                  label: "Unlock OTP",
                                  icon: <RotateCcw className="h-4 w-4" />,
                                  disabled: isRowActionInFlight,
                                  onClick: () => unlockOtp(user),
                                },
                              ],
                            },
                            {
                              key: "delete",
                              label: "Delete User",
                              icon: <Trash2 className="h-4 w-4" />,
                              destructive: true,
                              disabled: isRowActionInFlight,
                              onClick: () => handleDeleteUser(user),
                            },
                          ]}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
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
