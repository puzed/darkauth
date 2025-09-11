import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Shield, 
  Award, 
  FileText, 
  Lock, 
  Zap,
  Users,
  Globe,
  Eye
} from "lucide-react";

const Security = () => {
  const certifications = [
    {
      icon: Award,
      title: "RFC 9380 Implemented",
      description: "OPAQUE protocol per standard",
      status: "Implemented"
    },
    {
      icon: Shield,
      title: "Security Audited",
      description: "Independent review planned",
      status: "Planned"
    },
    {
      icon: FileText,
      title: "SOC 2 Type II",
      description: "Compliance roadmap",
      status: "Planned"
    },
    {
      icon: Lock,
      title: "ISO 27001",
      description: "Information security management roadmap",
      status: "Planned"
    }
  ];

  const threats = [
    {
      threat: "Database Breach",
      traditional: "Passwords can be cracked offline",
      darkauth: "No password data to compromise",
      icon: "🗃️"
    },
    {
      threat: "Insider Threats",
      traditional: "Admins can access password hashes",
      darkauth: "Mathematically impossible to access",
      icon: "👤"
    },
    {
      threat: "Man-in-the-Middle",
      traditional: "TLS protects transmission only",
      darkauth: "Zero-knowledge proof prevents replay",
      icon: "🔗"
    },
    {
      threat: "Quantum Computing",
      traditional: "Future risk to current hashing",
      darkauth: "Uses modern, widely deployed cryptography",
      icon: "⚛️"
    }
  ];

  return (
    <section id="security" className="py-20 bg-gradient-subtle">
      <div className="container max-w-7xl">
        {/* Header */}
        <div className="text-center mb-16">
          <Badge variant="outline" className="mb-4 border-primary/20 text-primary">
            <Shield className="mr-2 h-4 w-4" />
            Military-Grade Security
          </Badge>
          <h2 className="text-4xl font-bold text-foreground mb-4">
            Cryptographic Guarantees, Not Just Promises
          </h2>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            DarkAuth provides mathematical proof that user passwords remain private, 
            backed by peer-reviewed cryptography and enterprise security controls.
          </p>
        </div>

        {/* Security Guarantees */}
        <div className="grid md:grid-cols-2 gap-8 mb-16">
          <Card className="shadow-elegant border-primary/20">
            <CardHeader>
              <CardTitle className="flex items-center text-primary">
                <Eye className="mr-3 h-6 w-6" />
                What We Can See
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center text-sm">
                <div className="w-2 h-2 bg-primary rounded-full mr-3"></div>
                User registration events
              </div>
              <div className="flex items-center text-sm">
                <div className="w-2 h-2 bg-primary rounded-full mr-3"></div>
                Authentication success/failure
              </div>
              <div className="flex items-center text-sm">
                <div className="w-2 h-2 bg-primary rounded-full mr-3"></div>
                Session management data
              </div>
              <div className="flex items-center text-sm">
                <div className="w-2 h-2 bg-primary rounded-full mr-3"></div>
                Application metadata
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-elegant border-destructive/20">
            <CardHeader>
              <CardTitle className="flex items-center text-destructive">
                <Lock className="mr-3 h-6 w-6" />
                What We Can Never See
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center text-sm">
                <div className="w-2 h-2 bg-destructive rounded-full mr-3"></div>
                User passwords (ever)
              </div>
              <div className="flex items-center text-sm">
                <div className="w-2 h-2 bg-destructive rounded-full mr-3"></div>
                Password hashes or derivatives
              </div>
              <div className="flex items-center text-sm">
                <div className="w-2 h-2 bg-destructive rounded-full mr-3"></div>
                Encryption keys (optional feature)
              </div>
              <div className="flex items-center text-sm">
                <div className="w-2 h-2 bg-destructive rounded-full mr-3"></div>
                User data contents
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Threat Protection */}
        <div className="mb-16">
          <h3 className="text-2xl font-bold text-foreground mb-8 text-center">
            Protection Against Real-World Threats
          </h3>
          
          <div className="overflow-x-auto bg-background rounded-xl shadow-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-4 px-6 font-semibold text-foreground">Threat Vector</th>
                  <th className="text-center py-4 px-6 font-semibold text-destructive">Traditional Auth</th>
                  <th className="text-center py-4 px-6 font-semibold text-primary">DarkAuth Protection</th>
                </tr>
              </thead>
              <tbody>
                {threats.map((threat, index) => (
                  <tr key={index} className="border-b border-border/30 hover:bg-muted/30 transition-smooth">
                    <td className="py-4 px-6 font-medium">
                      <div className="flex items-center">
                        <span className="text-xl mr-3">{threat.icon}</span>
                        {threat.threat}
                      </div>
                    </td>
                    <td className="text-center py-4 px-6 text-destructive text-xs">
                      {threat.traditional}
                    </td>
                    <td className="text-center py-4 px-6 text-primary text-xs font-medium">
                      {threat.darkauth}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Certifications */}
        <div className="mb-16">
          <h3 className="text-2xl font-bold text-foreground mb-8 text-center">
            Security Certifications & Compliance
          </h3>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {certifications.map((cert, index) => (
              <Card key={index} className="text-center hover:shadow-card transition-smooth">
                <CardContent className="p-6">
                  <cert.icon className="h-12 w-12 text-primary mx-auto mb-4" />
                  <h4 className="font-semibold text-foreground mb-2">{cert.title}</h4>
                  <p className="text-xs text-muted-foreground mb-3">{cert.description}</p>
                  <Badge 
                    variant={cert.status === "Verified" || cert.status === "Certified" ? "default" : "secondary"}
                    className="text-xs"
                  >
                    {cert.status}
                  </Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Technical Deep Dive */}
        <div className="bg-secondary/10 rounded-2xl p-8 border border-border/30">
          <div className="grid lg:grid-cols-2 gap-8 items-center">
            <div>
              <h3 className="text-2xl font-bold text-foreground mb-4">
                Cryptographic Foundation
              </h3>
              <div className="space-y-4 text-sm">
                <div className="flex items-start space-x-3">
                  <div className="w-2 h-2 bg-primary rounded-full mt-2 flex-shrink-0"></div>
                  <div>
                    <strong className="text-foreground">OPAQUE (RFC 9380):</strong>
                    <span className="text-muted-foreground ml-2">
                      Asymmetric password-authenticated key exchange protocol
                    </span>
                  </div>
                </div>
                <div className="flex items-start space-x-3">
                  <div className="w-2 h-2 bg-accent rounded-full mt-2 flex-shrink-0"></div>
                  <div>
                    <strong className="text-foreground">EdDSA Signatures:</strong>
                    <span className="text-muted-foreground ml-2">
                      Modern elliptic curve cryptography (Ed25519)
                    </span>
                  </div>
                </div>
                <div className="flex items-start space-x-3">
                  <div className="w-2 h-2 bg-primary rounded-full mt-2 flex-shrink-0"></div>
                  <div>
                    <strong className="text-foreground">Argon2id:</strong>
                    <span className="text-muted-foreground ml-2">
                      State-of-the-art key derivation function
                    </span>
                  </div>
                </div>
                <div className="flex items-start space-x-3">
                  <div className="w-2 h-2 bg-accent rounded-full mt-2 flex-shrink-0"></div>
                  <div>
                    <strong className="text-foreground">ECDH-ES + A256GCM:</strong>
                    <span className="text-muted-foreground ml-2">
                      Industry-standard key agreement and encryption
                    </span>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="text-center">
              <div className="bg-gradient-primary p-8 rounded-xl shadow-glow">
                <Shield className="h-16 w-16 text-white mx-auto mb-4" />
                <h4 className="text-xl font-bold text-white mb-2">Ready for Audit?</h4>
                <p className="text-white/80 text-sm mb-4">
                  Our security model is designed for transparency. 
                  Request detailed cryptographic specifications.
                </p>
                <a href="/whitepaper.pdf" download>
                  <Button variant="outline" className="bg-white/10 border-white/20 text-white hover:bg-white/20">
                    Download Security Whitepaper
                  </Button>
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Security;
