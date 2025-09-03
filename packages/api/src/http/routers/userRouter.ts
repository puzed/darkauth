import type { IncomingMessage, ServerResponse } from "node:http";
import { getAuthorize } from "../../controllers/user/authorize.js";
import { postAuthorizeFinalize } from "../../controllers/user/authorizeFinalize.js";
import { getEncPublicJwk } from "../../controllers/user/encPublicGet.js";
import { putEncPublicJwk } from "../../controllers/user/encPublicPut.js";
import { postLogout } from "../../controllers/user/logout.js";
import { postOpaqueLoginFinish } from "../../controllers/user/opaqueLoginFinish.js";
import { postOpaqueLoginStart } from "../../controllers/user/opaqueLoginStart.js";
import { postOpaqueRegisterFinish } from "../../controllers/user/opaqueRegisterFinish.js";
import { postOpaqueRegisterStart } from "../../controllers/user/opaqueRegisterStart.js";
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
import type { Context } from "../../types.js";
import { sendError } from "../../utils/http.js";

export function createUserRouter(context: Context) {
  return async function router(request: IncomingMessage, response: ServerResponse) {
    const method = request.method || "GET";
    const url = new URL(request.url || "", `http://${request.headers.host}`);
    const pathname = url.pathname;

    try {
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
