import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Shield, 
  Key, 
  Zap, 
  Database, 
  Settings, 
  Lock,
  RefreshCw,
  Users,
  Globe
} from "lucide-react";

const Features = () => {
  const features = [
    {
      icon: Shield,
      title: "True Zero-Knowledge",
      description: "RFC 9380 OPAQUE protocol ensures passwords never reach servers in any form",
      badge: "Cryptographic Proof",
      color: "text-primary"
    },
    {
      icon: Key,
      title: "Zero-Knowledge Key Delivery",
      description: "Optional client-side encryption keys delivered via URL fragments that never hit servers",
      badge: "End-to-End Encryption",
      color: "text-accent"
    },
    {
      icon: Globe,
      title: "Universal OIDC Compatibility",
      description: "Standard OAuth 2.0/OpenID Connect works with your existing stack out of the box",
      badge: "Drop-in Replacement",
      color: "text-primary"
    },
    {
      icon: Database,
      title: "Database-Driven Config",
      description: "Most settings live in PostgreSQL; minimal config.yaml for bootstrap",
      badge: "DevOps Friendly",
      color: "text-accent"
    },
    {
      icon: Settings,
      title: "Production-Ready Security",
      description: "PKCE, CSP headers, rate limiting, session management, and CSRF protection built-in",
      badge: "Enterprise Grade",
      color: "text-primary"
    },
    {
      icon: RefreshCw,
      title: "Key Rotation API",
      description: "Rotate Ed25519 signing keys via the admin endpoint without downtime",
      badge: "Maintenance Free",
      color: "text-accent"
    },
    {
      icon: Lock,
      title: "Admin/User Separation",
      description: "Separate admin (9081) and user (9080) interfaces with different access controls",
      badge: "Secure by Design",
      color: "text-primary"
    },
    {
      icon: Zap,
      title: "Single Server Deployment",
      description: "Run a single server or container with PostgreSQL or embedded PGLite",
      badge: "Simple Ops",
      color: "text-accent"
    },
    {
      icon: Users,
      title: "Two-Port Architecture",
      description: "Separate user (9080) and admin (9081) interfaces with distinct access controls",
      badge: "Clear Boundaries",
      color: "text-primary"
    }
  ];

  return (
    <section id="features" className="py-20 bg-gradient-subtle">
      <div className="container max-w-7xl">
        {/* Header */}
        <div className="text-center mb-16">
          <Badge variant="outline" className="mb-4 border-primary/20 text-primary">
            <Zap className="mr-2 h-4 w-4" />
            Enterprise Features
          </Badge>
          <h2 className="text-4xl font-bold text-foreground mb-4">
            Built for Production from Day One
          </h2>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            DarkAuth combines cutting-edge cryptography with practical deployment requirements, 
            delivering unmatched security without sacrificing compatibility or performance.
          </p>
        </div>

        {/* Features Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, index) => (
            <Card key={index} className="group hover:shadow-card transition-smooth bg-background/50 backdrop-blur border-border/50">
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between mb-3">
                  <feature.icon className={`h-8 w-8 ${feature.color} group-hover:scale-110 transition-bounce`} />
                  <Badge variant="secondary" className="text-xs">
                    {feature.badge}
                  </Badge>
                </div>
                <CardTitle className="text-lg font-semibold text-foreground group-hover:text-primary transition-smooth">
                  {feature.title}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  {feature.description}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Technical Specs */}
        <div className="mt-16 bg-secondary/20 rounded-2xl p-8 border border-border/30">
          <h3 className="text-2xl font-bold text-foreground mb-6 text-center">Technical Specifications</h3>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 text-center">
            <div className="space-y-2">
              <div className="text-2xl font-bold text-primary">RFC 9380</div>
              <div className="text-sm text-muted-foreground">OPAQUE Protocol Standard</div>
            </div>
            <div className="space-y-2">
              <div className="text-2xl font-bold text-accent">Ed25519</div>
              <div className="text-sm text-muted-foreground">Signing Algorithm (EdDSA)</div>
            </div>
            <div className="space-y-2">
              <div className="text-2xl font-bold text-primary">PKCE S256</div>
              <div className="text-sm text-muted-foreground">Required for Public Clients</div>
            </div>
            <div className="space-y-2">
              <div className="text-2xl font-bold text-accent">Open Source</div>
              <div className="text-sm text-muted-foreground">AGPL-3.0 Licensed</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Features;
