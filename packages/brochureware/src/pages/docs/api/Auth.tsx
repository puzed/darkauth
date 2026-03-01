import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import DocsCallout from "@/pages/docs/components/DocsCallout";
import { ArrowRight, KeyRound, RefreshCw, Shield, UserRoundSearch } from "lucide-react";

const authorizeSnippet = `GET /api/authorize?client_id=demo-public-client&\
  response_type=code&\
  redirect_uri=https://app.example.com/callback&\
  scope=openid%20profile%20email`;

const finalizeSnippet = `POST /api/authorize/finalize\nContent-Type: application/x-www-form-urlencoded\n\nrequest_id=<uuid>&user_email=<email>`;

const tokenCodeSnippet = `POST /api/token\nContent-Type: application/x-www-form-urlencoded\n\ngrant_type=authorization_code&code=<auth_code>&code_verifier=<verifier>&client_id=demo-public-client&redirect_uri=...`;

const tokenRefreshSnippet = `POST /api/token\nContent-Type: application/x-www-form-urlencoded\n\ngrant_type=refresh_token&refresh_token=<refresh_token>&client_id=...&client_secret=...`;

const sessionSnippet = `GET /api/session\nAuthorization: Bearer <access_token>`;
const logoutSnippet = `POST /api/logout\nAuthorization: Bearer <access_token>`;

const AuthPage = () => {
  return (
    <div className="space-y-8">
      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <Badge variant="outline" className="mb-2 border-primary/30 text-primary">
            API: Auth
          </Badge>
          <CardTitle className="text-2xl">Authorization and session lifecycle</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-base text-muted-foreground">
            This area handles how apps authenticate users and sessions, and how tokens are minted and
            refreshed.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="border-border/60 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">OIDC-compatible auth</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="overflow-x-auto rounded-md border border-border/60 bg-muted/50 p-4 text-xs">
              <code>{authorizeSnippet}</code>
            </pre>
            <p className="mt-3 text-sm text-muted-foreground">
              Public client and PKCE enforcement are performed at this stage.
            </p>
            <p className="mt-3 text-sm text-muted-foreground">
              Finalization can be processed using `/api/authorize/finalize` when your UI returns the
              original request context.
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Token endpoint grants</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="overflow-x-auto rounded-md border border-border/60 bg-muted/50 p-4 text-xs">
              <code>{tokenCodeSnippet}</code>
            </pre>
            <pre className="mt-3 overflow-x-auto rounded-md border border-border/60 bg-muted/50 p-4 text-xs">
              <code>{tokenRefreshSnippet}</code>
            </pre>
            <p className="mt-3 text-sm text-muted-foreground">
              Supports `authorization_code`, `refresh_token`, and `client_credentials` grant modes.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Session read and logout</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="overflow-x-auto rounded-md border border-border/60 bg-muted/50 p-4 text-xs">
            <code>{sessionSnippet}</code>
          </pre>
          <p className="mt-3 text-sm text-muted-foreground">
            Use `/api/logout` to clear server session state and refresh tokens.
          </p>
          <pre className="mt-3 overflow-x-auto rounded-md border border-border/60 bg-muted/50 p-4 text-xs">
            <code>{logoutSnippet}</code>
          </pre>
        </CardContent>
      </Card>

      <DocsCallout title="Auth grant precedence" icon={Shield}>
        <ul className="list-disc space-y-2 pl-5 text-base">
          <li>For public clients, token endpoint uses PKCE and non-secret client handling.</li>
          <li>Confidential clients validate via Basic and verify client type/grant support.</li>
          <li>Refresh tokens are rotated and bound to original client ID.</li>
        </ul>
      </DocsCallout>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="border-border/60 shadow-sm">
          <CardContent className="p-6">
            <div className="mb-2 flex items-center gap-2 text-foreground">
              <ArrowRight className="h-4 w-4 text-primary" />
              <h3 className="font-semibold">Start</h3>
            </div>
            <p className="text-sm text-muted-foreground">`GET /api/authorize`</p>
          </CardContent>
        </Card>
        <Card className="border-border/60 shadow-sm">
          <CardContent className="p-6">
            <div className="mb-2 flex items-center gap-2 text-foreground">
              <KeyRound className="h-4 w-4 text-primary" />
              <h3 className="font-semibold">Exchange</h3>
            </div>
            <p className="text-sm text-muted-foreground">`POST /api/token`</p>
          </CardContent>
        </Card>
        <Card className="border-border/60 shadow-sm">
          <CardContent className="p-6">
            <div className="mb-2 flex items-center gap-2 text-foreground">
              <RefreshCw className="h-4 w-4 text-primary" />
              <h3 className="font-semibold">Maintain</h3>
            </div>
            <p className="text-sm text-muted-foreground">`GET /api/session`, `/api/token` (refresh grant), `/api/logout`</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/60 shadow-sm">
        <CardContent className="p-6">
          <div className="mb-2 flex items-center gap-2 text-foreground">
            <UserRoundSearch className="h-5 w-5 text-primary" />
            <h3 className="font-semibold">When to use OPAQUE endpoints</h3>
          </div>
          <p className="text-base text-muted-foreground">
            OPAQUE register/login endpoints are implemented as `/api/opaque/*`. These are used for
            password-auth without exposing raw secrets.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default AuthPage;
