import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShieldAlert, RefreshCcw, KeyRound } from "lucide-react";
import DocsCallout from "@/pages/docs/components/DocsCallout";

const SecurityModelPage = () => {
  return (
    <div className="space-y-8">
      <Card className="border-border/60 shadow-sm">
        <CardContent className="p-6">
          <Badge variant="outline" className="mb-2 border-primary/30 text-primary">
            Security Model
          </Badge>
          <h2 className="text-2xl font-bold text-foreground">What is protected, and how</h2>
          <p className="mt-3 text-base text-muted-foreground">
            DarkAuth uses OPAQUE for password flow resilience and protects secrets at API and UI
            boundaries through CSRF and origin checks. Server side still stores only protocol-safe
            artifacts and key material when protected by KEK.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="border-border/60 shadow-sm">
          <CardContent className="p-6">
            <div className="mb-3 flex items-center gap-2 text-foreground">
              <KeyRound className="h-5 w-5 text-primary" />
              <h3 className="font-semibold">OPAQUE-based password login</h3>
            </div>
            <p className="text-base text-muted-foreground">
              Registration and login message exchange is split into start/finish endpoints so the server
              receives encrypted OPAQUE handshakes, not raw credentials.
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-sm">
          <CardContent className="p-6">
            <div className="mb-3 flex items-center gap-2 text-foreground">
              <ShieldAlert className="h-5 w-5 text-primary" />
              <h3 className="font-semibold">Session and claim trust</h3>
            </div>
            <p className="text-base text-muted-foreground">
              Access tokens and ID tokens are minted with org context, role data, and permission claims
              where applicable.
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/50 md:col-span-2">
          <CardContent className="p-6">
            <div className="mb-3 flex items-center gap-2 text-foreground">
              <RefreshCcw className="h-5 w-5 text-primary" />
              <h3 className="font-semibold">Operational hardening</h3>
            </div>
            <p className="text-base text-muted-foreground">
              Middleware applies origin checks on non-idempotent requests, CSP-style headers, and token
              checks before business logic. OTP policies can force re-auth at sensitive operations.
            </p>
          </CardContent>
        </Card>
      </div>

      <DocsCallout title="Key docs to confirm in integration" icon={ShieldAlert}>
        <ul className="list-disc space-y-2 pl-5 text-base">
          <li>Rate limiting and lockout behavior in `packages/api` runtime configuration.</li>
          <li>KEK setup and key wrapper requirements in install/config flow.</li>
          <li>Audit event generation for sensitive admin changes.</li>
        </ul>
      </DocsCallout>
    </div>
  );
};

export default SecurityModelPage;
