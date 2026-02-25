import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import DocsCallout from "@/pages/docs/components/DocsCallout";
import { Palette, Paintbrush, ShieldAlert, Settings } from "lucide-react";

const brandingEndpoints = `GET /api/branding/logo?dark=1
GET /api/branding/favicon?dark=1
GET /api/branding/custom.css\nGET /admin/settings\nPUT /admin/settings`;

const BrandingPage = () => {
  return (
    <div className="space-y-8">
      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <Badge variant="outline" className="mb-2 border-primary/30 text-primary">
            Operations: Branding
          </Badge>
          <CardTitle className="text-2xl">Theme, logos, and visual identity</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-base text-muted-foreground">
            Branding is configured through settings and reflected at runtime through `/api/branding/*` and
            `/admin/settings` controls.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="border-border/60 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Runtime assets</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="overflow-x-auto rounded-md border border-border/60 bg-muted/50 p-4 text-xs">
              <code>{brandingEndpoints}</code>
            </pre>
            <p className="mt-3 text-sm text-muted-foreground">
              Logo and favicon endpoints can fall back to defaults when unset.
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Config via settings keys</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-2 pl-5 text-base text-muted-foreground">
              <li>Color palette (`branding.colors`, `branding.colors_dark`).</li>
              <li>Typography (`branding.font`).</li>
              <li>Identity (`branding.identity`, logo and favicon keys).</li>
              <li>Custom CSS additions (`branding.custom_css`).</li>
            </ul>
          </CardContent>
        </Card>
      </div>

      <DocsCallout title="CSS delivery model" icon={Paintbrush}>
        <ul className="list-disc space-y-2 pl-5 text-base">
          <li>`/api/branding/custom.css` is generated from settings at runtime.</li>
          <li>Sanitized CSS is applied to avoid unsafe directives.</li>
          <li>Cache behavior may vary between light and dark modes.</li>
        </ul>
      </DocsCallout>

      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">UI parity strategy</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 md:grid-cols-2">
            <Card className="border-border/60 shadow-sm">
              <CardContent className="p-4">
                <div className="mb-2 flex items-center gap-2 text-foreground">
                  <Palette className="h-4 w-4" />
                  <h3 className="font-semibold">User UI</h3>
                </div>
                <p className="text-sm text-muted-foreground">
                  Reads identity and branding from user-facing APIs and applies generated vars dynamically.
                </p>
              </CardContent>
            </Card>
            <Card className="border-border/60 shadow-sm">
              <CardContent className="p-4">
                <div className="mb-2 flex items-center gap-2 text-foreground">
                  <ShieldAlert className="h-4 w-4" />
                  <h3 className="font-semibold">Admin UI</h3>
                </div>
                <p className="text-sm text-muted-foreground">
                  Uses admin-side settings and can set identity values for organization labels and tokens.
                </p>
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Operational caution</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-2 flex items-center gap-2 text-foreground">
            <Settings className="h-5 w-5 text-primary" />
            <h3 className="font-semibold">Keep safe values protected</h3>
          </div>
          <p className="text-base text-muted-foreground">
            Some settings values are marked secure; admin settings API redacts secure values for read-only
            sessions.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default BrandingPage;
