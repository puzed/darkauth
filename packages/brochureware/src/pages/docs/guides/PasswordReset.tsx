import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import DocsCallout from "@/pages/docs/components/DocsCallout";
import { KeyRound, Mail, ShieldCheck, TriangleAlert } from "lucide-react";

const requestExample = `POST /api/password/reset/request
Content-Type: application/json

{"email":"alice@example.com"}`;

const startExample = `POST /api/password/reset/start
Content-Type: application/json

{"token":"RESET_TOKEN","request":"BASE64URL-OPAQUE-REQUEST"}`;

const finishExample = `POST /api/password/reset/finish
Content-Type: application/json

{"token":"RESET_TOKEN","record":"BASE64URL-OPAQUE-RECORD","export_key_hash":"BASE64URL-SHA256"}`;

const PasswordResetPage = () => {
  return (
    <div className="space-y-8">
      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <Badge variant="outline" className="mb-2 border-primary/30 text-primary">
            Guide: Email Password Reset
          </Badge>
          <CardTitle className="text-2xl">Self-service recovery without account leaks</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-base text-muted-foreground">
            DarkAuth can email users a single-use reset link when SMTP is configured and the admin
            setting is enabled. The request path always returns the same generic response so unknown
            addresses, disabled reset, and SMTP failures do not reveal account state.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="border-border/60 shadow-sm">
          <CardContent className="p-6 space-y-3">
            <div className="mb-1 flex items-center gap-2 text-foreground">
              <Mail className="h-5 w-5 text-primary" />
              <h3 className="font-semibold">Enablement</h3>
            </div>
            <ul className="list-disc space-y-2 pl-5 text-base text-muted-foreground">
              <li>Configure and enable SMTP under Admin Settings.</li>
              <li>Enable `users.password_reset_email_enabled`.</li>
              <li>Customize `email.templates.password_recovery` if needed.</li>
            </ul>
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-sm">
          <CardContent className="p-6 space-y-3">
            <div className="mb-1 flex items-center gap-2 text-foreground">
              <ShieldCheck className="h-5 w-5 text-primary" />
              <h3 className="font-semibold">Token handling</h3>
            </div>
            <ul className="list-disc space-y-2 pl-5 text-base text-muted-foreground">
              <li>Tokens are high entropy, one-time, and short-lived.</li>
              <li>Only HMAC-SHA-256 token hashes are stored.</li>
              <li>Successful reset revokes active sessions and pending grants.</li>
            </ul>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Endpoint flow</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <pre className="overflow-x-auto rounded-md border border-border/60 bg-muted/50 p-4 text-xs">
            <code>{requestExample}</code>
          </pre>
          <pre className="overflow-x-auto rounded-md border border-border/60 bg-muted/50 p-4 text-xs">
            <code>{startExample}</code>
          </pre>
          <pre className="overflow-x-auto rounded-md border border-border/60 bg-muted/50 p-4 text-xs">
            <code>{finishExample}</code>
          </pre>
        </CardContent>
      </Card>

      <DocsCallout title="Zero-knowledge boundary" icon={TriangleAlert}>
        <p className="text-base">
          Email password reset restores account access; it does not decrypt data wrapped under the
          old password-derived export key. After signing in with the new password, users may need the
          existing old-password recovery flow or may need to generate fresh keys.
        </p>
      </DocsCallout>

      <Card className="border-border/60 shadow-sm">
        <CardContent className="p-6">
          <div className="mb-3 flex items-center gap-2 text-foreground">
            <KeyRound className="h-5 w-5 text-primary" />
            <h3 className="font-semibold">Template variables</h3>
          </div>
          <p className="text-base text-muted-foreground">
            The reset email supports `name`, `email`, `reset_link`, `recovery_link`,
            `expires_minutes`, `requested_at`, and `ip_hint`. `recovery_link` remains an alias for
            older customized templates.
          </p>
          <p className="mt-3 text-base text-muted-foreground">
            Write admins can also send a reset email from the user detail page. The token is still
            only delivered by email and is never displayed in the admin UI.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default PasswordResetPage;
