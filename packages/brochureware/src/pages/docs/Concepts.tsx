import { Card, CardContent } from "@/components/ui/card";
import DocsCallout from "@/pages/docs/components/DocsCallout";
import { LayoutPanelLeft, Users } from "lucide-react";

const ConceptsPage = () => {
  return (
    <div className="space-y-8">
      <Card className="border-border/60 shadow-sm">
        <CardContent className="p-6">
          <h2 className="text-2xl font-bold text-foreground">Core Concepts</h2>
          <p className="mt-3 text-base text-muted-foreground">
            Read these first if you are designing your integration model or planning to support both
            public and confidential clients in the same installation.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="border-border/60 shadow-sm">
          <CardContent className="p-6">
            <div className="mb-3 flex items-center gap-2 text-foreground">
              <LayoutPanelLeft className="h-5 w-5 text-primary" />
              <h3 className="font-semibold">Single Server, Two API Surfaces</h3>
            </div>
            <p className="text-base text-muted-foreground">
              User endpoints live under `/api` for auth and end-user resources. Admin endpoints are under
              `/admin` and include RBAC management, settings, and security operations.
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-sm">
          <CardContent className="p-6">
            <div className="mb-3 flex items-center gap-2 text-foreground">
              <Users className="h-5 w-5 text-primary" />
              <h3 className="font-semibold">Multi-actor permissions</h3>
            </div>
            <p className="text-base text-muted-foreground">
              Permissions are enforced in request handlers and reflected in session claims. Public users
              and admins can each have distinct permissions based on endpoint domain.
            </p>
          </CardContent>
        </Card>
      </div>

      <DocsCallout title="Workflow decision" icon={LayoutPanelLeft}>
        <ul className="list-disc space-y-2 pl-5 text-base">
          <li>
            Choose <strong>public-client flows</strong> when secrets cannot be safely stored.
          </li>
          <li>
            Choose <strong>confidential-client flows</strong> when the caller is server-side and can protect
            credentials.
          </li>
          <li>
            Use admin endpoints for provisioning, audit, and access governance, never for user login.
          </li>
        </ul>
      </DocsCallout>
    </div>
  );
};

export default ConceptsPage;
