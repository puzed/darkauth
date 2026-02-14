import { ArrowLeft, CircleHelp } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import FormActions from "@/components/layout/form-actions";
import { FormField, FormGrid } from "@/components/layout/form-grid";
import PageHeader from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import adminApiService, { type Client } from "@/services/api";
import styles from "./ClientEdit.module.css";

const joinList = (arr: string[]) => arr.join("\n");
const parseList = (v: string) =>
  v
    .split(/\r?\n|,\s*/)
    .map((s) => s.trim())
    .filter(Boolean);

function FieldLabel({ title, tooltip }: { title: string; tooltip: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <Label>{title}</Label>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={`${title} info`}
            style={{
              border: "none",
              background: "transparent",
              padding: 0,
              display: "inline-flex",
              alignItems: "center",
              color: "var(--muted-foreground)",
              cursor: "help",
            }}
          >
            <CircleHelp size={14} />
          </button>
        </TooltipTrigger>
        <TooltipContent style={{ maxWidth: 320, whiteSpace: "normal" }}>{tooltip}</TooltipContent>
      </Tooltip>
    </div>
  );
}

function FieldHint({ children }: { children: ReactNode }) {
  return (
    <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5, color: "var(--muted-foreground)" }}>
      {children}
    </p>
  );
}

export default function ClientEdit() {
  const { clientId } = useParams<{ clientId: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [showSecret, setShowSecret] = useState(false);
  const [activeTab, setActiveTab] = useState("identity");
  const [form, setForm] = useState({
    clientId: "",
    name: "",
    type: "public" as Client["type"],
    tokenEndpointAuthMethod: "none" as Client["tokenEndpointAuthMethod"],
    requirePkce: true,
    zkDelivery: "none" as Client["zkDelivery"],
    zkRequired: false,
    showOnUserDashboard: false,
    redirectUris: "",
    postLogoutRedirectUris: "",
    grantTypes: "",
    responseTypes: "",
    scopes: "",
    allowedZkOrigins: "",
    allowedJweAlgs: "",
    allowedJweEncs: "",
    idTokenLifetimeSeconds: "",
    refreshTokenLifetimeSeconds: "",
  });

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const clients = await adminApiService.getClients();
      const c = clients.find((x) => x.clientId === clientId);
      if (!c) {
        setError("Client not found");
        setLoading(false);
        return;
      }
      setClient(c);
      try {
        const secretResp = await adminApiService.getClientSecret(c.clientId);
        setClientSecret(secretResp.clientSecret);
      } catch {
        setClientSecret(null);
      }
      setForm({
        clientId: c.clientId,
        name: c.name,
        showOnUserDashboard: !!c.showOnUserDashboard,
        type: c.type,
        tokenEndpointAuthMethod: c.tokenEndpointAuthMethod,
        requirePkce: c.requirePkce,
        zkDelivery: c.zkDelivery,
        zkRequired: c.zkRequired,
        redirectUris: joinList(c.redirectUris),
        postLogoutRedirectUris: joinList(c.postLogoutRedirectUris),
        grantTypes: joinList(c.grantTypes),
        responseTypes: joinList(c.responseTypes),
        scopes: joinList(c.scopes),
        allowedZkOrigins: joinList(c.allowedZkOrigins),
        allowedJweAlgs: joinList(c.allowedJweAlgs),
        allowedJweEncs: joinList(c.allowedJweEncs),
        idTokenLifetimeSeconds: c.idTokenLifetimeSeconds ? String(c.idTokenLifetimeSeconds) : "",
        refreshTokenLifetimeSeconds: c.refreshTokenLifetimeSeconds
          ? String(c.refreshTokenLifetimeSeconds)
          : "",
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load client");
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    if (!client) return;
    try {
      setSubmitting(true);
      setError(null);
      const payload = {
        clientId: form.clientId,
        name: form.name,
        type: form.type,
        tokenEndpointAuthMethod: form.tokenEndpointAuthMethod,
        requirePkce: form.requirePkce,
        zkDelivery: form.zkDelivery,
        zkRequired: form.zkRequired,
        showOnUserDashboard: form.showOnUserDashboard,
        redirectUris: parseList(form.redirectUris),
        postLogoutRedirectUris: parseList(form.postLogoutRedirectUris),
        grantTypes: parseList(form.grantTypes),
        responseTypes: parseList(form.responseTypes),
        scopes: parseList(form.scopes),
        allowedZkOrigins: parseList(form.allowedZkOrigins),
        allowedJweAlgs: parseList(form.allowedJweAlgs),
        allowedJweEncs: parseList(form.allowedJweEncs),
        idTokenLifetimeSeconds: form.idTokenLifetimeSeconds
          ? Number(form.idTokenLifetimeSeconds)
          : undefined,
        refreshTokenLifetimeSeconds: form.refreshTokenLifetimeSeconds
          ? Number(form.refreshTokenLifetimeSeconds)
          : undefined,
      };
      await adminApiService.updateClient(client.clientId, payload);
      setShowSecret(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save client");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div>Loading client...</div>;

  if (error)
    return (
      <div>
        <div>{error}</div>
        <button type="button" onClick={() => navigate("/clients")}>
          Back
        </button>
      </div>
    );

  if (!client) return null;

  return (
    <TooltipProvider>
      <div>
        <PageHeader
          title="Edit Client"
          subtitle={`Client ID: ${clientId || ""}`}
          actions={
            <Button variant="outline" onClick={() => navigate("/clients")}>
              <ArrowLeft />
              Back
            </Button>
          }
        />

        <Tabs value={activeTab} onValueChange={setActiveTab} className={styles.tabsRoot}>
          <TabsList className={styles.tabsList}>
            <TabsTrigger value="identity" className={styles.tabsTrigger}>
              Identity
            </TabsTrigger>
            <TabsTrigger value="security" className={styles.tabsTrigger}>
              Security
            </TabsTrigger>
            <TabsTrigger value="token" className={styles.tabsTrigger}>
              Token
            </TabsTrigger>
            <TabsTrigger value="oauth" className={styles.tabsTrigger}>
              OAuth
            </TabsTrigger>
            <TabsTrigger value="crypto" className={styles.tabsTrigger}>
              ZK/JWE
            </TabsTrigger>
          </TabsList>

          <TabsContent value="identity" className={styles.tabsContent}>
            <Card className={styles.tabCard}>
              <CardHeader>
                <CardTitle>Identity & Access</CardTitle>
                <CardDescription>
                  Core identity and authentication settings for this OAuth client.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <FormGrid columns={1}>
                  <FormField
                    label={
                      <FieldLabel
                        title="Client ID"
                        tooltip="Stable identifier used in OAuth requests. This should not change after clients are deployed."
                      />
                    }
                  >
                    <Input value={form.clientId} disabled />
                    <FieldHint>
                      Unique protocol identifier, e.g. <code>app-web</code>.
                    </FieldHint>
                  </FormField>

                  <FormField
                    label={
                      <FieldLabel
                        title="Name"
                        tooltip="Human-readable label shown to administrators and users during consent/login screens."
                      />
                    }
                  >
                    <Input
                      value={form.name}
                      onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                      disabled={submitting}
                    />
                    <FieldHint>
                      Display name only; changing this does not affect OAuth protocol behavior.
                    </FieldHint>
                  </FormField>

                  <FormField
                    label={
                      <FieldLabel
                        title="Type"
                        tooltip="Public clients cannot safely store secrets. Confidential clients are expected to authenticate server-to-server."
                      />
                    }
                  >
                    <Select
                      value={form.type}
                      onValueChange={(v) =>
                        setForm((f) => ({
                          ...f,
                          type: v as Client["type"],
                          tokenEndpointAuthMethod:
                            v === "public" ? "none" : f.tokenEndpointAuthMethod,
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="public">public</SelectItem>
                        <SelectItem value="confidential">confidential</SelectItem>
                      </SelectContent>
                    </Select>
                    <FieldHint>
                      Public clients are browser/native apps. Confidential clients are backend
                      services.
                    </FieldHint>
                  </FormField>

                  <FormField
                    label={
                      <FieldLabel
                        title="Auth Method"
                        tooltip="Token endpoint client authentication method. 'none' means no client secret. 'client_secret_basic' requires secret auth."
                      />
                    }
                  >
                    <Select
                      value={form.tokenEndpointAuthMethod}
                      onValueChange={(v) =>
                        setForm((f) => ({
                          ...f,
                          tokenEndpointAuthMethod: v as Client["tokenEndpointAuthMethod"],
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">none</SelectItem>
                        {form.type === "confidential" && (
                          <SelectItem value="client_secret_basic">client_secret_basic</SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                    <FieldHint>
                      This directly controls whether token requests must include client credentials.
                    </FieldHint>
                  </FormField>

                  <FormField
                    label={
                      <FieldLabel
                        title="Client Secret"
                        tooltip="Server-side secret for confidential/basic-auth clients. Keep private and rotate if leaked."
                      />
                    }
                  >
                    <div style={{ display: "flex", gap: 8 }}>
                      <Input
                        value={
                          clientSecret
                            ? showSecret
                              ? clientSecret
                              : "•".repeat(24)
                            : "Not available"
                        }
                        disabled
                        readOnly
                      />
                      <Button
                        type="button"
                        variant="outline"
                        disabled={!clientSecret}
                        onClick={() => setShowSecret((v) => !v)}
                      >
                        {showSecret ? "Hide" : "Show"}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={!clientSecret}
                        onClick={async () => {
                          if (!clientSecret) return;
                          await navigator.clipboard.writeText(clientSecret);
                        }}
                      >
                        Copy
                      </Button>
                    </div>
                    <FieldHint>
                      Public clients with auth method <code>none</code> will not have a secret.
                    </FieldHint>
                  </FormField>

                  <FormField
                    label={
                      <FieldLabel
                        title="Show On User Dashboard"
                        tooltip="Controls whether this app appears in the user-facing apps list in DarkAuth."
                      />
                    }
                  >
                    <Select
                      value={form.showOnUserDashboard ? "true" : "false"}
                      onValueChange={(v) =>
                        setForm((f) => ({ ...f, showOnUserDashboard: v === "true" }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="true">Yes</SelectItem>
                        <SelectItem value="false">No</SelectItem>
                      </SelectContent>
                    </Select>
                    <FieldHint>
                      Presentation toggle only; no effect on token validation behavior.
                    </FieldHint>
                  </FormField>
                </FormGrid>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="security" className={styles.tabsContent}>
            <Card className={styles.tabCard}>
              <CardHeader>
                <CardTitle>Security Controls</CardTitle>
                <CardDescription>PKCE and zero-knowledge delivery requirements.</CardDescription>
              </CardHeader>
              <CardContent>
                <FormGrid columns={1}>
                  <FormField
                    label={
                      <FieldLabel
                        title="Require PKCE"
                        tooltip="When enabled, authorization code flow requires code challenge/verifier. Public clients should keep this enabled."
                      />
                    }
                  >
                    <Select
                      value={form.requirePkce ? "true" : "false"}
                      onValueChange={(v) => setForm((f) => ({ ...f, requirePkce: v === "true" }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="true">Yes</SelectItem>
                        <SelectItem value="false">No</SelectItem>
                      </SelectContent>
                    </Select>
                    <FieldHint>
                      PKCE protects against authorization code interception attacks.
                    </FieldHint>
                  </FormField>

                  <FormField
                    label={
                      <FieldLabel
                        title="ZK Delivery"
                        tooltip="Defines whether zero-knowledge data is accepted and how it is transported to this client."
                      />
                    }
                  >
                    <Select
                      value={form.zkDelivery}
                      onValueChange={(v) =>
                        setForm((f) => ({ ...f, zkDelivery: v as Client["zkDelivery"] }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">none</SelectItem>
                        <SelectItem value="fragment-jwe">fragment-jwe</SelectItem>
                      </SelectContent>
                    </Select>
                    <FieldHint>
                      <code>fragment-jwe</code> allows encrypted payload delivery in URL fragments.
                    </FieldHint>
                  </FormField>

                  <FormField
                    label={
                      <FieldLabel
                        title="ZK Required"
                        tooltip="If enabled, authorization requests must include ZK payloads, otherwise login is rejected."
                      />
                    }
                  >
                    <Select
                      value={form.zkRequired ? "true" : "false"}
                      onValueChange={(v) => setForm((f) => ({ ...f, zkRequired: v === "true" }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="true">Yes</SelectItem>
                        <SelectItem value="false">No</SelectItem>
                      </SelectContent>
                    </Select>
                    <FieldHint>Use only for clients that always send ZK data.</FieldHint>
                  </FormField>
                </FormGrid>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="token" className={styles.tabsContent}>
            <Card className={styles.tabCard}>
              <CardHeader>
                <CardTitle>Token Policy</CardTitle>
                <CardDescription>
                  Optional token lifetime overrides for this client.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <FormGrid columns={1}>
                  <FormField
                    label={
                      <FieldLabel
                        title="ID Token TTL (seconds)"
                        tooltip="Overrides global ID token lifetime for this client. Leave empty to use system defaults."
                      />
                    }
                  >
                    <Input
                      type="number"
                      min={60}
                      value={form.idTokenLifetimeSeconds}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, idTokenLifetimeSeconds: e.target.value }))
                      }
                    />
                    <FieldHint>Typical values: 300 to 3600 seconds.</FieldHint>
                  </FormField>

                  <FormField
                    label={
                      <FieldLabel
                        title="Refresh Token TTL (seconds)"
                        tooltip="Overrides global refresh token lifetime for this client. Leave empty to use system defaults."
                      />
                    }
                  >
                    <Input
                      type="number"
                      min={300}
                      value={form.refreshTokenLifetimeSeconds}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, refreshTokenLifetimeSeconds: e.target.value }))
                      }
                    />
                    <FieldHint>
                      Longer values improve UX but increase token lifetime risk.
                    </FieldHint>
                  </FormField>
                </FormGrid>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="oauth" className={styles.tabsContent}>
            <Card className={styles.tabCard}>
              <CardHeader>
                <CardTitle>OAuth Protocol Lists</CardTitle>
                <CardDescription>One item per line or comma-separated values.</CardDescription>
              </CardHeader>
              <CardContent>
                <FormGrid columns={1}>
                  <FormField
                    label={
                      <FieldLabel
                        title="Redirect URIs"
                        tooltip="Allowed callback URLs after authorization. Exact URI matching is enforced."
                      />
                    }
                  >
                    <Textarea
                      value={form.redirectUris}
                      onChange={(e) => setForm((f) => ({ ...f, redirectUris: e.target.value }))}
                      rows={4}
                    />
                    <FieldHint>Required for authorization code flow.</FieldHint>
                  </FormField>

                  <FormField
                    label={
                      <FieldLabel
                        title="Post Logout Redirect URIs"
                        tooltip="Allowed URLs for redirect after logout completion."
                      />
                    }
                  >
                    <Textarea
                      value={form.postLogoutRedirectUris}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, postLogoutRedirectUris: e.target.value }))
                      }
                      rows={3}
                    />
                    <FieldHint>Optional but recommended for controlled post-logout UX.</FieldHint>
                  </FormField>

                  <FormField
                    label={
                      <FieldLabel
                        title="Grant Types"
                        tooltip="OAuth grant types enabled for this client. Unknown or unsupported values will fail at runtime."
                      />
                    }
                  >
                    <Textarea
                      value={form.grantTypes}
                      onChange={(e) => setForm((f) => ({ ...f, grantTypes: e.target.value }))}
                      rows={2}
                    />
                    <FieldHint>
                      Example: <code>authorization_code</code>.
                    </FieldHint>
                  </FormField>

                  <FormField
                    label={
                      <FieldLabel
                        title="Response Types"
                        tooltip="OIDC response types supported by this client."
                      />
                    }
                  >
                    <Textarea
                      value={form.responseTypes}
                      onChange={(e) => setForm((f) => ({ ...f, responseTypes: e.target.value }))}
                      rows={2}
                    />
                    <FieldHint>
                      Example: <code>code</code>.
                    </FieldHint>
                  </FormField>

                  <FormField
                    label={
                      <FieldLabel
                        title="Scopes"
                        tooltip="Scopes this client may request. Restrict to least privilege needed."
                      />
                    }
                  >
                    <Textarea
                      value={form.scopes}
                      onChange={(e) => setForm((f) => ({ ...f, scopes: e.target.value }))}
                      rows={3}
                    />
                    <FieldHint>
                      Common scopes: <code>openid</code>, <code>profile</code>, <code>email</code>.
                    </FieldHint>
                  </FormField>
                </FormGrid>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="crypto" className={styles.tabsContent}>
            <Card className={styles.tabCard}>
              <CardHeader>
                <CardTitle>ZK/JWE Restrictions</CardTitle>
                <CardDescription>
                  Cryptographic restrictions for client interoperability.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <FormGrid columns={1}>
                  <FormField
                    label={
                      <FieldLabel
                        title="Allowed ZK Origins"
                        tooltip="Origins allowed to initiate ZK-enabled requests for this client."
                      />
                    }
                  >
                    <Textarea
                      value={form.allowedZkOrigins}
                      onChange={(e) => setForm((f) => ({ ...f, allowedZkOrigins: e.target.value }))}
                      rows={3}
                    />
                    <FieldHint>Use full origins (scheme + host + optional port).</FieldHint>
                  </FormField>

                  <FormField
                    label={
                      <FieldLabel
                        title="Allowed JWE Algs"
                        tooltip="Allowed JWE key-management algorithms for encrypted payload handling."
                      />
                    }
                  >
                    <Textarea
                      value={form.allowedJweAlgs}
                      onChange={(e) => setForm((f) => ({ ...f, allowedJweAlgs: e.target.value }))}
                      rows={2}
                    />
                    <FieldHint>
                      Example: <code>ECDH-ES</code>.
                    </FieldHint>
                  </FormField>

                  <FormField
                    label={
                      <FieldLabel
                        title="Allowed JWE Encs"
                        tooltip="Allowed JWE content-encryption algorithms for encrypted payload handling."
                      />
                    }
                  >
                    <Textarea
                      value={form.allowedJweEncs}
                      onChange={(e) => setForm((f) => ({ ...f, allowedJweEncs: e.target.value }))}
                      rows={2}
                    />
                    <FieldHint>
                      Example: <code>A256GCM</code>.
                    </FieldHint>
                  </FormField>
                </FormGrid>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <FormActions>
          <Button variant="outline" onClick={() => navigate("/clients")}>
            Back
          </Button>
          <Button onClick={save} disabled={submitting}>
            Save
          </Button>
        </FormActions>
      </div>
    </TooltipProvider>
  );
}
