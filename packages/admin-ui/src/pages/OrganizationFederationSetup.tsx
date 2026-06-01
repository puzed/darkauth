import { ArrowLeft, Copy, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import ErrorBanner from "@/components/feedback/error-banner";
import { FormField, FormGrid } from "@/components/layout/form-grid";
import PageHeader from "@/components/layout/page-header";
import MutedText from "@/components/text/muted-text";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import adminApiService, {
  type FederationConnection,
  type FederationConnectionDomain,
  type Organization,
} from "@/services/api";
import styles from "./OrganizationFederationSetup.module.css";

function recordNameForDomain(domain: FederationConnectionDomain): string {
  return domain.recordName || `_darkauth-verification.${domain.domain}`;
}

function recordValueForDomain(domain: FederationConnectionDomain): string {
  return domain.recordValue || "";
}

function statusVariant(
  status: FederationConnectionDomain["verificationStatus"]
): "default" | "secondary" | "outline" {
  if (status === "verified") return "default";
  if (status === "failed") return "outline";
  return "secondary";
}

function CopyField({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.dnsField}>
      <Label>{label}</Label>
      <div className={styles.copyRow}>
        <Input value={value} readOnly />
        <Button
          type="button"
          variant="outline"
          onClick={() => navigator.clipboard.writeText(value)}
        >
          <Copy size={16} />
          Copy
        </Button>
      </div>
    </div>
  );
}

export default function OrganizationFederationSetup() {
  const { organizationId, connectionId } = useParams<{
    organizationId: string;
    connectionId: string;
  }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [connection, setConnection] = useState<FederationConnection | null>(null);
  const [domains, setDomains] = useState<FederationConnectionDomain[]>([]);
  const [publicOrigin, setPublicOrigin] = useState<string>("");
  const [newDomain, setNewDomain] = useState("");
  const [addingDomain, setAddingDomain] = useState(false);
  const [busyDomainId, setBusyDomainId] = useState<string | null>(null);

  const loadDomains = useCallback(async () => {
    if (!connectionId) return;
    const response = await adminApiService.getFederationConnectionDomains(connectionId);
    setDomains(response.domains);
  }, [connectionId]);

  const loadData = useCallback(async () => {
    if (!organizationId || !connectionId) {
      setError("Organization and connection are required");
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const [orgData, connectionData, settings] = await Promise.all([
        adminApiService.getOrganization(organizationId),
        adminApiService.getFederationConnection(connectionId),
        adminApiService.getSystemSettings().catch(() => null),
      ]);
      setOrganization(orgData);
      setConnection(connectionData);
      if (settings) {
        const origin =
          (typeof settings.publicOrigin === "string" && settings.publicOrigin) ||
          (typeof settings.issuer === "string" && settings.issuer) ||
          "";
        setPublicOrigin(origin.replace(/\/$/, ""));
      }
      try {
        await loadDomains();
      } catch {
        setDomains([]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load connection");
    } finally {
      setLoading(false);
    }
  }, [organizationId, connectionId, loadDomains]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const callbackUrl = useMemo(() => {
    if (!publicOrigin) return "";
    return `${publicOrigin}/api/user/federation/oidc/callback`;
  }, [publicOrigin]);

  const addDomain = async () => {
    if (!connectionId || !newDomain.trim()) return;
    try {
      setAddingDomain(true);
      setError(null);
      const created = await adminApiService.addFederationConnectionDomain(
        connectionId,
        newDomain.trim()
      );
      setDomains((current) => [...current, created]);
      setNewDomain("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add domain");
    } finally {
      setAddingDomain(false);
    }
  };

  const verifyDomain = async (domain: FederationConnectionDomain) => {
    if (!connectionId) return;
    try {
      setBusyDomainId(domain.id);
      setError(null);
      const updated = await adminApiService.verifyFederationConnectionDomain(
        connectionId,
        domain.id
      );
      setDomains((current) =>
        current.map((item) => (item.id === domain.id ? { ...item, ...updated } : item))
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to verify domain");
    } finally {
      setBusyDomainId(null);
    }
  };

  const removeDomain = async (domain: FederationConnectionDomain) => {
    if (!connectionId) return;
    if (!confirm(`Remove domain "${domain.domain}" from this connection?`)) return;
    try {
      setBusyDomainId(domain.id);
      setError(null);
      await adminApiService.deleteFederationConnectionDomain(connectionId, domain.id);
      setDomains((current) => current.filter((item) => item.id !== domain.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to remove domain");
    } finally {
      setBusyDomainId(null);
    }
  };

  if (loading) return <div>Loading connection...</div>;

  if (error && !connection) {
    return (
      <div>
        <ErrorBanner withMargin>{error}</ErrorBanner>
        <Button
          variant="outline"
          onClick={() =>
            navigate(
              organizationId
                ? `/organizations/${encodeURIComponent(organizationId)}`
                : "/organizations"
            )
          }
        >
          <ArrowLeft size={16} />
          Back to organization
        </Button>
      </div>
    );
  }

  if (!connection) return null;

  return (
    <div>
      <PageHeader
        title="SSO Connection Setup"
        subtitle={`${connection.name}${organization ? ` · ${organization.name}` : ""}`}
        actions={
          <Button
            variant="outline"
            onClick={() =>
              navigate(
                organizationId
                  ? `/organizations/${encodeURIComponent(organizationId)}`
                  : "/organizations"
              )
            }
          >
            <ArrowLeft size={16} />
            Back to organization
          </Button>
        }
      />

      {error && <ErrorBanner withMargin>{error}</ErrorBanner>}

      <Card style={{ marginBottom: 24 }}>
        <CardHeader>
          <CardTitle>Identity Provider Callback</CardTitle>
          <MutedText size="sm">
            Add this redirect URI to the OIDC application in your identity provider.
          </MutedText>
        </CardHeader>
        <CardContent>
          {callbackUrl ? (
            <CopyField label="Redirect URI" value={callbackUrl} />
          ) : (
            <MutedText size="sm">
              Public origin is not configured, so the callback URL cannot be displayed.
            </MutedText>
          )}
          <FormGrid columns={2}>
            <FormField label={<Label>Issuer</Label>}>
              <Input value={connection.issuer} readOnly />
            </FormField>
            <FormField label={<Label>Client ID</Label>}>
              <Input value={connection.clientId} readOnly />
            </FormField>
          </FormGrid>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Domains</CardTitle>
          <MutedText size="sm">
            Email-domain routing only activates after a domain is verified. Add the DNS TXT record
            below, then retry verification.
          </MutedText>
        </CardHeader>
        <CardContent>
          <div className={styles.addDomainRow}>
            <Input
              value={newDomain}
              placeholder="example.com"
              onChange={(event) => setNewDomain(event.target.value)}
              disabled={addingDomain}
            />
            <Button onClick={addDomain} disabled={addingDomain || !newDomain.trim()}>
              <Plus size={16} />
              Add Domain
            </Button>
          </div>

          {domains.length === 0 ? (
            <MutedText size="sm" spacing="sm">
              No domains have been added to this connection yet.
            </MutedText>
          ) : (
            <div className={styles.domainList} style={{ marginTop: 16 }}>
              {domains.map((domain) => {
                const recordName = recordNameForDomain(domain);
                const recordValue = recordValueForDomain(domain);
                return (
                  <div key={domain.id} className={styles.domainItem}>
                    <div className={styles.domainMeta}>
                      <div className={styles.domainName}>{domain.domain}</div>
                      <div>
                        <Badge variant={statusVariant(domain.verificationStatus)}>
                          {domain.verificationStatus}
                        </Badge>
                      </div>
                      {domain.lastCheckedAt ? (
                        <MutedText size="sm">
                          Last checked {new Date(domain.lastCheckedAt).toLocaleString()}
                        </MutedText>
                      ) : null}
                      {domain.verificationStatus !== "verified" ? (
                        <div className={styles.dnsRecord} style={{ marginTop: 8 }}>
                          <CopyField label="DNS TXT record name" value={recordName} />
                          {recordValue ? (
                            <CopyField label="DNS TXT record value" value={recordValue} />
                          ) : (
                            <MutedText size="sm">
                              The DNS TXT value is shown when the domain is created. Re-add the
                              domain if you no longer have it.
                            </MutedText>
                          )}
                        </div>
                      ) : null}
                    </div>
                    <div className={styles.domainActions}>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={busyDomainId === domain.id}
                        onClick={() => verifyDomain(domain)}
                      >
                        <RefreshCw size={16} />
                        Retry verification
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={busyDomainId === domain.id}
                        onClick={() => removeDomain(domain)}
                      >
                        <Trash2 size={16} />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
