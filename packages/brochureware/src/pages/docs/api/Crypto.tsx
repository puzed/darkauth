import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import DocsCallout from "@/pages/docs/components/DocsCallout";
import { KeyRound, RefreshCw, ShieldCheck } from "lucide-react";

const endpoints = `GET /api/crypto/enc-pub
PUT /api/crypto/enc-pub
GET /api/crypto/user-enc-pub
GET /api/crypto/wrapped-drk
PUT /api/crypto/wrapped-drk
GET /api/crypto/wrapped-enc-priv
PUT /api/crypto/wrapped-enc-priv`;

const encPubPut = `PUT /api/crypto/enc-pub\nAuthorization: Bearer <token>\nContent-Type: application/json\n\n{\"publicKey\":\"...\"}`;

const wrappedDrk = `GET /api/crypto/wrapped-drk\nAuthorization: Bearer <session_token>`;

const CryptoPage = () => {
  return (
    <div className="space-y-8">
      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <Badge variant="outline" className="mb-2 border-primary/30 text-primary">
            API: Crypto
          </Badge>
          <CardTitle className="text-2xl">Public key and wrapped secret workflows</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-base text-muted-foreground">
            Crypto APIs are part of the user-facing surface and support both client key publication and
            wrapped key transport for session-specific data.
          </p>
        </CardContent>
      </Card>

      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Available endpoints</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="rounded-md border border-border/60 bg-muted/50 p-4 text-xs whitespace-pre-wrap">
            <code>{endpoints}</code>
          </pre>
          <p className="mt-3 text-sm text-muted-foreground">
            Use this surface if your app stores zero-knowledge data payloads and needs key wrapping.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="border-border/60 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Public-key bootstrap</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="overflow-x-auto rounded-md border border-border/60 bg-muted/50 p-4 text-xs">
              <code>{encPubPut}</code>
            </pre>
            <p className="mt-3 text-sm text-muted-foreground">
              Store an encryption public key that can be used by the server for subsequent wrapped key
              operations.
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Wrapped secrets</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="overflow-x-auto rounded-md border border-border/60 bg-muted/50 p-4 text-xs">
              <code>{wrappedDrk}</code>
            </pre>
            <p className="mt-3 text-sm text-muted-foreground">
              `GET` fetches existing wrapped DRK data; `PUT` updates wrapped content aligned to user
              session keys.
            </p>
          </CardContent>
        </Card>
      </div>

      <DocsCallout title="Security and storage model" icon={KeyRound}>
        <ul className="list-disc space-y-2 pl-5 text-base">
          <li>DEK wrapping payloads are opaque to the server when possible.</li>
          <li>Secrets are intended for zero-knowledge workflows only.</li>
          <li>Prefer per-session or per-resource derivation for scoped key separation.</li>
        </ul>
      </DocsCallout>

      <Card className="border-border/60 shadow-sm">
        <CardContent className="p-6">
          <div className="mb-2 flex items-center gap-2 text-foreground">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <h3 className="font-semibold">JWKS integration</h3>
          </div>
          <p className="text-base text-muted-foreground">
            Identity signing keys are exposed via `/.well-known/jwks.json` and should be part of your
            client verification step with token validation libraries.
          </p>
        </CardContent>
      </Card>

      <Card className="border-border/60 shadow-sm">
        <CardContent className="p-6">
          <div className="mb-2 flex items-center gap-2 text-foreground">
            <RefreshCw className="h-5 w-5 text-primary" />
            <h3 className="font-semibold">Rotation and cache behavior</h3>
          </div>
          <p className="text-base text-muted-foreground">
            Rotation behavior is governed by server policy and key settings. In production, coordinate key
            cache invalidation in connected clients.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default CryptoPage;
