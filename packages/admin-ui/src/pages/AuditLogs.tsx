import { Download, Eye, FileText, Filter, RefreshCcw, X } from "lucide-react";
import { useCallback, useEffect, useId, useState } from "react";
import { useNavigate } from "react-router-dom";
import EmptyState from "@/components/empty-state";
import PageHeader from "@/components/layout/page-header";
import ListCard from "@/components/list/list-card";
import StatsCard, { StatsGrid } from "@/components/stats-card";
import tableStyles from "@/components/table.module.css";
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
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import adminApiService, { type AuditLog, type AuditLogFilters } from "@/services/api";
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
  const [selectedLog, _setSelectedLog] = useState<AuditLog | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalLogs, setTotalLogs] = useState(0);
  const [pageSize] = useState(25);

  // Filter state
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<AuditLogFilters>({
    page: 1,
    limit: 25,
  });

  // Filter form state
  const [searchQuery, setSearchQuery] = useState("");
  const [eventTypeFilter, setEventTypeFilter] = useState<string>("");
  const [successFilter, setSuccessFilter] = useState<string>("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const loadAuditLogs = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await adminApiService.getAuditLogs(filters);
      setLogs(response.auditLogs);
      setCurrentPage(response.pagination.page);
      setTotalPages(response.pagination.totalPages);
      setTotalLogs(response.pagination.total);
    } catch (error) {
      logger.error(error, "Failed to load audit logs");
      setError(error instanceof Error ? error.message : "Failed to load audit logs");
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    loadAuditLogs();
  }, [loadAuditLogs]);

  const applyFilters = () => {
    const newFilters: AuditLogFilters = {
      page: 1,
      limit: pageSize,
    };

    if (searchQuery.trim()) newFilters.search = searchQuery.trim();
    if (eventTypeFilter) newFilters.eventType = eventTypeFilter;
    if (successFilter !== "") newFilters.success = successFilter === "true";
    if (startDate) newFilters.startDate = startDate;
    if (endDate) newFilters.endDate = endDate;

    setFilters(newFilters);
    setCurrentPage(1);
  };

  const clearFilters = () => {
    setSearchQuery("");
    setEventTypeFilter("");
    setSuccessFilter("");
    setStartDate("");
    setEndDate("");
    setFilters({ page: 1, limit: pageSize });
    setCurrentPage(1);
  };

  const handlePageChange = (page: number) => {
    setFilters((prev) => ({ ...prev, page }));
    setCurrentPage(page);
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
    } catch (error) {
      logger.error(error, "Failed to export audit logs");
      setError(error instanceof Error ? error.message : "Failed to export audit logs");
    }
  };

  const openDetailModal = (log: AuditLog) => {
    navigate(`/audit/${log.id}`);
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

  const renderPagination = () => {
    if (totalPages <= 1) return null;

    const pages = [];
    const showEllipsisLeft = currentPage > 3;
    const showEllipsisRight = currentPage < totalPages - 2;

    // Always show first page
    pages.push(1);

    // Add ellipsis if needed
    if (showEllipsisLeft) {
      pages.push(-1); // -1 represents ellipsis
    }

    // Add pages around current page
    for (
      let i = Math.max(2, currentPage - 1);
      i <= Math.min(totalPages - 1, currentPage + 1);
      i++
    ) {
      if (i !== 1 && i !== totalPages) {
        pages.push(i);
      }
    }

    // Add ellipsis if needed
    if (showEllipsisRight) {
      pages.push(-2); // -2 represents ellipsis
    }

    // Always show last page if there's more than one
    if (totalPages > 1) {
      pages.push(totalPages);
    }

    return (
      <Pagination>
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious
              disabled={currentPage === 1}
              onClick={() => currentPage > 1 && handlePageChange(currentPage - 1)}
            />
          </PaginationItem>

          {pages.map((page) => (
            <PaginationItem key={page < 0 ? `ellipsis-${page}` : `page-${page}`}>
              {page < 0 ? (
                <PaginationEllipsis />
              ) : (
                <PaginationLink
                  isActive={page === currentPage}
                  onClick={() => handlePageChange(page)}
                >
                  {page}
                </PaginationLink>
              )}
            </PaginationItem>
          ))}

          <PaginationItem>
            <PaginationNext
              disabled={currentPage === totalPages}
              onClick={() => currentPage < totalPages && handlePageChange(currentPage + 1)}
            />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    );
  };

  if (loading) return <div>Loading audit logs...</div>;

  const successfulLogs = logs.filter((log) => log.success);
  const failedLogs = logs.filter((log) => !log.success);

  return (
    <div>
      <PageHeader
        title="Audit Logs"
        subtitle="Monitor system activity and security events"
        actions={
          <>
            <Button variant="outline" onClick={loadAuditLogs}>
              <RefreshCcw size={16} />
              Refresh
            </Button>
            <Button variant="outline" onClick={handleExport}>
              <Download size={16} />
              Export CSV
            </Button>
          </>
        }
      />

      {error && (
        <div
          style={{
            color: "hsl(var(--destructive))",
            backgroundColor: "hsl(var(--destructive) / 0.1)",
            padding: "12px",
            borderRadius: "8px",
            marginBottom: "16px",
          }}
        >
          {error}
        </div>
      )}

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

      {/* Audit Logs Table */}
      <ListCard
        title="Audit Events"
        description={`Showing ${logs.length} of ${totalLogs} events`}
        rightActions={
          <Button variant="outline" size="icon" onClick={() => setShowFilters(!showFilters)}>
            <Filter size={16} />
          </Button>
        }
      >
        {logs.length === 0 ? (
          <EmptyState
            icon={<FileText />}
            title="No Audit Logs Found"
            description="No events match your current filters"
          />
        ) : (
          <>
            <table className={tableStyles.table}>
              <thead className={tableStyles.header}>
                <tr>
                  <th className={tableStyles.head}>Timestamp</th>
                  <th className={tableStyles.head}>Event Type</th>
                  <th className={tableStyles.head}>Actor</th>
                  <th className={tableStyles.head}>Resource</th>
                  <th className={tableStyles.head}>IP Address</th>
                  <th className={tableStyles.head}>Status</th>
                  <th className={`${tableStyles.head} ${tableStyles.actionCell}`}></th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => {
                  const actor = getActorDisplay(log);
                  return (
                    <tr
                      key={log.id}
                      className={tableStyles.row}
                      style={{ cursor: "pointer" }}
                      onClick={() => openDetailModal(log)}
                    >
                      <td className={tableStyles.cell}>
                        <div style={{ fontSize: "14px" }}>{formatTimestamp(log.timestamp)}</div>
                      </td>
                      <td className={tableStyles.cell}>
                        <Badge variant="secondary">{formatEventType(log.eventType)}</Badge>
                      </td>
                      <td className={tableStyles.cell}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <Badge variant={actor.type === "Admin" ? "default" : "outline"}>
                            {actor.type}
                          </Badge>
                          <span style={{ fontSize: "13px", color: "hsl(var(--muted-foreground))" }}>
                            {actor.id}
                          </span>
                        </div>
                      </td>
                      <td className={tableStyles.cell}>
                        {log.resource ? (
                          <div>
                            <div style={{ fontWeight: "500", fontSize: "14px" }}>
                              {log.resource}
                            </div>
                            {log.resourceId && (
                              <div
                                style={{ fontSize: "12px", color: "hsl(var(--muted-foreground))" }}
                              >
                                {log.resourceId}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span style={{ color: "hsl(var(--muted-foreground))" }}>-</span>
                        )}
                      </td>
                      <td className={tableStyles.cell}>
                        <span style={{ fontFamily: "monospace", fontSize: "13px" }}>
                          {log.ipAddress || "-"}
                        </span>
                      </td>
                      <td className={tableStyles.cell}>
                        <Badge variant={log.success ? "default" : "destructive"}>
                          {log.success ? "Success" : "Failed"}
                        </Badge>
                      </td>
                      <td className={tableStyles.cell}>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            openDetailModal(log);
                          }}
                        >
                          <Eye size={16} />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Pagination */}
            <div style={{ display: "flex", justifyContent: "center", marginTop: "24px" }}>
              {renderPagination()}
            </div>
          </>
        )}
      </ListCard>

      {/* Detail Modal */}
      <Dialog open={showDetailModal} onOpenChange={setShowDetailModal}>
        <DialogContent style={{ maxHeight: "80vh", overflowY: "auto", maxWidth: 800 }}>
          <DialogHeader>
            <DialogTitle>Audit Log Details</DialogTitle>
            <DialogDescription>Event ID: {selectedLog?.id}</DialogDescription>
          </DialogHeader>

          {selectedLog && (
            <div style={{ display: "grid", gap: "16px" }}>
              {/* Basic Info */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "16px" }}>
                <div>
                  <div
                    style={{
                      fontWeight: "600",
                    }}
                  >
                    Timestamp
                  </div>
                  <div style={{ marginTop: "4px" }}>{formatTimestamp(selectedLog.timestamp)}</div>
                </div>
                <div>
                  <div
                    style={{
                      fontWeight: "600",
                    }}
                  >
                    Event Type
                  </div>
                  <div style={{ marginTop: "4px" }}>
                    <Badge>{formatEventType(selectedLog.eventType)}</Badge>
                  </div>
                </div>
                <div>
                  <div
                    style={{
                      fontWeight: "600",
                    }}
                  >
                    Status
                  </div>
                  <div style={{ marginTop: "4px" }}>
                    <Badge variant={selectedLog.success ? "default" : "destructive"}>
                      {selectedLog.success ? "Success" : "Failed"}
                    </Badge>
                  </div>
                </div>
                <div>
                  <div
                    style={{
                      fontWeight: "600",
                    }}
                  >
                    Actor
                  </div>
                  <div style={{ marginTop: "4px" }}>
                    {(() => {
                      const actor = getActorDisplay(selectedLog);
                      return `${actor.type}: ${actor.id}`;
                    })()}
                  </div>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "16px" }}>
                <div>
                  <div
                    style={{
                      fontWeight: 600,
                    }}
                  >
                    Method
                  </div>
                  <div style={{ marginTop: 4 }}>{selectedLog.method || "-"}</div>
                </div>
                <div>
                  <div
                    style={{
                      fontWeight: 600,
                    }}
                  >
                    Path
                  </div>
                  <div
                    style={{
                      marginTop: 4,
                      wordBreak: "break-all",
                    }}
                  >
                    {selectedLog.path || "-"}
                  </div>
                </div>
                <div>
                  <div
                    style={{
                      fontWeight: 600,
                    }}
                  >
                    Status Code
                  </div>
                  <div style={{ marginTop: 4 }}>{selectedLog.statusCode ?? "-"}</div>
                </div>
                <div>
                  <div
                    style={{
                      fontWeight: 600,
                    }}
                  >
                    Response Time
                  </div>
                  <div style={{ marginTop: 4 }}>
                    {selectedLog.responseTime ? `${selectedLog.responseTime} ms` : "-"}
                  </div>
                </div>
              </div>

              {/* Resource Info */}
              {(selectedLog.resource || selectedLog.resourceId) && (
                <div>
                  <div
                    style={{
                      fontWeight: "600",
                    }}
                  >
                    Resource
                  </div>
                  <div style={{ marginTop: "4px" }}>
                    {selectedLog.resource} {selectedLog.resourceId && `(${selectedLog.resourceId})`}
                  </div>
                </div>
              )}

              {/* Network Info */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "16px" }}>
                <div>
                  <div
                    style={{
                      fontWeight: "600",
                    }}
                  >
                    IP Address
                  </div>
                  <div style={{ marginTop: "4px", fontFamily: "monospace" }}>
                    {selectedLog.ipAddress || "-"}
                  </div>
                </div>
                <div>
                  <div
                    style={{
                      fontWeight: "600",
                    }}
                  >
                    User Agent
                  </div>
                  <div
                    style={{
                      marginTop: "4px",
                      wordBreak: "break-all",
                    }}
                  >
                    {selectedLog.userAgent || "-"}
                  </div>
                </div>
              </div>

              {/* Error Message */}
              {selectedLog.errorMessage && (
                <div>
                  <div
                    style={{
                      fontWeight: "600",
                    }}
                  >
                    Error Message
                  </div>
                  <div
                    style={{
                      marginTop: "4px",
                      padding: "8px",
                      backgroundColor: "hsl(var(--destructive) / 0.1)",
                      border: "1px solid hsl(var(--destructive) / 0.3)",
                      borderRadius: "4px",
                    }}
                  >
                    {selectedLog.errorMessage}
                  </div>
                </div>
              )}

              {/* Details JSON */}
              {selectedLog.details && Object.keys(selectedLog.details).length > 0 && (
                <div>
                  <div
                    style={{
                      fontWeight: "600",
                    }}
                  >
                    Details
                  </div>
                  <pre
                    style={{
                      marginTop: "4px",
                      padding: "12px",
                      backgroundColor: "hsl(var(--muted) / 0.1)",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "4px",
                      overflow: "auto",
                      maxHeight: "200px",
                    }}
                  >
                    {JSON.stringify(selectedLog.details, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
