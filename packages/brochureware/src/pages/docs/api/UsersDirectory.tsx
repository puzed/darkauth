import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import DocsCallout from "@/pages/docs/components/DocsCallout";
import { UserRoundSearch, ListFilter, ShieldAlert } from "lucide-react";

const queryModes = `// Bearer token as user-mode
GET /api/users?q=alice
Authorization: Bearer <token_with_permission>

// Bearer token as management-mode
GET /api/users?search=alice&page=1&limit=20
Authorization: Bearer <client_credentials_token>`;

const directGet = `GET /api/users/{sub}
Authorization: Bearer <token>`;

const ApiUsersDirectoryPage = () => {
  return (
    <div className="space-y-8">
      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <Badge variant="outline" className="mb-2 border-primary/30 text-primary">
            API: Users Directory
          </Badge>
          <CardTitle className="text-2xl">Search and inspect user directory entries</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-base text-muted-foreground">
            This endpoint returns directory entities with payloads scoped by auth mode and membership.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="border-border/60 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Paths</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-2 pl-5 text-base text-muted-foreground">
              <li><code>GET /api/users</code> — search and list users.</li>
              <li><code>GET /api/users/{`{sub}`}</code> — retrieve a specific user by sub.</li>
            </ul>
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Auth matrix</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-2 pl-5 text-base text-muted-foreground">
              <li>Public mode requires `darkauth.users:read` permission claim.</li>
              <li>Management mode uses `client_credentials` + scope `darkauth.users:read`.</li>
              <li>Session-based caller gets directory result in active org context.</li>
            </ul>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Query examples</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="overflow-x-auto rounded-md border border-border/60 bg-muted/50 p-4 text-xs">
            <code>{queryModes}</code>
          </pre>
          <pre className="mt-3 overflow-x-auto rounded-md border border-border/60 bg-muted/50 p-4 text-xs">
            <code>{directGet}</code>
          </pre>
        </CardContent>
      </Card>

      <DocsCallout title="Mode-specific response shape" icon={ListFilter}>
        <ul className="list-disc space-y-2 pl-5 text-base">
          <li>Directory mode commonly exposes safe fields (e.g. `sub`, `display_name`, pubkey).</li>
          <li>Management mode can include account metadata and access fields.</li>
          <li>Use least-privilege tokens and treat lookup results as sensitive where possible.</li>
        </ul>
      </DocsCallout>

      <Card className="grid border-border/50 md:grid md:grid-cols-2 gap-0">
        <div className="p-5">
          <div className="mb-2 flex items-center gap-2 text-foreground">
            <UserRoundSearch className="h-5 w-5 text-primary" />
            <h3 className="font-semibold">Common errors</h3>
          </div>
          <ul className="list-disc space-y-2 pl-5 text-base text-muted-foreground">
            <li>401 — missing/invalid session or bearer token.</li>
            <li>403 — missing `darkauth.users:read` permission/scope.</li>
            <li>404 — unknown `sub` in direct lookup.</li>
          </ul>
        </div>
        <div className="p-5 border-t md:border-t-0 md:border-l border-border/50">
          <div className="mb-2 flex items-center gap-2 text-foreground">
            <ShieldAlert className="h-5 w-5 text-primary" />
            <h3 className="font-semibold">Performance note</h3>
          </div>
          <p className="text-base text-muted-foreground">
            Keep search terms short and index by display fields where possible in production integrations.
          </p>
        </div>
      </Card>
    </div>
  );
};

export default ApiUsersDirectoryPage;
