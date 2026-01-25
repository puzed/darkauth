import { ArrowLeft } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import FormActions from "@/components/layout/form-actions";
import { FormField, FormGrid } from "@/components/layout/form-grid";
import PageHeader from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import inputStyles from "@/components/ui/input.module.css";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import adminApiService, { type Client } from "@/services/api";

const joinList = (arr: string[]) => arr.join("\n");
const parseList = (v: string) =>
  v
    .split(/\r?\n|,\s*/)
    .map((s) => s.trim())
    .filter(Boolean);

export default function ClientEdit() {
  const { clientId } = useParams<{ clientId: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [client, setClient] = useState<Client | null>(null);
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
      navigate("/clients");
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
      <Card>
        <CardHeader>
          <CardTitle>Client Configuration</CardTitle>
        </CardHeader>
        <CardContent>
          <FormGrid columns={2}>
            <FormField label={<Label>Client ID</Label>}>
              <Input value={form.clientId} disabled />
            </FormField>
            <FormField label={<Label>Name</Label>}>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                disabled={submitting}
              />
            </FormField>
            <FormField label={<Label>Type</Label>}>
              <select
                className={inputStyles.input}
                value={form.type}
                onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as Client["type"] }))}
              >
                <option value="public">public</option>
                <option value="confidential">confidential</option>
              </select>
            </FormField>
            <FormField label={<Label>Auth Method</Label>}>
              <select
                className={inputStyles.input}
                value={form.tokenEndpointAuthMethod}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    tokenEndpointAuthMethod: e.target.value as Client["tokenEndpointAuthMethod"],
                  }))
                }
              >
                <option value="none">none</option>
                <option value="client_secret_basic">client_secret_basic</option>
              </select>
            </FormField>
            <FormField label={<Label>Require PKCE</Label>}>
              <select
                className={inputStyles.input}
                value={form.requirePkce ? "true" : "false"}
                onChange={(e) => setForm((f) => ({ ...f, requirePkce: e.target.value === "true" }))}
              >
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
            </FormField>
            <FormField label={<Label>ZK Delivery</Label>}>
              <select
                className={inputStyles.input}
                value={form.zkDelivery}
                onChange={(e) =>
                  setForm((f) => ({ ...f, zkDelivery: e.target.value as Client["zkDelivery"] }))
                }
              >
                <option value="none">none</option>
                <option value="fragment-jwe">fragment-jwe</option>
              </select>
            </FormField>
            <FormField label={<Label>ZK Required</Label>}>
              <select
                className={inputStyles.input}
                value={form.zkRequired ? "true" : "false"}
                onChange={(e) => setForm((f) => ({ ...f, zkRequired: e.target.value === "true" }))}
              >
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
            </FormField>
            <FormField label={<Label>Show On User Dashboard</Label>}>
              <select
                className={inputStyles.input}
                value={form.showOnUserDashboard ? "true" : "false"}
                onChange={(e) =>
                  setForm((f) => ({ ...f, showOnUserDashboard: e.target.value === "true" }))
                }
              >
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
            </FormField>
          </FormGrid>
          <FormGrid columns={2}>
            <FormField label={<Label>ID Token TTL (seconds)</Label>}>
              <Input
                type="number"
                min={60}
                value={form.idTokenLifetimeSeconds}
                onChange={(e) => setForm((f) => ({ ...f, idTokenLifetimeSeconds: e.target.value }))}
              />
            </FormField>
            <FormField label={<Label>Refresh Token TTL (seconds)</Label>}>
              <Input
                type="number"
                min={300}
                value={form.refreshTokenLifetimeSeconds}
                onChange={(e) =>
                  setForm((f) => ({ ...f, refreshTokenLifetimeSeconds: e.target.value }))
                }
              />
            </FormField>
          </FormGrid>
          <FormGrid columns={2}>
            <FormField label={<Label>Redirect URIs</Label>}>
              <Textarea
                value={form.redirectUris}
                onChange={(e) => setForm((f) => ({ ...f, redirectUris: e.target.value }))}
                rows={3}
              />
            </FormField>
            <FormField label={<Label>Post Logout Redirect URIs</Label>}>
              <Textarea
                value={form.postLogoutRedirectUris}
                onChange={(e) => setForm((f) => ({ ...f, postLogoutRedirectUris: e.target.value }))}
                rows={3}
              />
            </FormField>
            <FormField label={<Label>Grant Types</Label>}>
              <Textarea
                value={form.grantTypes}
                onChange={(e) => setForm((f) => ({ ...f, grantTypes: e.target.value }))}
                rows={2}
              />
            </FormField>
            <FormField label={<Label>Response Types</Label>}>
              <Textarea
                value={form.responseTypes}
                onChange={(e) => setForm((f) => ({ ...f, responseTypes: e.target.value }))}
                rows={2}
              />
            </FormField>
            <FormField label={<Label>Scopes</Label>}>
              <Textarea
                value={form.scopes}
                onChange={(e) => setForm((f) => ({ ...f, scopes: e.target.value }))}
                rows={3}
              />
            </FormField>
            <FormField label={<Label>Allowed ZK Origins</Label>}>
              <Textarea
                value={form.allowedZkOrigins}
                onChange={(e) => setForm((f) => ({ ...f, allowedZkOrigins: e.target.value }))}
                rows={2}
              />
            </FormField>
            <FormField label={<Label>Allowed JWE Algs</Label>}>
              <Textarea
                value={form.allowedJweAlgs}
                onChange={(e) => setForm((f) => ({ ...f, allowedJweAlgs: e.target.value }))}
                rows={2}
              />
            </FormField>
            <FormField label={<Label>Allowed JWE Encs</Label>}>
              <Textarea
                value={form.allowedJweEncs}
                onChange={(e) => setForm((f) => ({ ...f, allowedJweEncs: e.target.value }))}
                rows={2}
              />
            </FormField>
          </FormGrid>
          <FormActions>
            <Button variant="outline" onClick={() => navigate("/clients")}>
              Back
            </Button>
            <Button onClick={save} disabled={submitting}>
              Save
            </Button>
          </FormActions>
        </CardContent>
      </Card>
    </div>
  );
}
