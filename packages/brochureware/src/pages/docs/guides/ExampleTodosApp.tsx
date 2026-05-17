import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import DocsCallout from "@/pages/docs/components/DocsCallout";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  HelpCircle,
  KeyRound,
  LockKeyhole,
  RefreshCcw,
  Route,
  Server,
  ShieldCheck,
} from "lucide-react";

const darkAuthAdminSetup = `Client ID: example-todos
Client type: public
PKCE: required
Redirect URIs:
  http://localhost:5173/callback
  https://todos.example.com/callback
Post logout redirect URIs:
  http://localhost:5173
  https://todos.example.com
Grant types:
  authorization_code
  refresh_token
Response types:
  code
Scopes:
  openid
  profile
  email
Required user permission:
  example-todos:login`;

const envSnippet = `VITE_DARKAUTH_ISSUER=https://auth.example.com
VITE_DARKAUTH_CLIENT_ID=example-todos
TODOS_OIDC_ISSUER=https://auth.example.com
TODOS_OIDC_AUDIENCE=example-todos
TODOS_OIDC_JWKS_URL=https://auth.example.com/api/.well-known/jwks.json`;

const sdkConfigSnippet = `import { setConfig } from "@darkauth/client";

let configured = false;

export function ensureDarkAuthConfig() {
  if (configured) return;

  const issuer = import.meta.env.VITE_DARKAUTH_ISSUER;
  const clientId = import.meta.env.VITE_DARKAUTH_CLIENT_ID;
  const redirectUri = \`\${window.location.origin}/callback\`;

  setConfig({
    issuer,
    clientId,
    redirectUri,
    scope: \`openid profile email \${TODOS_LOGIN_PERMISSION}\`,
    zk: false,
  });

  configured = true;
}`;

const sessionSnippet = `import {
  getCurrentUser,
  getStoredSession,
  parseJwt,
  refreshSession,
  type AuthSession,
  type JwtClaims,
} from "@darkauth/client";
import { ensureDarkAuthConfig } from "./darkauth-config";

export const TODOS_LOGIN_PERMISSION = "example-todos:login";

export type TodosClaims = JwtClaims & {
  email?: string;
  email_verified?: boolean;
  permissions?: string[];
};

export async function resolveSession(forceRefresh = false) {
  ensureDarkAuthConfig();

  let session: AuthSession | null = null;
  if (!forceRefresh) session = getStoredSession();
  if (!session) session = await refreshSession();
  if (!session?.idToken) return null;

  const claims = (getCurrentUser() ?? parseJwt(session.idToken)) as TodosClaims | null;
  if (!claims) return null;
  if (!claims.permissions?.includes(TODOS_LOGIN_PERMISSION)) return null;

  return { accessToken: session.accessToken, idToken: session.idToken, claims };
}`;

const callbackSnippet = `import { handleCallback } from "@darkauth/client";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ensureDarkAuthConfig } from "./darkauth-config";
import { resolveSession } from "./session";

export function CallbackPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function completeLogin() {
      try {
        ensureDarkAuthConfig();
        const session = await handleCallback();
        if (!session?.idToken || !session.accessToken) throw new Error("DarkAuth did not return a session.");
        const resolved = await resolveSession();
        if (!resolved) throw new Error("Your account cannot access Example Todos.");
        navigate("/", { replace: true });
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Sign in failed.");
      }
    }

    void completeLogin();
  }, [navigate]);

  if (error) return <main>{error}</main>;
  return <main>Completing sign in</main>;
}`;

const apiClientSnippet = `import { refreshSession } from "@darkauth/client";
import { resolveSession } from "./session";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function todosRequest<T>(path: string, init: RequestInit = {}) {
  return requestWithAuth<T>(path, init, false);
}

async function requestWithAuth<T>(path: string, init: RequestInit, retried: boolean) {
  const session = await resolveSession();
  const headers = new Headers(init.headers);
  if (session?.accessToken) headers.set("authorization", \`Bearer \${session.accessToken}\`);

  let response = await fetch(\`/api\${path}\`, { ...init, headers });
  if (response.status === 401 && !retried) {
    await refreshSession();
    const refreshed = await resolveSession(true);
    if (refreshed?.accessToken) headers.set("authorization", \`Bearer \${refreshed.accessToken}\`);
    response = await fetch(\`/api\${path}\`, { ...init, headers });
  }

  if (!response.ok) throw new ApiError(response.status, await response.text());
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}`;

const backendSnippet = `import { createRemoteJWKSet, jwtVerify } from "jose";

const TODOS_LOGIN_PERMISSION = "example-todos:login";

const jwks = createRemoteJWKSet(new URL(process.env.TODOS_OIDC_JWKS_URL!));

export async function requireTodosUser(authorizationHeader: string | undefined) {
  const match = authorizationHeader?.match(/^Bearer\\s+(.+)$/i);
  if (!match?.[1]) throw unauthorized("Bearer token required");

  const { payload } = await jwtVerify(match[1], jwks, {
    issuer: process.env.TODOS_OIDC_ISSUER,
    audience: process.env.TODOS_OIDC_AUDIENCE,
  });

  const subject = payload.sub;
  const email = typeof payload.email === "string" ? payload.email : undefined;
  const permissions = Array.isArray(payload.permissions)
    ? payload.permissions.filter((item): item is string => typeof item === "string")
    : [];

  if (!subject || !email) throw unauthorized("OIDC token is missing required claims");
  if (!permissions.includes(TODOS_LOGIN_PERMISSION)) {
    throw forbidden(\`Missing required permission: \${TODOS_LOGIN_PERMISSION}\`);
  }

  return upsertUserFromOidcClaims({
    issuer: process.env.TODOS_OIDC_ISSUER!,
    subject,
    email,
    name: typeof payload.name === "string" ? payload.name : email,
    avatarUrl: typeof payload.picture === "string" ? payload.picture : null,
  });
}`;

const routeSnippet = `app.get("/api/todos", async (request, response) => {
  const user = await requireTodosUser(request.headers.authorization);
  const todos = await listTodosForUser(user.id);
  response.json({ items: todos });
});

app.post("/api/todos", async (request, response) => {
  const user = await requireTodosUser(request.headers.authorization);
  const todo = await createTodoForUser(user.id, request.body);
  response.status(201).json(todo);
});`;

const cspSnippet = `Content-Security-Policy:
  default-src 'self';
  connect-src 'self' https://auth.example.com https://todos.example.com;
  img-src 'self' data: blob:;
  script-src 'self';
  style-src 'self' 'unsafe-inline';`;

const failureModes = [
  {
    symptom: "Token exchange failed",
    cause: "Redirect URI, client id, PKCE verifier, or grant type does not match the DarkAuth client.",
  },
  {
    symptom: "Invalid audience",
    cause: "The API is verifying the wrong audience. For this app, use aud=example-todos.",
  },
  {
    symptom: "Missing email",
    cause: "The API requires email, but the token did not include one. Add email scope and confirm DarkAuth user data.",
  },
  {
    symptom: "403 after successful login",
    cause: "The user signed in correctly but does not have example-todos:login.",
  },
  {
    symptom: "Refresh works locally but not in production",
    cause: "The production origin or callback URI is not registered, or browser storage is being cleared by the environment.",
  },
];

const faq = [
  {
    question: "Should Example Todos use the ID token or access token for its API?",
    answer:
      "Use the DarkAuth access token as the API bearer token. Keep the ID token for local identity claims and sign-in state.",
  },
  {
    question: "Do I have to use zero-knowledge delivery?",
    answer:
      "No. Set zk:false when the app only needs standard OIDC login. Use ZK delivery when the app is also using DarkAuth-managed encrypted data or derived root keys.",
  },
  {
    question: "Where should I store app user records?",
    answer:
      "Store local users in the app database and link them by DarkAuth issuer plus subject. Treat email as profile data that can change.",
  },
  {
    question: "Can API keys bypass example-todos:login?",
    answer:
      "Only if you intentionally create a separate API-key credential model. Browser OIDC access should require example-todos:login on every protected endpoint.",
  },
  {
    question: "What should logout do?",
    answer:
      "Call logout() from @darkauth/client, clear app state and caches, and return to the login page. If your deployment adds an end-session endpoint, use it as an enhancement rather than relying on it for local cleanup.",
  },
];

const ExampleTodosAppPage = () => {
  return (
    <div className="space-y-8">
      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <Badge variant="outline" className="mb-2 border-primary/30 text-primary">
            Guide: Example Todos
          </Badge>
          <CardTitle className="text-2xl md:text-3xl">Build a DarkAuth client app</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-base text-muted-foreground">
            This guide walks through a production-style DarkAuth integration for a fictional Example
            Todos app. The browser uses the authorization code flow with PKCE through
            <code> @darkauth/client</code>, the API verifies the access token with DarkAuth JWKS, and
            both sides require a user permission before the app loads.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="border-border/60 shadow-sm">
          <CardContent className="p-6">
            <div className="mb-3 flex items-center gap-2 text-foreground">
              <ClipboardList className="h-5 w-5 text-primary" />
              <h3 className="font-semibold">The app</h3>
            </div>
            <p className="text-sm leading-6 text-muted-foreground">
              Example Todos has a React SPA, a JSON API, and user-owned todo records. It does not
              store passwords or run its own login pages.
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-sm">
          <CardContent className="p-6">
            <div className="mb-3 flex items-center gap-2 text-foreground">
              <KeyRound className="h-5 w-5 text-primary" />
              <h3 className="font-semibold">The token</h3>
            </div>
            <p className="text-sm leading-6 text-muted-foreground">
              The SPA sends the current DarkAuth access token as <code>Authorization: Bearer</code>.
              The API treats that token as the session credential.
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-sm">
          <CardContent className="p-6">
            <div className="mb-3 flex items-center gap-2 text-foreground">
              <ShieldCheck className="h-5 w-5 text-primary" />
              <h3 className="font-semibold">The gate</h3>
            </div>
            <p className="text-sm leading-6 text-muted-foreground">
              Users must have <code>example-todos:login</code> in their DarkAuth permissions claim
              before Example Todos creates or loads their local account.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">1) Configure the DarkAuth client</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-base text-muted-foreground">
            Create a public client for the app in DarkAuth admin. For a browser app, the client must
            use authorization code with PKCE and must not require a client secret.
          </p>
          <pre className="overflow-x-auto rounded-md border border-border/60 bg-muted/50 p-4 text-xs">
            <code>{darkAuthAdminSetup}</code>
          </pre>
          <p className="mt-4 text-sm text-muted-foreground">
            DarkAuth access tokens use the client id as the audience for this style of browser app, so
            the Example Todos API verifies <code>aud=example-todos</code>. Add the
            <code> example-todos:login</code> permission to the groups or users allowed into the app.
          </p>
        </CardContent>
      </Card>

      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">2) Add app environment</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="overflow-x-auto rounded-md border border-border/60 bg-muted/50 p-4 text-xs">
            <code>{envSnippet}</code>
          </pre>
          <p className="mt-4 text-sm text-muted-foreground">
            The browser only needs issuer and client id. The server needs issuer, audience, and JWKS
            URL. Use the advertised <code>/api/.well-known/jwks.json</code> endpoint for direct JWT
            verification.
          </p>
        </CardContent>
      </Card>

      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">3) Configure @darkauth/client once</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-base text-muted-foreground">
            Put SDK configuration behind a small helper and call it from your auth provider, login
            button, and callback page. Set <code>zk: false</code> for a standard OIDC app that does not
            need DarkAuth encrypted-data delivery.
          </p>
          <pre className="overflow-x-auto rounded-md border border-border/60 bg-muted/50 p-4 text-xs">
            <code>{sdkConfigSnippet}</code>
          </pre>
        </CardContent>
      </Card>

      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">4) Resolve a usable browser session</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-base text-muted-foreground">
            The app should normalize the DarkAuth session into one local concept: an access token,
            an ID token, and claims that satisfy the app permission. If the current token is missing
            or expired, try the refresh token before sending the user back to login.
          </p>
          <pre className="overflow-x-auto rounded-md border border-border/60 bg-muted/50 p-4 text-xs">
            <code>{sessionSnippet}</code>
          </pre>
        </CardContent>
      </Card>

      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">5) Complete the callback</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-base text-muted-foreground">
            The callback page exchanges the authorization code, stores the session through the SDK, then
            immediately resolves the session and permission claim. Failing early gives the user a clear
            access message before the app shell renders.
          </p>
          <pre className="overflow-x-auto rounded-md border border-border/60 bg-muted/50 p-4 text-xs">
            <code>{callbackSnippet}</code>
          </pre>
        </CardContent>
      </Card>

      <DocsCallout title="Why check permission in the browser and API?" icon={LockKeyhole}>
        <p className="text-base">
          The browser check is user experience: it prevents a half-loaded app for users who signed in
          successfully but are not allowed into Example Todos. The API check is enforcement: every
          protected endpoint must reject a valid DarkAuth token that lacks the app permission.
        </p>
      </DocsCallout>

      <DocsCallout title="Use the app permission as an application boundary" icon={ShieldCheck}>
        <p className="text-base">
          The permission name should belong to the app, not to DarkAuth internals. Example Todos uses
          <code> example-todos:login</code> because that claim answers one question: may this identity
          enter this app? Keep finer-grained todo permissions inside the Example Todos database unless
          you explicitly want DarkAuth to manage app-level authorization too.
        </p>
      </DocsCallout>

      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">6) Attach and refresh bearer tokens</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-base text-muted-foreground">
            Centralize API requests so JSON calls, downloads, uploads, and fetch-based event streams all
            use the same current-token path. On a 401, refresh once and retry once.
          </p>
          <pre className="overflow-x-auto rounded-md border border-border/60 bg-muted/50 p-4 text-xs">
            <code>{apiClientSnippet}</code>
          </pre>
        </CardContent>
      </Card>

      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Token and storage notes</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="list-disc space-y-2 pl-5 text-base text-muted-foreground">
            <li>
              <code>@darkauth/client</code> stores the access token, ID token, and refresh token for
              the browser session lifecycle. Do not duplicate long-lived token storage under
              app-specific keys.
            </li>
            <li>
              Call <code>refreshSession()</code> before important requests when no valid stored token is
              present, and after a 401 before forcing a full login.
            </li>
            <li>
              Keep bearer tokens out of URLs. Use <code>fetch</code> for event streams that need
              authorization headers instead of native <code>EventSource</code>.
            </li>
            <li>
              Clear app caches, user profile state, and todo stores on logout or auth expiry.
            </li>
          </ul>
        </CardContent>
      </Card>

      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">7) Verify tokens in the Example Todos API</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-base text-muted-foreground">
            The API should verify signature, issuer, audience, expiry, required identity claims, and the
            application permission before it upserts or loads the local user.
          </p>
          <pre className="overflow-x-auto rounded-md border border-border/60 bg-muted/50 p-4 text-xs">
            <code>{backendSnippet}</code>
          </pre>
        </CardContent>
      </Card>

      <DocsCallout title="Do not create users before authorization succeeds" icon={AlertTriangle}>
        <p className="text-base">
          Verify issuer, audience, signature, expiry, required claims, and
          <code> example-todos:login</code> before upserting the local user. Otherwise an unauthorized
          DarkAuth identity can leave records in the Example Todos database even though the request is
          later denied.
        </p>
      </DocsCallout>

      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">8) Protect every app endpoint</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-base text-muted-foreground">
            Route handlers should call the same auth helper before reading or writing user data. API keys
            or service-to-service tokens can be a separate credential family, but browser access should
            be DarkAuth OIDC.
          </p>
          <pre className="overflow-x-auto rounded-md border border-border/60 bg-muted/50 p-4 text-xs">
            <code>{routeSnippet}</code>
          </pre>
        </CardContent>
      </Card>

      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Browser security headers</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-base text-muted-foreground">
            If the SPA calls DarkAuth directly, production CSP and CORS configuration must allow the
            DarkAuth issuer. Keep the allowed origins narrow and environment-specific.
          </p>
          <pre className="overflow-x-auto rounded-md border border-border/60 bg-muted/50 p-4 text-xs">
            <code>{cspSnippet}</code>
          </pre>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-border/60 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Route className="h-5 w-5 text-primary" />
              Routes to include
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-2 pl-5 text-base text-muted-foreground">
              <li>
                <code>/login</code> starts <code>initiateLogin()</code>.
              </li>
              <li>
                <code>/callback</code> calls <code>handleCallback()</code>.
              </li>
              <li>
                Protected app routes wait for <code>resolveSession()</code>.
              </li>
              <li>
                Logout calls <code>logout()</code> from <code>@darkauth/client</code> and clears local
                app state.
              </li>
            </ul>
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Server className="h-5 w-5 text-primary" />
              Backend checks
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-2 pl-5 text-base text-muted-foreground">
              <li>Reject missing bearer headers with 401.</li>
              <li>Reject bad issuer, audience, signature, or expiry with 401.</li>
              <li>
                Reject missing <code>example-todos:login</code> with 403.
              </li>
              <li>Upsert users by DarkAuth issuer and subject, not by email alone.</li>
            </ul>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <AlertTriangle className="h-5 w-5 text-primary" />
            Common failure modes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead className="border-b border-border/60 text-foreground">
                <tr>
                  <th className="py-2 pr-4 font-semibold">Symptom</th>
                  <th className="py-2 font-semibold">Likely cause</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60 text-muted-foreground">
                {failureModes.map((item) => (
                  <tr key={item.symptom}>
                    <td className="py-3 pr-4 align-top">
                      <code>{item.symptom}</code>
                    </td>
                    <td className="py-3 align-top">{item.cause}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <RefreshCcw className="h-5 w-5 text-primary" />
            Test checklist
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="list-disc space-y-2 pl-5 text-base text-muted-foreground">
            <li>A user with no session is redirected to login.</li>
            <li>A real DarkAuth callback stores an ID token and refresh token.</li>
            <li>The first API call succeeds and creates the local Example Todos user.</li>
            <li>An expired token triggers one refresh and one retry.</li>
            <li>A valid token without <code>example-todos:login</code> returns 403.</li>
            <li>Wrong issuer, wrong audience, missing email, and missing subject return 401.</li>
          </ul>
          <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-primary" />
            Run these checks against a real database and a local JWKS test server before shipping.
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <HelpCircle className="h-5 w-5 text-primary" />
            FAQ
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-5">
            {faq.map((item) => (
              <div key={item.question}>
                <h3 className="font-semibold text-foreground">{item.question}</h3>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{item.answer}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ExampleTodosAppPage;
