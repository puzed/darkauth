import { ArrowLeft } from "lucide-react";
import { useId, useState } from "react";
import { useNavigate } from "react-router-dom";
import FormActions from "@/components/layout/form-actions";
import { FormField, FormGrid } from "@/components/layout/form-grid";
import PageHeader from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import adminApiService, { type Client } from "@/services/api";

const parseList = (v: string) =>
  v
    .split(/\r?\n|,\s*/)
    .map((s) => s.trim())
    .filter(Boolean);

export default function ClientCreate() {
  const navigate = useNavigate();
  const clientIdId = useId();
  const nameId = useId();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [form, setForm] = useState({
    clientId: "",
    name: "",
    type: "public" as Client["type"],
    tokenEndpointAuthMethod: "none" as Client["tokenEndpointAuthMethod"],
    requirePkce: true,
    zkDelivery: "none" as Client["zkDelivery"],
    zkRequired: false,
    redirectUris: "",
    postLogoutRedirectUris: "",
    grantTypes: "authorization_code",
    responseTypes: "code",
    scopes: "openid\nprofile",
    allowedZkOrigins: "",
    allowedJweAlgs: "",
    allowedJweEncs: "",
    idTokenLifetimeSeconds: "",
    refreshTokenLifetimeSeconds: "",
  });

  const create = async () => {
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
      const created = await adminApiService.createClient(payload);
      if (created.clientSecret) setSecret(created.clientSecret);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create client");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Create Client"
        subtitle="Configure a new OAuth/OIDC client application"
        actions={
          <Button variant="outline" onClick={() => navigate("/clients")}>
            <ArrowLeft />
            Back
          </Button>
        }
      />

      {error && <div>{error}</div>}

      <Card>
        <CardHeader>
          <CardTitle>Client Information</CardTitle>
        </CardHeader>
        <CardContent>
          <FormGrid columns={2}>
            <FormField label={<Label htmlFor={clientIdId}>Client ID</Label>}>
              <Input
                id={clientIdId}
                value={form.clientId}
                onChange={(e) => setForm((f) => ({ ...f, clientId: e.target.value }))}
                disabled={submitting}
                placeholder="my-app"
              />
            </FormField>
            <FormField label={<Label htmlFor={nameId}>Name</Label>}>
              <Input
                id={nameId}
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                disabled={submitting}
                placeholder="My App"
              />
            </FormField>
            <FormField label={<Label>Type</Label>}>
              <Select
                value={form.type}
                onValueChange={(v) => setForm((f) => ({ ...f, type: v as Client["type"] }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="public">public</SelectItem>
                  <SelectItem value="confidential">confidential</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
            <FormField label={<Label>Auth Method</Label>}>
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
                  <SelectItem value="client_secret_basic">client_secret_basic</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
            <FormField label={<Label>Require PKCE</Label>}>
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
            </FormField>
            <FormField label={<Label>ZK Delivery</Label>}>
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
            </FormField>
            <FormField label={<Label>ZK Required</Label>}>
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
            </FormField>
          </FormGrid>
          <FormGrid columns={2}>
            <FormField label={<Label>ID Token TTL (seconds)</Label>}>
              <Input
                type="number"
                min={60}
                value={form.idTokenLifetimeSeconds}
                onChange={(e) => setForm((f) => ({ ...f, idTokenLifetimeSeconds: e.target.value }))}
                disabled={submitting}
                placeholder="300"
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
                disabled={submitting}
                placeholder="604800"
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

          {secret && (
            <FormField label={<Label>Client Secret</Label>}>
              <Input value={secret} readOnly />
            </FormField>
          )}

          <FormActions>
            <Button variant="outline" onClick={() => navigate("/clients")}>
              Back
            </Button>
            <Button onClick={create} disabled={submitting || !form.clientId || !form.name}>
              Create
            </Button>
          </FormActions>
        </CardContent>
      </Card>
    </div>
  );
}
