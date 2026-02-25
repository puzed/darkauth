import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import DocsCallout from "@/pages/docs/components/DocsCallout";
import { Lock, ShieldCheck, ServerCog, Users } from "lucide-react";

const IntroductionPage = () => {
  return (
    <div className="space-y-8">
      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <Badge variant="outline" className="mb-2 border-primary/30 text-primary">
            Introduction
          </Badge>
          <CardTitle className="text-2xl">DarkAuth for Integrators</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-base leading-7 text-muted-foreground">
            DarkAuth is a self-hosted authentication platform built for teams that want strong security
            without giving up practical integration paths. It combines OPAQUE password auth, OIDC/OAuth
            compatibility, and scoped application/admin APIs so teams can build user dashboards,
            management tooling, and service-to-service workflows against one consistent auth surface.
          </p>
        </CardContent>
      </Card>

      <DocsCallout title="What you can document or build with this site" icon={ShieldCheck}>
        <ul className="list-disc space-y-2 pl-5 text-base">
          <li>Product feature walk-throughs for implementers and security reviewers.</li>
          <li>Endpoint-level integration and SDK recipes.</li>
          <li>Operational runbooks for install, branding, and production hardening.</li>
        </ul>
      </DocsCallout>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="border-border/60 shadow-sm">
          <CardContent className="p-6 space-y-3">
            <div className="mb-1 flex items-center gap-2 text-foreground">
              <ShieldCheck className="h-5 w-5 text-primary" />
              <h3 className="font-semibold">Zero-Knowledge Password Model</h3>
            </div>
            <p className="text-base text-muted-foreground">
              OPAQUE keeps password-derived secrets out of the server while still enabling robust
              login and recovery flows.
            </p>
            <p className="text-sm text-muted-foreground">
              This is separate from data encryption. If you use the demo client or the optional ZK
              flows, data keys are derived and transported through public-key wrapping.
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-sm">
          <CardContent className="p-6 space-y-3">
            <div className="mb-1 flex items-center gap-2 text-foreground">
              <ServerCog className="h-5 w-5 text-primary" />
              <h3 className="font-semibold">OIDC + Admin Surfaces</h3>
            </div>
            <p className="text-base text-muted-foreground">
              A user API on port 9080 and admin API on port 9081 are available. The same codebase
              handles both auth flows and management operations with explicit permission checks.
            </p>
            <p className="text-sm text-muted-foreground">
              Documentation is split between user-facing guides and admin/operations guidance.
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-sm">
          <CardContent className="p-6 space-y-3">
            <div className="mb-1 flex items-center gap-2 text-foreground">
              <Users className="h-5 w-5 text-primary" />
              <h3 className="font-semibold">Org-Aware Access Control</h3>
            </div>
            <p className="text-base text-muted-foreground">
              Users can belong to organizations, and effective permissions are resolved from org roles at
              auth and token issuance time.
            </p>
            <p className="text-sm text-muted-foreground">
              The docs include a dedicated integration section for org context and RBAC behaviors.
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-sm">
          <CardContent className="p-6 space-y-3">
            <div className="mb-1 flex items-center gap-2 text-foreground">
              <Lock className="h-5 w-5 text-primary" />
              <h3 className="font-semibold">Integrator-First Surface</h3>
            </div>
            <p className="text-base text-muted-foreground">
              Use guide flows for frontend OAuth integration, confidential backend clients, SDK usage,
              and endpoint-level reference for API contracts.
            </p>
            <p className="text-sm text-muted-foreground">
              Each page maps to concrete routes in `packages/api` and is tested through Playwright flows.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default IntroductionPage;
