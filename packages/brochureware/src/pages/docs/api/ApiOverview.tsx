import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, Globe, Layers, Shield, ServerCog, KeyRound } from "lucide-react";

const ApiOverviewPage = () => {
  return (
    <div className="space-y-8">
      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <Badge variant="outline" className="mb-2 border-primary/30 text-primary">
            API Overview
          </Badge>
          <CardTitle className="text-2xl">Endpoint map and integration boundaries</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-base text-muted-foreground">
            DarkAuth has two public HTTP surfaces: user APIs on `/api/*` and admin APIs on `/admin/*`.
            Both are generated from schema-driven controllers and include consistent auth and error patterns.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="border-border/60 shadow-sm">
          <CardContent className="p-6 space-y-3">
            <div className="mb-2 flex items-center gap-2 text-foreground">
              <Globe className="h-5 w-5 text-primary" />
              <h3 className="font-semibold">User API (`/api`)</h3>
            </div>
            <ul className="list-disc space-y-2 pl-5 text-base text-muted-foreground">
              <li>Auth flows: `/api/authorize`, `/api/token`, `/api/session`, `/api/logout`.</li>
              <li>Identity: OPAQUE start/finish for register and login.</li>
              <li>Directory and org endpoints for consuming apps and user surfaces.</li>
              <li>Public/Opaque crypto endpoints for wrapped key operations.</li>
            </ul>
            <p className="text-sm text-muted-foreground">
              Primary use: user-facing web apps and trusted service integrations with PKCE or client credentials.
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-sm">
          <CardContent className="p-6 space-y-3">
            <div className="mb-2 flex items-center gap-2 text-foreground">
              <ServerCog className="h-5 w-5 text-primary" />
              <h3 className="font-semibold">Admin API (`/admin`)</h3>
            </div>
            <ul className="list-disc space-y-2 pl-5 text-base text-muted-foreground">
              <li>Tenant bootstrapping and identity providers.</li>
              <li>Full RBAC management: clients, users, roles, permissions, groups, orgs.</li>
              <li>Audit trail and settings surfaces.</li>
              <li>Admin-only OTP and security tooling.</li>
            </ul>
            <p className="text-sm text-muted-foreground">
              Primary use: operations tooling and automated provisioning.
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="border-border/60 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Common conventions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex gap-2 items-start">
                <CheckCircle2 className="h-4 w-4 text-primary mt-1" />
                <p className="text-base text-muted-foreground">All responses use JSON for normal flows and standard HTTP error envelopes.</p>
              </div>
              <div className="flex gap-2 items-start">
                <Layers className="h-4 w-4 text-primary mt-1" />
                <p className="text-base text-muted-foreground">Routes are scoped through runtime middleware with CSRF and rate limits by area.</p>
              </div>
              <div className="flex gap-2 items-start">
                <Shield className="h-4 w-4 text-primary mt-1" />
                <p className="text-base text-muted-foreground">JWT issuance includes issuer, subject, role, and permission claims as needed.</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">How to get full spec</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-base text-muted-foreground">
              Use the generated OpenAPI document for complete payload validation and tooling import:
            </p>
            <p className="mt-3 text-sm text-muted-foreground">
              <code>GET /api/openapi</code>
            </p>
            <p className="mt-3 text-base text-muted-foreground">
              Keep it regenerated in runtime to match your install-time modules and settings.
            </p>
            <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
              <KeyRound className="h-4 w-4" />
              Endpoint docs by category are below.
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ApiOverviewPage;
