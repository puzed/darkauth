import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import DocsCallout from "@/pages/docs/components/DocsCallout";
import { Boxes, Cog, Database, Lock, Server } from "lucide-react";

const configExample = `postgresUri: postgresql://darkauth:password@db.internal:5432/darkauth\nuserPort: 9080\nadminPort: 9081\nproxyUi: false\nkekPassphrase: "\${CHANGE_ME}"\n}`;

const DeploymentPage = () => {
  return (
    <div className="space-y-8">
      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <Badge variant="outline" className="mb-2 border-primary/30 text-primary">
            Operations: Deployment
          </Badge>
          <CardTitle className="text-2xl">Run DarkAuth in environments</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-base text-muted-foreground">
            Deployment is split by user and admin ports, with separate runtime concerns for UI delivery,
            API traffic, and install state.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="border-border/60 shadow-sm">
          <CardContent className="p-6">
            <div className="mb-2 flex items-center gap-2 text-foreground">
              <Server className="h-5 w-5 text-primary" />
              <h3 className="font-semibold">Runtime ports</h3>
            </div>
            <ul className="list-disc space-y-2 pl-5 text-base text-muted-foreground">
              <li>User APIs: `9080` default</li>
              <li>Admin UI/APIs: `9081` default</li>
              <li>Keep separate firewall rules for each surface</li>
            </ul>
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-sm">
          <CardContent className="p-6">
            <div className="mb-2 flex items-center gap-2 text-foreground">
              <Database className="h-5 w-5 text-primary" />
              <h3 className="font-semibold">Storage and DB</h3>
            </div>
            <p className="text-base text-muted-foreground">
              Configure Postgres via `postgresUri` with TLS in production and dedicated credentials.
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-sm">
          <CardContent className="p-6">
            <div className="mb-2 flex items-center gap-2 text-foreground">
              <Boxes className="h-5 w-5 text-primary" />
              <h3 className="font-semibold">Proxy mode</h3>
            </div>
            <p className="text-base text-muted-foreground">
              Set `proxyUi` for in-repo UI routing or static containerized frontends.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Config example</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="overflow-x-auto rounded-md border border-border/60 bg-muted/50 p-4 text-xs">
            <code>{configExample}</code>
          </pre>
        </CardContent>
      </Card>

      <DocsCallout title="Production checklist" icon={Lock}>
        <ul className="list-disc space-y-2 pl-5 text-base">
          <li>Use strong `kekPassphrase` and rotate periodically.</li>
          <li>Terminate TLS at ingress and forward trusted headers securely.</li>
          <li>Separate admin path ACLs from public user path ACLs.</li>
          <li>Enable monitoring on `/api/health` equivalents and DB readiness checks.</li>
        </ul>
      </DocsCallout>

      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Scaling and operations</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="list-disc space-y-2 pl-5 text-base text-muted-foreground">
            <li>Keep token and session stores in a single database per cluster region.</li>
            <li>Use external reverse proxy for logging, WAF, and rate-limits.</li>
            <li>Run admin UI behind stronger network controls than user API routes.</li>
          </ul>
          <p className="mt-4 text-sm text-muted-foreground">
            For advanced patterns, configure observability around `/admin/audit-logs` and failed auth
            counters.
          </p>
        </CardContent>
      </Card>

      <Card className="border-border/60 shadow-sm">
        <CardContent className="p-6">
          <div className="mb-2 flex items-center gap-2 text-foreground">
            <Cog className="h-5 w-5 text-primary" />
            <h3 className="font-semibold">Health checks</h3>
          </div>
          <p className="text-base text-muted-foreground">
            In production use external probes for port responsiveness and DB migrations success checks. This
            repo uses install status gates and startup config validation.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default DeploymentPage;
