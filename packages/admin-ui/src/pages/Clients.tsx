import { Edit, Plus, Shield, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import EmptyState from "@/components/empty-state";
import ErrorBanner from "@/components/feedback/error-banner";
import PageHeader from "@/components/layout/page-header";
import ListCard from "@/components/list/list-card";
import RowActions from "@/components/row-actions";
import StatsCard, { StatsGrid } from "@/components/stats-card";
import ListPagination from "@/components/table/list-pagination";
import SortableTableHead from "@/components/table/sortable-table-head";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import tableStyles from "@/components/ui/table.module.css";
import adminApiService, { type Client, type SortOrder } from "@/services/api";

export default function Clients() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [sortBy, setSortBy] = useState("createdAt");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

  const toggleSort = (field: string) => {
    setCurrentPage(1);
    if (sortBy === field) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortBy(field);
    setSortOrder("asc");
  };

  const loadClients = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await adminApiService.getClientsPaged({
        page: currentPage,
        limit: 20,
        search: debouncedSearch,
        sortBy,
        sortOrder,
      });
      setClients(response.clients);
      setTotalPages(response.pagination.totalPages);
      setTotalCount(response.pagination.total);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load clients");
    } finally {
      setLoading(false);
    }
  }, [currentPage, debouncedSearch, sortBy, sortOrder]);

  useEffect(() => {
    loadClients();
  }, [loadClients]);

  useEffect(() => {
    const handle = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(handle);
  }, [searchQuery]);

  const handleDelete = async (client: Client) => {
    if (!confirm(`Delete client ${client.clientId}?`)) return;
    try {
      setDeleting(client.clientId);
      await adminApiService.deleteClient(client.clientId);
      setClients((prev) => prev.filter((c) => c.clientId !== client.clientId));
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Failed to delete client");
    } finally {
      setDeleting(null);
    }
  };

  const openClient = (client: Client) => {
    navigate(`/clients/${encodeURIComponent(client.clientId)}`);
  };

  return (
    <div>
      <PageHeader
        title="OAuth Clients"
        subtitle="Manage OAuth/OIDC client applications"
        actions={
          <Button onClick={() => navigate("/clients/new")}>
            <Plus />
            Create Client
          </Button>
        }
      />

      {error && <ErrorBanner>{error}</ErrorBanner>}

      <StatsGrid>
        <StatsCard
          title="Total Clients"
          icon={<Shield size={16} />}
          value={totalCount}
          description="Total configured"
        />
        <StatsCard
          title="Active Clients"
          value={clients.length}
          description="Visible on this page"
        />
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
      >
        {loading ? (
          <div>Loading clients...</div>
        ) : clients.length === 0 ? (
          <EmptyState
            icon={<Shield />}
            title="No clients found"
            description="Create your first client to get started."
          />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHead
                    label="Client"
                    isActive={sortBy === "name"}
                    sortOrder={sortOrder}
                    onToggle={() => toggleSort("name")}
                  />
                  <SortableTableHead
                    label="Type"
                    isActive={sortBy === "type"}
                    sortOrder={sortOrder}
                    onToggle={() => toggleSort("type")}
                  />
                  <SortableTableHead
                    label="Created"
                    isActive={sortBy === "createdAt"}
                    sortOrder={sortOrder}
                    onToggle={() => toggleSort("createdAt")}
                  />
                  <TableHead className={tableStyles.actionCell}>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clients.map((client) => (
                  <TableRow key={client.clientId}>
                    <TableCell>
                      <button
                        type="button"
                        className={tableStyles.primaryActionButton}
                        onClick={() => openClient(client)}
                      >
                        <div>
                          <div className={tableStyles.primaryActionText}>{client.name}</div>
                          <div style={{ fontSize: 12, color: "hsl(var(--muted-foreground))" }}>
                            {client.clientId}
                          </div>
                        </div>
                      </button>
                    </TableCell>
                    <TableCell>
                      <Badge>{client.type}</Badge>
                    </TableCell>
                    <TableCell>{new Date(client.createdAt).toLocaleDateString()}</TableCell>
                    <TableCell>
                      <RowActions
                        items={[
                          {
                            key: "edit",
                            label: "Edit",
                            icon: <Edit className="h-4 w-4" />,
                            onClick: () => openClient(client),
                          },
                          {
                            key: "delete",
                            label: "Delete",
                            icon: <Trash2 className="h-4 w-4" />,
                            destructive: true,
                            disabled: deleting === client.clientId,
                            onClick: () => handleDelete(client),
                          },
                        ]}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div style={{ marginTop: 20 }}>
              <ListPagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
              />
            </div>
          </>
        )}
      </ListCard>
    </div>
  );
}
