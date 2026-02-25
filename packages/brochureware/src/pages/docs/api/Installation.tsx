import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import DocsCallout from "@/pages/docs/components/DocsCallout";
import { CheckCircle2, Database, Download, Settings2, ShieldCheck } from "lucide-react";

const getInstall = `GET /install\nGET /api/install`;

const complete = `POST /install/complete\nContent-Type: application/json\n\n{\"adminEmail\":\"ops@acme.com\",\"adminPassword\":\"pass\",\"kekPassphrase\":\"change-me\"}`;

const opaqueInstall = `POST /install/opaque/start\nPOST /install/opaque/finish\nContent-Type: application/json`;

const InstallationPage = () => {
  return (
    <div className="space-y-8">
      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <Badge variant="outline" className="mb-2 border-primary/30 text-primary">
            API: Installation
          </Badge>
          <CardTitle className="text-2xl">Bootstrap and first admin setup</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-base text-muted-foreground">
            Installation routes initialize system storage and bootstrap the first admin account. They are
            intentionally exposed before normal init checks in fresh environments.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="border-border/60 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Bootstrap steps</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-decimal space-y-2 pl-5 text-base text-muted-foreground">
              <li>Call <code>/install</code> to fetch install status and DB hints.</li>
              <li>Start OPAQUE install registration with <code>/install/opaque/start</code>.</li>
              <li>Finish install registration with <code>/install/opaque/finish</code>.</li>
              <li>POST final bootstrap data to <code>/install/complete</code>.</li>
            </ul>
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Endpoint examples</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="overflow-x-auto rounded-md border border-border/60 bg-muted/50 p-4 text-xs">
              <code>{getInstall}</code>
            </pre>
            <pre className="mt-3 rounded-md border border-border/60 bg-muted/50 p-4 text-xs">
              <code>{opaqueInstall}</code>
            </pre>
            <pre className="mt-3 rounded-md border border-border/60 bg-muted/50 p-4 text-xs">
              <code>{complete}</code>
            </pre>
          </CardContent>
        </Card>
      </div>

      <DocsCallout title="Install hardening" icon={ShieldCheck}>
        <ul className="list-disc space-y-2 pl-5 text-base">
          <li>Use a strong KEK passphrase in non-local environments.</li>
          <li>Point `postgresUri` to a persistent, non-root database for production.</li>
          <li>Rotate generated admin secrets after bootstrap if required by policy.</li>
        </ul>
      </DocsCallout>

      <Card className="border-border/60 shadow-sm">
        <CardContent className="p-6">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-2">
              <Download className="h-5 w-5 text-primary" />
              <h3 className="font-semibold text-foreground">Datastore</h3>
              <p className="text-sm text-muted-foreground">Use PostgreSQL URI from install or default fallback.</p>
            </div>
            <div className="space-y-2">
              <Database className="h-5 w-5 text-primary" />
              <h3 className="font-semibold text-foreground">Ports</h3>
              <p className="text-sm text-muted-foreground">Default example: user 9080, admin 9081.</p>
            </div>
            <div className="space-y-2">
              <Settings2 className="h-5 w-5 text-primary" />
              <h3 className="font-semibold text-foreground">Runtime values</h3>
              <p className="text-sm text-muted-foreground">Issuer and origin values are loaded after install if settings exist.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/60 shadow-sm">
        <CardContent className="p-6">
          <div className="flex items-center gap-2 text-foreground">
            <CheckCircle2 className="h-5 w-5" />
            <h3 className="font-semibold">After install</h3>
          </div>
          <p className="mt-2 text-base text-muted-foreground">
            Redirect to admin login and complete additional settings (branding, rate limits, security,
            and feature toggles) through `/admin/settings`.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default InstallationPage;
