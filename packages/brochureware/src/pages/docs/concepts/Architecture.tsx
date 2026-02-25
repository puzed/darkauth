import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import DocsCallout from "@/pages/docs/components/DocsCallout";
import { ServerCog } from "lucide-react";

const ArchitecturePage = () => {
  return (
    <div className="space-y-8">
      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle className="text-2xl">Runtime Architecture</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="list-disc space-y-2 pl-5 text-base text-muted-foreground">
            <li>
              User server (`/api`, `/authorize`, `/token`, `/admin/login` equivalent in admin domain)
              runs on the configured user port.
            </li>
            <li>Admin server handles `/admin/*` endpoints and admin static/dashboard UI.</li>
            <li>Static UIs are served when not proxying Vite in development.</li>
            <li>
              `/openapi` endpoint is generated from controller schemas for current runtime build.
            </li>
          </ul>
        </CardContent>
      </Card>

      <DocsCallout title="How this affects deployments" icon={ServerCog}>
        <p className="text-base">
          Keep admin and user port access rules separate in security groups/firewalls. User login and OIDC
          endpoints must remain reachable to public clients, while admin routes usually stay restricted.
        </p>
      </DocsCallout>
    </div>
  );
};

export default ArchitecturePage;
