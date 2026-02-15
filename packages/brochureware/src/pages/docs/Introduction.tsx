import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, Lock, Server, Users, Workflow } from "lucide-react";

const IntroductionPage = () => {
  return (
    <div className="space-y-6">
      <Card className="border-border/50">
        <CardContent className="p-6">
          <Badge variant="outline" className="mb-3 border-primary/30 text-primary">
            Introduction
          </Badge>
          <h2 className="text-2xl font-bold text-foreground">What DarkAuth Is</h2>
          <p className="mt-3 text-base leading-6 text-muted-foreground">
            DarkAuth is a self-hosted authentication server with OIDC compatibility and a
            zero-knowledge security model. It uses OPAQUE for password authentication so the
            server never learns user passwords, and it supports client-side key flows for
            applications that need encrypted data without giving the server decryption capability.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="border-border/50">
          <CardContent className="p-5">
            <div className="mb-3 flex items-center gap-2 text-foreground">
              <ShieldCheck className="h-5 w-5 text-primary" />
              <h3 className="font-semibold">Security First</h3>
            </div>
            <ul className="list-disc space-y-2 pl-5 text-base text-muted-foreground">
              <li>OPAQUE-based password auth</li>
              <li>No plaintext password handling on the server</li>
              <li>Support for encrypted key material workflows</li>
            </ul>
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardContent className="p-5">
            <div className="mb-3 flex items-center gap-2 text-foreground">
              <Lock className="h-5 w-5 text-primary" />
              <h3 className="font-semibold">OIDC Compatible</h3>
            </div>
            <ul className="list-disc space-y-2 pl-5 text-base text-muted-foreground">
              <li>Discovery, authorize and token endpoints</li>
              <li>Works with public and confidential clients</li>
              <li>PKCE support for browser-based apps</li>
            </ul>
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardContent className="p-5">
            <div className="mb-3 flex items-center gap-2 text-foreground">
              <Users className="h-5 w-5 text-primary" />
              <h3 className="font-semibold">User Directory APIs</h3>
            </div>
            <ul className="list-disc space-y-2 pl-5 text-base text-muted-foreground">
              <li>Search users from `/api/users`</li>
              <li>Fetch single user records from `/api/users/:sub`</li>
              <li>Permission-aware responses by auth method</li>
            </ul>
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardContent className="p-5">
            <div className="mb-3 flex items-center gap-2 text-foreground">
              <Workflow className="h-5 w-5 text-primary" />
              <h3 className="font-semibold">Practical Architecture</h3>
            </div>
            <ul className="list-disc space-y-2 pl-5 text-base text-muted-foreground">
              <li>Separate user and admin APIs</li>
              <li>Role and permission model for access control</li>
              <li>Designed for self-hosted deployment and customization</li>
            </ul>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/50">
        <CardContent className="p-6">
          <div className="mb-3 flex items-center gap-2 text-foreground">
            <Server className="h-5 w-5 text-primary" />
            <h3 className="font-semibold">Start Here</h3>
          </div>
          <p className="text-base leading-6 text-muted-foreground">
            If you are integrating a frontend or backend with DarkAuth user directory APIs, continue
            to <strong>Developers → Client APIs → Authentication</strong>. That page shows the
            two supported access patterns with working request examples.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default IntroductionPage;
