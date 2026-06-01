import { Edit, GitBranch, Plus, Search, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import EmptyState from "@/components/empty-state";
import ErrorBanner from "@/components/feedback/error-banner";
import OrganizationCombobox from "@/components/form/organization-combobox";
import FormActions from "@/components/layout/form-actions";
import { FormField, FormGrid } from "@/components/layout/form-grid";
import PageHeader from "@/components/layout/page-header";
import ListCard from "@/components/list/list-card";
import RowActions from "@/components/row-actions";
import StatsCard, { StatsGrid } from "@/components/stats-card";
import ListPagination from "@/components/table/list-pagination";
import SortableTableHead from "@/components/table/sortable-table-head";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import adminApiService, {
  type FederationConnection,
  type FederationConnectionRequest,
  type FederationPolicyControls,
  type SortOrder,
} from "@/services/api";

const joinList = (values: string[]) => values.join("\n");
const parseList = (value: string) =>
  value
    .split(/\r?\n|,\s*/)
    .map((part) => part.trim())
    .filter(Boolean);

const defaultFederationPolicy: FederationPolicyControls = {
  jitProvisioning: true,
  requireScimPreProvisioning: false,
  requirePasswordForZk: false,
  allowPasskeyPrf: true,
  allowTrustedDeviceApproval: true,
  allowNonZkKeySetupBypass: true,
};

type FormState = {
  name: string;
  organizationId: string;
  issuer: string;
  clientId: string;
  clientSecret: string;
  replaceSecret: boolean;
  discoveryUrl: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  jwksUri: string;
  userinfoEndpoint: string;
  scopes: string;
  domains: string;
  accountLinkingPolicy: "disabled" | "email_verified";
  enabled: boolean;
  subjectClaim: string;
  emailClaim: string;
  emailVerifiedClaim: string;
  nameClaim: string;
  groupsClaim: string;
  jitProvisioning: boolean;
  requireScimPreProvisioning: boolean;
  requirePasswordForZk: boolean;
  allowPasskeyPrf: boolean;
  allowTrustedDeviceApproval: boolean;
  allowNonZkKeySetupBypass: boolean;
  metadata: Record<string, unknown> | undefined;
};

const emptyForm: FormState = {
  name: "",
  organizationId: "",
  issuer: "",
  clientId: "",
  clientSecret: "",
  replaceSecret: false,
  discoveryUrl: "",
  authorizationEndpoint: "",
  tokenEndpoint: "",
  jwksUri: "",
  userinfoEndpoint: "",
  scopes: "openid\nprofile\nemail",
  domains: "",
  accountLinkingPolicy: "email_verified",
  enabled: true,
  subjectClaim: "sub",
  emailClaim: "email",
  emailVerifiedClaim: "email_verified",
  nameClaim: "name",
  groupsClaim: "groups",
  ...defaultFederationPolicy,
  metadata: undefined,
};

function formFromConnection(connection: FederationConnection): FormState {
  const policy = { ...defaultFederationPolicy, ...(connection.metadata?.darkauth_policy || {}) };
  return {
    name: connection.name,
    organizationId: connection.organizationId || "",
    issuer: connection.issuer,
    clientId: connection.clientId,
    clientSecret: "",
    replaceSecret: false,
    discoveryUrl: connection.discoveryUrl,
    authorizationEndpoint: connection.authorizationEndpoint,
    tokenEndpoint: connection.tokenEndpoint,
    jwksUri: connection.jwksUri,
    userinfoEndpoint: connection.userinfoEndpoint || "",
    scopes: joinList(connection.scopes),
    domains: joinList(connection.domains),
    accountLinkingPolicy:
      connection.accountLinkingPolicy === "disabled" ? "disabled" : "email_verified",
    enabled: connection.enabled,
    subjectClaim: String(connection.claimMapping.subject || "sub"),
    emailClaim: String(connection.claimMapping.email || "email"),
    emailVerifiedClaim: String(connection.claimMapping.emailVerified || "email_verified"),
    nameClaim: String(connection.claimMapping.name || "name"),
    groupsClaim: String(connection.claimMapping.groups || "groups"),
    jitProvisioning: !!policy.jitProvisioning,
    requireScimPreProvisioning: !!policy.requireScimPreProvisioning,
    requirePasswordForZk: !!policy.requirePasswordForZk,
    allowPasskeyPrf: !!policy.allowPasskeyPrf,
    allowTrustedDeviceApproval: !!policy.allowTrustedDeviceApproval,
    allowNonZkKeySetupBypass: !!policy.allowNonZkKeySetupBypass,
    metadata: connection.metadata,
  };
}

function buildPayload(form: FormState, isEdit: boolean): FederationConnectionRequest {
  const darkauthPolicy: FederationPolicyControls = {
    jitProvisioning: form.jitProvisioning,
    requireScimPreProvisioning: form.requireScimPreProvisioning,
    requirePasswordForZk: form.requirePasswordForZk,
    allowPasskeyPrf: form.allowPasskeyPrf,
    allowTrustedDeviceApproval: form.allowTrustedDeviceApproval,
    allowNonZkKeySetupBypass: form.allowNonZkKeySetupBypass,
  };
  const providerMetadata =
    form.metadata ||
    (form.authorizationEndpoint.trim() && form.tokenEndpoint.trim() && form.jwksUri.trim()
      ? {
          issuer: form.issuer.trim(),
          authorization_endpoint: form.authorizationEndpoint.trim(),
          token_endpoint: form.tokenEndpoint.trim(),
          jwks_uri: form.jwksUri.trim(),
          ...(form.userinfoEndpoint.trim()
            ? { userinfo_endpoint: form.userinfoEndpoint.trim() }
            : {}),
        }
      : undefined);
  const metadata = providerMetadata
    ? ({
        ...providerMetadata,
        darkauth_policy: darkauthPolicy,
      } as FederationConnectionRequest["metadata"])
    : undefined;
  const payload: FederationConnectionRequest = {
    name: form.name.trim(),
    organizationId: form.organizationId || undefined,
    issuer: form.issuer.trim(),
    clientId: form.clientId.trim(),
    discoveryUrl: form.discoveryUrl.trim() || undefined,
    authorizationEndpoint: form.authorizationEndpoint.trim() || undefined,
    tokenEndpoint: form.tokenEndpoint.trim() || undefined,
    jwksUri: form.jwksUri.trim() || undefined,
    userinfoEndpoint: form.userinfoEndpoint.trim() || null,
    scopes: parseList(form.scopes),
    domains: parseList(form.domains),
    accountLinkingPolicy: form.accountLinkingPolicy,
    enabled: form.enabled,
    claimMapping: {
      subject: form.subjectClaim.trim(),
      email: form.emailClaim.trim(),
      emailVerified: form.emailVerifiedClaim.trim(),
      name: form.nameClaim.trim(),
      groups: form.groupsClaim.trim(),
    },
    metadata,
  };
  if (!isEdit || form.replaceSecret) {
    payload.clientSecret = form.clientSecret.trim() || null;
  }
  return payload;
}

export default function FederationConnections() {
  const [connections, setConnections] = useState<FederationConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [sortBy, setSortBy] = useState("createdAt");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<FederationConnection | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [previewEmail, setPreviewEmail] = useState("");
  const [previewResult, setPreviewResult] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);

  const loadConnections = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await adminApiService.getFederationConnections({
        page: currentPage,
        limit: 20,
        search: debouncedSearch,
        sortBy,
        sortOrder,
      });
      setConnections(response.connections);
      setTotalPages(response.pagination.totalPages);
      setTotalCount(response.pagination.total);
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Failed to load federation connections"
      );
    } finally {
      setLoading(false);
    }
  }, [currentPage, debouncedSearch, sortBy, sortOrder]);

  useEffect(() => {
    loadConnections();
  }, [loadConnections]);

  useEffect(() => {
    const handle = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(handle);
  }, [searchQuery]);

  const toggleSort = (field: string) => {
    setCurrentPage(1);
    if (sortBy === field) {
      setSortOrder((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortBy(field);
    setSortOrder("asc");
  };

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (connection: FederationConnection) => {
    setEditing(connection);
    setForm(formFromConnection(connection));
    setDialogOpen(true);
  };

  const discover = async () => {
    if (!form.issuer.trim()) return;
    try {
      setDiscovering(true);
      setError(null);
      const metadata = await adminApiService.discoverFederationOidc(form.issuer.trim());
      setForm((current) => ({
        ...current,
        issuer: metadata.issuer,
        discoveryUrl: `${metadata.issuer}/.well-known/openid-configuration`,
        authorizationEndpoint: metadata.authorization_endpoint,
        tokenEndpoint: metadata.token_endpoint,
        jwksUri: metadata.jwks_uri,
        userinfoEndpoint: metadata.userinfo_endpoint || "",
        scopes: Array.isArray(metadata.scopes_supported)
          ? joinList(
              ["openid", "profile", "email"].filter((scope) =>
                metadata.scopes_supported?.includes(scope)
              )
            ) || current.scopes
          : current.scopes,
        metadata,
      }));
    } catch (discoveryError) {
      setError(discoveryError instanceof Error ? discoveryError.message : "OIDC discovery failed");
    } finally {
      setDiscovering(false);
    }
  };

  const save = async () => {
    try {
      setSubmitting(true);
      setError(null);
      const payload = buildPayload(form, !!editing);
      if (editing) {
        await adminApiService.updateFederationConnection(editing.id, payload);
      } else {
        await adminApiService.createFederationConnection(payload);
      }
      setDialogOpen(false);
      await loadConnections();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save connection");
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (connection: FederationConnection) => {
    if (!confirm(`Delete federation connection "${connection.name}"?`)) return;
    try {
      setError(null);
      await adminApiService.deleteFederationConnection(connection.id);
      await loadConnections();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Failed to delete connection");
    }
  };

  const previewRoute = async () => {
    if (!previewEmail.trim()) return;
    try {
      setPreviewing(true);
      setPreviewResult(null);
      setError(null);
      const result = await adminApiService.previewFederationDomainRoute(previewEmail.trim());
      setPreviewResult(
        result.connection
          ? `${result.connection.name} (${result.connection.issuer})`
          : "No enabled connection matches this email domain"
      );
    } catch (previewError) {
      setError(
        previewError instanceof Error ? previewError.message : "Domain route preview failed"
      );
    } finally {
      setPreviewing(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Federation Connections"
        subtitle="Manage upstream OIDC identity providers and domain routing"
        actions={
          <Button onClick={openCreate}>
            <Plus />
            New Connection
          </Button>
        }
      />

      {error && <ErrorBanner>{error}</ErrorBanner>}

      <StatsGrid>
        <StatsCard
          title="Connections"
          icon={<GitBranch size={16} />}
          value={totalCount}
          description="Configured providers"
        />
        <StatsCard
          title="Enabled"
          value={connections.filter((connection) => connection.enabled).length}
          description="Visible on this page"
        />
        <StatsCard
          title="Domain Routes"
          value={connections.reduce((total, connection) => total + connection.domains.length, 0)}
          description="Mapped domains"
        />
        <StatsCard
          title="Stored Secrets"
          value={connections.filter((connection) => connection.hasClientSecret).length}
          description="Encrypted client secrets"
        />
      </StatsGrid>

      <Card style={{ marginBottom: 24 }}>
        <CardHeader>
          <CardTitle>Domain Route Preview</CardTitle>
          <CardDescription>
            Check which enabled provider would handle an email address.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <Input
              type="email"
              value={previewEmail}
              placeholder="user@example.com"
              onChange={(event) => setPreviewEmail(event.target.value)}
            />
            <Button variant="outline" disabled={previewing} onClick={previewRoute}>
              <Search size={16} />
              Preview
            </Button>
          </div>
          {previewResult && (
            <p style={{ margin: "12px 0 0", color: "hsl(var(--muted-foreground))" }}>
              {previewResult}
            </p>
          )}
        </CardContent>
      </Card>

      <ListCard
        title="Enterprise Connections"
        description="OIDC providers used for federated authentication routing."
        search={{
          placeholder: "Search providers...",
          value: searchQuery,
          onChange: setSearchQuery,
        }}
      >
        {loading ? (
          <div>Loading federation connections...</div>
        ) : connections.length === 0 ? (
          <EmptyState
            icon={<GitBranch />}
            title="No federation connections"
            description="Create an OIDC connection to route enterprise sign-ins by domain."
            action={
              <Button onClick={openCreate}>
                <Plus size={16} />
                New Connection
              </Button>
            }
          />
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
                    label="Issuer"
                    isActive={sortBy === "issuer"}
                    sortOrder={sortOrder}
                    onToggle={() => toggleSort("issuer")}
                  />
                  <TableHead>Organization</TableHead>
                  <TableHead>Domains</TableHead>
                  <TableHead>Status</TableHead>
                  <SortableTableHead
                    label="Updated"
                    isActive={sortBy === "updatedAt"}
                    sortOrder={sortOrder}
                    onToggle={() => toggleSort("updatedAt")}
                  />
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {connections.map((connection) => (
                  <TableRow key={connection.id}>
                    <TableCell>
                      <button
                        type="button"
                        onClick={() => openEdit(connection)}
                        style={{
                          background: "none",
                          border: "none",
                          padding: 0,
                          textAlign: "left",
                          color: "inherit",
                          cursor: "pointer",
                        }}
                      >
                        <strong>{connection.name}</strong>
                        <div style={{ fontSize: 12, color: "hsl(var(--muted-foreground))" }}>
                          {connection.clientId}
                        </div>
                      </button>
                    </TableCell>
                    <TableCell>{connection.issuer}</TableCell>
                    <TableCell>
                      {connection.organizationName ? (
                        <div>
                          <div>{connection.organizationName}</div>
                          {connection.organizationSlug ? (
                            <code style={{ fontSize: 11 }}>{connection.organizationSlug}</code>
                          ) : null}
                        </div>
                      ) : (
                        <Badge variant="outline">Unassigned</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {connection.domains.length > 0 ? connection.domains.join(", ") : "None"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={connection.enabled ? "default" : "secondary"}>
                        {connection.enabled ? "Enabled" : "Disabled"}
                      </Badge>
                    </TableCell>
                    <TableCell>{new Date(connection.updatedAt).toLocaleString()}</TableCell>
                    <TableCell>
                      <RowActions
                        items={[
                          {
                            key: "edit",
                            label: "Edit",
                            icon: <Edit className="h-4 w-4" />,
                            onClick: () => openEdit(connection),
                          },
                          {
                            key: "delete",
                            label: "Delete",
                            icon: <Trash2 className="h-4 w-4" />,
                            destructive: true,
                            onClick: () => remove(connection),
                          },
                        ]}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <ListPagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
            />
          </>
        )}
      </ListCard>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent style={{ maxWidth: 920 }}>
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit Federation Connection" : "New Federation Connection"}
            </DialogTitle>
            <DialogDescription>
              Configure OIDC metadata, domain routing, and account linking behavior.
            </DialogDescription>
          </DialogHeader>
          <FormGrid columns={2}>
            <FormField label={<Label>Name</Label>}>
              <Input
                value={form.name}
                onChange={(event) =>
                  setForm((current) => ({ ...current, name: event.target.value }))
                }
              />
            </FormField>
            <FormField label={<Label>Organization{editing ? "" : " *"}</Label>}>
              <OrganizationCombobox
                value={form.organizationId}
                onValueChange={(value) =>
                  setForm((current) => ({ ...current, organizationId: value }))
                }
              />
            </FormField>
            <FormField label={<Label>Issuer</Label>}>
              <div style={{ display: "flex", gap: 8 }}>
                <Input
                  value={form.issuer}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, issuer: event.target.value }))
                  }
                />
                <Button type="button" variant="outline" disabled={discovering} onClick={discover}>
                  Discover
                </Button>
              </div>
            </FormField>
            <FormField label={<Label>Client ID</Label>}>
              <Input
                value={form.clientId}
                onChange={(event) =>
                  setForm((current) => ({ ...current, clientId: event.target.value }))
                }
              />
            </FormField>
            <FormField
              label={<Label>{editing ? "Client Secret Replacement" : "Client Secret"}</Label>}
            >
              {editing && (
                <Select
                  value={form.replaceSecret ? "replace" : "keep"}
                  onValueChange={(value) =>
                    setForm((current) => ({ ...current, replaceSecret: value === "replace" }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="keep">
                      {editing.hasClientSecret ? "Keep existing secret" : "No stored secret"}
                    </SelectItem>
                    <SelectItem value="replace">Replace stored secret</SelectItem>
                  </SelectContent>
                </Select>
              )}
              {(!editing || form.replaceSecret) && (
                <Input
                  type="password"
                  value={form.clientSecret}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, clientSecret: event.target.value }))
                  }
                />
              )}
            </FormField>
            <FormField label={<Label>Discovery URL</Label>}>
              <Input
                value={form.discoveryUrl}
                onChange={(event) =>
                  setForm((current) => ({ ...current, discoveryUrl: event.target.value }))
                }
              />
            </FormField>
            <FormField label={<Label>Authorization Endpoint</Label>}>
              <Input
                value={form.authorizationEndpoint}
                onChange={(event) =>
                  setForm((current) => ({ ...current, authorizationEndpoint: event.target.value }))
                }
              />
            </FormField>
            <FormField label={<Label>Token Endpoint</Label>}>
              <Input
                value={form.tokenEndpoint}
                onChange={(event) =>
                  setForm((current) => ({ ...current, tokenEndpoint: event.target.value }))
                }
              />
            </FormField>
            <FormField label={<Label>JWKS URI</Label>}>
              <Input
                value={form.jwksUri}
                onChange={(event) =>
                  setForm((current) => ({ ...current, jwksUri: event.target.value }))
                }
              />
            </FormField>
            <FormField label={<Label>UserInfo Endpoint</Label>}>
              <Input
                value={form.userinfoEndpoint}
                onChange={(event) =>
                  setForm((current) => ({ ...current, userinfoEndpoint: event.target.value }))
                }
              />
            </FormField>
            <FormField label={<Label>Status</Label>}>
              <Select
                value={form.enabled ? "enabled" : "disabled"}
                onValueChange={(value) =>
                  setForm((current) => ({ ...current, enabled: value === "enabled" }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="enabled">Enabled</SelectItem>
                  <SelectItem value="disabled">Disabled</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
            <FormField label={<Label>Account Linking</Label>}>
              <Select
                value={form.accountLinkingPolicy}
                onValueChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    accountLinkingPolicy: value as "disabled" | "email_verified",
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="disabled">Disabled</SelectItem>
                  <SelectItem value="email_verified">Verified email</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
            <FormField label={<Label>JIT User Creation</Label>}>
              <Select
                value={form.jitProvisioning ? "allow" : "block"}
                onValueChange={(value) =>
                  setForm((current) => ({ ...current, jitProvisioning: value === "allow" }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="allow">Allow JIT creation</SelectItem>
                  <SelectItem value="block">Require existing user link</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
            <FormField label={<Label>SCIM Pre-provisioning</Label>}>
              <Select
                value={form.requireScimPreProvisioning ? "required" : "optional"}
                onValueChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    requireScimPreProvisioning: value === "required",
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="required">Required</SelectItem>
                  <SelectItem value="optional">Optional</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
            <FormField label={<Label>ZK Password Setup</Label>}>
              <Select
                value={form.requirePasswordForZk ? "required" : "optional"}
                onValueChange={(value) =>
                  setForm((current) => ({ ...current, requirePasswordForZk: value === "required" }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="required">Require password envelope</SelectItem>
                  <SelectItem value="optional">Use any allowed unlock method</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
            <FormField label={<Label>Passkey PRF Unlock</Label>}>
              <Select
                value={form.allowPasskeyPrf ? "allow" : "block"}
                onValueChange={(value) =>
                  setForm((current) => ({ ...current, allowPasskeyPrf: value === "allow" }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="allow">Allowed</SelectItem>
                  <SelectItem value="block">Disabled</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
            <FormField label={<Label>Trusted-device Approval</Label>}>
              <Select
                value={form.allowTrustedDeviceApproval ? "allow" : "block"}
                onValueChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    allowTrustedDeviceApproval: value === "allow",
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="allow">Allowed</SelectItem>
                  <SelectItem value="block">Disabled</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
            <FormField label={<Label>Non-ZK Key Setup Bypass</Label>}>
              <Select
                value={form.allowNonZkKeySetupBypass ? "allow" : "block"}
                onValueChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    allowNonZkKeySetupBypass: value === "allow",
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="allow">Allow non-ZK bypass</SelectItem>
                  <SelectItem value="block">Require key setup for all sign-ins</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
            <FormField label={<Label>Scopes</Label>}>
              <Textarea
                rows={4}
                value={form.scopes}
                onChange={(event) =>
                  setForm((current) => ({ ...current, scopes: event.target.value }))
                }
              />
            </FormField>
            <FormField label={<Label>Domains</Label>}>
              <Textarea
                rows={4}
                value={form.domains}
                placeholder="example.com"
                onChange={(event) =>
                  setForm((current) => ({ ...current, domains: event.target.value }))
                }
              />
            </FormField>
            <FormField label={<Label>Claim: Subject</Label>}>
              <Input
                value={form.subjectClaim}
                onChange={(event) =>
                  setForm((current) => ({ ...current, subjectClaim: event.target.value }))
                }
              />
            </FormField>
            <FormField label={<Label>Claim: Email</Label>}>
              <Input
                value={form.emailClaim}
                onChange={(event) =>
                  setForm((current) => ({ ...current, emailClaim: event.target.value }))
                }
              />
            </FormField>
            <FormField label={<Label>Claim: Email Verified</Label>}>
              <Input
                value={form.emailVerifiedClaim}
                onChange={(event) =>
                  setForm((current) => ({ ...current, emailVerifiedClaim: event.target.value }))
                }
              />
            </FormField>
            <FormField label={<Label>Claim: Name</Label>}>
              <Input
                value={form.nameClaim}
                onChange={(event) =>
                  setForm((current) => ({ ...current, nameClaim: event.target.value }))
                }
              />
            </FormField>
            <FormField label={<Label>Claim: Groups</Label>}>
              <Input
                value={form.groupsClaim}
                onChange={(event) =>
                  setForm((current) => ({ ...current, groupsClaim: event.target.value }))
                }
              />
            </FormField>
          </FormGrid>
          <FormActions withMargin>
            <Button
              disabled={
                submitting ||
                !form.name.trim() ||
                !form.issuer.trim() ||
                !form.clientId.trim() ||
                (!editing && !form.organizationId)
              }
              onClick={save}
            >
              {editing ? "Save" : "Create"}
            </Button>
          </FormActions>
        </DialogContent>
      </Dialog>
    </div>
  );
}
