import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowRight, Shield, Server, Key, CheckCircle } from "lucide-react";

const HowItWorks = () => {
  const steps = [
    {
      step: "1",
      title: "User Registers",
      description: "Password stays on device, OPAQUE envelope sent to server",
      icon: Key,
      detail: "User enters password → Client generates OPAQUE envelope → Server stores envelope (no password data)"
    },
    {
      step: "2", 
      title: "Authentication",
      description: "Zero-knowledge proof of password without revealing it",
      icon: Shield,
      detail: "Client proves password knowledge → Server validates without learning password → JWT issued"
    },
    {
      step: "3",
      title: "Key Delivery",
      description: "Optional encryption keys delivered via URL fragments",
      icon: Server,
      detail: "Trusted apps receive encryption keys → Keys never hit server logs → End-to-end encryption enabled"
    },
    {
      step: "4",
      title: "Secure Access",
      description: "Standard OIDC tokens work with existing infrastructure",
      icon: CheckCircle,
      detail: "JWT tokens contain standard claims → Works with any OIDC client → User data remains encrypted"
    }
  ];

  return (
    <section id="how-it-works" className="py-20 bg-background">
      <div className="container max-w-7xl">
        {/* Header */}
        <div className="text-center mb-16">
          <Badge variant="outline" className="mb-4 border-accent/20 text-accent">
            <Shield className="mr-2 h-4 w-4" />
            OPAQUE Protocol
          </Badge>
          <h2 className="text-4xl font-bold text-foreground mb-4">
            How Zero-Knowledge Authentication Works
          </h2>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            DarkAuth implements the cryptographically proven OPAQUE protocol, ensuring 
            your servers never learn user passwords while maintaining full OIDC compatibility.
          </p>
        </div>

        {/* Steps */}
        <div className="grid lg:grid-cols-2 xl:grid-cols-4 gap-6 mb-16">
          {steps.map((step, index) => (
            <div key={index} className="relative">
              <Card className="h-full group hover:shadow-elegant transition-smooth bg-card border-border/50">
                <CardContent className="p-6">
                  {/* Step number */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="bg-gradient-primary text-white rounded-full w-8 h-8 flex items-center justify-center text-sm font-bold">
                      {step.step}
                    </div>
                    <step.icon className="h-6 w-6 text-primary group-hover:scale-110 transition-bounce" />
                  </div>
                  
                  {/* Title and description */}
                  <h3 className="text-lg font-semibold text-foreground mb-2 group-hover:text-primary transition-smooth">
                    {step.title}
                  </h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    {step.description}
                  </p>
                  
                  {/* Technical detail */}
                  <div className="text-xs text-muted-foreground border-t border-border/30 pt-3">
                    {step.detail}
                  </div>
                </CardContent>
              </Card>
              
              {/* Arrow connector */}
              {index < steps.length - 1 && (
                <div className="hidden xl:block absolute top-1/2 -right-3 transform -translate-y-1/2 z-10">
                  <ArrowRight className="h-6 w-6 text-primary" />
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Comparison Table */}
        <div className="bg-gradient-subtle rounded-2xl p-8 shadow-card">
          <h3 className="text-2xl font-bold text-foreground mb-8 text-center">
            Traditional Auth vs. DarkAuth
          </h3>
          
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-4 font-semibold text-foreground">Security Aspect</th>
                  <th className="text-center py-4 font-semibold text-destructive">Traditional Auth</th>
                  <th className="text-center py-4 font-semibold text-primary">DarkAuth</th>
                </tr>
              </thead>
              <tbody className="space-y-2">
                <tr className="border-b border-border/30">
                  <td className="py-4 font-medium">Password Storage</td>
                  <td className="text-center py-4 text-destructive">❌ Hashed on server</td>
                  <td className="text-center py-4 text-primary">✅ Never reaches server</td>
                </tr>
                <tr className="border-b border-border/30">
                  <td className="py-4 font-medium">Database Breach Impact</td>
                  <td className="text-center py-4 text-destructive">❌ Passwords at risk</td>
                  <td className="text-center py-4 text-primary">✅ Passwords remain safe</td>
                </tr>
                <tr className="border-b border-border/30">
                  <td className="py-4 font-medium">Insider Threat Protection</td>
                  <td className="text-center py-4 text-destructive">❌ Admin access = risk</td>
                  <td className="text-center py-4 text-primary">✅ Cryptographically impossible</td>
                </tr>
                <tr className="border-b border-border/30">
                  <td className="py-4 font-medium">Privacy Guarantee</td>
                  <td className="text-center py-4 text-destructive">❌ Policy-based</td>
                  <td className="text-center py-4 text-primary">✅ Mathematical proof</td>
                </tr>
                <tr>
                  <td className="py-4 font-medium">OIDC Compatibility</td>
                  <td className="text-center py-4 text-accent">✅ Standard</td>
                  <td className="text-center py-4 text-primary">✅ Enhanced</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* CTA */}
        <div className="text-center mt-12">
          <Button variant="hero" size="lg">
            See DarkAuth in Action
          </Button>
          <p className="text-sm text-muted-foreground mt-3">
            Try our interactive demo to see zero-knowledge authentication in real-time
          </p>
        </div>
      </div>
    </section>
  );
};

export default HowItWorks;