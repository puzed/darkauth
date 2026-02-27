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
import {
  deleteOrganizationMemberRole,
  getOrganization,
  getOrganizationMembers,
  getOrganizations,
  postOrganizationInvites,
  postOrganizationMemberRoles,
  postOrganizations,
} from "../../controllers/user/organizations.js";
import { postOtpReauth } from "../../controllers/user/otpReauth.js";
import { postOtpSetupInit } from "../../controllers/user/otpSetupInit.js";
import { postOtpSetupVerify } from "../../controllers/user/otpSetupVerify.js";
import { getOtpStatus } from "../../controllers/user/otpStatus.js";
import { postOtpVerify } from "../../controllers/user/otpVerify.js";
import { postUserPasswordChangeFinish } from "../../controllers/user/passwordChangeFinish.js";
import { postUserPasswordChangeStart } from "../../controllers/user/passwordChangeStart.js";
import { postUserPasswordVerifyFinish } from "../../controllers/user/passwordChangeVerifyFinish.js";
import { postUserPasswordVerifyStart } from "../../controllers/user/passwordChangeVerifyStart.js";
import { postUserPasswordRecoveryVerifyFinish } from "../../controllers/user/passwordRecoveryVerifyFinish.js";
import { postUserPasswordRecoveryVerifyStart } from "../../controllers/user/passwordRecoveryVerifyStart.js";
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
          const [colors, colorsDark] = await Promise.all([
            getSetting(context, "branding.colors"),
            getSetting(context, "branding.colors_dark"),
          ]);
          const c = (colors as Record<string, string>) || {};
          const cd = (colorsDark as Record<string, string>) || {};
          const color = useDark ? cd.primary || c.primary || "#aec1e0" : c.primary || "#6600cc";
          const svg = getDefaultLogoSvg(color);
          response.statusCode = 200;
          response.setHeader("Content-Type", "image/svg+xml");
          response.setHeader("Cache-Control", "public, max-age=86400");
          response.end(svg);
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
          "--primary-500": String(c.primary || "#6600cc"),
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
          "--primary-500": String(cd.primary || c.primary || "#aec1e0"),
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
        response.setHeader("Cache-Control", "no-store");
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

      if (method === "POST" && pathname === "/password/recovery/verify/start") {
        return await postUserPasswordRecoveryVerifyStart(context, request, response);
      }

      if (method === "POST" && pathname === "/password/recovery/verify/finish") {
        return await postUserPasswordRecoveryVerifyFinish(context, request, response);
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

      if (method === "GET" && pathname === "/organizations") {
        return await getOrganizations(context, request, response);
      }

      if (method === "POST" && pathname === "/organizations") {
        return await postOrganizations(context, request, response);
      }

      const orgMatch = pathname.match(/^\/organizations\/([^/]+)$/);
      if (method === "GET" && orgMatch) {
        return await getOrganization(context, request, response, orgMatch[1] as string);
      }

      const orgMembersMatch = pathname.match(/^\/organizations\/([^/]+)\/members$/);
      if (method === "GET" && orgMembersMatch) {
        return await getOrganizationMembers(
          context,
          request,
          response,
          orgMembersMatch[1] as string
        );
      }

      const orgInvitesMatch = pathname.match(/^\/organizations\/([^/]+)\/invites$/);
      if (method === "POST" && orgInvitesMatch) {
        return await postOrganizationInvites(
          context,
          request,
          response,
          orgInvitesMatch[1] as string
        );
      }

      const orgMemberRolesMatch = pathname.match(
        /^\/organizations\/([^/]+)\/members\/([^/]+)\/roles$/
      );
      if (method === "POST" && orgMemberRolesMatch) {
        return await postOrganizationMemberRoles(
          context,
          request,
          response,
          orgMemberRolesMatch[1] as string,
          orgMemberRolesMatch[2] as string
        );
      }

      const orgMemberRoleDeleteMatch = pathname.match(
        /^\/organizations\/([^/]+)\/members\/([^/]+)\/roles\/([^/]+)$/
      );
      if (method === "DELETE" && orgMemberRoleDeleteMatch) {
        return await deleteOrganizationMemberRole(
          context,
          request,
          response,
          orgMemberRoleDeleteMatch[1] as string,
          orgMemberRoleDeleteMatch[2] as string,
          orgMemberRoleDeleteMatch[3] as string
        );
      }

      if (method === "GET" && pathname === "/users") {
        return await searchUserDirectory(context, request, response);
      }

      const userMatch = pathname.match(/^\/users\/([^/]+)$/);
      if (method === "GET" && userMatch) {
        const sid = userMatch[1] as string;
        return await getUserDirectoryEntry(context, request, response, sid);
      }

      throw new NotFoundError("Endpoint not found");
    } catch (error) {
      sendError(response, error as Error);
    }
  };
}

function getDefaultLogoSvg(color: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">
<svg width="100%" height="100%" viewBox="0 0 874 874" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xml:space="preserve" xmlns:serif="http://www.serif.com/" style="fill-rule:evenodd;clip-rule:evenodd;stroke-linejoin:round;stroke-miterlimit:2;">
  <g id="_-f2aa4eff" serif:id="#f2aa4eff" transform="matrix(1,0,0,1,91,0)">
    <path d="M271.82,117.74C319.37,98.76 374.07,98.81 421.82,117.11C457.72,131.19 489.81,155.16 513.12,185.9C535.81,215.21 549.33,251.2 552.63,288.04C553.81,310.01 552.3,332.03 553.09,354.02C552.82,357.63 557.88,357.45 560,358.12C581.67,362.57 602.58,374.3 614.92,393.05C626.53,408.44 630.61,428.07 630.99,446.98C631.25,472.55 630.95,498.13 630.51,523.71C621.99,517.55 616.01,508.7 608.7,501.3C606.1,498.29 602.69,495.55 601.61,491.56C599.69,471.66 602.38,451.59 600.18,431.71C597.1,414.47 585.32,398.75 569.19,391.68C559.07,387.34 547.83,387.09 537.01,386.98C410.34,387 283.66,387.04 156.99,386.96C146.46,387.32 135.22,386.51 125.5,391.36C111.82,397.13 100.96,409.06 96.11,423.03C90.21,442.77 94.17,463.8 93.07,484.05C94.48,491.01 89.22,496.27 85.03,501.02C77.73,508.15 70.9,515.76 63.38,522.67C62.64,497.45 63.12,472.22 62.93,446.99C62.15,426.67 68.08,405.88 80.83,389.86C95.13,370.94 117.76,360.23 140.76,356.53C140.14,332.69 139.4,308.81 141.31,285C149.31,210.73 202.72,144.76 271.82,117.74M247.01,164.03C226.02,177.98 208.69,196.93 195.17,218.11C176.56,247.71 167.88,283.11 169.38,317.96C170.04,330.62 170.06,343.31 170.05,355.99C187.04,356.02 204.02,356.02 221.01,355.99C221.06,339.33 220.6,322.67 221.36,306.03C223.06,275.06 235.92,244.85 257.48,222.49C274.26,206.14 295.08,193.49 318.03,188.16C332.71,184.5 348.02,184.99 362.96,186.37C388.84,188.39 413.13,200.53 432.25,217.75C451.66,235.46 464.79,259.59 470.82,285.05C475.19,308.3 473.4,332.17 473.46,355.71C490.63,356.17 507.81,356.03 524.99,355.99C524.87,338.32 525.31,320.64 524.96,302.98C523.85,266.77 510.73,231.16 488.3,202.72C454.33,157.93 398.34,130.7 342.06,132.52C308.31,134.13 274.61,144.22 247.01,164.03M298.83,227.83C280.28,238.63 265.77,255.9 257.87,275.81C247.34,301.17 251.96,329.34 251.01,355.99C315.24,355.81 379.48,356.41 443.71,355.69C444.07,337.15 445.9,318.47 442.91,300.03C439.96,275.06 426.71,251.59 406.95,236.06C390.24,221.57 367.94,214.57 346.03,214.55C329.75,215.98 312.76,218.65 298.83,227.83Z" style="fill:${color};fill-rule:nonzero;"/>
    <path d="M285.55,415.47C290.99,413.09 297.7,410.58 303.46,413.39C310.84,416.36 314.57,424.42 316.3,431.7C318.07,437.5 316.32,444.62 310.88,447.83C280,470.73 251.16,496.19 221.14,520.17C214.72,526.03 206.08,530.91 204.09,540.15C208.42,542.47 213.93,543.66 217.92,539.94C249.05,514.41 280,488.63 311.31,463.32C316.33,459.63 323.03,459.62 328.98,460.03C339.71,463.68 347.97,475.21 344.62,486.8C342.29,494.74 336.12,500.75 329.99,505.99C316.17,517.16 302.14,528.07 288.63,539.62C271.79,553.25 254.32,566.17 238.56,581.07C240.16,583.66 241.8,586.23 243.43,588.8C255.26,585.7 263.67,576.26 273.02,569.02C287.41,557.47 300.91,544.86 315.3,533.31C320.37,528.82 327.29,527.13 333.99,527.96C341.44,529.86 345.97,537.82 344.14,545.19C341.25,557.17 331.05,565.37 322.74,573.73C304.17,589.85 285.33,605.66 266.64,621.64C249.65,636.58 232.5,652.21 211.53,661.37C196.48,667.38 178.746,665.629 164.57,673.38C148.287,682.283 119.1,705.3 113.83,714.79C110.69,721.54 109.83,729.96 113.34,736.73C119.88,750.82 133.23,759.9 146.98,766.05C159.56,771.5 173.24,774.4 186.98,774.02C291.99,774.03 397,773.9 502.01,774.08C524.26,774.84 546.87,768.13 564.58,754.53C570.66,749.93 575.86,744.01 579.23,737.15C583.49,726.9 580.09,714.41 572.97,707.03C562.565,696.245 535.06,676.55 516.8,672.44C491.15,667.69 467.41,655.22 447.59,638.43C419.75,614.98 390.82,592.7 364.72,567.28C357.04,559.19 347.12,549.77 349.47,537.48C353.65,526.51 368.72,524.77 376.9,532.15C390.7,542.52 403.37,554.35 416.65,565.38C426.3,573.11 435.16,582 446.23,587.79C450.7,588.71 452.97,584.64 455.65,582.09C446.01,571.05 433.74,562.85 422.71,553.32C408.62,541.71 394.47,530.17 380.31,518.66C369.28,509.6 355.59,502.02 349.88,488.19C343.94,473.9 358.01,457.14 373.01,459.9C378.31,459.79 382.52,463.55 386.53,466.48C415.48,489.43 443.39,513.65 471.85,537.19C475.25,539.79 479.4,544.19 484.17,542.31C487.52,541.48 488.64,536.89 486.81,534.21C483.9,529.54 479.33,526.29 475.24,522.75C444.24,497.34 413.95,471.02 381.56,447.37C373.3,440.85 375.57,428.56 381.2,421.13C384.54,414.99 391.73,411.57 398.62,412.56C405.35,413.79 411.32,417.36 416.99,421.01C432.94,432.15 447.06,445.58 462.06,457.92C478.32,471.32 494.34,484.99 510.43,498.59C516.83,504.08 523.07,510.23 531.21,513.09C532.43,510.14 534.75,507.49 535.01,504.22C529.58,496.95 522.41,491.27 515.62,485.35C501.7,472.57 487.46,460.13 473.01,447.96C467.47,443.38 461.5,435.99 464.13,428.3C465.23,423.17 468.95,418.2 474.43,417.46C485.98,414.97 495.42,423.71 503.92,430.1C533.78,453.99 562.68,479.2 589.14,506.85C608.63,528.37 627.18,551.67 638.07,578.84C645.92,598.24 650.84,619.01 651.02,640C650.68,687.89 628.25,734.85 591.97,765.96C567.93,785.59 537.61,799.51 506.01,798.08C399.34,797.95 292.67,797.95 186,798.07C158.06,799.49 130.96,788.24 108.37,772.55C60.26,737.09 33.25,674.23 42.92,614.95C49.05,579.38 68.58,547.74 91.59,520.56C121,486.9 155.24,457.94 189.96,429.95C198.44,423.67 207.93,414.99 219.42,417.45C230.7,420.19 232.55,437.06 224.11,444.11C203.98,461.63 183.81,479.14 163.91,496.94C161.31,500.17 156.49,503 156.96,507.77C158.26,508.85 160.86,511.02 162.16,512.11C166.23,512.03 169.17,508.55 172.39,506.44C196.72,485.71 221.37,465.33 246.25,445.26C258.94,434.82 271.12,423.53 285.55,415.47Z" style="fill:${color};fill-rule:nonzero;"/>
    <path d="M309.14,638.07C320.1,617.56 349.23,609.73 368.94,622.13C386.77,630.88 394.28,654.06 387.24,672.16C382.94,681.97 374.4,689.2 365.07,694.1C365.03,704.35 365.51,714.63 364.65,724.87C361.3,740.09 337.58,743.01 330.39,729.51C325.43,718.77 329.9,706.18 327.86,694.95C319.72,688.15 309.9,682.14 306.35,671.49C303.25,660.65 302.52,647.79 309.14,638.07Z" style="fill:${color};fill-rule:nonzero;"/>
  </g>
</svg>`;
}
