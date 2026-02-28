import fs, { createReadStream } from "node:fs";
import {
  createServer as createHttpServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getBrandingConfig, sanitizeCSS } from "../services/branding.ts";
import { getSetting, isSystemInitialized } from "../services/settings.ts";
import type { Context } from "../types.ts";
import { sendError } from "../utils/http.ts";
import { setSecurityHeaders } from "../utils/security.ts";
import { generateOpenApiDocument } from "./openapi.ts";
import { proxyToVite, proxyWebSocketToVite } from "./proxy.ts";
import { createAdminRouter } from "./routers/adminRouter.ts";
import { createInstallRouter } from "./routers/installRouter.ts";
import { createUserRouter } from "./routers/userRouter.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export async function createUserServer(context: Context) {
  const router = createUserRouter(context);
  const server = createHttpServer(async (request: IncomingMessage, response: ServerResponse) => {
    try {
      const url = new URL(request.url || "", `http://${request.headers.host}`);
      const pathname = url.pathname;
      if (pathname === "/api/health") {
        const initialized = await isSystemInitialized(context);
        const restarting = !!context.services?.install?.restartRequested;
        const ok = initialized && !restarting;
        response.statusCode = ok ? 200 : 503;
        response.setHeader("Content-Type", "text/plain");
        response.end(ok ? "ok" : "starting");
        return;
      }

      if (request.method === "GET" && pathname === "/config.js") {
        let ui: { clientId?: string; redirectUri?: string } = {};
        // Use the actual user port if configured
        let issuer = context.config.userPort
          ? `http://localhost:${context.config.userPort}`
          : "http://localhost:9080";
        let publicOrigin = issuer;
        let branding: Awaited<ReturnType<typeof getBrandingConfig>> | null = null;
        try {
          ui =
            ((await getSetting(context, "ui_user")) as
              | { clientId?: string; redirectUri?: string }
              | undefined) || {};
          issuer = ((await getSetting(context, "issuer")) as string) || issuer;
          publicOrigin = ((await getSetting(context, "public_origin")) as string) || issuer;
          branding = await getBrandingConfig(context);
        } catch {
          branding = {
            identity: { title: "DarkAuth", tagline: "DarkAuth" },
            logo: { data: null, mimeType: null },
            logoDark: { data: null, mimeType: null },
            favicon: { data: null, mimeType: null },
            faviconDark: { data: null, mimeType: null },
            colors: {},
            colorsDark: undefined,
            wording: {},
            font: { family: "Inter", size: "16px", weight: {} },
            customCSS: "",
          };
        }
        const selfReg = (await getSetting(context, "users.self_registration_enabled")) as
          | boolean
          | null
          | undefined;
        const payload = {
          issuer,
          clientId: ui.clientId || "demo-public-client",
          redirectUri: ui.redirectUri || `${publicOrigin}/callback`,
          features: {
            selfRegistrationEnabled: !!selfReg,
          },
          branding: {
            identity: branding?.identity || {
              name: "DarkAuth",
              shortName: "DarkAuth",
            },
            colors: branding?.colors || {},
            colorsDark: branding?.colorsDark || undefined,
            wording: branding?.wording || {},
            font: branding?.font || { family: "Inter", url: null },
            customCSS: sanitizeCSS(branding?.customCSS || ""),
            logoUrl: "/api/branding/logo",
            logoUrlDark: "/api/branding/logo?dark=1",
            faviconUrl: branding?.favicon?.data ? "/api/branding/favicon" : null,
            faviconUrlDark: branding?.faviconDark?.data ? "/api/branding/favicon?dark=1" : null,
            customCssUrl: "/api/branding/custom.css",
          },
        };
        const js = `
          (function(){
            window.__APP_CONFIG__=${JSON.stringify(payload)};
            try {
              var root=document.documentElement;
              var stored=localStorage.getItem('daTheme');
              var prefersDark=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches;
              var theme = stored==='light'||stored==='dark'? stored : (prefersDark?'dark':'light');
              root.setAttribute('data-da-theme', theme);
              window.__setDaTheme = function(t){ if(t==='light'||t==='dark'){ localStorage.setItem('daTheme', t); root.setAttribute('data-da-theme', t);} };
              window.addEventListener('storage', function(e){ if(e.key==='daTheme'){ var v=e.newValue; if(v==='light'||v==='dark'){ root.setAttribute('data-da-theme', v);} }});
            } catch(e) {}
          })();`;
        response.statusCode = 200;
        response.setHeader("Content-Type", "application/javascript; charset=utf-8");
        response.end(js);
        return;
      }

      const origin = request.headers.origin as string | undefined;
      if (origin) {
        response.setHeader("Access-Control-Allow-Origin", origin);
        response.setHeader("Vary", "Origin");
        response.setHeader("Access-Control-Allow-Credentials", "true");
        response.setHeader(
          "Access-Control-Allow-Headers",
          request.headers["access-control-request-headers"] || "content-type,authorization"
        );
        response.setHeader(
          "Access-Control-Allow-Methods",
          request.headers["access-control-request-method"] || "GET,POST,PUT,DELETE,OPTIONS"
        );
        if (request.method === "OPTIONS") {
          response.statusCode = 204;
          response.end();
          return;
        }
      }

      const initialized = await isSystemInitialized(context);

      if (!initialized && !context.config.proxyUi && !pathname.startsWith("/api/")) {
        setSecurityHeaders(response, context.config.isDevelopment);
        response.statusCode = 503;
        response.setHeader("Content-Type", "text/html; charset=utf-8");
        response.end(
          `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Maintenance</title><style>body{font-family:system-ui;margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0f172a;color:#e2e8f0}.card{background:#0b1220;border:1px solid #1f2937;border-radius:12px;padding:32px;max-width:520px;box-shadow:0 10px 30px rgba(0,0,0,0.4)}h1{margin:0 0 8px;font-size:24px}p{margin:0 0 6px;color:#94a3b8}.hint{margin-top:12px;font-size:14px;color:#9ca3af}</style></head><body><div class="card"><h1>DarkAuth is not installed</h1><p>The authentication service is not ready yet.</p><p>Setup must be completed on the admin port.</p><p class="hint">Get the one-time install link from the server console where DarkAuth is running.</p></div></body></html>`
        );
        return;
      }

      const isAuthorizeUiRequest = pathname === "/authorize" && url.searchParams.has("request_id");
      if (
        pathname.startsWith("/api/") ||
        (pathname === "/authorize" && !isAuthorizeUiRequest) ||
        pathname === "/token" ||
        pathname.startsWith("/.well-known") ||
        pathname.startsWith("/otp/")
      ) {
        setSecurityHeaders(response, context.config.isDevelopment);
        if (pathname.startsWith("/api/")) {
          let apiPath = pathname.slice(4);
          apiPath = apiPath.replace(/^\/user(\/|$)/, "/");
          request.url = apiPath + url.search;
        }
        if (pathname.startsWith("/otp/")) {
          const isUiRoute =
            request.method === "GET" && (pathname === "/otp/setup" || pathname === "/otp/verify");
          if (isUiRoute) {
            const userCandidates = [
              join(__dirname, "../../../../user-ui/dist"),
              join(__dirname, "../../../user-ui/dist"),
            ];
            await serveStaticFiles(request, response, resolveStaticBase(userCandidates));
            return;
          }
          request.url = pathname + url.search;
        }
        if (!initialized) {
          response.statusCode = 503;
          response.setHeader("Content-Type", "application/json");
          response.end(JSON.stringify({ error: "System not initialized" }));
          return;
        }
        await router(request, response);
      } else if (context.config.proxyUi) {
        // Don't set CSP headers when proxying to Vite in development
        await proxyToVite(request, response, 5173);
      } else {
        setSecurityHeaders(response, context.config.isDevelopment);
        const userCandidates = [
          join(__dirname, "../../../../user-ui/dist"),
          join(__dirname, "../../../user-ui/dist"),
        ];
        await serveStaticFiles(request, response, resolveStaticBase(userCandidates));
      }
    } catch (error) {
      context.logger.error(error);
      sendError(response, error as Error);
    }
  });
  server.on("upgrade", (upgradeRequest, socket, head) => {
    if (context.config.proxyUi) {
      proxyWebSocketToVite(upgradeRequest, socket, head, 5173);
    } else {
      socket.destroy();
    }
  });
  return server;
}

export async function createAdminServer(context: Context) {
  const adminRouter = createAdminRouter(context);
  const installRouter = createInstallRouter(context);
  const server = createHttpServer(async (request: IncomingMessage, response: ServerResponse) => {
    try {
      const url = new URL(request.url || "", `http://${request.headers.host}`);
      const pathname = url.pathname;
      if (pathname === "/api/health") {
        const initialized = await isSystemInitialized(context);
        const restarting = !!context.services?.install?.restartRequested;
        const ok = initialized && !restarting;
        response.statusCode = ok ? 200 : 503;
        response.setHeader("Content-Type", "text/plain");
        response.end(ok ? "ok" : "starting");
        return;
      }

      if (request.method === "GET" && pathname === "/config.js") {
        let ui: { clientId?: string; redirectUri?: string } = {};
        // In test/development mode, use the actual user port for the issuer
        let issuer = context.config.userPort
          ? `http://localhost:${context.config.userPort}`
          : "http://localhost:9080";
        const adminOrigin = `http://localhost:${context.config.adminPort}`;
        let branding: Awaited<ReturnType<typeof getBrandingConfig>> | null = null;
        try {
          ui =
            ((await getSetting(context, "ui_admin")) as
              | { clientId?: string; redirectUri?: string }
              | undefined) || {};
          issuer = ((await getSetting(context, "issuer")) as string) || issuer;
          branding = await getBrandingConfig(context);
        } catch {
          branding = {
            identity: { title: "DarkAuth", tagline: "DarkAuth" },
            logo: { data: null, mimeType: null },
            logoDark: { data: null, mimeType: null },
            favicon: { data: null, mimeType: null },
            faviconDark: { data: null, mimeType: null },
            colors: {},
            colorsDark: undefined,
            wording: {},
            font: { family: "Inter", size: "16px", weight: {} },
            customCSS: "",
          };
        }
        const payload = {
          issuer,
          clientId: ui.clientId || "admin-web",
          redirectUri: ui.redirectUri || `${adminOrigin}/`,
          branding: {
            identity: branding?.identity || {
              name: "DarkAuth",
              shortName: "DarkAuth",
            },
            colors: branding?.colors || {},
            colorsDark: branding?.colorsDark || undefined,
            wording: branding?.wording || {},
            font: branding?.font || { family: "Inter", url: null },
            customCSS: sanitizeCSS(branding?.customCSS || ""),
            logoUrl: "/api/branding/logo",
            logoUrlDark: "/api/branding/logo?dark=1",
            faviconUrl: branding?.favicon?.data ? "/api/branding/favicon" : null,
            faviconUrlDark: branding?.faviconDark?.data ? "/api/branding/favicon?dark=1" : null,
            customCssUrl: "/api/branding/custom.css",
          },
        };
        const js = `
          (function(){
            window.__APP_CONFIG__=${JSON.stringify(payload)};
            try {
              var root=document.documentElement;
              var stored=localStorage.getItem('daTheme');
              var prefersDark=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches;
              var theme = stored==='light'||stored==='dark'? stored : (prefersDark?'dark':'light');
              root.setAttribute('data-da-theme', theme);
              window.__setDaTheme = function(t){ if(t==='light'||t==='dark'){ localStorage.setItem('daTheme', t); root.setAttribute('data-da-theme', t);} };
              window.addEventListener('storage', function(e){ if(e.key==='daTheme'){ var v=e.newValue; if(v==='light'||v==='dark'){ root.setAttribute('data-da-theme', v);} }});
            } catch(e) {}
          })();`;
        response.statusCode = 200;
        response.setHeader("Content-Type", "application/javascript; charset=utf-8");
        response.end(js);
        return;
      }

      if (request.method === "GET" && pathname === "/openapi") {
        const adminUrl = `http://localhost:${context.config.adminPort}`;
        const userUrl = `http://localhost:${context.config.userPort}`;
        const doc = generateOpenApiDocument(adminUrl, userUrl);
        response.statusCode = 200;
        response.setHeader("Content-Type", "application/json");
        response.end(JSON.stringify(doc, null, 2));
        return;
      }

      const initialized = await isSystemInitialized(context);

      if (pathname.startsWith("/api/") || pathname.startsWith("/admin/")) {
        setSecurityHeaders(response, context.config.isDevelopment);
        if (pathname.startsWith("/api/")) {
          const apiPath = pathname.slice(4);
          request.url = apiPath + url.search;
          if (!initialized) {
            await installRouter(request, response);
            return;
          }
          await adminRouter(request, response);
        } else {
          if (!initialized) {
            response.statusCode = 302;
            response.setHeader("Location", "/install");
            response.end();
            return;
          }
          await adminRouter(request, response);
        }
      } else if (context.config.proxyUi) {
        // In development, proxy to Vite; if uninitialized, allow installer route and assets,
        // but redirect all other paths to /install.
        if (!initialized) {
          const allowedPrefixes = [
            "/install",
            "/@vite",
            "/@react-refresh",
            "/@id",
            "/@fs",
            "/src",
            "/assets",
            "/node_modules",
            "/favicon",
            "/manifest.json",
            "/manifest.webmanifest",
            "/icons",
            "/vite.svg",
            "/__vite_ping",
          ];
          const isAllowed = allowedPrefixes.some((p) => pathname.startsWith(p));
          if (!isAllowed) {
            response.statusCode = 302;
            response.setHeader("Location", "/install");
            response.end();
            return;
          }
        }
        await proxyToVite(request, response, 5174);
      } else {
        setSecurityHeaders(response, context.config.isDevelopment);
        // In production, if not initialized, allow installer route and assets; redirect others
        if (!initialized) {
          const allowedPrefixes = [
            "/install",
            "/assets",
            "/favicon",
            "/manifest.json",
            "/manifest.webmanifest",
            "/icons",
            "/vite.svg",
          ];
          const isAllowed = allowedPrefixes.some((p) => pathname.startsWith(p));
          if (!isAllowed) {
            response.statusCode = 302;
            response.setHeader("Location", "/install");
            response.end();
            return;
          }
        }
        const adminCandidates = [
          join(__dirname, "../../../../admin-ui/dist"),
          join(__dirname, "../../../admin-ui/dist"),
        ];
        await serveStaticFiles(request, response, resolveStaticBase(adminCandidates));
      }
    } catch (error) {
      context.logger.error(error);
      sendError(response, error as Error);
    }
  });
  server.on("upgrade", (upgradeRequest, socket, head) => {
    if (context.config.proxyUi) {
      proxyWebSocketToVite(upgradeRequest, socket, head, 5174);
    } else {
      socket.destroy();
    }
  });
  return server;
}

async function serveStaticFiles(
  request: IncomingMessage,
  response: ServerResponse,
  basePath: string
) {
  const url = new URL(request.url || "", `http://${request.headers.host}`);
  let filePath = url.pathname;
  if (filePath === "/") filePath = "/index.html";
  const relativePath = filePath.replace(/^\/+/, "");
  const fullPath = join(basePath, relativePath);
  if (!fullPath.startsWith(basePath)) {
    response.statusCode = 403;
    response.end("Forbidden");
    return;
  }

  // Check if the target exists and is a file; otherwise handle SPA fallback or 404
  if (!fs.existsSync(fullPath)) {
    // For SPA routing, serve index.html for client-side routes
    // But only if the request doesn't have a file extension (to avoid serving index.html for missing assets)
    const hasFileExtension = /\.[^/]+$/.test(filePath);
    if (!hasFileExtension) {
      serveIndex(response, basePath);
      return;
    }
    // If it's a missing asset, return 404
    response.statusCode = 404;
    response.end("Not Found");
    return;
  }

  try {
    const fileStats = fs.statSync(fullPath);
    const hasFileExtension = /\.[^/]+$/.test(filePath);
    if (fileStats.isDirectory()) {
      if (!hasFileExtension) {
        serveIndex(response, basePath);
        return;
      }
      response.statusCode = 404;
      response.end("Not Found");
      return;
    }
    const stream = createReadStream(fullPath);
    const extension = fullPath.split(".").pop();
    const contentType = getContentType(extension || "");
    response.setHeader("Content-Type", contentType);
    stream.pipe(response);
    stream.on("error", () => {
      response.statusCode = 404;
      response.end("Not Found");
    });
  } catch {
    response.statusCode = 500;
    response.end("Internal Server Error");
  }
}

function getContentType(extension: string): string {
  const types: Record<string, string> = {
    html: "text/html",
    js: "application/javascript",
    css: "text/css",
    json: "application/json",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    svg: "image/svg+xml",
    ico: "image/x-icon",
  };

  return types[extension] || "application/octet-stream";
}

function resolveStaticBase(candidates: string[]): string {
  for (const directory of candidates) {
    try {
      const indexPath = join(directory, "index.html");
      if (fs.existsSync(indexPath)) return directory;
    } catch {}
  }
  return candidates[0] || "";
}

function serveIndex(response: ServerResponse, basePath: string) {
  try {
    const indexPath = join(basePath, "index.html");
    const html = fs.readFileSync(indexPath, "utf8");
    response.statusCode = 200;
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.end(html);
  } catch {
    response.statusCode = 200;
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.end(
      '<!DOCTYPE html><html><head><meta charset="utf-8"><title>DarkAuth</title></head><body>Not Found</body></html>'
    );
  }
}
