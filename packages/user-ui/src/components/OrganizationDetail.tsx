import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import apiService, {
  type ConnectedIdentityResponse,
  type OrganizationMember,
  type OrganizationRole,
  type UserOrganization,
} from "../services/api";
import Button from "./Button";
import EnterpriseConnections from "./EnterpriseConnections";
import styles from "./OrganizationDetail.module.css";
import { cx, EmptyState, PortalHeader, PortalPage, PortalSection, StatusPill } from "./Portal";
import UserLayout from "./UserLayout";

interface OrganizationDetailProps {
  sessionData: {
    sub: string;
    name?: string;
    email?: string;
    organizationId?: string;
  };
  onLogout: () => void;
  onOrganizationChanged?: (organization: {
    organizationId: string;
    organizationSlug?: string;
  }) => void;
}

type Tab = "members" | "roles" | "enterprise" | "security";

function identityName(identity: ConnectedIdentityResponse) {
  return identity.connectionName || identity.connection_name || identity.issuer || "Enterprise SSO";
}

export default function OrganizationDetail({
  sessionData,
  onLogout,
  onOrganizationChanged,
}: OrganizationDetailProps) {
  const { organizationId = "" } = useParams<{ organizationId: string }>();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("members");
  const [organization, setOrganization] = useState<UserOrganization | null>(null);
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [assignableRoles, setAssignableRoles] = useState<OrganizationRole[]>([]);
  const [connectedIdentities, setConnectedIdentities] = useState<ConnectedIdentityResponse[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRoleIds, setInviteRoleIds] = useState<string[]>([]);
  const [roleSelectionByMember, setRoleSelectionByMember] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!organizationId) {
      setError("Organization is required.");
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const [orgResponse, memberResponse, roles, identities] = await Promise.all([
        apiService.getOrganization(organizationId),
        apiService.getOrganizationMembers(organizationId).catch(() => ({ members: [] })),
        apiService.getAssignableOrganizationRoles(organizationId).catch(() => []),
        apiService.getConnectedIdentities().catch(() => []),
      ]);
      setOrganization(orgResponse.organization);
      setMembers(memberResponse.members || []);
      setAssignableRoles(roles);
      setConnectedIdentities(identities);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load organization.");
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const current = organization?.organizationId === sessionData.organizationId;
  const roleOptionsById = useMemo(
    () => new Map(assignableRoles.map((role) => [role.id, role])),
    [assignableRoles]
  );

  const adminMemberCount = useMemo(
    () => members.filter((member) => member.roles.some((role) => role.grantsOrgManage)).length,
    [members]
  );

  const memberInitials = (member: OrganizationMember) => {
    const source = (member.name || member.email || member.userSub || "").trim();
    if (!source) return "?";
    const parts = source.split(/\s+/).filter(Boolean);
    const letters =
      parts.length >= 2 ? `${parts[0][0]}${parts[parts.length - 1][0]}` : source.slice(0, 2);
    return letters.toUpperCase();
  };

  const isLastAdminRole = (member: OrganizationMember, role: OrganizationRole) => {
    if (!role.grantsOrgManage) return false;
    if (adminMemberCount > 1) return false;
    const adminRolesForMember = member.roles.filter((item) => item.grantsOrgManage).length;
    return adminRolesForMember <= 1;
  };

  const isLastAdminMember = (member: OrganizationMember) =>
    adminMemberCount <= 1 && member.roles.some((role) => role.grantsOrgManage);

  const switchToOrganization = async () => {
    if (!organization) return;
    try {
      setSubmitting(true);
      setError(null);
      const response = await apiService.setSessionOrganization(organization.organizationId);
      onOrganizationChanged?.(response);
    } catch (switchError) {
      setError(
        switchError instanceof Error ? switchError.message : "Unable to switch organization."
      );
    } finally {
      setSubmitting(false);
    }
  };

  const createInvite = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!organization || !inviteEmail.trim()) return;
    try {
      setSubmitting(true);
      setError(null);
      setMessage(null);
      await apiService.createOrganizationInvite(organization.organizationId, {
        email: inviteEmail.trim(),
        roleIds: inviteRoleIds,
      });
      setInviteEmail("");
      setInviteRoleIds([]);
      setMessage("Invite created.");
    } catch (inviteError) {
      setError(inviteError instanceof Error ? inviteError.message : "Unable to create invite.");
    } finally {
      setSubmitting(false);
    }
  };

  const assignRole = async (member: OrganizationMember) => {
    if (!organization) return;
    const roleId = roleSelectionByMember[member.membershipId];
    if (!roleId) return;
    try {
      setSubmitting(true);
      setError(null);
      await apiService.assignOrganizationMemberRoles(
        organization.organizationId,
        member.membershipId,
        [roleId]
      );
      setRoleSelectionByMember((current) => ({ ...current, [member.membershipId]: "" }));
      await loadData();
    } catch (assignError) {
      setError(assignError instanceof Error ? assignError.message : "Unable to assign role.");
    } finally {
      setSubmitting(false);
    }
  };

  const removeRole = async (member: OrganizationMember, role: OrganizationRole) => {
    if (!organization) return;
    try {
      setSubmitting(true);
      setError(null);
      await apiService.removeOrganizationMemberRole(
        organization.organizationId,
        member.membershipId,
        role.id
      );
      await loadData();
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "Unable to remove role.");
    } finally {
      setSubmitting(false);
    }
  };

  const removeMember = async (member: OrganizationMember) => {
    if (!organization) return;
    const label = member.email || member.userSub;
    if (!window.confirm(`Remove ${label} from ${organization.name}?`)) return;
    try {
      setSubmitting(true);
      setError(null);
      await apiService.removeOrganizationMember(organization.organizationId, member.membershipId);
      await loadData();
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "Unable to remove member.");
    } finally {
      setSubmitting(false);
    }
  };

  const leaveOrganization = async () => {
    if (!organization) return;
    if (!window.confirm(`Leave ${organization.name}?`)) return;
    try {
      setSubmitting(true);
      setError(null);
      await apiService.leaveOrganization(organization.organizationId);
      navigate("/profile", { replace: true });
    } catch (leaveError) {
      setError(leaveError instanceof Error ? leaveError.message : "Unable to leave organization.");
    } finally {
      setSubmitting(false);
    }
  };

  const deleteOrganization = async () => {
    if (!organization) return;
    if (!window.confirm(`Delete ${organization.name}? This action cannot be undone.`)) return;
    try {
      setSubmitting(true);
      setError(null);
      await apiService.deleteOrganization(organization.organizationId);
      navigate("/profile", { replace: true });
    } catch (deleteError) {
      setError(
        deleteError instanceof Error ? deleteError.message : "Unable to delete organization."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <UserLayout userName={sessionData.name} userEmail={sessionData.email} onLogout={onLogout}>
      <PortalPage>
        <PortalHeader
          eyebrow="Organization"
          title={organization?.name || "Organization"}
          description={organization?.slug}
          actions={
            <>
              <Button type="button" variant="secondary" onClick={() => navigate("/profile")}>
                Back
              </Button>
              {organization && !current ? (
                <Button type="button" variant="primary" onClick={switchToOrganization}>
                  Use organization
                </Button>
              ) : null}
            </>
          }
        />

        {error ? <p className={styles.error}>{error}</p> : null}
        {message ? <p className={styles.success}>{message}</p> : null}

        <div className={styles.tabs}>
          {(["members", "roles", "enterprise", "security"] as Tab[]).map((item) => (
            <button
              key={item}
              type="button"
              className={cx(styles.tab, tab === item && styles.tabActive)}
              onClick={() => setTab(item)}
            >
              {item === "enterprise"
                ? "Enterprise Connections"
                : item.slice(0, 1).toUpperCase() + item.slice(1)}
            </button>
          ))}
        </div>

        {loading ? (
          <EmptyState title="Loading organization" text="Fetching organization details." />
        ) : !organization ? (
          <EmptyState
            title="Organization unavailable"
            text="This organization could not be opened."
          />
        ) : tab === "members" ? (
          <PortalSection
            id="organization-members"
            title="Members"
            description={`${members.length} member${members.length === 1 ? "" : "s"}`}
          >
            <form className={styles.invite} onSubmit={createInvite}>
              <div className={styles.inviteFields}>
                <label className={styles.field}>
                  <span>Email</span>
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(event) => setInviteEmail(event.target.value)}
                    placeholder="teammate@example.com"
                  />
                </label>
                {assignableRoles.length > 0 ? (
                  <label className={styles.field}>
                    <span>Invite role</span>
                    <select
                      value={inviteRoleIds[0] || ""}
                      onChange={(event) =>
                        setInviteRoleIds(event.target.value ? [event.target.value] : [])
                      }
                    >
                      <option value="">No role</option>
                      {assignableRoles.map((role) => (
                        <option key={role.id} value={role.id}>
                          {role.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
              </div>
              <Button type="submit" variant="primary" disabled={submitting || !inviteEmail.trim()}>
                Invite
              </Button>
            </form>

            <div className={styles.grid}>
              {members.length === 0 ? (
                <EmptyState
                  title="No members"
                  text="No members are visible for this organization."
                />
              ) : (
                members.map((member) => {
                  const isSelf = member.userSub === sessionData.sub;
                  const lastAdmin = isLastAdminMember(member);
                  const availableRoles = assignableRoles.filter(
                    (role) => !member.roles.some((assigned) => assigned.id === role.id)
                  );
                  return (
                    <div key={member.membershipId} className={styles.member}>
                      <div className={styles.memberHeader}>
                        <div className={styles.memberIdentity}>
                          <span className={styles.avatar} aria-hidden="true">
                            {memberInitials(member)}
                          </span>
                          <div className={styles.memberTitle}>
                            <strong>{member.name || member.email || member.userSub}</strong>
                            {member.email && member.name ? <small>{member.email}</small> : null}
                          </div>
                        </div>
                        <div className={styles.memberMeta}>
                          <StatusPill tone={member.status === "active" ? "ready" : "neutral"}>
                            {member.status}
                          </StatusPill>
                          {isSelf ? <span className={styles.youTag}>You</span> : null}
                          {!isSelf ? (
                            <Button
                              type="button"
                              variant="secondary"
                              disabled={submitting || lastAdmin}
                              title={
                                lastAdmin
                                  ? "Promote another administrator before removing this member."
                                  : undefined
                              }
                              onClick={() => removeMember(member)}
                            >
                              Remove
                            </Button>
                          ) : null}
                        </div>
                      </div>
                      <div className={styles.roleList}>
                        {member.roles.length === 0 ? (
                          <span className={styles.muted}>No roles</span>
                        ) : (
                          member.roles.map((role) => {
                            const lockedAdmin = isLastAdminRole(member, role);
                            const canRemove =
                              !submitting && roleOptionsById.has(role.id) && !lockedAdmin;
                            return (
                              <span
                                key={role.id}
                                className={cx(
                                  styles.role,
                                  role.grantsOrgManage && styles.roleAdmin
                                )}
                              >
                                {role.name}
                                {roleOptionsById.has(role.id) ? (
                                  <button
                                    type="button"
                                    aria-label={`Remove ${role.name} role`}
                                    title={
                                      lockedAdmin
                                        ? "The organization must keep at least one administrator."
                                        : `Remove ${role.name}`
                                    }
                                    disabled={!canRemove}
                                    onClick={() => removeRole(member, role)}
                                  >
                                    ×
                                  </button>
                                ) : null}
                              </span>
                            );
                          })
                        )}
                      </div>
                      {availableRoles.length > 0 ? (
                        <div className={styles.roleAdd}>
                          <select
                            aria-label="Add role"
                            value={roleSelectionByMember[member.membershipId] || ""}
                            onChange={(event) =>
                              setRoleSelectionByMember((current) => ({
                                ...current,
                                [member.membershipId]: event.target.value,
                              }))
                            }
                          >
                            <option value="">Add a role…</option>
                            {availableRoles.map((role) => (
                              <option key={role.id} value={role.id}>
                                {role.name}
                              </option>
                            ))}
                          </select>
                          <Button
                            type="button"
                            variant="secondary"
                            disabled={submitting || !roleSelectionByMember[member.membershipId]}
                            onClick={() => assignRole(member)}
                          >
                            Add
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  );
                })
              )}
            </div>
          </PortalSection>
        ) : tab === "roles" ? (
          <PortalSection
            id="organization-roles"
            title="Roles"
            description={`${assignableRoles.length} assignable role${
              assignableRoles.length === 1 ? "" : "s"
            }`}
          >
            <div className={styles.roleList}>
              {assignableRoles.length === 0 ? (
                <span className={styles.muted}>No assignable roles are visible.</span>
              ) : (
                assignableRoles.map((role) => (
                  <span key={role.id} className={styles.role}>
                    {role.name}
                  </span>
                ))
              )}
            </div>
          </PortalSection>
        ) : tab === "enterprise" ? (
          <PortalSection
            id="organization-enterprise"
            title="Enterprise Connections"
            description="SSO and directory provisioning for this organization"
          >
            {connectedIdentities.length > 0 ? (
              <div className={styles.connectionGrid}>
                <div className={styles.connection}>
                  <strong>Your connected identities</strong>
                  {connectedIdentities.map((identity) => (
                    <span key={identity.id} className={styles.muted}>
                      {identityName(identity)}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
            <EnterpriseConnections organizationId={organization.organizationId} />
          </PortalSection>
        ) : (
          <PortalSection
            id="organization-security"
            title="Security"
            description={organization.forceOtp ? "OTP is required." : "Default security policy."}
          >
            <div className={styles.connectionGrid}>
              <div className={styles.connection}>
                <strong>Active session</strong>
                <StatusPill tone={current ? "ready" : "neutral"}>
                  {current ? "Current" : "Available"}
                </StatusPill>
              </div>
              <div className={styles.connection}>
                <strong>Organization actions</strong>
                <div className={styles.inlineForm}>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={submitting}
                    onClick={leaveOrganization}
                  >
                    Leave
                  </Button>
                  <Button
                    type="button"
                    variant="danger"
                    disabled={submitting}
                    onClick={deleteOrganization}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            </div>
          </PortalSection>
        )}
      </PortalPage>
    </UserLayout>
  );
}
