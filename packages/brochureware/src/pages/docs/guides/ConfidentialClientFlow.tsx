import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import DocsCallout from "@/pages/docs/components/DocsCallout";
import { Building2, KeyRound, Lock, RefreshCw, ServerCog } from "lucide-react";

const tokenRequest = `POST /api/token\nContent-Type: application/x-www-form-urlencoded\nAuthorization: Basic <base64(client_id:client_secret)>\n\ngrant_type=client_credentials&scope=darkauth.users:read`;

const clientCredentialsExample = `const basic = Buffer.from("my-service-client:super-secret").toString("base64");

const response = await fetch("https://auth.example.com/api/token", {
  method: "POST",
  headers: {
    "Content-Type": "application/x-www-form-urlencoded",
    Authorization: \`Basic \${basic}\`,
  },
  body: "grant_type=client_credentials&scope=darkauth.users:read",
});

const { access_token } = await response.json();`;

const apiCall = `const response = await fetch("https://auth.example.com/api/users?search=alice", {
  headers: {
    Authorization: \`Bearer \${access_token}\`,
  },
});`;

const ConfidentialClientFlowPage = () => {
  return (
    <div className="space-y-8">
      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <Badge variant="outline" className="mb-2 border-primary/30 text-primary">
            Guide: Confidential Client Flow
          </Badge>
          <CardTitle className="text-2xl">Server-side service integrations</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-base text-muted-foreground">
            Confidentional clients are expected to protect secrets and use OAuth client credentials for
            machine-to-machine access and management-oriented APIs.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="border-border/60 shadow-sm">
          <CardContent className="p-6 space-y-3">
            <div className="mb-1 flex items-center gap-2 text-foreground">
              <ServerCog className="h-5 w-5 text-primary" />
              <h3 className="font-semibold">Client requirements</h3>
            </div>
            <ul className="list-disc space-y-2 pl-5 text-base text-muted-foreground">
              <li>Client must be created as `confidential` in DarkAuth settings.</li>
              <li>Grant types should include `client_credentials`.</li>
              <li>Token auth method typically `client_secret_basic` for `/api/token`.</li>
            </ul>
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-sm">
          <CardContent className="p-6 space-y-3">
            <div className="mb-1 flex items-center gap-2 text-foreground">
              <KeyRound className="h-5 w-5 text-primary" />
              <h3 className="font-semibold">Token shape</h3>
            </div>
            <p className="text-base text-muted-foreground">
              Use the client credentials token as bearer token toward administrative-like APIs where the
              endpoint grants machine access.
            </p>
            <ul className="list-disc space-y-2 pl-5 text-base text-muted-foreground">
              <li>Scopes become effective permissions (`darkauth.users:read`, etc).</li>
              <li>Token TTL and rotation are enforced by global settings.</li>
              <li>Use `/api/refresh-token` only if you explicitly support refresh grants for that client.</li>
            </ul>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">1) Request token</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="overflow-x-auto rounded-md border border-border/60 bg-muted/50 p-4 text-xs">
            <code>{tokenRequest}</code>
          </pre>
          <p className="mt-3 text-sm text-muted-foreground">
            Client secret can be sent in form body with `client_secret`, but basic authentication is the
            recommended default.
          </p>
        </CardContent>
      </Card>

      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">2) Call protected resources</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="overflow-x-auto rounded-md border border-border/60 bg-muted/50 p-4 text-xs">
            <code>{clientCredentialsExample}</code>
          </pre>
          <pre className="mt-4 overflow-x-auto rounded-md border border-border/60 bg-muted/50 p-4 text-xs">
            <code>{apiCall}</code>
          </pre>
        </CardContent>
      </Card>

      <DocsCallout title="Server integration guidance" icon={Building2}>
        <ul className="list-disc space-y-2 pl-5 text-base">
          <li>Use short-lived tokens for batch jobs and rotate periodically.</li>
          <li>Store secrets in secret manager, not source control.</li>
          <li>Keep confidential clients isolated by scope in service identity design.</li>
        </ul>
      </DocsCallout>

      <Card className="border-border/60 shadow-sm">
        <CardContent className="p-6">
          <div className="mb-3 flex items-center gap-2 text-foreground">
            <Lock className="h-5 w-5 text-primary" />
            <h3 className="font-semibold">Scope to endpoint mapping</h3>
          </div>
          <p className="text-base text-muted-foreground">
            DarkAuth commonly gates machine-level user APIs by scope strings, while admin RBAC is
            enforced by permission metadata and role checks.
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <Card className="border-border/60 shadow-sm">
              <CardContent className="p-4 text-sm">
                <p className="font-semibold text-foreground">Directory read</p>
                <p className="text-muted-foreground">`GET /api/users`, `GET /api/users/{"{sub}"}` with `darkauth.users:read`.</p>
              </CardContent>
            </Card>
            <Card className="border-border/60 shadow-sm">
              <CardContent className="p-4 text-sm">
                <p className="font-semibold text-foreground">Organization read</p>
                <p className="text-muted-foreground">`GET /api/organizations` and member endpoints used for admin tooling.</p>
              </CardContent>
            </Card>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            For full RBAC and permission assignment, use admin API docs.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default ConfidentialClientFlowPage;
