import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ShieldCheck, Lock, KeySquare, EyeOff, Hash, Network, BookCheck, TriangleAlert, ListChecks } from "lucide-react";

const Section = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <section className={`py-16 ${className}`}>
    <div className="container max-w-6xl">{children}</div>
  </section>
);

const KeyPoint = ({ icon: Icon, title, text }: { icon: React.ComponentType<{ className?: string }>; title: string; text: string }) => (
  <Card className="bg-card border-border/50 h-full">
    <CardContent className="p-6">
      <div className="flex items-center gap-3 mb-3">
        <Icon className="h-5 w-5 text-primary" />
        <h3 className="font-semibold text-foreground">{title}</h3>
      </div>
      <p className="text-sm text-muted-foreground">{text}</p>
    </CardContent>
  </Card>
);

const SecurityPage = () => {
  return (
    <div className="min-h-screen bg-background">
      <Header />

      <Section className="bg-gradient-subtle">
        <div className="text-center">
          <div className="mb-3 flex items-center justify-center gap-2">
            <Badge variant="outline" className="border-primary/30 text-primary">OPAQUE • JWE • HKDF</Badge>
            <Badge variant="outline" className="border-primary/30 text-primary">ZK Delivery</Badge>
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-foreground mb-4">Security Model</h1>
          <p className="text-lg text-muted-foreground max-w-3xl mx-auto">
            A practical, zero-knowledge design: passwords never reach the server; apps receive encryption keys the server cannot see; hashes bind out-of-band delivery without exposing secrets.
          </p>
          <div className="mt-6 flex items-center justify-center gap-3">
            <a href="#core">
              <Button variant="hero">Core Guarantees</Button>
            </a>
            <a href="#faq">
              <Button variant="outline">ELI5 FAQ</Button>
            </a>
          </div>
        </div>
      </Section>

      <Section id="core">
        <div className="mb-8 text-center">
          <h2 className="text-3xl font-bold">Core Guarantees</h2>
          <p className="text-muted-foreground mt-2">What DarkAuth guarantees by construction</p>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          <KeyPoint icon={ShieldCheck} title="Password Never Leaves Device" text="OPAQUE (RFC 9380) proves the server cannot learn the password or export_key from stored verifiers." />
          <KeyPoint icon={KeySquare} title="Data Root Key Remains Private" text="DRK is generated and held on the client. The server only stores a wrapped ciphertext tied to the user." />
          <KeyPoint icon={Lock} title="Fragment-Only Delivery" text="ZK-enabled apps get DRK via compact JWE in the URL fragment; fragments are not transmitted to servers." />
          <KeyPoint icon={Hash} title="Integrity Binding" text="Token responses include zk_drk_hash so apps can verify the fragment JWE before decryption." />
          <KeyPoint icon={EyeOff} title="No Sensitive Logging" text="zk_pub, DRK, JWE ciphertext, export_key, and derived keys are never logged." />
          <KeyPoint icon={Network} title="OIDC Compatibility" text="Standard discovery, authorization, and token endpoints; ZK is opt-in per client." />
          <KeyPoint icon={ShieldCheck} title="MFA via TOTP" text="Time-based OTP with backup codes, cohort and group enforcement, rate limits, and AMR/ACR signals in tokens." />
        </div>
      </Section>

      <Section>
        <div className="mb-8 text-center">
          <h2 className="text-3xl font-bold">Threat Model</h2>
          <p className="text-muted-foreground mt-2">What attackers can and cannot do</p>
        </div>
        <div className="grid lg:grid-cols-2 gap-6">
          <Card className="bg-card border-border/50">
            <CardContent className="p-6">
              <h3 className="text-lg font-semibold mb-2">Resisted</h3>
              <ul className="list-disc pl-6 space-y-2 text-sm text-muted-foreground">
                <li>Database theft: verifiers and wrapped DRK do not reveal passwords or DRK.</li>
                <li>Insider reads: no plaintext keys or DRK present on the server.</li>
                <li>Token endpoint key exfiltration: server never stores or returns DRK JWE.</li>
                <li>Redirect tampering: clients verify zk_drk_hash before using DRK.</li>
                <li>Weak ECDH keys: public keys are validated for P-256 format and length.</li>
              </ul>
            </CardContent>
          </Card>
          <Card className="bg-card border-border/50">
            <CardContent className="p-6">
              <h3 className="text-lg font-semibold mb-2">Out of Scope</h3>
              <ul className="list-disc pl-6 space-y-2 text-sm text-muted-foreground">
                <li>Compromised user devices executing malicious code.</li>
                <li>Apps mishandling decrypted DRK after receipt.</li>
                <li>Non-HTTPS transport or disabled TLS.</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </Section>

      <Section>
        <div className="mb-8 text-center">
          <h2 className="text-3xl font-bold">Cryptography</h2>
          <p className="text-muted-foreground mt-2">How the pieces fit together</p>
        </div>
        <div className="grid md:grid-cols-2 gap-6">
          <Card className="bg-card border-border/50">
            <CardContent className="p-6">
              <h3 className="text-lg font-semibold mb-2">OPAQUE</h3>
              <p className="text-sm text-muted-foreground">Interactive PAKE; server stores only an opaque record. Client receives export_key bound to the account.</p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border/50">
            <CardContent className="p-6">
              <h3 className="text-lg font-semibold mb-2">Key Schedule</h3>
              <p className="text-sm text-muted-foreground">MK and KW are derived from export_key via HKDF-SHA256 using stable salts. KW wraps the DRK; only the client derives these keys.</p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border/50">
            <CardContent className="p-6">
              <h3 className="text-lg font-semibold mb-2">DRK Lifecycle</h3>
              <p className="text-sm text-muted-foreground">First login creates a random DRK which is wrapped and persisted. Later logins unwrap the same DRK; password changes rewrap but do not rotate the DRK.</p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border/50">
            <CardContent className="p-6">
              <h3 className="text-lg font-semibold mb-2">ZK Delivery via JWE</h3>
              <p className="text-sm text-muted-foreground">ECDH-ES (P-256) + A256GCM compact JWE is placed in URL fragment only. Token includes zk_drk_hash for integrity.</p>
            </CardContent>
          </Card>
        </div>
      </Section>

      <Section>
        <div className="mb-8 text-center">
          <h2 className="text-3xl font-bold">Logging and Validation</h2>
          <p className="text-muted-foreground mt-2">Safe-by-default operational practices</p>
        </div>
        <div className="grid md:grid-cols-2 gap-6">
          <Card className="bg-card border-border/50">
            <CardContent className="p-6">
              <h3 className="text-lg font-semibold mb-2">Public Key Validation</h3>
              <p className="text-sm text-muted-foreground">zk_pub must be a base64url JWK with kty=EC, crv=P-256, and valid x/y coordinates. Private components are rejected.</p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border/50">
            <CardContent className="p-6">
              <h3 className="text-lg font-semibold mb-2">Prohibited Logging</h3>
              <p className="text-sm text-muted-foreground">No logging of zk_pub, export_key, MK/KW, DRK, JWE ciphertext, wrapped private keys, or token secrets.</p>
            </CardContent>
          </Card>
        </div>
      </Section>

      <Section id="faq" className="bg-gradient-subtle">
        <div className="mb-8 text-center">
          <h2 className="text-3xl font-bold">ELI5 FAQ</h2>
          <p className="text-muted-foreground mt-2">Plain explanations that stay technically accurate</p>
        </div>
        <div className="grid lg:grid-cols-2 gap-6">
          <Card className="bg-card border-border/50">
            <CardContent className="p-6">
              <h3 className="font-semibold mb-2">Can the server see my password?</h3>
              <p className="text-sm text-muted-foreground">No. Your device proves you know the password without sending it. The server stores a record that cannot reveal it.</p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border/50">
            <CardContent className="p-6">
              <h3 className="font-semibold mb-2">Who creates the encryption key apps use?</h3>
              <p className="text-sm text-muted-foreground">Your device. It generates a Data Root Key the first time, and keeps decrypting the same one each login.</p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border/50">
            <CardContent className="p-6">
              <h3 className="font-semibold mb-2">How do apps get the key?</h3>
              <p className="text-sm text-muted-foreground">They get an encrypted package in the URL fragment that only they can open. The server never sees that package.</p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border/50">
            <CardContent className="p-6">
              <h3 className="font-semibold mb-2">What if someone steals the database?</h3>
              <p className="text-sm text-muted-foreground">They get opaque verifiers and wrapped keys. Neither reveals passwords or the encryption key.</p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border/50">
            <CardContent className="p-6">
              <h3 className="font-semibold mb-2">Does changing my password break apps?</h3>
              <p className="text-sm text-muted-foreground">No. You rewrap the same DRK under a new device-derived key. Apps keep decrypting the same data.</p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border/50">
            <CardContent className="p-6">
              <h3 className="font-semibold mb-2">Is it standard OIDC?</h3>
              <p className="text-sm text-muted-foreground">Yes. Discovery and tokens are standard. The ZK delivery is an optional extension for clients that want it.</p>
            </CardContent>
          </Card>
        </div>
      </Section>

      <Section>
        <div className="mb-8 text-center">
          <h2 className="text-3xl font-bold">Verification Checklist</h2>
          <p className="text-muted-foreground mt-2">Operational checks to confirm secure configuration</p>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          <KeyPoint icon={ListChecks} title="PKCE S256 Required" text="Authorization requests use S256; token endpoint verifies." />
          <KeyPoint icon={BookCheck} title="ZK Client Registration" text="Clients opting in set zk_delivery=fragment-jwe and allowed algorithms." />
          <KeyPoint icon={TriangleAlert} title="No Sensitive Logs" text="Audit logging excludes zk_pub, keys, ciphertexts, and DRK artifacts." />
        </div>
      </Section>

      <Footer />
    </div>
  );
};

export default SecurityPage;
