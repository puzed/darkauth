import { Edit, Filter, Plus, RefreshCcw, Shield, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import PageHeader from "@/components/layout/page-header";
import ListCard from "@/components/list/list-card";
import RowActions from "@/components/row-actions";
import StatsCard, { StatsGrid } from "@/components/stats-card";
// Page-specific CSS removed; using shared components only
import tableStyles from "@/components/table.module.css";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import adminApiService, { type Client } from "@/services/api";

export default function Clients() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [_deleting, setDeleting] = useState<string | null>(null);

  const loadClients = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await adminApiService.getClients();
      setClients(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load clients");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadClients();
  }, [loadClients]);

  const filteredClients = clients.filter(
    (client) =>
      client.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      client.clientId.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div>
      <PageHeader
        title="OAuth Clients"
        subtitle="Manage OAuth/OIDC client applications"
        actions={
          <>
            <Button variant="outline" onClick={loadClients}>
              <RefreshCcw />
              Refresh
            </Button>
            <Button onClick={() => navigate("/clients/new")}>
              <Plus />
              Create Client
            </Button>
          </>
        }
      />

      <StatsGrid>
        <StatsCard
          title="Total Clients"
          icon={<Shield size={16} />}
          value={clients.length}
          description="Total configured"
        />
        <StatsCard title="Active Clients" value={clients.length} description="Enabled" />
        <StatsCard
          title="Public"
          value={clients.filter((c) => c.type === "public").length}
          description="Public clients"
        />
        <StatsCard
          title="Confidential"
          value={clients.filter((c) => c.type === "confidential").length}
          description="Confidential clients"
        />
      </StatsGrid>

      <ListCard
        title="Client Applications"
        description="Manage OAuth/OIDC client configurations"
        search={{ placeholder: "Search clients...", value: searchQuery, onChange: setSearchQuery }}
        rightActions={
          <Button variant="outline" size="icon">
            <Filter size={16} />
          </Button>
        }
      >
        {error && <div>{error}</div>}
        {loading ? (
          <div>Loading clients...</div>
        ) : filteredClients.length === 0 ? (
          <div>No clients found</div>
        ) : (
          <table className={tableStyles.table}>
            <thead className={tableStyles.header}>
              <tr>
                <th className={tableStyles.head}>Client</th>
                <th className={tableStyles.head}>Type</th>
                <th className={tableStyles.head}>Created</th>
                <th className={`${tableStyles.head} ${tableStyles.actionCell}`}></th>
              </tr>
            </thead>
            <tbody>
              {filteredClients.map((client) => (
                <tr key={client.clientId} className={tableStyles.row}>
                  <td className={tableStyles.cell}>
                    <div>
                      <div style={{ fontWeight: 500 }}>{client.name}</div>
                      <div style={{ fontSize: 12, color: "hsl(var(--muted-foreground))" }}>
                        {client.clientId}
                      </div>
                    </div>
                  </td>
                  <td className={tableStyles.cell}>
                    <Badge>{client.type}</Badge>
                  </td>
                  <td className={tableStyles.cell}>
                    {new Date(client.createdAt).toLocaleDateString()}
                  </td>
                  <td className={tableStyles.cell}>
                    <RowActions
                      items={[
                        {
                          key: "edit",
                          label: "Edit Client",
                          icon: <Edit className="h-4 w-4" />,
                          onClick: () => navigate(`/clients/${client.clientId}`),
                        },
                        {
                          key: "delete",
                          label: "Delete Client",
                          icon: <Trash2 className="h-4 w-4" />,
                          destructive: true,
                          onClick: async () => {
                            if (!confirm(`Delete client ${client.clientId}?`)) return;
                            try {
                              setDeleting(client.clientId);
                              await adminApiService.deleteClient(client.clientId);
                              setClients((prev) =>
                                prev.filter((c) => c.clientId !== client.clientId)
                              );
                            } catch (e) {
                              setError(e instanceof Error ? e.message : "Failed to delete client");
                            } finally {
                              setDeleting(null);
                            }
                          },
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
