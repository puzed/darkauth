import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import DocsCallout from "@/pages/docs/components/DocsCallout";
import { CheckCircle, Lock, ShieldAlert, ShieldCheck } from "lucide-react";

const setupFlow = `POST /api/otp/setup/init\nAuthorization: Bearer <session_token>\n\n{\"secret_name\":\"totp\"}`;

const setupVerify = `POST /api/otp/setup/verify\nAuthorization: Bearer <session_token>\n\n{\"code\":\"000000\",\"request_id\":\"uuid\"}`;

const loginReauth = `POST /api/otp/reauth\nAuthorization: Bearer <access_token>\n\n{\"code\":\"000000\",\"request_id\":\"uuid\"}`;

const stepUpCheck = `POST /api/otp/verify\nAuthorization: Bearer <access_token>\n\n{\"code\":\"000000\"}`;

const OtpPolicyPage = () => {
  return (
    <div className="space-y-8">
      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <Badge variant="outline" className="mb-2 border-primary/30 text-primary">
            Guide: OTP & Policy
          </Badge>
          <CardTitle className="text-2xl">Step-up authentication and sensitive operations</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-base text-muted-foreground">
            OTP in DarkAuth is implemented as an explicit policy layer. It can be enabled for users, users
            in groups, or role-based scenarios where step-up authentication is required.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="border-border/60 shadow-sm">
          <CardContent className="p-6 space-y-3">
            <div className="mb-1 flex items-center gap-2 text-foreground">
              <ShieldCheck className="h-5 w-5 text-primary" />
              <h3 className="font-semibold">Setup for end users</h3>
            </div>
            <ul className="list-disc space-y-2 pl-5 text-base text-muted-foreground">
              <li>Call `/api/otp/setup/init` to get provisioning material.</li>
              <li>Return code from authenticator app to `/api/otp/setup/verify`.</li>
              <li>Persist key material in secure storage for future verification.</li>
            </ul>
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-sm">
          <CardContent className="p-6 space-y-3">
            <div className="mb-1 flex items-center gap-2 text-foreground">
              <ShieldAlert className="h-5 w-5 text-primary" />
              <h3 className="font-semibold">Step-up and reset</h3>
            </div>
            <ul className="list-disc space-y-2 pl-5 text-base text-muted-foreground">
              <li>When required, `otpRequired` appears in session state.</li>
              <li>Use `/api/otp/reauth` before protected actions.</li>
              <li>Admins can disable/reset OTP from user and admin surfaces.</li>
            </ul>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">User flow examples</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <p className="font-semibold text-foreground">Enable OTP</p>
            <pre className="overflow-x-auto rounded-md border border-border/60 bg-muted/50 p-4 text-xs">
              <code>{setupFlow}</code>
            </pre>
          </div>
          <div>
            <p className="font-semibold text-foreground">Verify first device code</p>
            <pre className="overflow-x-auto rounded-md border border-border/60 bg-muted/50 p-4 text-xs">
              <code>{setupVerify}</code>
            </pre>
          </div>
        </CardContent>
      </Card>

      <DocsCallout title="Protected actions and verification" icon={Lock}>
        <p className="text-base">
          If your policy requires OTP per operation, validate before state-changing actions. The `/api/otp`
          APIs support both status checks and one-shot verification.
        </p>
        <pre className="mt-3 overflow-x-auto rounded-md border border-primary/40 bg-white/5 p-3 text-xs">
          <code>{loginReauth}</code>
        </pre>
      </DocsCallout>

      <Card className="border-border/60 shadow-sm">
        <CardContent className="p-6">
          <h3 className="font-semibold text-lg text-foreground">Verification endpoint reference</h3>
          <pre className="mt-3 overflow-x-auto rounded-md border border-border/60 bg-muted/40 p-4 text-xs">
            <code>{stepUpCheck}</code>
          </pre>
          <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle className="h-4 w-4 text-primary" />
            Always pair code checks with CSRF/session-aware routing on your client flow.
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default OtpPolicyPage;
