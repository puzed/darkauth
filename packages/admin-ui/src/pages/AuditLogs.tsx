import { Download, Eye, FileText, Filter, X } from "lucide-react";
import { useCallback, useEffect, useId, useState } from "react";
import { useNavigate } from "react-router-dom";
import EmptyState from "@/components/empty-state";
import ErrorBanner from "@/components/feedback/error-banner";
import PageHeader from "@/components/layout/page-header";
import ListCard from "@/components/list/list-card";
import StatsCard, { StatsGrid } from "@/components/stats-card";
import ListPagination from "@/components/table/list-pagination";
import SortableTableHead from "@/components/table/sortable-table-head";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import tableStyles from "@/components/ui/table.module.css";
import adminApiService, {
  type AuditLog,
  type AuditLogFilters,
  type SortOrder,
} from "@/services/api";
import { logger } from "@/services/logger";

const EVENT_TYPES = [
  "user_login",
  "user_logout",
  "user_register",
  "admin_login",
  "admin_logout",
  "client_create",
  "client_update",
  "client_delete",
  "user_create",
  "user_update",
  "user_delete",
  "group_create",
  "group_update",
  "group_delete",
  "permission_create",
  "permission_delete",
  "settings_update",
  "jwks_rotate",
];

export default function AuditLogs() {
  const uid = useId();
  const navigate = useNavigate();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [pageSize] = useState(25);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalLogs, setTotalLogs] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [eventTypeFilter, setEventTypeFilter] = useState("");
  const [successFilter, setSuccessFilter] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [filters, setFilters] = useState<AuditLogFilters>({
    page: 1,
    limit: pageSize,
    sortBy: "timestamp",
    sortOrder: "desc",
  });

  const loadAuditLogs = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await adminApiService.getAuditLogs(filters);
      setLogs(response.auditLogs);
      setCurrentPage(response.pagination.page);
      setTotalPages(response.pagination.totalPages);
      setTotalLogs(response.pagination.total);
    } catch (loadError) {
      logger.error(loadError, "Failed to load audit logs");
      setError(loadError instanceof Error ? loadError.message : "Failed to load audit logs");
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    loadAuditLogs();
  }, [loadAuditLogs]);

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedSearch(searchQuery.trim()), 300);
    return () => clearTimeout(handle);
  }, [searchQuery]);

  useEffect(() => {
    setFilters((prev) => ({ ...prev, page: 1, search: debouncedSearch || undefined }));
  }, [debouncedSearch]);

  const applyFilters = () => {
    setFilters((prev) => ({
      ...prev,
      page: 1,
      eventType: eventTypeFilter && eventTypeFilter !== "all" ? eventTypeFilter : undefined,
      success:
        successFilter === "" || successFilter === "all" ? undefined : successFilter === "true",
      startDate: startDate || undefined,
      endDate: endDate || undefined,
    }));
  };

  const clearFilters = () => {
    setSearchQuery("");
    setDebouncedSearch("");
    setEventTypeFilter("");
    setSuccessFilter("");
    setStartDate("");
    setEndDate("");
    setFilters({ page: 1, limit: pageSize, sortBy: "timestamp", sortOrder: "desc" });
  };

  const toggleSort = (field: string) => {
    setFilters((prev) => {
      const isActive = prev.sortBy === field;
      const nextOrder: SortOrder = isActive ? (prev.sortOrder === "asc" ? "desc" : "asc") : "asc";
      return { ...prev, page: 1, sortBy: field, sortOrder: nextOrder };
    });
  };

  const handleExport = async () => {
    try {
      const blob = await adminApiService.exportAuditLogs(filters);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `audit-logs-${new Date().toISOString().split("T")[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (exportError) {
      logger.error(exportError, "Failed to export audit logs");
      setError(exportError instanceof Error ? exportError.message : "Failed to export audit logs");
    }
  };

  const openDetail = (log: AuditLog) => {
    navigate(`/audit/${encodeURIComponent(log.id)}`);
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  const formatEventType = (eventType: string | undefined) => {
    if (!eventType) return "Unknown";
    return eventType
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  const getActorDisplay = (log: AuditLog) => {
    const type = log.actorType || (log.adminId ? "Admin" : log.userId ? "User" : "System");
    const id = log.actorEmail || log.actorId || log.adminId || log.userId || "system";
    return { type, id };
  };

  const successfulLogs = logs.filter((log) => log.success);
  const failedLogs = logs.filter((log) => !log.success);

  return (
    <div>
      <PageHeader
        title="Audit Logs"
        subtitle="Monitor system activity and security events"
        actions={
          <Button variant="outline" onClick={handleExport}>
            <Download size={16} />
            Export CSV
          </Button>
        }
      />

      {error && <ErrorBanner>{error}</ErrorBanner>}

      <StatsGrid>
        <StatsCard
          title="Total Events"
          icon={<FileText size={16} />}
          value={totalLogs}
          description="All audit events"
        />
        <StatsCard title="Successful" value={successfulLogs.length} description="Success events" />
        <StatsCard title="Failed" value={failedLogs.length} description="Failed events" />
      </StatsGrid>

      {showFilters && (
        <ListCard
          title="Filters"
          rightActions={
            <Button variant="ghost" size="icon" onClick={() => setShowFilters(false)}>
              <X size={16} />
            </Button>
          }
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: "16px",
              alignItems: "end",
            }}
          >
            <div>
              <Label htmlFor={`${uid}-audit-search`}>Search</Label>
              <Input
                id={`${uid}-audit-search`}
                placeholder="Search logs..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div>
              <Label>Event Type</Label>
              <Select value={eventTypeFilter} onValueChange={setEventTypeFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All event types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All event types</SelectItem>
                  {EVENT_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {formatEventType(type)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Status</Label>
              <Select value={successFilter} onValueChange={setSuccessFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="true">Success</SelectItem>
                  <SelectItem value="false">Failed</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor={`${uid}-audit-start-date`}>Start Date</Label>
              <Input
                id={`${uid}-audit-start-date`}
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor={`${uid}-audit-end-date`}>End Date</Label>
              <Input
                id={`${uid}-audit-end-date`}
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <Button onClick={applyFilters}>Apply Filters</Button>
            <Button variant="outline" onClick={clearFilters}>
              Clear Filters
            </Button>
          </div>
        </ListCard>
      )}

      <ListCard
        title="Audit Events"
        description={`Showing ${logs.length} of ${totalLogs} events`}
        search={{ placeholder: "Search logs...", value: searchQuery, onChange: setSearchQuery }}
        rightActions={
          <Button variant="outline" size="icon" onClick={() => setShowFilters(!showFilters)}>
            <Filter size={16} />
          </Button>
        }
      >
        {loading ? (
          <div>Loading audit logs...</div>
        ) : logs.length === 0 ? (
          <EmptyState
            icon={<FileText />}
            title="No Audit Logs Found"
            description="No events match your current filters"
          />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHead
                    label="Timestamp"
                    isActive={filters.sortBy === "timestamp"}
                    sortOrder={filters.sortOrder || "desc"}
                    onToggle={() => toggleSort("timestamp")}
                  />
                  <SortableTableHead
                    label="Event Type"
                    isActive={filters.sortBy === "eventType"}
                    sortOrder={filters.sortOrder || "desc"}
                    onToggle={() => toggleSort("eventType")}
                  />
                  <TableHead>Actor</TableHead>
                  <TableHead>Resource</TableHead>
                  <TableHead>IP Address</TableHead>
                  <SortableTableHead
                    label="Status"
                    isActive={filters.sortBy === "success"}
                    sortOrder={filters.sortOrder || "desc"}
                    onToggle={() => toggleSort("success")}
                  />
                  <TableHead className={tableStyles.actionCell}></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => {
                  const actor = getActorDisplay(log);
                  return (
                    <TableRow
                      key={log.id}
                      onClick={() => openDetail(log)}
                      style={{ cursor: "pointer" }}
                    >
                      <TableCell>
                        <button
                          type="button"
                          className={tableStyles.primaryActionButton}
                          onClick={(event) => {
                            event.stopPropagation();
                            openDetail(log);
                          }}
                        >
                          <span className={tableStyles.primaryActionText}>
                            {formatTimestamp(log.timestamp)}
                          </span>
                        </button>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{formatEventType(log.eventType)}</Badge>
                      </TableCell>
                      <TableCell>
                        <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                          <Badge variant={actor.type === "Admin" ? "default" : "outline"}>
                            {actor.type}
                          </Badge>
                          <span style={{ fontSize: 13, color: "hsl(var(--muted-foreground))" }}>
                            {actor.id}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {log.resource ? (
                          <div>
                            <div style={{ fontWeight: 500, fontSize: 14 }}>{log.resource}</div>
                            {log.resourceId && (
                              <div style={{ fontSize: 12, color: "hsl(var(--muted-foreground))" }}>
                                {log.resourceId}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span style={{ color: "hsl(var(--muted-foreground))" }}>-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span style={{ fontFamily: "monospace", fontSize: 13 }}>
                          {log.ipAddress || "-"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge variant={log.success ? "default" : "destructive"}>
                          {log.success ? "Success" : "Failed"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(event) => {
                            event.stopPropagation();
                            openDetail(log);
                          }}
                        >
                          <Eye size={16} />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>

            <div style={{ display: "flex", justifyContent: "center", marginTop: 24 }}>
              <ListPagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={(page) => {
                  setCurrentPage(page);
                  setFilters((prev) => ({ ...prev, page }));
                }}
              />
            </div>
          </>
        )}
      </ListCard>
    </div>
  );
}
