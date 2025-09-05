import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Building2, 
  Heart, 
  Shield, 
  Code, 
  Banknote,
  Users,
  Lock,
  Zap
} from "lucide-react";

const UseCases = () => {
  const industries = [
    {
      icon: Heart,
      title: "Healthcare & Medical",
      description: "HIPAA-compliant authentication with end-to-end encryption for patient data",
      benefits: [
        "PHI encryption keys never touch servers",
        "Exceed HIPAA requirements with math proof",
        "Complete audit trail without privacy loss"
      ],
      badge: "HIPAA Ready",
      color: "text-red-500"
    },
    {
      icon: Banknote,
      title: "Financial Services",
      description: "Bank-grade security with zero-knowledge guarantees for sensitive financial data",
      benefits: [
        "Eliminate insider threats completely",
        "Quantum-resistant cryptography",
        "Regulatory compliance made simple"
      ],
      badge: "SOC 2 Compatible",
      color: "text-green-500"
    },
    {
      icon: Building2,
      title: "Enterprise SaaS",
      description: "Differentiate with privacy-first architecture that builds customer trust",
      benefits: [
        "Marketing advantage with true privacy",
        "Reduce data breach liability",
        "Standard OIDC integration"
      ],
      badge: "Competitive Edge",
      color: "text-blue-500"
    },
    {
      icon: Shield,
      title: "Government & Defense",
      description: "Military-grade authentication for classified and sensitive government systems",
      benefits: [
        "Zero-trust architecture compatible",
        "Classification level separation",
        "Post-quantum cryptography ready"
      ],
      badge: "Security Cleared",
      color: "text-purple-500"
    }
  ];

  const useCase = [
    {
      icon: Code,
      title: "Developer Teams",
      scenario: "Replace Auth0/Okta",
      description: "Drop-in OIDC replacement with superior security guarantees",
      implementation: "5 minutes setup, standard JWT tokens, existing libraries work unchanged"
    },
    {
      icon: Users,
      title: "Privacy-First Startups",
      scenario: "Build Trust",
      description: "Offer mathematical privacy guarantees to differentiate from competitors",
      implementation: "Optional E2E encryption, marketing-friendly security claims, VC-fundable"
    },
    {
      icon: Lock,
      title: "Security Teams",
      scenario: "Eliminate Risk",
      description: "Remove password breach vectors entirely from your attack surface",
      implementation: "Database-driven config, automatic rotation, comprehensive logging"
    },
    {
      icon: Zap,
      title: "DevOps Teams",
      scenario: "Simplify Operations",
      description: "Single binary deployment with PostgreSQL, no complex infrastructure",
      implementation: "Docker ready, Kubernetes friendly, standard monitoring endpoints"
    }
  ];

  return (
    <section className="py-20 bg-background">
      <div className="container max-w-7xl">
        {/* Header */}
        <div className="text-center mb-16">
          <Badge variant="outline" className="mb-4 border-accent/20 text-accent">
            <Building2 className="mr-2 h-4 w-4" />
            Industry Solutions
          </Badge>
          <h2 className="text-4xl font-bold text-foreground mb-4">
            Built for Every Security-Conscious Industry
          </h2>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            From healthcare to finance, DarkAuth provides the cryptographic guarantees 
            your industry demands while simplifying compliance and reducing risk.
          </p>
        </div>

        {/* Industries Grid */}
        <div className="grid lg:grid-cols-2 gap-8 mb-20">
          {industries.map((industry, index) => (
            <Card key={index} className="group hover:shadow-elegant transition-smooth bg-gradient-subtle border-border/30">
              <CardHeader>
                <div className="flex items-center justify-between mb-4">
                  <industry.icon className={`h-8 w-8 ${industry.color} group-hover:scale-110 transition-bounce`} />
                  <Badge variant="secondary" className="text-xs">
                    {industry.badge}
                  </Badge>
                </div>
                <CardTitle className="text-xl font-semibold text-foreground group-hover:text-primary transition-smooth">
                  {industry.title}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground mb-4 leading-relaxed">
                  {industry.description}
                </p>
                <div className="space-y-2">
                  {industry.benefits.map((benefit, idx) => (
                    <div key={idx} className="flex items-start space-x-2 text-sm">
                      <div className="w-1.5 h-1.5 bg-primary rounded-full mt-2 flex-shrink-0"></div>
                      <span className="text-muted-foreground">{benefit}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Use Cases */}
        <div>
          <h3 className="text-2xl font-bold text-foreground mb-8 text-center">
            Common Implementation Scenarios
          </h3>
          
          <div className="grid md:grid-cols-2 gap-6">
            {useCase.map((uc, index) => (
              <Card key={index} className="hover:shadow-card transition-smooth border-border/50">
                <CardContent className="p-6">
                  <div className="flex items-start space-x-4">
                    <div className="bg-primary/10 p-3 rounded-lg flex-shrink-0">
                      <uc.icon className="h-6 w-6 text-primary" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-2">
                        <h4 className="font-semibold text-foreground">{uc.title}</h4>
                        <Badge variant="outline" className="text-xs">
                          {uc.scenario}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mb-3">
                        {uc.description}
                      </p>
                      <div className="bg-muted/30 p-3 rounded-lg">
                        <p className="text-xs text-muted-foreground">
                          <strong className="text-foreground">Implementation:</strong> {uc.implementation}
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Enterprise CTA */}
        <div className="mt-16 text-center">
          <div className="bg-gradient-primary p-8 rounded-2xl shadow-glow max-w-4xl mx-auto">
            <Shield className="h-12 w-12 text-white mx-auto mb-4" />
            <h3 className="text-2xl font-bold text-white mb-4">
              Ready to Eliminate Password Breaches?
            </h3>
            <p className="text-white/80 mb-6 max-w-2xl mx-auto">
              Join security-conscious organizations who have eliminated password breach risk entirely. 
              Get started in minutes with our production-ready solution.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <a href="#docs" className="bg-white text-primary px-6 py-3 rounded-lg font-semibold hover:bg-white/90 transition-smooth text-center">
                Run with Docker
              </a>
              <a href="#docs" className="border-2 border-white/20 text-white px-6 py-3 rounded-lg font-semibold hover:bg-white/10 transition-smooth text-center">
                Read Docs
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default UseCases;
