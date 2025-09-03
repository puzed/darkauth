import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle, Shield, Database, CheckCircle } from "lucide-react";

const ProblemSolution = () => {
  return (
    <section className="py-20 bg-background">
      <div className="container max-w-7xl">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          
          {/* Problem Side */}
          <div className="space-y-6">
            <div className="flex items-center space-x-3 mb-6">
              <AlertTriangle className="h-8 w-8 text-destructive" />
              <h2 className="text-3xl font-bold text-foreground">The Problem</h2>
            </div>
            
            <Card className="border-destructive/20 bg-destructive/5">
              <CardContent className="p-6">
                <div className="space-y-4">
                  <div className="flex items-start space-x-3">
                    <Database className="h-5 w-5 text-destructive mt-1 flex-shrink-0" />
                    <div>
                      <h3 className="font-semibold text-foreground mb-2">Traditional Auth Stores Password Hashes</h3>
                      <p className="text-sm text-muted-foreground">
                        Even with salting and hashing, password databases can be cracked offline if breached. 
                        Billions of credentials have been compromised this way.
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-start space-x-3">
                    <AlertTriangle className="h-5 w-5 text-destructive mt-1 flex-shrink-0" />
                    <div>
                      <h3 className="font-semibold text-foreground mb-2">Insider Threats & Data Breaches</h3>
                      <p className="text-sm text-muted-foreground">
                        Database administrators, hackers, and even quantum computers pose risks to 
                        any password data stored on servers.
                      </p>
                    </div>
                  </div>
                  
                  <div className="bg-destructive/10 p-4 rounded-lg">
                    <p className="text-sm font-medium text-destructive">
                      <strong>Result:</strong> Even the most secure companies face password breach liability and user trust issues.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Solution Side */}
          <div className="space-y-6">
            <div className="flex items-center space-x-3 mb-6">
              <Shield className="h-8 w-8 text-primary" />
              <h2 className="text-3xl font-bold text-foreground">The DarkAuth Solution</h2>
            </div>
            
            <Card className="border-primary/20 bg-primary/5 shadow-elegant">
              <CardContent className="p-6">
                <div className="space-y-4">
                  <div className="flex items-start space-x-3">
                    <CheckCircle className="h-5 w-5 text-primary mt-1 flex-shrink-0" />
                    <div>
                      <h3 className="font-semibold text-foreground mb-2">OPAQUE Protocol (RFC 9380)</h3>
                      <p className="text-sm text-muted-foreground">
                        Passwords never reach your servers in any form. Only an "opaque envelope" 
                        is stored that reveals nothing about the actual password.
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-start space-x-3">
                    <CheckCircle className="h-5 w-5 text-primary mt-1 flex-shrink-0" />
                    <div>
                      <h3 className="font-semibold text-foreground mb-2">Mathematical Guarantees</h3>
                      <p className="text-sm text-muted-foreground">
                        Even with full database access, attackers cannot determine user passwords. 
                        This isn't just best practice — it's cryptographically impossible.
                      </p>
                    </div>
                  </div>
                  
                  <div className="bg-primary/10 p-4 rounded-lg">
                    <p className="text-sm font-medium text-primary">
                      <strong>Result:</strong> Complete elimination of password breach risk with seamless OIDC integration.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Bottom CTA */}
        <div className="mt-16 text-center">
          <div className="inline-flex items-center space-x-4 bg-gradient-primary p-6 rounded-2xl shadow-glow">
            <Shield className="h-8 w-8 text-white" />
            <div className="text-left">
              <p className="text-white font-semibold text-lg">Ready to eliminate password breaches forever?</p>
              <p className="text-white/80 text-sm">Deploy DarkAuth in under 5 minutes with full OIDC compatibility.</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default ProblemSolution;