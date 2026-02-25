import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import DocsCallout from "@/pages/docs/components/DocsCallout";
import { Cog, ServerCog, Shield, UserRoundCog } from "lucide-react";

const adminEndpoints = `POST /admin/login
POST /admin/token
POST /admin/refresh-token
GET /admin/session
POST /admin/logout`;

const userOps = `GET /admin/users
POST /admin/users
GET /admin/users/{sub}
PATCH /admin/users/{sub}
DELETE /admin/users/{sub}
PUT /admin/users/{sub}/groups
GET /admin/users/{sub}/permissions`;

const authzOps = `GET /admin/clients
POST /admin/clients
GET /admin/roles
POST /admin/roles
GET /admin/permissions
POST /admin/permissions
GET /admin/groups
POST /admin/groups`;

const adminApiPage = () => {
  return (
    <div className="space-y-8">
      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <Badge variant="outline" className="mb-2 border-primary/30 text-primary">
            API: Admin
          </Badge>
          <CardTitle className="text-2xl">Management surface for operators</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-base text-muted-foreground">
            `/admin` endpoints are required for provisioning, RBAC maintenance, settings, security posture,
            and admin-specific operational workflows.
          </p>
        </CardContent>
      </Card>

      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Authentication surface</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="overflow-x-auto rounded-md border border-border/60 bg-muted/50 p-4 text-xs">
            <code>{adminEndpoints}</code>
          </pre>
          <p className="mt-3 text-sm text-muted-foreground">
            Admin auth is bearer-based; access is constrained by admin role and permission model.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="border-border/60 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Identity and users</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="overflow-x-auto rounded-md border border-border/60 bg-muted/50 p-4 text-xs">
              <code>{userOps}</code>
            </pre>
            <p className="mt-2 text-sm text-muted-foreground">
              Includes admin user CRUD and user-to-group/permission management.
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">AuthZ + policy</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="overflow-x-auto rounded-md border border-border/60 bg-muted/50 p-4 text-xs">
              <code>{authzOps}</code>
            </pre>
            <p className="mt-2 text-sm text-muted-foreground">
              Manage clients, roles, permissions, groups, and org structures.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Audit, security, and settings</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="list-disc space-y-2 pl-5 text-base text-muted-foreground">
            <li><code>GET /admin/audit-logs</code> and <code>/admin/audit-logs/export</code>.</li>
            <li><code>GET /admin/otp/status</code>, <code>POST /admin/otp/disable</code>, <code>POST /admin/otp/reset</code>.</li>
            <li><code>GET /admin/settings</code> and <code>PUT /admin/settings</code>.</li>
            <li><code>GET /admin/jwks</code> and <code>POST /admin/jwks</code> for key operations.</li>
            <li>Security headers, rate-limits, and policy toggles are all maintained in settings.</li>
          </ul>
        </CardContent>
      </Card>

      <DocsCallout title="Role of admin sessions" icon={Shield}>
        <ul className="list-disc space-y-2 pl-5 text-base">
          <li>Admin session contains role classification (`read` vs write).</li>
          <li>Write operations can be restricted by role permissions.</li>
          <li>Audit logging captures actor and resource identifiers for each mutating call.</li>
        </ul>
      </DocsCallout>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="border-border/60 shadow-sm">
          <CardContent className="p-6">
            <div className="mb-2 flex items-center gap-2 text-foreground">
              <Cog className="h-5 w-5 text-primary" />
              <h3 className="font-semibold">Provisioning clusters</h3>
            </div>
            <p className="text-base text-muted-foreground">
              Combine users, roles, and org endpoints to automate tenant bootstrapping.
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-sm">
          <CardContent className="p-6">
            <div className="mb-2 flex items-center gap-2 text-foreground">
              <ServerCog className="h-5 w-5 text-primary" />
              <h3 className="font-semibold">Operational checks</h3>
            </div>
            <p className="text-base text-muted-foreground">
              Use `/admin/organizations`, `/admin/roles`, and `/admin/permissions` for periodic health
              and compliance audits.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Client credentials administration</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-2 flex items-center gap-2 text-foreground">
            <UserRoundCog className="h-5 w-5 text-primary" />
            <h3 className="font-semibold">Machine-to-machine setup</h3>
          </div>
          <ul className="list-disc space-y-2 pl-5 text-base text-muted-foreground">
            <li>Create a confidential client with `client_secret_basic` auth.</li>
            <li>Assign scopes based on service requirements.</li>
            <li>Store secrets via secure admin flows and rotate regularly.</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
};

export default adminApiPage;
