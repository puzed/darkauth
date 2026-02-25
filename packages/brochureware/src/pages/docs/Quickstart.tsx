import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BookOpen, CheckCircle2, Rocket } from "lucide-react";
import DocsCallout from "@/pages/docs/components/DocsCallout";

const QuickstartPage = () => {
  return (
    <div className="space-y-8">
      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <Badge variant="outline" className="mb-2 border-primary/30 text-primary">
            Quickstart
          </Badge>
          <CardTitle className="text-2xl">Run and test DarkAuth locally</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-base text-muted-foreground">
            Start with a temporary setup and test both the install and user flows before building your
            production integration.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="border-border/60 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">1) Start DarkAuth (Docker)</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="overflow-x-auto rounded-md border border-border/60 bg-muted/50 p-4 text-xs">
              <code>{`docker run -d \\
  -p 9080:9080 \\
  -p 9081:9081 \\
  ghcr.io/puzed/darkauth:latest`}</code>
            </pre>
            <p className="mt-3 text-sm text-muted-foreground">
              Admin UI is available on port `9081`, user/OIDC APIs on `9080`.
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">2) Optional Config File</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="overflow-x-auto rounded-md border border-border/60 bg-muted/50 p-4 text-xs">
              <code>{`userPort: 9080
adminPort: 9081
proxyUi: false
postgresUri: postgresql://DarkAuth:DarkAuth_password@localhost:5432/DarkAuth
kekPassphrase: "replace-with-strong-pass"`}</code>
            </pre>
            <p className="mt-3 text-sm text-muted-foreground">
              Omit `kekPassphrase` only for non-production, development use.
            </p>
          </CardContent>
        </Card>
      </div>

      <DocsCallout title="First successful path" icon={Rocket}>
        <ol className="list-decimal space-y-2 pl-5 text-base">
          <li>Open admin UI on `http://localhost:9081` and complete install.</li>
          <li>Keep the default demo public client, then open user UI at `http://localhost:9080`.</li>
          <li>Run the login flow and confirm `/api/session` is authenticated.</li>
          <li>Fetch `/api/users?q=...` with the issued bearer token.</li>
        </ol>
      </DocsCallout>

      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">3) Recommended local dev setup</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-base text-muted-foreground">
            For source-level development, run the monorepo with package scripts and connect client UIs:
          </p>
          <pre className="overflow-x-auto rounded-md border border-border/60 bg-muted/50 p-4 text-xs mt-3">
            <code>{`npm install
npm run dev`}</code>
          </pre>
          <p className="mt-3 text-sm text-muted-foreground">
            API service supports both `/api/*` and `/admin/*` routing and serves static UIs when `proxyUi`
            is disabled.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="border-border/60 shadow-sm">
          <CardContent className="p-6">
            <div className="mb-3 flex items-center gap-2 text-foreground">
              <CheckCircle2 className="h-5 w-5 text-primary" />
              <h3 className="font-semibold">Need a running integration?</h3>
            </div>
            <a href="/docs/guides/public-client-flow" className="text-sm text-primary underline">
              Go to Public Client Flow
            </a>
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-sm">
          <CardContent className="p-6">
            <div className="mb-3 flex items-center gap-2 text-foreground">
              <BookOpen className="h-5 w-5 text-primary" />
              <h3 className="font-semibold">Need endpoint matrix?</h3>
            </div>
            <a href="/docs/api/overview" className="text-sm text-primary underline">
              Open API overview
            </a>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default QuickstartPage;
