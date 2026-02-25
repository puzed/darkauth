import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import DocsCallout from "@/pages/docs/components/DocsCallout";
import { Building2, KeyRound, UsersRound, UserRoundCheck } from "lucide-react";

const orgList = `GET /api/organizations\nAuthorization: Bearer <token>`;
const orgGet = `GET /api/organizations/{organizationId}`;
const orgMembers = `GET /api/organizations/{organizationId}/members\nAuthorization: Bearer <token>`;
const createInvite = `POST /api/organizations/{organizationId}/invites\nAuthorization: Bearer <token>\n\n{\"email\":\"a@org.com\",\"roleIds\":[\"role-id\"],\"expiresAt\":\"2026-12-31T00:00:00.000Z\"}`;

const OrganizationsApiPage = () => {
  return (
    <div className="space-y-8">
      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <Badge variant="outline" className="mb-2 border-primary/30 text-primary">
            API: Organizations
          </Badge>
          <CardTitle className="text-2xl">Organization and role membership APIs</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-base text-muted-foreground">
            Organization APIs are user-scoped and enforce active membership. Permissions and role metadata
            are part of the resulting session context.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="border-border/60 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Core endpoints</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-2 pl-5 text-base text-muted-foreground">
              <li><code>GET /api/organizations</code> — list accessible orgs.</li>
              <li><code>POST /api/organizations</code> — create org.</li>
              <li><code>GET /api/organizations/{`{organizationId}`}</code> — read org details.</li>
              <li><code>GET /api/organizations/{`{organizationId}`}/members</code> — list members.</li>
            </ul>
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Membership and invites</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-2 pl-5 text-base text-muted-foreground">
              <li><code>POST /api/organizations/{`{organizationId}`}/members/{`{memberId}`}/roles</code> — role assignment.</li>
              <li><code>DELETE .../members/{`{memberId}`}/roles/{`{roleId}`}</code> — remove role.</li>
              <li><code>POST /api/organizations/{`{organizationId}`}/invites</code> — create invite.</li>
            </ul>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Typical flow</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="overflow-x-auto rounded-md border border-border/60 bg-muted/50 p-4 text-xs">
            <code>{orgList}</code>
          </pre>
          <pre className="mt-3 overflow-x-auto rounded-md border border-border/60 bg-muted/50 p-4 text-xs">
            <code>{orgMembers}</code>
          </pre>
          <pre className="mt-3 overflow-x-auto rounded-md border border-border/60 bg-muted/50 p-4 text-xs">
            <code>{createInvite}</code>
          </pre>
        </CardContent>
      </Card>

      <DocsCallout title="Permission behavior" icon={KeyRound}>
        <ul className="list-disc space-y-2 pl-5 text-base">
          <li>Actions are denied if user is not active in the org.</li>
          <li>Role checks are applied before returning claims and before mutating membership.</li>
          <li>Audit records include org and actor metadata for traceability.</li>
        </ul>
      </DocsCallout>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="border-border/60 shadow-sm">
          <CardContent className="p-6">
            <div className="mb-2 flex items-center gap-2 text-foreground">
              <UsersRound className="h-5 w-5 text-primary" />
              <h3 className="font-semibold">Use in tokens</h3>
            </div>
            <p className="text-base text-muted-foreground">
              Org ID and slug can appear in session/id token claims to keep downstream clients
              organization-aware.
            </p>
            <p className="mt-3 text-sm text-muted-foreground">
              `org_id`, `org_slug`, `roles`, `permissions`.
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-sm">
          <CardContent className="p-6">
            <div className="mb-2 flex items-center gap-2 text-foreground">
              <Building2 className="h-5 w-5 text-primary" />
              <h3 className="font-semibold">Admin and user overlap</h3>
            </div>
            <p className="text-base text-muted-foreground">
              For platform admins use `/admin/organizations*` for global control and provisioning.
            </p>
            <p className="mt-3 text-sm text-muted-foreground">
              <strong>{orgGet}</strong>
              <br />
              <strong>{orgGet}</strong>
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/60 shadow-sm">
        <CardContent className="p-6">
          <div className="mb-2 flex items-center gap-2 text-foreground">
            <UserRoundCheck className="h-5 w-5 text-primary" />
            <h3 className="font-semibold">Integration hint</h3>
          </div>
          <p className="text-base text-muted-foreground">
            Cache organization lists on client startup, then refresh when membership-changing events happen
            (invite accept, grant, revoke, role edits).
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default OrganizationsApiPage;
