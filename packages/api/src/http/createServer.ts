import { createReadStream } from "node:fs";
import {
  createServer as createHttpServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getBrandingConfig, sanitizeCSS } from "../services/branding.js";
// Temporarily disabled OpenAPI imports
// import { OpenAPIGenerator } from "@asteasolutions/zod-to-openapi";
// import { openApiSchema as adminCreateUserSchema } from "../controllers/admin/adminUserCreate.js";
// import { openApiSchema as adminListUsersSchema } from "../controllers/admin/users.js";
// import { openApiSchema as adminUsersListSchema } from "../controllers/admin/adminUsers.js";
// import { openApiSchema as adminUserUpdateSchema } from "../controllers/admin/adminUserUpdate.js";
// import { openApiSchema as adminUserDeleteSchema } from "../controllers/admin/adminUserDelete.js";
// import { openApiSchema as groupsListSchema } from "../controllers/admin/groups.js";
// import { openApiSchema as clientsListSchema } from "../controllers/admin/clients.js";
// import { openApiSchema as adminSessionSchema } from "../controllers/admin/session.js";
import { getSetting, isSystemInitialized } from "../services/settings.js";
import type { Context } from "../types.js";
import { sendError } from "../utils/http.js";
import { setSecurityHeaders } from "../utils/security.js";
import { generateOpenApiDocument } from "./openapi.js";
import { proxyToVite } from "./proxy.js";
import { createAdminRouter } from "./routers/adminRouter.js";
import { createInstallRouter } from "./routers/installRouter.js";
import { createUserRouter } from "./routers/userRouter.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export async function createUserServer(context: Context) {
  const router = createUserRouter(context);

  return createHttpServer(async (request: IncomingMessage, response: ServerResponse) => {
    try {
      const url = new URL(request.url || "", `http://${request.headers.host}`);
      const pathname = url.pathname;

      if (request.method === "GET" && pathname === "/config.js") {
        const ui =
          ((await getSetting(context, "ui_user")) as
            | { clientId?: string; redirectUri?: string }
            | undefined) || {};
        const issuer = ((await getSetting(context, "issuer")) as string) || "http://localhost:9080";
        const publicOrigin = ((await getSetting(context, "public_origin")) as string) || issuer;
        const branding = await getBrandingConfig(context);
        const payload = {
          issuer,
          clientId: ui.clientId || "app-web",
          redirectUri: ui.redirectUri || `${publicOrigin}/callback`,
          branding: {
            identity: branding.identity,
            colors: branding.colors,
            colorsDark: branding.colorsDark || undefined,
            wording: branding.wording,
            font: branding.font,
            customCSS: sanitizeCSS(branding.customCSS || ""),
            logoUrl: branding.logo?.data ? "/api/branding/logo" : null,
            logoUrlDark: branding.logoDark?.data ? "/api/branding/logo?dark=1" : null,
            faviconUrl: branding.favicon?.data ? "/api/branding/favicon" : null,
            faviconUrlDark: branding.faviconDark?.data ? "/api/branding/favicon?dark=1" : null,
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

      if (!initialized && !pathname.startsWith("/api/")) {
        setSecurityHeaders(response, context.config.isDevelopment);
        response.statusCode = 503;
        response.setHeader("Content-Type", "text/html; charset=utf-8");
        response.end(
          `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Maintenance</title><style>body{font-family:system-ui;margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0f172a;color:#e2e8f0}.card{background:#0b1220;border:1px solid #1f2937;border-radius:12px;padding:32px;max-width:520px;box-shadow:0 10px 30px rgba(0,0,0,0.4)}h1{margin:0 0 8px;font-size:24px}p{margin:0 0 6px;color:#94a3b8}.hint{margin-top:12px;font-size:14px;color:#9ca3af}</style></head><body><div class="card"><h1>DarkAuth is not installed</h1><p>The authentication service is not ready yet.</p><p>Setup must be completed on the admin port.</p><p class="hint">Get the one-time install link from the server console where DarkAuth is running.</p></div></body></html>`
        );
        return;
      }

      if (
        pathname.startsWith("/api/") ||
        pathname === "/authorize" ||
        pathname === "/token" ||
        pathname.startsWith("/.well-known")
      ) {
        setSecurityHeaders(response, context.config.isDevelopment);
        if (pathname.startsWith("/api/")) {
          let apiPath = pathname.slice(4);
          apiPath = apiPath.replace(/^\/user(\/|$)/, "/");
          request.url = apiPath + url.search;
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
        await serveStaticFiles(request, response, join(__dirname, "../../../user-ui/dist"));
      }
    } catch (error) {
      sendError(response, error as Error);
    }
  });
}

export async function createAdminServer(context: Context) {
  const adminRouter = createAdminRouter(context);
  const installRouter = createInstallRouter(context);

  return createHttpServer(async (request: IncomingMessage, response: ServerResponse) => {
    try {
      const url = new URL(request.url || "", `http://${request.headers.host}`);
      const pathname = url.pathname;

      if (request.method === "GET" && pathname === "/config.js") {
        const ui =
          ((await getSetting(context, "ui_admin")) as
            | { clientId?: string; redirectUri?: string }
            | undefined) || {};
        const issuer = ((await getSetting(context, "issuer")) as string) || "http://localhost:9080";
        const adminOrigin = `http://localhost:${context.config.adminPort}`;
        const branding = await getBrandingConfig(context);
        const payload = {
          issuer,
          clientId: ui.clientId || "admin-web",
          redirectUri: ui.redirectUri || `${adminOrigin}/`,
          branding: {
            identity: branding.identity,
            colors: branding.colors,
            colorsDark: branding.colorsDark || undefined,
            wording: branding.wording,
            font: branding.font,
            customCSS: sanitizeCSS(branding.customCSS || ""),
            logoUrl: branding.logo?.data ? "/api/branding/logo" : null,
            logoUrlDark: branding.logoDark?.data ? "/api/branding/logo?dark=1" : null,
            faviconUrl: branding.favicon?.data ? "/api/branding/favicon" : null,
            faviconUrlDark: branding.faviconDark?.data ? "/api/branding/favicon?dark=1" : null,
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
        await serveStaticFiles(request, response, join(__dirname, "../../../admin-ui/dist"));
      }
    } catch (error) {
      sendError(response, error as Error);
    }
  });
}

async function serveStaticFiles(
  request: IncomingMessage,
  response: ServerResponse,
  basePath: string
) {
  const url = new URL(request.url || "", `http://${request.headers.host}`);
  let filePath = url.pathname;

  if (filePath === "/") {
    filePath = "/index.html";
  }

  const fullPath = join(basePath, filePath);

  if (!fullPath.startsWith(basePath)) {
    response.statusCode = 403;
    response.end("Forbidden");
    return;
  }

  try {
    const stream = createReadStream(fullPath);

    stream.on("error", () => {
      const indexPath = join(basePath, "index.html");
      const indexStream = createReadStream(indexPath);

      indexStream.on("error", () => {
        response.statusCode = 404;
        response.end("Not Found");
      });
      response.setHeader("Content-Type", "text/html");
      indexStream.pipe(response);
    });

    const ext = fullPath.split(".").pop();
    const contentType = getContentType(ext || "");
    response.setHeader("Content-Type", contentType);

    stream.pipe(response);
  } catch (_error) {
    response.statusCode = 500;
    response.end("Internal Server Error");
  }
}

function getContentType(ext: string): string {
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

  return types[ext] || "application/octet-stream";
}
