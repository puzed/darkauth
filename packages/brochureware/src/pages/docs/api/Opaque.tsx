import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import DocsCallout from "@/pages/docs/components/DocsCallout";
import { Fingerprint, KeyRound, RefreshCw } from "lucide-react";

const registerStart = `POST /api/opaque/register/start\nContent-Type: application/json\n\n{\"request\":\"BASE64URL-OPAQUE-REQUEST\",\"email\":\"alice@example.com\"}`;

const registerFinish = `POST /api/opaque/register/finish\nContent-Type: application/json\n\n{\"message\":\"BASE64URL-OPAQUE-MESSAGE\",\"record\":\"BASE64URL-OPAQUE-RECORD\",\"email\":\"alice@example.com\",\"name\":\"Alice\"}`;

const loginStart = `POST /api/opaque/login/start\nContent-Type: application/json\n\n{\"request\":\"BASE64URL-OPAQUE-REQUEST\",\"email\":\"alice@example.com\"}`;

const loginFinish = `POST /api/opaque/login/finish\nContent-Type: application/json\n\n{\"sessionId\":\"request-uuid\",\"finish\":\"BASE64URL-OPAQUE-FINISH\"}`;

const OpaquePage = () => {
  return (
    <div className="space-y-8">
      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <Badge variant="outline" className="mb-2 border-primary/30 text-primary">
            API: OPAQUE
          </Badge>
          <CardTitle className="text-2xl">Password-auth without sending raw credentials</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-base text-muted-foreground">
            DarkAuth implements RFC 9380 OPAQUE start/finish handshakes for registration and login,
            keeping password-equivalent material off the wire.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="border-border/60 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Registration</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="overflow-x-auto rounded-md border border-border/60 bg-muted/50 p-4 text-xs">
              <code>{registerStart}</code>
            </pre>
            <pre className="mt-3 overflow-x-auto rounded-md border border-border/60 bg-muted/50 p-4 text-xs">
              <code>{registerFinish}</code>
            </pre>
            <p className="mt-3 text-sm text-muted-foreground">
              Start returns opaque challenge material; finish commits server-side password envelope.
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Login</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="overflow-x-auto rounded-md border border-border/60 bg-muted/50 p-4 text-xs">
              <code>{loginStart}</code>
            </pre>
            <pre className="mt-3 overflow-x-auto rounded-md border border-border/60 bg-muted/50 p-4 text-xs">
              <code>{loginFinish}</code>
            </pre>
            <p className="mt-3 text-sm text-muted-foreground">
              Finish validates against server-side session and returns login success or challenge failure.
            </p>
          </CardContent>
        </Card>
      </div>

      <DocsCallout title="Zero-knowledge behavior" icon={Fingerprint}>
        <ul className="list-disc space-y-2 pl-5 text-base">
          <li>Server never receives raw password material.</li>
          <li>Server uses opaque login sessions to prevent identity tampering.</li>
          <li>Token issuance still flows through standard token/session logic.</li>
        </ul>
      </DocsCallout>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="border-border/60 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Transport and format</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-2 pl-5 text-base text-muted-foreground">
              <li>Base64url binary payloads are expected in request JSON.</li>
              <li>JSON bodies only for OPAQUE registration/login endpoints.</li>
              <li>Rate limiting is applied by auth namespace.</li>
            </ul>
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">After login</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <KeyRound className="h-4 w-4" />
                Use `/api/token` with auth code when needed.
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <RefreshCw className="h-4 w-4" />
                Session tokens can be refreshed via `/api/token` refresh flow.
              </div>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              Installation can disable self-registration if required.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default OpaquePage;
