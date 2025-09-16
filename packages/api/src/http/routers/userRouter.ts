import type { IncomingMessage, ServerResponse } from "node:http";
import { getAuthorize } from "../../controllers/user/authorize.js";
import { postAuthorizeFinalize } from "../../controllers/user/authorizeFinalize.js";
import { getEncPublicJwk } from "../../controllers/user/encPublicGet.js";
import { putEncPublicJwk } from "../../controllers/user/encPublicPut.js";
import { getUserApps } from "../../controllers/user/getUserApps.js";
import { postLogout } from "../../controllers/user/logout.js";
import { postOpaqueLoginFinish } from "../../controllers/user/opaqueLoginFinish.js";
import { postOpaqueLoginStart } from "../../controllers/user/opaqueLoginStart.js";
import { postOpaqueRegisterFinish } from "../../controllers/user/opaqueRegisterFinish.js";
import { postOpaqueRegisterStart } from "../../controllers/user/opaqueRegisterStart.js";
import { postOtpReauth } from "../../controllers/user/otpReauth.js";
import { postOtpSetupInit } from "../../controllers/user/otpSetupInit.js";
import { postOtpSetupVerify } from "../../controllers/user/otpSetupVerify.js";
import { getOtpStatus } from "../../controllers/user/otpStatus.js";
import { postOtpVerify } from "../../controllers/user/otpVerify.js";
import { postUserPasswordChangeFinish } from "../../controllers/user/passwordChangeFinish.js";
import { postUserPasswordChangeStart } from "../../controllers/user/passwordChangeStart.js";
import { postUserPasswordVerifyFinish } from "../../controllers/user/passwordChangeVerifyFinish.js";
import { postUserPasswordVerifyStart } from "../../controllers/user/passwordChangeVerifyStart.js";
import { postUserRefreshToken } from "../../controllers/user/refreshToken.js";
import { getSession } from "../../controllers/user/session.js";
import { postToken } from "../../controllers/user/token.js";
import {
  getUserDirectoryEntry,
  searchUserDirectory,
} from "../../controllers/user/usersDirectory.js";
import { getWellKnownJwks } from "../../controllers/user/wellKnownJwks.js";
import { getWellKnownOpenidConfiguration } from "../../controllers/user/wellKnownOpenid.js";
import { getWrappedDrk } from "../../controllers/user/wrappedDrk.js";
import { putWrappedDrk } from "../../controllers/user/wrappedDrkPut.js";
import { getWrappedEncPrivateJwk } from "../../controllers/user/wrappedEncPrivGet.js";
import { putWrappedEncPrivateJwk } from "../../controllers/user/wrappedEncPrivPut.js";
import { NotFoundError } from "../../errors.js";
import { sanitizeCSS } from "../../services/branding.js";
import { getSetting } from "../../services/settings.js";
import type { Context } from "../../types.js";
import { assertSameOrigin } from "../../utils/csrf.js";
import { sendError } from "../../utils/http.js";

export function createUserRouter(context: Context) {
  return async function router(request: IncomingMessage, response: ServerResponse) {
    const method = request.method || "GET";
    const url = new URL(request.url || "", `http://${request.headers.host}`);
    const pathname = url.pathname;

    try {
      const needsCsrf = !["GET", "HEAD", "OPTIONS"].includes(method) && pathname !== "/token";
      if (needsCsrf) assertSameOrigin(request);
      if (method === "GET" && pathname === "/branding/logo") {
        const url = new URL(request.url || "", `http://${request.headers.host}`);
        const useDark = url.searchParams.get("dark") === "1";
        const key = useDark ? "branding.logo_dark" : "branding.logo";
        const logo = (await getSetting(context, key)) as
          | { data?: string | null; mimeType?: string | null }
          | undefined;
        if (!logo?.data || !logo.mimeType) {
          response.statusCode = 404;
          response.end();
          return;
        }
        const buf = Buffer.from(logo.data, "base64");
        response.statusCode = 200;
        response.setHeader("Content-Type", logo.mimeType);
        response.setHeader("Cache-Control", "public, max-age=86400");
        response.end(buf);
        return;
      }

      if (method === "GET" && pathname === "/branding/favicon") {
        const url = new URL(request.url || "", `http://${request.headers.host}`);
        const useDark = url.searchParams.get("dark") === "1";
        const key = useDark ? "branding.favicon_dark" : "branding.favicon";
        const fav = (await getSetting(context, key)) as
          | { data?: string | null; mimeType?: string | null }
          | undefined;
        if (!fav?.data || !fav.mimeType) {
          response.statusCode = 302;
          response.setHeader("Location", "/favicon.svg");
          response.end();
          return;
        }
        const buf = Buffer.from(fav.data, "base64");
        response.statusCode = 200;
        response.setHeader("Content-Type", fav.mimeType);
        response.setHeader("Cache-Control", "public, max-age=86400");
        response.end(buf);
        return;
      }

      if (method === "GET" && pathname === "/branding/custom.css") {
        const [colors, colorsDark, font, custom] = await Promise.all([
          getSetting(context, "branding.colors"),
          getSetting(context, "branding.colors_dark"),
          getSetting(context, "branding.font"),
          getSetting(context, "branding.custom_css"),
        ]);
        const c = (colors as Record<string, string>) || {};
        const cd = (colorsDark as Record<string, string>) || {};
        const f =
          (font as { family?: string; size?: string; weight?: Record<string, string> }) || {};
        const cssVarsLight: Record<string, string> = {
          "--da-bg-gradient-start": String(c.backgroundGradientStart || "#f3f4f6"),
          "--da-bg-gradient-end": String(c.backgroundGradientEnd || "#eff6ff"),
          "--da-bg-angle": String(c.backgroundAngle || "135deg"),
          "--da-primary": String(c.primary || "#6600cc"),
          "--da-primary-hover": String(c.primaryHover || "#2563eb"),
          "--da-primary-light": String(c.primaryLight || "#dbeafe"),
          "--primary-50": String(c.primaryLight || "#eef2ff"),
          "--da-primary-dark": String(c.primaryDark || "#1d4ed8"),
          "--da-secondary": String(c.secondary || "#6b7280"),
          "--da-secondary-hover": String(c.secondaryHover || "#4b5563"),
          "--da-success": String(c.success || "#10b981"),
          "--da-error": String(c.error || "#ef4444"),
          "--da-warning": String(c.warning || "#f59e0b"),
          "--da-info": String(c.info || "#6600cc"),
          "--da-text": String(c.text || "#111827"),
          "--da-text-secondary": String(c.textSecondary || "#6b7280"),
          "--da-text-muted": String(c.textMuted || "#9ca3af"),
          "--da-border": String(c.border || "#e5e7eb"),
          "--da-card-bg": String(c.cardBackground || "#ffffff"),
          "--da-card-shadow": String(c.cardShadow || "rgba(0,0,0,0.1)"),
          "--da-input-bg": String(c.inputBackground || "#ffffff"),
          "--da-input-border": String(c.inputBorder || "#d1d5db"),
          "--da-input-focus": String(c.inputFocus || "#6600cc"),
          "--da-font-family": String(f.family || "system-ui, -apple-system, sans-serif"),
          "--da-font-size": String(f.size || "16px"),
          "--da-font-weight-normal": String(f.weight?.normal || "400"),
          "--da-font-weight-medium": String(f.weight?.medium || "500"),
          "--da-font-weight-bold": String(f.weight?.bold || "700"),
          "--primary-600": String(c.primary || "#6600cc"),
          "--primary-700": String(c.primaryHover || "#2563eb"),
          "--primary-100": String(c.primaryLight || "#dbeafe"),
          "--gray-900": String(c.text || "#111827"),
          "--gray-700": String(c.textSecondary || "#374151"),
          "--gray-600": String(c.textSecondary || "#6b7280"),
          "--gray-300": String(c.border || "#d1d5db"),
          "--gray-50": String(c.backgroundGradientStart || "#f9fafb"),
        };
        const cssVarsDark: Record<string, string> = {
          "--da-bg-gradient-start": String(
            cd.backgroundGradientStart || c.backgroundGradientStart || "#0b1220"
          ),
          "--da-bg-gradient-end": String(
            cd.backgroundGradientEnd || c.backgroundGradientEnd || "#111827"
          ),
          "--da-bg-angle": String(cd.backgroundAngle || c.backgroundAngle || "135deg"),
          "--da-primary": String(cd.primary || c.primary || "#aec1e0"),
          "--da-primary-hover": String(cd.primaryHover || c.primaryHover || "#2563eb"),
          "--da-primary-light": String(cd.primaryLight || c.primaryLight || "#1f2937"),
          "--primary-50": String(cd.primaryLight || c.primaryLight || "#111827"),
          "--da-text": String(cd.text || c.text || "#e5e7eb"),
          "--da-text-secondary": String(cd.textSecondary || c.textSecondary || "#9ca3af"),
          "--da-text-muted": String(cd.textMuted || c.textMuted || "#6b7280"),
          "--da-border": String(cd.border || c.border || "#374151"),
          "--da-card-bg": String(cd.cardBackground || c.cardBackground || "#0b1220"),
          "--da-card-shadow": String(cd.cardShadow || c.cardShadow || "rgba(0,0,0,0.6)"),
          "--da-input-bg": String(cd.inputBackground || c.inputBackground || "#0f172a"),
          "--da-input-border": String(cd.inputBorder || c.inputBorder || "#334155"),
          "--da-input-focus": String(cd.inputFocus || c.inputFocus || "#aec1e0"),
          "--da-font-family": String(f.family || "system-ui, -apple-system, sans-serif"),
          "--da-font-size": String(f.size || "16px"),
          "--da-font-weight-normal": String(f.weight?.normal || "400"),
          "--da-font-weight-medium": String(f.weight?.medium || "500"),
          "--da-font-weight-bold": String(f.weight?.bold || "700"),
          "--primary-600": String(cd.primary || c.primary || "#aec1e0"),
          "--primary-700": String(cd.primaryHover || c.primaryHover || "#2563eb"),
          "--primary-100": String(cd.primaryLight || c.primaryLight || "#1f2937"),
          "--gray-900": String(cd.text || c.text || "#e5e7eb"),
          "--gray-700": String(cd.textSecondary || c.textSecondary || "#9ca3af"),
          "--gray-600": String(cd.textSecondary || c.textSecondary || "#9ca3af"),
          "--gray-300": String(cd.border || c.border || "#374151"),
          "--gray-50": String(cd.backgroundGradientStart || c.backgroundGradientStart || "#0b1220"),
        };
        const varBlock = `:root{${Object.entries(cssVarsLight)
          .map(([k, v]) => `${k}:${v}`)
          .join(";")}}\n:root[data-da-theme='light']{${Object.entries(cssVarsLight)
          .map(([k, v]) => `${k}:${v}`)
          .join(";")}}\n:root[data-da-theme='dark']{${Object.entries(cssVarsDark)
          .map(([k, v]) => `${k}:${v}`)
          .join(
            ";"
          )}}\n@media (prefers-color-scheme: dark){:root:not([data-da-theme]){${Object.entries(
          cssVarsDark
        )
          .map(([k, v]) => `${k}:${v}`)
          .join(";")}}\n`;
        const bodyBlock =
          "body{background:linear-gradient(var(--da-bg-angle), var(--da-bg-gradient-start) 0%, var(--da-bg-gradient-end) 100%) !important;color:var(--da-text) !important;font-family:var(--da-font-family) !important;font-size:var(--da-font-size) !important;} .container{background:var(--da-card-bg) !important; box-shadow: 0 20px 40px var(--da-card-shadow) !important;} .da-form-input, .form-group input{background:var(--da-input-bg) !important; border-color:var(--da-input-border) !important; color:var(--da-text) !important;} .da-button-primary, .primary-button{background-color:var(--da-primary) !important;} .da-button-primary:hover, .primary-button:hover{background-color:var(--da-primary-hover) !important;}\n";
        const sanitized = sanitizeCSS((custom as string) || "");
        const out = varBlock + bodyBlock + sanitized;
        response.statusCode = 200;
        response.setHeader("Content-Type", "text/css; charset=utf-8");
        response.setHeader("Cache-Control", "public, max-age=300");
        response.end(out);
        return;
      }

      if (method === "GET" && pathname === "/.well-known/openid-configuration") {
        return await getWellKnownOpenidConfiguration(context, request, response);
      }

      if (method === "GET" && pathname === "/.well-known/jwks.json") {
        return await getWellKnownJwks(context, request, response);
      }

      if (method === "GET" && pathname === "/authorize") {
        return await getAuthorize(context, request, response);
      }

      if (method === "POST" && pathname === "/authorize/finalize") {
        return await postAuthorizeFinalize(context, request, response);
      }

      if (method === "POST" && pathname === "/token") {
        return await postToken(context, request, response);
      }

      if (method === "POST" && pathname === "/opaque/register/start") {
        return await postOpaqueRegisterStart(context, request, response);
      }

      if (method === "POST" && pathname === "/opaque/register/finish") {
        return await postOpaqueRegisterFinish(context, request, response);
      }

      if (method === "POST" && pathname === "/password/change/start") {
        return await postUserPasswordChangeStart(context, request, response);
      }

      if (method === "POST" && pathname === "/password/change/finish") {
        return await postUserPasswordChangeFinish(context, request, response);
      }

      if (method === "POST" && pathname === "/password/change/verify/start") {
        return await postUserPasswordVerifyStart(context, request, response);
      }

      if (method === "POST" && pathname === "/password/change/verify/finish") {
        return await postUserPasswordVerifyFinish(context, request, response);
      }

      if (method === "POST" && pathname === "/opaque/login/start") {
        return await postOpaqueLoginStart(context, request, response);
      }

      if (method === "POST" && pathname === "/opaque/login/finish") {
        return await postOpaqueLoginFinish(context, request, response);
      }

      if (method === "GET" && pathname === "/crypto/wrapped-drk") {
        return await getWrappedDrk(context, request, response);
      }

      if (method === "PUT" && pathname === "/crypto/wrapped-drk") {
        return await putWrappedDrk(context, request, response);
      }

      if (method === "GET" && pathname === "/crypto/user-enc-pub") {
        return await getEncPublicJwk(context, request, response);
      }

      if (method === "PUT" && pathname === "/crypto/enc-pub") {
        return await putEncPublicJwk(context, request, response);
      }

      if (method === "GET" && pathname === "/crypto/wrapped-enc-priv") {
        return await getWrappedEncPrivateJwk(context, request, response);
      }

      if (method === "PUT" && pathname === "/crypto/wrapped-enc-priv") {
        return await putWrappedEncPrivateJwk(context, request, response);
      }

      if (method === "GET" && pathname === "/session") {
        return await getSession(context, request, response);
      }

      if (method === "GET" && pathname === "/otp/status") {
        return await getOtpStatus(context, request, response);
      }

      if (method === "POST" && pathname === "/otp/verify") {
        return await postOtpVerify(context, request, response);
      }
      if (method === "POST" && pathname === "/otp/reauth") {
        return await postOtpReauth(context, request, response);
      }

      if (method === "POST" && pathname === "/otp/setup/init") {
        return await postOtpSetupInit(context, request, response);
      }

      if (method === "POST" && pathname === "/otp/setup/verify") {
        return await postOtpSetupVerify(context, request, response);
      }

      if (method === "GET" && pathname === "/apps") {
        return await getUserApps(context, request, response);
      }

      if (method === "POST" && pathname === "/logout") {
        return await postLogout(context, request, response);
      }

      if (method === "POST" && pathname === "/refresh-token") {
        return await postUserRefreshToken(context, request, response);
      }

      if (method === "GET" && pathname === "/users/search") {
        return await searchUserDirectory(context, request, response);
      }

      const userMatch = pathname.match(/^\/users\/([^/]+)$/);
      if (method === "GET" && userMatch) {
        return await getUserDirectoryEntry(context, request, response, userMatch[1] as string);
      }

      throw new NotFoundError("Endpoint not found");
    } catch (error) {
      sendError(response, error as Error);
    }
  };
}
