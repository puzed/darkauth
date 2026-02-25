import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import DocsCallout from "@/pages/docs/components/DocsCallout";
import { ListChecks, Search, UserRoundSearch } from "lucide-react";

const publicModeQuery = `GET /api/users?q=alex`;

const managementModeQuery = `GET /api/users?search=alex&page=1&limit=10\nAuthorization: Bearer <client_credentials_token>`;

const directLookup = `GET /api/users/user_sub_123\nAuthorization: Bearer <token>`;

const UsersDirectoryGuidePage = () => {
  return (
    <div className="space-y-8">
      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <Badge variant="outline" className="mb-2 border-primary/30 text-primary">
            Guide: Users Directory
          </Badge>
          <CardTitle className="text-2xl">Search, inspect, and filter identity data</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-base text-muted-foreground">
            `/api/users` is the shared directory endpoint for both public and confidential callers. The
            effective response shape changes by token type and permissions.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="border-border/60 shadow-sm">
          <CardContent className="p-6 space-y-3">
            <div className="mb-1 flex items-center gap-2 text-foreground">
              <Search className="h-5 w-5 text-primary" />
              <h3 className="font-semibold">Directory mode (user token)</h3>
            </div>
            <p className="text-base text-muted-foreground">
              User-scoped tokens with `darkauth.users:read` can perform simple name/email-like search and
              receive limited directory fields.
            </p>
            <ul className="list-disc space-y-2 pl-5 text-base text-muted-foreground">
              <li>Use `q` for search input.</li>
              <li>Use `sids` only in management mode.</li>
              <li>Data returned is organization-scoped by caller context.</li>
            </ul>
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-sm">
          <CardContent className="p-6 space-y-3">
            <div className="mb-1 flex items-center gap-2 text-foreground">
              <ListChecks className="h-5 w-5 text-primary" />
              <h3 className="font-semibold">Management mode (client token)</h3>
            </div>
            <p className="text-base text-muted-foreground">
              Machine tokens using `client_credentials` may use `sids`, `search`, `page`, and `limit` for
              admin-like lookups and richer payloads.
            </p>
            <ul className="list-disc space-y-2 pl-5 text-base text-muted-foreground">
              <li>Search supports pagination.</li>
              <li>`search` and `q` are both accepted in this mode.</li>
              <li>Management responses include richer identity metadata.</li>
            </ul>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Common usage patterns</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div>
              <p className="mb-2 text-sm font-semibold text-foreground">Directory search</p>
              <pre className="overflow-x-auto rounded-md border border-border/60 bg-muted/50 p-4 text-xs">
                <code>{publicModeQuery}</code>
              </pre>
            </div>
            <div>
              <p className="mb-2 text-sm font-semibold text-foreground">Management search + pagination</p>
              <pre className="overflow-x-auto rounded-md border border-border/60 bg-muted/50 p-4 text-xs">
                <code>{managementModeQuery}</code>
              </pre>
            </div>
            <div>
              <p className="mb-2 text-sm font-semibold text-foreground">Direct lookup</p>
              <pre className="overflow-x-auto rounded-md border border-border/60 bg-muted/50 p-4 text-xs">
                <code>{directLookup}</code>
              </pre>
            </div>
          </div>
        </CardContent>
      </Card>

      <DocsCallout title="Permission check rules" icon={UserRoundSearch}>
        <ul className="list-disc space-y-2 pl-5 text-base">
          <li>
            User calls require `darkauth.users:read` in permissions or admin-style OAuth scope.
          </li>
          <li>
            Organization context is resolved from authenticated session when no bearer token is supplied.
          </li>
          <li>Missing permission returns `403` with permission message.</li>
        </ul>
      </DocsCallout>

      <Card className="border-border/60 shadow-sm">
        <CardContent className="p-6">
          <h3 className="font-semibold text-lg text-foreground">Endpoint summary</h3>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-base text-muted-foreground">
            <li><code>GET /api/users</code> — search or list users.</li>
            <li><code>GET /api/users/{`{sub}`}</code> — read one directory entry.</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
};

export default UsersDirectoryGuidePage;
