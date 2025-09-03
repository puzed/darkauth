import { ArrowLeft, FileText } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import PageHeader from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import adminApiService, { type AuditLog } from "@/services/api";

function formatTimestamp(ts: string) {
  return new Date(ts).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatEventType(t: string | undefined) {
  if (!t) return "Unknown";
  return t
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export default function AuditLogDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<AuditLog | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      setError(null);
      const data = await adminApiService.getAuditLog(id);
      setLog(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load audit log");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <div>Loading audit log...</div>;

  if (error)
    return (
      <div>
        <div>{error}</div>
        <button type="button" onClick={() => navigate("/audit")}>
          Back
        </button>
      </div>
    );

  if (!log) return null;

  const actor = (() => {
    const type = log.actorType || (log.adminId ? "Admin" : log.userId ? "User" : "System");
    const email = log.actorEmail || undefined;
    const id = (log.adminId || log.userId) ?? undefined;
    const link =
      type === "Admin" && log.adminId
        ? `/settings/admin-users/${log.adminId}/edit`
        : type === "User" && log.userId
          ? `/users/${log.userId}`
          : undefined;
    return { type, email, id, link };
  })();

  return (
    <div>
      <PageHeader
        title="Audit Event"
        subtitle={`Event ID: ${log.id}`}
        actions={
          <Button variant="outline" onClick={() => navigate("/audit")}>
            <ArrowLeft size={16} />
            Back
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16 }}>
            <div>
              <div style={{ fontWeight: 600 }}>Timestamp</div>
              <div style={{ marginTop: 4 }}>{formatTimestamp(log.timestamp)}</div>
            </div>
            <div>
              <div style={{ fontWeight: 600 }}>Event Type</div>
              <div style={{ marginTop: 4 }}>
                <Badge>{formatEventType(log.eventType)}</Badge>
              </div>
            </div>
            <div>
              <div style={{ fontWeight: 600 }}>Status</div>
              <div style={{ marginTop: 4 }}>
                <Badge variant={log.success ? "default" : "destructive"}>
                  {log.success ? "Success" : "Failed"}
                </Badge>
              </div>
            </div>
            <div>
              <div style={{ fontWeight: 600 }}>Actor</div>
              <div style={{ marginTop: 4, display: "flex", flexDirection: "column" }}>
                <div>
                  {actor.type}: {actor.email || actor.id || "system"}
                </div>
                {actor.id && (
                  <div>
                    ID: <span style={{ fontFamily: "monospace" }}>{actor.id}</span>
                    {actor.link && (
                      <>
                        {" "}
                        •{" "}
                        <a
                          href={actor.link}
                          onClick={(e) => {
                            e.preventDefault();
                            if (actor.link) navigate(actor.link);
                          }}
                        >
                          View
                        </a>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div>
              <div style={{ fontWeight: 600 }}>Method</div>
              <div style={{ marginTop: 4 }}>{log.method || "-"}</div>
            </div>
            <div>
              <div style={{ fontWeight: 600 }}>Path</div>
              <div
                style={{
                  marginTop: 4,
                  wordBreak: "break-all",
                }}
              >
                {log.path || "-"}
              </div>
            </div>
            <div>
              <div style={{ fontWeight: 600 }}>Status Code</div>
              <div style={{ marginTop: 4 }}>{log.statusCode ?? "-"}</div>
            </div>
            <div>
              <div style={{ fontWeight: 600 }}>Response Time</div>
              <div style={{ marginTop: 4 }}>
                {log.responseTime ? `${log.responseTime} ms` : "-"}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div style={{ height: 16 }} />

      <Card>
        <CardHeader>
          <CardTitle>Request Context</CardTitle>
        </CardHeader>
        <CardContent>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16 }}>
            <div>
              <div style={{ fontWeight: 600 }}>IP Address</div>
              <div style={{ marginTop: 4, fontFamily: "monospace" }}>{log.ipAddress || "-"}</div>
            </div>
            <div>
              <div style={{ fontWeight: 600 }}>User Agent</div>
              <div
                style={{
                  marginTop: 4,
                  wordBreak: "break-all",
                }}
              >
                {log.userAgent || "-"}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {(log.resource || log.resourceId) && (
        <>
          <div style={{ height: 16 }} />
          <Card>
            <CardHeader>
              <CardTitle>Resource</CardTitle>
            </CardHeader>
            <CardContent>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16 }}>
                <div>
                  <div style={{ fontWeight: 600 }}>Type</div>
                  <div style={{ marginTop: 4 }}>{log.resource || "-"}</div>
                </div>
                <div>
                  <div style={{ fontWeight: 600 }}>ID</div>
                  <div style={{ marginTop: 4 }}>{log.resourceId || "-"}</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {log.errorMessage && (
        <>
          <div style={{ height: 16 }} />
          <Card>
            <CardHeader>
              <CardTitle style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <FileText size={16} /> Error Message
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div
                style={{
                  padding: 8,
                  backgroundColor: "hsl(var(--destructive) / 0.1)",
                  border: "1px solid hsl(var(--destructive) / 0.3)",
                  borderRadius: 4,
                }}
              >
                {log.errorMessage}
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {log.details && Object.keys(log.details).length > 0 && (
        <>
          <div style={{ height: 16 }} />
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent>
              <pre
                style={{
                  padding: 12,
                  backgroundColor: "hsl(var(--muted) / 0.1)",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 4,
                  overflow: "auto",
                  maxHeight: 320,
                }}
              >
                {JSON.stringify(log.details, null, 2)}
              </pre>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
