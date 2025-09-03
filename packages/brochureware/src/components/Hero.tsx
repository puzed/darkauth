import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Shield, Lock, Key, Zap } from "lucide-react";

const Hero = () => {
  return (
    <section className="relative overflow-hidden bg-gradient-subtle py-20 lg:py-32">
      {/* Background decoration */}
      <div className="absolute inset-0 bg-grid-slate-100 [mask-image:linear-gradient(0deg,white,rgba(255,255,255,0.6))] dark:bg-grid-slate-700/25" />
      
      <div className="container relative max-w-7xl">
        <div className="mx-auto max-w-4xl text-center">
          {/* Badge */}
          <Badge variant="outline" className="mb-6 text-sm font-medium border-primary/20 text-primary">
            <Zap className="mr-2 h-4 w-4" />
            RFC 9380 OPAQUE Protocol • Production Ready
          </Badge>

          {/* Main Headline */}
          <h1 className="mb-6 text-4xl font-bold tracking-tight text-foreground sm:text-6xl lg:text-7xl">
            Your Password Never Leaves{" "}
            <span className="bg-gradient-hero bg-clip-text text-transparent">
              Your Device
            </span>
          </h1>

          {/* Subheadline */}
          <p className="mb-8 text-xl leading-8 text-muted-foreground max-w-3xl mx-auto">
            DarkAuth is the world's first production-ready authentication system where your server 
            <strong className="text-foreground"> never learns user passwords</strong> — not during registration, 
            not during login, never. Built on cryptographically proven OPAQUE protocol with full OIDC compatibility.
          </p>

          {/* Feature highlights */}
          <div className="mb-10 flex flex-wrap justify-center gap-6 text-sm font-medium text-muted-foreground">
            <div className="flex items-center">
              <Shield className="mr-2 h-4 w-4 text-primary" />
              Zero-Knowledge Security
            </div>
            <div className="flex items-center">
              <Lock className="mr-2 h-4 w-4 text-primary" />
              OIDC Compatible
            </div>
            <div className="flex items-center">
              <Key className="mr-2 h-4 w-4 text-primary" />
              End-to-End Encryption
            </div>
          </div>

          {/* CTAs */}
          <div className="flex flex-col gap-4 sm:flex-row sm:justify-center">
            <Button variant="hero" size="lg" className="text-lg px-8 py-4">
              Start Free Trial
            </Button>
            <Button variant="outline" size="lg" className="text-lg px-8 py-4">
              View Documentation
            </Button>
          </div>

          {/* Trust indicators */}
          <p className="mt-8 text-sm text-muted-foreground">
            Trusted by security-conscious organizations • 
            <span className="font-medium text-foreground"> 99.99% uptime SLA</span> • 
            Open source
          </p>
        </div>
      </div>

      {/* Bottom gradient */}
      <div className="absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-background to-transparent" />
    </section>
  );
};

export default Hero;