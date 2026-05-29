import { Copy, KeyRound, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import EmptyState from "@/components/empty-state";
import ErrorBanner from "@/components/feedback/error-banner";
import FormActions from "@/components/layout/form-actions";
import { FormField, FormGrid } from "@/components/layout/form-grid";
import PageHeader from "@/components/layout/page-header";
import ListCard from "@/components/list/list-card";
import RowActions from "@/components/row-actions";
import StatsCard, { StatsGrid } from "@/components/stats-card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import adminApiService, { type ScimBearerToken } from "@/services/api";

function isActive(token: ScimBearerToken) {
  if (token.revokedAt) return false;
  if (!token.expiresAt) return true;
  return new Date(token.expiresAt).getTime() > Date.now();
}

export default function ScimTokens() {
  const [tokens, setTokens] = useState<ScimBearerToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [creating, setCreating] = useState(false);
  const [createdToken, setCreatedToken] = useState<ScimBearerToken | null>(null);

  const loadTokens = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await adminApiService.getScimTokens();
      setTokens(response.tokens);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load SCIM tokens");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTokens();
  }, [loadTokens]);

  const create = async () => {
    if (!name.trim()) return;
    try {
      setCreating(true);
      setError(null);
      const token = await adminApiService.createScimToken({
        name: name.trim(),
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
      });
      setCreatedToken(token);
      setName("");
      setExpiresAt("");
      setDialogOpen(false);
      await loadTokens();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Failed to create SCIM token");
    } finally {
      setCreating(false);
    }
  };

  const revoke = async (token: ScimBearerToken) => {
    if (!confirm(`Revoke SCIM token "${token.name}"?`)) return;
    try {
      setError(null);
      await adminApiService.revokeScimToken(token.id);
      await loadTokens();
    } catch (revokeError) {
      setError(revokeError instanceof Error ? revokeError.message : "Failed to revoke SCIM token");
    }
  };

  const activeCount = tokens.filter(isActive).length;

  return (
    <div>
      <PageHeader
        title="SCIM Tokens"
        subtitle="Manage bearer tokens for SCIM provisioning clients"
        actions={
          <Button onClick={() => setDialogOpen(true)}>
            <Plus />
            New Token
          </Button>
        }
      />

      {error && <ErrorBanner>{error}</ErrorBanner>}

      {createdToken?.token && (
        <Alert style={{ marginBottom: 24 }}>
          <AlertTitle>Copy this SCIM bearer token now</AlertTitle>
          <AlertDescription>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 12 }}>
              <Input value={createdToken.token} readOnly />
              <Button
                type="button"
                variant="outline"
                onClick={() => navigator.clipboard.writeText(createdToken.token || "")}
              >
                <Copy size={16} />
                Copy
              </Button>
              <Button type="button" variant="outline" onClick={() => setCreatedToken(null)}>
                Dismiss
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      <StatsGrid>
        <StatsCard
          title="Tokens"
          icon={<KeyRound size={16} />}
          value={tokens.length}
          description="Created tokens"
        />
        <StatsCard title="Active" value={activeCount} description="Usable tokens" />
        <StatsCard
          title="Revoked"
          value={tokens.filter((token) => !!token.revokedAt).length}
          description="Manually revoked"
        />
        <StatsCard
          title="Expired"
          value={
            tokens.filter(
              (token) =>
                !token.revokedAt &&
                token.expiresAt &&
                new Date(token.expiresAt).getTime() <= Date.now()
            ).length
          }
          description="Past expiry"
        />
      </StatsGrid>

      <ListCard title="Bearer Tokens" description="SCIM clients authenticate with bearer tokens.">
        {loading ? (
          <div>Loading SCIM tokens...</div>
        ) : tokens.length === 0 ? (
          <EmptyState
            icon={<KeyRound />}
            title="No SCIM tokens"
            description="Create a bearer token for your identity provider SCIM connector."
            action={
              <Button onClick={() => setDialogOpen(true)}>
                <Plus size={16} />
                New Token
              </Button>
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Prefix</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Last Used</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tokens.map((token) => (
                <TableRow key={token.id}>
                  <TableCell>{token.name}</TableCell>
                  <TableCell>
                    <code>{token.tokenPrefix}</code>
                  </TableCell>
                  <TableCell>
                    <Badge variant={isActive(token) ? "default" : "secondary"}>
                      {token.revokedAt ? "Revoked" : isActive(token) ? "Active" : "Expired"}
                    </Badge>
                  </TableCell>
                  <TableCell>{new Date(token.createdAt).toLocaleString()}</TableCell>
                  <TableCell>
                    {token.lastUsedAt ? new Date(token.lastUsedAt).toLocaleString() : "Never"}
                  </TableCell>
                  <TableCell>
                    {token.expiresAt ? new Date(token.expiresAt).toLocaleString() : "Never"}
                  </TableCell>
                  <TableCell>
                    <RowActions
                      items={[
                        {
                          key: "revoke",
                          label: "Revoke",
                          icon: <Trash2 className="h-4 w-4" />,
                          destructive: true,
                          disabled: !!token.revokedAt,
                          onClick: () => revoke(token),
                        },
                      ]}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </ListCard>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create SCIM Token</DialogTitle>
            <DialogDescription>
              The bearer token value is shown exactly once after creation.
            </DialogDescription>
          </DialogHeader>
          <FormGrid columns={1}>
            <FormField label={<Label>Name</Label>}>
              <Input value={name} onChange={(event) => setName(event.target.value)} />
            </FormField>
            <FormField label={<Label>Expires At</Label>}>
              <Input
                type="datetime-local"
                value={expiresAt}
                onChange={(event) => setExpiresAt(event.target.value)}
              />
            </FormField>
          </FormGrid>
          <FormActions withMargin>
            <Button disabled={creating || !name.trim()} onClick={create}>
              Create
            </Button>
          </FormActions>
        </DialogContent>
      </Dialog>
    </div>
  );
}
