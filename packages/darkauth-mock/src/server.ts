import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { SignJWT, jwtVerify } from "jose";
import { type MockConfig, resolveMembership, type SigningKey } from "./config.ts";

type LocalOrganization = {
  organizationId: string;
  slug: string;
  name: string;
  status: "active";
  roles: string[];
  permissions: string[];
};

type LocalProfile = {
  sub: string;
  email: string;
  name: string;
  picture?: string;
  organizations: LocalOrganization[];
};

type AuthCode = {
  profile: LocalProfile;
  organizationId: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  expiresAt: number;
};

type RefreshSession = {
  profile: LocalProfile;
  organizationId: string;
  clientId: string;
  expiresAt: number;
};

const CODE_TTL_MS = 5 * 60 * 1000;
const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const TOKEN_TTL_SECONDS = 60 * 60;

export function createDarkAuthMockServer(config: MockConfig, signingKey: SigningKey) {
  const codes = new Map<string, AuthCode>();
  const refreshSessions = new Map<string, RefreshSession>();

  return createServer(async (request, response) => {
    try {
      applyCors(config, request, response);
      if (request.method === "OPTIONS") {
        response.writeHead(204);
        response.end();
        return;
      }

      const url = new URL(request.url || "/", config.issuer);
      if (request.method === "GET" && url.pathname === "/") return sendHtml(response, landingPage(config));
      if (request.method === "GET" && url.pathname === "/.well-known/openid-configuration") return sendJson(response, discovery(config));
      if (request.method === "GET" && url.pathname === "/.well-known/jwks.json") return sendJson(response, { keys: [signingKey.publicJwk] });
      if (request.method === "GET" && url.pathname === "/authorize") return sendHtml(response, authorizePage(config, url));
      if (request.method === "POST" && url.pathname === "/authorize/continue") {
        const body = await readForm(request);
        const authUrl = continueAuthorize(config, codes, body);
        response.writeHead(303, { location: authUrl.toString() });
        response.end();
        return;
      }
      if (request.method === "POST" && url.pathname === "/token") {
        const body = await readForm(request);
        return sendJson(response, await tokenResponse(config, signingKey, codes, refreshSessions, body));
      }
      if (request.method === "GET" && url.pathname === "/api/user/organizations") {
        const session = await verifyBearer(config, signingKey, request);
        return sendJson(response, { organizations: session.profile.organizations });
      }
      if (request.method === "GET" && url.pathname === "/api/user/session") {
        const session = await optionalBearer(config, signingKey, request);
        if (!session) return sendJson(response, { authenticated: false });
        const org = findOrganization(session.profile, session.organizationId);
        return sendJson(response, {
          authenticated: true,
          sub: session.profile.sub,
          email: session.profile.email,
          name: session.profile.name,
          organizationId: org.organizationId,
          organizationSlug: org.slug,
        });
      }
      if (request.method === "POST" && url.pathname === "/api/token/organization") {
        const session = await verifyBearer(config, signingKey, request);
        const body = await readJson(request);
        const organizationId = stringValue(body.organization_id);
        const clientId = stringValue(body.client_id) || config.clients[0] || "";
        if (!organizationId) return sendJson(response, { error: "invalid_request", message: "organization_id is required" }, 400);
        const tokenSet = await issueTokenSet(config, signingKey, refreshSessions, session.profile, organizationId, clientId);
        return sendJson(response, tokenSet);
      }
      if (request.method === "GET" && url.pathname === "/api/logout") {
        const redirect = url.searchParams.get("post_logout_redirect_uri");
        if (redirect) {
          const next = new URL(redirect);
          const state = url.searchParams.get("state");
          if (state) next.searchParams.set("state", state);
          response.writeHead(303, { location: next.toString() });
          response.end();
          return;
        }
        return sendHtml(response, landingPage(config, "Signed out locally. The browser session has been cleared."));
      }

      sendJson(response, { error: "not_found", message: "Not found" }, 404);
    } catch (error) {
      const message = error instanceof Error ? error.message : "DarkAuth Mock request failed";
      sendJson(response, { error: "invalid_request", message }, 400);
    }
  });
}

export function discovery(config: MockConfig) {
  return {
    issuer: config.issuer,
    authorization_endpoint: `${config.issuer}/authorize`,
    token_endpoint: `${config.issuer}/token`,
    jwks_uri: `${config.issuer}/.well-known/jwks.json`,
    end_session_endpoint: `${config.issuer}/api/logout`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    subject_types_supported: ["public"],
    id_token_signing_alg_values_supported: ["EdDSA"],
    token_endpoint_auth_methods_supported: ["none"],
    code_challenge_methods_supported: ["S256"],
  };
}

function continueAuthorize(config: MockConfig, codes: Map<string, AuthCode>, body: URLSearchParams) {
  const redirectUri = required(body, "redirect_uri");
  const state = required(body, "state");
  const clientId = required(body, "client_id");
  requireKnownClient(config, clientId);
  const codeChallenge = required(body, "code_challenge");
  const { profile, requestedOrg } = buildProfile(config, body);
  if (!requestedOrg) throw new Error("At least one local organization is required");
  const org = findOrganization(profile, requestedOrg);
  const code = randomUUID();
  codes.set(code, {
    profile,
    organizationId: org.organizationId,
    clientId,
    redirectUri,
    codeChallenge,
    expiresAt: Date.now() + CODE_TTL_MS,
  });
  const callback = new URL(redirectUri);
  callback.searchParams.set("code", code);
  callback.searchParams.set("state", state);
  return callback;
}

function buildProfile(config: MockConfig, body: URLSearchParams): { profile: LocalProfile; requestedOrg: string | undefined } {
  const userSub = body.get("user");
  if (userSub) {
    const user = config.users.find((candidate) => candidate.sub === userSub);
    if (!user) throw new Error(`Unknown demo user: ${userSub}`);
    const organizations = user.memberships.map((membership) => resolveMembership(config, membership));
    const profile: LocalProfile = {
      sub: user.sub,
      email: user.email,
      name: user.name,
      ...(user.picture ? { picture: user.picture } : {}),
      organizations,
    };
    const requestedOrg = body.get("organization_id") || organizations[0]?.organizationId;
    return { profile, requestedOrg };
  }

  const organizationId = required(body, "organization_id");
  const catalogOrg = config.organizations.find((org) => org.id === organizationId);
  const slug = body.get("organization_slug") || catalogOrg?.slug || organizationId;
  const name = body.get("organization_name") || catalogOrg?.name || titleize(slug);
  const roles = body.getAll("roles").filter(Boolean);
  const fromRoles = roles.flatMap((role) => config.roles[role] ?? []);
  const permissions = dedupe([...fromRoles, ...body.getAll("permissions").filter(Boolean)]);
  const organization: LocalOrganization = {
    organizationId,
    slug,
    name,
    status: "active",
    roles,
    permissions,
  };
  const sub = cleanId(required(body, "sub"));
  const email = body.get("email") || `${sub}@example.test`;
  const profile: LocalProfile = {
    sub,
    email,
    name: body.get("name") || email,
    organizations: [organization],
  };
  return { profile, requestedOrg: organizationId };
}

async function tokenResponse(
  config: MockConfig,
  signingKey: SigningKey,
  codes: Map<string, AuthCode>,
  refreshSessions: Map<string, RefreshSession>,
  body: URLSearchParams,
) {
  const grantType = required(body, "grant_type");
  if (grantType === "authorization_code") {
    const code = required(body, "code");
    const authCode = codes.get(code);
    codes.delete(code);
    if (!authCode || authCode.expiresAt < Date.now()) throw new Error("Invalid or expired authorization code");
    if (required(body, "client_id") !== authCode.clientId) throw new Error("Invalid client_id");
    if (required(body, "redirect_uri") !== authCode.redirectUri) throw new Error("Invalid redirect_uri");
    const verifier = required(body, "code_verifier");
    if (!await verifyPkce(verifier, authCode.codeChallenge)) throw new Error("Invalid code_verifier");
    return issueTokenSet(config, signingKey, refreshSessions, authCode.profile, authCode.organizationId, authCode.clientId);
  }
  if (grantType === "refresh_token") {
    const refreshToken = required(body, "refresh_token");
    const session = refreshSessions.get(refreshToken);
    refreshSessions.delete(refreshToken);
    if (!session || session.expiresAt < Date.now()) throw new Error("Invalid or expired refresh token");
    const clientId = required(body, "client_id");
    if (clientId !== session.clientId) throw new Error("Invalid client_id");
    return issueTokenSet(config, signingKey, refreshSessions, session.profile, session.organizationId, session.clientId);
  }
  throw new Error("Unsupported grant_type");
}

async function issueTokenSet(
  config: MockConfig,
  signingKey: SigningKey,
  refreshSessions: Map<string, RefreshSession>,
  profile: LocalProfile,
  organizationId: string,
  clientId: string,
) {
  requireKnownClient(config, clientId);
  const org = findOrganization(profile, organizationId);
  const claims = {
    email: profile.email,
    email_verified: true,
    name: profile.name,
    picture: profile.picture || null,
    org_id: org.organizationId,
    org_slug: org.slug,
    organizations: profile.organizations,
    roles: org.roles,
    permissions: org.permissions,
  };
  const token = await new SignJWT(claims)
    .setProtectedHeader({ alg: "EdDSA", kid: signingKey.kid })
    .setIssuer(config.issuer)
    .setAudience(clientId)
    .setSubject(profile.sub)
    .setIssuedAt()
    .setExpirationTime(`${TOKEN_TTL_SECONDS}s`)
    .sign(signingKey.privateKey);
  const refreshToken = randomUUID();
  refreshSessions.set(refreshToken, {
    profile,
    organizationId: org.organizationId,
    clientId,
    expiresAt: Date.now() + REFRESH_TTL_MS,
  });
  return {
    token_type: "Bearer",
    expires_in: TOKEN_TTL_SECONDS,
    id_token: token,
    access_token: token,
    refresh_token: refreshToken,
  };
}

async function verifyBearer(config: MockConfig, signingKey: SigningKey, request: IncomingMessage) {
  const session = await optionalBearer(config, signingKey, request);
  if (!session) throw new Error("Bearer access token required");
  return session;
}

async function optionalBearer(config: MockConfig, signingKey: SigningKey, request: IncomingMessage) {
  const header = request.headers.authorization;
  const match = typeof header === "string" ? header.match(/^Bearer\s+(.+)$/i) : null;
  if (!match?.[1]) return null;
  const result = await jwtVerify(match[1], signingKey.publicKey, {
    issuer: config.issuer,
    audience: config.clients,
    algorithms: ["EdDSA"],
  });
  const payload = result.payload;
  const orgId = stringValue(payload.org_id);
  if (!orgId) throw new Error("Bearer token is missing organization context");
  const orgSlug = stringValue(payload.org_slug) || orgId;
  const permissions = stringArray(payload.permissions);
  const roles = stringArray(payload.roles);
  const picture = stringValue(payload.picture);
  const tokenOrganizations = parseTokenOrganizations(payload.organizations);
  const organizations = tokenOrganizations.some((candidate) => candidate.organizationId === orgId)
    ? tokenOrganizations
    : [{
      organizationId: orgId,
      slug: orgSlug,
      name: titleize(orgSlug),
      status: "active" as const,
      roles,
      permissions,
    }];
  const profile: LocalProfile = {
    sub: String(payload.sub || ""),
    email: stringValue(payload.email) || "",
    name: stringValue(payload.name) || stringValue(payload.email) || "",
    ...(picture ? { picture } : {}),
    organizations,
  };
  return { profile, organizationId: orgId };
}

function requireKnownClient(config: MockConfig, clientId: string) {
  if (config.clients.length && !config.clients.includes(clientId)) {
    throw new Error(`Unknown client_id: ${clientId}`);
  }
}

function findOrganization(profile: LocalProfile, organizationId: string) {
  const org = profile.organizations.find((candidate) => candidate.organizationId === organizationId);
  if (!org) throw new Error("Profile does not contain requested organization");
  return org;
}

function applyCors(config: MockConfig, request: IncomingMessage, response: ServerResponse) {
  const origin = request.headers.origin;
  if (typeof origin === "string" && (config.allowedOrigins.includes(origin) || config.allowedOrigins.includes("*"))) {
    response.setHeader("access-control-allow-origin", origin);
    response.setHeader("vary", "origin");
  }
  response.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
  response.setHeader("access-control-allow-headers", "content-type,authorization");
}

async function readForm(request: IncomingMessage) {
  const raw = await readBody(request);
  return new URLSearchParams(raw);
}

async function readJson(request: IncomingMessage) {
  const raw = await readBody(request);
  return JSON.parse(raw || "{}") as Record<string, unknown>;
}

async function readBody(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

function sendJson(response: ServerResponse, data: unknown, status = 200) {
  const body = JSON.stringify(data);
  response.writeHead(status, {
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
  });
  response.end(body);
}

function sendHtml(response: ServerResponse, body: string) {
  response.writeHead(200, {
    "cache-control": "no-store",
    "content-type": "text/html; charset=utf-8",
    "content-length": Buffer.byteLength(body),
  });
  response.end(body);
}

function required(body: URLSearchParams, key: string) {
  const value = body.get(key);
  if (!value) throw new Error(`${key} is required`);
  return value;
}

async function verifyPkce(verifier: string, expectedChallenge: string) {
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return timingSafeStringEqual(challenge, expectedChallenge);
}

function timingSafeStringEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function dedupe(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function parseTokenOrganizations(value: unknown): LocalOrganization[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const organization = item as Record<string, unknown>;
    const organizationId = stringValue(organization.organizationId);
    if (!organizationId) return [];
    const slug = stringValue(organization.slug) || organizationId;
    return [{
      organizationId,
      slug,
      name: stringValue(organization.name) || titleize(slug),
      status: "active" as const,
      roles: stringArray(organization.roles),
      permissions: stringArray(organization.permissions),
    }];
  });
}

function cleanId(value: string) {
  return value.replace(/@@/g, "-").trim() || "local";
}

function titleize(value: string) {
  return value.replace(/[-_]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

const AVATAR_TINTS = ["#6d78e6", "#3aa79b", "#b072d6", "#cf7a54", "#d06a86", "#4b9fd1", "#8a923f", "#c98a3e"];

function avatarTint(seed: string) {
  let sum = 0;
  for (const char of seed) sum = (sum + char.charCodeAt(0)) % 997;
  return AVATAR_TINTS[sum % AVATAR_TINTS.length];
}

function initials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return (words[0]![0]! + words[words.length - 1]![0]!).toUpperCase();
}

function documentShell(title: string, inner: string, cardWidth = 640) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <title>${escapeHtml(title)}</title>
  <style>${styles()}</style>
  <script>(function(){try{var t=localStorage.getItem('darkauth-mock-theme');if(t==='dark'||t==='light')document.documentElement.setAttribute('data-theme',t);}catch(e){}})();</script>
</head>
<body>
  <main class="shell" style="--card-width:${cardWidth}px">
    <header class="topbar">
      ${brand()}
      <button type="button" id="theme-toggle" class="icon-btn" aria-label="Toggle color theme" title="Toggle color theme">
        <span class="sun">${sunIcon()}</span>
        <span class="moon">${moonIcon()}</span>
      </button>
    </header>
    ${inner}
  </main>
  <script>
    (function(){
      var btn = document.getElementById('theme-toggle');
      if (!btn) return;
      btn.addEventListener('click', function(){
        var root = document.documentElement;
        var current = root.getAttribute('data-theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
        var next = current === 'dark' ? 'light' : 'dark';
        root.setAttribute('data-theme', next);
        try { localStorage.setItem('darkauth-mock-theme', next); } catch (e) {}
      });
    })();
  </script>
</body>
</html>`;
}

function brand() {
  return `<div class="brand">
    ${lockmark()}
    <span class="brand-name">DarkAuth <span>Mock</span></span>
  </div>`;
}

function lockmark() {
  return `<svg class="lockmark" viewBox="0 0 32 32" width="26" height="26" aria-hidden="true">
    <path d="M10 15v-3.2a6 6 0 0 1 12 0V15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
    <rect x="6.4" y="14.6" width="19.2" height="12.6" rx="4.2" fill="currentColor" fill-opacity="0.16" stroke="currentColor" stroke-width="1.6"/>
    <g fill="none" stroke="currentColor" stroke-width="1.3" opacity="0.9">
      <ellipse cx="16" cy="21" rx="6" ry="2.4"/>
      <ellipse cx="16" cy="21" rx="6" ry="2.4" transform="rotate(60 16 21)"/>
      <ellipse cx="16" cy="21" rx="6" ry="2.4" transform="rotate(120 16 21)"/>
    </g>
    <circle cx="16" cy="21" r="1.7" fill="currentColor"/>
  </svg>`;
}

function sunIcon() {
  return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>`;
}

function moonIcon() {
  return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>`;
}

function landingPage(config: MockConfig, message = "DarkAuth Mock is running.") {
  const inner = `<p class="eyebrow">Local development only</p>
    <h1>DarkAuth Mock</h1>
    <p class="lede">${escapeHtml(message)}</p>
    <dl class="meta">
      <dt>Issuer</dt><dd>${escapeHtml(config.issuer)}</dd>
      <dt>JWKS</dt><dd>${escapeHtml(`${config.issuer}/.well-known/jwks.json`)}</dd>
    </dl>`;
  return documentShell("DarkAuth Mock", inner, 460);
}

function authorizePage(config: MockConfig, url: URL) {
  const passthrough = Array.from(url.searchParams.entries()).filter(
    ([key]) => !["user", "profile", "organization_id", "organization_slug", "organization_name", "roles", "permissions"].includes(key),
  );
  const hiddenInputs = passthrough
    .map(([key, value]) => `<input type="hidden" name="${escapeHtml(key)}" value="${escapeHtml(value)}">`)
    .join("");

  const orgSections = config.organizations
    .map((org) => {
      const members = config.users.filter((user) => user.memberships.some((membership) => membership.org === org.id));
      if (!members.length) return "";
      const cards = members
        .map((user) => {
          const membership = user.memberships.find((candidate) => candidate.org === org.id);
          const resolved = membership ? resolveMembership(config, membership) : null;
          const pills = resolved?.roles.length
            ? resolved.roles.map((role) => `<span class="pill">${escapeHtml(role)}</span>`).join("")
            : `<span class="pill pill-muted">no roles</span>`;
          return `<form method="post" action="/authorize/continue" class="card-form">
        ${hiddenInputs}
        <input type="hidden" name="user" value="${escapeHtml(user.sub)}">
        <input type="hidden" name="organization_id" value="${escapeHtml(org.id)}">
        <button type="submit" class="card">
          <span class="avatar" style="--tint:${avatarTint(user.sub)}">${escapeHtml(initials(user.name))}</span>
          <span class="card-body">
            <span class="card-name">${escapeHtml(user.name)}</span>
            <span class="card-email">${escapeHtml(user.email)}</span>
            <span class="pill-row">${pills}</span>
          </span>
        </button>
      </form>`;
        })
        .join("");
      return `<section class="org">
      <h2><span class="org-name">${escapeHtml(org.name)}</span><span class="slug">${escapeHtml(org.slug)}</span></h2>
      <div class="cards">${cards}</div>
    </section>`;
    })
    .filter(Boolean)
    .join("");

  const orgOptions = config.organizations
    .map((org) => `<option value="${escapeHtml(org.id)}" data-slug="${escapeHtml(org.slug)}" data-name="${escapeHtml(org.name)}">${escapeHtml(org.name)}</option>`)
    .join("");
  const roleChips = Object.keys(config.roles)
    .map((role) => `<label class="chip"><input type="checkbox" name="roles" value="${escapeHtml(role)}"><span>${escapeHtml(role)}</span></label>`)
    .join("");
  const permissionChips = config.permissions
    .map((permission) => `<label class="chip"><input type="checkbox" name="permissions" value="${escapeHtml(permission)}"><span>${escapeHtml(permission)}</span></label>`)
    .join("");

  const inner = `<p class="eyebrow">Local development only</p>
    <h1>Choose a local ${escapeHtml(config.appName)} identity</h1>
    ${orgSections || '<p class="lede">No demo users configured. Use the custom identity form below.</p>'}
    <details class="custom">
      <summary>Custom identity</summary>
      <form method="post" action="/authorize/continue" class="custom-form">
        ${hiddenInputs}
        <div class="grid-2">
          <label class="field">Name<input name="name" value="Local Developer" required></label>
          <label class="field">Email<input name="email" type="email" autocomplete="off" value="developer@example.test" required></label>
        </div>
        <label class="field">Subject<input name="sub" value="local-developer" required></label>
        <label class="field">Organization
          <select name="organization_id" id="org-select" required>${orgOptions}</select>
        </label>
        <div class="grid-2">
          <label class="field">Organization slug<input name="organization_slug" id="org-slug"></label>
          <label class="field">Organization name<input name="organization_name" id="org-name"></label>
        </div>
        ${roleChips ? `<fieldset><legend>Roles</legend><div class="chips">${roleChips}</div></fieldset>` : ""}
        ${permissionChips ? `<fieldset><legend>Permissions</legend><div class="chips">${permissionChips}</div></fieldset>` : ""}
        <button type="submit" class="btn">Continue as custom identity</button>
      </form>
    </details>
    <script>
      (function(){
        var select = document.getElementById('org-select');
        var slug = document.getElementById('org-slug');
        var name = document.getElementById('org-name');
        function sync(){
          var option = select && select.options[select.selectedIndex];
          if (option){ slug.placeholder = option.dataset.slug || ''; name.placeholder = option.dataset.name || ''; }
        }
        if (select){ select.addEventListener('change', sync); sync(); }
      })();
    </script>`;
  return documentShell("DarkAuth Mock Login", inner, 660);
}

function styles() {
  return `
    :root {
      color-scheme: light;
      --bg: #eef1f7;
      --bg-glow: rgba(75, 87, 196, 0.10);
      --surface: #ffffff;
      --surface-2: #f4f6fb;
      --surface-3: #eaeef6;
      --border: #dde3ee;
      --border-strong: #c8d1e0;
      --text: #1a2333;
      --text-muted: #5a6678;
      --text-faint: #8792a5;
      --accent: #4b57c4;
      --accent-strong: #3b47b3;
      --accent-contrast: #ffffff;
      --accent-soft: color-mix(in srgb, var(--accent) 12%, var(--surface));
      --warn-bg: #fdf5e6;
      --warn-border: #f0d19a;
      --warn-text: #8a5a1a;
      --shadow: 0 24px 60px rgba(26, 35, 51, 0.14);
    }
    @media (prefers-color-scheme: dark) {
      :root:not([data-theme]) {
        color-scheme: dark;
        --bg: #161c27;
        --bg-glow: rgba(170, 182, 236, 0.12);
        --surface: #212a38;
        --surface-2: #283242;
        --surface-3: #2f3a4d;
        --border: rgba(255, 255, 255, 0.09);
        --border-strong: rgba(255, 255, 255, 0.17);
        --text: #e7ecf4;
        --text-muted: #9aa6b9;
        --text-faint: #6f7c90;
        --accent: #aab6ec;
        --accent-strong: #c3ccf4;
        --accent-contrast: #161c27;
        --accent-soft: color-mix(in srgb, var(--accent) 16%, var(--surface));
        --warn-bg: color-mix(in srgb, #e0a12a 13%, var(--surface));
        --warn-border: color-mix(in srgb, #e0a12a 42%, transparent);
        --warn-text: #e7bb6c;
        --shadow: 0 28px 70px rgba(0, 0, 0, 0.5);
      }
    }
    :root[data-theme="dark"] {
      color-scheme: dark;
      --bg: #161c27;
      --bg-glow: rgba(170, 182, 236, 0.12);
      --surface: #212a38;
      --surface-2: #283242;
      --surface-3: #2f3a4d;
      --border: rgba(255, 255, 255, 0.09);
      --border-strong: rgba(255, 255, 255, 0.17);
      --text: #e7ecf4;
      --text-muted: #9aa6b9;
      --text-faint: #6f7c90;
      --accent: #aab6ec;
      --accent-strong: #c3ccf4;
      --accent-contrast: #161c27;
      --accent-soft: color-mix(in srgb, var(--accent) 16%, var(--surface));
      --warn-bg: color-mix(in srgb, #e0a12a 13%, var(--surface));
      --warn-border: color-mix(in srgb, #e0a12a 42%, transparent);
      --warn-text: #e7bb6c;
      --shadow: 0 28px 70px rgba(0, 0, 0, 0.5);
    }

    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: start center;
      padding: 40px 20px;
      font-family: "Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
      color: var(--text);
      background: var(--bg);
      background-image: radial-gradient(1100px 520px at 50% -8%, var(--bg-glow), transparent 70%);
      -webkit-font-smoothing: antialiased;
    }
    .shell {
      width: min(var(--card-width, 640px), 100%);
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 20px;
      padding: 24px 28px 26px;
      box-shadow: var(--shadow);
    }
    .topbar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 18px; }
    .brand { display: flex; align-items: center; gap: 10px; }
    .lockmark { color: var(--accent); }
    .brand-name { font-size: 19px; font-weight: 750; letter-spacing: -0.01em; color: var(--accent); }
    .brand-name span { color: var(--text-faint); font-weight: 600; }
    .icon-btn {
      width: 38px; height: 38px; border-radius: 11px;
      border: 1px solid var(--border); background: var(--surface-2); color: var(--text-muted);
      display: grid; place-items: center; cursor: pointer; transition: color .15s, border-color .15s, background .15s;
    }
    .icon-btn:hover { color: var(--text); border-color: var(--border-strong); background: var(--surface-3); }
    .icon-btn .sun, .icon-btn .moon { line-height: 0; }
    .icon-btn .sun { display: none; }
    .icon-btn .moon { display: inline-flex; }
    @media (prefers-color-scheme: dark) {
      :root:not([data-theme]) .icon-btn .sun { display: inline-flex; }
      :root:not([data-theme]) .icon-btn .moon { display: none; }
    }
    :root[data-theme="dark"] .icon-btn .sun { display: inline-flex; }
    :root[data-theme="dark"] .icon-btn .moon { display: none; }
    :root[data-theme="light"] .icon-btn .sun { display: none; }
    :root[data-theme="light"] .icon-btn .moon { display: inline-flex; }

    .eyebrow { margin: 0 0 8px; font-size: 11px; font-weight: 700; letter-spacing: 0.09em; text-transform: uppercase; color: var(--accent); }
    h1 { margin: 0 0 4px; font-size: 25px; line-height: 1.2; font-weight: 750; letter-spacing: -0.015em; color: var(--text); }
    .lede { color: var(--text-muted); line-height: 1.55; margin: 8px 0 0; }

    .org { margin-top: 24px; }
    .org:first-of-type { margin-top: 22px; }
    .org h2 { display: flex; align-items: center; gap: 9px; margin: 0 0 11px; }
    .org-name { font-size: 12px; font-weight: 700; letter-spacing: 0.07em; text-transform: uppercase; color: var(--text-faint); }
    .slug { font-size: 11px; font-weight: 600; color: var(--text-muted); background: var(--surface-2); border: 1px solid var(--border); padding: 2px 7px; border-radius: 6px; }

    .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(212px, 1fr)); gap: 12px; }
    .card-form { margin: 0; display: flex; }
    .card {
      display: flex; align-items: center; gap: 12px; width: 100%; text-align: left;
      padding: 13px 14px; border: 1px solid var(--border); border-radius: 14px;
      background: var(--surface-2); color: var(--text); font: inherit; cursor: pointer;
      transition: border-color .15s, background .15s, box-shadow .15s;
    }
    .card:hover {
      border-color: color-mix(in srgb, var(--accent) 60%, var(--border));
      background: var(--surface-3);
      box-shadow: 0 10px 24px rgba(20, 27, 45, 0.14);
    }
    .card:focus-visible { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
    .avatar {
      width: 42px; height: 42px; border-radius: 12px; flex: none;
      display: grid; place-items: center; font-weight: 700; font-size: 14px;
      background: color-mix(in srgb, var(--tint) 20%, var(--surface));
      color: var(--tint);
    }
    .card-body { display: grid; gap: 2px; min-width: 0; }
    .card-name { font-weight: 650; font-size: 14px; color: var(--text); }
    .card-email { font-size: 12px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .pill-row { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 3px; }
    .pill { font-size: 10.5px; font-weight: 600; padding: 2px 8px; border-radius: 999px; background: var(--accent-soft); color: var(--accent-strong); }
    .pill-muted { background: var(--surface-3); color: var(--text-faint); }

    .custom { margin-top: 24px; border-top: 1px solid var(--border); }
    .custom summary { list-style: none; cursor: pointer; padding: 14px 2px 4px; font-weight: 650; color: var(--text); display: flex; align-items: center; gap: 9px; }
    .custom summary::-webkit-details-marker { display: none; }
    .custom summary::before { content: ""; width: 7px; height: 7px; border-right: 2px solid var(--text-faint); border-bottom: 2px solid var(--text-faint); transform: rotate(-45deg); transition: transform .15s; }
    .custom[open] summary::before { transform: rotate(45deg); }
    .custom-form { padding-top: 6px; }
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0 14px; }
    @media (max-width: 480px) { .grid-2 { grid-template-columns: 1fr; } }
    .field { display: grid; gap: 6px; margin: 13px 0; font-size: 12.5px; font-weight: 600; color: var(--text-muted); }
    input, select {
      font: inherit; font-weight: 500; color: var(--text);
      padding: 10px 12px; border: 1px solid var(--border); border-radius: 10px; background: var(--surface);
      transition: border-color .15s, box-shadow .15s;
    }
    input::placeholder { color: var(--text-faint); }
    input:focus, select:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
    fieldset { margin: 16px 0 4px; border: 1px solid var(--border); border-radius: 12px; padding: 12px 14px 14px; }
    legend { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-faint); padding: 0 6px; }
    .chips { display: flex; flex-wrap: wrap; gap: 8px; }
    .chip { position: relative; display: inline-flex; }
    .chip input { position: absolute; inset: 0; opacity: 0; cursor: pointer; margin: 0; }
    .chip span {
      display: inline-flex; align-items: center; padding: 6px 13px; border-radius: 999px;
      border: 1px solid var(--border); background: var(--surface); color: var(--text-muted);
      font-size: 12.5px; font-weight: 600; user-select: none; transition: all .12s;
    }
    .chip input:checked + span { background: var(--accent-soft); border-color: var(--accent); color: var(--accent-strong); }
    .chip input:focus-visible + span { box-shadow: 0 0 0 3px var(--accent-soft); }

    .btn {
      width: 100%; margin-top: 14px; padding: 12px 16px; border: 0; border-radius: 11px;
      background: var(--accent); color: var(--accent-contrast); font: inherit; font-weight: 700; font-size: 14px;
      cursor: pointer; transition: filter .15s;
    }
    .btn:hover { filter: brightness(1.06); }
    .btn:active { filter: brightness(0.96); }

    .meta { display: grid; grid-template-columns: max-content 1fr; gap: 8px 14px; margin: 18px 0 0; font-size: 13px; overflow-wrap: anywhere; }
    .meta dt { font-weight: 700; color: var(--text-muted); }
    .meta dd { margin: 0; color: var(--text); }
  `;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
