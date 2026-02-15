import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import DocsCallout from "@/pages/docs/components/DocsCallout";
import { ListChecks, ShieldCheck, UserRoundSearch } from "lucide-react";

const bearerExample = `const idToken = sessionStorage.getItem("id_token");

const response = await fetch(
  "http://localhost:9080/api/users?q=mark",
  {
    headers: {
      Authorization: \`Bearer \${idToken}\`,
    },
  }
);

if (!response.ok) throw new Error(\`HTTP \${response.status}\`);
const data = await response.json();
console.log(data.users);`;

const clientCredentialsExample = `const basic = Buffer.from("demo-confidential-client:YOUR_CLIENT_SECRET").toString("base64");

const tokenResponse = await fetch("http://localhost:9080/api/token", {
  method: "POST",
  headers: {
    Authorization: \`Basic \${basic}\`,
    "Content-Type": "application/x-www-form-urlencoded",
  },
  body: "grant_type=client_credentials&scope=darkauth.users:read",
});

if (!tokenResponse.ok) throw new Error(\`HTTP \${tokenResponse.status}\`);
const tokenData = await tokenResponse.json();
const accessToken = tokenData.access_token;

const usersResponse = await fetch(
  "http://localhost:9080/api/users?sids=user_sub_1,user_sub_2",
  {
    headers: {
      Authorization: \`Bearer \${accessToken}\`,
    },
  }
);

if (!usersResponse.ok) throw new Error(\`HTTP \${usersResponse.status}\`);
const usersData = await usersResponse.json();
console.log(usersData.users);`;

const bearerResponseExample = `{
  "users": [
    {
      "sub": "d7e6f5...",
      "display_name": "Directory Target",
      "avatar_url": null,
      "public_key_jwk": {
        "kty": "EC",
        "crv": "P-256",
        "x": "...",
        "y": "..."
      }
    }
  ]
}`;

const managementResponseExample = `{
  "users": [
    {
      "sub": "d7e6f5...",
      "email": "target@example.com",
      "name": "Directory Target",
      "createdAt": "2026-01-24T19:17:27.000Z",
      "groups": ["support", "ops"],
      "permissions": ["darkauth.users:read"]
    }
  ]
}`;

const UsersApiPage = () => {
  return (
    <div className="space-y-6">
      <Card className="border-border/50">
        <CardContent className="p-6">
          <Badge variant="outline" className="mb-3 border-primary/30 text-primary">
            Developers / Client APIs
          </Badge>
          <h2 className="text-2xl font-bold text-foreground">Users API (`/api/users`)</h2>
          <p className="mt-3 text-base leading-6 text-muted-foreground">
            `GET /api/users` is the user directory endpoint. It can be used from browser clients
            and backend services, but the allowed query parameters and response shape depend on
            the authentication method.
          </p>
        </CardContent>
      </Card>

      <DocsCallout title="This Is A Protected Endpoint" icon={ShieldCheck}>
        <ul className="list-disc space-y-2 pl-5 text-base">
          <li>
            Public clients can access this endpoint as long as the user has{" "}
            <code>darkauth.users:read</code>.
          </li>
          <li>
            Confidential clients use OAuth <code>client_credentials</code> and call this endpoint
            with a bearer access token.
          </li>
        </ul>
      </DocsCallout>

      <Card className="border-border/50">
        <CardContent className="p-6">
          <div className="mb-3 flex items-center gap-2 text-foreground">
            <ListChecks className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-semibold">Request Parameters</h3>
          </div>
          <ul className="list-disc space-y-2 pl-5 text-base text-muted-foreground">
            <li>Bearer mode: `q` for directory search text.</li>
            <li>Management bearer mode: `search` (or `q`), `page`, `limit`.</li>
            <li>Management bearer mode also supports `sids` as a comma-separated list of user IDs.</li>
          </ul>
        </CardContent>
      </Card>

      <Card className="border-border/50">
        <CardContent className="p-6">
          <div className="mb-3 flex items-center gap-2 text-foreground">
            <UserRoundSearch className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-semibold">Example: Bearer Client</h3>
          </div>
          <pre className="overflow-x-auto rounded-md border border-border/50 bg-muted/40 p-4 text-xs sm:text-base">
            <code>{bearerExample}</code>
          </pre>
          <p className="mt-4 text-base font-medium text-foreground">Example response</p>
          <pre className="mt-2 overflow-x-auto rounded-md border border-border/50 bg-muted/40 p-4 text-xs sm:text-base">
            <code>{bearerResponseExample}</code>
          </pre>
        </CardContent>
      </Card>

      <Card className="border-border/50">
        <CardContent className="p-6">
          <div className="mb-3 flex items-center gap-2 text-foreground">
            <UserRoundSearch className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-semibold">Example: Confidential Client</h3>
          </div>
          <pre className="overflow-x-auto rounded-md border border-border/50 bg-muted/40 p-4 text-xs sm:text-base">
            <code>{clientCredentialsExample}</code>
          </pre>
          <p className="mt-4 text-base font-medium text-foreground">Example response</p>
          <pre className="mt-2 overflow-x-auto rounded-md border border-border/50 bg-muted/40 p-4 text-xs sm:text-base">
            <code>{managementResponseExample}</code>
          </pre>
        </CardContent>
      </Card>

      <Card className="border-border/50">
        <CardContent className="p-6">
          <h3 className="text-lg font-semibold text-foreground">Status Codes</h3>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-base text-muted-foreground">
            <li>`200` for successful lookups.</li>
            <li>`401` for missing/invalid auth credentials.</li>
            <li>`403` for bearer tokens missing `darkauth.users:read`.</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
};

export default UsersApiPage;
