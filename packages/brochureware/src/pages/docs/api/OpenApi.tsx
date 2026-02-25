import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import DocsCallout from "@/pages/docs/components/DocsCallout";
import { ExternalLink, FileJson, RefreshCw } from "lucide-react";

const schemaSnippet = `curl https://auth.example.com/api/openapi | jq .`;

const OpenApiPage = () => {
  return (
    <div className="space-y-8">
      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <Badge variant="outline" className="mb-2 border-primary/30 text-primary">
            API: OpenAPI Spec
          </Badge>
          <CardTitle className="text-2xl">Live generated contract</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-base text-muted-foreground">
            DarkAuth exposes an auto-generated OpenAPI JSON at runtime. Use this for client generation,
            contract validation, and API explorer integrations.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="border-border/60 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Where to fetch</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="rounded-md border border-border/60 bg-muted/50 p-4 text-xs">
              <code>{schemaSnippet}</code>
            </pre>
            <p className="mt-3 text-sm text-muted-foreground">
              Endpoint: <code>GET /api/openapi</code>
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Usage scenarios</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-2 pl-5 text-base text-muted-foreground">
              <li>Generate typed SDKs for internal tooling.</li>
              <li>Import into API clients to verify payload compatibility.</li>
              <li>Document drift by comparing spec diffs across releases.</li>
            </ul>
          </CardContent>
        </Card>
      </div>

      <DocsCallout title="Spec characteristics" icon={FileJson}>
        <ul className="list-disc space-y-2 pl-5 text-base">
          <li>Spec includes both user and admin controllers present in deployment build.</li>
          <li>Schemas are derived from shared Zod definitions in the API package.</li>
          <li>Routes include security requirements and response shapes for standard tooling.</li>
        </ul>
      </DocsCallout>

      <Card className="border-border/60 shadow-sm">
        <CardContent className="p-6">
          <div className="mb-3 flex items-center gap-2 text-foreground">
            <RefreshCw className="h-5 w-5 text-primary" />
            <h3 className="font-semibold">Regeneration behavior</h3>
          </div>
          <p className="text-base text-muted-foreground">
            The spec is generated at runtime each request from the controller registry, so any startup
            feature flags and installed controllers are reflected immediately.
          </p>
        </CardContent>
      </Card>

      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Common tooling</CardTitle>
        </CardHeader>
        <CardContent>
          <a href="https://editor.swagger.io/" className="flex items-center gap-2 text-primary underline">
            <ExternalLink className="h-4 w-4" />
            Validate in Swagger Editor
          </a>
          <p className="mt-2 text-sm text-muted-foreground">
            Paste in the raw output of <code>/api/openapi</code>.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default OpenApiPage;
