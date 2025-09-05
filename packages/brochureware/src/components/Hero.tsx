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

          <div className="mt-6 mx-auto max-w-3xl">
            <div className="bg-secondary/20 rounded-lg border border-border/30 overflow-hidden">
              <div className="px-4 py-2 border-b border-border/30 text-xs text-muted-foreground">BASH</div>
              <pre className="text-xs sm:text-sm font-mono text-foreground whitespace-pre overflow-x-auto p-4">
                <code className="nohighlight">
                  <span className="text-primary">docker</span>
                  <span>{" "}</span>
                  <span className="text-foreground">run</span>
                  <span>{" "}</span>
                  <span className="text-primary">-d</span>
                  <span>{"  "}</span>
                  <span className="text-primary">-p</span>
                  <span>{" "}</span>
                  <span className="text-foreground">9080:9080</span>
                  <span>{"  "}</span>
                  <span className="text-primary">-p</span>
                  <span>{" "}</span>
                  <span className="text-foreground">9081:9081</span>
                  <span>{"  "}</span>
                  <span className="text-foreground">ghcr.io/puzed/darkauth:latest</span>
                </code>
              </pre>
            </div>
          </div>

          {/* Trust indicators */}
          <p className="mt-8 text-sm text-muted-foreground">
            Open source • Self-hosted • Docker image available
          </p>
        </div>
      </div>

      {/* Bottom gradient */}
      <div className="absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-background to-transparent" />
    </section>
  );
};

export default Hero;
