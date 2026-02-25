import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import DocsCallout from "@/pages/docs/components/DocsCallout";
import { BookOpen, Code2, Fingerprint, ShieldCheck } from "lucide-react";

const initSnippet = `import { setConfig, initiateLogin, handleCallback, getStoredSession } from "@darkauth/client";`;

const SdkOverviewPage = () => {
  return (
    <div className="space-y-8">
      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <Badge variant="outline" className="mb-2 border-primary/30 text-primary">
            SDKs
          </Badge>
          <CardTitle className="text-2xl">Client integration package</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-base text-muted-foreground">
            DarkAuth ships a TypeScript client to simplify OIDC/PKCE and token lifecycle handling.
            This SDK also includes crypto utilities used by encrypted notes and wrapped-key flows.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="border-border/60 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Install</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="rounded-md border border-border/60 bg-muted/50 p-4 text-xs">
              npm install @darkauth/client
            </pre>
            <p className="mt-3 text-sm text-muted-foreground">
              Use package manager compatible with your workspace lockfile.
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Core entry points</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-2 pl-5 text-base text-muted-foreground">
              <li>Configuration: <code>setConfig</code>, <code>clearKeyCache</code></li>
              <li>Auth flow: <code>initiateLogin</code>, <code>handleCallback</code></li>
              <li>Session: <code>getStoredSession</code>, <code>refreshSession</code>, <code>logout</code></li>
            </ul>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Quick usage</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="overflow-x-auto rounded-md border border-border/60 bg-muted/50 p-4 text-xs">
            <code>{initSnippet}</code>
          </pre>
          <pre className="mt-3 overflow-x-auto rounded-md border border-border/60 bg-muted/50 p-4 text-xs">
            <code>{`setConfig({ issuer: "https://auth.example.com", clientId: "demo-public-client", redirectUri: "https://app.example.com/callback", zk: false });`}</code>
          </pre>
        </CardContent>
      </Card>

      <DocsCallout title="Crypto exports included" icon={Fingerprint}>
        <p className="text-base">
          The package includes HKDF, AEAD, TOTP helpers, and wrapped key helpers used when you pair with
          `/api/crypto` endpoints.
        </p>
      </DocsCallout>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="border-border/60 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">What to check next</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-foreground">
                <Code2 className="h-4 w-4" />
                Explore flow pages for public client and confidential client examples.
              </div>
              <div className="flex items-center gap-2 text-foreground">
                <BookOpen className="h-4 w-4" />
                Import token and crypto responses from your /api/openapi schema.
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Need an explicit sample repo?</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-base text-muted-foreground">
              If you need this scaffold, pull example from internal integration repos or request a snippet
              for your framework.
            </p>
            <a href="https://github.com/puzed/" target="_blank" rel="noreferrer" className="inline-block mt-3">
              <Button variant="outline" size="sm">Explore related repos</Button>
            </a>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/60 shadow-sm">
        <CardContent className="p-6">
          <div className="mb-2 flex items-center gap-2 text-foreground">
            <ShieldCheck className="h-5 w-5" />
            <h3 className="font-semibold">Compatibility model</h3>
          </div>
          <p className="text-base text-muted-foreground">
            The SDK assumes token endpoints and config match the `/api` OpenID-compatible contracts; avoid
            private endpoints for portable integrations.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default SdkOverviewPage;
