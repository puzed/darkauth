import type { IncomingMessage, ServerResponse } from "node:http";
import { getInstall } from "../../controllers/install/getInstall.ts";
import { postInstallOpaqueRegisterFinish } from "../../controllers/install/opaqueRegisterFinish.ts";
import { postInstallOpaqueRegisterStart } from "../../controllers/install/opaqueRegisterStart.ts";
import { postInstallComplete } from "../../controllers/install/postInstallComplete.ts";
import { NotFoundError } from "../../errors.ts";
import type { Context } from "../../types.ts";
import { sendError } from "../../utils/http.ts";

export function createInstallRouter(context: Context) {
  return async function router(request: IncomingMessage, response: ServerResponse) {
    const method = request.method || "GET";
    const url = new URL(request.url || "", `http://${request.headers.host}`);
    const pathname = url.pathname;

    context.logger.debug(`[install-router] ${method} ${pathname}${url.search || ""}`);

    try {
      if (method === "GET" && (pathname === "/install" || pathname === "/api/install")) {
        context.logger.debug("[install-router] -> getInstall controller");
        return await getInstall(context, request, response);
      }

      if (
        method === "POST" &&
        (pathname === "/install/complete" || pathname === "/api/install/complete")
      ) {
        context.logger.debug("[install-router] -> postInstallComplete controller");
        return await postInstallComplete(context, request, response);
      }

      if (
        method === "POST" &&
        (pathname === "/install/opaque/start" || pathname === "/api/install/opaque/start")
      ) {
        context.logger.debug("[install-router] -> postInstallOpaqueRegisterStart controller");
        return await postInstallOpaqueRegisterStart(context, request, response);
      }

      if (
        method === "POST" &&
        (pathname === "/install/opaque/finish" || pathname === "/api/install/opaque/finish")
      ) {
        context.logger.debug("[install-router] -> postInstallOpaqueRegisterFinish controller");
        return await postInstallOpaqueRegisterFinish(context, request, response);
      }

      throw new NotFoundError("Endpoint not found");
    } catch (error) {
      context.logger.error(
        { err: error, method, pathname, url: request.url },
        "install router request failed"
      );
      sendError(response, error as Error);
    }
  };
}
