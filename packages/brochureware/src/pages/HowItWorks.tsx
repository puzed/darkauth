import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Shield, Lock, KeyRound, Link as LinkIcon, ArrowRight, CheckCircle2 } from "lucide-react";

const Section = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <section className={`py-12 ${className}`}>
    <div className="container max-w-5xl">{children}</div>
  </section>
);

const Pill = ({ children }: { children: React.ReactNode }) => (
  <span className="inline-flex items-center rounded-full border border-border/40 bg-muted/30 px-3 py-1 text-xs text-muted-foreground">
    {children}
  </span>
);

const Step = ({
  step,
  icon: Icon,
  title,
  description,
  detail,
}: {
  step: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  detail: string;
}) => (
  <Card className="h-full bg-card border-border/50">
    <CardContent className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="bg-gradient-to-r from-primary to-accent text-white rounded-full w-8 h-8 flex items-center justify-center text-sm font-bold">
          {step}
        </div>
        <Icon className="h-6 w-6 text-primary" />
      </div>
      <h3 className="text-lg font-semibold text-foreground mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground mb-3">{description}</p>
      <div className="text-xs text-muted-foreground border-t border-border/30 pt-3">{detail}</div>
    </CardContent>
  </Card>
);

const HowItWorksPage = () => {
  return (
    <div className="min-h-screen bg-background">
      <Header />

      <Section>
        <div className="mb-2 text-xs text-muted-foreground"><a href="/" className="hover:text-foreground">Home</a> / How It Works</div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">How DarkAuth Works</h1>
        <p className="mt-2 text-sm text-muted-foreground max-w-3xl">
          A practical flow where passwords never reach the server and apps receive encryption keys the server cannot see.
        </p>
      </Section>

      <Section>
        <div className="grid md:grid-cols-2 gap-6 items-start">
          <Card className="bg-card border-border/50">
            <CardContent className="p-6">
              <div className="flex items-center gap-2 mb-3">
                <Badge variant="outline" className="border-primary/30 text-primary">ELI5</Badge>
              </div>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>Your device proves you know the password without telling it.</li>
                <li>Your device makes a secret key that only it can re-create.</li>
                <li>That key locks a bigger box key (DRK). The server keeps only the locked box.</li>
                <li>Apps get the box key in a sealed envelope only they can open.</li>
              </ul>
            </CardContent>
          </Card>
          <Card className="bg-card border-border/50">
            <CardContent className="p-6">
              <div className="flex items-center gap-2 mb-3">
                <Badge variant="outline" className="border-primary/30 text-primary">Technical TL;DR</Badge>
              </div>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>OPAQUE (RFC 9380) yields export_key client-side.</li>
                <li>HKDF derives MK and KW; KW wraps a 32-byte DRK.</li>
                <li>Server stores only wrapped_drk and never learns DRK/KW.</li>
                <li>For ZK clients, DRK → JWE (ECDH-ES+A256GCM) in URL fragment.</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </Section>

      <Section>
        <div className="grid md:grid-cols-3 gap-6">
          <Card className="bg-card border-border/50">
            <CardContent className="p-6">
              <div className="flex items-center gap-3 mb-3">
                <Shield className="h-5 w-5 text-primary" />
                <h3 className="font-semibold">OPAQUE Authentication</h3>
              </div>
              <p className="text-sm text-muted-foreground">
                The password never leaves the device. The server stores an opaque verifier and cannot recover the password.
              </p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border/50">
            <CardContent className="p-6">
              <div className="flex items-center gap-3 mb-3">
                <KeyRound className="h-5 w-5 text-primary" />
                <h3 className="font-semibold">Client-Derived Keys</h3>
              </div>
              <p className="text-sm text-muted-foreground">
                A device-only key derived from the OPAQUE export_key wraps a per-user Data Root Key used for app encryption.
              </p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border/50">
            <CardContent className="p-6">
              <div className="flex items-center gap-3 mb-3">
                <Lock className="h-5 w-5 text-primary" />
                <h3 className="font-semibold">Fragment JWE Delivery</h3>
              </div>
              <p className="text-sm text-muted-foreground">
                ZK-enabled apps receive the DRK via a compact JWE placed only in the URL fragment, never in server responses or storage.
              </p>
            </CardContent>
          </Card>
        </div>
      </Section>

      <Section className="bg-background">
        <div className="mb-6">
          <h2 className="text-2xl font-bold">Detailed Flow</h2>
          <p className="text-sm text-muted-foreground mt-1">From login to key delivery</p>
        </div>
        <div className="grid lg:grid-cols-2 xl:grid-cols-4 gap-6 mb-12">
          <Step
            step="1"
            icon={Shield}
            title="Authenticate with OPAQUE"
            description="User enters a password; the server never sees it."
            detail="Client and server complete OPAQUE (RFC 9380). The client receives export_key; the server binds the authenticated identity to the session."
          />
          <Step
            step="2"
            icon={KeyRound}
            title="Derive Keys Locally"
            description="Device derives MK and KW deterministically."
            detail="KW = HKDF-SHA256(export_key, ...) wraps the Data Root Key. Server only stores the wrapped DRK bound to the user."
          />
          <Step
            step="3"
            icon={Lock}
            title="Unwrap or Create DRK"
            description="First login creates DRK; later logins unwrap it."
            detail="Client fetches wrapped_drk, unwraps with KW, or generates DRK if missing and uploads the wrapped form."
          />
          <Step
            step="4"
            icon={LinkIcon}
            title="Deliver DRK to App"
            description="If the app opts in, send a fragment JWE."
            detail="Auth UI encrypts DRK to the app's ephemeral P-256 key with ECDH-ES + A256GCM, returns code JSON, then navigates with #drk_jwe=..."
          />
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          <Card className="bg-card border-border/50">
            <CardContent className="p-6">
              <h3 className="text-lg font-semibold mb-2">What the Authorization Server Stores</h3>
              <ul className="list-disc pl-6 space-y-2 text-sm text-muted-foreground">
                <li>Opaque verifier for OPAQUE, not the password</li>
                <li>Wrapped DRK ciphertext with AAD = sub</li>
                <li>Pending authorization records</li>
                <li>Authorization codes with zk flags and drk_hash only</li>
                <li>Discovery metadata and public JWKS</li>
              </ul>
            </CardContent>
          </Card>
          <Card className="bg-card border-border/50">
            <CardContent className="p-6">
              <h3 className="text-lg font-semibold mb-2">What Never Leaves the Device</h3>
              <ul className="list-disc pl-6 space-y-2 text-sm text-muted-foreground">
                <li>Plaintext password</li>
                <li>Derived keys MK and KW</li>
                <li>Plaintext DRK</li>
                <li>DRK JWE content in server logs or responses</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </Section>

      <Section id="security" className="bg-gradient-subtle">
        <div className="mb-4">
          <h2 className="text-2xl font-bold">Security Highlights</h2>
          <p className="text-sm text-muted-foreground mt-1">Why the server cannot decrypt user data</p>
        </div>
        <div className="grid md:grid-cols-2 gap-6">
          <Card className="bg-card border-border/50">
            <CardContent className="p-6">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="h-5 w-5 text-primary" />
                <h3 className="font-semibold">OPAQUE Eliminates Password Exposure</h3>
              </div>
              <p className="text-sm text-muted-foreground">
                Even with full database access, passwords are not recoverable. The verifier does not allow guessing without the interactive protocol.
              </p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border/50">
            <CardContent className="p-6">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="h-5 w-5 text-primary" />
                <h3 className="font-semibold">DRK Is Wrapped Under Device-Derived Keys</h3>
              </div>
              <p className="text-sm text-muted-foreground">
                The server stores only a ciphertext tied to the user identity. Without KW derived from the user's export_key, the DRK is useless to the server.
              </p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border/50">
            <CardContent className="p-6">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="h-5 w-5 text-primary" />
                <h3 className="font-semibold">Fragment-Only DRK Delivery</h3>
              </div>
              <p className="text-sm text-muted-foreground">
                ZK-enabled apps receive the DRK via a JWE in the URL fragment. Fragments are not sent to servers during HTTP requests.
              </p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border/50">
            <CardContent className="p-6">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="h-5 w-5 text-primary" />
                <h3 className="font-semibold">Integrity Binding via drk_hash</h3>
              </div>
              <p className="text-sm text-muted-foreground">
                The token response includes zk_drk_hash. Clients verify it equals the SHA-256 of the fragment JWE before using the DRK.
              </p>
            </CardContent>
          </Card>
        </div>
      </Section>

      <Section>
        <div className="grid lg:grid-cols-2 gap-8 items-start">
          <div>
            <h3 className="text-2xl font-bold mb-2">Relying Party App Flow</h3>
            <ol className="list-decimal pl-6 space-y-2 text-sm text-muted-foreground">
              <li>Generate an ephemeral P-256 keypair; send zk_pub in the authorization request with PKCE (S256).</li>
              <li>After the user returns, read #drk_jwe from the URL fragment in the browser.</li>
              <li>Exchange the code at /token and read zk_drk_hash.</li>
              <li>Verify base64url(sha256(drk_jwe)) equals zk_drk_hash.</li>
              <li>Decrypt the compact JWE using the ephemeral private key to obtain DRK in memory.</li>
              <li>Derive record keys from DRK if needed and encrypt application data client-side.</li>
            </ol>
            <div className="mt-4 flex gap-3">
              <Badge variant="outline" className="border-primary/30 text-primary">ECDH-ES</Badge>
              <Badge variant="outline" className="border-primary/30 text-primary">A256GCM</Badge>
              <Badge variant="outline" className="border-primary/30 text-primary">PKCE S256</Badge>
            </div>
          </div>
          <Card className="bg-card border-border/50">
            <CardContent className="p-6">
              <h3 className="text-lg font-semibold mb-3">Why Apps Can Encrypt Without Server Knowledge</h3>
              <p className="text-sm text-muted-foreground mb-3">
                Apps operate with a DRK obtained entirely on the client side. The authorization server cannot derive the keys or see the plaintext DRK.
              </p>
              <ul className="list-disc pl-6 space-y-2 text-sm text-muted-foreground">
                <li>OPAQUE keeps passwords client-only</li>
                <li>DRK is never transmitted in plaintext</li>
                <li>DRK JWE exists only in the fragment and memory</li>
                <li>Server stores only hashes and wrapped artifacts</li>
              </ul>
              <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                <ArrowRight className="h-4 w-4 text-primary" />
                <span>Result: encryption with zero server knowledge</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </Section>

      <Section>
        <div className="text-sm text-muted-foreground">
          See more in <a href="/security" className="text-primary hover:underline">Security</a> and the OIDC extension spec.
        </div>
      </Section>

      <Section>
        <div className="grid lg:grid-cols-2 gap-6 items-start">
          <Card className="bg-card border-border/50">
            <CardContent className="p-6">
              <h3 className="text-lg font-semibold mb-2">Password Change & Key Stability</h3>
              <p className="text-sm text-muted-foreground mb-3">Changing your password while knowing the current one does not change the DRK delivered to apps.</p>
              <ol className="list-decimal pl-6 space-y-2 text-sm text-muted-foreground">
                <li>Verify current password via OPAQUE verify endpoints.</li>
                <li>Complete OPAQUE re-registration with the new password.</li>
                <li>Derive a new KW from the new export_key on the device.</li>
                <li>Rewrap the same DRK under the new KW and upload the new wrapped ciphertext.</li>
                <li>Result: DRK is unchanged; only the wrap changes. ZK-enabled apps still receive the same DRK each login.</li>
              </ol>
            </CardContent>
          </Card>
          <Card className="bg-card border-border/50">
            <CardContent className="p-6">
              <h3 className="text-lg font-semibold mb-2">What Apps Observe</h3>
              <ul className="list-disc pl-6 space-y-2 text-sm text-muted-foreground">
                <li>DRK value remains constant across password changes.</li>
                <li>Fragment JWE is fresh per authorization; its hash changes, but decrypts to the same DRK.</li>
                <li>Encrypted data remains readable; no re-encryption required.</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </Section>

      <Footer />
    </div>
  );
};

export default HowItWorksPage;
