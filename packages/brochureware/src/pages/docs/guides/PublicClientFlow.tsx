import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import DocsCallout from "@/pages/docs/components/DocsCallout";
import { CheckCircle, Globe, KeyRound, RefreshCw, ShieldCheck } from "lucide-react";

const authorizationUrl = `https://auth.example.com/api/authorize?\
  client_id=demo-public-client&\
  redirect_uri=https://app.example.com/callback&\
  response_type=code&\
  scope=openid%20profile%20email&\
  code_challenge_method=S256&\
  code_challenge=7xv6k...`;

const tokenExchange = `POST /api/token\nContent-Type: application/x-www-form-urlencoded\n\nclient_id=demo-public-client&grant_type=authorization_code&code=<code>&code_verifier=<verifier>&redirect_uri=https://app.example.com/callback`;

const callbackFlow = `const response = await fetch("/api/token", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    grant_type: "authorization_code",
    client_id: "demo-public-client",
    code,
    redirect_uri: "https://app.example.com/callback",
    code_verifier,
  }),
});

const tokens = await response.json();
// tokens.access_token is used in Authorization headers against user APIs.`;

const PublicClientFlowPage = () => {
  return (
    <div className="space-y-8">
      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <Badge variant="outline" className="mb-2 border-primary/30 text-primary">
            Guide: Public Client Flow
          </Badge>
          <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">Browser / SPA integration</h2>
        </CardHeader>
        <CardContent>
          <p className="text-base text-muted-foreground">
            Public clients should use the authorization code + PKCE flow. DarkAuth returns access and id
            tokens directly for browser callers while keeping refresh flow tied to token rotation.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="border-border/60 shadow-sm">
          <CardContent className="p-6 space-y-3">
            <div className="mb-1 flex items-center gap-2 text-foreground">
              <ShieldCheck className="h-5 w-5 text-primary" />
              <h3 className="font-semibold">When to use</h3>
            </div>
            <p className="text-base text-muted-foreground">
              Use this for browser apps, web demos, and mobile webviews that cannot keep client
              secrets.
            </p>
            <ul className="list-disc space-y-2 pl-5 text-base text-muted-foreground">
              <li>Client must support PKCE.</li>
              <li>Client must register redirect URI in DarkAuth client list.</li>
              <li>Keep token and code-verifier handling in the SPA runtime only.</li>
            </ul>
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-sm">
          <CardContent className="p-6 space-y-3">
            <div className="mb-1 flex items-center gap-2 text-foreground">
              <KeyRound className="h-5 w-5 text-primary" />
              <h3 className="font-semibold">Required server side setup</h3>
            </div>
            <p className="text-base text-muted-foreground">
              Register a client with `grantTypes` containing `authorization_code` and `code_challenge`
              support (PKCE). For zero-knowledge flows, request OPAQUE-enabled users.
            </p>
            <ul className="list-disc space-y-2 pl-5 text-base text-muted-foreground">
              <li>Client type can be `public`.</li>
              <li>Enable PKCE/S256 validation.</li>
              <li>Use `/api/authorize`, not `/admin/authorize`.</li>
            </ul>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <h3 className="text-lg font-semibold tracking-tight">1) Start in user browser</h3>
        </CardHeader>
        <CardContent>
          <pre className="w-full overflow-x-auto rounded-md border border-border/60 bg-muted/50 p-4 text-xs">
            <code>{authorizationUrl}</code>
          </pre>
          <p className="mt-3 text-sm text-muted-foreground">
            You normally build this URL server-side in your app router and redirect users to it.
            DarkAuth validates client, redirect URI, grant type, and code challenge.
          </p>
        </CardContent>
      </Card>

      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <h3 className="text-lg font-semibold tracking-tight">2) Exchange code with verifier</h3>
        </CardHeader>
        <CardContent>
          <pre className="w-full overflow-x-auto rounded-md border border-border/60 bg-muted/50 p-4 text-xs">
            <code>{tokenExchange}</code>
          </pre>
          <p className="mt-3 text-sm text-muted-foreground">
            For public clients you do not use Basic auth. The code verifier must match the original
            challenge.
          </p>
          <pre className="mt-4 w-full overflow-x-auto rounded-md border border-border/60 bg-muted/40 p-4 text-xs">
            <code>{callbackFlow}</code>
          </pre>
        </CardContent>
      </Card>

      <DocsCallout title="Post-login behavior" icon={Globe}>
        <ul className="list-disc space-y-2 pl-5 text-base">
          <li>DarkAuth user-facing APIs use bearer tokens on `Authorization: Bearer`.</li>
          <li>Use `/api/session` for quick session introspection.</li>
          <li>Use `/api/token` with `grant_type=refresh_token` when renewals are required.</li>
        </ul>
      </DocsCallout>

      <Card className="border-border/60 shadow-sm">
        <CardContent className="p-6">
          <div className="mb-3 flex items-center gap-2 text-foreground">
            <RefreshCw className="h-5 w-5 text-primary" />
            <h3 className="font-semibold">Typical endpoint map</h3>
          </div>
          <ul className="list-disc space-y-2 pl-5 text-base text-muted-foreground">
            <li><code>GET /api/authorize</code> &rarr; authorization request entry.</li>
            <li><code>POST /api/authorize/finalize</code> &rarr; confirm pending auth code.</li>
            <li><code>POST /api/token</code> &rarr; authorization_code token exchange.</li>
            <li><code>POST /api/logout</code> and <code>POST /api/token</code> refresh grant.</li>
          </ul>
          <div className="mt-4 flex items-center gap-3 text-sm text-muted-foreground">
            <CheckCircle className="h-4 w-4 text-primary" />
            For SPA callback handling, preserve `state` and validate redirect destinations.
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default PublicClientFlowPage;
