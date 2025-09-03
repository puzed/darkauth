import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  BookOpen, 
  Code, 
  Zap, 
  Settings, 
  Shield,
  ArrowRight,
  ExternalLink,
  Copy
} from "lucide-react";

const Documentation = () => {
  const quickStart = [
    {
      step: "1",
      title: "Install DarkAuth",
      code: "docker run -d darkauth/server:latest",
      description: "Single command deployment with PostgreSQL"
    },
    {
      step: "2", 
      title: "Configure OIDC",
      code: `curl -X POST /admin/clients \\
  -d '{"name": "My App", "redirect_uris": ["https://myapp.com/callback"]}'`,
      description: "Register your application via REST API"
    },
    {
      step: "3",
      title: "Integrate Client",
      code: `import { DarkAuthClient } from '@darkauth/client';
const auth = new DarkAuthClient('your-client-id');`,
      description: "Use our TypeScript SDK or any OIDC library"
    }
  ];

  const resources = [
    {
      icon: BookOpen,
      title: "API Documentation",
      description: "Complete REST API reference with examples",
      link: "/docs/api",
      badge: "Interactive"
    },
    {
      icon: Code,
      title: "Integration Guides",
      description: "Step-by-step guides for popular frameworks",
      link: "/docs/guides",
      badge: "Code Examples"
    },
    {
      icon: Shield,
      title: "Security Model",
      description: "Deep dive into OPAQUE protocol implementation",
      link: "/docs/security",
      badge: "Technical"
    },
    {
      icon: Settings,
      title: "Deployment Guide", 
      description: "Production deployment and configuration",
      link: "/docs/deployment",
      badge: "DevOps"
    }
  ];

  const sdks = [
    { name: "TypeScript/JavaScript", status: "Stable", version: "v2.1.0" },
    { name: "Python", status: "Beta", version: "v1.0.0-beta.2" },
    { name: "Go", status: "Alpha", version: "v0.9.0" },
    { name: "Java", status: "Planned", version: "TBD" }
  ];

  return (
    <section id="docs" className="py-20 bg-gradient-subtle">
      <div className="container max-w-7xl">
        {/* Header */}
        <div className="text-center mb-16">
          <Badge variant="outline" className="mb-4 border-primary/20 text-primary">
            <BookOpen className="mr-2 h-4 w-4" />
            Developer Resources
          </Badge>
          <h2 className="text-4xl font-bold text-foreground mb-4">
            Get Started in Under 5 Minutes
          </h2>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            Comprehensive documentation, SDKs, and examples to get you up and running 
            with zero-knowledge authentication quickly.
          </p>
        </div>

        {/* Quick Start */}
        <div className="mb-16">
          <h3 className="text-2xl font-bold text-foreground mb-8 text-center">
            Quick Start Guide
          </h3>
          
          <div className="grid lg:grid-cols-3 gap-6">
            {quickStart.map((step, index) => (
              <Card key={index} className="group hover:shadow-card transition-smooth bg-background/80 backdrop-blur">
                <CardHeader>
                  <div className="flex items-center space-x-3 mb-3">
                    <div className="bg-gradient-primary text-white rounded-full w-8 h-8 flex items-center justify-center text-sm font-bold">
                      {step.step}
                    </div>
                    <CardTitle className="text-lg">{step.title}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="bg-secondary/20 rounded-lg p-4 mb-4 border border-border/30">
                    <code className="text-sm font-mono text-foreground break-all">
                      {step.code}
                    </code>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      className="ml-2 h-6 w-6 p-0 hover:bg-primary/20"
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {step.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Documentation Resources */}
        <div className="grid md:grid-cols-2 gap-8 mb-16">
          <div>
            <h3 className="text-2xl font-bold text-foreground mb-6">
              Documentation & Guides
            </h3>
            <div className="space-y-4">
              {resources.map((resource, index) => (
                <Card key={index} className="group hover:shadow-card transition-smooth cursor-pointer">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-start space-x-3">
                        <div className="bg-primary/10 p-2 rounded-lg">
                          <resource.icon className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <h4 className="font-semibold text-foreground group-hover:text-primary transition-smooth">
                            {resource.title}
                          </h4>
                          <p className="text-sm text-muted-foreground mt-1">
                            {resource.description}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Badge variant="secondary" className="text-xs">
                          {resource.badge}
                        </Badge>
                        <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-smooth" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-2xl font-bold text-foreground mb-6">
              SDKs & Libraries
            </h3>
            <div className="space-y-3 mb-6">
              {sdks.map((sdk, index) => (
                <div key={index} className="flex items-center justify-between p-4 bg-background rounded-lg border border-border/30">
                  <div>
                    <h4 className="font-medium text-foreground">{sdk.name}</h4>
                    <p className="text-sm text-muted-foreground">{sdk.version}</p>
                  </div>
                  <Badge 
                    variant={sdk.status === "Stable" ? "default" : sdk.status === "Beta" ? "secondary" : "outline"}
                    className="text-xs"
                  >
                    {sdk.status}
                  </Badge>
                </div>
              ))}
            </div>
            
            <Card className="bg-gradient-primary shadow-glow">
              <CardContent className="p-6 text-white">
                <h4 className="font-semibold mb-2">Need a Custom SDK?</h4>
                <p className="text-white/80 text-sm mb-4">
                  We're building SDKs for all major languages. 
                  Request your preferred language or contribute to our open-source project.
                </p>
                <Button variant="outline" className="bg-white/10 border-white/20 text-white hover:bg-white/20">
                  <ExternalLink className="mr-2 h-4 w-4" />
                  View on GitHub
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Interactive Demo */}
        <div className="text-center bg-background rounded-2xl p-8 shadow-card border border-border/30">
          <Zap className="h-12 w-12 text-primary mx-auto mb-4" />
          <h3 className="text-2xl font-bold text-foreground mb-4">
            Try DarkAuth in Your Browser
          </h3>
          <p className="text-muted-foreground mb-6 max-w-2xl mx-auto">
            Experience zero-knowledge authentication firsthand with our interactive demo. 
            See how passwords never leave the browser while maintaining full OIDC compatibility.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button variant="hero" size="lg">
              Launch Interactive Demo
            </Button>
            <Button variant="outline" size="lg">
              View Source Code
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Documentation;