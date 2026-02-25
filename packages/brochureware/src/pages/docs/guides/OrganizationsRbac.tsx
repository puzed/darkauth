import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import DocsCallout from "@/pages/docs/components/DocsCallout";
import { Building2, KeyRound, ShieldCheck, UsersRound } from "lucide-react";

const orgList = `GET /api/organizations\nAuthorization: Bearer <token>`;

const roleAssign = `POST /api/organizations/{organizationId}/members/{memberId}/roles\nAuthorization: Bearer <admin_token>\n\n{\"roleIds\":[\"role_uuid\"]}`;

const orgCreate = `POST /api/organizations\nAuthorization: Bearer <admin_token>\n\n{\"name\":\"Acme\",\"slug\":\"acme\"}`;

const OrganizationsRbacPage = () => {
  return (
    <div className="space-y-8">
      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <Badge variant="outline" className="mb-2 border-primary/30 text-primary">
            Guide: Organizations and RBAC
          </Badge>
          <CardTitle className="text-2xl">Model org context and permission enforcement</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-base text-muted-foreground">
            DarkAuth resolves one active organization context at auth time. Effective roles and
            permissions drive token claims and endpoint gates.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="border-border/60 shadow-sm">
          <CardContent className="p-6 space-y-3">
            <div className="mb-1 flex items-center gap-2 text-foreground">
              <UsersRound className="h-5 w-5 text-primary" />
              <h3 className="font-semibold">Runtime context rules</h3>
            </div>
            <ul className="list-disc space-y-2 pl-5 text-base text-muted-foreground">
              <li>User sessions may include a resolved `organizationId` and `organizationSlug`.</li>
              <li>Role resolution is performed at session creation and during token issue.</li>
              <li>Role/permission changes can trigger re-auth or token refresh expectations.</li>
            </ul>
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-sm">
          <CardContent className="p-6 space-y-3">
            <div className="mb-1 flex items-center gap-2 text-foreground">
              <ShieldCheck className="h-5 w-5 text-primary" />
              <h3 className="font-semibold">Claims and policy behavior</h3>
            </div>
            <ul className="list-disc space-y-2 pl-5 text-base text-muted-foreground">
              <li>Tokens can include `roles` and `permissions` claims for org context.</li>
              <li>Directory and admin endpoints evaluate claims and active membership.</li>
              <li>OTP-required role/group can enforce step-up checks.</li>
            </ul>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">User-space org endpoints</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="overflow-x-auto rounded-md border border-border/60 bg-muted/50 p-4 text-xs">
            <code>{orgList}</code>
          </pre>
          <pre className="mt-3 overflow-x-auto rounded-md border border-border/60 bg-muted/50 p-4 text-xs">
            <code>{orgCreate}</code>
          </pre>
          <p className="mt-3 text-sm text-muted-foreground">
            User routes also support member listing, invite creation, and role assignment with granular
            path parameters.
          </p>
        </CardContent>
      </Card>

      <DocsCallout title="Assigning roles to members" icon={KeyRound}>
        <pre className="text-xs rounded-md border border-primary/40 bg-white/5 p-3 overflow-x-auto">
          <code>{roleAssign}</code>
        </pre>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-base">
          <li>Either `roleIds` array or single `roleId` is accepted.</li>
          <li>Use admin endpoints for policy governance in production toolchains.</li>
        </ul>
      </DocsCallout>

      <Card className="border-border/60 shadow-sm">
        <CardContent className="p-6 space-y-3">
          <div className="mb-1 flex items-center gap-2 text-foreground">
            <Building2 className="h-5 w-5 text-primary" />
            <h3 className="font-semibold">Cross-surface governance</h3>
          </div>
          <ul className="list-disc space-y-2 pl-5 text-base text-muted-foreground">
            <li>/api endpoints build org-aware access tokens during login and token exchange.</li>
            <li>/admin endpoints expose broader RBAC objects for operations and compliance.</li>
            <li>Use audit logs to track org invites, role changes, and group assignments.</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
};

export default OrganizationsRbacPage;
