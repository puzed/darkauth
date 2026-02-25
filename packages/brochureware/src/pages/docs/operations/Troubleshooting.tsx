import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import DocsCallout from "@/pages/docs/components/DocsCallout";
import { AlertTriangle, Bug, CircleCheckBig, ServerOff } from "lucide-react";

const commonCodes = `401 Unauthorized -> token missing/expired\n403 Forbidden -> missing permission/role\n429 Too Many Requests -> rate limit hit\n500 Internal Server Error -> transient service state`;

const commonConfig = `// Example for DB connection issues\npostgresql://user:pass@db:5432/darkauth\n
// Example for origin mismatch\npublic_origin: https://auth.example.com`;

const TroubleshootingPage = () => {
  return (
    <div className="space-y-8">
      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <Badge variant="outline" className="mb-2 border-primary/30 text-primary">
            Operations: Troubleshooting
          </Badge>
          <CardTitle className="text-2xl">Most common integration issues</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-base text-muted-foreground">
            Use this checklist before opening a support request. Most issues are configuration drift,
            origin mismatches, and missing permissions.
          </p>
        </CardContent>
      </Card>

      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Top errors and fixes</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="rounded-md border border-border/60 bg-muted/50 p-4 text-xs">
            <code>{commonCodes}</code>
          </pre>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-base text-muted-foreground">
            <li>Verify bearer token audience and issuer values first.</li>
            <li>Confirm client auth method and grant type for machine flows.</li>
            <li>Ensure rate-limit policy expectations are documented for your client.</li>
          </ul>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="border-border/60 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Authentication failures</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <ServerOff className="h-4 w-4" />
                Check `/api/session` for session status before retrying login flows.
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Bug className="h-4 w-4" />
                Validate JWKS cache when custom issuer or reverse proxy rewrites are used.
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <CircleCheckBig className="h-4 w-4" />
                Confirm `/install/complete` has finished and initialized database state.
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Config and network checks</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="overflow-x-auto rounded-md border border-border/60 bg-muted/50 p-4 text-xs">
              <code>{commonConfig}</code>
            </pre>
            <p className="mt-3 text-sm text-muted-foreground">
              In containerized deployments verify environment variables and hostnames resolve from both
              user and admin containers/services.
            </p>
          </CardContent>
        </Card>
      </div>

      <DocsCallout title="Rapid debug flow" icon={AlertTriangle}>
        <ul className="list-disc space-y-2 pl-5 text-base">
          <li>Reproduce with a minimal request using curl from the same network namespace.</li>
          <li>Capture response body and headers for error code, request ID, and route path.</li>
          <li>Compare with known payloads in guide pages, then remove custom middleware one-by-one.</li>
        </ul>
      </DocsCallout>

      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">When to escalate</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-base text-muted-foreground">
            Escalate when auth flows fail only with specific org members, or when token claims appear
            malformed across clients using the same config. Include request IDs, environment, and installed
            versions when escalating.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default TroubleshootingPage;
