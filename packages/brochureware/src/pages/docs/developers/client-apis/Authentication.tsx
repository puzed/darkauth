import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import DocsCallout from "@/pages/docs/components/DocsCallout";
import { KeyRound, ShieldCheck, UserRoundSearch } from "lucide-react";

const AuthenticationPage = () => {
  return (
    <div className="space-y-6">
      <Card className="border-border/50">
        <CardContent className="p-6">
          <Badge variant="outline" className="mb-3 border-primary/30 text-primary">
            Developers / Client APIs
          </Badge>
          <h2 className="text-2xl font-bold text-foreground">Authentication Concepts</h2>
          <p className="mt-3 text-base leading-6 text-muted-foreground">
            DarkAuth client APIs support two authentication concepts:
            bearer tokens for public clients and OAuth client credentials for confidential clients.
          </p>
        </CardContent>
      </Card>

      <DocsCallout title="Permission Example" icon={ShieldCheck}>
        <ul className="list-disc space-y-2 pl-5 text-base">
          <li>
            <code>darkauth.users:read</code> is a permission-based bearer access example.
          </li>
          <li>
            A valid token without that permission is authenticated but still forbidden.
          </li>
        </ul>
      </DocsCallout>

      <Card className="border-border/50">
        <CardContent className="p-6">
          <div className="mb-3 flex items-center gap-2 text-foreground">
            <UserRoundSearch className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-semibold">1) Public Client Authentication</h3>
          </div>
          <ul className="list-disc space-y-2 pl-5 text-base text-muted-foreground">
            <li>Used by browser or SPA clients that cannot safely store secrets.</li>
            <li>Calls APIs with `Authorization: Bearer &lt;token&gt;`.</li>
            <li>Authorization is permission-driven, such as `darkauth.users:read`.</li>
            <li>Best for user-delegated access where the user identity matters.</li>
          </ul>
        </CardContent>
      </Card>

      <Card className="border-border/50">
        <CardContent className="p-6">
          <div className="mb-3 flex items-center gap-2 text-foreground">
            <KeyRound className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-semibold">2) Confidential Client Authentication</h3>
          </div>
          <ul className="list-disc space-y-2 pl-5 text-base text-muted-foreground">
            <li>Used by backend services where secure secret storage is available.</li>
            <li>
              First calls `/api/token` using `grant_type=client_credentials` and
              `client_secret_basic`.
            </li>
            <li>
              Then calls APIs with `Authorization: Bearer &lt;access_token&gt;`.
            </li>
            <li>Requires a confidential client configured for `client_credentials` grant.</li>
            <li>Best for service-to-service and operational workflows.</li>
          </ul>
        </CardContent>
      </Card>

      <Card className="border-border/50">
        <CardContent className="p-6">
          <h3 className="text-lg font-semibold text-foreground">How to Choose</h3>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-base text-muted-foreground">
            <li>Choose bearer when the client is public and user-scoped permissions are needed.</li>
            <li>Choose confidential when the caller is a trusted server process.</li>
            <li>Never embed confidential client secrets in browser-delivered code.</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
};

export default AuthenticationPage;
