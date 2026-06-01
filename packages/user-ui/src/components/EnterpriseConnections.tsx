import { type FormEvent, useCallback, useEffect, useState } from "react";
import apiService, {
  type OrgFederationConnection,
  type OrgFederationConnectionInput,
  type OrgFederationDomain,
  type OrgScimConnection,
  type OrgScimToken,
} from "../services/api";
import Button from "./Button";
import styles from "./EnterpriseConnections.module.css";
import { EmptyState, PortalSection, StatusPill } from "./Portal";

interface EnterpriseConnectionsProps {
  organizationId: string;
}

interface CopyFieldProps {
  label: string;
  value: string;
}

function CopyField({ label, value }: CopyFieldProps) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div className={styles.copyField}>
      <div className={styles.copyFieldBody}>
        <span className={styles.copyLabel}>{label}</span>
        <code className={styles.copyValue}>{value}</code>
      </div>
      <Button type="button" variant="secondary" onClick={copy}>
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}

function domainStatusTone(status: string): "ready" | "action" | "neutral" {
  if (status === "verified") return "ready";
  if (status === "failed") return "action";
  return "neutral";
}

function isForbidden(err: unknown) {
  const code = (err as { code?: string } | undefined)?.code;
  return code === "FORBIDDEN" || (err instanceof Error && /403/.test(err.message));
}

const emptyConnectionInput: OrgFederationConnectionInput = {
  name: "",
  discoveryUrl: "",
  clientId: "",
  clientSecret: "",
  emailClaim: "email",
  nameClaim: "name",
  subjectClaim: "sub",
  jitProvisioning: true,
  membershipOnAuthentication: true,
  requireScimPreProvisioning: false,
};

export default function EnterpriseConnections({ organizationId }: EnterpriseConnectionsProps) {
  const [managed, setManaged] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [federationConnections, setFederationConnections] = useState<OrgFederationConnection[]>([]);
  const [selectedFederationId, setSelectedFederationId] = useState<string | null>(null);
  const [federationForm, setFederationForm] =
    useState<OrgFederationConnectionInput>(emptyConnectionInput);
  const [creatingFederation, setCreatingFederation] = useState(false);
  const [domains, setDomains] = useState<OrgFederationDomain[]>([]);
  const [newDomain, setNewDomain] = useState("");

  const [scimConnections, setScimConnections] = useState<OrgScimConnection[]>([]);
  const [scimName, setScimName] = useState("");
  const [scimTokensByConnection, setScimTokensByConnection] = useState<
    Record<string, OrgScimToken[]>
  >({});
  const [revealedToken, setRevealedToken] = useState<{
    connectionId: string;
    value: string;
  } | null>(null);

  const loadAll = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    setError(null);
    try {
      const [federation, scim] = await Promise.all([
        apiService.getOrgFederationConnections(organizationId),
        apiService.getOrgScimConnections(organizationId),
      ]);
      setFederationConnections(federation);
      setScimConnections(scim);
      setManaged(true);
    } catch (err) {
      if (isForbidden(err)) {
        setManaged(false);
      } else {
        setError(err instanceof Error ? err.message : "Unable to load enterprise connections.");
        setManaged(true);
      }
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const loadDomains = useCallback(
    async (connectionId: string) => {
      try {
        const list = await apiService.getOrgFederationDomains(organizationId, connectionId);
        setDomains(list);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to load domains.");
      }
    },
    [organizationId]
  );

  const selectFederation = async (connection: OrgFederationConnection) => {
    setCreatingFederation(false);
    setSelectedFederationId(connection.id);
    setMessage(null);
    setError(null);
    try {
      const full = await apiService.getOrgFederationConnection(organizationId, connection.id);
      setFederationForm({
        name: full.name || "",
        enabled: full.enabled,
        discoveryUrl: full.discoveryUrl || "",
        clientId: full.clientId || "",
        clientSecret: "",
        scopes: full.scopes,
        emailClaim: full.emailClaim || "email",
        nameClaim: full.nameClaim || "name",
        subjectClaim: full.subjectClaim || "sub",
        jitProvisioning: full.jitProvisioning ?? true,
        membershipOnAuthentication: full.membershipOnAuthentication ?? true,
        requireScimPreProvisioning: full.requireScimPreProvisioning ?? false,
      });
      await loadDomains(connection.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load connection.");
    }
  };

  const startCreateFederation = () => {
    setCreatingFederation(true);
    setSelectedFederationId(null);
    setFederationForm(emptyConnectionInput);
    setDomains([]);
    setMessage(null);
    setError(null);
  };

  const submitFederation = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!federationForm.name.trim()) return;
    setSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      const { clientSecret, ...rest } = federationForm;
      const payload: OrgFederationConnectionInput = {
        ...rest,
        name: federationForm.name.trim(),
        ...(clientSecret ? { clientSecret } : {}),
      };
      if (creatingFederation) {
        const created = await apiService.createOrgFederationConnection(organizationId, payload);
        setMessage("SSO connection created.");
        const list = await apiService.getOrgFederationConnections(organizationId);
        setFederationConnections(list);
        await selectFederation(created);
      } else if (selectedFederationId) {
        await apiService.updateOrgFederationConnection(
          organizationId,
          selectedFederationId,
          payload
        );
        setMessage("SSO connection updated.");
        const list = await apiService.getOrgFederationConnections(organizationId);
        setFederationConnections(list);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save SSO connection.");
    } finally {
      setSubmitting(false);
    }
  };

  const deleteFederation = async (connection: OrgFederationConnection) => {
    if (!window.confirm(`Delete SSO connection ${connection.name}?`)) return;
    setSubmitting(true);
    setError(null);
    try {
      await apiService.deleteOrgFederationConnection(organizationId, connection.id);
      setSelectedFederationId(null);
      setCreatingFederation(false);
      setDomains([]);
      const list = await apiService.getOrgFederationConnections(organizationId);
      setFederationConnections(list);
      setMessage("SSO connection deleted.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete SSO connection.");
    } finally {
      setSubmitting(false);
    }
  };

  const addDomain = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedFederationId || !newDomain.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await apiService.createOrgFederationDomain(
        organizationId,
        selectedFederationId,
        newDomain.trim()
      );
      setNewDomain("");
      await loadDomains(selectedFederationId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to add domain.");
    } finally {
      setSubmitting(false);
    }
  };

  const removeDomain = async (domain: OrgFederationDomain) => {
    if (!selectedFederationId) return;
    if (!window.confirm(`Remove domain ${domain.domain}?`)) return;
    setSubmitting(true);
    setError(null);
    try {
      await apiService.deleteOrgFederationDomain(organizationId, selectedFederationId, domain.id);
      await loadDomains(selectedFederationId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to remove domain.");
    } finally {
      setSubmitting(false);
    }
  };

  const verifyDomain = async (domain: OrgFederationDomain) => {
    if (!selectedFederationId) return;
    setSubmitting(true);
    setError(null);
    try {
      const updated = await apiService.verifyOrgFederationDomain(
        organizationId,
        selectedFederationId,
        domain.id
      );
      setDomains((current) =>
        current.map((item) => (item.id === domain.id ? { ...item, ...updated } : item))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to check verification.");
    } finally {
      setSubmitting(false);
    }
  };

  const recordName = (domain: OrgFederationDomain) =>
    domain.recordName || `_darkauth-verification.${domain.domain}`;
  const recordValue = (domain: OrgFederationDomain) => domain.recordValue || "";

  const createScim = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!scimName.trim()) return;
    setSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      await apiService.createOrgScimConnection(organizationId, scimName.trim());
      setScimName("");
      const list = await apiService.getOrgScimConnections(organizationId);
      setScimConnections(list);
      setMessage("SCIM connection created.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create SCIM connection.");
    } finally {
      setSubmitting(false);
    }
  };

  const deleteScim = async (connection: OrgScimConnection) => {
    if (
      !window.confirm(
        `Delete SCIM connection ${connection.name}? This stops directory provisioning but does not deactivate existing members.`
      )
    )
      return;
    setSubmitting(true);
    setError(null);
    try {
      await apiService.deleteOrgScimConnection(organizationId, connection.id);
      const list = await apiService.getOrgScimConnections(organizationId);
      setScimConnections(list);
      setMessage("SCIM connection deleted.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete SCIM connection.");
    } finally {
      setSubmitting(false);
    }
  };

  const loadScimTokens = async (connection: OrgScimConnection) => {
    setError(null);
    try {
      const tokens = await apiService.getOrgScimTokens(organizationId, connection.id);
      setScimTokensByConnection((current) => ({ ...current, [connection.id]: tokens }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load tokens.");
    }
  };

  const createScimToken = async (connection: OrgScimConnection) => {
    setSubmitting(true);
    setError(null);
    setRevealedToken(null);
    try {
      const token = await apiService.createOrgScimToken(organizationId, connection.id);
      if (token.token) {
        setRevealedToken({ connectionId: connection.id, value: token.token });
      }
      await loadScimTokens(connection);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create token.");
    } finally {
      setSubmitting(false);
    }
  };

  const revokeScimToken = async (connection: OrgScimConnection, token: OrgScimToken) => {
    if (!window.confirm("Revoke this SCIM bearer token? The IdP using it will stop syncing."))
      return;
    setSubmitting(true);
    setError(null);
    try {
      await apiService.deleteOrgScimToken(organizationId, connection.id, token.id);
      if (revealedToken?.connectionId === connection.id) setRevealedToken(null);
      await loadScimTokens(connection);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to revoke token.");
    } finally {
      setSubmitting(false);
    }
  };

  const scimBaseUrl = (connection: OrgScimConnection) =>
    connection.baseUrl || `${window.location.origin}/scim/v2`;

  if (loading) {
    return (
      <EmptyState
        title="Loading enterprise connections"
        text="Fetching SSO and directory provisioning configuration."
      />
    );
  }

  if (managed === false) {
    return (
      <EmptyState
        title="Enterprise Connections unavailable"
        text="You need organization management permission to configure SSO and SCIM for this organization."
      />
    );
  }

  return (
    <div className={styles.area}>
      {error ? <p className={styles.error}>{error}</p> : null}
      {message ? <p className={styles.success}>{message}</p> : null}

      <PortalSection
        id="enterprise-sso"
        title="Single Sign-On (SSO)"
        description="Connect your identity provider over OIDC so members can sign in with your IdP."
        actions={
          <Button type="button" variant="primary" onClick={startCreateFederation}>
            New connection
          </Button>
        }
      >
        <div className={styles.list}>
          {federationConnections.length === 0 && !creatingFederation ? (
            <EmptyState
              title="No SSO connections"
              text="Create an OIDC connection to enable enterprise sign-in for this organization."
            />
          ) : (
            federationConnections.map((connection) => (
              <div key={connection.id} className={styles.card}>
                <div className={styles.cardHeader}>
                  <div className={styles.cardTitle}>
                    <strong>{connection.name}</strong>
                    <small className={styles.muted}>
                      {connection.issuer || connection.discoveryUrl}
                    </small>
                  </div>
                  <div className={styles.cardActions}>
                    <StatusPill tone={connection.enabled ? "ready" : "neutral"}>
                      {connection.enabled ? "Enabled" : "Disabled"}
                    </StatusPill>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => selectFederation(connection)}
                    >
                      {selectedFederationId === connection.id ? "Editing" : "Edit"}
                    </Button>
                    <Button
                      type="button"
                      variant="danger"
                      disabled={submitting}
                      onClick={() => deleteFederation(connection)}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {creatingFederation || selectedFederationId ? (
          <form className={styles.form} onSubmit={submitFederation}>
            <h4 className={styles.formTitle}>
              {creatingFederation ? "New OIDC connection" : "Edit OIDC connection"}
            </h4>
            <label className={styles.field}>
              <span>Connection name</span>
              <input
                type="text"
                value={federationForm.name}
                onChange={(event) =>
                  setFederationForm((current) => ({ ...current, name: event.target.value }))
                }
                placeholder="Acme Okta"
              />
            </label>
            <label className={styles.field}>
              <span>Discovery URL</span>
              <input
                type="url"
                value={federationForm.discoveryUrl || ""}
                onChange={(event) =>
                  setFederationForm((current) => ({ ...current, discoveryUrl: event.target.value }))
                }
                placeholder="https://idp.example.com/.well-known/openid-configuration"
              />
            </label>
            <div className={styles.fieldRow}>
              <label className={styles.field}>
                <span>Client ID</span>
                <input
                  type="text"
                  value={federationForm.clientId || ""}
                  onChange={(event) =>
                    setFederationForm((current) => ({ ...current, clientId: event.target.value }))
                  }
                />
              </label>
              <label className={styles.field}>
                <span>Client secret</span>
                <input
                  type="password"
                  value={federationForm.clientSecret || ""}
                  onChange={(event) =>
                    setFederationForm((current) => ({
                      ...current,
                      clientSecret: event.target.value,
                    }))
                  }
                  placeholder={creatingFederation ? "" : "Leave blank to keep current secret"}
                  autoComplete="new-password"
                />
              </label>
            </div>
            <div className={styles.fieldRow}>
              <label className={styles.field}>
                <span>Email claim</span>
                <input
                  type="text"
                  value={federationForm.emailClaim || ""}
                  onChange={(event) =>
                    setFederationForm((current) => ({ ...current, emailClaim: event.target.value }))
                  }
                />
              </label>
              <label className={styles.field}>
                <span>Name claim</span>
                <input
                  type="text"
                  value={federationForm.nameClaim || ""}
                  onChange={(event) =>
                    setFederationForm((current) => ({ ...current, nameClaim: event.target.value }))
                  }
                />
              </label>
              <label className={styles.field}>
                <span>Subject claim</span>
                <input
                  type="text"
                  value={federationForm.subjectClaim || ""}
                  onChange={(event) =>
                    setFederationForm((current) => ({
                      ...current,
                      subjectClaim: event.target.value,
                    }))
                  }
                />
              </label>
            </div>
            <div className={styles.toggles}>
              <label className={styles.toggle}>
                <input
                  type="checkbox"
                  checked={federationForm.jitProvisioning ?? false}
                  onChange={(event) =>
                    setFederationForm((current) => ({
                      ...current,
                      jitProvisioning: event.target.checked,
                    }))
                  }
                />
                <span>Just-in-time provisioning (create members on first login)</span>
              </label>
              <label className={styles.toggle}>
                <input
                  type="checkbox"
                  checked={federationForm.membershipOnAuthentication ?? false}
                  onChange={(event) =>
                    setFederationForm((current) => ({
                      ...current,
                      membershipOnAuthentication: event.target.checked,
                    }))
                  }
                />
                <span>Add organization membership on authentication</span>
              </label>
              <label className={styles.toggle}>
                <input
                  type="checkbox"
                  checked={federationForm.requireScimPreProvisioning ?? false}
                  onChange={(event) =>
                    setFederationForm((current) => ({
                      ...current,
                      requireScimPreProvisioning: event.target.checked,
                    }))
                  }
                />
                <span>Require SCIM pre-provisioning (only allow existing provisioned members)</span>
              </label>
              {!creatingFederation ? (
                <label className={styles.toggle}>
                  <input
                    type="checkbox"
                    checked={federationForm.enabled ?? false}
                    onChange={(event) =>
                      setFederationForm((current) => ({
                        ...current,
                        enabled: event.target.checked,
                      }))
                    }
                  />
                  <span>Connection enabled</span>
                </label>
              ) : null}
            </div>
            <div className={styles.formActions}>
              <Button
                type="submit"
                variant="primary"
                disabled={submitting || !federationForm.name.trim()}
              >
                {creatingFederation ? "Create connection" : "Save changes"}
              </Button>
            </div>
          </form>
        ) : null}

        {selectedFederationId && !creatingFederation ? (
          <div className={styles.domains}>
            <h4 className={styles.formTitle}>Domains</h4>
            <p className={styles.muted}>
              Add the email domains your members use. Each domain must be verified with a DNS TXT
              record before DarkAuth will route those users to this connection. Routing will not
              activate until verification succeeds.
            </p>
            <form className={styles.inlineForm} onSubmit={addDomain}>
              <input
                type="text"
                value={newDomain}
                onChange={(event) => setNewDomain(event.target.value)}
                placeholder="example.com"
              />
              <Button type="submit" variant="secondary" disabled={submitting || !newDomain.trim()}>
                Add domain
              </Button>
            </form>
            <div className={styles.list}>
              {domains.length === 0 ? (
                <span className={styles.muted}>No domains added yet.</span>
              ) : (
                domains.map((domain) => (
                  <div key={domain.id} className={styles.card}>
                    <div className={styles.cardHeader}>
                      <div className={styles.cardTitle}>
                        <strong>{domain.domain}</strong>
                        {domain.lastCheckedAt ? (
                          <small className={styles.muted}>
                            Last checked {new Date(domain.lastCheckedAt).toLocaleString()}
                          </small>
                        ) : null}
                      </div>
                      <div className={styles.cardActions}>
                        <StatusPill tone={domainStatusTone(domain.verificationStatus)}>
                          {domain.verificationStatus}
                        </StatusPill>
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={submitting}
                          onClick={() => verifyDomain(domain)}
                        >
                          Check / retry verification
                        </Button>
                        <Button
                          type="button"
                          variant="danger"
                          disabled={submitting}
                          onClick={() => removeDomain(domain)}
                        >
                          Remove
                        </Button>
                      </div>
                    </div>
                    {domain.verificationStatus !== "verified" ? (
                      <div className={styles.dns}>
                        <p className={styles.muted}>
                          Add the following DNS TXT record at your domain registrar, then click
                          “Check / retry verification”. Routing for this domain will not activate
                          until verification succeeds.
                        </p>
                        <CopyField label="TXT record name" value={recordName(domain)} />
                        {recordValue(domain) ? (
                          <CopyField label="TXT record value" value={recordValue(domain)} />
                        ) : (
                          <span className={styles.muted}>
                            The exact record value will appear here once the domain is created.
                          </span>
                        )}
                      </div>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </div>
        ) : null}
      </PortalSection>

      <PortalSection
        id="enterprise-scim"
        title="Directory Provisioning (SCIM)"
        description="Let your identity provider create and manage members in this organization automatically."
      >
        <form className={styles.inlineForm} onSubmit={createScim}>
          <input
            type="text"
            value={scimName}
            onChange={(event) => setScimName(event.target.value)}
            placeholder="Acme directory"
          />
          <Button type="submit" variant="primary" disabled={submitting || !scimName.trim()}>
            New SCIM connection
          </Button>
        </form>

        <p className={styles.muted}>
          Deactivating a member through SCIM suspends or removes their membership in this
          organization only. It does not delete their root DarkAuth account, which may belong to
          other organizations.
        </p>

        <div className={styles.list}>
          {scimConnections.length === 0 ? (
            <EmptyState
              title="No SCIM connections"
              text="Create a SCIM connection to enable directory provisioning for this organization."
            />
          ) : (
            scimConnections.map((connection) => {
              const tokens = scimTokensByConnection[connection.id];
              return (
                <div key={connection.id} className={styles.card}>
                  <div className={styles.cardHeader}>
                    <div className={styles.cardTitle}>
                      <strong>{connection.name}</strong>
                    </div>
                    <div className={styles.cardActions}>
                      <StatusPill tone={connection.enabled === false ? "neutral" : "ready"}>
                        {connection.enabled === false ? "Disabled" : "Enabled"}
                      </StatusPill>
                      <Button
                        type="button"
                        variant="danger"
                        disabled={submitting}
                        onClick={() => deleteScim(connection)}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>

                  <CopyField
                    label="SCIM base URL (set this in your IdP)"
                    value={scimBaseUrl(connection)}
                  />

                  <div className={styles.tokenSection}>
                    <div className={styles.cardActions}>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => loadScimTokens(connection)}
                      >
                        {tokens ? "Refresh tokens" : "View tokens"}
                      </Button>
                      <Button
                        type="button"
                        variant="primary"
                        disabled={submitting}
                        onClick={() => createScimToken(connection)}
                      >
                        Create bearer token
                      </Button>
                    </div>

                    {revealedToken?.connectionId === connection.id ? (
                      <div className={styles.tokenReveal}>
                        <p className={styles.warning}>
                          Copy this bearer token now. It is shown only once and cannot be retrieved
                          again.
                        </p>
                        <CopyField label="Bearer token" value={revealedToken.value} />
                      </div>
                    ) : null}

                    {tokens ? (
                      tokens.length === 0 ? (
                        <span className={styles.muted}>No tokens for this connection.</span>
                      ) : (
                        <div className={styles.list}>
                          {tokens.map((token) => (
                            <div key={token.id} className={styles.tokenRow}>
                              <div className={styles.cardTitle}>
                                <code className={styles.copyValue}>
                                  {token.prefix ? `${token.prefix}…` : token.id}
                                </code>
                                <small className={styles.muted}>
                                  {token.status || "active"}
                                  {token.lastUsedAt
                                    ? ` · last used ${new Date(token.lastUsedAt).toLocaleString()}`
                                    : ""}
                                </small>
                              </div>
                              <Button
                                type="button"
                                variant="danger"
                                disabled={submitting}
                                onClick={() => revokeScimToken(connection, token)}
                              >
                                Revoke
                              </Button>
                            </div>
                          ))}
                        </div>
                      )
                    ) : null}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </PortalSection>
    </div>
  );
}
