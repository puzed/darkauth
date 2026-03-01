import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, Shield, Lock, KeyRound, Hash, RefreshCcw, Users, Settings, BookOpenCheck, ServerCog } from "lucide-react";

type Feature = {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  bullets: string[];
  tags?: string[];
};

const features: Feature[] = [
  {
    icon: Shield,
    title: "OPAQUE Authentication (Users & Admins)",
    bullets: [
      "Password never leaves the device (RFC 9380)",
      "Login start/finish endpoints for users and admins",
      "Identity binding on finish and rate limits",
    ],
    tags: ["OPAQUE", "P-256"],
  },
  {
    icon: BookOpenCheck,
    title: "OIDC Provider (Authorization Code + PKCE)",
    bullets: [
      "Discovery and JWKS endpoints",
      "Authorization and Token endpoints with S256 PKCE",
      "ID Token signed with EdDSA",
    ],
    tags: ["OIDC", "PKCE S256", "EdDSA"],
  },
  {
    icon: Lock,
    title: "TOTP MFA (Users & Admins)",
    bullets: [
      "Setup and verify with backup codes",
      "Per-group and cohort enforcement with rate limits",
      "AMR includes otp; ACR indicates MFA",
    ],
    tags: ["OTP", "TOTP", "MFA"],
  },
  {
    icon: Lock,
    title: "Zero‑Knowledge DRK Delivery",
    bullets: [
      "Client unwraps DRK using device‑derived keys",
      "Fragment‑only compact JWE to ZK‑enabled apps",
      "Token returns zk_drk_hash for verification",
    ],
    tags: ["ECDH‑ES", "A256GCM", "Fragment"],
  },
  {
    icon: KeyRound,
    title: "Crypto Endpoints",
    bullets: [
      "GET/PUT wrapped DRK",
      "PUT user encryption public key JWK",
      "GET/PUT wrapped private key for recovery",
    ],
    tags: ["/crypto/*"],
  },
  {
    icon: Users,
    title: "Users Directory",
    bullets: [
      "Search users with published public keys",
      "Lookup user by subject",
    ],
    tags: ["/users/search", "/users/:sub"],
  },
  {
    icon: RefreshCcw,
    title: "SPA Session & Refresh",
    bullets: [
      "/session for minimal session info",
      "/token refresh grant to rotate session tokens",
    ],
    tags: ["Bearer", "SPA"],
  },
  {
    icon: Settings,
    title: "Admin: Clients, Settings, RBAC",
    bullets: [
      "Manage clients, settings, users, groups, permissions",
      "JWKS list and rotate",
      "OpenAPI served for Admin APIs",
    ],
    tags: ["Admin UI", "JWKS", "OpenAPI"],
  },
  {
    icon: ServerCog,
    title: "Audit Logging",
    bullets: [
      "Admin actions logged with actor context",
      "List, detail, and CSV export endpoints",
    ],
    tags: ["Admin API"],
  },
  {
    icon: ServerCog,
    title: "Install & KEK‑Protected Secrets",
    bullets: [
      "One‑time install flow on admin port",
      "KEK derives from passphrase to encrypt private JWKs and client secrets",
    ],
    tags: ["Install", "KEK"],
  },
  {
    icon: ServerCog,
    title: "Custom Branding",
    bullets: [
      "Database‑driven branding delivered via /config.js",
      "Admin preview with theme sync",
    ],
    tags: ["Branding"],
  },
  {
    icon: Hash,
    title: "Claims: Permissions and Groups",
    bullets: [
      "ID tokens can include permissions and groups",
      "Computed from direct and group‑derived access",
    ],
    tags: ["Custom Claims"],
  },
];

const Section = ({ children }: { children: React.ReactNode }) => (
  <section className="py-16">
    <div className="container max-w-4xl">{children}</div>
  </section>
);

const FeaturesPage = () => {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <Section>
        <div className="text-center mb-10">
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-foreground mb-3">Features</h1>
          <p className="text-lg text-muted-foreground">
            A compact list of what is implemented today, aligned with OIDC and the zero‑knowledge DRK extension.
          </p>
        </div>
        <div className="space-y-4">
          {features.map((f, i) => (
            <Card key={i} className="bg-card border-border/50">
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <f.icon className="h-6 w-6 text-primary mt-1" />
                  <div className="flex-1">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <h3 className="text-lg font-semibold text-foreground">{f.title}</h3>
                      <div className="flex gap-2">
                        {(f.tags || []).map((t, idx) => (
                          <Badge key={idx} variant="outline" className="border-primary/30 text-primary/80">
                            {t}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <ul className="mt-3 space-y-1">
                      {f.bullets.map((b, bi) => (
                        <li key={bi} className="flex items-start gap-2 text-sm text-muted-foreground">
                          <Check className="h-4 w-4 text-primary mt-0.5" />
                          <span>{b}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </Section>
      <Footer />
    </div>
  );
};

export default FeaturesPage;
