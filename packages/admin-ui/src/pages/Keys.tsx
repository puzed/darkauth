import { Copy, Download, Key, RefreshCw, Shield } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import PageHeader from "@/components/layout/page-header";
import ListCard from "@/components/list/list-card";
import RowActions from "@/components/row-actions";
import StatsCard, { StatsGrid } from "@/components/stats-card";
import tableStyles from "@/components/table.module.css";
// Page CSS removed; using shared components
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
// dropdown and table ui components not used directly here
import adminApiService, { type JwksInfo } from "@/services/api";

export default function Keys() {
  const [jwks, setJwks] = useState<JwksInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rotating, setRotating] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await adminApiService.getJwks();
      setJwks(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load keys");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const rotate = async () => {
    try {
      setRotating(true);
      await adminApiService.rotateJwks();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to rotate keys");
    } finally {
      setRotating(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Cryptographic Keys"
        subtitle="Manage signing and encryption keys"
        actions={
          <Button variant="outline" onClick={rotate} disabled={rotating}>
            <RefreshCw />
            Rotate Keys
          </Button>
        }
      />
      <StatsGrid>
        <StatsCard
          title="Total Keys"
          icon={<Key size={16} />}
          value={jwks?.keys.length || 0}
          description="JWKS entries"
        />
        <StatsCard
          title="Active Keys"
          icon={<Shield size={16} />}
          value={jwks ? 1 : 0}
          description={`Active kid: ${jwks?.activeKid || "-"}`}
        />
      </StatsGrid>

      <ListCard
        title="Key Management"
        description="View and manage cryptographic keys used for signing and encryption"
      >
        {error && <div>{error}</div>}
        {loading ? (
          <div>Loading keys...</div>
        ) : (
          <table className={tableStyles.table}>
            <thead className={tableStyles.header}>
              <tr>
                <th className={tableStyles.head}>Key Details</th>
                <th className={tableStyles.head}>Algorithm</th>
                <th className={tableStyles.head}>Use</th>
                <th className={tableStyles.head}>Status</th>
                <th className={tableStyles.head}>Created</th>
                <th className={`${tableStyles.head} ${tableStyles.actionCell}`}></th>
              </tr>
            </thead>
            <tbody>
              {jwks?.keys.map((key) => (
                <tr key={key.kid} className={tableStyles.row}>
                  <td className={tableStyles.cell}>
                    <div>
                      <div style={{ fontWeight: 500 }}>{key.kid}</div>
                      <div style={{ fontSize: 12, color: "hsl(var(--muted-foreground))" }}>
                        {key.kty}
                        {key.crv ? ` / ${key.crv}` : ""}
                      </div>
                    </div>
                  </td>
                  <td className={tableStyles.cell}>
                    <div>
                      <div style={{ fontWeight: 500 }}>{key.alg}</div>
                      <div style={{ fontSize: 14, color: "hsl(var(--muted-foreground))" }}>
                        {key.kty}
                      </div>
                    </div>
                  </td>
                  <td className={tableStyles.cell}>
                    <Badge>{key.use}</Badge>
                  </td>
                  <td className={tableStyles.cell}>
                    {jwks?.activeKid === key.kid ? (
                      <Badge>Active</Badge>
                    ) : (
                      <Badge variant="secondary">Inactive</Badge>
                    )}
                  </td>
                  <td className={tableStyles.cell}>
                    {new Date(key.createdAt).toLocaleDateString()}
                  </td>
                  <td className={tableStyles.cell}>
                    <RowActions
                      items={[
                        {
                          key: "export",
                          label: "Export Public Key",
                          icon: <Download size={16} />,
                          onClick: () => {},
                        },
                        {
                          key: "copy",
                          label: "Copy Key ID",
                          icon: <Copy size={16} />,
                          onClick: () => navigator.clipboard.writeText(key.kid),
                        },
                        {
                          key: "activate",
                          label: "Activate Key",
                          onClick: () => {},
                          disabled: true,
                        },
                        {
                          key: "revoke",
                          label: "Revoke Key",
                          destructive: true,
                          onClick: () => {},
                          disabled: true,
                        },
                      ]}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </ListCard>
    </div>
  );
}
