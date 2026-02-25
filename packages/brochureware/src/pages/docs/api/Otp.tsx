import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import DocsCallout from "@/pages/docs/components/DocsCallout";
import { Clock3, KeyRound, RefreshCw, ShieldCheck } from "lucide-react";

const statusCall = `GET /api/otp/status`;

const setupInit = `POST /api/otp/setup/init\nAuthorization: Bearer <session_or_admin_token>`;

const setupVerify = `POST /api/otp/setup/verify\nAuthorization: Bearer <session_or_admin_token>\n\n{\"code\":\"000000\",\"request_id\":\"abc\"}`;

const verifyCode = `POST /api/otp/verify\nAuthorization: Bearer <access_token>\n\n{\"code\":\"000000\"}`;

const reauthCode = `POST /api/otp/reauth\nAuthorization: Bearer <access_token>\n\n{\"code\":\"000000\"}`;

const OtpPage = () => {
  return (
    <div className="space-y-8">
      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <Badge variant="outline" className="mb-2 border-primary/30 text-primary">
            API: OTP
          </Badge>
          <CardTitle className="text-2xl">One-time code policy and step-up</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-base text-muted-foreground">
            These endpoints cover user and admin-visible OTP behavior, from setup to verification and
            status checks.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="border-border/60 shadow-sm">
          <CardContent className="p-6 space-y-3">
            <div className="mb-1 flex items-center gap-2 text-foreground">
              <ShieldCheck className="h-5 w-5 text-primary" />
              <h3 className="font-semibold">Status and setup</h3>
            </div>
            <pre className="rounded-md border border-border/60 bg-muted/50 p-4 text-xs">
              <code>{statusCall}</code>
            </pre>
            <pre className="mt-2 rounded-md border border-border/60 bg-muted/50 p-4 text-xs">
              <code>{setupInit}</code>
            </pre>
            <pre className="mt-2 rounded-md border border-border/60 bg-muted/50 p-4 text-xs">
              <code>{setupVerify}</code>
            </pre>
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-sm">
          <CardContent className="p-6 space-y-3">
            <div className="mb-1 flex items-center gap-2 text-foreground">
              <KeyRound className="h-5 w-5 text-primary" />
              <h3 className="font-semibold">Verification</h3>
            </div>
            <pre className="rounded-md border border-border/60 bg-muted/50 p-4 text-xs">
              <code>{verifyCode}</code>
            </pre>
            <pre className="mt-2 rounded-md border border-border/60 bg-muted/50 p-4 text-xs">
              <code>{reauthCode}</code>
            </pre>
            <p className="mt-2 text-sm text-muted-foreground">
              Use reauth for high-risk actions before token-based operations.
            </p>
          </CardContent>
        </Card>
      </div>

      <DocsCallout title="Admin controls" icon={Clock3}>
        <ul className="list-disc space-y-2 pl-5 text-base">
          <li>Admin endpoints can disable OTP or reset lockouts for user accounts.</li>
          <li>Lockout / enable flags are managed in `/admin/*` routes.</li>
          <li>Clock drift and one-time replay checks use shared backend policies.</li>
        </ul>
      </DocsCallout>

      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Operational notes</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="list-disc space-y-2 pl-5 text-base text-muted-foreground">
            <li>Request bodies are JSON and generally expect numeric/validated one-time codes.</li>
            <li>Use HTTPS and short request windows in production UIs.</li>
            <li>Treat failed verification with explicit user-facing cooldown messaging.</li>
          </ul>
        </CardContent>
      </Card>

      <Card className="border-border/60 shadow-sm">
        <CardContent className="p-6">
          <div className="mb-2 flex items-center gap-2 text-foreground">
            <RefreshCw className="h-5 w-5 text-primary" />
            <h3 className="font-semibold">Flow summary</h3>
          </div>
          <p className="text-base text-muted-foreground">
            Status → Init → Verify → Require at sensitive call → Reauth if required → Continue with
            elevated session state.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default OtpPage;
