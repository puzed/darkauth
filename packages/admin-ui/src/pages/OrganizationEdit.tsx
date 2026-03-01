import { Check, ChevronDown, UserPlus } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import ErrorBanner from "@/components/feedback/error-banner";
import CheckboxRow from "@/components/form/checkbox-row";
import FormActions from "@/components/layout/form-actions";
import { FormField, FormGrid } from "@/components/layout/form-grid";
import PageHeader from "@/components/layout/page-header";
import Stack from "@/components/layout/stack";
import RowActions from "@/components/row-actions";
import MutedText from "@/components/text/muted-text";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
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
import tableStyles from "@/components/ui/table.module.css";
import adminApiService, {
  type Organization,
  type OrganizationMember,
  type Role,
  type User,
} from "@/services/api";
import styles from "./OrganizationEdit.module.css";

type OrganizationPayload = Organization & {
  id?: string;
  members?: unknown;
};

type MemberPayload = Partial<OrganizationMember> & {
  id?: string;
  userId?: string;
  sub?: string;
};

const normalizeOrganizationId = (organization: OrganizationPayload, fallbackId: string): string =>
  organization.organizationId || organization.id || fallbackId;

const normalizeMembers = (members: unknown): OrganizationMember[] => {
  if (!Array.isArray(members)) {
    return [];
  }

  return members.map((raw, index) => {
    const member = (raw || {}) as MemberPayload;
    const roles = Array.isArray(member.roles)
      ? member.roles.filter((role): role is { id: string; key: string; name: string } => {
          return (
            !!role &&
            typeof role === "object" &&
            "id" in role &&
            "key" in role &&
            "name" in role &&
            typeof role.id === "string" &&
            typeof role.key === "string" &&
            typeof role.name === "string"
          );
        })
      : [];

    return {
      membershipId: member.membershipId || member.id || `${member.userSub || member.sub || index}`,
      userSub: member.userSub || member.sub || member.userId || "",
      status: member.status || "active",
      email: member.email || null,
      name: member.name || null,
      roles,
    };
  });
};

export default function OrganizationEdit() {
  const { organizationId } = useParams<{ organizationId: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [allRoles, setAllRoles] = useState<Role[]>([]);
  const [addUserOpen, setAddUserOpen] = useState(false);
  const [addUserSearch, setAddUserSearch] = useState("");
  const [debouncedAddUserSearch, setDebouncedAddUserSearch] = useState("");
  const [addUserResults, setAddUserResults] = useState<User[]>([]);
  const [addUserLoading, setAddUserLoading] = useState(false);
  const [addUserSubmittingSub, setAddUserSubmittingSub] = useState<string | null>(null);
  const [addUserError, setAddUserError] = useState<string | null>(null);
  const [addUserRoleIds, setAddUserRoleIds] = useState<string[]>([]);
  const [addUserRolesOpen, setAddUserRolesOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<OrganizationMember | null>(null);
  const [editingRoleIds, setEditingRoleIds] = useState<string[]>([]);
  const addUserRolesContainerRef = useRef<HTMLDivElement | null>(null);

  const refreshMembers = useCallback(async (orgId: string) => {
    const memberData = await adminApiService.getOrganizationMembers(orgId);
    setMembers(normalizeMembers(memberData.members));
  }, []);

  const loadData = useCallback(async () => {
    if (!organizationId) {
      setError("Organization ID is required");
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const [orgData, rolesData] = await Promise.all([
        adminApiService.getOrganization(organizationId),
        adminApiService.getRoles(),
      ]);
      const org = orgData as OrganizationPayload;
      const resolvedOrganizationId = normalizeOrganizationId(org, organizationId);
      setOrganization({
        ...org,
        organizationId: resolvedOrganizationId,
      });
      setName(org.name);
      setSlug(org.slug);
      setAllRoles(rolesData);
      const orgMembers = normalizeMembers(org.members);
      if (orgMembers.length > 0) {
        setMembers(orgMembers);
      } else {
        try {
          await refreshMembers(resolvedOrganizationId);
        } catch {
          setMembers([]);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load organization");
    } finally {
      setLoading(false);
    }
  }, [organizationId, refreshMembers]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const handle = setTimeout(() => {
      setDebouncedAddUserSearch(addUserSearch.trim());
    }, 300);
    return () => clearTimeout(handle);
  }, [addUserSearch]);

  const memberSubs = useMemo(() => new Set(members.map((member) => member.userSub)), [members]);

  const addableUsers = useMemo(
    () => addUserResults.filter((user) => !memberSubs.has(user.sub)),
    [addUserResults, memberSubs]
  );

  useEffect(() => {
    if (!addUserOpen || !organization) return;
    let cancelled = false;

    const searchUsers = async () => {
      try {
        setAddUserLoading(true);
        setAddUserError(null);
        const response = await adminApiService.getUsersPaged({
          page: 1,
          limit: 25,
          search: debouncedAddUserSearch,
        });
        if (!cancelled) {
          setAddUserResults(response.users);
        }
      } catch (e) {
        if (!cancelled) {
          setAddUserResults([]);
          setAddUserError(e instanceof Error ? e.message : "Failed to search users");
        }
      } finally {
        if (!cancelled) {
          setAddUserLoading(false);
        }
      }
    };

    searchUsers();

    return () => {
      cancelled = true;
    };
  }, [addUserOpen, debouncedAddUserSearch, organization]);

  useEffect(() => {
    if (!addUserRolesOpen) {
      return;
    }

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (addUserRolesContainerRef.current && target) {
        if (!addUserRolesContainerRef.current.contains(target)) {
          setAddUserRolesOpen(false);
        }
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setAddUserRolesOpen(false);
      }
    };

    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [addUserRolesOpen]);

  const save = async () => {
    if (!organization) return;
    try {
      setSubmitting(true);
      setError(null);
      await adminApiService.updateOrganization(organization.organizationId, {
        name,
        slug: slug.trim() || undefined,
      });
      navigate("/organizations");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save organization");
    } finally {
      setSubmitting(false);
    }
  };

  const deleteOrganization = async () => {
    if (!organization) return;
    if (!confirm(`Delete organization "${organization.name}"? This action cannot be undone.`))
      return;
    try {
      setSubmitting(true);
      setError(null);
      await adminApiService.deleteOrganization(organization.organizationId);
      navigate("/organizations");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete organization");
    } finally {
      setSubmitting(false);
    }
  };

  const closeEditRoles = () => {
    setEditingMember(null);
    setEditingRoleIds([]);
  };

  const openEditRoles = (member: OrganizationMember) => {
    setEditingMember(member);
    setEditingRoleIds(member.roles.map((role) => role.id));
  };

  const toggleEditRole = (roleId: string, checked: boolean) => {
    setEditingRoleIds((current) => {
      if (checked) {
        if (current.includes(roleId)) return current;
        return [...current, roleId];
      }
      return current.filter((id) => id !== roleId);
    });
  };

  const saveEditedRoles = async () => {
    if (!organization || !editingMember) return;
    try {
      setSubmitting(true);
      setError(null);
      await adminApiService.updateOrganizationMemberRoles(
        organization.organizationId,
        editingMember.membershipId,
        editingRoleIds
      );
      try {
        await refreshMembers(organization.organizationId);
        closeEditRoles();
      } catch {
        setError("Roles updated, but failed to refresh member list");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update member roles");
    } finally {
      setSubmitting(false);
    }
  };

  const closeAddUser = () => {
    setAddUserOpen(false);
    setAddUserSearch("");
    setDebouncedAddUserSearch("");
    setAddUserResults([]);
    setAddUserError(null);
    setAddUserRoleIds([]);
    setAddUserRolesOpen(false);
  };

  const openAddUser = () => {
    setAddUserRoleIds([]);
    setAddUserRolesOpen(false);
    setAddUserOpen(true);
    setAddUserError(null);
  };

  const toggleAddUserRole = (roleId: string) => {
    setAddUserRoleIds((current) => {
      if (current.includes(roleId)) {
        return current.filter((id) => id !== roleId);
      }
      return [...current, roleId];
    });
  };

  const addUserToOrganization = async (userSub: string) => {
    if (!organization) return;
    try {
      setAddUserSubmittingSub(userSub);
      setAddUserError(null);
      const createdMember = await adminApiService.addOrganizationMember(
        organization.organizationId,
        userSub
      );
      await adminApiService.updateOrganizationMemberRoles(
        organization.organizationId,
        createdMember.membershipId,
        addUserRoleIds
      );
      await refreshMembers(organization.organizationId);
      setAddUserSubmittingSub(null);
      closeAddUser();
    } catch (_e) {
      setAddUserError("Unable to add user to organization");
    } finally {
      setAddUserSubmittingSub(null);
    }
  };

  const removeMemberFromOrganization = async (member: OrganizationMember) => {
    if (!organization) return;
    const memberLabel = member.email || member.userSub;
    if (!confirm(`Remove "${memberLabel}" from this organization?`)) return;

    try {
      setSubmitting(true);
      setError(null);
      await adminApiService.removeOrganizationMember(
        organization.organizationId,
        member.membershipId
      );
      await refreshMembers(organization.organizationId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to remove member");
    } finally {
      setSubmitting(false);
    }
  };

  const selectedAddUserRoleLabels = useMemo(() => {
    if (addUserRoleIds.length === 0) {
      return "";
    }

    const roleNameById = new Map(allRoles.map((role) => [role.id, role.name]));
    return addUserRoleIds
      .map((roleId) => roleNameById.get(roleId))
      .filter((name): name is string => !!name)
      .join(", ");
  }, [addUserRoleIds, allRoles]);

  if (loading) return <div>Loading organization...</div>;

  if (error && !organization) {
    return (
      <div>
        <ErrorBanner withMargin>{error}</ErrorBanner>
      </div>
    );
  }

  if (!organization) return null;

  const isFormValid = name.trim().length > 0;

  return (
    <div>
      <PageHeader title="Manage Organization" subtitle={organization.name} />

      {error && <ErrorBanner withMargin>{error}</ErrorBanner>}

      <Stack>
        <Card>
          <CardHeader>
            <CardTitle>Organization Details</CardTitle>
          </CardHeader>
          <CardContent>
            <FormGrid columns={2}>
              <FormField label={<Label>Organization ID</Label>}>
                <Input value={organization.organizationId} readOnly />
              </FormField>
              <FormField label={<Label>Organization Name *</Label>}>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={submitting}
                />
              </FormField>
              <FormField label={<Label>Slug</Label>}>
                <Input
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  disabled={submitting}
                />
              </FormField>
              <FormField label={<Label>Status</Label>}>
                <Input
                  value={`${members.filter((member) => member.status === "active").length} active members`}
                  readOnly
                />
              </FormField>
            </FormGrid>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Members</CardTitle>
            <MutedText size="sm">Manage organization members and roles</MutedText>
          </CardHeader>
          <CardContent>
            <FormActions align="between" withBottomMargin>
              <Button size="sm" variant="outline" onClick={openAddUser}>
                <UserPlus size={16} />
                Add User
              </Button>
            </FormActions>

            {members.length === 0 ? (
              <MutedText size="sm" spacing="sm">
                No members found for this organization
              </MutedText>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Member</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Roles</TableHead>
                    <TableHead className={tableStyles.actionCell}></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.map((member) => (
                    <TableRow key={member.membershipId}>
                      <TableCell>
                        <button
                          type="button"
                          className={tableStyles.primaryActionButton}
                          onClick={() => openEditRoles(member)}
                        >
                          <span className={tableStyles.primaryActionText}>
                            {member.email || member.userSub}
                          </span>
                        </button>
                      </TableCell>
                      <TableCell>
                        <Badge variant={member.status === "active" ? "default" : "secondary"}>
                          {member.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className={styles.roleTags}>
                          {member.roles.length === 0 ? (
                            <span className={styles.noRoles}>No roles</span>
                          ) : (
                            member.roles.map((role) => (
                              <span key={role.id} className={styles.roleTag}>
                                {role.name}
                              </span>
                            ))
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <RowActions
                          items={[
                            {
                              key: "edit-roles",
                              label: "Edit Roles",
                              disabled: submitting,
                              onClick: () => openEditRoles(member),
                            },
                            {
                              key: "remove-member",
                              label: "Remove from organization",
                              destructive: true,
                              disabled: submitting,
                              onClick: () => removeMemberFromOrganization(member),
                            },
                          ]}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </Stack>

      <FormActions withMargin>
        <Button variant="outline" onClick={deleteOrganization} disabled={submitting}>
          Delete Organization
        </Button>
        <Button onClick={save} disabled={submitting || !isFormValid}>
          {submitting ? "Saving..." : "Save Changes"}
        </Button>
      </FormActions>

      <Dialog
        open={addUserOpen}
        onOpenChange={(open) => {
          if (!open) {
            if (addUserSubmittingSub) return;
            closeAddUser();
            return;
          }
          openAddUser();
        }}
      >
        <DialogContent style={{ maxWidth: 560 }}>
          <DialogHeader>
            <DialogTitle>Add User</DialogTitle>
            <DialogDescription>
              Search users by name, email, or subject and add them to this organization.
            </DialogDescription>
          </DialogHeader>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {allRoles.length > 0 && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}
              >
                <div className={styles.addUserRoleSelectContainer} ref={addUserRolesContainerRef}>
                  <div className={styles.addUserRoleHeader}>
                    <Label>Roles to assign</Label>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={!!addUserSubmittingSub}
                      className={styles.addUserRoleSelectTrigger}
                      onClick={() => setAddUserRolesOpen((open) => !open)}
                    >
                      <span className={styles.addUserRoleSelectValue}>
                        {selectedAddUserRoleLabels || "Select roles"}
                      </span>
                      <ChevronDown size={14} />
                    </Button>
                  </div>
                  {addUserRolesOpen && (
                    <div className={styles.addUserRoleSelectPopover}>
                      <Command>
                        <CommandInput placeholder="Search roles..." />
                        <CommandList>
                          <CommandEmpty>No roles found</CommandEmpty>
                          <CommandGroup>
                            {allRoles.map((role) => {
                              const selected = addUserRoleIds.includes(role.id);
                              return (
                                <CommandItem
                                  key={role.id}
                                  onSelect={() => toggleAddUserRole(role.id)}
                                  className={styles.addUserRoleSelectItem}
                                >
                                  <span>{role.name}</span>
                                  {selected && <Check size={14} />}
                                </CommandItem>
                              );
                            })}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </div>
                  )}
                </div>
              </div>
            )}
            <div className={styles.addUserListSection}>
              <Input
                value={addUserSearch}
                onChange={(e) => setAddUserSearch(e.target.value)}
                placeholder="Search users..."
                disabled={!!addUserSubmittingSub}
              />
              {addUserError && <ErrorBanner>{addUserError}</ErrorBanner>}
              {addUserLoading ? (
                <MutedText size="sm">Searching users...</MutedText>
              ) : addableUsers.length === 0 ? (
                <MutedText size="sm">No users found</MutedText>
              ) : (
                <div className={styles.addUserList}>
                  {addableUsers.map((user) => (
                    <div key={user.sub} className={styles.addUserListItem}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 500 }}>{user.email}</div>
                        <MutedText size="sm">
                          {user.name ? `${user.name} · ${user.sub}` : user.sub}
                        </MutedText>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => addUserToOrganization(user.sub)}
                        disabled={!!addUserSubmittingSub}
                      >
                        {addUserSubmittingSub === user.sub ? "Adding..." : "Add"}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeAddUser} disabled={!!addUserSubmittingSub}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!editingMember}
        onOpenChange={(open) => {
          if (!open && !submitting) {
            closeEditRoles();
          }
        }}
      >
        <DialogContent style={{ maxWidth: 520 }}>
          <DialogHeader>
            <DialogTitle>Edit Roles</DialogTitle>
            <DialogDescription>
              {editingMember?.email || editingMember?.userSub || "Member"}
            </DialogDescription>
          </DialogHeader>
          {allRoles.length === 0 ? (
            <MutedText size="sm">No roles available</MutedText>
          ) : (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 12,
                maxHeight: 320,
                overflowY: "auto",
              }}
            >
              {allRoles.map((role) => {
                const id = `role-${editingMember?.membershipId || "member"}-${role.id}`;
                return (
                  <CheckboxRow
                    key={role.id}
                    id={id}
                    label={role.name}
                    checked={editingRoleIds.includes(role.id)}
                    disabled={submitting}
                    onCheckedChange={(checked) => toggleEditRole(role.id, checked)}
                  />
                );
              })}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={closeEditRoles} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={saveEditedRoles} disabled={submitting || !editingMember}>
              {submitting ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
