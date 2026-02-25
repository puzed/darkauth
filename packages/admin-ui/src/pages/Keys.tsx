import { Copy, Download, Key, RefreshCw, Search, Shield } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
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
import adminApiService, { type JwksInfo, type SortOrder } from "@/services/api";

export default function Keys() {
  const [jwks, setJwks] = useState<JwksInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rotating, setRotating] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [sortBy, setSortBy] = useState("createdAt");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const pageSize = 20;

  const toggleSort = (field: string) => {
    setCurrentPage(1);
    if (sortBy === field) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortBy(field);
    setSortOrder("asc");
  };

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await adminApiService.getJwks();
      setJwks(data);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load keys");
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
    } catch (rotateError) {
      setError(rotateError instanceof Error ? rotateError.message : "Failed to rotate keys");
    } finally {
      setRotating(false);
    }
  };

  const allKeys = jwks?.keys || [];

  const filteredAndSorted = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = q
      ? allKeys.filter(
          (key) =>
            key.kid.toLowerCase().includes(q) ||
            key.alg.toLowerCase().includes(q) ||
            key.kty.toLowerCase().includes(q) ||
            key.use.toLowerCase().includes(q)
        )
      : allKeys;

    return filtered.sort((a, b) => {
      let left = "";
      let right = "";
      if (sortBy === "createdAt") {
        left = a.createdAt;
        right = b.createdAt;
      } else {
        left = String(a[sortBy as keyof typeof a] || "").toLowerCase();
        right = String(b[sortBy as keyof typeof b] || "").toLowerCase();
      }
      if (left < right) return sortOrder === "asc" ? -1 : 1;
      if (left > right) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });
  }, [allKeys, searchQuery, sortBy, sortOrder]);

  const totalPages = Math.max(1, Math.ceil(filteredAndSorted.length / pageSize));
  const pagedKeys = filteredAndSorted.slice((currentPage - 1) * pageSize, currentPage * pageSize);

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
          value={allKeys.length}
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
        search={{
          placeholder: "Search keys...",
          value: searchQuery,
          onChange: (value) => {
            setCurrentPage(1);
            setSearchQuery(value);
          },
        }}
        rightActions={
          <Button variant="outline" size="icon" aria-label="Search keys">
            <Search size={16} />
          </Button>
        }
      >
        {error && <div>{error}</div>}
        {loading ? (
          <div>Loading keys...</div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHead
                    label="Key Details"
                    isActive={sortBy === "kid"}
                    sortOrder={sortOrder}
                    onToggle={() => toggleSort("kid")}
                  />
                  <SortableTableHead
                    label="Algorithm"
                    isActive={sortBy === "alg"}
                    sortOrder={sortOrder}
                    onToggle={() => toggleSort("alg")}
                  />
                  <TableHead>Use</TableHead>
                  <TableHead>Status</TableHead>
                  <SortableTableHead
                    label="Created"
                    isActive={sortBy === "createdAt"}
                    sortOrder={sortOrder}
                    onToggle={() => toggleSort("createdAt")}
                  />
                  <TableHead className={tableStyles.actionCell}></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagedKeys.map((key) => (
                  <TableRow key={key.kid}>
                    <TableCell>
                      <div>
                        <div style={{ fontWeight: 500 }}>{key.kid}</div>
                        <div style={{ fontSize: 12, color: "hsl(var(--muted-foreground))" }}>
                          {key.kty}
                          {key.crv ? ` / ${key.crv}` : ""}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <div style={{ fontWeight: 500 }}>{key.alg}</div>
                        <div style={{ fontSize: 14, color: "hsl(var(--muted-foreground))" }}>
                          {key.kty}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge>{key.use}</Badge>
                    </TableCell>
                    <TableCell>
                      {jwks?.activeKid === key.kid ? (
                        <Badge>Active</Badge>
                      ) : (
                        <Badge variant="secondary">Inactive</Badge>
                      )}
                    </TableCell>
                    <TableCell>{new Date(key.createdAt).toLocaleDateString()}</TableCell>
                    <TableCell>
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
