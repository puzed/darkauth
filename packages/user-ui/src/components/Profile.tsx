import { Plus } from "lucide-react";
import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import apiService, { type UserOrganization, type UserProfile } from "../services/api";
import Button from "./Button";
import { cx, PortalHeader, PortalPage, PortalSection, StatusPill } from "./Portal";
import styles from "./Profile.module.css";
import UserLayout from "./UserLayout";

interface ProfileProps {
  sessionData: {
    sub: string;
    name?: string;
    email?: string;
    signInEmail?: string | null;
    organizationId?: string;
    organizationSlug?: string;
  };
  onLogout: () => void;
  onOrganizationChanged?: (organization: {
    organizationId: string;
    organizationSlug?: string;
  }) => void;
  onProfileChanged?: (profile: {
    name?: string | null;
    email?: string | null;
    signInEmail?: string | null;
  }) => void;
}

type EditingField = "name" | "email" | null;

function profileFromSession(sessionData: ProfileProps["sessionData"]): UserProfile {
  return {
    sub: sessionData.sub,
    email: sessionData.email || null,
    name: sessionData.name || null,
    emailVerified: undefined,
    pendingEmail: null,
    pendingEmailSetAt: null,
    signInEmail: sessionData.signInEmail || sessionData.email || null,
  };
}

function displayDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function isEmailLike(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export default function Profile({
  sessionData,
  onLogout,
  onOrganizationChanged,
  onProfileChanged,
}: ProfileProps) {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<UserProfile>(() => profileFromSession(sessionData));
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [editingField, setEditingField] = useState<EditingField>(null);
  const [nameDraft, setNameDraft] = useState(sessionData.name || "");
  const [emailDraft, setEmailDraft] = useState("");
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [savingName, setSavingName] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [resendingEmail, setResendingEmail] = useState(false);
  const [cancelingEmail, setCancelingEmail] = useState(false);
  const [organizations, setOrganizations] = useState<UserOrganization[]>([]);
  const [loadingOrganizations, setLoadingOrganizations] = useState(true);
  const [copied, setCopied] = useState(false);
  const [showCreateOrg, setShowCreateOrg] = useState(false);
  const [newOrgName, setNewOrgName] = useState("");
  const [newOrgSlug, setNewOrgSlug] = useState("");
  const [organizationError, setOrganizationError] = useState<string | null>(null);
  const [creatingOrganization, setCreatingOrganization] = useState(false);

  const loadProfile = useCallback(async () => {
    const latestProfile = await apiService.getProfile();
    setProfile(latestProfile);
    onProfileChanged?.({
      name: latestProfile.name,
      email: latestProfile.email,
      signInEmail: latestProfile.signInEmail,
    });
    return latestProfile;
  }, [onProfileChanged]);

  useEffect(() => {
    setProfile((current) => ({ ...profileFromSession(sessionData), ...current }));
  }, [sessionData]);

  useEffect(() => {
    let cancelled = false;
    apiService
      .getProfile()
      .then((latestProfile) => {
        if (cancelled) return;
        setProfile(latestProfile);
        setNameDraft(latestProfile.name || "");
        onProfileChanged?.({
          name: latestProfile.name,
          email: latestProfile.email,
          signInEmail: latestProfile.signInEmail,
        });
      })
      .catch(() => {
        if (!cancelled) setProfileError("Unable to load the latest profile details.");
      })
      .finally(() => {
        if (!cancelled) setLoadingProfile(false);
      });
    return () => {
      cancelled = true;
    };
  }, [onProfileChanged]);

  useEffect(() => {
    let cancelled = false;
    apiService
      .getOrganizations()
      .then((response) => {
        if (!cancelled) setOrganizations(response.organizations || []);
      })
      .catch(() => {
        if (!cancelled) setOrganizations([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingOrganizations(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const activeOrganizations = useMemo(
    () =>
      organizations.filter((organization) =>
        organization.status ? organization.status === "active" : true
      ),
    [organizations]
  );
  const currentOrganization = activeOrganizations.find(
    (organization) => organization.organizationId === sessionData.organizationId
  );
  const primaryOrganization = currentOrganization || activeOrganizations[0] || null;
  const activeEmail = profile.email || sessionData.email || "";
  const signInEmail = profile.signInEmail || activeEmail;
  const signInEmailDiffers =
    activeEmail && signInEmail && activeEmail.toLowerCase() !== signInEmail.toLowerCase();
  const pendingRequestedAt = displayDate(profile.pendingEmailSetAt);

  const resetProfileStatus = () => {
    setProfileError(null);
    setProfileMessage(null);
  };

  const copyUserId = async () => {
    try {
      await navigator.clipboard.writeText(sessionData.sub);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {}
  };

  const startEditingName = () => {
    resetProfileStatus();
    setEditingField("name");
    setNameDraft(profile.name || "");
  };

  const startChangingEmail = () => {
    resetProfileStatus();
    setEditingField("email");
    setEmailDraft("");
  };

  const cancelProfileEdit = () => {
    setEditingField(null);
    setNameDraft(profile.name || "");
    setEmailDraft("");
    resetProfileStatus();
  };

  const saveName = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = nameDraft.trim();
    if (!name) {
      setProfileError("Enter a name.");
      return;
    }
    try {
      setSavingName(true);
      resetProfileStatus();
      const updatedProfile = await apiService.updateProfile({ name });
      setProfile(updatedProfile);
      setNameDraft(updatedProfile.name || "");
      setEditingField(null);
      setProfileMessage("Name updated.");
      onProfileChanged?.({
        name: updatedProfile.name,
        email: updatedProfile.email,
        signInEmail: updatedProfile.signInEmail,
      });
      loadProfile().catch(() => {});
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : "Unable to update your name.");
    } finally {
      setSavingName(false);
    }
  };

  const sendEmailChange = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const email = emailDraft.trim();
    if (!isEmailLike(email)) {
      setProfileError("Enter a valid email address.");
      return;
    }
    if (activeEmail && email.toLowerCase() === activeEmail.toLowerCase()) {
      setProfileError("Enter a different email address.");
      return;
    }
    try {
      setSendingEmail(true);
      resetProfileStatus();
      const response = await apiService.requestEmailChange(email);
      setProfile((current) => ({
        ...current,
        pendingEmail: response.pendingEmail || email,
        pendingEmailSetAt: response.pendingEmailSetAt || current.pendingEmailSetAt || null,
      }));
      setEditingField(null);
      setEmailDraft("");
      setProfileMessage(response.message || `Verification sent to ${email}.`);
      loadProfile().catch(() => {});
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : "Unable to request email change.");
    } finally {
      setSendingEmail(false);
    }
  };

  const resendPendingEmail = async () => {
    try {
      setResendingEmail(true);
      resetProfileStatus();
      const response = await apiService.resendPendingEmailChange();
      setProfile((current) => ({
        ...current,
        pendingEmail: response.pendingEmail || current.pendingEmail,
        pendingEmailSetAt: response.pendingEmailSetAt || current.pendingEmailSetAt,
      }));
      setProfileMessage(response.message || "Verification sent again.");
      loadProfile().catch(() => {});
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : "Unable to resend verification.");
    } finally {
      setResendingEmail(false);
    }
  };

  const cancelPendingEmail = async () => {
    try {
      setCancelingEmail(true);
      resetProfileStatus();
      const updatedProfile = await apiService.cancelPendingEmailChange();
      setProfile((current) => ({
        ...current,
        ...updatedProfile,
        pendingEmail: null,
        pendingEmailSetAt: null,
      }));
      setProfileMessage("Pending email change cancelled.");
      loadProfile().catch(() => {});
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : "Unable to cancel email change.");
    } finally {
      setCancelingEmail(false);
    }
  };

  const createOrganization = async () => {
    const name = newOrgName.trim();
    const slug = newOrgSlug.trim();
    if (!name) {
      setOrganizationError("Enter an organization name.");
      return;
    }
    try {
      setCreatingOrganization(true);
      setOrganizationError(null);
      const response = await apiService.createOrganization({
        name,
        ...(slug ? { slug } : {}),
      });
      const nextOrganization = response.organization;
      setOrganizations((current) => [...current, nextOrganization]);
      setShowCreateOrg(false);
      setNewOrgName("");
      setNewOrgSlug("");
      const nextSession = await apiService.setSessionOrganization(nextOrganization.organizationId);
      onOrganizationChanged?.(nextSession);
    } catch (error) {
      setOrganizationError(
        error instanceof Error ? error.message : "Unable to create organization."
      );
    } finally {
      setCreatingOrganization(false);
    }
  };

  return (
    <UserLayout
      userName={profile.name || sessionData.name}
      userEmail={activeEmail}
      onLogout={onLogout}
    >
      <PortalPage>
        <PortalHeader
          eyebrow="Profile"
          title={profile.name || activeEmail || "Your account"}
          description="Manage account details, default organization, and this browser session."
        />

        <PortalSection id="profile-details" title="Account details">
          <div className={styles.list} aria-busy={loadingProfile}>
            <div className={styles.row}>
              <div className={styles.rowCopy}>
                <span>Name</span>
                {editingField === "name" ? (
                  <form className={styles.inlineForm} onSubmit={saveName}>
                    <label htmlFor="profile-name">Name</label>
                    <input
                      id="profile-name"
                      value={nameDraft}
                      onChange={(event) => setNameDraft(event.target.value)}
                      autoComplete="name"
                    />
                    <div className={styles.actions}>
                      <Button type="submit" variant="primary" disabled={savingName}>
                        {savingName ? "Saving..." : "Save"}
                      </Button>
                      <Button type="button" variant="secondary" onClick={cancelProfileEdit}>
                        Cancel
                      </Button>
                    </div>
                  </form>
                ) : (
                  <strong>{profile.name || "Not provided"}</strong>
                )}
              </div>
              {editingField === null ? (
                <Button type="button" variant="secondary" onClick={startEditingName}>
                  Edit
                </Button>
              ) : null}
            </div>

            <div className={styles.row}>
              <div className={styles.rowCopy}>
                <span>Email</span>
                {editingField === "email" ? (
                  <form className={styles.inlineForm} onSubmit={sendEmailChange}>
                    <label htmlFor="profile-email">New email</label>
                    <input
                      id="profile-email"
                      type="email"
                      value={emailDraft}
                      onChange={(event) => setEmailDraft(event.target.value)}
                      placeholder="new@example.com"
                      autoComplete="email"
                    />
                    <p className={styles.helpText}>
                      Your current email stays active until you verify the new email. Password
                      sign-in keeps using the current sign-in email until your password is
                      re-enrolled.
                    </p>
                    <div className={styles.actions}>
                      <Button type="submit" variant="primary" disabled={sendingEmail}>
                        {sendingEmail ? "Sending..." : "Send verification"}
                      </Button>
                      <Button type="button" variant="secondary" onClick={cancelProfileEdit}>
                        Cancel
                      </Button>
                    </div>
                  </form>
                ) : (
                  <div className={styles.emailValue}>
                    <strong>{activeEmail || "Not provided"}</strong>
                    {profile.emailVerified === false ? (
                      <StatusPill tone="action">Unverified</StatusPill>
                    ) : profile.emailVerified === true ? (
                      <StatusPill tone="ready">Verified</StatusPill>
                    ) : null}
                  </div>
                )}
                {signInEmailDiffers ? (
                  <p className={styles.helpText}>Password sign-in email: {signInEmail}</p>
                ) : null}
              </div>
              {editingField === null ? (
                <Button type="button" variant="secondary" onClick={startChangingEmail}>
                  Change
                </Button>
              ) : null}
            </div>

            {profile.pendingEmail ? (
              <div className={cx(styles.row, styles.pendingRow)}>
                <div className={styles.rowCopy}>
                  <span>Pending email</span>
                  <strong>{profile.pendingEmail}</strong>
                  <p className={styles.helpText}>
                    Verification sent to {profile.pendingEmail}. Your current email remains active
                    until the new email is verified.
                  </p>
                  {pendingRequestedAt ? (
                    <small className={styles.muted}>Requested {pendingRequestedAt}</small>
                  ) : null}
                </div>
                <div className={styles.rowActions}>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={resendPendingEmail}
                    disabled={resendingEmail || cancelingEmail}
                  >
                    {resendingEmail ? "Sending..." : "Resend"}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={cancelPendingEmail}
                    disabled={resendingEmail || cancelingEmail}
                  >
                    {cancelingEmail ? "Cancelling..." : "Cancel pending"}
                  </Button>
                </div>
              </div>
            ) : null}

            <div className={styles.row}>
              <div className={styles.rowCopy}>
                <span>User ID</span>
                <div className={styles.codeValue}>
                  <code>{sessionData.sub}</code>
                </div>
              </div>
              <Button type="button" variant="secondary" onClick={copyUserId}>
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
          </div>
          {profileError ? <p className={styles.error}>{profileError}</p> : null}
          {profileMessage ? <p className={styles.success}>{profileMessage}</p> : null}
        </PortalSection>

        <PortalSection
          id="profile-organizations"
          title="Organizations"
          description={
            loadingOrganizations
              ? "Loading organizations..."
              : activeOrganizations.length === 1
                ? "1 active organization"
                : `${activeOrganizations.length} active organizations`
          }
          actions={
            <>
              {activeOrganizations.length > 1 ? (
                <Button type="button" variant="secondary" onClick={() => navigate("/switch-org")}>
                  Switch
                </Button>
              ) : null}
              <Button type="button" variant="secondary" onClick={() => setShowCreateOrg(true)}>
                <Plus size={18} />
                New organization
              </Button>
            </>
          }
        >
          {primaryOrganization ? (
            <div className={styles.currentOrg}>
              <span className={styles.orgAvatar} aria-hidden="true">
                {primaryOrganization.name.slice(0, 1).toUpperCase()}
              </span>
              <div className={styles.orgCopy}>
                <span>Default organization</span>
                <strong>{primaryOrganization.name}</strong>
                {primaryOrganization.slug ? <small>{primaryOrganization.slug}</small> : null}
              </div>
              <StatusPill
                tone={
                  primaryOrganization.organizationId === sessionData.organizationId
                    ? "ready"
                    : "neutral"
                }
              >
                {primaryOrganization.organizationId === sessionData.organizationId
                  ? "Current"
                  : "Available"}
              </StatusPill>
            </div>
          ) : null}

          {showCreateOrg ? (
            <div className={styles.createOrg}>
              <label>
                <span>Organization name</span>
                <input
                  value={newOrgName}
                  onChange={(event) => setNewOrgName(event.target.value)}
                  placeholder="Acme"
                />
              </label>
              <label>
                <span>Slug</span>
                <input
                  value={newOrgSlug}
                  onChange={(event) =>
                    setNewOrgSlug(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))
                  }
                  placeholder="acme"
                />
              </label>
              {organizationError ? <p className={styles.error}>{organizationError}</p> : null}
              <div className={styles.actions}>
                <Button
                  type="button"
                  variant="primary"
                  onClick={createOrganization}
                  disabled={creatingOrganization}
                >
                  {creatingOrganization ? "Creating..." : "Create organization"}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setShowCreateOrg(false);
                    setOrganizationError(null);
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : null}

          {activeOrganizations.length > 1 ? (
            <div className={styles.orgList}>
              {activeOrganizations.map((organization) => {
                const current = organization.organizationId === sessionData.organizationId;
                return (
                  <button
                    type="button"
                    className={cx(styles.orgItem, current && styles.orgItemCurrent)}
                    key={organization.organizationId}
                    onClick={() =>
                      current
                        ? undefined
                        : apiService
                            .setSessionOrganization(organization.organizationId)
                            .then((nextSession) => {
                              onOrganizationChanged?.(nextSession);
                              navigate("/profile", { replace: true });
                            })
                    }
                  >
                    <span className={styles.orgItemText}>
                      <strong>{organization.name}</strong>
                      {organization.slug ? <small>{organization.slug}</small> : null}
                    </span>
                    <StatusPill tone={current ? "ready" : "neutral"}>
                      {current ? "Default" : "Use"}
                    </StatusPill>
                  </button>
                );
              })}
            </div>
          ) : activeOrganizations.length === 0 ? (
            <div className={styles.empty}>No active organizations are available.</div>
          ) : null}
        </PortalSection>

        <PortalSection
          id="profile-session"
          title="Session"
          description="Sign out on this browser when you are finished."
        >
          <Button type="button" variant="secondary" onClick={onLogout}>
            Sign out
          </Button>
        </PortalSection>
      </PortalPage>
    </UserLayout>
  );
}
